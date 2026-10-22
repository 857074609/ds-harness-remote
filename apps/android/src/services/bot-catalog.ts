import type { RemoteSession } from '../types'
import { strings } from '../locales/i18n'

export type BotObject = Record<string, unknown>
export interface BotEntry {
  id: string
  sessionId: string
  name: string
  role: string
  instructions: string
  model: string
  effort: string
  color?: string
  avatar?: { shape?: string }
  preview?: string
  main: boolean
}
export interface BotRoom { preview?: string; id: string; name: string; members: string[]; notice: string; admin: string }
export interface BotState {
  bots: BotEntry[]
  rooms: BotRoom[]
  exchangeTurns: BotObject
  activity: BotObject
  questions: BotObject
  views: BotObject
  approvals: BotObject[]
  models: BotObject[]
  readOnly?: string
}

// Android only exposes the reviewed Bot workflows, never arbitrary plugin routes.
export const BOT_OPERATIONS = [
  'state', 'models', 'efforts', 'earlier', 'exchange', 'usage', 'room-progress', 'schedules',
  'create-bot', 'duplicate-bot', 'update-bot', 'delete-bot', 'set-main', 'set-flags',
  'create-room', 'update-room', 'delete-room', 'send', 'answer-question', 'dismiss-question',
  'view-reply', 'approval-answer', 'stop-member-work',
] as const
export type BotOperation = typeof BOT_OPERATIONS[number]

export class BotRemoteClient {
  constructor(
    private readonly dispatch: (body: { endpoint: BotOperation; payload: BotObject | null }, signal?: AbortSignal) => Promise<unknown>,
    private readonly readSessions: () => Promise<RemoteSession[]>,
    private readonly assertCurrent: () => void,
  ) {}

  async call(endpoint: BotOperation, payload: BotObject | null = null, signal?: AbortSignal): Promise<unknown> {
    this.assertCurrent()
    checkAborted(signal)
    if (!(BOT_OPERATIONS as readonly string[]).includes(endpoint)
      || (payload !== null && !isBotObject(payload))
      || (endpoint === 'approval-answer' && payload?.choice !== 'allow' && payload?.choice !== 'reject')) {
      throw new Error(strings.bots.operationDenied)
    }
    const response = await this.dispatch({ endpoint, payload }, signal)
    this.assertCurrent()
    checkAborted(signal)
    if (!isBotObject(response)) throw new Error(strings.bots.invalid)
    if (response.status === 404) throw new Error(strings.bots.notInstalled)
    if (response.status === 503) throw new Error(strings.bots.unsupported)
    if (response.status !== 200 || !isBotObject(response.json)) throw new Error(strings.bots.unavailable)
    const envelope = response.json
    if (envelope.ok !== true) {
      const error = object(envelope.error)
      if (error.code === 'bot/stale') throw new Error(strings.bots.stale)
      throw new Error(typeof error.message === 'string' ? error.message : strings.bots.unavailable)
    }
    return envelope.value
  }

  async state(signal?: AbortSignal, withPreviews = false): Promise<BotState> {
    const state = parseBotState(await this.call('state', null, signal))
    if (!withPreviews) return state
    const sessions = await this.readSessions()
    this.assertCurrent()
    checkAborted(signal)
    const catalog = new Map(sessions.filter(entry => (entry.backend ?? 'harness') === 'harness').map(entry => [entry.sessionId, entry]))
    for (const bot of state.bots) bot.preview = sessionPreview(catalog.get(bot.sessionId), state.exchangeTurns[bot.sessionId])
    for (const room of state.rooms) room.preview ||= sessionPreview(catalog.get(room.id))
    return state
  }

  /** Resolve only a current Bot/group returned by this Host, against its official catalog. */
  async resolveSession(id: string, signal?: AbortSignal): Promise<{ state: BotState; session: RemoteSession }> {
    const state = await this.state(signal)
    const bot = state.bots.find(entry => entry.id === id)
    const sessionId = bot?.sessionId ?? state.rooms.find(entry => entry.id === id)?.id
    if (sessionId === undefined) throw new Error(strings.bots.sessionUnavailable)
    const sessions = await this.readSessions()
    this.assertCurrent()
    checkAborted(signal)
    const session = sessions.find(item => item.sessionId === sessionId && (item.backend ?? 'harness') === 'harness')
    if (session === undefined) throw new Error(strings.bots.sessionUnavailable)
    return { state, session }
  }
}

export function parseBotState(value: unknown): BotState {
  if (!isBotObject(value) || !Array.isArray(value.bots) || !Array.isArray(value.rooms)) throw new Error(strings.bots.invalid)
  const bots = value.bots.map(entry => {
    if (!isBotObject(entry) || !nonempty(entry.id) || !nonempty(entry.sessionId)) throw new Error(strings.bots.invalid)
    return { id: entry.id, sessionId: entry.sessionId, name: text(entry.name) || entry.id,
      color: text(entry.color), avatar: { shape: text(object(entry.avatar).shape) },
      role: text(entry.role), instructions: text(entry.instructions), model: text(entry.model), effort: text(entry.effort),
      main: Array.isArray(value.mainBotIds) ? value.mainBotIds.includes(entry.id) : value.mainBotId === entry.id }
  })
  const rooms = value.rooms.map(entry => {
    if (!isBotObject(entry) || !nonempty(entry.id) || !Array.isArray(entry.members) || !entry.members.every(nonempty)) throw new Error(strings.bots.invalid)
    return { preview: compactPreview(text(entry.preview)), id: entry.id, name: text(entry.name) || entry.id, members: entry.members as string[], notice: text(entry.notice), admin: text(entry.admin) }
  })
  const ids = [...bots, ...rooms].map(entry => entry.id)
  if (new Set(ids).size !== ids.length) throw new Error(strings.bots.invalid)
  return { bots, rooms, exchangeTurns: object(value.exchangeTurns), activity: object(value.activity), questions: object(value.questions), views: object(value.views),
    approvals: objects(object(value.work).approvals), models: objects(value.models),
    ...(typeof value.readOnly === 'string' ? { readOnly: value.readOnly } : {}) }
}
export function isBotObject(value: unknown): value is BotObject { return value !== null && typeof value === 'object' && !Array.isArray(value) }
export function object(value: unknown): BotObject { return isBotObject(value) ? value : {} }
export function objects(value: unknown): BotObject[] { return Array.isArray(value) ? value.filter(isBotObject) : [] }
export function text(value: unknown): string { return typeof value === 'string' ? value : '' }
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.length > 0 }

// React Native's abort-controller implements aborted/events, not throwIfAborted.
function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
}

// Match the native Bot sidebar: latest visible response, then prompt; never internal exchanges.
function sessionPreview(session?: RemoteSession, hiddenTurns: unknown = []): string {
  const hidden = Array.isArray(hiddenTurns) ? hiddenTurns : []
  const outline = objects(session?.projections?.values?.turnOutline)
  for (let i = outline.length - 1; i >= 0; i--) {
    const turn = outline[i]!
    if (hidden.includes(turn.turn)) continue
    const value = text(turn.response) || text(turn.prompt)
    if (value) return compactPreview(value.replace(/^\[(Message from|Reply from|Group chat|Group post from|Bot team setup|Handoff · part|Secret card)(?:[^\r\n]*\]\r?\n|[^\]\r\n]*\])/, ''))
  }
  return ''
}
function compactPreview(value: string): string { return value.replace(/\s+/g, ' ').trim().slice(0, 240) }
