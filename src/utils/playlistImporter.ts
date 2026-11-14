import { getListDetail, getListDetailAll } from '@/core/songlist'

export type SourceType = LX.OnlineSource

export interface PlaylistImportResult {
  name: string
  list: LX.Music.MusicInfoOnline[]
  source: SourceType
  count: number
}

const PLATFORM_NAMES: Record<SourceType, string> = {
  wy: '网易云',
  tx: 'QQ音乐',
  kg: '酷狗',
  kw: '酷我',
  mg: '咪咕',
}

/**
 * 自动识别输入的文本/链接属于哪个平台。
 * 五家平台的歌单接口均原生支持完整的分享链接（含短链），所以这里只判断来源，
 * 原始输入会整条透传给 SDK 自行解析，不做二次裁剪。
 */
export const detectSource = (input: string): SourceType | null => {
  const text = input.trim()
  if (!text) return null

  if (/163\.com/i.test(text)) return 'wy'
  if (/qq\.com/i.test(text)) return 'tx'
  if (/kugou\.com/i.test(text)) return 'kg'
  if (/kuwo\.cn|kuwo\.com/i.test(text)) return 'kw'
  if (/migu\.cn/i.test(text)) return 'mg'

  // 纯数字默认按网易云处理；QQ 歌单的数字 ID 存在歧义，请使用完整分享链接
  if (/^\d+$/.test(text)) return 'wy'

  return null
}

/**
 * 解析歌单：先调 getListDetail 拿歌单信息（名称、首页数据，结果有缓存），
 * 再调 getListDetailAll 聚合全部分页（内部带去重），避免大歌单被截断成第一页。
 */
export const importPlaylistFromUrl = async(input: string): Promise<PlaylistImportResult> => {
  const text = input.trim()
  if (!text) throw new Error('请先粘贴歌单分享链接或歌单 ID')

  const source = detectSource(text)
  if (!source) {
    throw new Error('无法识别该链接！支持粘贴网易云、QQ音乐、酷狗、酷我、咪咕的歌单分享链接或歌单 ID')
  }

  // 第一页：校验歌单有效性并获取歌单名（结果会被 core/songlist 缓存，下面 All 阶段直接复用）
  const detail = await getListDetail(text, source, 1)
  if (!detail.list.length) {
    throw new Error('歌单内暂无有效歌曲，或该歌单已被设为私人隐私')
  }

  // 全量：聚合所有分页
  const list = await getListDetailAll(source, text)
  if (!list.length) {
    throw new Error('歌单内暂无有效歌曲，或该歌单已被设为私人隐私')
  }

  return {
    name: detail.info.name?.trim() || `${PLATFORM_NAMES[source]}导入歌单`,
    list,
    source,
    count: list.length,
  }
}
