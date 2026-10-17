import type { ReactNode } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { strings as zhCN } from '../../locales/i18n'
import { useThemedStyles } from '../../ui/use-themed-styles'
import { createStyles } from './styles'

/**
 * Keep the dismiss target behind the sheet instead of nesting Pressables.
 * Android's responder negotiation can otherwise let the backdrop consume a
 * child press, which makes every option in a transparent modal look inert.
 */
export function ModalSurface({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.modalBackdrop} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={zhCN.common.close}
        onPress={onClose}
        pointerEvents="box-only"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.modalSheet} pointerEvents="box-none">{children}</View>
    </View>
  )
}

/** Keep the picker sheet within ~70% of the screen while letting long catalogs scroll. */
export function usePickerListMaxHeight(): number {
  const { height } = useWindowDimensions()
  return Math.max(180, Math.round(height * 0.7) - 96)
}
