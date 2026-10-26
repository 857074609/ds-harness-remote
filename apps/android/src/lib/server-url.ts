/** Parse a "host:port" direct-connect target (IPv4, hostname, or literal). */
export function parseDirectTarget(input: string): { host: string; port: number } | undefined {
  const match = /^([a-zA-Z0-9._-]+):(\d{1,5})$/.exec(input.trim())
  if (match === null) return undefined
  const host = match[1]
  const port = Number(match[2])
  if (host === undefined || port === undefined || port < 1 || port > 65535) return undefined
  return { host, port }
}
