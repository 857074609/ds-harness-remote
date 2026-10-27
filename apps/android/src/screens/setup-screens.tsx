import { useEffect, useRef, useState } from 'react'
import { useBrowseMemory, browsePreference } from '../services/browse-memory'
import * as Application from 'expo-application'
import { getContentUriAsync } from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { Check, ChevronRight, ExternalLink, KeyRound, Laptop, LockKeyhole, MoreVertical, RotateCcw, Settings, type LucideIcon } from 'lucide-react-native'
import { useAppStore } from '../state/store'
import { BlurHeaderFrame, Button, Field, IconButton, KeyValue, Screen, TopBar } from '../ui/components'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DefaultPermissionPreset } from '../types'
import { radius, spacing, type } from '../ui/theme'
import { useTheme, type ThemeColors } from '../ui/theme-context'
import { useResponsiveLayout } from '../ui/responsive'
import { useThemedStyles } from '../ui/use-themed-styles'
import { strings as zhCN, type LanguagePreference } from '../locales/i18n'
import type { ThemePreference, TypographyDensity } from '../ui/theme'
import { parseDirectTarget } from '../lib/server-url'
import { loadDirectConnect } from '../services/storage'

/** Default DSH Remote Server; a build can override it via EXPO_PUBLIC_DSH_REMOTE_SERVER. */

/**
 * Direct-connect sign-in: the phone talks straight to the Host's built-in
 * listener (ws://host:port), authenticated by the local Host account password.
 * No relay Server, no OAuth — "host:port" plus credentials is the whole model.
 */
export function ServerSetupScreen({ onComplete, onBack, onMore, serverExpanded, setServerExpanded }: { onComplete: () => void; onBack?: () => void; onMore: () => void; serverExpanded: boolean; setServerExpanded: (expanded: boolean) => void }) {
  const config = useAppStore(state => state.config)
  const connecting = useAppStore(state => state.connection.phase === 'connecting')
  const connectDirectHost = useAppStore(state => state.connectDirectHost)
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { width } = useResponsiveLayout()
  const largeScreen = width >= 720

  const loginScrollRef = useRef<ScrollView>(null)
  useEffect(() => {
    // The keyboard covers the lower fields on short screens; the sign-in form
    // is the last content block, so revealing its end reveals the button.
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      loginScrollRef.current?.scrollToEnd({ animated: true })
    })
    return () => subscription.remove()
  }, [])
  const [target, setTarget] = useState(config === undefined ? '' : `${config.host}:${config.port}`)
  const [account, setAccount] = useState(config?.account ?? '')
  const [password, setPassword] = useState('')
  const [prefilled, setPrefilled] = useState(false)
  const connectionError = useAppStore(state => state.connection.error)

  // Password lives only in SecureStore; prefill it once so a retry after a
  // password change starts from the last known credentials.
  useEffect(() => {
    if (prefilled || config === undefined) return
    setPrefilled(true)
    void loadDirectConnect().then(cred => {
      if (cred !== undefined && cred.host === config.host && cred.port === config.port) setPassword(cred.password)
    })
  }, [prefilled, config])

  const parsed = parseDirectTarget(target)
  const canSubmit = parsed !== undefined && account.trim().length > 0 && password.length > 0

  const submit = async () => {
    if (!canSubmit || parsed === undefined) return
    if (await connectDirectHost({ ...parsed, account: account.trim(), password })) onComplete()
  }

  return (
    <View style={styles.flex}>
      <BlurHeaderFrame header={<TopBar title="DSH Remote" onBack={onBack} action={<IconButton label={zhCN.settings.more} icon={MoreVertical} onPress={onMore} />} />}>
        <Screen fill scrollRef={loginScrollRef}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
              <View style={styles.loginIntro}>
                <Text style={styles.lead}>{zhCN.setup.lead}</Text>
              </View>

              <View style={[styles.form, largeScreen && styles.formLarge]}>
                <Field
                  label={zhCN.setup.server}
                  value={target}
                  onChangeText={setTarget}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="192.168.1.10:18888"
                  hint={zhCN.setup.directHint}
                />
                <Field label={zhCN.setup.email} value={account} onChangeText={setAccount} autoCapitalize="none" autoCorrect={false} textContentType="username" placeholder={zhCN.setup.emailPlaceholder} />
                <Field
                  label={zhCN.setup.password}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={() => { if (canSubmit) void submit() }}
                  placeholder={zhCN.setup.passwordPlaceholder}
                  hint={zhCN.setup.passwordHint}
                />
                {connectionError !== undefined && connectionError.length > 0 && (
                  <Text style={styles.preferenceError} accessibilityRole="alert">{connectionError}</Text>
                )}
                <Button label={zhCN.setup.title} onPress={() => void submit()} loading={connecting} disabled={!canSubmit || connecting} />
              </View>
          </KeyboardAvoidingView>
        </Screen>
      </BlurHeaderFrame>
    </View>
  )
}

