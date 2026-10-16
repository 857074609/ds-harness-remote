import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { CursorAcpClient } from '../src/acp/adapters/cursor-process.js'
import { ClaudeAcpClient } from '../src/acp/adapters/claude-process.js'
import type { SafeLogger } from '../src/logging.js'

describe('CursorAcpClient', () => {
  it('initializes, authenticates, and correlates JSON-RPC responses', async () => {
    const fake = fakeProcess()
    const outbound: Array<Record<string, unknown>> = []
    fake.child.stdin.on('data', chunk => {
      for (const line of String(chunk).trim().split('\n')) {
        const message = JSON.parse(line) as Record<string, unknown>
        outbound.push(message)
        if (message.method === 'initialize' || message.method === 'authenticate') {
          fake.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} })}\n`)
        }
      }
    })
    const client = new CursorAcpClient('agent-custom', logger(), binary => {
      expect(binary).toBe('agent-custom')
      return fake.child
    })
    const inbound = vi.fn()
    client.onInbound(inbound)

    await client.start()
    expect(outbound.map(message => message.method)).toEqual(['initialize', 'authenticate'])
    expect(outbound[1]?.params).toEqual({ methodId: 'cursor_login' })

    const pending = client.call('session/new', { cwd: '/tmp', mcpServers: [] })
    await flush()
    const request = outbound.find(message => message.method === 'session/new')!
    fake.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { sessionId: 'sess_1' } })}\n`)
    await expect(pending).resolves.toEqual({ sessionId: 'sess_1' })

    fake.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: 'sess_1', update: { sessionUpdate: 'agent_message_chunk' } },
    })}\n`)
    fake.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 'perm-1',
      method: 'session/request_permission',
      params: { sessionId: 'sess_1' },
    })}\n`)
    await flush()
    expect(inbound).toHaveBeenNthCalledWith(1, {
      kind: 'notification',
      method: 'session/update',
      params: { sessionId: 'sess_1', update: { sessionUpdate: 'agent_message_chunk' } },
    })
    expect(inbound).toHaveBeenNthCalledWith(2, {
      kind: 'request',
      id: 'perm-1',
      method: 'session/request_permission',
      params: { sessionId: 'sess_1' },
    })

    await client.respond('perm-1', { outcome: { outcome: 'selected', optionId: 'allow-once' } })
    expect(outbound.at(-1)).toEqual({
      jsonrpc: '2.0',
      id: 'perm-1',
      result: { outcome: { outcome: 'selected', optionId: 'allow-once' } },
    })
    await client.close()
  })
})

describe('ClaudeAcpClient startup isolation', () => {
  it('initializes with Host credentials without sending any authenticate request', async () => {
    const fake = fakeProcess()
    const methods: unknown[] = []
    fake.child.stdin.on('data', chunk => {
      const message = JSON.parse(String(chunk))
      methods.push(message.method)
      fake.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} })}\n`)
    })
    const client = new ClaudeAcpClient(undefined, logger(), binary => {
      expect(binary).toBe('claude-agent-acp')
      return fake.child
    })
    await client.start()
    expect(client.isReady()).toBe(true)
    expect(methods).toEqual(['initialize'])
    await client.close()
  })

  it('fails closed when initialize rejects and never sends authenticate', async () => {
    const fake = fakeProcess()
    const methods: unknown[] = []
    fake.child.stdin.on('data', chunk => {
      const message = JSON.parse(String(chunk))
      methods.push(message.method)
      fake.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'login required' } })}\n`)
    })
    const client = new ClaudeAcpClient(undefined, logger(), () => fake.child)
    await expect(client.start()).rejects.toMatchObject({ code: 'CURSOR_UPSTREAM_ERROR' })
    expect(client.isReady()).toBe(false)
    await expect(client.call('session/new', {})).rejects.toMatchObject({ code: 'CURSOR_UNAVAILABLE' })
    expect(methods).toEqual(['initialize'])
    expect(fake.kill).toHaveBeenCalledWith('SIGTERM')
    await client.close()
  })

  it('rejects a pending initialize on close and ignores its late response', async () => {
    const fake = fakeProcess()
    let initializeId: unknown
    fake.child.stdin.on('data', chunk => { initializeId = JSON.parse(String(chunk)).id })
    const client = new ClaudeAcpClient(undefined, logger(), () => fake.child)
    const starting = client.start()
    const rejection = expect(starting).rejects.toMatchObject({ code: 'CURSOR_CLOSED' })
    await client.close()
    fake.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: initializeId, result: {} })}\n`)
    await rejection
    expect(client.isReady()).toBe(false)
    await expect(client.start()).rejects.toMatchObject({ code: 'CURSOR_CLOSED' })
  })

  it('cannot become ready after close races with an already delivered initialize response', async () => {
    for (const backend of ['cursor', 'claude'] as const) {
      const fake = fakeProcess()
      const methods: unknown[] = []
      fake.child.stdin.on('data', chunk => {
        const message = JSON.parse(String(chunk))
        methods.push(message.method)
        fake.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} })}\n`)
      })
      const client = backend === 'cursor'
        ? new CursorAcpClient('agent', logger(), () => fake.child)
        : new ClaudeAcpClient(undefined, logger(), () => fake.child)
      const starting = client.start()
      const rejection = expect(starting).rejects.toMatchObject({ code: 'CURSOR_CLOSED' })
      await client.close()
      await rejection
      expect(client.isReady(), backend).toBe(false)
      expect(methods, backend).toEqual(['initialize'])
    }
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
    queueMicrotask(() => child.emit('exit', 0, 'SIGTERM'))
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
