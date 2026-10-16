import { CursorAcpClient, CursorAcpError, type CursorAcpLike, type CursorAcpInbound, type CursorAcpInboundHandler, type CursorAcpUnavailableHandler } from './cursor-process.js'
import type { SafeLogger } from '../../logging.js'
import { piToolResult } from '../pi-tool-result.js'

/** pi itself is NOT ACP. Each session uses the published pi-acp wrapper. */
export class PiAcpClient implements CursorAcpLike {
  private catalog?: CursorAcpLike
  private readonly clients = new Map<string, CursorAcpLike>()
  private readonly starting = new Set<CursorAcpLike>()
  private readonly inbound = new Set<CursorAcpInboundHandler>()
  private readonly unavailable = new Set<CursorAcpUnavailableHandler>()
  private closed = false
  private readonly all = new Set<CursorAcpLike>()
  private readonly callbacks = new Map<string, { client: CursorAcpLike; id: string | number }>()
  private nextCallback = 0
  private readonly configurations = new Map<string, Record<string, any>>()
  private readonly busy = new Set<string>()
  private readonly loading = new Map<string, Promise<unknown>>()
  private historyBusy = false
  constructor(private readonly binary: string, private readonly logger?: SafeLogger,
    private readonly options: { args?: string[]; cwd?: string } = {},
    private readonly factory: () => CursorAcpLike = () => new CursorAcpClient(binary, logger, undefined,
      { ...options, args: options.args ?? [], authenticationMethod: null })) {}

