import musicSdk from '@/utils/musicSdk'
import { tipDialog } from './tools'

export type SourceType = 'wy' | 'tx' | 'kg' | 'kw' | 'mg'

interface ParseResult {
  source: SourceType
  id: string
}

/**
 * 1. 自动智能识别输入的文本/链接属于哪个音乐平台及歌单 ID
 */
export const autoDetectSourceAndId = (input: string): ParseResult | null => {
  const text = input.trim()
  if (!text) return null

  // 网易云音乐 (163.com)
  if (text.includes('163.com')) {
    const match = text.match(/playlist\?id=(\d+)/) || text.match(/id=(\d+)/)
    if (match) return { source: 'wy', id: match[1] }
  }

  // QQ 音乐 (qq.com / y.qq.com)
  if (text.includes('qq.com')) {
    const match = text.match(/playlist\/(\d+)/) || text.match(/id=(\d+)/) || text.match(/ta歌单\/([a-zA-Z0-9]+)/)
    if (match) return { source: 'tx', id: match[1] }
  }

  // 酷狗音乐 (kugou.com)
  if (text.includes('kugou.com')) {
    const match = text.match(/zlist\/(\w+)/) || text.match(/chain\/(\w+)/) || text.match(/global\/(\w+)/)
    if (match) return { source: 'kg', id: match[1] }
  }

  // 酷我音乐 (kuwo.cn)
  if (text.includes('kuwo.cn')) {
    const match = text.match(/playlist_detail\/(\d+)/) || text.match(/id=(\d+)/)
    if (match) return { source: 'kw', id: match[1] }
  }

  // 咪咕音乐 (migu.cn)
  if (text.includes('migu.cn')) {
    const match = text.match(/playlist\/(\d+)/) || text.match(/id=(\d+)/)
    if (match) return { source: 'mg', id: match[1] }
  }

  // 如果输入的只是纯数字，默认当作网易云/QQ 歌单 ID
  if (/^\d+$/.test(text)) {
    return { source: 'wy', id: text }
  }

  return null
}

/**
 * 2. 统一调用接口解析歌单内容（一键拉取所有歌曲）
 */
export const importPlaylistFromUrl = async (inputUrl: string) => {
  const parsed = autoDetectSourceAndId(inputUrl)

  if (!parsed) {
    throw new Error('无法识别该链接！支持粘贴网易云、QQ音乐、酷狗、酷我、咪咕的歌单链接或 ID。')
  }

  const { source, id } = parsed

  // 从原作者统一导出的 musicSdk 中获取对应平台的歌单 API
  const sdk = (musicSdk as any)[source]

  if (!sdk || !sdk.songList || typeof sdk.songList.getListDetail !== 'function') {
    throw new Error(`当前引擎暂不支持解析 ${source.toUpperCase()} 平台歌单`)
  }

  try {
    // 统一调用原作者底层 API
    const result = await sdk.songList.getListDetail(id, 1)

    if (!result || !result.list || result.list.length === 0) {
      throw new Error('歌单内暂无有效歌曲，或该歌单已被设为私人隐私。')
    }

    const platformNames: Record<SourceType, string> = {
      wy: '网易云',
      tx: 'QQ音乐',
      kg: '酷狗',
      kw: '酷我',
      mg: '咪咕',
    }

    return {
      name: result.name || `${platformNames[source]} 导入歌单`,
      list: result.list, // 原生适配 LX-Music 歌曲列表数据格式
      source: source,
      count: result.list.length,
    }
  } catch (err: any) {
    throw new Error(err?.message || '网络请求超时或歌单已被移除，请稍后重试。')
  }
}