export function SettingsScreen({ onBack, onReset }: { onBack: () => void; onReset: () => void }) {
  const config = useAppStore(state => state.config)
  const identity = useAppStore(state => state.identity)
  const account = useAppStore(state => state.account)
  const comfort = useBrowseMemory()
  const languagePreference = useAppStore(state => state.languagePreference)
  const setLanguagePreference = useAppStore(state => state.setLanguagePreference)
  const [allLanguagesVisible, setAllLanguagesVisible] = useState(false)
  const showAllLanguages = allLanguagesVisible || !['system', 'zh-CN', 'en-US'].includes(languagePreference)
  const themePreference = useAppStore(state => state.themePreference)
  const setThemePreference = useAppStore(state => state.setThemePreference)
  const typographyDensity = useAppStore(state => state.typographyDensity)
  const setTypographyDensity = useAppStore(state => state.setTypographyDensity)
  const [densitySaving, setDensitySaving] = useState(false)
  const compactHistory = useAppStore(state => state.compactHistory)
  const setCompactHistory = useAppStore(state => state.setCompactHistory)
  const [compactSaving, setCompactSaving] = useState(false)
  const statusBarVisible = useAppStore(state => state.statusBarVisible)
  const setStatusBarVisible = useAppStore(state => state.setStatusBarVisible)
  const [statusBarSaving, setStatusBarSaving] = useState(false)
  const defaultPermission = useAppStore(state => state.defaultPermissionPreset)
  const setDefaultPermission = useAppStore(state => state.setDefaultPermissionPreset)
  const [permissionSaving, setPermissionSaving] = useState(false)
  const reset = useAppStore(state => state.resetLocalData)
  const signOut = useAppStore(state => state.signOut)
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  // Cap the read-only info column on wide landscape tablets; phone portrait
  // already fits inside contentMaxWidth, so nothing changes there.
  const { contentMaxWidth, landscape } = useResponsiveLayout()

  const openNotificationSettings = async () => {
    if (Platform.OS === 'android' && Application.applicationId) {
      try {
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS, {
          extra: { 'android.provider.extra.APP_PACKAGE': Application.applicationId },
        })
        return
      } catch { /* Some Android variants only expose the app details page. */ }
    }
    await Linking.openSettings()
  }

  const toggleCompactHistory = async (value: boolean) => {
    if (compactSaving) return
    setCompactSaving(true)
    try { await setCompactHistory(value) }
    catch { Alert.alert(zhCN.settings.compactHistorySaveFailed, zhCN.settings.statusBarSaveFailedBody) }
    finally { setCompactSaving(false) }
  }

  const toggleTypographyDensity = async (value: TypographyDensity) => {
    if (densitySaving || value === typographyDensity) return
    setDensitySaving(true)
    try { await setTypographyDensity(value) }
    catch { Alert.alert(zhCN.settings.typographyDensitySaveFailed, zhCN.settings.statusBarSaveFailedBody) }
    finally { setDensitySaving(false) }
  }

  const toggleStatusBar = async (visible: boolean) => {
    if (statusBarSaving) return
    setStatusBarSaving(true)
    try {
      await setStatusBarVisible(visible)
    } catch {
      Alert.alert(zhCN.settings.statusBarSaveFailed, zhCN.settings.statusBarSaveFailedBody)
    } finally {
      setStatusBarSaving(false)
    }
  }

  const pickDefaultPermission = (preset: DefaultPermissionPreset) => {
    if (permissionSaving || preset === defaultPermission) return
    const save = async () => {
      setPermissionSaving(true)
      try {
        await setDefaultPermission(preset)
      } catch {
        Alert.alert(zhCN.settings.defaultPermissionSaveFailed, zhCN.settings.defaultPermissionSaveFailedBody)
      } finally {
        setPermissionSaving(false)
      }
    }
    if (preset === 'danger-full-access') {
      Alert.alert(zhCN.settings.defaultPermissionFullAccessTitle, zhCN.settings.defaultPermissionFullAccessBody, [
        { text: zhCN.common.cancel, style: 'cancel' },
        { text: zhCN.chat.enable, style: 'destructive', onPress: () => void save() },
      ])
    } else void save()
  }

  const confirmReset = () => Alert.alert(
    zhCN.settings.resetTitle,
    zhCN.settings.resetBody,
    [
      { text: zhCN.common.cancel, style: 'cancel' },
      { text: zhCN.settings.reset, style: 'destructive', onPress: () => void reset().then(onReset) },
    ],
  )

  const confirmSignOut = () => Alert.alert(
    zhCN.settings.signOutTitle,
    zhCN.settings.signOutBody,
    [
      { text: zhCN.common.cancel, style: 'cancel' },
      { text: zhCN.settings.signOut, style: 'destructive', onPress: () => void signOut().then(onReset) },
    ],
  )

  return (
    <View style={styles.flex}>
      <BlurHeaderFrame header={<TopBar title={zhCN.settings.title} onBack={onBack} />}>
        <Screen>
          <View style={[styles.contentColumn, landscape && { maxWidth: contentMaxWidth }]}>
            <Text style={styles.groupLabel}>{zhCN.settings.language}</Text>
            <View style={styles.preferenceList}>
              {languageOptions().filter((_, index) => showAllLanguages || index < 3).map(option => {
                const chosen = option.value === languagePreference
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: chosen }}
                    onPress={() => void setLanguagePreference(option.value)}
                    style={[styles.preferenceOption, styles.preferenceAction, chosen && styles.preferenceOptionChosen]}
                  >
                    <Text style={[styles.preferenceName, styles.languageName]}>{option.name}</Text>
                    {chosen && <Check size={17} color={colors.primary} />}
                  </Pressable>
                )
              })}
              {!showAllLanguages && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={zhCN.settings.languageShowAll}
                  accessibilityState={{ expanded: false }}
                  onPress={() => setAllLanguagesVisible(true)}
                  style={[styles.preferenceOption, styles.preferenceAction]}
                >
                  <Text style={styles.preferenceName}>More ...</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.groupLabel}>{zhCN.settings.appearance}</Text>
            <View style={[styles.segmentRow, styles.appearanceSegments]} accessibilityRole="tablist">
              {themeOptions().map(option => {
                const chosen = option.value === themePreference
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: chosen }}
                    onPress={() => void setThemePreference(option.value)}
                    style={[styles.segmentButton, chosen && styles.segmentButtonActive]}
                  >
                    <Text style={[styles.segmentButtonText, chosen && styles.segmentButtonTextActive]} numberOfLines={1}>
                      {option.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={styles.preferenceList}>
              <View style={styles.preferenceOption}>
                <View style={styles.preferenceCopy}>
                  <Text style={styles.preferenceName}>{zhCN.settings.typographyDensity}</Text>
                  <Text style={styles.preferenceDescription}>{zhCN.settings.typographyDensityNote}</Text>
                </View>
              </View>
            </View>
            <View style={[styles.segmentRow, styles.appearanceSegments]} accessibilityRole="tablist">
              {([
                { value: 'standard' as const, name: zhCN.settings.densityStandard },
                { value: 'compact' as const, name: zhCN.settings.densityCompact },
              ]).map(option => {
                const chosen = option.value === typographyDensity
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: chosen }}
                    onPress={() => void toggleTypographyDensity(option.value)}
                    style={[styles.segmentButton, chosen && styles.segmentButtonActive]}
                  >
                    <Text style={[styles.segmentButtonText, chosen && styles.segmentButtonTextActive]} numberOfLines={1}>
                      {option.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={styles.preferenceList}>
              <View style={styles.preferenceOption}>
                <Text style={[styles.preferenceName, styles.languageName]}>{zhCN.settings.statusBar}</Text>
                <Switch
                  accessibilityLabel={zhCN.settings.statusBar}
                  value={statusBarVisible}
                  disabled={statusBarSaving}
                  onValueChange={visible => void toggleStatusBar(visible)}
                  trackColor={{ false: colors.disabled, true: colors.primary }} thumbColor={colors.white}
                />
              </View>
            </View>

            <Text style={styles.groupLabel}>{zhCN.comfort.continueWork}</Text>
            <View style={styles.preferenceList}>
              <View style={styles.preferenceOption}>
                <Text style={[styles.preferenceName, styles.languageName]}>{zhCN.comfort.resume}</Text>
                <Switch accessibilityLabel={zhCN.comfort.resume} value={comfort.resume}
                  onValueChange={resume => browsePreference({ resume })} trackColor={{ false: colors.disabled, true: colors.primary }} thumbColor={colors.white} />
              </View>
              <View style={styles.preferenceOption}>
                <View style={styles.preferenceCopy}>
                  <Text style={styles.preferenceName}>{zhCN.settings.compactHistory}</Text>
                  <Text style={styles.preferenceDescription}>{zhCN.settings.compactHistoryNote}</Text>
                </View>
                <Switch accessibilityLabel={zhCN.settings.compactHistory} value={compactHistory}
                  disabled={compactSaving} onValueChange={value => void toggleCompactHistory(value)}
                  trackColor={{ false: colors.disabled, true: colors.primary }} thumbColor={colors.white} />
              </View>
              <View style={styles.preferenceOption}>
                <View style={styles.preferenceCopy}>
                  <Text style={styles.preferenceName}>{zhCN.comfort.notifications}</Text>
                  <Text style={styles.preferenceDescription}>{zhCN.comfort.notificationsNote}</Text>
                </View>
                <Switch accessibilityLabel={zhCN.comfort.notifications} value={comfort.notifications}
                  onValueChange={notifications => browsePreference({ notifications })} trackColor={{ false: colors.disabled, true: colors.primary }} thumbColor={colors.white} />
              </View>
              <Pressable accessibilityRole="button" onPress={() => void openNotificationSettings()}
                style={({ pressed }) => [styles.preferenceOption, styles.preferenceAction, pressed && styles.preferenceActionPressed]}>
                <Text style={[styles.preferenceName, styles.languageName]}>{zhCN.comfort.systemNotifications}</Text>
                <ExternalLink size={17} color={colors.muted} />
              </Pressable>
              {comfort.error !== undefined && <Text style={styles.preferenceError} accessibilityRole="alert">{comfort.error}</Text>}
            </View>

            <Text style={styles.groupLabel}>{zhCN.settings.defaultPermission}</Text>
            <View style={styles.preferenceList} accessibilityRole="radiogroup">
              {([
                { value: 'default', name: zhCN.settings.defaultPermissionHost, description: zhCN.settings.defaultPermissionHostDescription },
                { value: 'workspace-write', name: zhCN.chat.permissionWorkspaceWrite, description: zhCN.chat.permissionWorkspaceWriteDescription },
                { value: 'danger-full-access', name: zhCN.chat.permissionFullAccess, description: zhCN.chat.permissionFullAccessDescription },
              ] satisfies Array<{ value: DefaultPermissionPreset; name: string; description: string }>).map(option => {
                const chosen = option.value === defaultPermission
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: chosen, disabled: permissionSaving }}
                    disabled={permissionSaving}
                    onPress={() => pickDefaultPermission(option.value)}
                    style={[styles.preferenceOption, styles.permissionOption, chosen && styles.preferenceOptionChosen]}
                  >
                    <View style={styles.preferenceCopy}>
                      <Text style={styles.preferenceName}>{option.name}</Text>
                      <Text style={styles.preferenceDescription}>{option.description}</Text>
                    </View>
                    {chosen && <Check size={17} color={colors.primary} />}
                  </Pressable>
                )
              })}
              <Text style={styles.preferenceNote}>{zhCN.settings.defaultPermissionNote}</Text>
            </View>

            <Text style={styles.groupLabel}>{zhCN.settings.connection}</Text>
            <View style={styles.group}>
              <KeyValue label={zhCN.settings.server} value={config?.baseUrl ?? zhCN.settings.notConfigured} />
              <KeyValue label={zhCN.settings.account} value={account ?? zhCN.settings.notSignedIn} />
              <KeyValue label={zhCN.settings.protocol} value="DSH Remote v1" />
            </View>

            <Text style={styles.groupLabel}>{zhCN.settings.identity}</Text>
            <View style={styles.group}>
              <KeyValue label={zhCN.settings.thisPhone} value={identity?.name ?? zhCN.settings.androidDevice} />
              <KeyValue label={zhCN.settings.deviceId} value={shorten(identity?.deviceId)} mono />
              <KeyValue label={zhCN.settings.publicKey} value={fingerprint(identity?.publicKey)} mono />
              <View style={styles.keyNote}><KeyRound size={17} color={colors.muted} /><Text style={styles.keyNoteText}>{zhCN.settings.keyNote}</Text></View>
            </View>

            <View style={styles.resetArea}>
              <Button label={zhCN.settings.signOut} variant="secondary" onPress={confirmSignOut} />
              <View style={styles.resetGap} />
              <Button label={zhCN.settings.resetLocal} icon={RotateCcw} variant="danger" onPress={confirmReset} />
            </View>
          </View>
        </Screen>
      </BlurHeaderFrame>
    </View>
  )
}

