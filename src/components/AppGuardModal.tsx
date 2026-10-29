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
import { verifyAndLoadAuth } from '@/app'

const AUTH_INFO_KEY = '@lx_app_auth_info'

export const AppGuardModal: React.FC = () => {
  const [visible, setVisible] = useState<boolean>(!global.lx.isAuthorized)
  const [inputToken, setInputToken] = useState<string>('')
  const [verifying, setVerifying] = useState<boolean>(false)

  useEffect(() => {
    if (global.lx.isAuthorized) {
      setVisible(false)
    }
  }, [])

  const handleVerifySubmit = async () => {
    const token = inputToken.trim()
    if (!token) {
      Alert.alert('提示', '请输入有效授权码激活应用')
      return
    }

    setVerifying(true)
    const authData = await verifyAndLoadAuth(token)
    setVerifying(false)

    if (authData) {
      await AsyncStorage.setItem(AUTH_INFO_KEY, JSON.stringify(authData))
      global.lx.userPermissions = authData
      global.lx.isAuthorized = true
      setVisible(false) // 解除全屏遮罩进入主界面

      Alert.alert(
        '激活成功 🎉',
        `授权卡密验证通过 (${authData.planType.toUpperCase()})\n下载权限：${
          authData.allowDownload ? '已解锁' : '未开启 (仅限在线播放)'
        }`
      )
    } else {
      Alert.alert(
        '激活失败 ❌',
        '授权码无效或已过 15 天有效期，请联系管理员获取最新授权码。'
      )
    }
  }

  if (!visible) return null

  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent>
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

          {/* 真正的 React Native 原生输入框 */}
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
    borderColor: '#2563EB', // 亮蓝色突出框
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
