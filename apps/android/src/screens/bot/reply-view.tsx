import { Text, View } from 'react-native'
import { strings as s } from '../../locales/i18n'
import { text, type BotObject } from '../../services/bot-catalog'
import { NativeMarkdown } from '../../ui/markdown'
import { useThemedStyles } from '../../ui/use-themed-styles'
import { createBotStyles } from './styles'

export function BotReplies({ rows }: { rows: BotObject[] }) {
  const styles = useThemedStyles(createBotStyles)
  return <View style={styles.section}>{rows.map((reply, i) => <View key={i} style={styles.card}><Text style={styles.heading}>{text(reply.name) || (reply.kind === 'user' ? s.bots.yourAnswer : s.bots.title)}</Text><NativeMarkdown text={text(reply.text) || text(reply.kind)} /></View>)}</View>
}