  async start(): Promise<void> {
    this.catalog = await this.create()
    this.catalog.onUnavailable(code => { for (const handler of this.unavailable) handler(code) })
  }
  isReady(): boolean { return !this.closed && this.catalog?.isReady() === true }
  private async create(history = false): Promise<CursorAcpLike> {
    if (this.closed) throw new CursorAcpError('ACP_CLOSED', 'PI ACP is closed.')
    if (this.all.size >= (history ? 32 : 31)) throw new CursorAcpError('ACP_PROCESS_LIMIT', 'Too many PI ACP sessions are active.')
    const client = this.factory()
    this.starting.add(client)
    this.all.add(client)
    try {
      await client.start()
      if (this.closed) throw new CursorAcpError('ACP_CLOSED', 'PI ACP is closed.')
      return client
    } catch (error) { await this.dispose(client); throw error }
    finally { this.starting.delete(client) }
  }
  async call(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    const p = params as Record<string, unknown>
    if (method === 'session/load' && typeof p.sessionId === 'string') {
      const previous = this.loading.get(p.sessionId)
      if (previous) return previous
      const promise = this.callOnce(method, params, timeoutMs)
      this.loading.set(p.sessionId, promise)
      try { return await promise } finally { this.loading.delete(p.sessionId) }
    }
    return this.callOnce(method, params, timeoutMs)
  }
  private async callOnce(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    const p = params as Record<string, unknown>
    if (method === 'session/list') return this.catalog!.call(method, params, timeoutMs)
    if (method === 'session/new' || method === 'session/load') {
      const known = typeof p.sessionId === 'string' ? this.clients.get(p.sessionId) : undefined
      // Loading a live session must not restart or cancel an in-flight turn.
      if (known) return { sessionId: p.sessionId }
      const client = await this.create()
      let boundId = typeof p.sessionId === 'string' ? p.sessionId : undefined
      const queued: CursorAcpInbound[] = []
      let replaying = method === 'session/load'
      const replayConfiguration: Record<string, any> = {}
      const receive = (message: CursorAcpInbound) => {
        // Initial load replays history, not a live turn. Keep only configuration
        // state and reject callbacks before this wrapper has a committed session.
        if (replaying) {
          if (message.kind === 'request') {
            void client.respondError(message.id, -32600, 'PI session is not loaded.').catch(() => undefined)
          } else if ((message.params as { sessionId?: string } | undefined)?.sessionId === boundId) {
            this.updateConfiguration(boundId!, message, replayConfiguration)
          }
          return
        }
        const incomingId = (message.params as { sessionId?: string } | undefined)?.sessionId
        if (!boundId) { if (queued.length < 200) queued.push(message); return }
        if (incomingId !== boundId) return
        this.updateConfiguration(boundId, message)
        if (message.kind === 'request') {
          const id = `pi-callback:${++this.nextCallback}`
          this.callbacks.set(id, { client, id: message.id })
          message = { ...message, id }
        }
        for (const handler of this.inbound) handler(message)
      }
      client.onInbound(receive)
      client.onUnavailable(() => {
        if (boundId && this.clients.get(boundId) === client) { this.clients.delete(boundId); this.configurations.delete(boundId) }
        void this.dispose(client).catch(() => undefined)
      })
      try {
        const result = await client.call(method, params, timeoutMs)
        const id = method === 'session/load' ? p.sessionId : (result as Record<string, unknown>).sessionId
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,240}$/.test(id) || this.clients.has(id) || this.closed
          || (method === 'session/load' && typeof (result as Record<string, unknown>).sessionId === 'string' && (result as Record<string, unknown>).sessionId !== id)) throw new CursorAcpError('ACP_INVALID_SESSION', 'PI returned an invalid session.')
        this.clients.set(id, client)
        const config = { ...(result as Record<string, any>) }
        for (const key of ['models', 'modes']) {
          if (replayConfiguration[key]) config[key] = { ...config[key], ...replayConfiguration[key] }
        }
        this.configurations.set(id, config)
        boundId = id
        replaying = false
        for (const message of queued) receive(message)
        return { ...(result as object), sessionId: id }
      } catch (error) { await this.dispose(client); throw error }
    }
    const client = this.clients.get(String(p.sessionId))
    if (!client) throw new CursorAcpError('ACP_SESSION_NOT_LOADED', 'Load the PI session before using it.')
    const id = String(p.sessionId)
    if (method === 'dsh/sessionModels') return this.models(id)
    if (method === 'dsh/selectModel') {
      if (this.busy.has(id)) throw new CursorAcpError('PROMPT_IN_PROGRESS', 'Stop the PI reply before changing its model.')
      const config = this.configurations.get(id)!
      if (!config?.models?.availableModels?.some((item: any) => item.modelId === p.model)
        || (p.reasoningEffort !== undefined && !config?.modes?.availableModes?.some((item: any) => item.id === p.reasoningEffort))) {
        throw new CursorAcpError('INVALID_MESSAGE', 'The PI model or thinking level is not available.')
      }
      this.busy.add(id)
      try {
        const modelResult = await client.call('session/set_config_option', { sessionId: id, configId: 'model', value: p.model })
        this.updateConfiguration(id, { kind: 'notification', method: 'session/update', params: { update: { sessionUpdate: 'config_option_update', configOptions: (modelResult as { configOptions?: unknown }).configOptions } } })
        if (p.reasoningEffort !== undefined) {
          if (!this.configurations.get(id)?.modes?.availableModes?.some((item: any) => item.id === p.reasoningEffort)) throw new CursorAcpError('INVALID_MESSAGE', 'The selected model does not support this thinking level.')
          const thinkingResult = await client.call('session/set_config_option', { sessionId: id, configId: 'thought_level', value: p.reasoningEffort })
          this.updateConfiguration(id, { kind: 'notification', method: 'session/update', params: { update: { sessionUpdate: 'config_option_update', configOptions: (thinkingResult as { configOptions?: unknown }).configOptions } } })
        }
        return { selected: this.models(id).current }
      } finally { this.busy.delete(id) }
    }
    if (method === 'session/prompt') {
      if (this.busy.has(id)) throw new CursorAcpError('PROMPT_IN_PROGRESS', 'The PI session is busy.')
      this.busy.add(id)
      try { return await client.call(method, params, timeoutMs) } finally { this.busy.delete(id) }
    }
    return client.call(method, params, timeoutMs)
  }
  private updateConfiguration(id: string, message: CursorAcpInbound, initial?: Record<string, any>) {
    if (message.method !== 'session/update') return
    const update = (message.params as { update?: Record<string, any> }).update
    const config = initial ?? this.configurations.get(id)
    if (!update || !config) return
    if (update.sessionUpdate === 'current_mode_update' && typeof update.currentModeId === 'string') config.modes = { ...config.modes, currentModeId: update.currentModeId }
    if (update.sessionUpdate === 'config_option_update' && Array.isArray(update.configOptions)) {
      for (const option of update.configOptions) {
        if (option.type !== 'select' || !Array.isArray(option.options)) continue
        if (option.id === 'model') config.models = { currentModelId: option.currentValue,
          availableModels: option.options.map((item: any) => ({ modelId: item.value, name: item.name })) }
        if (option.id === 'thought_level') config.modes = { currentModeId: option.currentValue,
          availableModes: option.options.map((item: any) => ({ id: item.value, name: item.name })) }
      }
    }
  }
  private models(id: string) {
    const config = this.configurations.get(id)
    const modes = config?.modes
    return { current: { provider: 'pi', model: config?.models?.currentModelId ?? '', reasoningEffort: modes?.currentModeId },
      routable: true, failures: [], groups: [{ id: 'pi', name: 'PI', models: (config?.models?.availableModels ?? []).map((model: any) => ({
        id: model.modelId, name: model.name, ...(modes?.availableModes?.length ? { reasoning: { efforts: modes.availableModes.map((mode: any) => ({ id: mode.id, name: mode.name })), defaultEffort: modes.currentModeId } } : {}),
      })) }] }
  }

  /** A separate wrapper prevents history reads from interrupting active sessions. */
  async history(sessionId: string, cwd: string): Promise<unknown[]> {
    if (this.historyBusy) throw new CursorAcpError('ACP_PROCESS_LIMIT', 'A PI history read is already in progress.')
    this.historyBusy = true
    let client: CursorAcpLike
    try { client = await this.create(true) }
    catch (error) { this.historyBusy = false; throw error }
    const updates: CursorAcpInbound[] = []
    let bytes = 0
    let count = 0
    client.onInbound(message => {
      if (message.kind !== 'notification' || message.method !== 'session/update' || (message.params as { sessionId?: string } | null)?.sessionId !== sessionId) return
      count++
      bytes += Buffer.byteLength(JSON.stringify(message))
      if (bytes <= 8 * 1024 * 1024 && count <= 10000) updates.push(message)
    })
    try {
      const result = await client.call('session/load', { sessionId, cwd, mcpServers: [] })
      const loadedId = (result as { sessionId?: unknown } | null)?.sessionId
      if (loadedId !== undefined && loadedId !== sessionId) throw new CursorAcpError('ACP_INVALID_SESSION', 'PI returned an invalid history session.')
      if (bytes > 8 * 1024 * 1024 || count > 10000) throw new CursorAcpError('ACP_HISTORY_TOO_LARGE', 'PI history exceeds the transfer limit.')
      return historyEvents(updates, sessionId)
    }
    finally { try { await this.dispose(client) } finally { this.historyBusy = false } }
  }
  async respond(id: string | number, result: unknown): Promise<void> {
    const pending = this.callbacks.get(String(id))
    if (!pending) throw new CursorAcpError('ACP_CALLBACK_NOT_FOUND', 'The PI callback is unavailable.')
    this.callbacks.delete(String(id)); await pending.client.respond(pending.id, result)
  }
  async respondError(id: string | number, code: number, message: string): Promise<void> {
    const pending = this.callbacks.get(String(id))
    if (!pending) return
    this.callbacks.delete(String(id)); await pending.client.respondError(pending.id, code, message)
  }
  onInbound(handler: CursorAcpInboundHandler): () => void { this.inbound.add(handler); return () => this.inbound.delete(handler) }
  onUnavailable(handler: CursorAcpUnavailableHandler): () => void { this.unavailable.add(handler); return () => this.unavailable.delete(handler) }
  private async dispose(client: CursorAcpLike): Promise<void> {
    await client.close()
    this.all.delete(client)
    for (const [key, pending] of this.callbacks) if (pending.client === client) this.callbacks.delete(key)
  }
  async close(): Promise<void> {
    this.closed = true
    const clients = this.all
    await Promise.all([...clients].map(client => this.dispose(client)))
    this.clients.clear()
    this.all.clear()
    this.callbacks.clear()
  }
}

