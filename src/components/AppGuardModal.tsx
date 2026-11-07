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
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { importUserApi, setUserApi } from '@/core/userApi'
import { aesDecrypt } from '@/utils/nativeModules/crypto'

const AUTH_INFO_KEY = '@lx_app_auth_info'
const DEVICE_ID_KEY = '@lx_app_device_id'

// 💡 自定义域名为首选（国内可直连），workers.dev 为备用自动降级
const AUTH_HOSTS = [
  'https://lx-music-auth.gongshangss.dpdns.org',
  'https://lx-music-auth.gongshang13.workers.dev',
]

// 🎵 音源加密下发端点：返回 AES-256-CBC 加密信封(JSON)
const ENC_SOURCE_PATH = '/enc-source'

// 🔑 内置解密密钥（与服务器打包信封的密钥配对，base64 形式）
const SOURCE_KEY_B64 = 'KKFuyGf5ncF6UQaWM8LrrfmKjqQRBoFott4x9pUTulA='
const SOURCE_AES_MODE = 'AES/CBC/PKCS7Padding'

const REQUEST_TIMEOUT_MS = 15000

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
            if (line === 1) {
              // 线路1 拿不到:先试备用域名,再降级线路2
              if (response.status >= 400 && response.status < 500) continue
              continue
            }
            continue
          }

          if (line === 1) line1Fetched = true

          const envelopeText = await response.text()
          if (!envelopeText) {
            lastError = new Error(`信封响应为空 (线路${line} @ ${host})`)
            continue
          }

          let envelope: { ivB64?: string, ctB64?: string, alg?: string }
          try {
            envelope = JSON.parse(envelopeText)
          } catch (jsonErr) {
            lastError = new Error(`信封不是合法 JSON (线路${line} @ ${host})`)
            continue
          }
          if (!envelope.ivB64 || !envelope.ctB64) {
            lastError = new Error(`信封缺少 iv/密文字段 (线路${line} @ ${host})`)
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

          if (!scriptCode) {
            lastError = new Error(`解密结果为空 (线路${line} @ ${host})`)
            continue
          }

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

          await setUserApi(apiInfo.id || 'user_api')
          return true
        } catch (error) {
          lastError = error
          continue
        }
      }
      return false
    }

    // 主线路优先,失败再降级线路2
    const ok1 = await tryLine(1)
    if (ok1) return true
    const ok2 = await tryLine(2)
    if (ok2) return true

    if (showAlert) {
      const errName = lastError instanceof Error ? lastError.name : 'Unknown'
      const errMsg = lastError instanceof Error ? lastError.message : String(lastError)
      const isAbort = errName === 'AbortError'
      Alert.alert(
        isAbort ? '网络连接异常 🔌' : '激活失败 ✖',
        isAbort
          ? `15秒内未能连接到鉴权服务器。\n错误类型: ${errName}`
          : `错误类型: ${errName}\n详情: ${errMsg || '(空)'}${line1Fetched && ok1 === false ? '\n(线路1/线路2 均已尝试)' : ''}`,
      )
    }
    return false
  }

  // 启动时读取本地卡密
  useEffect(() => {
    const initCheck = async () => {
      try {
        const savedToken = await AsyncStorage.getItem(AUTH_INFO_KEY)
        if (savedToken) {
          const success = await verifyAndActivate(savedToken, false)
          if (success) {
            setLocked(false)
            setChecking(false)
            return
          }
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
    }
  }

  if (checking) {
    return (
      <View style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>正核验设备激活授权...</Text>
      </View>
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
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.maskContainer}
      >
        <View style={styles.card}>
          <View style={styles.iconBadge}>
            <Text style={styles.badgeText}>⚡</Text>
          </View>

          <Text style={styles.title}>设备激活中心</Text>
          <Text style={styles.subtitle}>请输入有效授权码解锁完整音源权限</Text>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="在此粘贴或输入激活授权码"
              placeholderTextColor="#94A3B8"
              value={inputToken}
              onChangeText={setInputToken}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, verifying && styles.buttonDisabled]}
            onPress={handleVerifySubmit}
            disabled={verifying}
            activeOpacity={0.85}
          >
            {verifying ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>验证激活并进入</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footerTip}>Cloudflare 高速鉴权网关保护中</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  centerScreen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { marginTop: 16, fontSize: 14, color: '#64748B' },
  maskContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  badgeText: { fontSize: 26 },
  title: { fontSize: 22, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#64748B', marginBottom: 24, textAlign: 'center' },
  inputWrapper: { width: '100%', marginBottom: 20 },
  input: {
    width: '100%',
    height: 52,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 18,
    color: '#0F172A',
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
  },
  button: {
    width: '100%',
    height: 52,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonDisabled: { backgroundColor: '#93C5FD' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  footerTip: { marginTop: 22, fontSize: 11, color: '#94A3B8' },
})
