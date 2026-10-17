import type { AcpClientLike } from './virtual-contract.js'

const CURSOR_WORKSPACE_PREFIX = 'cursor:cwd:'

const AGY_WORKSPACE_PREFIX = 'antigravity:cwd:'

const OPENCODE_WORKSPACE_PREFIX = 'opencode:cwd:'

const CURSOR_PROVIDER = 'cursor'

const CURSOR_MODEL = 'cursor'

const OPENCODE_PROVIDER = 'opencode'

const OPENCODE_MODEL = 'opencode'

export interface AcpVirtualWorkspaceView {
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
  sessionCount: number
  createdAt: string
  updatedAt: string
}

/** Build a backend-scoped virtual Workspace id for an absolute Host cwd. */
export function acpCwdWorkspaceId(path: string, backend: "cursor" | "antigravity" | "pi" | "opencode"): string {
  if (backend !== "cursor" && backend !== "antigravity" && backend !== "pi" && backend !== "opencode") throw new Error("An explicit ACP workspace backend is required.")
  const prefix = backend === "pi" ? "pi:cwd:" : backend === "opencode" ? OPENCODE_WORKSPACE_PREFIX : backend === "antigravity" ? AGY_WORKSPACE_PREFIX : CURSOR_WORKSPACE_PREFIX
  return `${prefix}${encodeURIComponent(path)}`
}

export function createAcpWorkspaceView(path: string, backend: "cursor" | "antigravity" | "pi" | "opencode", title?: string): AcpVirtualWorkspaceView {
  const now = new Date().toISOString()
  const label = title?.trim() || path.split(/[\\/]/).filter(Boolean).at(-1) || path
  return {
    workspaceId: acpCwdWorkspaceId(path, backend),
    path,
    title: label,
    sessionIds: [],
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/** Discover ACP virtual workspaces visible on the Host. */
export async function discoverAcpVirtualWorkspaces(
  client: AcpClientLike,
  backend: "cursor" | "antigravity" | "pi" | "opencode",
  signal?: AbortSignal,
): Promise<AcpVirtualWorkspaceView[]> {
  if (client?.listWorkspaces !== undefined) {
    try {
      const items = await client.listWorkspaces(backend, signal)
      if (Array.isArray(items) && items.length > 0) {
        return items
          .filter(item => typeof item?.path === 'string' && item.path.trim() !== '')
          .map(item => {
            const view = createAcpWorkspaceView(item.path, backend, item.title)
            if (typeof item.sessionCount === 'number') view.sessionCount = item.sessionCount
            return view
          })
      }
    } catch (error) {
      if (backend === 'pi') throw error
      // Discovery is optional for legacy backends; an unavailable Host returns no workspaces.
    }
  }
  return []
}

export function recreateWorkspaceFromId(workspaceId: string, backend: "cursor" | "antigravity" | "pi" | "opencode"): AcpVirtualWorkspaceView | undefined {
  const prefix = backend === "pi" ? "pi:cwd:" : backend === "opencode" ? OPENCODE_WORKSPACE_PREFIX : backend === "antigravity" ? AGY_WORKSPACE_PREFIX : CURSOR_WORKSPACE_PREFIX
  if (!workspaceId.startsWith(prefix)) return undefined
  try {
    const path = decodeURIComponent(workspaceId.slice(prefix.length))
    if (path.length > 0) return createAcpWorkspaceView(path, backend)
  } catch {
    return undefined
  }
  return undefined
}

export function nativeWorkspace(view: AcpVirtualWorkspaceView): Omit<AcpVirtualWorkspaceView, 'sessionCount'> {
  return {
    workspaceId: view.workspaceId,
    path: view.path,
    title: view.title,
    sessionIds: view.sessionIds,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  }
}

export interface AcpModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

export interface AcpModelView {
  id: string
  name: string
  description?: string
  reasoning?: {
    efforts: Array<{ id: string; name: string; description?: string }>
    defaultEffort?: string
  }
}

const CURSOR_MODELS: AcpModelView[] = [
  { id: 'auto', name: 'Auto' },
  { id: 'claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' },
  { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'o3-mini', name: 'o3-mini' },
  { id: 'deepseek-r1', name: 'DeepSeek R1' },
]

const OPENCODE_MODELS: AcpModelView[] = [
  { id: "opencode", name: "OpenCode" },
]

export function modelCatalog(backend: "cursor" | "antigravity" | "pi" | "opencode" = "cursor"): {
  default: AcpModelSelection
  routableProviders: string[]
  groups: Array<{ id: string; name: string; models: AcpModelView[] }>
  failures: Array<{ id: string; name: string; message: string }>
} {
  const provider = backend === 'pi' ? 'pi' : backend === 'opencode' ? OPENCODE_PROVIDER : backend === 'antigravity' ? 'antigravity' : CURSOR_PROVIDER
  const name = backend === 'pi' ? 'PI' : backend === 'opencode' ? 'OpenCode' : backend === 'antigravity' ? 'Antigravity' : 'Cursor'
  const models = backend === 'cursor' ? CURSOR_MODELS : backend === 'opencode' ? OPENCODE_MODELS : []
  const defaultModel = models[0]?.id ?? 'host-settings'
  return {
    default: { provider, model: defaultModel },
    routableProviders: [provider],
    groups: [{
      id: provider,
      name,
      models,
    }],
    failures: [],
  }
}
