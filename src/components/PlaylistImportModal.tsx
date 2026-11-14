import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react'
import { View } from 'react-native'

import Dialog, { type DialogType } from '@/components/common/Dialog'
import Input, { type InputType } from '@/components/common/Input'
import Button from '@/components/common/Button'
import Text from '@/components/common/Text'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'

export interface PlaylistImportModalType {
  show: () => void
}

export default forwardRef<PlaylistImportModalType, {
  onImport: (input: string) => Promise<void>
}>(({ onImport }, ref) => {
  const theme = useTheme()
  const dialogRef = useRef<DialogType>(null)
  const inputRef = useRef<InputType>(null)
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  useImperativeHandle(ref, () => ({
    show() {
      setText('')
      setError('')
      setImporting(false)
      requestAnimationFrame(() => {
        dialogRef.current?.setVisible(true)
        requestAnimationFrame(() => {
          inputRef.current?.focus()
        })
      })
    },
  }))

  const hide = useCallback(() => {
    if (importing) return
    dialogRef.current?.setVisible(false)
  }, [importing])

  const handleHide = useCallback(() => {
    setText('')
    setError('')
    setImporting(false)
  }, [])

  const handleImport = useCallback(async() => {
    if (importing) return
    const input = text.trim()
    if (!input.length) {
      setError('请先粘贴歌单分享链接或歌单 ID')
      return
    }
    setError('')
    setImporting(true)
    try {
      await onImport(input)
      dialogRef.current?.setVisible(false)
    } catch (err: any) {
      setError(err?.message ?? '导入失败，请稍后重试')
    } finally {
      setImporting(false)
    }
  }, [importing, text, onImport])

  return (
    <Dialog ref={dialogRef} title="导入外部歌单" onHide={handleHide} bgHide={!importing} keyHide={!importing} closeBtn={!importing}>
      <View style={styles.content}>
        <Text size={12} color={theme['c-font-label']}>
          支持粘贴 网易云 / QQ音乐 / 酷狗 / 酷我 / 咪咕 的歌单分享链接或歌单 ID
        </Text>
        <View style={styles.inputContainer}>
          <Input
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="粘贴歌单分享链接或 ID"
            size={13}
            clearBtn
            multiline
            textAlignVertical="top"
            style={styles.input}
          />
        </View>
        {
          error.length
            ? <Text size={12} color="#e0504a" style={styles.error}>{error}</Text>
            : null
        }
        <View style={styles.btns}>
          <Button style={styles.btnCancel} onPress={hide} disabled={importing}>
            <Text size={13} color={theme['c-font']}>取消</Text>
          </Button>
          <Button style={{ ...styles.btnImport, backgroundColor: theme['c-primary'] }} onPress={handleImport} disabled={importing}>
            <Text size={13} color="#fff">{importing ? '导入中...' : '解析并导入'}</Text>
          </Button>
        </View>
      </View>
    </Dialog>
  )
})

const styles = createStyle({
  content: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    height: 72,
  },
  input: {
    height: 64,
    paddingTop: 4,
  },
  error: {
    marginTop: 8,
  },
  btns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 14,
  },
  btnCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginRight: 10,
  },
  btnImport: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
})
