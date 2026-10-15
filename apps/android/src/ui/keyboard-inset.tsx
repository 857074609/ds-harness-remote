import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Dimensions, Keyboard, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { spacing } from './theme'

/**
 * Reserve the band the IME covers so the composer clears it.
 *
 * Android can drop `keyboardDidHide` (IME closed while the activity was paused,
 * focus moved into a WebView or modal, split-screen resizes) and
 * `Keyboard.metrics()` is fed by those same events, so no keyboard-sourced value
 * can recover from a missed hide. Two rules keep the layout honest:
 *
 * 1. Never close over `windowHeight` in the show handler — `adjustResize` can
 *    shrink the window between subscription and delivery, and a stale height
 *    produced a padding that nothing ever corrected.
 * 2. Treat a window height increase as authoritative: under adjustResize the
 *    window grows back exactly when the IME releases it, which is the only
 *    signal that does not depend on the dropped event.
 */
export function KeyboardInset({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const [keyboardCover, setKeyboardCover] = useState(0)
  const heightRef = useRef(windowHeight)

  // Edge-to-edge Android often keeps the RN root full-screen even with
  // adjustResize, so KeyboardAvoidingView under-pads and the IME toolbar
  // clips the composer. Measure the real covered band from screenY.
  const measure = useCallback((screenY: number) => {
    // The cover MUST be computed in screen coordinates: `screenY` is
    // screen-absolute, while useWindowDimensions() reports the already-shrunk
    // window under adjustResize. Subtracting the two collapses to 0 exactly
    // when the IME is up, so the composer stayed covered with no relayout.
    // Dimensions.get('screen') is the matching frame for `screenY`.
    const screenHeight = Dimensions.get('screen').height
    setKeyboardCover(Math.max(0, screenHeight - screenY))
  }, [])

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => measure(event.endCoordinates.screenY))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardCover(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [measure])

  useEffect(() => {
    const previous = heightRef.current
    heightRef.current = windowHeight
    // The window grows back when the IME released it (adjustResize). Reset a
    // cover left behind by a dropped hide event — but only when the keyboard
    // also reports hidden: split-screen and rotation grow the window while the
    // IME stays up, and must not clear a live cover.
    if (windowHeight > previous && !Keyboard.isVisible()) setKeyboardCover(0)
  }, [windowHeight])

  // App shell already reserved insets.bottom below this tree; subtract it so
  // we clear the IME without double-counting the gesture/nav inset. When
  // adjustResize already shrank the window, cover≈0 and this is a no-op.
  const paddingBottom = keyboardCover > 0
    ? Math.max(0, keyboardCover - insets.bottom) + spacing.sm
    : 0

  return (
    <View style={[{ flex: 1 }, paddingBottom > 0 ? { paddingBottom } : null]}>
      {children}
    </View>
  )
}
