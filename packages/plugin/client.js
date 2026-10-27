/**
 * ds-harness-remote — browser half.
 *
 * Contributes one settings section (`settings.section` id `ds-harness-remote`)
 * that shows the Host's direct-connect listener and lets the operator change
 * the account/password the phone signs in with. Values come from the Host
 * settings document through `configForms`, so a write here lands in the same
 * `cordis.patch.yml` entry the Host reads at startup and hot-applies.
 *
 * Hand-written ModuleLoader bundle: no build step, no dependency beyond the
 * `react` the shell already provides.
 */
window.__ModuleLoader__.load({
  id: 'ds-harness-remote',
  factory: require => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { createElement: h, useState, useEffect } = React

    const NS = 'ds-harness-remote'

    const rowStyle = {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      padding: '10px 0', borderBottom: '1px solid rgba(127,127,127,0.18)', fontSize: 14,
    }
    const labelStyle = { opacity: 0.72 }
    const fieldStyle = {
      width: '100%', padding: '9px 11px', borderRadius: 8, boxSizing: 'border-box',
      border: '1px solid rgba(127,127,127,0.35)', background: 'transparent',
      color: 'inherit', fontSize: 14, outline: 'none',
    }
    const buttonStyle = {
      padding: '9px 18px', borderRadius: 8, border: 'none', background: '#3b82f6',
      color: '#fff', fontSize: 14, cursor: 'pointer',
    }

    function RemoteSection({ ctx }) {
      const form = React.useMemo(() => ctx.configForms.get(NS), [ctx])
      const [snap, setSnap] = useState(() => form.getSnapshot())
      useEffect(() => form.subscribe(() => setSnap(form.getSnapshot())), [form])

      const value = snap.value || {}
      const listen = value.listen || {}
      const [account, setAccount] = useState('')
      const [password, setPassword] = useState('')
      const [busy, setBusy] = useState(false)
      const [note, setNote] = useState('')

      useEffect(() => {
        if (typeof value.directAccount === 'string' && value.directAccount !== '') setAccount(value.directAccount)
      }, [value.directAccount])

      const save = async () => {
        if (busy) return
        setBusy(true)
        setNote('')
        try {
          const trimmed = account.trim()
          let ok = true
          let changed = false
          if (trimmed !== '' && trimmed !== value.directAccount) {
            ok = (await form.set('directAccount', trimmed)) && ok
            changed = true
          }
          if (password !== '') {
            ok = (await form.set('directPassword', password)) && ok
            changed = true
          }
          if (!changed) setNote('没有改动。')
          else if (!ok) setNote('保存失败，请重试。')
          else {
            setPassword('')
            setNote('已保存。手机端请用新账号重新登录。')
          }
        } catch (error) {
          setNote('保存失败：' + (error && error.message ? error.message : String(error)))
        } finally {
          setBusy(false)
        }
      }

      const status = snap.status === 'loading' ? '读取中…' : snap.status === 'ready' ? '' : '设置不可用'
      return h('div', { style: { maxWidth: 640, padding: '8px 0 24px' } },
        h('h2', { style: { fontSize: 18, margin: '0 0 4px' } }, '远程访问'),
        h('p', { style: { margin: '0 0 18px', opacity: 0.62, fontSize: 13, lineHeight: 1.5 } },
          '手机端用下面的地址和账号登录 DSH Remote。修改账号或密码后，手机端需要重新登录。'),
        h('div', { style: rowStyle }, h('span', { style: labelStyle }, '监听地址'),
          h('span', null, (listen.host || '0.0.0.0') + ':' + (listen.port || 18888))),
        h('div', { style: rowStyle }, h('span', { style: labelStyle }, '当前账号'),
          h('span', null, value.directAccount || '未设置')),
        h('div', { style: rowStyle }, h('span', { style: labelStyle }, '密码'),
          h('span', null, '留空表示不修改')),
        h('div', { style: rowStyle }, h('span', { style: labelStyle }, '设备名'),
          h('span', null, value.deviceName || '默认')),
        h('div', { style: { marginTop: 22, display: 'grid', gap: 8 } },
          h('label', { style: { fontSize: 13, opacity: 0.75 } }, '账号'),
          h('input', {
            style: fieldStyle, value: account, placeholder: '例如 ln',
            onChange: event => setAccount(event.target.value),
          }),
          h('label', { style: { fontSize: 13, opacity: 0.75, marginTop: 8 } }, '新密码（留空表示不修改）'),
          h('input', {
            style: fieldStyle, type: 'password', value: password, placeholder: '输入新密码',
            onChange: event => setPassword(event.target.value),
          }),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 } },
            h('button', { style: buttonStyle, onClick: save, disabled: busy }, busy ? '保存中…' : '保存'),
            note ? h('span', { style: { fontSize: 13, opacity: 0.75 } }, note) : null,
            status ? h('span', { style: { fontSize: 13, opacity: 0.5 } }, status) : null,
          ),
        ),
      )
    }

    const inject = ['slots', 'configForms']

    function apply(ctx) {
      if (ctx.configForms === undefined) return
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: NS,
        order: 42,
        label: () => '远程',
      }, props => h(RemoteSection, Object.assign({}, props, { ctx }))))
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = NS
    return module.exports
  },
})
