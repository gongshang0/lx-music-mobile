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

// 定义授权信息接口
interface AuthData {
  token: string
  allowDownload: boolean
  expireTime: number | null // null 代表永久
  planType: string
  sourceScript?: string
}

// 扩展全局 lx 权限对象类型
declare global {
  var lx: {
    fontSize: number
    userPermissions: {
      allowDownload: boolean
      planType: string
      expireTime: number | null
    }
    [key: string]: any
  }
}

/**
 * 校验 Token，获取动态权限与最新音源代码
 */
const verifyTokenAndFetchSource = async (token: string): Promise<AuthData | null> => {
  const cleanToken = token.trim()
  if (!cleanToken) return null

  const targetUrl = `${BASE_AUTH_URL}?token=${encodeURIComponent(cleanToken)}`

  try {
    const response = await fetch(targetUrl, { method: 'GET' })
    if (response.status === 200) {
      const text = await response.text()

      // 1. 如果返回的是 JSON 格式元数据
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
        // 2. 如果后端直接返回 JS 脚本文本（兼容模式）
        if (text && importUserApi) {
          await importUserApi(text)
          // 默认根据 Token 前缀判断，或者给默认权限
          const isPermanent = cleanToken.toLowerCase().startsWith('vip_')
          return {
            token: cleanToken,
            allowDownload: isPermanent, // VIP 允许下载，其他禁止
            expireTime: isPermanent ? null : Date.now() + 15 * 86400 * 1000,
            planType: isPermanent ? 'permanent' : '15days',
          }
        }
      }
    }
    return null
  } catch (err) {
    console.error('鉴权请求异常:', err)
    return null
  }
}

/**
 * 设置全局权限标记
 */
const applyPermissions = (authData: AuthData) => {
  global.lx.userPermissions = {
    allowDownload: authData.allowDownload,
    planType: authData.planType,
    expireTime: authData.expireTime,
  }
}

/**
 * 开屏门禁拦截逻辑
 */
const checkAppGuard = async (): Promise<boolean> => {
  try {
    const savedInfoStr = await AsyncStorage.getItem(AUTH_INFO_KEY)
    if (savedInfoStr) {
      const localAuth: AuthData = JSON.parse(savedInfoStr)

      // 本地检查是否已过期 (非永久且已超时)
      if (localAuth.expireTime && Date.now() > localAuth.expireTime) {
        await AsyncStorage.removeItem(AUTH_INFO_KEY)
      } else {
        // 在线重新核验更新音源与最新权限
        const latestAuth = await verifyTokenAndFetchSource(localAuth.token)
        if (latestAuth) {
          applyPermissions(latestAuth)
          await AsyncStorage.setItem(AUTH_INFO_KEY, JSON.stringify(latestAuth))
          return true
        }
      }
    }
  } catch (e) {
    console.error('读取本地授权数据失败:', e)
  }

  // 需要用户激活
  return new Promise((resolve) => {
    const promptForAuth = () => {
      void tipDialog({
        title: '🔒 设备激活 (App Guard)',
        message: '请输入有效授权码激活应用：',
        btnText: '验证激活',
        bgClose: false,
        isPrompt: true,
        placeholder: '输入 15天 / 30天 / 永久授权码',
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

        const authData = await verifyTokenAndFetchSource(inputToken.trim())
        if (authData) {
          applyPermissions(authData)
          await AsyncStorage.setItem(AUTH_INFO_KEY, JSON.stringify(authData))

          const expireTip = authData.expireTime
            ? `有效期至：${new Date(authData.expireTime).toLocaleDateString()}`
            : '尊贵永久授权'

          void tipDialog({
            title: '激活成功',
            message: `验证通过 (${authData.planType.toUpperCase()})\n${expireTip}\n下载权限：${
              authData.allowDownload ? '已开启' : '未开启 (仅限在线播放)'
            }`,
            btnText: '进入应用',
            bgClose: false,
          }).then(() => resolve(true))
        } else {
          void tipDialog({
            title: '激活失败',
            message: '授权码无效或已过期，请联系管理员。',
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

    // 门禁拦截 + 动态权限加载
    await checkAppGuard()

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
    message: `${(err.stack ?? err.message) as string}`,
    btnText: 'Exit',
    bgClose: false,
  }).then(() => {
    exitApp()
  })
})
