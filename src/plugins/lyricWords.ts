/**
 * 🎤 逐字歌词（Enhanced LRC / lxlyric）解析与查询
 *
 * lxlyric 格式：[mm:ss.mmm]<start,dur>字<start,dur>字
 * - start / dur 为相对「行起始时间」的毫秒偏移
 * - 各音源 SDK（kw/kg/tx/wy/mg）解析歌词时已把 lxlyric 与普通 lrc 分开存放
 * - 此前 lxlyric 存进 player state 后从未被消费（KaraokeText 把整行时长线性均分到每字，
 *   长音/快段高亮与唱词错位）——本模块补上这段链路：换歌时解析，KaraokeText 按行时间查询
 */
export interface LyricToken {
  /** 绝对毫秒：词开始 */
  start: number
  /** 绝对毫秒：词结束 */
  end: number
  /** 词文本 */
  text: string
}

interface WordLine {
  time: number
  tokens: LyricToken[]
}

let wordLines: WordLine[] = []

const lineTimeRxp = /^\s*\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?\]/
const wordRxp = /<(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)>([^<]*)/g

/**
 * 解析 lxlyric 文本（换歌时调用；传空串即清空）
 */
export const setLyricWords = (lxlrc: string | null | undefined) => {
  wordLines = []
  if (!lxlrc) return
  for (const raw of lxlrc.split(/\r\n|\n|\r/)) {
    const m = raw.match(lineTimeRxp)
    if (!m) continue
    const time = (Number(m[1]) * 60 + Number(m[2])) * 1000 + (m[3] ? Number(m[3].padEnd(3, '0')) : 0)
    const tokens: LyricToken[] = []
    wordRxp.lastIndex = 0
    let wm: RegExpExecArray | null
    while ((wm = wordRxp.exec(raw))) {
      const relStart = Number(wm[1])
      const dur = Number(wm[2])
      const text = wm[3]
      if (!text || dur < 0) continue
      tokens.push({ start: time + relStart, end: time + relStart + dur, text })
    }
    if (tokens.length) wordLines.push({ time, tokens })
  }
  wordLines.sort((a, b) => a.time - b.time)
}

/**
 * 按行起始时间查询该行的逐字时间（二分找最近行，容差内命中）
 * 没有逐字数据 / 时间对不上时返回 null（调用方应退回整行线性填充）
 */
export const getWordLine = (lineTime: number | null | undefined, tolerance = 150): LyricToken[] | null => {
  if (!wordLines.length || lineTime == null) return null
  let lo = 0
  let hi = wordLines.length - 1
  let best = -1
  let bestDiff = Number.MAX_SAFE_INTEGER
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const diff = Math.abs(wordLines[mid].time - lineTime)
    if (diff < bestDiff) {
      bestDiff = diff
      best = mid
    }
    if (wordLines[mid].time < lineTime) lo = mid + 1
    else hi = mid - 1
  }
  if (best < 0 || bestDiff > tolerance) return null
  return wordLines[best].tokens
}
