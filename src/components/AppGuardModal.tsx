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

// 本地存储 KEY 与 基础鉴权音源 URL
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

  // 向 Cloudflare 鉴权音源接口发送验证请求
  const requestVerify = async (token: string): Promise<boolean> => {
    const cleanToken = token.trim()
    if (!cleanToken) return false

    const targetUrl = `${BASE_SOURCE_URL}?token=${encodeURIComponent(cleanToken)}`

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })

      // 接口正常返回 200 即视为验证通过
      if (response.status === 200) {
        return true
      }
      return false
    } catch (error) {
      console.error('鉴权请求网络异常:', error)
      return false
    }
  }

  // 验证成功后的处理逻辑
  const handleAuthPass = (token: string) => {
    const activeSourceUrl = `${BASE_SOURCE_URL}?token=${encodeURIComponent(token.trim())}`
    setIsAuthorized(true)
    if (onAuthSuccess) {
      onAuthSuccess(activeSourceUrl, token.trim())
    }
  }

  // 应用启动时自动读取本地 AsyncStorage 里的授权码
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
        console.error('读取本地授权状态失败:', e)
      }
      // 无授权码或校验失败，强制停留遮罩页
      setIsAuthorized(false)
      setLoading(false)
    }

    initCheck()
  }, [])

  // 用户点击“立即验证”提交
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
      try {
        // 将授权码保存至本地
        await AsyncStorage.setItem(AUTH_CODE_KEY, token)
      } catch (e) {
        console.error('保存授权码失败:', e)
      }
      // 解除遮罩并载入音源
      handleAuthPass(token)
    } else {
      // 验证失败，弹窗提示并保持锁定
      Alert.alert(
        '激活失败',
        '授权码无效或已过 15 天有效期，请联系管理员获取最新授权码。',
        [{ text: '确定' }]
      )
    }
  }

  // 启动读取状态：显示加载动画
  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>正核验设备激活授权...</Text>
      </View>
    )
  }

  return (
    <View style={styles.flex1}>
      {/* 渲染主应用界面 */}
      {children}

      {/* 未授权时全屏门禁遮罩 */}
      {!isAuthorized && (
        <Modal visible transparent={false} animationType="fade" statusBarTranslucent>
          <StatusBar barStyle="light-content" backgroundColor="#121212" />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.maskContainer}
          >
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <Text style={styles.lockIcon}>🔒</Text>
              </View>

              <Text style={styles.title}>应用激活门禁</Text>
              <Text style={styles.subtitle}>请输入有效授权码激活应用</Text>

              <TextInput
                style={styles.input}
                placeholder="请输入激活授权码"
                placeholderTextColor="#666"
                value={inputToken}
                onChangeText={setInputToken}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />

              <TouchableOpacity
                style={[styles.button, verifying && styles.buttonDisabled]}
                onPress={handleVerifySubmit}
                disabled={verifying}
                activeOpacity={0.8}
              >
                {verifying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>立即激活</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 14,
  },
  maskContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2c2c2c',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  lockIcon: {
    fontSize: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 48,
    backgroundColor: '#2c2c2c',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 15,
    marginBottom: 20,
  },
  button: {
    width: '100%',
    height: 48,
    backgroundColor: '#10B981',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
})
