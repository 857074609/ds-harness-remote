import { randomFillSync, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile, chmod, rename, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod'

const credentialRecordSchema = z.object({
  account: z.string().min(1).max(254),
  // scrypt$<saltB64>$<hashB64>
  secret: z.string().min(1),
}).strict()

const credentialStoreSchema = z.object({
  schemaVersion: z.literal(1),
  accounts: z.array(credentialRecordSchema),
}).strict()

export interface LocalCredentialStoreOptions {
  directory?: string
  env?: NodeJS.ProcessEnv
  homeDirectory?: string
}

/**
 * Serverless replacement for the relay Server account system. Host-side
 * credential store: accounts are verified against a local scrypt hash; the
 * cleartext password is never persisted and is only used (a) to verify a
 * sign-in and (b) to derive the Noise XX PSK.
 */
export class LocalCredentialStore {
  private readonly directory: string
  private cache?: Map<string, string>

  constructor(options: LocalCredentialStoreOptions = {}) {
    const env = options.env ?? process.env
    const dshHome = env.DSH_HOME || join(options.homeDirectory ?? homedir(), '.dsh')
    this.directory = options.directory ?? join(dshHome, 'remote', 'direct')
  }

  private async load(): Promise<Map<string, string>> {
    if (this.cache !== undefined) return this.cache
    const path = join(this.directory, 'credentials.json')
    try {
      const raw = await readFile(path, 'utf8')
      const parsed = credentialStoreSchema.parse(JSON.parse(raw))
      this.cache = new Map(parsed.accounts.map(a => [a.account, a.secret]))
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // A corrupt store must not silently let anyone in.
        throw new CredentialStoreError('CORRUPT_STORE', 'The local credential store could not be parsed.')
      }
      this.cache = new Map()
    }
    return this.cache
  }

  private async save(accounts: Map<string, string>): Promise<void> {
    this.cache = accounts
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await chmod(this.directory, 0o700)
    const path = join(this.directory, 'credentials.json')
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
    const record = { schemaVersion: 1 as const, accounts: [...accounts].map(([account, secret]) => ({ account, secret })) }
    await writeFile(tmp, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await chmod(tmp, 0o600)
    await rename(tmp, path)
    await chmod(path, 0o600)
  }

  /** Verify an account/password pair. Returns the account on success, else undefined. */
  async verify(account: string, password: string): Promise<string | undefined> {
    const accounts = await this.load()
    const secret = accounts.get(account)
    if (secret === undefined) return undefined
    const [scheme, saltB64, hashB64] = secret.split('$')
    if (scheme !== 'scrypt' || saltB64 === undefined || hashB64 === undefined) return undefined
    const salt = Buffer.from(saltB64, 'base64url')
    const want = Buffer.from(hashB64, 'base64url')
    const got = scryptSync(password, salt, 64)
    if (want.length !== got.length || !timingSafeEqual(want, got)) {
      await this.load() // refresh cache so concurrent add() is observed
      const re = accounts.get(account)
      if (re === undefined) return undefined
      const [s2, saltB64b, hashB64b] = re.split('$')
      if (s2 !== 'scrypt') return undefined
      const saltb = Buffer.from(saltB64b, 'base64url')
      const wantb = Buffer.from(hashB64b, 'base64url')
      const gotb = scryptSync(password, saltb, 64)
      if (wantb.length !== gotb.length || !timingSafeEqual(wantb, gotb)) return undefined
    }
    return account
  }

  async add(account: string, password: string): Promise<void> {
    const accounts = await this.load()
    const salt = randomFillSync(new Uint8Array(16))
    const secret = `scrypt$${Buffer.from(salt).toString('base64url')}$${Buffer.from(scryptSync(password, salt, 64)).toString('base64url')}`
    accounts.set(account, secret)
    await this.save(accounts)
  }

  async remove(account: string): Promise<void> {
    const accounts = await this.load()
    if (accounts.delete(account)) await this.save(accounts)
  }

  async list(): Promise<string[]> {
    const accounts = await this.load()
    return [...accounts.keys()]
  }
}

export class CredentialStoreError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}
