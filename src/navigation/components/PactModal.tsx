import { useMemo, useState, useEffect } from 'react'
import { View, ScrollView } from 'react-native'
import { Navigation } from 'react-native-navigation'

import Button from '@/components/common/Button'
import { createStyle, openUrl } from '@/utils/tools'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import ModalContent from './ModalContent'
import { exitApp } from '@/utils/nativeModules/utils'
import { updateSetting } from '@/core/common'
import { initDeeplink } from '@/core/init/deeplink'
import settingState from '@/store/setting/state'

const Content = () => {
  const theme = useTheme()

  const openLicensePage = () => {
    void openUrl('http://www.apache.org/licenses/LICENSE-2.0')
  }

  const textLinkStyle = {
    ...styles.text,
    textDecorationLine: 'underline',
    color: theme['c-primary-font'],
    // fontSize: 15,
  } as const

  return (
    <View style={styles.main}>
      <Text style={styles.title} size={18} >许可协议</Text>
      <ScrollView style={styles.content} keyboardShouldPersistTaps={'always'}>
        {!settingState.setting['common.isAgreePact'] && <Text selectable style={styles.bold} >在使用本软件前，你（使用者）需阅读并同意本协议才可继续使用！{'\n'}</Text>}
        <Text selectable style={styles.text} >本软件基于开源项目 LX Music（洛雪音乐）移动版 <Text onPress={openLicensePage} style={textLinkStyle}>Apache License 2.0</Text> 进行二次开发，由 gongshang 负责修改、维护与分发，与原项目开发者及任何官方音乐平台均无关联。{'\n'}</Text>
        <Text selectable style={styles.text} >词语约定：本协议中的「本软件」指上述二次开发版本；「使用者」指安装并使用本软件的人；「音源接口」指用于获取在线音乐播放信息的第三方网络接口；「版权数据」指包括但不限于图像、音频、名称等在内的他人拥有所属版权的数据。{'\n'}</Text>
        <Text selectable style={styles.bold} >一、项目性质</Text>
        <Text selectable style={styles.text} >1.1 本软件为二次开发版本，仅供网络技术学习与交流使用；软件本体不包含任何音频数据，不具备直接获取音频的能力。{'\n'}</Text>
        <Text selectable style={styles.text} >1.2 本软件的音源接口来源于网络。软件在播放时所做的，仅是将歌曲名、艺术家等信息传递给音源接口，若接口返回了在线链接，软件即按该链接进行播放，无法校验其准确性，可能出现播放内容与预期不符或无法播放的情况。{'\n'}</Text>
        <Text selectable style={styles.bold} >二、使用授权</Text>
        <Text selectable style={styles.text} >2.1 本软件通过授权码（卡密）开通使用权限。授权码与设备一一绑定，请妥善保管；更换设备或遇到激活问题，请通过发售渠道联系处理。{'\n'}</Text>
        <Text selectable style={styles.text} >2.2 授权码仅限本人使用，禁止转让、共享或倒卖；因违规使用被回收的授权不予退还。{'\n'}</Text>
        <Text selectable style={styles.text} >2.3 使用授权到期后，相应功能将停止服务；卸载重装或清除软件数据会使设备绑定失效，请谨慎操作或提前联系处理。{'\n'}</Text>
        <Text selectable style={styles.bold} >三、数据与版权</Text>
        <Text selectable style={styles.text} >3.1 本软件的在线音频数据来自音源接口返回的网络链接，本软件不存储、不截留这些数据；使用过程中产生的版权数据，本软件不拥有其所有权。为避免侵权，请在 <Text style={styles.bold}>24 小时内</Text> 清除使用过程中产生的版权数据，请支持正版。{'\n'}</Text>
        <Text selectable style={styles.bold} >四、免责声明</Text>
        <Text selectable style={styles.text} >4.1 音源接口由第三方提供，可能随时变更、限流或失效，由此导致的播放失败、音质变化、内容差异等取决于接口本身；将尽力跟进修复，但不承诺实时可用。{'\n'}</Text>
        <Text selectable style={styles.text} >4.2 因使用或无法使用本软件所引起的任何性质的直接、间接损失，由使用者自行承担。{'\n'}</Text>
        <Text selectable style={styles.bold} >五、使用限制</Text>
        <Text selectable style={styles.text} >5.1 <Text style={styles.bold}>禁止在违反当地法律法规的情况下使用本软件</Text>，由此产生的一切责任由使用者承担。{'\n'}</Text>
        <Text selectable style={styles.text} >5.2 禁止对本软件进行反编译、二次分发或售卖；如需使用其技术能力，请遵守基础项目的开源协议自行获取。{'\n'}</Text>
        <Text selectable style={styles.bold} >六、接受协议</Text>
        <Text selectable style={styles.text} >6.1 若你安装并使用本软件，即视为已阅读并接受本协议全部条款。{'\n'}</Text>
        <Text selectable style={styles.text} >6.2 本协议如有修订恕不另行通知。{'\n'}</Text>
        <Text selectable style={styles.text} >本协议及本软件的修改与维护：gongshang</Text>
      </ScrollView>
    </View>
  )
}

