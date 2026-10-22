import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { strings as s } from '../../locales/i18n'
import { object, objects, text, type BotEntry, type BotRoom, type BotState, type BotOperation, type BotObject, type BotRemoteClient } from '../../services/bot-catalog'
import { ChevronDown, ChevronUp, X } from 'lucide-react-native'
import { Button, IconButton } from '../../ui/components'
import { useTheme } from '../../ui/theme-context'
import { useThemedStyles } from '../../ui/use-themed-styles'
import { ModalSurface } from '../chat/modal'
import { BotChoice } from './controls'
import { createBotStyles } from './styles'

export type BotPerform = (operation: BotOperation, payload?: BotObject) => Promise<{ ok: boolean; value?: unknown }>
export function BotEditor({ kind, bot, room, state, client, busy, error, perform, onClose }: {
  kind: 'bot' | 'room'; bot?: BotEntry; room?: BotRoom; state: BotState; client: BotRemoteClient
  busy: boolean; error?: string; perform: BotPerform; onClose: () => void
}) {
  const styles = useThemedStyles(createBotStyles)
  const { colors } = useTheme()
  const editing = bot !== undefined || room !== undefined
  const [modelPicker, setModelPicker] = useState(false)
  const [name, setName] = useState(bot?.name ?? room?.name ?? '')
  const [role, setRole] = useState(bot?.role ?? '')
  const [instructions, setInstructions] = useState(bot?.instructions ?? '')
  const [notice, setNotice] = useState(room?.notice ?? '')
  const [members, setMembers] = useState(room?.members ?? [])
  const [admin, setAdmin] = useState(room?.admin ?? '')
  const [model, setModel] = useState(bot?.model ?? '')
  const [effort, setEffort] = useState(bot?.effort ?? '')
  const [efforts, setEfforts] = useState<BotObject[]>([])
  useEffect(() => {
    const control = new AbortController()
    setEfforts([])
    if (editing && model) void client.call('efforts', { ref: model }, control.signal).then(value => {
      if (!control.signal.aborted) setEfforts(objects(object(value).efforts).length > 0 ? objects(object(value).efforts) : (Array.isArray(object(value).efforts) ? object(value).efforts as unknown[] : []).filter(item => typeof item === 'string').map(id => ({ id })))
    }).catch(() => {})
    return () => control.abort()
  }, [client, model, editing])
  const field = (label: string, value: string, change: (value: string) => void, multiline = false) => <View style={styles.field}><Text style={styles.heading}>{label}</Text><TextInput accessibilityLabel={label} style={[styles.input, multiline && styles.multiline]} value={value} onChangeText={change} editable={!busy} multiline={multiline} placeholderTextColor={colors.muted} maxLength={multiline ? 12000 : label === s.bots.name && kind === 'bot' ? 40 : 200} /></View>
  const save = async () => {
    const operation = kind === 'bot' ? bot ? 'update-bot' : 'create-bot' : room ? 'update-room' : 'create-room'
    const payload = kind === 'bot'
      ? { ...(bot ? { id: bot.id } : {}), name: name.trim(), ...(bot ? { role, instructions } : {}), ...(bot || model ? { model: model || null } : {}), ...(bot || effort ? { effort } : {}) }
      : { ...(room ? { id: room.id, notice, admin: members.includes(admin) ? admin : members[0] } : {}), name: name.trim(), members }
    if ((await perform(operation, payload)).ok) onClose()
  }
  return <Modal visible transparent animationType="slide" onRequestClose={() => { if (!busy) onClose() }}>
    <ModalSurface onClose={() => { if (!busy) onClose() }}>
      <View style={styles.row}><Text style={[styles.heading, styles.grow]}>{editing ? s.bots.edit : kind === 'bot' ? s.bots.newBot : s.bots.newGroup}</Text><IconButton label={s.common.close} icon={X} disabled={busy} onPress={onClose} /></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>

        {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        {field(s.bots.name, name, setName)}
        {kind === 'bot' ? <>
          {editing && <>{field(s.bots.role, role, setRole)}{field(s.bots.instructions, instructions, setInstructions, true)}</>}
          <Text style={styles.heading}>{s.bots.model}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={s.bots.model} accessibilityState={{ expanded: modelPicker }} style={[styles.input, styles.row]} disabled={busy} onPress={() => setModelPicker(value => !value)}><Text style={[styles.body, styles.grow]}>{model ? text(state.models.find(entry => entry.ref === model)?.name) || text(state.models.find(entry => entry.ref === model)?.label) || model : s.bots.defaultModel}</Text>{modelPicker ? <ChevronUp size={18} color={colors.muted} /> : <ChevronDown size={18} color={colors.muted} />}</Pressable>
          {modelPicker && <View style={styles.field}><BotChoice label={s.bots.defaultModel} checked={model === ''} disabled={busy} onPress={() => { setModel(''); setEffort(''); setModelPicker(false) }} />{state.models.map((entry, i) => { const ref = text(entry.ref); return <BotChoice key={ref || i} label={text(entry.name) || text(entry.label) || ref} checked={model === ref} disabled={busy || ref === ''} onPress={() => { setModel(ref); setEffort(''); setModelPicker(false) }} /> })}</View>}
          {state.models.length === 0 && <Text style={styles.muted}>{s.bots.noModel}</Text>}
          {editing && efforts.length > 0 && <View style={styles.field}><Text style={styles.heading}>{s.bots.effort}</Text>{efforts.map((entry, i) => { const id = text(entry.id) || text(entry.value); return <BotChoice key={id || i} label={text(entry.name) || text(entry.label) || id} checked={effort === id} disabled={busy} onPress={() => setEffort(id)} /> })}</View>}
        </> : <>
          {room && field(s.bots.notice, notice, setNotice, true)}
          <Text style={styles.heading}>{s.bots.members}</Text><Text style={styles.muted}>{s.bots.membersHint}</Text>
          <View style={styles.field}>{state.bots.map(entry => <BotChoice key={entry.id} label={entry.name} multiple checked={members.includes(entry.id)} disabled={busy} onPress={() => setMembers(current => current.includes(entry.id) ? current.filter(id => id !== entry.id) : [...current, entry.id])} />)}</View>
          {editing && <View style={styles.field}><Text style={styles.heading}>{s.bots.admin}</Text>{state.bots.filter(entry => members.includes(entry.id)).map(entry => <BotChoice key={entry.id} label={entry.name} checked={(members.includes(admin) ? admin : members[0]) === entry.id} disabled={busy} onPress={() => setAdmin(entry.id)} />)}</View>}
        </>}

      </ScrollView>
      <View style={styles.actions}><Button variant="quiet" label={s.bots.cancel} disabled={busy} onPress={onClose} /><Button loading={busy} label={bot || room ? s.bots.save : s.bots.create} disabled={busy || !name.trim() || (kind === 'room' && members.length < 2)} onPress={() => void save()} /></View>
    </ModalSurface>
  </Modal>
}
