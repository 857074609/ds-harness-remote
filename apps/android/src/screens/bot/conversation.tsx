import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Text, TextInput, View } from 'react-native'
import { ArrowUp, Square } from 'lucide-react-native'
import { strings as s } from '../../locales/i18n'
import { object, objects, text, type BotEntry, type BotRoom, type BotState, type BotRemoteClient, type BotObject } from '../../services/bot-catalog'
import { useAppStore } from '../../state/store'
import type { ChatItem, RemoteSession } from '../../types'
import { Button, IconButton } from '../../ui/components'
import { MarkdownLinkProvider, NativeMarkdown } from '../../ui/markdown'
import { useTheme } from '../../ui/theme-context'
import { useThemedStyles } from '../../ui/use-themed-styles'
import { ChatActivityGroup, ChatItemView } from '../chat/messages'
import { chatSections } from '../../state/message-helpers'
import { processSegments } from '../chat-process'
import { BotQuestion, BotViewCard } from './cards'
import type { BotPerform } from './editor'
import { createBotStyles } from './styles'
import { linkBotMentions, botMentionTarget } from './mentions'

const EMPTY: ChatItem[] = []
type BotChatRow = { kind: 'item'; key: string; item: ChatItem } | { kind: 'activity'; key: string; items: ChatItem[]; closed: boolean }
export function BotConversation({ bot, room, state, client, session, busy, active, perform, onSelectBot }: {
  bot?: BotEntry; room?: BotRoom; state: BotState; client: BotRemoteClient; session: RemoteSession
  busy: boolean; active: boolean; perform: BotPerform; onSelectBot: (id: string) => void
}) {
  const transformText = useCallback((value: string) => linkBotMentions(value, state.bots, bot?.id), [state.bots, bot?.id])
  const onLinkPress = useCallback((href: string) => {
    const target = botMentionTarget(href, state.bots)
    if (target !== undefined && target !== bot?.id) onSelectBot(target)
  }, [state.bots, bot?.id, onSelectBot])
  const styles = useThemedStyles(createBotStyles)
  const { colors } = useTheme()
  const messages = useAppStore(store => store.messages[session.sessionId] ?? EMPTY)
  const selected = useAppStore(store => store.selectedSession)
  const storeBusy = useAppStore(store => store.busyAction)
  const hasMore = useAppStore(store => store.historyHasMore)
  const olderLoading = useAppStore(store => store.historyLoadingOlder)
  const loadOlder = useAppStore(store => store.loadOlderHistory)
  const respondApproval = useAppStore(store => store.respondApproval)
  const respondQuestion = useAppStore(store => store.respondQuestion)
  const stopSession = useAppStore(store => store.stopSession)
  const [draft, setDraft] = useState('')
  const [progress, setProgress] = useState<BotObject[]>([])
  const [earlier, setEarlier] = useState<BotObject[]>([])
  const [cursor, setCursor] = useState<unknown>(undefined)
  const [olderBusy, setOlderBusy] = useState(false)
  const [error, setError] = useState<string>()
  const mounted = useRef(true)
  const request = useRef(new AbortController())
  const list = useRef<FlatList<BotChatRow>>(null)
  const atEnd = useRef(true)
  const scrolling = useRef(false)
  const scrollFrame = useRef<number | undefined>(undefined)
  const followEnd = () => {
    if (!atEnd.current) return
    if (scrollFrame.current !== undefined) cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = requestAnimationFrame(() => { if (atEnd.current) list.current?.scrollToEnd({ animated: false }) })
  }
  useEffect(() => () => { if (scrollFrame.current !== undefined) cancelAnimationFrame(scrollFrame.current) }, [])
  const ready = selected?.sessionId === session.sessionId
  const disabled = busy || !active || !ready || (bot !== undefined && bot.sessionId !== session.sessionId) || state.readOnly !== undefined
  useEffect(() => { setEarlier([]); setCursor(undefined); setProgress([]); atEnd.current = true; scrolling.current = false; followEnd() }, [session.sessionId])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current.abort() } }, [])
  useEffect(() => {
    if (room === undefined || !active) return
    const control = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const value = await client.call('room-progress', { roomId: room.id }, control.signal)
        if (!control.signal.aborted) setProgress(objects(value).flatMap(entry => objects(entry.replies)))
      } catch { /* The parent state refresh reports connection and Host errors. */ }
      if (!control.signal.aborted) timer = setTimeout(() => void tick(), 2000)
    }
    void tick()
    return () => { control.abort(); clearTimeout(timer) }
  }, [client, room?.id, active])
  const send = async () => {
    const submitted = draft.trim()
    if (!submitted || disabled) return
    atEnd.current = true
    followEnd()
    const result = await perform('send', { sessionId: bot?.id ?? room!.id, text: submitted })
    if (mounted.current && result.ok) setDraft(current => current.trim() === submitted ? '' : current)
  }
  const earlierPage = async () => {
    if (olderBusy || bot === undefined || cursor === null) return
    atEnd.current = false
    setOlderBusy(true)
    setError(undefined)
    try {
      const value = object(await client.call('earlier', { sessionId: session.sessionId, ...(cursor === undefined ? {} : { cursor }) }, request.current.signal))
      if (!mounted.current) return
      setEarlier(current => [...objects(value.items), ...current])
      setCursor(value.cursor ?? null)
    } catch { if (mounted.current) setError(s.bots.earlierUnavailable) }
    finally { if (mounted.current) setOlderBusy(false) }
  }
  const question = object(state.questions[session.sessionId])
  const view = object(state.views[session.sessionId])
  const approvals = state.approvals.filter(entry => entry.answerable === true && (room ? entry.roomId === room.id : entry.sessionId === session.sessionId))
  const hidden = state.exchangeTurns[session.sessionId]
  const hiddenTurns = new Set(Array.isArray(hidden) ? hidden.map(String) : [])
  const visible = messages.filter(item => item.kind === 'approval' || item.kind === 'question'
    || !(item.turn !== undefined && hiddenTurns.has(item.turn)))
  const isDisplayTool = (item: ChatItem): boolean => {
    if (item.kind !== 'tool') return false
    if (item.toolKey === 'show_view') return true
    if (room && item.state === 'finished') {
      try { return Array.isArray(object(JSON.parse(item.resultDetail?.text ?? 'null')).replies) } catch { return false }
    }
    return false
  }
  const rows: BotChatRow[] = chatSections(visible).flatMap((section): BotChatRow[] => {
    if (section.kind === 'item') {
      // Native system context/receipts can arrive without a turn identifier.
      // They still belong in a disclosure rather than the visible chat body.
      if (section.item.kind === 'message' && section.item.role === 'system') {
        return [{ kind: 'activity', key: `activity:${section.item.id}`, items: [section.item], closed: true }]
      }
      return [section]
    }
    const segments = processSegments(section.items)
    const closed = section.items.some(item => item.turnEnd !== undefined) || !selected?.running
    return segments.flatMap((segment, index): BotChatRow[] => {
      if (segment.kind === 'response') return [{ kind: 'item', key: segment.key, item: segment.item }]
      // Cards and group replies stay visible; only intermediate activity folds.
      const result: BotChatRow[] = []
      let pending: ChatItem[] = []
      const flush = () => { if (pending.length) result.push({ kind: 'activity', key: `activity:${pending[0]!.id}`, items: pending, closed: closed || index < segments.length - 1 }); pending = [] }
      for (const item of segment.items) {
        if (isDisplayTool(item) || item.kind === 'approval' || item.kind === 'question') { flush(); result.push({ kind: 'item', key: item.id, item }) }
        else pending.push(item)
      }
      flush()
      return result
    })
  })
  const onApproval: Parameters<typeof ChatItemView>[0]['onApproval'] = async (...args) => { if (!disabled) await respondApproval(...args) }
  const onQuestion: Parameters<typeof ChatItemView>[0]['onQuestion'] = async (...args) => { if (!disabled) await respondQuestion(...args) }
  const render = (item: ChatItem) => {
    if (item.kind === 'tool' && item.toolKey === 'show_view') {
      // Settled and display-only views live in tool history; only the current
      // pending view has authority to submit, and is rendered in the footer.
      if (view.callId === item.id) return null
      try {
        const args = object(JSON.parse(item.arguments ?? item.callDetail?.text ?? 'null'))
        if (args.view !== undefined) return <BotViewCard pending={args} busy reply={() => {}} />
      } catch { /* Retain the native tool row if its args are unavailable. */ }
    }
    if (room && item.kind === 'tool' && item.state === 'finished') {
      try {
        const result = object(JSON.parse(item.resultDetail?.text ?? 'null'))
        if (Array.isArray(result.replies)) return <Replies rows={objects(result.replies)} />
      } catch { /* Ordinary tool output uses the existing native renderer. */ }
    }
    return <ChatItemView item={item} compact={false} busyAction={storeBusy} onApproval={onApproval} onQuestion={onQuestion} />
  }
  return <MarkdownLinkProvider onLinkPress={onLinkPress} transformText={transformText}><View style={styles.flex}>
    <FlatList ref={list} data={ready ? rows : []} keyExtractor={item => item.key} renderItem={({ item, index }) => <View style={{ paddingTop: index > 0 && rows[index - 1]?.kind !== 'activity' ? 8 : 0 }}>{item.kind === 'activity' ? <ChatActivityGroup dense items={item.items} closed={item.closed} busyAction={storeBusy} onApproval={onApproval} onQuestion={onQuestion} /> : render(item.item)}</View>}
      contentContainerStyle={styles.conversation} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      onLayout={followEnd}
      onScrollBeginDrag={() => { scrolling.current = true; atEnd.current = false }}
      onScrollEndDrag={() => { scrolling.current = false }}
      onMomentumScrollBegin={() => { scrolling.current = true }}
      onMomentumScrollEnd={() => { scrolling.current = false }}
      onScroll={event => { if (!scrolling.current) return; const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; atEnd.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 90 }}
      scrollEventThrottle={32} onContentSizeChange={followEnd}
      ListEmptyComponent={<Text style={styles.muted}>{s.bots.noMessages}</Text>}
      ListHeaderComponent={<View style={styles.section}>
        {bot && !hasMore && cursor !== null && <Button variant="quiet" label={s.bots.loadOlder} disabled={olderBusy} onPress={() => void earlierPage()} />}
        {earlier.map((entry, i) => <View key={i} style={styles.card}><Text style={styles.muted}>{entry.kind === 'user' ? s.bots.yourAnswer : bot?.name}</Text><NativeMarkdown text={text(entry.text)} /></View>)}
        {hasMore && <Button variant="quiet" label={s.bots.loadOlder} disabled={olderLoading || !ready} onPress={() => { atEnd.current = false; void loadOlder() }} />}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>}
      ListFooterComponent={<View style={styles.section}>
        {room && progress.length > 0 && <Replies rows={progress} />}
        {approvals.map(approval => <View key={text(approval.id)} style={styles.card}><Text style={styles.heading}>{state.bots.find(entry => entry.id === approval.botId)?.name} · {text(approval.tool)}</Text><Text style={styles.body}>{text(approval.reason)}</Text><View style={styles.actions}><Button variant="secondary" label={s.bots.reject} disabled={disabled} onPress={() => void perform('approval-answer', { id: approval.id, choice: 'reject' })} /><Button label={s.bots.allow} disabled={disabled} onPress={() => void perform('approval-answer', { id: approval.id, choice: 'allow' })} /></View></View>)}
        {text(question.id) !== '' && <BotQuestion key={text(question.id)} question={question} busy={disabled} answer={answer => void perform('answer-question', { sessionId: session.sessionId, questionId: question.id, answer })} dismiss={() => void perform('dismiss-question', { sessionId: session.sessionId })} />}
        {text(view.id) !== '' && <BotViewCard key={text(view.id)} pending={view} busy={disabled} reply={(action, values) => void perform('view-reply', { sessionId: session.sessionId, viewId: view.id, action, values })} />}
      </View>} />
    <View style={styles.composer}>
      <TextInput accessibilityLabel={room ? s.bots.groupMessage : s.bots.message} placeholder={room ? s.bots.groupMessage : s.bots.message} placeholderTextColor={colors.muted} style={[styles.input, styles.draft]} multiline editable={!disabled} value={draft} onChangeText={setDraft} />
      {selected?.running && <IconButton label={s.bots.stop} icon={Square} disabled={disabled} onPress={() => void stopSession()} />}
      {busy ? <ActivityIndicator color={colors.primary} /> : <IconButton label={s.bots.send} icon={ArrowUp} tint={colors.primary} disabled={disabled || !draft.trim()} onPress={() => void send()} />}
    </View>
  </View></MarkdownLinkProvider>
}
function Replies({ rows }: { rows: BotObject[] }) {
  const styles = useThemedStyles(createBotStyles)
  return <View style={styles.section}>{rows.map((reply, i) => <View key={i} style={styles.card}><Text style={styles.heading}>{text(reply.name) || (reply.kind === 'user' ? s.bots.yourAnswer : s.bots.title)}</Text><NativeMarkdown text={text(reply.text) || text(reply.kind)} /></View>)}</View>
}
