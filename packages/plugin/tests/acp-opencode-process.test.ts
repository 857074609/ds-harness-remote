import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { OpencodeAcpClient, OpencodeAcpError } from '../src/acp/adapters/opencode-process.js'
import type { SafeLogger } from '../src/logging.js'

describe('OpencodeAcpClient', () => {
  it('initializes with standard ACP initialize and correlates JSON-RPC responses (without authenticate)', async () => {
    const fake = fakeProcess()
    const outbound: Array<Record<string, unknown>> = []
    fake.child.stdin.on('data', chunk => {
      for (const line of String(chunk).trim().split('\n')) {
        if (!line) continue
        const message = JSON.parse(line) as Record<string, unknown>
        outbound.push(message)
        if (message.method === 'initialize') {
          fake.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })}\n`)
        }
      }
    })
    const client = new OpencodeAcpClient('opencode-custom', logger(), binary => {
      expect(binary).toBe('opencode-custom')
      return fake.child
    })
    const inbound = vi.fn()
    client.onInbound(inbound)

    await client.start()
    // OpenCode native ACP must only initialize, strictly no authenticate method
    expect(outbound.map(message => message.method)).toEqual(['initialize'])

    const pending = client.call('session/new', { cwd: '/tmp', mcpServers: [] })
    await flush()
    const request = outbound.find(message => message.method === 'session/new')!
    fake.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { sessionId: 'opc_sess_1' } })}\n`)
    await expect(pending).resolves.toEqual({ sessionId: 'opc_sess_1' })

    fake.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: 'opc_sess_1', update: { sessionUpdate: 'agent_message_chunk' } },
    })}\n`)
    fake.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 'perm-opc-1',
      method: 'session/request_permission',
      params: { sessionId: 'opc_sess_1' },
    })}\n`)
    await flush()
    expect(inbound).toHaveBeenNthCalledWith(1, {
      kind: 'notification',
      method: 'session/update',
      params: { sessionId: 'opc_sess_1', update: { sessionUpdate: 'agent_message_chunk' } },
    })
    expect(inbound).toHaveBeenNthCalledWith(2, {
      kind: 'request',
      id: 'perm-opc-1',
      method: 'session/request_permission',
      params: { sessionId: 'opc_sess_1' },
    })

    await client.respond('perm-opc-1', { outcome: { outcome: 'selected', optionId: 'allow-once' } })
    expect(outbound.at(-1)).toEqual({
      jsonrpc: '2.0',
      id: 'perm-opc-1',
      result: { outcome: { outcome: 'selected', optionId: 'allow-once' } },
    })
    await client.close()
  })

  it('rejects pending calls when process exits unexpectedly', async () => {
    const fake = fakeProcess()
    fake.child.stdin.on('data', chunk => {
      for (const line of String(chunk).trim().split('\n')) {
        if (!line) continue
        const message = JSON.parse(line) as Record<string, unknown>
        if (message.method === 'initialize') {
          fake.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })}\n`)
        }
      }
    })
    const client = new OpencodeAcpClient('opencode', logger(), () => fake.child)
    await client.start()

    const pending = client.call('session/prompt', { sessionId: 'sess_1', prompt: [] })
    await flush()
    fake.child.emit('exit', 1, null)

    await expect(pending).rejects.toThrow(OpencodeAcpError)
  })
})

function fakeProcess(): {
  child: ChildProcessWithoutNullStreams
  stdout: PassThrough
  kill: ReturnType<typeof vi.fn>
} {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const stdin = new PassThrough()
  const child = new EventEmitter() as ChildProcessWithoutNullStreams
  const kill = vi.fn(() => {
    child.emit('exit', 0, null)
    return true
  })
  Object.assign(child, {
    stdout,
    stderr,
    stdin,
    kill,
    exitCode: null,
    killed: false,
  })
  return { child, stdout, kill }
}

function logger(): SafeLogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as SafeLogger
}

async function flush(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve))
}
