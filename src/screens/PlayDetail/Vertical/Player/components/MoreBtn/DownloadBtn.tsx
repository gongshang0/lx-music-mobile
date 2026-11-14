import { useState } from 'react'
import { Alert } from 'react-native'
import { getMusicUrl } from '@/core/music'
import { handleDownloadSong } from '@/utils/downloadManager'
import playerState from '@/store/player/state'
import Btn from './Btn'

// 📥 播放页下载按钮: 实时解析当前歌曲直链并复用列表页同款下载执行器(内含卡密权限拦截)
export default () => {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async() => {
    if (downloading) return
    const musicInfo = playerState.playMusicInfo.musicInfo
    if (!musicInfo) return
    setDownloading(true)
    try {
      const info = 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
      const url = await getMusicUrl({ musicInfo: info })
      await handleDownloadSong(url, info.name, info.singer)
    } catch {
      Alert.alert('提示', '获取下载链接失败，请稍后再试')
    } finally {
      setDownloading(false)
    }
  }

  return <Btn icon="download-2" onPress={() => { void handleDownload() }} />
}
