import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Pencil, Copy, Trash2, Square, ChartNoAxesColumn, CalendarDays, Bot, LayoutGrid, X, ChevronRight, CirclePlus, MoreVertical, RefreshCw, Search, Star, Users } from 'lucide-react-native'
import { strings as s } from '../locales/i18n'
import { object, objects, text, type BotState, type BotRemoteClient } from '../services/bot-catalog'
import { requireBotClient, useAppStore } from '../state/store'
import type { RemoteSession } from '../types'
import { BlurHeaderFrame, Button, EmptyState, IconButton, Screen, TopBar } from '../ui/components'
import { KeyboardInset } from '../ui/keyboard-inset'
import { useTheme } from '../ui/theme-context'
import { useThemedStyles } from '../ui/use-themed-styles'
import { ModalSurface } from './chat/modal'
import { BotEditor, type BotPerform } from './bot/editor'
import { BotConversation } from './bot/conversation'
import { createBotStyles } from './bot/styles'
import { BotAction } from './bot/controls'
import { BotAvatar } from './bot/avatar'

export function BotModeScreen({ selectedId, onSelect, onAgentMode, onBack, onDeviceInfo, onMore }: {
  selectedId?: string; onSelect: (id?: string) => void; onAgentMode: () => void; onBack?: () => void; onDeviceInfo: () => void; onMore: () => void
}) {
  const styles = useThemedStyles(createBotStyles)
  const { colors } = useTheme()
  const device = useAppStore(store => store.selectedDevice)
  const openSession = useAppStore(store => store.openSession)
  const [client] = useState<{ value?: BotRemoteClient; error?: string }>(() => {
    try { return { value: requireBotClient() } } catch (error) { return { error: error instanceof Error ? error.message : s.bots.unavailable } }
  })
  const [state, setState] = useState<BotState>()
  const [error, setError] = useState<string | undefined>(client.error)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [openError, setOpenError] = useState<string>()
  const [openAttempt, setOpenAttempt] = useState(0)
  const sessionOwner = useRef<string | undefined>(undefined)
  const [active, setActive] = useState(AppState.currentState === 'active')
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<RemoteSession>()
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ kind: 'bot' | 'room'; id?: string }>()
  const [details, setDetails] = useState(false)
  const [report, setReport] = useState<{ title: string; value: unknown }>()
  const alive = useRef(true)
  const locked = useRef(false)
  const revision = useRef(0)
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const controller = useRef(new AbortController())
  useEffect(() => {
    alive.current = true
    const subscription = AppState.addEventListener('change', next => setActive(next === 'active'))
    return () => { alive.current = false; controller.current.abort(); revision.current++; subscription.remove() }
  }, [])
  const refresh = useCallback(async (force = false) => {
    if (!client.value || (locked.current && !force)) { setLoading(false); return }
    const current = ++revision.current
    try {
      const next = await client.value.state(controller.current.signal, selectedRef.current === undefined)
      if (alive.current && current === revision.current) { setState(next); setError(undefined) }
    } catch (reason) { if (alive.current && current === revision.current) setError(reason instanceof Error ? reason.message : s.bots.unavailable) }
    finally { if (alive.current && current === revision.current) setLoading(false) }
  }, [client])
  useEffect(() => {
    if (!active) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => { await refresh(); if (!disposed) timer = setTimeout(() => void tick(), 3000) }
    void tick()
    return () => { disposed = true; clearTimeout(timer) }
  }, [refresh, active])
  const perform: BotPerform = async (operation, payload) => {
    if (!client.value || locked.current || !active) return { ok: false }
    locked.current = true
    ++revision.current
    setBusy(true); setActionError(undefined)
    let result: { ok: boolean; value?: unknown } = { ok: false }
    try {
      const value = await client.value.call(operation, payload ?? null, controller.current.signal)
      if (!alive.current) return { ok: false }
      result = { ok: true, value }
      // Mutations are never replayed, including when the following refresh fails.
      if (operation === 'create-bot' || operation === 'duplicate-bot' || operation === 'create-room') {
        const id = text(object(value).id)
        if (id) onSelect(id)
      }
      if (operation === 'delete-bot' || operation === 'delete-room') { onSelect(undefined); setSession(undefined); setDetails(false) }
      if (operation === 'usage' || operation === 'schedules') setReport({ title: operation === 'usage' ? s.bots.usage : s.bots.schedules, value })
    } catch (reason) {
      if (alive.current) setActionError(reason instanceof Error ? reason.message : s.bots.unknownOutcome)
    } finally {
      if (alive.current) { await refresh(true); if (alive.current) setBusy(false) }
      locked.current = false
    }
    return result
  }
  const bot = state?.bots.find(entry => entry.id === selectedId)
  const room = state?.rooms.find(entry => entry.id === selectedId)
  const targetSessionId = bot?.sessionId ?? room?.id
  useEffect(() => {
    setOpenError(undefined)
    if (!client.value || !selectedId || !targetSessionId) { setSession(undefined); return }
    let cancelled = false
    const control = new AbortController()
    if (sessionOwner.current !== selectedId) setSession(undefined)
    void (async () => {
      try {
        const resolved = await client.value!.resolveSession(selectedId, control.signal)
        if (cancelled) return
        if (await openSession(resolved.session) && !cancelled && selectedRef.current === selectedId) { sessionOwner.current = selectedId; setSession(resolved.session) }
        else if (!cancelled) setOpenError(useAppStore.getState().error ?? s.bots.sessionUnavailable)
      } catch (reason) { if (!cancelled) setOpenError(reason instanceof Error ? reason.message : s.bots.unavailable) }
    })()
    return () => { cancelled = true; control.abort() }
  }, [client, selectedId, targetSessionId, openSession, openAttempt])
  useEffect(() => { setActionError(undefined); setDetails(false) }, [selectedId])
  const visibleError = actionError ?? openError ?? error
  const retry = () => { setError(undefined); setActionError(undefined); setOpenError(undefined); setOpenAttempt(value => value + 1); void refresh() }
  const remove = () => Alert.alert(s.bots.delete, s.bots.deleteHint, [
    { text: s.bots.cancel, style: 'cancel' },
    { text: s.bots.delete, style: 'destructive', onPress: () => void perform(bot ? 'delete-bot' : 'delete-room', { id: selectedId }) },
  ])
  const query = search.trim().toLocaleLowerCase()
  const filteredBots = state?.bots.filter(entry => `${entry.name} ${entry.role}`.toLocaleLowerCase().includes(query)) ?? []
  const filteredRooms = state?.rooms.filter(entry => entry.name.toLocaleLowerCase().includes(query)) ?? []
  const status = (id: string) => state?.activity[id] === 'alert' ? s.bots.waiting : state?.activity[id] ? s.bots.busy : s.bots.idle
  const header = <TopBar title={bot?.name ?? room?.name ?? device?.name ?? s.bots.title} titleLines={1} centered={80}
    titleAccessory={null}
    onBack={selectedId ? () => onSelect(undefined) : onBack} onTitlePress={selectedId ? () => setDetails(true) : onDeviceInfo}
    action={<><IconButton dense label={s.workspaces.title} icon={LayoutGrid} onPress={onAgentMode} /><IconButton dense label={selectedId ? s.bots.details : s.settings.more} icon={MoreVertical} onPress={() => selectedId ? setDetails(true) : onMore()} /></>} />
  return <KeyboardInset><View style={styles.flex}><BlurHeaderFrame header={header} inset={selectedId !== undefined}>
    {selectedId === undefined ? <Screen refreshing={loading} onRefresh={() => void refresh()}>
      <View style={styles.rosterHeader}><View style={styles.row}><Text style={styles.rosterTitle}>DS Bot</Text><View style={styles.grow} /><IconButton label={s.bots.refresh} icon={RefreshCw} onPress={() => void refresh()} disabled={busy} /></View>
        <View style={styles.searchBox}><Search size={18} color={colors.muted} /><TextInput style={styles.searchInput} accessibilityLabel={s.bots.search} placeholder={s.bots.search} placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} /></View>
      </View>
      {visibleError && <Text accessibilityRole="alert" style={styles.error}>{visibleError}</Text>}
      {state?.readOnly && <Text style={styles.muted}>{s.bots.readOnly}: {state.readOnly}</Text>}
      {loading && !state && <ActivityIndicator color={colors.primary} />}
      {!loading && !state && <EmptyState icon={Bot} title={s.bots.unavailable} body={visibleError ?? s.bots.unavailable} action={<Button label={s.bots.retry} onPress={retry} />} />}
      {state && state.bots.length === 0 && <EmptyState icon={Bot} title={s.bots.empty} body={s.bots.emptyHint} action={<Button label={s.bots.newBot} disabled={busy || !!state.readOnly} onPress={() => setEditor({ kind: 'bot' })} />} />}
      {filteredBots.some(entry => entry.main) && <View style={styles.mainBots}>{filteredBots.filter(entry => entry.main).map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`${entry.name}, ${s.bots.main}`} style={({ pressed }) => [styles.rosterRow, styles.mainBotRow, pressed && styles.rosterPressed]} onPress={() => onSelect(entry.id)}>
        <BotAvatar bot={entry} size={48} /><View style={styles.grow}><View style={styles.row}><Text numberOfLines={1} style={[styles.mainBotName, { flexShrink: 1 }]}>{entry.name}</Text><Star size={12} color={colors.muted} /></View><Text numberOfLines={1} style={styles.rosterSubtitle}>{entry.preview || entry.role}</Text></View><ChevronRight color={colors.subtle} size={16} />
      </Pressable>)}</View>}
      {state && <View style={styles.rosterSection}><View style={styles.row}><Text style={styles.sectionLabel}>{s.bots.all}</Text><View style={styles.grow} /><IconButton dense label={s.bots.newBot} icon={CirclePlus} disabled={busy || !!state.readOnly} onPress={() => setEditor({ kind: 'bot' })} /></View>{filteredBots.filter(entry => !entry.main).map(entry => <Pressable key={entry.id} accessibilityRole="button" style={({ pressed }) => [styles.rosterRow, pressed && styles.rosterPressed]} onPress={() => onSelect(entry.id)}>
        <BotAvatar bot={entry} /><View style={styles.grow}><Text style={styles.rosterName}>{entry.name}</Text><Text numberOfLines={1} style={styles.rosterSubtitle}>{entry.preview || entry.role || status(entry.id)}</Text></View><ChevronRight color={colors.subtle} size={16} />
      </Pressable>)}</View>}
      {state && <View style={styles.rosterSection}><View style={styles.row}><Text style={styles.sectionLabel}>{s.bots.groups}</Text><View style={styles.grow} /><IconButton dense label={s.bots.newGroup} icon={CirclePlus} disabled={busy || !!state.readOnly || state.bots.length < 2} onPress={() => setEditor({ kind: 'room' })} /></View>{filteredRooms.map(entry => <Pressable key={entry.id} accessibilityRole="button" style={({ pressed }) => [styles.rosterRow, pressed && styles.rosterPressed]} onPress={() => onSelect(entry.id)}>
        <View style={styles.groupAvatar}>{entry.members.slice(0, 3).map((id, index) => { const member = state.bots.find(bot => bot.id === id); return member ? <View key={id} style={{ position: 'absolute', left: index * 9, top: index % 2 * 12 }}><BotAvatar bot={member} size={27} /></View> : null })}{entry.members.length === 0 && <Users color={colors.muted} size={28} />}</View>
        <View style={styles.grow}><Text style={styles.rosterName}>{entry.name}</Text><Text numberOfLines={1} style={styles.rosterSubtitle}>{entry.preview || entry.members.map(id => state.bots.find(member => member.id === id)?.name ?? id).join(' · ')}</Text></View><ChevronRight color={colors.subtle} size={16} />
      </Pressable>)}{filteredRooms.length === 0 && <Text style={styles.rosterSubtitle}>{s.bots.none}</Text>}</View>}
      {state && <View style={styles.rosterFooter}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={({ pressed }) => [styles.footerAction, pressed && styles.rosterPressed, busy && styles.footerDisabled]} onPress={() => void perform('usage', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}><ChartNoAxesColumn size={18} color={colors.muted} /><Text style={styles.footerLabel}>{s.bots.usage}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={({ pressed }) => [styles.footerAction, pressed && styles.rosterPressed, busy && styles.footerDisabled]} onPress={() => void perform('schedules')}><CalendarDays size={18} color={colors.muted} /><Text style={styles.footerLabel}>{s.bots.schedules}</Text></Pressable>
      </View>}
    </Screen> : <View style={styles.flex}>
      {visibleError && <View><Text accessibilityRole="alert" style={styles.error}>{visibleError}</Text><Button label={s.bots.retry} onPress={retry} /></View>}
      {session && state && client.value ? <BotConversation key={selectedId} bot={bot} room={room} state={state} session={session} client={client.value} busy={busy} active={active} perform={perform} onSelectBot={onSelect} /> : loading || (targetSessionId && !openError) ? <ActivityIndicator color={colors.primary} /> : <EmptyState icon={Bot} title={s.bots.sessionUnavailable} body={s.bots.sessionUnavailable} action={<Button label={s.bots.back} onPress={() => onSelect(undefined)} />} />}
    </View>}
  </BlurHeaderFrame>
    {editor && state && client.value && <BotEditor key={`${editor.kind}:${editor.id ?? 'new'}`} kind={editor.kind} bot={state.bots.find(entry => entry.id === editor.id)} room={state.rooms.find(entry => entry.id === editor.id)} state={state} client={client.value} busy={busy} error={visibleError} perform={perform} onClose={() => setEditor(undefined)} />}
    {details && (bot || room) && <Modal transparent visible animationType="slide" onRequestClose={() => setDetails(false)}><ModalSurface onClose={() => setDetails(false)}><ScrollView contentContainerStyle={styles.detailsContent}>
      <View style={styles.detailsHeader}>
        {bot ? <BotAvatar bot={bot} size={44} /> : <Users size={32} color={colors.muted} />}
        <View style={styles.grow}><Text style={styles.heading}>{bot?.name ?? room?.name}</Text>{!!(bot?.role ?? room?.notice) && <Text numberOfLines={2} style={styles.muted}>{bot?.role ?? room?.notice}</Text>}</View>
        <IconButton label={s.common.close} icon={X} onPress={() => setDetails(false)} />
      </View>
      {visibleError && <Text style={styles.error}>{visibleError}</Text>}
      <View style={styles.detailActions}>
        <BotAction label={s.bots.edit} icon={Pencil} disabled={busy || !!state?.readOnly} onPress={() => { setDetails(false); setEditor({ kind: bot ? 'bot' : 'room', id: selectedId }) }} />
        {bot && <><BotAction label={bot.main ? s.bots.removeMain : s.bots.makeMain} icon={Star} disabled={busy || !!state?.readOnly} onPress={() => void perform('set-main', { id: bot.id, main: !bot.main })} /><BotAction label={s.bots.duplicate} icon={Copy} disabled={busy || !!state?.readOnly} onPress={() => void perform('duplicate-bot', { id: bot.id })} /></>}
      </View>
      {room && room.members.map(id => <View key={id} style={styles.row}><Text style={[styles.body, styles.grow]}>{state?.bots.find(entry => entry.id === id)?.name ?? id}</Text><IconButton label={s.bots.stop} icon={Square} disabled={busy || !!state?.readOnly} onPress={() => void perform('stop-member-work', { roomId: room.id, botId: id })} /></View>)}
      <View style={styles.detailDivider} />
      <BotAction label={s.bots.delete} icon={Trash2} danger disabled={busy || !!state?.readOnly} onPress={remove} />
      <Text style={styles.detailHint}>{s.bots.hostSettings}</Text>
    </ScrollView></ModalSurface></Modal>}
    {report && <Modal transparent visible animationType="slide" onRequestClose={() => setReport(undefined)}><ModalSurface onClose={() => setReport(undefined)}><ScrollView contentContainerStyle={styles.sheetContent}><View style={styles.row}><Text style={[styles.heading, styles.grow]}>{report.title}</Text><IconButton label={s.common.close} icon={X} onPress={() => setReport(undefined)} /></View><Report kind={report.title === s.bots.usage ? 'usage' : 'schedules'} state={state} value={report.value} /></ScrollView></ModalSurface></Modal>}
  </View></KeyboardInset>
}
function Report({ value, kind, state }: { value: unknown; kind: 'usage' | 'schedules'; state?: BotState }) {
  const styles = useThemedStyles(createBotStyles)
  const data = object(value)
  if (kind === 'schedules') {
    const tasks = objects(data.tasks)
    return <View style={styles.section}>{tasks.length === 0 && <Text style={styles.muted}>{s.bots.none}</Text>}{tasks.map((task, i) => <View key={i} style={styles.card}>
      <Text style={styles.heading}>{text(task.title)}</Text><Text style={styles.muted}>{state?.bots.find(bot => bot.id === task.botId)?.name ?? state?.rooms.find(room => room.id === task.roomId)?.name}</Text>
      <Text style={styles.body}>{text(task.prompt)}</Text><Text style={styles.muted}>{text(task.scheduledAt) || text(task.time)} {text(task.timeZone)}</Text>
    </View>)}</View>
  }
  const rows = Array.isArray(data.rows) ? data.rows.filter(Array.isArray) : []
  const owners = objects(data.owners)
  return <View style={styles.section}>{rows.length === 0 && <Text style={styles.muted}>{s.bots.none}</Text>}{owners.map((owner, index) => {
    const own = rows.filter(row => row[1] === index)
    const sum = (column: number) => own.reduce((total, row) => total + (typeof row[column] === 'number' ? row[column] : 0), 0)
    return <View key={index} style={styles.card}><Text style={styles.heading}>{text(owner.name) || s.bots.title}</Text><Text style={styles.body}>{s.bots.inputTokens}: {sum(4).toLocaleString()} · {s.bots.outputTokens}: {sum(7).toLocaleString()}</Text><Text style={styles.muted}>{s.bots.calls}: {sum(8).toLocaleString()}</Text></View>
  })}</View>
}
