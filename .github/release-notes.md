## 中文

- **Windows 顶栏可点击修复**：Remote 状态条位于 Windows 标题栏行，而该行被 shell 声明为窗口拖拽区；未显式退出拖拽区时，点击只会变成拖动窗口，状态条上的网络、加密与退出按钮都收不到点击。现在状态条及其「连接线路」面板遮罩都退出了该区域，与 shell 自带顶栏控件一致。仅 Windows Desktop 受影响，浏览器与 macOS 不受影响。
- 本次发布只包含这一处修复，没有其他改动。

Plugin 与 Android 均为 **0.5.9**（Android `versionCode 47`）。Windows Desktop 的点击行为需要在实际窗口中人工验收；终端相关的 macOS 真 PTY 烟测结论沿用 0.5.8，Windows/Linux PTY、Desktop/Android 加密跨设备及真实两小时空闲回收验收仍待完成。兼容 pipe 路径不支持 resize/job control。iOS 客户端仍在内测招募中，欢迎通过 [iOS issue #20](https://github.com/liguobao/ds-harness-remote/issues/20) 报名和反馈。

## English

- **Windows caption click fix:** the Remote status strip sits in the Windows title bar row, which the shell declares as the window drag region, so a press inside it only started a window drag and none of the strip's network, encryption, or exit controls received it. The strip and the scrim of its connection panel now exclude themselves from that region, matching the shell's own caption controls. Only the Windows Desktop is affected; browsers and macOS are not.
- This release contains that fix and nothing else.

Plugin and Android are **0.5.9** (Android `versionCode 47`). The Windows Desktop click behavior needs manual acceptance testing in a real window; the macOS PTY smoke results from 0.5.8 still stand, while Windows/Linux PTY, encrypted Desktop/Android cross-device behavior, and actual two-hour idle reclamation still await acceptance testing. The compatibility pipe path does not support resize or job control. The iOS client is collecting beta users and feedback through [iOS issue #20](https://github.com/liguobao/ds-harness-remote/issues/20).

---

[安装说明](https://github.com/liguobao/ds-harness-remote/blob/v0.5.9/README.zh.md#安装) · [Installation](https://github.com/liguobao/ds-harness-remote/blob/v0.5.9/README.md#install) · [完整改动 / Changelog](https://github.com/liguobao/ds-harness-remote/compare/v0.5.8...v0.5.9)
