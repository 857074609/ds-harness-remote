import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { strings as s } from '../../locales/i18n'
import { object, text, type BotObject } from '../../services/bot-catalog'
import { Button } from '../../ui/components'
import { useTheme } from '../../ui/theme-context'
import { useThemedStyles } from '../../ui/use-themed-styles'
import { BotChoice } from './controls'
import { createBotStyles } from './styles'

export { BotViewCard } from './view-card'

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
