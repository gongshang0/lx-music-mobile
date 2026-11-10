import versionActions from '@/store/version/action'
import versionState, { type InitState } from '@/store/version/state'
import { showVersionModal } from '@/navigation'
import { Navigation } from 'react-native-navigation'

export const showModal = () => {
  if (versionState.showModal) return
  versionActions.setVisibleModal(true)
  showVersionModal()
}

export const hideModal = (componentId: string) => {
  if (!versionState.showModal) return
  versionActions.setVisibleModal(false)
  void Navigation.dismissOverlay(componentId)
}

export const checkUpdate = async() => {
  // 🔒 私有分发版：屏蔽版本更新检查。
  // 官方仓库的最新版本号必然高于本魔改版，弹窗中的「更新」会引导下载官方 APK 覆盖安装，
  // 直接毁掉授权门禁和内置音源。版本更新完全由发布者控制，不走 App 内通道。
  return
}

export const downloadUpdate = () => {
  // 🔒 同上：屏蔽「更新」按钮的下载动作（无害空转，防止任何路径触发官方包下载）
}


export const setIgnoreVersion = (version: InitState['ignoreVersion']) => {
  versionActions.setIgnoreVersion(version)
  saveIgnoreVersion(version)
}
