import { useRef, useImperativeHandle, forwardRef, useState, useCallback, useEffect } from 'react'
import { View, TouchableOpacity, ActivityIndicator } from 'react-native'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Text from '@/components/common/Text'
import ChoosePath, { type ChoosePathType } from '@/components/common/ChoosePath'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { getMusicUrl } from '@/core/music'
import { handleDownloadSong, getDownloadDir, setDownloadDir } from '@/utils/downloadManager'

// 🎵 音质从高到低排列，ext 决定下载文件的后缀（无损用 .flac，有损用 .mp3）
const QUALITY_LIST: Array<{ id: LX.Quality, label: string, ext: 'mp3' | 'flac' }> = [
  { id: 'flac24bit', label: 'Hi-Res 24bit 无损', ext: 'flac' },
  { id: 'flac', label: 'FLAC 无损', ext: 'flac' },
  { id: '320k', label: '320K 高品质', ext: 'mp3' },
  { id: '192k', label: '192K 高品质', ext: 'mp3' },
  { id: '128k', label: '128K 标准', ext: 'mp3' },
]

export interface MusicDownloadModalType {
  show: (musicInfo: LX.Music.MusicInfo) => void
}

export default forwardRef<MusicDownloadModalType, {}>((props, ref) => {
  const theme = useTheme()
  const dialogRef = useRef<DialogType>(null)
  const choosePathRef = useRef<ChoosePathType>(null)
  const [musicInfo, setMusicInfo] = useState<LX.Music.MusicInfo | null>(null)
  const [downloadingQuality, setDownloadingQuality] = useState<LX.Quality | null>(null)
  const [downloadDir, setDownloadDirState] = useState<string>('')
  const [showChoosePath, setShowChoosePath] = useState(false)

  // 读取已保存的下载文件夹
  useEffect(() => {
    void getDownloadDir().then(setDownloadDirState)
  }, [])

  useImperativeHandle(ref, () => ({
    show(info) {
      setMusicInfo(info)
      setDownloadingQuality(null)
      void getDownloadDir().then(setDownloadDirState)
      requestAnimationFrame(() => {
        dialogRef.current?.setVisible(true)
      })
    },
  }))

  // 打开文件夹选择器（只选目录）
  const handleChooseDir = useCallback(() => {
    setShowChoosePath(true)
    requestAnimationFrame(() => {
      choosePathRef.current?.show({ title: '选择下载文件夹', dirOnly: true })
    })
  }, [])
  const handleDirConfirm = useCallback((path: string) => {
    setShowChoosePath(false)
    if (!path) return
    void setDownloadDir(path).then(() => setDownloadDirState(path))
  }, [])

  // 仅列出该歌曲实际提供的音质；本地歌曲不适用
  const availableQualities = useCallback(() => {
    if (!musicInfo || musicInfo.source === 'local') return []
    const qualitys = (musicInfo.meta as LX.Music.MusicInfoMeta_online)._qualitys
    if (!qualitys) return []
    return QUALITY_LIST.filter(item => qualitys[item.id] != null)
  }, [musicInfo])

  const handleDownload = useCallback(async(item: typeof QUALITY_LIST[number]) => {
    const info = musicInfo
    if (!info || downloadingQuality) return
    setDownloadingQuality(item.id)
    try {
      const url = await getMusicUrl({ musicInfo: info, quality: item.id })
      await handleDownloadSong(url, info.name, info.singer, item.ext)
      dialogRef.current?.setVisible(false)
    } catch (err) {
      console.error('解析下载链接失败:', err)
    } finally {
      setDownloadingQuality(null)
    }
  }, [musicInfo, downloadingQuality])

  const list = availableQualities()

  const displayDir = downloadDir
    ? downloadDir.replace(/^.*[\/\\]/, '') || downloadDir
    : '默认下载目录'

  return (
    <>
      <Dialog ref={dialogRef} title="下载歌曲">
        <View style={styles.container}>
          <Text style={styles.songName} size={15} color={theme['c-font']} numberOfLines={1}>
            {musicInfo?.name} - {musicInfo?.singer}
          </Text>
          <TouchableOpacity style={styles.dirRow} activeOpacity={0.7} onPress={handleChooseDir}>
            <View style={styles.dirInfo}>
              <Text size={13} color={theme['c-font-label']}>保存位置</Text>
              <Text size={13} color={theme['c-font']} numberOfLines={1}>{displayDir}</Text>
            </View>
            <Text size={13} color={theme['c-primary']}>更改 ›</Text>
          </TouchableOpacity>
          <Text style={styles.tip} size={12} color={theme['c-font-label']}>请选择要下载的音质（从高到低）</Text>
          <View style={styles.list}>
          {
            list.length
              ? list.map(item => {
                const size = (musicInfo!.meta as LX.Music.MusicInfoMeta_online)._qualitys[item.id]?.size
                const isDownloading = downloadingQuality === item.id
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.item}
                    disabled={downloadingQuality != null}
                    activeOpacity={0.7}
                    onPress={() => { void handleDownload(item) }}
                  >
                    <View style={styles.itemInfo}>
                      <Text size={14} color={theme['c-font']}>{item.label}</Text>
                      {
                        size ? <Text size={12} color={theme['c-font-label']}>{size}</Text> : null
                      }
                    </View>
                    {
                      isDownloading
                        ? <ActivityIndicator size="small" color={theme['c-primary']} />
                        : <Text size={13} color={theme['c-primary']}>下载</Text>
                    }
                  </TouchableOpacity>
                )
              })
              : <Text style={styles.empty} size={13} color={theme['c-font-label']}>该歌曲暂无可下载的音质</Text>
          }
          </View>
        </View>
      </Dialog>
      {
        showChoosePath
          ? <ChoosePath ref={choosePathRef} onConfirm={handleDirConfirm} />
          : null
      }
    </>
  )
})

const styles = createStyle({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  songName: {
    marginBottom: 8,
  },
  dirRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  dirInfo: {
    flexShrink: 1,
    gap: 2,
  },
  tip: {
    marginBottom: 10,
  },
  list: {
    gap: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  itemInfo: {
    gap: 2,
  },
  empty: {
    paddingVertical: 20,
    textAlign: 'center',
  },
})
