import React, { useEffect, useState } from 'react'
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

const AUTH_CODE_KEY = '@lx_app_auth_token'
const BASE_SOURCE_URL = 'https://lx123.gongshangss.dpdns.org/source.js'

interface AppGuardProps {
  children: React.ReactNode
  onAuthSuccess?: (sourceUrl: string, token: string) => void
}

export const AppGuard: React.FC<AppGuardProps> = ({ children, onAuthSuccess }) => {
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [inputToken, setInputToken] = useState<string>('')
  const [verifying, setVerifying] = useState<boolean>(false)

  const requestVerify = async (token: string): Promise<boolean> => {
    const cleanToken = token.trim()
    if (!cleanToken) return false
    const targetUrl = `${BASE_SOURCE_URL}?token=${encodeURIComponent(cleanToken)}`

    try {
      const response = await fetch(targetUrl, { method: 'GET' })
      return response.status === 200
    } catch (error) {
      return false
    }
  }

  const handleAuthPass = (token: string) => {
    const activeSourceUrl = `${BASE_SOURCE_URL}?token=${encodeURIComponent(token.trim())}`
    setIsAuthorized(true)
    if (onAuthSuccess) {
      onAuthSuccess(activeSourceUrl, token.trim())
    }
  }

  useEffect(() => {
    const initCheck = async () => {
      try {
        const savedToken = await AsyncStorage.getItem(AUTH_CODE_KEY)
        if (savedToken) {
          const isValid = await requestVerify(savedToken)
          if (isValid) {
            handleAuthPass(savedToken)
            setLoading(false)
            return
          }
        }
      } catch (e) {
        console.error(e)
      }
      setIsAuthorized(false)
      setLoading(false)
    }

    initCheck()
  }, [])

  const handleVerifySubmit = async () => {
    const token = inputToken.trim()
    if (!token) {
      Alert.alert('提示', '请输入有效授权码激活应用')
      return
    }

    setVerifying(true)
    const success = await requestVerify(token)
    setVerifying(false)

    if (success) {
      await AsyncStorage.setItem(AUTH_CODE_KEY, token)
      handleAuthPass(token)
    } else {
      Alert.alert(
        '激活失败',
        '授权码无效或已过 15 天有效期，请联系管理员获取最新授权码。',
        [{ text: '确定' }]
      )
    }
  }

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>正核验设备激活授权...</Text>
      </View>
    )
  }

  return (
    <View style={styles.flex1}>
      {children}

      {!isAuthorized && (
        <Modal visible transparent={false} animationType="fade" statusBarTranslucent>
          <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
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
                  placeholder="请输入激活授权码"
                  placeholderTextColor="#4B5563"
                  value={inputToken}
                  onChangeText={setInputToken}
                  autoCapitalize="none"
                  autoCorrect={false}
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
                  <Text style={styles.buttonText}>验证并进入应用</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.footerTip}>连接至 Cloudflare 高速安全鉴权节点</Text>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  centerScreen: {
    flex: 1,
    backgroundColor: '#0F1115',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  maskContainer: {
    flex: 1,
    backgroundColor: '#0F1115',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#161922',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262B36',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1E2638',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#3B82F633',
  },
  badgeText: { fontSize: 24 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 18,
  },
  inputWrapper: {
    width: '100%',
    marginBottom: 18,
  },
  input: {
    width: '100%',
    height: 52,
    backgroundColor: '#0F1115',
    borderRadius: 14,
    paddingHorizontal: 18,
    color: '#F9FAFB',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#262B36',
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
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#1D3B8A',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  footerTip: {
    marginTop: 20,
    fontSize: 11,
    color: '#4B5563',
  },
})
