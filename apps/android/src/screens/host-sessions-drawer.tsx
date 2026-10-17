import { useEffect, useMemo, useState } from 'react'
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
import { loadHostSessionsDrawerGroups, saveHostSessionsDrawerGroup } from '../services/storage'

const SESSION_PAGE_SIZE = 3

export function HostSessionsDrawer({ onBack, onClose, onSelect }: {
  onBack: () => void
  onClose: () => void
  onSelect: (session: RemoteSession) => Promise<void>
}) {
  // The store's catalog is scoped to selectedDevice and reset when changing hosts.
  const device = useAppStore(state => state.selectedDevice)
  const sessions = useAppStore(state => state.sessions)
  const currentWorkSessionIds = useAppStore(state => state.currentWorkSessionIds)
  const lifecycles = useAppStore(state => state.sessionLifecycles)
  const selected = useAppStore(state => state.selectedSession)
  const archivedIds = useAppStore(state => state.archivedSessionIds)
  const workspaces = useAppStore(state => state.workspaces)
  const busy = useAppStore(state => state.busyAction)
  const error = useAppStore(state => state.error)
  const connected = useAppStore(state => state.connection.phase === 'connected')
  const refreshWorkspaces = useAppStore(state => state.refreshWorkspaces)
  const [refreshing, setRefreshing] = useState(false)
  const [visibleSessionCounts, setVisibleSessionCounts] = useState<Record<string, number>>({})
  const deviceId = device?.deviceId
  const [groupsByDevice, setGroupsByDevice] = useState<Record<string, Record<string, boolean>>>({})
  const [storageErrors, setStorageErrors] = useState<Record<string, boolean>>({})
  const expandedGroups = deviceId === undefined ? {} : groupsByDevice[deviceId] ?? {}
  useEffect(() => {
    if (deviceId === undefined) return
    let cancelled = false
    void loadHostSessionsDrawerGroups(deviceId).then(saved => {
      if (cancelled) return
      // Explicit user choices made while reading take precedence over hydration.
      setGroupsByDevice(current => ({ ...current, [deviceId]: { ...saved, ...current[deviceId] } }))
    }).catch(() => {
      if (!cancelled) setStorageErrors(current => ({ ...current, [deviceId]: true }))
    })
    return () => { cancelled = true }
  }, [deviceId])
  const toggleGroup = (key: string, expanded: boolean) => {
    if (deviceId === undefined) return
    setGroupsByDevice(current => ({ ...current, [deviceId]: { ...current[deviceId], [key]: expanded } }))
    // Keep a failure visible for this open drawer: later successful writes to
    // another group do not imply the failed choice was persisted.
    void saveHostSessionsDrawerGroup(deviceId, key, expanded).catch(() => {
      setStorageErrors(current => ({ ...current, [deviceId]: true }))
    })
  }
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
    const usedIds = new Set(currentWorkSessionIds)
    const knownSessions = selected !== undefined && !sessions.some(session => session.sessionId === selected.sessionId)
      ? [selected, ...sessions] : sessions
    const currentWork = knownSessions.filter(session => !archived.has(session.sessionId) && usedIds.has(session.sessionId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    grouped.unshift({ key: 'current-work', title: strings.chat.currentWorkSessions, backend: 'harness', detail: '', sessions: currentWork })
    return grouped
  }, [sessions, selected, archivedIds, workspaces, currentWorkSessionIds, strings])
  const sections = groups.map(group => {
    const isWorkspace = group.key.startsWith('workspace:')
    const expanded = expandedGroups[group.key] ?? (isWorkspace || group.key === 'current-work' || group.sessions.some(session => session.sessionId === selected?.sessionId))
    const visibleSessions = isWorkspace ? group.sessions.slice(0, visibleSessionCounts[group.key] ?? SESSION_PAGE_SIZE) : group.sessions
    return { ...group, expanded, data: expanded ? visibleSessions : [] }
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
        {deviceId !== undefined && storageErrors[deviceId] && <Text style={styles.error} accessibilityRole="alert">{strings.app.secureStorageUnavailable}</Text>}
        <SectionList
          sections={sections}
          stickySectionHeadersEnabled={false}
          keyExtractor={session => session.sessionId}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          renderSectionFooter={({ section }) => {
            if (!section.expanded) return null
            if (section.key === 'current-work' && section.sessions.length === 0) {
              return <Text style={styles.emptyRunning}>{strings.chat.noCurrentWorkSessions}</Text>
            }
            if (section.data.length === section.sessions.length) return null
            return <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${section.title} · ${strings.workspaces.showMoreSessions}`}
              accessibilityState={{ expanded: false }}
              onPress={() => setVisibleSessionCounts(current => ({ ...current, [section.key]: (current[section.key] ?? SESSION_PAGE_SIZE) + SESSION_PAGE_SIZE }))}
              style={({ pressed }) => [styles.showMoreSessions, pressed && styles.pressedRow]}
            >
              <Text style={styles.showMoreSessionsText}>{strings.workspaces.showMoreSessions}</Text>
              <ChevronDown size={17} color={colors.primary} />
            </Pressable>
          }}
          renderSectionHeader={({ section }) => <Pressable
            accessibilityRole="button"
            accessibilityLabel={section.expanded ? strings.workspaces.collapseWorkspace(section.title) : strings.workspaces.expandWorkspace(section.title)}
            accessibilityState={{ expanded: section.expanded }}
            onPress={() => toggleGroup(section.key, !section.expanded)}
            style={({ pressed }) => [styles.group, pressed && styles.pressedRow]}
          >
            <View style={styles.workspaceIcon}>
              {section.key === 'current-work'
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
          renderItem={({ item, index, section }) => {
            const active = item.sessionId === selected?.sessionId
            const running = lifecycles[item.sessionId]?.running ?? item.running
            const disabled = busy !== undefined || refreshing || !connected
            return <View style={styles.sessionBranch}>
              <View pointerEvents="none" style={[styles.branchTrunk, index === section.data.length - 1 && styles.branchEnd]} />
              <View pointerEvents="none" style={styles.branchLink} />
              <Pressable
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
  group: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, minHeight: 72, marginTop: spacing.sm, backgroundColor: colors.surfaceStrong, borderRadius: radius.md },
  workspaceIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  groupTitle: { ...type.heading, fontWeight: '700', color: colors.ink, flex: 1 },
  count: { ...type.caption, color: colors.muted },
  rowSeparator: { position: 'absolute', bottom: 0, left: spacing.xs + 40 + spacing.xs, right: spacing.xs, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs, minHeight: 48, borderRadius: radius.sm },
  showMoreSessions: { minHeight: 48, paddingVertical: spacing.sm, paddingLeft: spacing.xs + 40 + spacing.xs, paddingRight: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.sm },
  showMoreSessionsText: { ...type.smallStrong, color: colors.primary },
  sessionBranch: { paddingLeft: 32 },
  branchTrunk: { position: 'absolute', left: 24, top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  branchEnd: { bottom: '50%' },
  branchLink: { position: 'absolute', left: 24, top: '50%', width: 12, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  sessionIcon: { width: 28, alignItems: 'center', justifyContent: 'center' },
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
