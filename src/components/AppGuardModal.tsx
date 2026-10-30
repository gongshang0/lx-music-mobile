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
import { importUserApi, setUserApi } from '@/core/userApi' // 引入音源导入与强制设置函数

const AUTH_INFO_KEY = '@lx_app_auth_info'
const BASE_AUTH_URL = 'https://lx123.gongshangss.dpdns.org/source.js'

export const AppGuardModal: React.FC = () => {
  // 默认处于【绝对锁定】状态
  const [locked, setLocked] = useState<boolean>(true)
  const [checking, setChecking] = useState<boolean>(true)
  const [inputToken, setInputToken] = useState<string>('')
  const [verifying, setVerifying] = useState<boolean>(false)

  // 核心：拉取 Cloudflare 鉴权音源脚本并【强行设为默认激活音源】
  const verifyAndActivate = async (token: string): Promise<boolean> => {
    const cleanToken = token.trim()
    if (!cleanToken) return false

    const targetUrl = `${BASE_AUTH_URL}?token=${encodeURIComponent(cleanToken)}`

    try {
      const response = await fetch(targetUrl, { method: 'GET' })
      if (response.status === 200) {
        const scriptCode = await response.text()
        if (scriptCode && importUserApi) {
          // 1. 导入自定义音源脚本到 LX 核心引擎
          const apiInfo = await importUserApi(scriptCode)

          // 2. 核心一步：强行将该音源设为当前生效的默认播放源！
          const targetApiId = apiInfo?.id || 'user_api'
          if (setUserApi) {
            await setUserApi(targetApiId)
          }
          return true
        }
      }
      return false
    } catch (error) {
      console.error('鉴权或音源加载网络异常:', error)
      return false
    }
  }

  // 冷启动自动读取本地缓存并核验
  useEffect(() => {
    const initCheck = async () => {
      try {
        const savedToken = await AsyncStorage.getItem(AUTH_INFO_KEY)
        if (savedToken) {
          const success = await verifyAndActivate(savedToken)
          if (success) {
            setLocked(false)
            setChecking(false)
            return
          }
        }
      } catch (e) {
        console.error('读取本地授权缓存失败:', e)
      }
      // 校验失败或无卡密，维持死锁状态
      setLocked(true)
      setChecking(false)
    }

    initCheck()
  }, [])

  // 用户点击提交卡密验证
  const handleVerifySubmit = async () => {
    const token = inputToken.trim()
    if (!token) {
      Alert.alert('提示', '请输入有效授权码激活应用')
      return
    }

    setVerifying(true)
    const success = await verifyAndActivate(token)
    setVerifying(false)

    if (success) {
      await AsyncStorage.setItem(AUTH_INFO_KEY, token)
      setLocked(false)
      Alert.alert('激活成功 🎉', '卡密验证通过，已成功载入并激活在线音源引擎！')
    } else {
      Alert.alert(
        '激活失败 ❌',
        '授权码无效或已过 15 天有效期，请检查后重新输入。'
      )
    }
  }

  // 初始化检查中显示全屏黑底 Loading，防止界面闪烁露出
  if (checking) {
    return (
      <View style={styles.centerScreen}>
        <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>正核验设备激活授权...</Text>
      </View>
    )
  }

  // 验证通过，解除遮罩
  if (!locked) return null

  // 未验证通过：全屏死锁 Modal（包含防止返回键关闭的逻辑）
  return (
    <Modal
      visible={locked}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // 🔒 阻止 Android 物理返回键/返回手势退出弹窗
      }}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0F1115" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.maskContainer}
      >
        <View style={styles.card}>
          <View style={styles.iconBadge}>
            <Text style={styles.badgeText}>🔑</Text>
          </View>

          <Text style={styles.title}>设备激活中心</Text>
          <Text style={styles.subtitle}>请输入有效授权码解锁在线音乐引擎</Text>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="在此粘贴或输入激活授权码"
              placeholderTextColor="#6B7280"
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
    backgroundColor: '#0F1115',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { marginTop: 16, fontSize: 14, color: '#9CA3AF' },
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
  },
  badgeText: { fontSize: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#F9FAFB', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#9CA3AF', marginBottom: 24, textAlign: 'center' },
  inputWrapper: { width: '100%', marginBottom: 18 },
  input: {
    width: '100%',
    height: 52,
    backgroundColor: '#0F1115',
    borderRadius: 14,
    paddingHorizontal: 18,
    color: '#F9FAFB',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  button: {
    width: '100%',
    height: 52,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#1D3B8A' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  footerTip: { marginTop: 20, fontSize: 11, color: '#4B5563' },
})
