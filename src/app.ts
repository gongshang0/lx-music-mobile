import '@/utils/errorHandle'
import { init as initLog } from '@/utils/log'
import { bootLog, getBootLog } from '@/utils/bootLog'
import '@/config/globalData'
import { getFontSize } from '@/utils/data'
import { exitApp } from './utils/nativeModules/utils'
import { windowSizeTools } from './utils/windowSizeTools'
import { listenLaunchEvent } from './navigation/regLaunchedEvent'
import { tipDialog } from './utils/tools'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { importUserApi } from '@/core/userApi' // LX 自定义音源导入函数

const AUTH_CODE_KEY = '@lx_app_auth_token'
const BASE_SOURCE_URL = 'https://lx123.gongshangss.dpdns.org/source.js'

/**
 * 校验授权码并动态加载在线音源
 */
const verifyAndLoadSource = async (token: string): Promise<boolean> => {
  const cleanToken = token.trim()
  if (!cleanToken) return false

  const targetUrl = `${BASE_SOURCE_URL}?token=${encodeURIComponent(cleanToken)}`

  try {
    const response = await fetch(targetUrl, { method: 'GET' })
    if (response.status === 200) {
      const scriptCode = await response.text()
      if (scriptCode && importUserApi) {
        // 自动将该 Cloudflare 鉴权音源加载为默认在线音源
        await importUserApi(scriptCode)
      }
      return true
    }
    return false
  } catch (err) {
    console.error('鉴权请求异常:', err)
    return false
  }
}

/**
 * 门禁拦截逻辑：检查本地 token，无 token 或校验失败则弹窗强行要求输入
 */
const checkAppGuard = async (): Promise<boolean> => {
  try {
    const savedToken = await AsyncStorage.getItem(AUTH_CODE_KEY)
    if (savedToken) {
      const isValid = await verifyAndLoadSource(savedToken)
      if (isValid) return true
    }
  } catch (e) {
    console.error('读取本地 token 失败', e)
  }

  // 本地无授权码或校验失败，强行停留在激活界面
  return new Promise((resolve) => {
    const promptForAuth = () => {
      // 弹出包含输入框的强拦截激活框
      void tipDialog({
        title: '🔒 设备激活 (App Guard)',
        message: '请输入有效授权码激活应用：',
        btnText: '验证激活',
        bgClose: false,
        isPrompt: true, // 启用输入框模式
        placeholder: '在此输入授权码',
      }).then(async (inputToken?: string) => {
        if (!inputToken || !inputToken.trim()) {
          void tipDialog({
            title: '提示',
            message: '授权码不能为空！',
            btnText: '重新输入',
            bgClose: false,
          }).then(() => promptForAuth())
          return
        }

        const success = await verifyAndLoadSource(inputToken.trim())
        if (success) {
          await AsyncStorage.setItem(AUTH_CODE_KEY, inputToken.trim())
          void tipDialog({
            title: '激活成功',
            message: '授权验证通过，欢迎使用！',
            btnText: '进入应用',
            bgClose: false,
          }).then(() => resolve(true))
        } else {
          void tipDialog({
            title: '激活失败',
            message: '授权码无效或已过 15 天有效期，请联系管理员获取最新授权码。',
            btnText: '重新输入',
            bgClose: false,
          }).then(() => promptForAuth())
        }
      })
    }

    promptForAuth()
  })
}

console.log('starting app...')
listenLaunchEvent()

void Promise.all([getFontSize(), windowSizeTools.init()]).then(async([fontSize]) => {
  global.lx.fontSize = fontSize
  bootLog('Font size setting loaded.')

  let isInited = false
  let handlePushedHomeScreen: () => void | Promise<void>

  const tryGetBootLog = () => {
    try {
      return getBootLog()
    } catch (err) {
      return 'Get boot log failed.'
    }
  }

  const handleInit = async() => {
    if (isInited) return
    void initLog()
    const { default: init } = await import('@/core/init')
    try {
      handlePushedHomeScreen = await init()
    } catch (err: any) {
      void tipDialog({
        title: '初始化失败 (Init Failed)',
        message: `Boot Log:\n${tryGetBootLog()}\n\n${(err.stack ?? err.message) as string}`,
        btnText: 'Exit',
        bgClose: false,
      }).then(() => {
        exitApp()
      })
      return
    }
    isInited ||= true
  }

  const { init: initNavigation, navigations } = await import('@/navigation')

  initNavigation(async() => {
    await handleInit()
    if (!isInited) return

    // 🚪 在进入主界面之前触发 App Guard 授权门禁拦截
    await checkAppGuard()

    // 授权通过后，推入主界面
    await navigations.pushHomeScreen().then(() => {
      void handlePushedHomeScreen()
    }).catch((err: any) => {
      void tipDialog({
        title: 'Error',
        message: err.message,
        btnText: 'Exit',
        bgClose: false,
      }).then(() => {
        exitApp()
      })
    })
  })
}).catch((err) => {
  void tipDialog({
    title: '初始化失败 (Init Failed)',
    message: `Boot Log:\n\n${(err.stack ?? err.message) as string}`,
    btnText: 'Exit',
    bgClose: false,
  }).then(() => {
    exitApp()
  })
})
