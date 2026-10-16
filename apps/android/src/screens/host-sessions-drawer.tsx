import { useMemo, useState } from 'react'
import { ActivityIndicator, SectionList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Activity, ArrowLeft, Check, ChevronDown, ChevronRight, Code2, Folder, FolderOpen, MessageSquare, Sparkles, RefreshCw } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppStore } from '../state/store'
import type { RemoteSession } from '../types'
import { strings } from '../locales/i18n'
import { IconButton } from '../ui/components'
import { radius, spacing, type } from '../ui/theme'
import { useTheme, type ThemeColors } from '../ui/theme-context'
import { useThemedStyles } from '../ui/use-themed-styles'
import { resolveSessionDisplayTitle } from './session-title'
import { getVisibleWorkspaceSessions } from '../lib/workspace-sessions'
import { workspaceParentPath } from '../lib/workspace-path'

export function HostSessionsDrawer({ onBack, onClose, onSelect }: {
  onBack: () => void
  onClose: () => void
  onSelect: (session: RemoteSession) => Promise<void>
}) {
  // The store's catalog is scoped to selectedDevice and reset when changing hosts.
  const device = useAppStore(state => state.selectedDevice)
  const sessions = useAppStore(state => state.sessions)
  const lifecycles = useAppStore(state => state.sessionLifecycles)
  const selected = useAppStore(state => state.selectedSession)
  const archivedIds = useAppStore(state => state.archivedSessionIds)
  const workspaces = useAppStore(state => state.workspaces)
  const busy = useAppStore(state => state.busyAction)
  const error = useAppStore(state => state.error)
  const connected = useAppStore(state => state.connection.phase === 'connected')
  const refreshWorkspaces = useAppStore(state => state.refreshWorkspaces)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const insets = useSafeAreaInsets()
  const groups = useMemo(() => {
    const archived = new Set(archivedIds)
    const assigned = new Set(workspaces.flatMap(workspace => workspace.sessionIds))
    const grouped = workspaces.map(workspace => ({
      key: `workspace:${workspace.backend ?? 'harness'}:${workspace.workspaceId}`,
      title: workspace.title,
      backend: workspace.backend ?? 'harness',
      detail: workspaceParentPath(workspace.path),
      sessions: getVisibleWorkspaceSessions(workspace, sessions, archivedIds).sort((a, b) => b.updatedAt - a.updatedAt),
    })).filter(group => group.sessions.length > 0)
    const unassigned = sessions.filter(session => !archived.has(session.sessionId) && !assigned.has(session.sessionId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    if (unassigned.length > 0) grouped.push({ key: 'unassigned', title: strings.chat.otherHostSessions, backend: 'harness', detail: '', sessions: unassigned })
    const running = sessions.filter(session => !archived.has(session.sessionId) && (lifecycles[session.sessionId]?.running ?? session.running))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    grouped.unshift({ key: 'running', title: strings.chat.runningHostSessions, backend: 'harness', detail: '', sessions: running })
    return grouped
  }, [sessions, archivedIds, workspaces, lifecycles, strings])
  const sections = groups.map(group => {
    const expanded = expandedGroups[group.key] ?? (group.key === 'running' || group.sessions.some(session => session.sessionId === selected?.sessionId))
    return { ...group, expanded, data: expanded ? group.sessions : [] }
  })
  const refresh = async () => {
    if (refreshing || busy !== undefined || !connected) return
    setRefreshing(true)
    try { await refreshWorkspaces() } finally { setRefreshing(false) }
  }

  return <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={strings.common.close} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.drawer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <IconButton label={strings.app.backToDevices} icon={ArrowLeft} onPress={onBack} />
          <Text style={styles.title} numberOfLines={1}>{device?.name}</Text>
          <IconButton label={strings.common.refresh} icon={RefreshCw} onPress={() => void refresh()} disabled={refreshing || busy !== undefined || !connected} />
        </View>
        {error !== undefined && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        <SectionList
          sections={sections}
          stickySectionHeadersEnabled={false}
          keyExtractor={session => session.sessionId}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          renderSectionFooter={({ section }) => section.key === 'running' && section.expanded && section.sessions.length === 0
            ? <Text style={styles.emptyRunning}>{strings.chat.noRunningHostSessions}</Text>
            : null}
          renderSectionHeader={({ section }) => <Pressable
            accessibilityRole="button"
            accessibilityLabel={section.expanded ? strings.workspaces.collapseWorkspace(section.title) : strings.workspaces.expandWorkspace(section.title)}
            accessibilityState={{ expanded: section.expanded }}
            onPress={() => setExpandedGroups(current => ({ ...current, [section.key]: !section.expanded }))}
            style={({ pressed }) => [styles.group, pressed && styles.pressedRow]}
          >
            <View style={styles.workspaceIcon}>
              {section.key === 'running'
                ? <Activity size={18} color={colors.primary} />
                : section.backend === 'codex'
                ? <Code2 size={18} color={colors.primary} />
                : section.backend !== 'harness'
                  ? <Sparkles size={18} color={colors.primary} />
                  : section.expanded ? <FolderOpen size={18} color={colors.primary} /> : <Folder size={18} color={colors.primary} />}
            </View>
            <View style={styles.copy}>
              <View style={styles.groupTitleRow}>
                <Text style={styles.groupTitle} numberOfLines={1}>{section.title}</Text>
                <Text style={styles.count}>{section.detail.length > 0 ? `${strings.workspaces[section.backend === 'harness' ? 'dsh' : section.backend]} · ` : ''}{section.sessions.length}</Text>
              </View>
              {section.detail.length > 0 && <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">{section.detail}</Text>}
            </View>
            {section.expanded ? <ChevronDown size={18} color={colors.muted} /> : <ChevronRight size={18} color={colors.muted} />}
            <View pointerEvents="none" style={styles.rowSeparator} />
          </Pressable>}
          renderItem={({ item }) => {
            const active = item.sessionId === selected?.sessionId
            const running = lifecycles[item.sessionId]?.running ?? item.running
            const disabled = busy !== undefined || refreshing || !connected
            return <View><Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => { if (active) onClose(); else void onSelect(item) }}
              style={({ pressed }) => [styles.row, active && styles.activeRow, pressed && styles.pressedRow]}
            >
              <View style={styles.sessionIcon}>
                {running
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <MessageSquare size={16} color={active ? colors.primary : colors.muted} />}
              </View>
              <View style={styles.copy}>
                <Text style={[styles.sessionTitle, active && styles.activeTitle]} numberOfLines={1}>{resolveSessionDisplayTitle(item) ?? strings.sessions.untitled}</Text>
              </View>
              {running && <Text style={styles.runningStatus} numberOfLines={1}>{strings.status.running}</Text>}
              {busy === `session:${item.sessionId}`
                ? <ActivityIndicator size="small" color={colors.primary} />
                : active ? <Check size={16} color={colors.primary} /> : null}
            </Pressable><View pointerEvents="none" style={styles.rowSeparator} /></View>
          }}
        />
      </View>
    </View>
  </Modal>
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.scrim },
  drawer: { flex: 1, width: '88%', maxWidth: 420, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  title: { ...type.heading, color: colors.ink, flex: 1, minWidth: 0, textAlign: 'center', paddingHorizontal: spacing.xs },
  list: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  group: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, minHeight: 72 },
  workspaceIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  groupTitle: { ...type.heading, color: colors.ink, flex: 1 },
  count: { ...type.caption, color: colors.muted },
  rowSeparator: { position: 'absolute', bottom: 0, left: spacing.xs + 40 + spacing.xs, right: spacing.xs, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs, minHeight: 48, borderRadius: radius.sm },
  sessionIcon: { width: 40, alignItems: 'center', justifyContent: 'center' },
  activeRow: { backgroundColor: colors.primarySoft },
  pressedRow: { backgroundColor: colors.surfaceStrong },
  copy: { flex: 1, minWidth: 0 },
  sessionTitle: { ...type.caption, fontWeight: '400', color: colors.ink },
  activeTitle: { color: colors.primary },
  runningStatus: { ...type.caption, color: colors.primary },
  meta: { ...type.caption, color: colors.muted, marginTop: 2, fontFamily: 'monospace', writingDirection: 'ltr' },
  emptyRunning: { ...type.caption, color: colors.muted, paddingVertical: spacing.sm, paddingLeft: spacing.xs + 40 + spacing.xs, paddingRight: spacing.xs },
  error: { ...type.small, color: colors.danger, padding: spacing.sm },
})
