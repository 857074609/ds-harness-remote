import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod, rm, symlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { IdentityStore, ServerCredentialStore, HostServerApi, serverStorageDirectory } from 'ds-harness-remote';

const runtime = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const shutdown = new AbortController();
let child;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  shutdown.abort();
  if (child?.pid) {
    try { process.kill(-child.pid, signal); } catch { /* Child already exited. */ }
  }
});

function log(message) { console.log(`[dsh-cloud] ${message}`); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function atomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
  await chmod(path, 0o600);
}

class ApiFailure extends Error {
  constructor(status, code) { super('Cloud authorization request failed'); this.status = status; this.code = code; }
}
async function request(server, path, bearer, body) {
  const response = await fetch(`${server}${path}`, {
    method: 'POST', redirect: 'error',
    signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(15000)]),
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const code = error?.error?.code;
    throw new ApiFailure(response.status, typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'REQUEST_FAILED');
  }
  return response.status === 204 ? undefined : response.json();
}

async function authorize(server, instanceId, version, name, home) {
  const identities = new IdentityStore({ directory: serverStorageDirectory(join(home, 'remote'), server, 'host') });
  const identity = await identities.loadOrCreate(name);
  const store = new ServerCredentialStore(identities.directory);
  const api = new HostServerApi(server, store);
  api.bindIdentity(identity);
  const endpoint = `/api/v1/cloud-instances/${encodeURIComponent(instanceId)}`;
  const acknowledged = join(identities.directory, 'cloud-bootstrap-complete.json');
  for (;;) {
    if (shutdown.signal.aborted) return;
    try {
      let credentials = await store.load(server, identity.deviceId);
      if (!credentials) {
        const tokenPath = process.env.DSH_CLOUD_BOOTSTRAP_TOKEN_FILE || '/run/dsh-bootstrap/token';
        const token = (await readFile(tokenPath, 'utf8')).trim();
        if (!token || /\s/.test(token)) throw new Error('Invalid bootstrap token file');
        const tokens = await request(server, `${endpoint}/bootstrap`, token, {
          v: 1, assignmentVersion: version,
          device: { deviceId: identity.deviceId, identityKey: identity.publicKey, name, role: 'host', platform: 'linux',
            clientVersion: runtime.dependencies['ds-harness-remote'], harnessVersion: runtime.dependencies['@deepseek-ai/dsh'] },
        });
        credentials = await store.save({ serverUrl: server, deviceId: identity.deviceId,
          authorizationMethod: 'account', account: tokens.account,
          accessToken: tokens.accessToken, accessTokenExpiresAt: tokens.accessTokenExpiresAt,
          refreshToken: tokens.refreshToken, refreshTokenExpiresAt: tokens.refreshTokenExpiresAt });
        log('Host credentials saved');
      }
      // Let the plugin refresh ordinary restarts. No bootstrap file or new
      // enrollment request is needed after a durable acknowledgement.
      if (await exists(acknowledged)) return;
      if (credentials.accessTokenExpiresAt <= Date.now() + 30000) credentials = await api.authenticate(identity);
      try {
        await request(server, `${endpoint}/bootstrap-complete`, credentials.accessToken);
      } catch (error) {
        if (!(error instanceof ApiFailure) || error.status !== 401) throw error;
        credentials = await api.refreshCredentials(credentials.accessToken);
        await request(server, `${endpoint}/bootstrap-complete`, credentials.accessToken);
      }
      await atomicJson(acknowledged, { instanceId, assignmentVersion: version });
      log('Host authorization acknowledged');
      return;
    } catch (error) {
      if (shutdown.signal.aborted) return;
      // Never include response bodies, URLs, tokens or credential errors.
      log(error instanceof ApiFailure ? `Authorization retry: HTTP ${error.status} ${error.code}` : 'Authorization retry: unavailable');
      await delay(5000, undefined, { signal: shutdown.signal }).catch(() => {});
    }
  }
}

