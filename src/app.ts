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
import { importUserApi } from '@/core/userApi'

const AUTH_INFO_KEY = '@lx_app_auth_info'
const BASE_AUTH_URL = 'https://lx123.gongshangss.dpdns.org/source.js'

interface AuthData {
  token: string
  allowDownload: boolean
  expireTime: number | null
  planType: string
  sourceScript?: string
}

declare global {
  var lx: {
    fontSize: number
    isAuthorized: boolean
    userPermissions: {
      allowDownload: boolean
      planType: string
      expireTime: number | null
    }
    [key: string]: any
  }
}

// 校验 Token 并导入在线音源
export const verifyAndLoadAuth = async (token: string): Promise<AuthData | null> => {
  const cleanToken = token.trim()
  if (!cleanToken) return null

  const targetUrl = `${BASE_AUTH_URL}?token=${encodeURIComponent(cleanToken)}`

  try {
    const response = await fetch(targetUrl, { method: 'GET' })
    if (response.status === 200) {
      const text = await response.text()
      try {
        const json = JSON.parse(text)
        if (json.code === 200 && json.data) {
          const authData: AuthData = json.data
          if (authData.sourceScript && importUserApi) {
            await importUserApi(authData.sourceScript)
          }
          return authData
        }
      } catch (e) {
        if (text && importUserApi) {
          await importUserApi(text)
          const isPermanent = cleanToken.toLowerCase().startsWith('vip_')
          return {
            token: cleanToken,
            allowDownload: isPermanent,
            expireTime: isPermanent ? null : Date.now() + 15 * 86400 * 1000,
            planType: isPermanent ? 'permanent' : '15days',
          }
        }
      }
    }
    return null
  } catch (err) {
    console.error('鉴权网络异常:', err)
    return null
  }
}

const checkAppGuardBackground = async () => {
  global.lx.isAuthorized = false
  try {
    const savedInfoStr = await AsyncStorage.getItem(AUTH_INFO_KEY)
    if (savedInfoStr) {
      const localAuth: AuthData = JSON.parse(savedInfoStr)
      if (localAuth.expireTime && Date.now() > localAuth.expireTime) {
        await AsyncStorage.removeItem(AUTH_INFO_KEY)
      } else {
        const latestAuth = await verifyAndLoadAuth(localAuth.token)
        if (latestAuth) {
          global.lx.userPermissions = latestAuth
          global.lx.isAuthorized = true
        }
      }
    }
  } catch (e) {
    console.error('读取本地 Token 失败:', e)
  }
}

console.log('starting app...')
listenLaunchEvent()

void Promise.all([getFontSize(), windowSizeTools.init()]).then(async([fontSize]) => {
  global.lx.fontSize = fontSize
  bootLog('Font size setting loaded.')

  let isInited = false
  let handlePushedHomeScreen: () => void | Promise<void>

  const handleInit = async() => {
    if (isInited) return
    void initLog()
    const { default: init } = await import('@/core/init')
    try {
      handlePushedHomeScreen = await init()
    } catch (err: any) {
      void tipDialog({
        title: '初始化失败 (Init Failed)',
        message: `${(err.stack ?? err.message) as string}`,
        btnText: 'Exit',
        bgClose: false,
      }).then(() => exitApp())
      return
    }
    isInited ||= true
  }

  const { init: initNavigation, navigations } = await import('@/navigation')

  initNavigation(async() => {
    await handleInit()
    if (!isInited) return

    // 后台尝试读取 Token 并验证
    await checkAppGuardBackground()

    // 无论是否授权，都正常推入 HomeScreen（未授权时由 HomeScreen 的 Modal 遮罩拦住并提供输入框）
    await navigations.pushHomeScreen().then(() => {
      void handlePushedHomeScreen()
    }).catch((err: any) => {
      void tipDialog({
        title: 'Error',
        message: err.message,
        btnText: 'Exit',
        bgClose: false,
      }).then(() => exitApp())
    })
  })
}).catch((err) => {
  void tipDialog({
    title: '初始化失败 (Init Failed)',
    message: `${(err.stack ?? err.message) as string}`,
    btnText: 'Exit',
    bgClose: false,
  }).then(() => exitApp())
})
