import RNFS from 'react-native-fs'
import { PermissionsAndroid, Platform, Alert } from 'react-native'

const requestStoragePermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    try {
      if (Platform.Version >= 29) return true

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        {
          title: '存储权限申请',
          message: '应用需要获取存储权限以保存下载的音乐文件',
          buttonNeutral: '稍后询问',
          buttonNegative: '拒绝',
          buttonPositive: '允许',
        }
      )
      return granted === PermissionsAndroid.RESULTS.GRANTED
    } catch (err) {
      console.error('权限申请异常:', err)
      return false
    }
  }
  return true
}

export const handleDownloadSong = async (songUrl: string, songName: string, singer: string) => {
  // 🔒 1. 卡密下载权限强拦截
  if (global.lx?.userPermissions && !global.lx.userPermissions.allowDownload) {
    Alert.alert(
      '下载受限 🔒',
      '您当前使用的是体验版卡密，暂无离线下载权限。请升级为永久 VIP 卡密解锁高质量无损下载功能！'
    )
    return
  }

  if (!songUrl) {
    Alert.alert('提示', '该歌曲暂无有效下载链接')
    return
  }

  const hasPermission = await requestStoragePermission()
  if (!hasPermission) {
    Alert.alert('权限提示', '未获得存储权限，无法下载歌曲')
    return
  }

  // 过滤文件名特殊字符
  const sanitizedTitle = songName.replace(/[/\\?%*:|"<>]/g, '_')
  const sanitizedArtist = singer.replace(/[/\\?%*:|"<>]/g, '_')
  const fileName = `${sanitizedArtist} - ${sanitizedTitle}.mp3`
  
  const downloadDest = `${RNFS.DownloadDirectoryPath}/${fileName}`

  Alert.alert('开始下载', `正在为您下载: ${songName}`)

  try {
    const options = {
      fromUrl: songUrl,
      toFile: downloadDest,
      background: true,
      discretionary: true,
      begin: (res: any) => {
        console.log('下载任务已建立，初始大小:', res.contentLength)
      },
      progress: (res: any) => {
        // 防御式计算：避免 Content-Length 不存在时出现 NaN
        const progressPercent = res.contentLength > 0 
          ? ((res.bytesWritten / res.contentLength) * 100).toFixed(1) 
          : '0'
        console.log(`歌曲《${songName}》下载进度: ${progressPercent}%`)
      },
    }

    const ret = RNFS.downloadFile(options)
    const result = await ret.promise

    if (result.statusCode === 200) {
      Alert.alert('下载成功 🎉', `文件已安全保存至存储目录:\nDownload/${fileName}`)
    } else {
      Alert.alert('下载失败', `服务器响应码: ${result.statusCode}`)
    }
  } catch (error: any) {
    console.error('下载过程出错:', error)
    Alert.alert('下载出错', error.message || '网络连接超时或源文件不可访问')
  }
}
