import { MAX_SECURE_MESSAGE_BYTES } from '@dsh-remote/protocol'
import { describe, expect, it, vi } from 'vitest'
import type { PluginRouteDispatcher } from '../src/plugin-route-bridge.js'
import { PLUGIN_ROUTE_PATTERN, PluginRouteBridge } from '../src/plugin-route-bridge.js'
import { RpcError } from '../src/rpc-router.js'

function dispatcher(overrides: Partial<{ status: number; json: unknown }> = {}): PluginRouteDispatcher {
  return vi.fn(async () => ({ status: 200, json: { ok: true, value: [] }, ...overrides }))
}

describe('PluginRouteBridge', () => {
  it('forwards valid calls to the dispatcher and returns the bounded status/json envelope', async () => {
    const dispatch = dispatcher({ json: { ok: true, value: { answer: 42 } } })
    const bridge = new PluginRouteBridge(dispatch)
    await expect(bridge.call({ route: 'api/bot', body: { message: 'hi' } })).resolves.toEqual({
      status: 200,
      json: { ok: true, value: { answer: 42 } },
    })
    expect(dispatch).toHaveBeenCalledWith('api/bot', { message: 'hi' }, expect.any(AbortSignal))
  })

  it.each(['http://evil/api/bot', '../etc/passwd', '', `api/${'x'.repeat(65)}`, 'api/bot?x=1', '/api/bot'])(
    'rejects the route %j with INVALID_MESSAGE',
    async route => {
      const bridge = new PluginRouteBridge(dispatcher())
      await expect(bridge.call({ route, body: {} })).rejects.toMatchObject({ code: 'INVALID_MESSAGE' })
      expect(PLUGIN_ROUTE_PATTERN.test(route)).toBe(false)
    },
  )

  it.each([[[]], ['string'], [42], [null], [{ route: 'api/bot', extra: true }]])(
    'rejects invalid payloads (%j) with INVALID_MESSAGE',
    async input => {
      const bridge = new PluginRouteBridge(dispatcher())
      await expect(bridge.call(input)).rejects.toMatchObject({ code: 'INVALID_MESSAGE' })
    },
  )

  it('rejects oversized request bodies with INVALID_MESSAGE', async () => {
    const bridge = new PluginRouteBridge(dispatcher())
    await expect(bridge.call({ route: 'api/bot', body: { blob: 'x'.repeat(MAX_SECURE_MESSAGE_BYTES) } }))
      .rejects.toMatchObject({ code: 'INVALID_MESSAGE' })
  })

  it('rejects oversized responses with RESPONSE_TOO_LARGE', async () => {
    const bridge = new PluginRouteBridge(dispatcher({ json: { blob: 'x'.repeat(MAX_SECURE_MESSAGE_BYTES) } }))
    await expect(bridge.call({ route: 'api/bot', body: {} }))
      .rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
  })

  it('propagates dispatcher failures after the payload was accepted', async () => {
    const bridge = new PluginRouteBridge(vi.fn(async () => {
      throw new RpcError('TIMEOUT', 'The plugin route call timed out.', undefined, true)
    }))
    await expect(bridge.call({ route: 'api/bot', body: {} }))
      .rejects.toMatchObject({ code: 'TIMEOUT', retryable: true })
  })
})