export function HomeActionsMenu({ visible, onClose, onSettings, onDevices, onSwitchServer }: {
  visible: boolean
  onClose: () => void
  onSettings: () => void
  onDevices?: () => void
  onSwitchServer?: () => void
}) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { height: windowHeight, landscape, compactHeight } = useResponsiveLayout()

  if (!visible) return null

  // Landscape phones are short: keep the fixed-position menu below the bar but
  // inside the window, and let its rows scroll if they still cannot all fit.
  const shortWindow = landscape || compactHeight
  const menuTop = insets.top + (shortWindow ? 48 : 56)
  const menuMaxHeight = Math.max(120, windowHeight - menuTop - insets.bottom - spacing.xs)

  return (
    <View style={styles.homeMenuLayer} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={zhCN.common.close}
        onPress={onClose}
        pointerEvents="box-only"
        style={styles.homeMenuDismiss}
      />
      <View accessibilityRole="menu" style={[styles.homeMenuCard, { top: menuTop, maxHeight: menuMaxHeight }]} pointerEvents="box-none">
        <ScrollView style={styles.homeMenuScroll} bounces={false} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {onDevices !== undefined && (
            <HomeMenuRow icon={Laptop} label={zhCN.devices.myDevices} onPress={onDevices} />
          )}
          {onSwitchServer !== undefined && <HomeMenuRow icon={RotateCcw} label={zhCN.setup.switchServer} onPress={onSwitchServer} />}
          <HomeMenuRow icon={Settings} label={zhCN.settings.title} onPress={onSettings} last />
        </ScrollView>
      </View>
    </View>
  )
}