const Footer = ({ componentId }: { componentId: string }) => {
  const theme = useTheme()
  const isAgreePact = useSettingValue('common.isAgreePact')
  // const checkUpdate = useDispatch('common', 'checkUpdate')
  const [time, setTime] = useState(20)

  const handleRejct = () => {
    exitApp()
    // Navigation.dismissOverlay(componentId)
  }

  const handleConfirm = () => {
    let _isAgreePact = isAgreePact
    if (!isAgreePact) updateSetting({ 'common.isAgreePact': true })
    void Navigation.dismissOverlay(componentId)
    if (!_isAgreePact) {
      setTimeout(() => {
        void initDeeplink()
      }, 2e3)
    }
  }


  const confirmBtn = useMemo(() => {
    if (isAgreePact) return { disabled: false, text: '关闭' }
    return time ? { disabled: true, text: `接受（${time}）` } : { disabled: false, text: '接受' }
  }, [isAgreePact, time])

  useEffect(() => {
    if (isAgreePact) return
    const timeoutTools = {
      timeout: null as NodeJS.Timeout | null,
      start() {
        this.timeout = setTimeout(() => {
          setTime(time => {
            time--
            if (time > 0) this.start()
            return time
          })
        }, 1000)
      },
      clear() {
        if (!this.timeout) return
        clearTimeout(this.timeout)
      },
    }
    timeoutTools.start()
    return () => {
      timeoutTools.clear()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {
        isAgreePact
          ? null
          : (
              <Text selectable style={styles.tip} size={13}>若你（使用者）接受以上协议，请点击下面的“接受”按钮签署本协议；若不接受，请点击“不接受”后退出软件并清除本软件的所有数据。</Text>
            )
      }
      <View style={styles.btns}>
        {
          isAgreePact
            ? null
            : (
                <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={handleRejct}>
                  <Text color={theme['c-button-font']}>不接受</Text>
                </Button>
              )
        }
        <Button disabled={confirmBtn.disabled} style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={handleConfirm}>
          <Text color={theme['c-button-font']}>{confirmBtn.text}</Text>
        </Button>
      </View>
    </>
  )
}

const PactModal = ({ componentId }: { componentId: string }) => {
  return (
    <ModalContent>
      <Content />
      <Footer componentId={componentId} />
    </ModalContent>
  )
}

const styles = createStyle({
  main: {
    // flexGrow: 0,
    flexShrink: 1,
    marginTop: 15,
    marginBottom: 10,
  },
  content: {
    flexGrow: 0,
    marginLeft: 5,
    marginRight: 5,
    paddingLeft: 10,
    paddingRight: 10,
  },
  title: {
    textAlign: 'center',
    marginBottom: 15,
  },
  part: {
    marginBottom: 10,
  },
  text: {
    fontSize: 14,
    textAlignVertical: 'bottom',
    marginBottom: 5,
  },
  bold: {
    fontSize: 14,
    textAlignVertical: 'bottom',
    fontWeight: 'bold',
  },
  tip: {
    textAlignVertical: 'bottom',
    fontWeight: 'bold',
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 15,
  },
  btns: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 15,
    paddingLeft: 15,
    // paddingRight: 15,
  },
  btn: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 10,
    alignItems: 'center',
    borderRadius: 4,
    marginRight: 15,
  },
})

export default PactModal

