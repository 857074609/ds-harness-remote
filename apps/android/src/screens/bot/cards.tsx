import { useState } from 'react'
import { ScrollView, Text, TextInput, View } from 'react-native'
import { strings as s } from '../../locales/i18n'
import { object, objects, text, type BotObject } from '../../services/bot-catalog'
import { Button } from '../../ui/components'
import { useTheme } from '../../ui/theme-context'
import { useThemedStyles } from '../../ui/use-themed-styles'
import { BotChoice } from './controls'
import { createBotStyles } from './styles'

type Reply = (action: string, values: BotObject) => void

/** Native declarative cards only: no model-generated HTML or scripts. */
export function BotViewCard({ pending, busy, reply }: { pending: BotObject; busy: boolean; reply: Reply }) {
  const styles = useThemedStyles(createBotStyles)
  return <View style={styles.card}><Text style={styles.heading}>{text(pending.title)}</Text>
    {boundedView(pending.view) ? <ViewNode node={object(pending.view)} busy={busy} reply={reply} depth={0} /> : <Text style={styles.muted}>{s.bots.unknownCard}</Text>}
  </View>
}
function ViewNode({ node, busy, reply, depth }: { node: BotObject; busy: boolean; reply: Reply; depth: number }) {
  const styles = useThemedStyles(createBotStyles)
  const { colors } = useTheme()
  const [selected, setSelected] = useState<string[]>([])
  const [fields, setFields] = useState<Record<string, string>>({})
  if (depth > 8) return <Text style={styles.muted}>{s.bots.unknownCard}</Text>
  const id = text(node.id)
  switch (node.type) {
    case 'stack': return <View style={styles.section}>{objects(node.children).slice(0, 16).map((child, index) => <ViewNode key={index} node={child} busy={busy} reply={reply} depth={depth + 1} />)}</View>
    case 'text': return <Text selectable style={styles.body}>{text(node.text)}</Text>
    case 'metric': return <View><Text style={styles.muted}>{text(node.label)}</Text><Text style={styles.title}>{typeof node.value === 'number' ? node.value : text(node.value)}</Text></View>
    case 'progress': return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: typeof node.percent === 'number' ? node.percent : 0 }}>
      <Text style={styles.body}>{text(node.label)} · {typeof node.percent === 'number' ? node.percent : 0}%</Text>
    </View>
    case 'table': return <ScrollView horizontal><View>
      <View style={styles.tableRow}>{objects(node.columns).slice(0, 8).map((column, i) => <Text key={i} style={styles.cell}>{text(column.label)}</Text>)}</View>
      {(Array.isArray(node.rows) ? node.rows : []).slice(0, 50).map((row, i) => <View key={i} style={styles.tableRow}>{(Array.isArray(row) ? row : []).slice(0, 8).map((cell, j) => <Text key={j} style={styles.cell}>{typeof cell === 'number' || typeof cell === 'boolean' ? String(cell) : text(cell)}</Text>)}</View>)}
    </View></ScrollView>
    case 'options': return <View style={styles.section}>
      {objects(node.options).slice(0, 8).map((option, i) => {
        const label = text(option.label)
        return <BotChoice key={i} label={label} description={text(option.description)} multiple={node.multi === true} checked={selected.includes(label)} disabled={busy} onPress={() => setSelected(current => node.multi === true ? current.includes(label) ? current.filter(item => item !== label) : [...current, label] : [label])} />
      })}
      <View style={styles.actions}><Button label={s.bots.submit} disabled={busy || id === '' || selected.length === 0} onPress={() => reply(id, { selected })} /></View>
    </View>
    case 'confirm': return <View style={styles.actions}>
      <Button variant="secondary" label={text(node.cancelLabel) || s.bots.reject} disabled={busy || id === ''} onPress={() => reply(id, { confirmed: false })} />
      <Button label={text(node.confirmLabel) || s.bots.confirm} disabled={busy || id === ''} onPress={() => reply(id, { confirmed: true })} />
    </View>
    case 'form': return <View style={styles.section}>
      {objects(node.fields).slice(0, 6).map((field, i) => <View style={styles.field} key={i}>
        <Text style={styles.body}>{text(field.label)}</Text><TextInput accessibilityLabel={text(field.label)} placeholder={text(field.placeholder)} placeholderTextColor={colors.muted} style={styles.input} maxLength={2000} editable={!busy} value={fields[text(field.id)] ?? ''} onChangeText={value => setFields(current => ({ ...current, [text(field.id)]: value }))} />
      </View>)}
      <View style={styles.actions}><Button label={text(node.submitLabel) || s.bots.submit} disabled={busy || id === ''} onPress={() => reply(id, { fields })} /></View>
    </View>
    default: return <Text style={styles.muted}>{s.bots.unknownCard}</Text>
  }
}

export function BotQuestion({ question, busy, answer, dismiss }: { question: BotObject; busy: boolean; answer: (value: BotObject) => void; dismiss: () => void }) {
  const styles = useThemedStyles(createBotStyles)
  const { colors } = useTheme()
  const [selected, setSelected] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const options = (Array.isArray(question.options) ? question.options : []).map(option => typeof option === 'string' ? { label: option } : object(option))
  return <View style={styles.card}>
    <Text style={styles.heading}>{text(question.header) || s.bots.question}</Text><Text style={styles.body}>{text(question.question)}</Text>
    {text(question.detail) !== '' && <Text style={styles.muted}>{text(question.detail)}</Text>}
    {options.map((option, i) => { const label = text(option.label); return <BotChoice key={i} label={label} description={text(option.description)} multiple={question.multiSelect === true} checked={selected.includes(label)} disabled={busy} onPress={() => setSelected(current => question.multiSelect === true ? current.includes(label) ? current.filter(item => item !== label) : [...current, label] : [label])} /> })}
    <TextInput style={styles.input} value={custom} onChangeText={setCustom} editable={!busy} placeholder={s.bots.yourAnswer} accessibilityLabel={s.bots.yourAnswer} placeholderTextColor={colors.muted} multiline />
    <View style={styles.actions}><Button variant="quiet" label={s.bots.dismiss} disabled={busy} onPress={dismiss} /><Button label={s.bots.submit} disabled={busy || (selected.length === 0 && custom.trim() === '')} onPress={() => answer({ selected, ...(custom.trim() ? { custom: custom.trim() } : {}) })} /></View>
  </View>
}

function boundedView(value: unknown): boolean {
  let count = 0
  const stack = [{ value, depth: 0 }]
  while (stack.length) {
    const entry = stack.pop()!
    const node = object(entry.value)
    if (++count > 64 || entry.depth > 8 || typeof node.type !== 'string') return false
    if (node.type === 'stack') {
      if (!Array.isArray(node.children) || node.children.length > 16) return false
      stack.push(...node.children.map(value => ({ value, depth: entry.depth + 1 })))
    }
  }
  return true
}
