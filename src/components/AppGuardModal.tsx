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

const AUTH_INFO_KEY = '@lx_app_auth_info'
const DEVICE_ID_KEY = '@lx_app_device_id'

// 💡 自定义域名为首选（国内可直连），workers.dev 为备用自动降级
const AUTH_HOSTS = [
  'https://lx-music-auth.gongshangss.dpdns.org/source.js',
  'https://lx-music-auth.gongshang13.workers.dev/source.js',
]

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
  const [inputToken, setInputTokdn] = useState<string>('')
  const [verifying, setVerifying] = useState<boolean>(false)

  // 校验卡密并设为默认在线音源（多域名自动降级 + 全链路诊断）
  const verifyAndActivate = async (token: string, showAlert = false): Promise<boolean> => {
    const cleanToken = token.trim()
    if (!cleanToken) return false

    const deviceId = await getDeviceId()
    let lastError: unknown = null

    for (const host of AUTH_HOSTS) {
      try {
        const response = await fetchWithTimeout(
          `${host}?token=${encodeURIComponent(cleanToken)}&device=${encodeURIComponent(deviceId)}`,
        )

        if (response.status !== 200) {
          const errorText = await response.text()
          lastError = new Error(
            `HTTP ${response.status} @ ${host}\n服务端返回: ${errorText.slice(0, 120)}`,
          )
          // 4xx = 卡密问题或限流，服务器正常，不必再试其他域名
          if (response.status >= 400 && response.status < 500) break
          continue
        }

        const scriptCode = await response.text()

        if (!scriptCode) {
          lastError = new Error(`响应为空 (status=${response.status} @ ${host})`)
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
          lastError = new Error(`音源导入抛出异常: ${msg}`)
          break
        }

        if (!apiInfo) {
          lastError = new Error(
            `音源导入返回空。脚本长度=${scriptCode.length}\n开头100字: ${scriptCode.slice(0, 100)}`,
          )
          break
        }

        await setUserApi(apiInfo.id || 'user_api')
        return true
      } catch (error) {
        lastError = error
        continue
      }
    }

    if (showAlert) {
      const errName = lastError instanceof Error ? lastError.name : 'Unknown'
      const errMsg = lastError instanceof Error ? lastError.message : String(lastError)
      const isAbort = errName === 'AbortError'
      Alert.alert(
        isAbort ? '网络连接异常 🔌' : '激活失败 ✖',
        isAbort
          ? `15秒内未能连接到鉴权服务器。\n错误类型: ${errName}`
          : `错误类型: ${errName}\n详情: ${errMsg || '(空)'}`,
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
    const token = inputTokdn.trim()
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
              value={inputTokdn}
              onChangeText={setInputTokdn}
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