function HomeMenuRow({ icon: Icon, label, subtitle, onPress, disabled = false, last = false }: {
  icon: LucideIcon
  label: string
  subtitle?: string
  onPress: () => void
  disabled?: boolean
  last?: boolean
}) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.homeMenuRow,
        !last && styles.homeMenuRowBorder,
        pressed && !disabled && styles.homeMenuRowPressed,
        disabled && styles.homeMenuRowDisabled,
      ]}
    >
      <View style={styles.homeMenuRowIcon}><Icon size={19} color={colors.primary} /></View>
      <View style={styles.homeMenuRowCopy}>
        <Text style={styles.homeMenuRowLabel}>{label}</Text>
        {subtitle !== undefined && <Text style={styles.homeMenuRowSubtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {disabled
        ? <ActivityIndicator size="small" color={colors.primary} />
        : <ChevronRight size={20} color={colors.subtle} />}
    </Pressable>
  )
}

function shorten(value?: string): string {
  if (value === undefined) return zhCN.common.unavailable
  return value.length > 18 ? `${value.slice(0, 9)}…${value.slice(-7)}` : value
}

function fingerprint(value?: string): string {
  if (value === undefined || value.length === 0) return zhCN.common.unavailable
  return value.slice(0, 24).toUpperCase().match(/.{1,4}/g)?.join(' ') ?? value
}