// pi-acp 0.0.34 does not replay original timestamps/IDs, thinking, or tool
// arguments. Use deterministic projection IDs and an unknown (epoch) time rather
// than presenting the time of this history read as the time of the conversation.
function historyEvents(messages: CursorAcpInbound[], sessionId: string): unknown[] {
  type Block = { type: string; text: string }
  type Tool = { id: string; name: string; input: unknown; output: Block[]; failed: boolean; terminal: boolean; emitted: boolean }
  const events: any[] = []
  const tools = new Map<string, Tool>()
  let turn = 0
  let step = 1
  let afterTools = false
  let pending: { role: 'user' | 'assistant'; content: Block[] } | undefined
  const push = (type: string, data: unknown, surface = false) => events.push({ type: 'event', event: {
    type, seq: events.length, time: 0, data, ...(surface ? { surfaceOp: 'append' } : {}),
  } })
  const id = () => `pi-history:${sessionId}:${events.length}`
  const flushMessage = () => {
    if (!pending) return
    const message = { id: id(), role: pending.role, content: pending.content }
    if (pending.role === 'user') push('user/message', { ...message, source: { kind: 'user' } }, true)
    else push('assistant/message', { turn, step, message: { ...message, source: { kind: 'model', provider: 'pi', model: '' } }, stream: [] }, true)
    pending = undefined
  }
  const result = (tool: Tool) => {
    if (tool.emitted || !tool.terminal) return
    tool.emitted = true
    push('tool/result', { turn, step, message: { id: id(), role: 'user', source: { kind: 'tool', callId: tool.id }, content: [{
      type: 'tool-result', toolCallId: tool.id, content: tool.output, ...(tool.failed ? { isError: true } : {}),
    }] } }, true)
  }
  const flushTools = () => { for (const tool of tools.values()) result(tool) }
  const endTurn = () => {
    flushMessage(); flushTools()
    if (turn) { push('step/end', { turn, step }); push('turn/end', { turn, reason: { kind: 'completed' } }) }
    tools.clear()
    afterTools = false
  }
  for (const message of messages) {
    const params = message.params as { sessionId?: string; update?: Record<string, any> } | undefined
    if (message.kind !== 'notification' || message.method !== 'session/update' || params?.sessionId !== sessionId) continue
    const update = params.update
    if (!update) continue
    const kind = update.sessionUpdate
    if (kind === 'user_message_chunk' || kind === 'agent_message_chunk' || kind === 'agent_thought_chunk') {
      if (update.content?.type !== 'text' || typeof update.content.text !== 'string') continue
      const role = kind === 'user_message_chunk' ? 'user' : 'assistant'
      if (role === 'user' && pending?.role !== 'user') {
        endTurn(); turn++; step = 1
        push('turn/start', { turn }); push('step/start', { turn, step })
      } else if (!turn) {
        turn++; push('turn/start', { turn }); push('step/start', { turn, step })
      }
      if (pending && pending.role !== role) flushMessage()
      flushTools()
      if (role === 'assistant' && afterTools) {
        push('step/end', { turn, step }); step++; push('step/start', { turn, step })
        afterTools = false
      }
      pending ??= { role, content: [] }
      const type = kind === 'agent_thought_chunk' ? 'reasoning' : 'text'
      const previous = pending.content.at(-1)
      if (previous?.type === type) previous.text += update.content.text
      else pending.content.push({ type, text: update.content.text })
    } else if ((kind === 'tool_call' || kind === 'tool_call_update') && typeof update.toolCallId === 'string') {
      flushMessage()
      afterTools = true
      if (!turn) { turn++; push('turn/start', { turn }); push('step/start', { turn, step }) }
      let tool = tools.get(update.toolCallId)
      if (!tool) {
        tool = { id: update.toolCallId, name: typeof update.title === 'string' ? update.title : 'tool', input: update.rawInput,
          output: [], failed: false, terminal: false, emitted: false }
        tools.set(tool.id, tool)
        push('tool/call', { turn, step, callId: tool.id, name: tool.name,
          arguments: typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input ?? {}) })
      }
      const decoded = piToolResult(update)
      if (decoded.content.length) tool.output = decoded.content
      tool.failed ||= decoded.isError
      tool.terminal ||= update.status === 'completed' || update.status === 'failed'
      // Published load emits a provisional completed tool_call followed by the
      // authoritative tool_call_update (which can be failed and hold all output).
      if (kind === 'tool_call_update') result(tool)
    }
  }
  endTurn()
  return events
}
