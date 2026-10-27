import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../src/types'
import { settleInboxDelivery } from '../src/state/message-helpers'

function row(overrides: Partial<Extract<ChatItem, { kind: 'message' }>> = {}): ChatItem {
  return {
    kind: 'message',
    id: 'local:req-1',
    sessionId: 's1',
    role: 'user',
    text: '再乘以一等于多少。',
    createdAt: 1,
    requestRpcId: 'req-1',
    ...overrides,
  } as ChatItem
}

const inboxWith = (rpcId: string): unknown => ({ 'next-turn': [{ id: 'm1', role: 'user', source: { kind: 'user', rpcId } }], 'next-step': [] })
const EMPTY_INBOX = { 'next-turn': [], 'next-step': [] }

describe('optimistic prompt delivery follows the Host inbox', () => {
  it('marks a queued prompt as queued while the Host still holds it', () => {
    const [settled] = settleInboxDelivery([row()], inboxWith('req-1'))
    expect(settled).toMatchObject({ sendState: 'queued', queuedAdopted: true })
  })

  it('treats a dequeued prompt as delivered, never as an unconfirmed send', () => {
    const queued = settleInboxDelivery([row()], inboxWith('req-1'))
    const [settled] = settleInboxDelivery(queued, EMPTY_INBOX)
    // The Host only leaves the inbox to start the turn: the agent is answering,
    // so the row must not claim the send might have been lost.
    expect(settled).toMatchObject({ id: 'local:req-1' })
    expect((settled as { sendState?: string }).sendState).toBeUndefined()
  })

  it('keeps a row that never reached the inbox untouched so real failures surface', () => {
    const failed = row({ sendState: 'unconfirmed', sendError: 'RPC harness.remote.call timed out after 35000ms' })
    const [settled] = settleInboxDelivery([failed], EMPTY_INBOX)
    expect(settled).toMatchObject({ sendState: 'unconfirmed', sendError: 'RPC harness.remote.call timed out after 35000ms' })
  })

  it('never resurrects a canceled row', () => {
    const canceled = row({ sendState: 'canceled', queuedAdopted: true })
    const [settled] = settleInboxDelivery([canceled], EMPTY_INBOX)
    expect(settled).toMatchObject({ sendState: 'canceled' })
  })
})
