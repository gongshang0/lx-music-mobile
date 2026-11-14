import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { importUserApi, setUserApi, removeUserApi } from '@/core/userApi'
import { state as userApiState } from '@/store/userApi'
import { compareVer } from '@/utils'
import { aesDecrypt } from '@/utils/nativeModules/crypto'

const AUTH_INFO_KEY = '@lx_app_auth_info'
const DEVICE_ID_KEY = '@lx_app_device_id'
// 💾 免重验窗口凭据：服务端随响应头下发卡密有效期，到期前启动不再联网验证
const AUTH_VALID_UNTIL_KEY = '@lx_app_auth_valid_until'
// 🔄 音源版本轮询：版本变了才触发重新激活（即使还在免重验窗口内）
const SOURCE_VER_KEY = '@lx_app_source_ver'
const SOURCE_VER_CHECK_KEY = '@lx_app_source_ver_check'
const SOURCE_VER_CHECK_INTERVAL = 24 * 3600 * 1000
// 🌐 音源版本查询端点（免验证轻端点，只回一个版本号）
const SOURCE_VER_PATH = '/source-ver'
// 🚀 App 新版本查询端点（免验证轻端点，服务器下发新版本号+下载链接+说明）
const APP_UPDATE_PATH = '/app-ver'
const APP_UPDATE_CHECK_KEY = '@lx_app_update_check'
const APP_UPDATE_DISMISS_KEY = '@lx_app_update_dismissed'

// 💡 大陆可直连的自定义域名（workers.dev 在大陆被运营商阻断，备用域名只会白等超时，已移除）
const AUTH_HOSTS = [
  'https://lx-music-auth.gongshangss.dpdns.org',
]

// 🎵 音源加密下发端点：返回 AES-256-CBC 加密信封(JSON)
const ENC_SOURCE_PATH = '/enc-source'

// 🔑 内置解密密钥（与服务器打包信封的密钥配对，base64 形式）
const SOURCE_KEY_B64 = 'KKFuyGf5ncF6UQaWM8LrrfmKjqQRBoFott4x9pUTulA='
const SOURCE_AES_MODE = 'AES/CBC/PKCS7Padding'

const REQUEST_TIMEOUT_MS = 8000