function languageOptions(): Array<{ value: LanguagePreference; name: string }> {
  return [
    { value: 'system', name: zhCN.settings.languageSystem },
    { value: 'zh-CN', name: zhCN.settings.languageChinese },
    { value: 'en-US', name: zhCN.settings.languageEnglish },
    { value: 'ja-JP', name: '日本語' },
    { value: 'zh-TW', name: '繁體中文' },
    { value: 'es-ES', name: 'Español' },
    { value: 'de-DE', name: 'Deutsch' },
    { value: 'fr-FR', name: 'Français' },
  ]
}

function themeOptions(): Array<{ value: ThemePreference; name: string }> {
  return [
    { value: 'light', name: zhCN.settings.themeLight },
    { value: 'dark', name: zhCN.settings.themeDark },
    { value: 'system', name: zhCN.settings.themeSystem },
  ]
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  // Reading cap for wide landscape tablets; the live width style is applied by
  // the screens that opt in (portrait phones never exceed the cap).
  contentColumn: { width: '100%', alignSelf: 'center' },
  loginIntro: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingTop: spacing.xl },
  loginScrollContent: { flexGrow: 1 },
  loginFooter: { marginTop: 'auto', paddingTop: spacing.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  loginCredit: { ...type.caption, color: colors.muted },
  loginCreditLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  loginCreditName: { ...type.caption, color: colors.primary, textDecorationLine: 'underline' },
  lead: { ...type.body, color: colors.muted, marginTop: spacing.sm },
  form: { marginTop: spacing.xxl, gap: spacing.md },
  methodTabs: { flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: colors.surfaceStrong },
  methodTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  methodTabActive: { backgroundColor: colors.surface },
  methodTabText: { ...type.smallStrong, color: colors.muted },
  methodTabTextActive: { color: colors.primary },
  serverActions: { flexDirection: 'row', gap: spacing.sm },
  serverBackdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.modalBackdrop },
  serverDialog: { width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  serverDialogContent: { gap: spacing.md },
  serverDialogTitle: { ...type.heading, color: colors.ink },
  serverLabel: { ...type.smallStrong, color: colors.muted },
  oauthHint: { ...type.caption, color: colors.muted, textAlign: 'center' },
  formLarge: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  qrEntry: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  qrEntryPressed: { backgroundColor: colors.surfaceStrong },
  qrEntryCopy: { flex: 1, gap: 2 },
  qrEntryText: { ...type.smallStrong, color: colors.ink },
  qrEntryHint: { ...type.caption, color: colors.muted },
  qrPanel: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  qrTitle: { ...type.heading, color: colors.ink, textAlign: 'center' },
  qrPlaceholder: { minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  qrHint: { ...type.caption, color: colors.muted, textAlign: 'center', maxWidth: 420 },
  qrMessage: { ...type.small, color: colors.muted, textAlign: 'center', maxWidth: 420 },
  securityNoteLarge: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  securityNote: { gap: spacing.xs, paddingVertical: spacing.md, marginTop: spacing.xxxl },
  securityHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  securityTitle: { ...type.smallStrong, color: colors.ink },
  securityBody: { ...type.small, color: colors.muted, marginTop: 2 },
  groupLabel: { ...type.smallStrong, color: colors.muted, marginTop: spacing.xl, marginBottom: spacing.xs },
  group: { borderRadius: radius.lg, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  preferenceList: { gap: spacing.xs },
  preferenceOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  preferenceAction: { minHeight: 48 },
  preferenceActionPressed: { backgroundColor: colors.surfaceStrong },
  preferenceError: { ...type.caption, color: colors.danger },
  preferenceOptionChosen: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  permissionOption: { minHeight: 48 },
  preferenceCopy: { flex: 1 },
  preferenceName: { ...type.smallStrong, color: colors.ink },
  languageName: { flex: 1 },
  preferenceDescription: { ...type.caption, color: colors.muted, marginTop: 2 },
  preferenceNote: { ...type.caption, color: colors.muted, marginTop: spacing.xs },
  appearanceSegments: { marginBottom: spacing.xs },
  segmentRow: { flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: colors.surfaceStrong },
  segmentButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: spacing.xs },
  segmentButtonActive: { backgroundColor: colors.surface },
  segmentButtonText: { ...type.smallStrong, color: colors.muted, textAlign: 'center' },
  segmentButtonTextActive: { color: colors.primary },
  keyNote: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.md },
  keyNoteText: { ...type.small, color: colors.muted, flex: 1 },
  settingsLink: { minHeight: 68, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  settingsLinkPressed: { opacity: 0.68 },
  settingsLinkCopy: { flex: 1, gap: 3 },
  settingsLinkLabel: { ...type.smallStrong, color: colors.ink },
  settingsLinkUrl: { ...type.caption, color: colors.primary },
  homeMenuLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, elevation: 20 },
  homeMenuDismiss: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.menuDismiss },
  homeMenuCard: { position: 'absolute', right: spacing.sm, width: 236, paddingHorizontal: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.surface, zIndex: 1, elevation: 8, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.14, shadowRadius: 14 },
  // flexGrow 0 keeps the card content-sized in portrait; flexShrink lets the
  // capped landscape card scroll instead of clipping its last row.
  homeMenuScroll: { flexGrow: 0, flexShrink: 1 },
  homeMenuRow: { minHeight: 56, paddingHorizontal: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  homeMenuRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  homeMenuRowPressed: { opacity: 0.68 },
  homeMenuRowDisabled: { opacity: 0.6 },
  homeMenuRowIcon: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  homeMenuRowCopy: { flex: 1 },
  homeMenuRowLabel: { ...type.smallStrong, color: colors.ink },
  homeMenuRowSubtitle: { ...type.caption, color: colors.muted, marginTop: 1 },
  aboutHero: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.xs },
  aboutLogo: { width: 84, height: 84, borderRadius: radius.lg, marginBottom: spacing.sm },
  aboutProductName: { ...type.title, color: colors.ink, textAlign: 'center' },
  aboutVersion: { ...type.small, color: colors.muted, textAlign: 'center' },
  resetArea: { marginTop: spacing.xxxl },
  resetGap: { height: spacing.sm },
  })
}