async function main() {
  const logLevel = process.env.DSH_REMOTE_LOG_LEVEL || 'info';
  const port = process.env.DSH_PORT ?? '3080';
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    log('Startup failed: invalid DSH_REMOTE_LOG_LEVEL (expected debug/info/warn/error)');
    process.exitCode = 1;
    return;
  }
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
    log('Startup failed: invalid DSH_PORT (expected integer 1024-65535)');
    process.exitCode = 1;
    return;
  }
  const home = process.env.DSH_HOME || '/data/dsh';
  const workspace = process.env.DSH_WORKSPACE || '/data/workspace';
  const instanceId = process.env.DSH_CLOUD_INSTANCE_ID;
  const number = process.env.DSH_CLOUD_INSTANCE_NUMBER;
  const version = Number(process.env.DSH_CLOUD_ASSIGNMENT_VERSION);
  const assigned = process.env.DSH_CLOUD_ASSIGNED === 'true';
  const origin = new URL(process.env.DSH_REMOTE_SERVER_URL);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Remote Server must be an HTTPS origin');
  }
  const server = origin.origin;
  if (!/^[a-f0-9-]{36}$/.test(instanceId || '') || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(number || '')
      || !Number.isSafeInteger(version) || version < 0 || (assigned && version < 1)) {
    throw new Error('Invalid cloud instance configuration');
  }
  const name = `工作电脑 ${number}`;
  for (const directory of [home, workspace, process.env.HOME || '/data/home']) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  const statePath = join(home, 'cloud-state.json');
  const state = await exists(statePath) ? JSON.parse(await readFile(statePath, 'utf8')) : undefined;
  if (state && (state.instanceId !== instanceId || state.serverUrl !== server || state.assignmentVersion > version)) {
    throw new Error('Persistent volume does not belong to this instance configuration');
  }
  if (!state || state.assignmentVersion !== version) {
    // The controller terminates old Pods first. Only Remote credentials are
    // reset; model settings, DSH sessions and the workspace remain on the PVC.
    await rm(join(home, 'remote'), { recursive: true, force: true });
    await atomicJson(statePath, { instanceId, serverUrl: server, assignmentVersion: version });
  }
  const profile = join(home, 'profiles', 'cloud');
  await mkdir(profile, { recursive: true, mode: 0o700 });
  if (!await exists(join(profile, 'package.json'))) {
    await atomicJson(join(profile, 'package.json'), { name: 'dsh-cloud-profile', private: true,
      dependencies: { 'ds-harness-remote': runtime.dependencies['ds-harness-remote'] },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'ds-harness-remote'] } } });
  }
  if (!await exists(join(profile, 'cordis.patch.yml'))) await atomicJson(join(profile, 'cordis.patch.yml'), []);
  if (!await exists(join(profile, 'node_modules'))) await symlink('/opt/dsh/node_modules', join(profile, 'node_modules'));
  const overlay = '/tmp/dsh-cloud-runtime.json';
  await atomicJson(overlay, [
    { id: 'ds-harness-remote', disabled: false, config: { enabled: assigned, role: 'host', serverUrl: server,
      deviceName: name, forceRelay: false, logLevel, terminal: { enabled: true }, codex: { enabled: false },
      cursor: { enabled: false }, acp: { enabled: false } } },
    { id: 'ds-harness-remote-tui', disabled: true },
  ]);
  if (assigned) await authorize(server, instanceId, version, name, home);
  else log('Unassigned Host waiting for Admin allocation');
  if (shutdown.signal.aborted) return;
  child = spawn('/opt/dsh/node_modules/.bin/dsh', ['--profile', 'cloud', '--patch', overlay,
    '--no-open', '--host', '127.0.0.1', '--port', port], {
    cwd: workspace, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    createInterface({ input: stream }).on('line', line => output.write(
      line.replace(/([?&]token=)[^\s&]+/g, '$1[redacted]').replace(/Bearer\s+\S+/g, 'Bearer [redacted]') + '\n'));
  }
  log('DSH started with Remote Host profile');
  child.on('error', () => { log('DSH failed to start'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = shutdown.signal.aborted ? 0 : (code ?? 1); });
}

main().catch(() => { log('Startup failed: invalid configuration or persistent state'); process.exitCode = 1; });