const fetchWithTimeout = async (url: string) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { method: 'GET', signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// 生成一次、永久保存的设备标识（卸载重装会重置）
const getDeviceId = async () => {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    await AsyncStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export const AppGuardModal: React.FC = () => {
  const [locked, setLocked] = useState<boolean>(true)
  const [checking, setChecking] = useState<boolean>(true)
  const [inputToken, setInputToken] = useState<string>('')
  const [verifying, setVerifying] = useState<boolean>(false)

  // 校验卡密 + 拉取加密音源信封 + 内存解密导入（双线路 × 双域名 降级 + 全链路诊断）
  const verifyAndActivate = async (token: string, showAlert = false): Promise<boolean> => {
    const cleanToken = token.trim()
    if (!cleanToken) return false

    const deviceId = await getDeviceId()
    let lastError: unknown = null
    let line1Fetched = false
    let seenExpiresAt: string | null = null
    let seenSourceVer: string | null = null
    // 🏷️ 每条线路成功导入的条目 ID（用于默认选中与旧条目清理）
    let line1Id: string | null = null
    let line2Id: string | null = null

    // 尝试某一线路:先走主域名,网络级失败再试备用域名
    const tryLine = async (line: number): Promise<boolean> => {
      for (const host of AUTH_HOSTS) {
        try {
          const response = await fetchWithTimeout(
            `${host}${ENC_SOURCE_PATH}?token=${encodeURIComponent(cleanToken)}&device=${encodeURIComponent(deviceId)}&line=${line}`,
          )

          if (response.status !== 200) {
            const errorText = await response.text()
            lastError = new Error(
              `HTTP ${response.status} @ 线路${line} ${host}\n服务端返回: ${errorText.slice(0, 120)}`,
            )
            // 线路1 失败：先试备用域名，全部域名失败后由外层降级线路2
            continue
          }

          if (line === 1) line1Fetched = true

          // 📅 记录服务端下发的卡密有效期（免重验缓存凭据，永久卡会是远期时间）
          if (!seenExpiresAt) {
            try { seenExpiresAt = response.headers.get('X-Card-Expires-At') } catch (e) { /* 忽略 */ }
          }
          // 🔄 记录音源版本号（激活完成时同步保存）
          if (!seenSourceVer) {
            try { seenSourceVer = response.headers.get('X-Source-Version') } catch (e) { /* 忽略 */ }
          }

          const envelopeText = await response.text()
          if (!envelopeText) {
            lastError = new Error(`信封响应为空 (线路${line} @ ${host})`)
            continue
          }

          let envelope: { format?: string, alg?: string, ivB64?: string, ctB64?: string }
          try {
            envelope = JSON.parse(envelopeText)
          } catch (jsonErr) {
            lastError = new Error(`音源更新失败: 信封不是合法 JSON (线路${line} @ ${host})`)
            continue
          }
          // 🛡️ 硬校验:格式/算法不匹配的信封一律拒收,绝不把错误数据喂给音源引擎
          if (envelope.format !== 'lx-source-enc') {
            lastError = new Error(
              `音源更新失败: 信封格式校验不通过 (线路${line} @ ${host})\nformat=${envelope.format ?? '(缺失)'}，应为 lx-source-enc`,
            )
            continue
          }
          if (envelope.alg !== 'AES-256-CBC') {
            lastError = new Error(
              `音源更新失败: 信封算法不匹配 (线路${line} @ ${host})\nalg=${envelope.alg ?? '(缺失)'}，应为 AES-256-CBC`,
            )
            continue
          }
          if (!envelope.ivB64 || !envelope.ctB64) {
            lastError = new Error(`音源更新失败: 信封缺少 iv/密文字段 (线路${line} @ ${host})`)
            continue
          }

          // 🔓 内存里解密出明文音源脚本(不落盘)
          let scriptCode: string
          try {
            scriptCode = await aesDecrypt(envelope.ctB64, SOURCE_KEY_B64, envelope.ivB64, SOURCE_AES_MODE)
          } catch (decErr) {
            const msg = decErr instanceof Error ? decErr.message : String(decErr)
            lastError = new Error(`音源解密失败 (线路${line}): ${msg}`)
            continue
          }

          if (!scriptCode || scriptCode.length < 1000) {
            // 解密失败会返回空串/异常短串(Library catch 吞错的话),一律视为损坏
            lastError = new Error(
              `音源更新失败: 解密结果异常 (线路${line} @ ${host})\n长度=${scriptCode?.length ?? 0}，疑似密钥不匹配或信封损坏`,
            )
            continue
          }

          // 🏷️ 统一改名为「线路1/线路2」，设置 → 自定义源列表按下标对号入座
          scriptCode = scriptCode.replace(
            /(\*\s*@name\s+)[^\r\n]*/,
            line === 1 ? '$1线路1' : '$1线路2',
          )

          if (!importUserApi || !setUserApi) {
            lastError = new Error('core/userApi 缺少导出方法 (circular import?)')
            break
          }

          let apiInfo: { id?: string } | null = null
          try {
            apiInfo = await importUserApi(scriptCode)
          } catch (importErr) {
            const msg = importErr instanceof Error ? importErr.message : String(importErr)
            lastError = new Error(`音源导入抛出异常 (线路${line}): ${msg}`)
            continue
          }

          if (!apiInfo) {
            lastError = new Error(
              `音源导入返回空 (线路${line})。脚本长度=${scriptCode.length}\n开头100字: ${scriptCode.slice(0, 100)}`,
            )
            continue
          }

          if (line === 1) line1Id = apiInfo.id || null
          else line2Id = apiInfo.id || null
          return true
        } catch (error) {
          lastError = error
          continue
        }
      }
      return false
    }

    // 💾 激活成功后，把「免重验窗口」和「音源版本」写入本地
    // 有效期：缓存到卡密到期为止（服务端没下发则兜底 24h，上限 30 天）
    const saveAuthCache = async () => {
      try {
        const expMs = Date.parse(seenExpiresAt || '')
        const ttl = Number.isFinite(expMs) ? Math.max(0, expMs - Date.now()) : 24 * 3600 * 1000
        const capped = Math.min(ttl, 30 * 24 * 3600 * 1000)
        if (capped > 0) {
          await AsyncStorage.setItem(AUTH_VALID_UNTIL_KEY, String(Date.now() + capped))
        }
        if (seenSourceVer != null) {
          await AsyncStorage.setItem(SOURCE_VER_KEY, seenSourceVer)
        }
        await AsyncStorage.setItem(SOURCE_VER_CHECK_KEY, String(Date.now() + SOURCE_VER_CHECK_INTERVAL))
      } catch (e) {
        console.error('写入授权缓存失败:', e)
      }
    }

    // 📦 双线路并行拉取：线路1 = 酷我单版（默认使用），线路2 = 5音聚合秒切（设置内可切换）
    // 🚀 线路1 成功立即放行进入 App，不等线路2；线路2 转后台收尾（失败 30s 后静默重试一次），
    //    音源自动更新走 24h 版本轮询触发的重新激活，不受影响
    const p1 = tryLine(1)
    const p2 = tryLine(2)
    const ok1 = await p1
    if (ok1 && line1Id) {
      // 🧹 旧条目清理：把不属于本次两条线路的条目（旧版本音源、历史遗留）一次性清掉，
      // 设置列表里永远只有「线路1 / 线路2」两条——「添加音源」入口虽已关闭，但升级设备上有旧名条目
      // （此刻线路2 若已抢先导入，其条目 ID 已被记录，同样会排除）
      try {
        const staleIds = userApiState.list
          .filter(item => item.id !== line1Id && item.id !== line2Id)
          .map(item => item.id)
        if (staleIds.length) await removeUserApi(staleIds)
      } catch (e) {
        console.error('旧音源条目清理失败(忽略):', e)
      }
      // 🎯 默认音源 = 线路1（酷我单版，稳定）
      try {
        await setUserApi(line1Id)
      } catch (e) {
        console.error('默认音源设置失败(忽略):', e)
      }
      await saveAuthCache()
      // 🌙 线路2 后台收尾：落定后统一清理旧条目；失败不打扰用户，等下次激活/版本轮询自动重试
      void (async() => {
        let ok2Retry = await p2.catch(() => false)
        if (!ok2Retry) {
          await new Promise(resolve => setTimeout(resolve, 30000))
          ok2Retry = await tryLine(2).catch(() => false)
        }
        try {
          const staleIds = userApiState.list
            .filter(item => item.id !== line1Id && item.id !== line2Id)
            .map(item => item.id)
          if (staleIds.length) await removeUserApi(staleIds)
        } catch (e) {
          console.error('旧音源条目清理失败(忽略):', e)
        }
        if (!ok2Retry) console.log('线路2 后台导入未成功，等待下次激活/版本轮询自动重试')
      })()
      return true
    }

    // 线路1 失败 → 退而用线路2；两条都失败才报错
    const ok2 = await p2
    if (ok2 && line2Id) {
      // 🧹 旧条目清理（同上）
      try {
        const staleIds = userApiState.list
          .filter(item => item.id !== line1Id && item.id !== line2Id)
          .map(item => item.id)
        if (staleIds.length) await removeUserApi(staleIds)
      } catch (e) {
        console.error('旧音源条目清理失败(忽略):', e)
      }
      try {
        await setUserApi(line2Id)
      } catch (e) {
        console.error('默认音源设置失败(忽略):', e)
      }
      await saveAuthCache()
      return true
    }

    if (showAlert) {
      const errName = lastError instanceof Error ? lastError.name : 'Unknown'
      const errMsg = lastError instanceof Error ? lastError.message : String(lastError)
      const isAbort = errName === 'AbortError'
      Alert.alert(
        isAbort ? '网络连接异常 🔌' : '激活失败 ✖',
        isAbort
          ? `8秒内未能连接到鉴权服务器。请检查网络后重试。\n错误类型: ${errName}`
          : `错误类型: ${errName}\n详情: ${errMsg || '(空)'}${line1Fetched ? '\n(线路1/线路2 均已尝试)' : ''}`,
      )
    }
    return false
  }

  // 🔄 音源版本轮询：每 24h 一次轻请求；版本变了 → 强制重新激活拉取最新音源
  const checkSourceVersion = async (token: string): Promise<void> => {
    try {
      const nextCheckAt = await AsyncStorage.getItem(SOURCE_VER_CHECK_KEY)
      if (nextCheckAt && Date.now() < Number(nextCheckAt)) return

      const res = await fetchWithTimeout(`${AUTH_HOSTS[0]}${SOURCE_VER_PATH}`)
      await AsyncStorage.setItem(SOURCE_VER_CHECK_KEY, String(Date.now() + SOURCE_VER_CHECK_INTERVAL))
      if (res.status !== 200) return
      const j = JSON.parse(await res.text())
      const serverVer = typeof j?.version === 'string' ? j.version : ''
      const storedVer = await AsyncStorage.getItem(SOURCE_VER_KEY)
      if (serverVer && serverVer !== storedVer) {
        console.log(`音源版本变化(${storedVer ?? '无'} → ${serverVer})，触发重新激活`)
        await verifyAndActivate(token, false)
      }
    } catch (e) {
      // 网络/解析失败 → 静默继续用本地缓存（下次再试）
      try { await AsyncStorage.setItem(SOURCE_VER_CHECK_KEY, String(Date.now() + SOURCE_VER_CHECK_INTERVAL)) } catch (e2) { /* 忽略 */ }
    }
  }

  // 🚀 App 新版本检查：每 24h 轻请求一次 /app-ver；
  // 服务器 version 高于本机且该版本未被「以后再说」跳过时，弹窗引导跳转下载
  const checkAppUpdate = async (): Promise<void> => {
    try {
      const nextCheckAt = await AsyncStorage.getItem(APP_UPDATE_CHECK_KEY)
      if (nextCheckAt && Date.now() < Number(nextCheckAt)) return

      const res = await fetchWithTimeout(`${AUTH_HOSTS[0]}${APP_UPDATE_PATH}`)
      await AsyncStorage.setItem(APP_UPDATE_CHECK_KEY, String(Date.now() + SOURCE_VER_CHECK_INTERVAL))
      if (res.status !== 200) return
      const j = JSON.parse(await res.text())
      const serverVer = typeof j?.version === 'string' ? j.version : ''
      const downloadUrl = typeof j?.url === 'string' ? j.url : ''
      const notes = typeof j?.notes === 'string' ? j.notes : ''
      // 未发布新版（url 为空）或版本不高 → 静默跳过
      if (!serverVer || !downloadUrl) return
      const localVer = process.versions.app || '0.0.0'
      if (compareVer(localVer, serverVer) !== -1) return
      const dismissed = await AsyncStorage.getItem(APP_UPDATE_DISMISS_KEY)
      if (dismissed === serverVer) return

      Alert.alert(
        `🚀 发现新版本 ${serverVer}`,
        `当前版本：${localVer}${notes ? `\n\n更新说明：\n${notes}` : ''}`,
        [
          {
            text: '以后再说',
            onPress: () => { void AsyncStorage.setItem(APP_UPDATE_DISMISS_KEY, serverVer).catch(() => {}) },
          },
          {
            text: '立即更新',
            onPress: () => { void Linking.openURL(downloadUrl).catch(() => {}) },
          },
        ],
        { cancelable: false },
      )
    } catch (e) {
      // 网络/解析失败 → 静默（下次再试）
      try { await AsyncStorage.setItem(APP_UPDATE_CHECK_KEY, String(Date.now() + SOURCE_VER_CHECK_INTERVAL)) } catch (e2) { /* 忽略 */ }
    }
  }

  // 启动时读取本地卡密
  useEffect(() => {
    const initCheck = async () => {
      try {
        const savedToken = await AsyncStorage.getItem(AUTH_INFO_KEY)
        const validUntil = await AsyncStorage.getItem(AUTH_VALID_UNTIL_KEY)
        if (savedToken && validUntil && Date.now() < Number(validUntil)) {
          // ✅ 本期免重验窗口内：直接放行，不联网（音源版本由每 24h 的轻轮询兜底刷新）
          setLocked(false)
          setChecking(false)
          checkSourceVersion(savedToken) // 异步后台查,不阻塞进入
          void checkAppUpdate() // 异步后台查,不阻塞进入
          return
        }
        if (savedToken) {
          const success = await verifyAndActivate(savedToken, false)
          if (success) {
            setLocked(false)
            setChecking(false)
            void checkAppUpdate()
            return
          }
          // 重新验证失败 → 缓存凭据作废，进入手动激活界面
          // 把本地保存的激活码回填到输入框，避免用户凭记忆重新输入
          await AsyncStorage.removeItem(AUTH_VALID_UNTIL_KEY)
          setInputToken(savedToken)
        }
      } catch (e) {
        console.error('读取本地授权缓存失败:', e)
      }
      setLocked(true)
      setChecking(false)
    }

    initCheck()
  }, [])

  // 用户提交验证
  const handleVerifySubmit = async () => {
    const token = inputToken.trim()
    if (!token) {
      Alert.alert('提示', '请输入有效授权码激活应用')
      return
    }

    setVerifying(true)
    const success = await verifyAndActivate(token, true)
    setVerifying(false)

    if (success) {
      await AsyncStorage.setItem(AUTH_INFO_KEY, token)
      setLocked(false)
      Alert.alert('激活成功 🎉', '授权码验证通过，在线音乐已解锁！')
      void checkAppUpdate()
    }
  }

  if (checking) {
    return (
      <LinearGradient
        start={{ x: 0, y: 0 }}
        end={{ x: 0.25, y: 1 }}
        locations={[0, 0.62, 1]}
        colors={['#1B4A8F', '#267DFF', '#5CA9FF']}
        style={styles.centerScreen}
      >
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>正核验设备激活授权...</Text>
      </LinearGradient>
    )
  }

  if (!locked) return null

  return (
    <Modal
      visible={locked}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // 🔒 阻止物理返回键关闭门禁
      }}
    >
      <LinearGradient
        start={{ x: 0, y: 0 }}
        end={{ x: 0.25, y: 1 }}
        locations={[0, 0.62, 1]}
        colors={['#1B4A8F', '#267DFF', '#5CA9FF']}
        style={styles.maskContainer}
      >
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <View style={styles.card}>
            <LinearGradient
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              colors={['#267DFF', '#5CA9FF']}
              style={styles.iconBadge}
            >
              <Text style={styles.badgeText}>⚡</Text>
            </LinearGradient>

            <Text style={styles.title}>设备激活中心</Text>
            <Text style={styles.subtitle}>请输入有效授权码解锁完整音源权限</Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="在此粘贴或输入激活授权码"
                placeholderTextColor="#B6BDCA"
                value={inputToken}
                onChangeText={setInputToken}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            <TouchableOpacity
              style={[styles.buttonWrapper, verifying && styles.buttonDisabled]}
              onPress={handleVerifySubmit}
              disabled={verifying}
              activeOpacity={0.85}
            >
              <LinearGradient
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                colors={['#267DFF', '#5CA9FF']}
                style={styles.button}
              >
                {verifying ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.buttonText}>验证激活并进入</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerTip}>Cloudflare 高速鉴权网关保护中</Text>
        </KeyboardAvoidingView>
      </LinearGradient>
    </Modal>
  )
}

const styles = StyleSheet.create({
  // 中间层 KeyboardAvoidingView 需要自带居中（外层渐变容器的居中不会传递给它的子元素）
  flex: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { marginTop: 16, fontSize: 14, color: 'rgba(255, 255, 255, 0.8)' },
  maskContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 26,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#0A2350',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 12,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#267DFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  badgeText: { fontSize: 24, color: '#FFFFFF' },
  title: { fontSize: 19, fontWeight: '700', color: '#222A38', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#8A93A3', marginBottom: 22, textAlign: 'center' },
  inputWrapper: { width: '100%', marginBottom: 14 },
  input: {
    width: '100%',
    height: 48,
    backgroundColor: '#F8F9FC',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#222A38',
    fontSize: 14,
    borderWidth: 1.5,
    borderColor: '#DDE3EE',
  },
  buttonWrapper: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#267DFF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.6 },
  button: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 2 },
  footerTip: { marginTop: 22, fontSize: 11, color: 'rgba(255, 255, 255, 0.55)' },
})
