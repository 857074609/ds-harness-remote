import { describe, expect, it } from 'vitest'
import { parseDirectTarget } from '../src/lib/server-url'

/**
 * Direct-connect target parsing protects the dial URL handed to the WebSocket
 * transport. A wrong scheme or a dropped path silently turns a working
 * reverse-proxy setup into a "cannot connect" error, so the accepted forms and
 * the rejected ones are pinned here.
 */
describe('parseDirectTarget', () => {
  it('keeps the classic LAN host:port form on plain ws', () => {
    expect(parseDirectTarget('192.168.1.10:18888')).toEqual({
      host: '192.168.1.10',
      port: 18888,
      url: 'ws://192.168.1.10:18888/ws/v1/connect',
    })
  })

  it('maps a bare https domain to wss on the default port with the proxied path', () => {
    expect(parseDirectTarget('https://dsh.example.com/direct')).toEqual({
      host: 'dsh.example.com',
      port: 443,
      url: 'wss://dsh.example.com/direct',
    })
  })

  it('maps http to ws and keeps an explicit port', () => {
    expect(parseDirectTarget('http://10.0.0.5:8080/relay')).toEqual({
      host: '10.0.0.5',
      port: 8080,
      url: 'ws://10.0.0.5:8080/relay',
    })
  })

  it('accepts ws/wss directly, preserving an explicit port and path', () => {
    expect(parseDirectTarget('wss://dsh.example.com:8443/a/b')).toEqual({
      host: 'dsh.example.com',
      port: 8443,
      url: 'wss://dsh.example.com:8443/a/b',
    })
    expect(parseDirectTarget('ws://192.168.1.10:18888/ws/v1/connect')).toEqual({
      host: '192.168.1.10',
      port: 18888,
      url: 'ws://192.168.1.10:18888/ws/v1/connect',
    })
  })

  it('keeps a root path so the Host listener sees a valid request target', () => {
    expect(parseDirectTarget('https://dsh.example.com')?.url).toBe('wss://dsh.example.com/')
  })

  it('preserves the query string a proxy may require', () => {
    expect(parseDirectTarget('https://dsh.example.com/direct?token=abc')?.url)
      .toBe('wss://dsh.example.com/direct?token=abc')
  })

  it('rejects inputs that would hide a configuration mistake', () => {
    // A bare hostname would silently pick port 443; require the scheme.
    expect(parseDirectTarget('dsh.example.com')).toBeUndefined()
    // Unsupported schemes and out-of-range ports.
    expect(parseDirectTarget('ftp://dsh.example.com')).toBeUndefined()
    expect(parseDirectTarget('192.168.1.10:0')).toBeUndefined()
    expect(parseDirectTarget('192.168.1.10:70000')).toBeUndefined()
    // Embedded credentials are rejected rather than forwarded.
    expect(parseDirectTarget('https://user:pass@dsh.example.com')).toBeUndefined()
    expect(parseDirectTarget('')).toBeUndefined()
  })
})