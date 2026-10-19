import { useEffect, useState } from 'react'
import { Text } from 'react-native'

/** Keep timer updates local to the suffix, rather than rerendering its screen. */
export function AnimatedEllipsis() {
  const [visible, setVisible] = useState(1)
  useEffect(() => {
    const timer = setInterval(() => setVisible(count => count % 3 + 1), 400)
    return () => clearInterval(timer)
  }, [])
  return (
    <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {'.'.repeat(visible)}{'\u2008'.repeat(3 - visible)}
    </Text>
  )
}
