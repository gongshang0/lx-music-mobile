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
const BASE_AUTH_URL = 'https://lx123.gongshangss.dpdns.org/source.js'

export const AppGuardModal: React.FC = () => {
  const [locked, setLocked] = useState<boolean>(true)
  const [checking, setChecking] = useState<boolean>(true)
  const [inputToken, setInputToken] = useState<string>('')
  const [verifying, setVerifying] = useState<boolean>(false)

  // 1. 校验卡密并设为默认在线音源
  const verifyAndActivate = async (token: string, showAlert = false): Promise<boolean> => {
    const cleanToken = token.trim()
    if (!cleanToken) return false

    const targetUrl = `${BASE_AUTH_URL}?token=${encodeURIComponent(cleanToken)}`

    try {
      const response = await fetch(targetUrl, { method: 'GET' })
      
      if (response.status === 200) {
        const scriptCode = await response.text()
        if (scriptCode && importUserApi) {
          const apiInfo = await importUserApi(scriptCode)
          const targetApiId = apiInfo?.id || 'user_api'
          if (setUserApi) {
            await setUserApi(targetApiId)
          }
          return true
        }
      } else {
        // 如果服务器返回了 401/403 等状态，尝试读取错误信息
        const errorText = await response.text()
        console.warn('服务端鉴权未通过:', response.status, errorText)
      }
      return false
    } catch (error: any) {
      console.error('鉴权或音源加载网络异常:', error)
      // 💡 如果是手动点击验证触发的异常，弹窗显示具体错误（如网络不通、DNS解析失败）
      if (showAlert) {
        Alert.alert(
          '网络连接异常 🔌',
          `无法连接到鉴权服务器。\n错误详情: ${error?.message || String(error)}`
        )
      }
      return false
    }
  }

  // 2. 启动时读取本地卡密
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

  // 3. 用户提交验证
  const handleVerifySubmit = async () => {
    const token = inputToken.trim()
    if (!token) {
      Alert.alert('提示', '请输入有效授权码激活应用')
      return
    }

    setVerifying(true)
    // 传入 true，代表如果是网络断开或请求抛错，会弹窗提示详细原因
    const success = await verifyAndActivate(token, true)
    setVerifying(false)

    if (success) {
      await AsyncStorage.setItem(AUTH_INFO_KEY, token)
      setLocked(false)
      Alert.alert('激活成功 🎉', '授权码验证通过，在线音乐已解锁！')
    } else {
      // 如果不是网络异常（即服务器正常返回了拒绝，或验证没过）
      // 提示用户卡密无效或过期
      Alert.alert(
        '激活失败 ❌',
        '授权码无效、已过期或网络未联通，请检查后重新输入。'
      )
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
