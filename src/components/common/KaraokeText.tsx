import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Text, type TextStyle } from 'react-native'
import { getPosition } from '@/plugins/player'
import { setSpText } from '@/utils/pixelRatio'
import playerState from '@/store/player/state'
import { getWordLine, type LyricToken } from '@/plugins/lyricWords'

export interface KaraokeTextProps {
  /**
   * 整行歌词文本
   */
  text: string
  /**
   * 当前行填充进度 0 ~ 1（无逐字数据时的兜底）
   */
  progress: number
  /**
   * 绝对播放位置(ms)——有逐字数据时按每字时间精确点亮
   */
  posMs?: number
  /**
   * 当前行起始时间(ms)，用于查询逐字时间数据
   */
  lineTime?: number | null
  /**
   * 已唱文字颜色
   */
  activeColor: string
  /**
   * 未唱文字颜色
   */
  inactiveColor: string
  size: number
  lineHeight: number
  textAlign?: string
}

type RGB = [number, number, number]

const parseColor = (c: string): RGB | null => {
  let m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  m = c.match(/^#([0-9a-f]{6})$/i)
  if (m) {
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  return null
}

const mixColor = (a: RGB, b: RGB, f: number) => {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`
}

const isSpace = (ch: string) => /\s/.test(ch)

/**
 * 计算每个字符的填充分数 0~1：
 * - 有逐字时间数据：按每字的 start/end 精确点亮（边界字给分数过渡）
 * - 无数据：整行时长线性均分，但边界字符同样做分数过渡（替代旧的 Math.round 硬切）
 * 逐字数据与文本对不上时返回 null（调用方回退线性模式）
 */
const computeCharFills = (
  chars: string[],
  tokens: LyricToken[] | null,
  posMs: number,
  progress: number,
): number[] | null => {
  const len = chars.length
  if (!len) return []
  if (tokens && posMs >= 0) {
    const fills = new Array<number>(len).fill(0)
    let ci = 0
    let consumedTokenChars = 0
    for (const tk of tokens) {
      const tChars = Array.from(tk.text)
      for (const tch of tChars) {
        consumedTokenChars++
        // 行文本已耗尽：剩余 token 忽略
        if (ci >= len) break
        const lch = chars[ci]
        // 行内空白但 token 非空白：空白跟随上一字符的填充状态
        if (isSpace(lch) && !isSpace(tch)) {
          fills[ci] = ci > 0 ? fills[ci - 1] : 0
          ci++
          continue
        }
        if (posMs >= tk.end) fills[ci] = 1
        else if (posMs > tk.start) fills[ci] = (posMs - tk.start) / Math.max(1, tk.end - tk.start)
        else fills[ci] = 0
        ci++
      }
    }
    // token 与文本长度差异过大（>3 字符）说明对不上号，放弃逐字模式
    if (Math.abs(consumedTokenChars - len) > 3) return null
    // 行内未覆盖的尾部字符：按最后一个 token 的结束时间处理
    if (ci < len) {
      const lastEnd = tokens[tokens.length - 1]?.end ?? 0
      for (let i = ci; i < len; i++) fills[i] = posMs >= lastEnd ? 1 : 0
    }
    return fills
  }
  // 线性兜底：边界字符做分数过渡
  const fills = new Array<number>(len)
  for (let i = 0; i < len; i++) {
    fills[i] = Math.min(1, Math.max(0, progress * len - i))
  }
  return fills
}

/**
 * 逐字卡拉OK歌词(酷狗样式)：
 * - 已唱/未唱分为两个整段 Text，边界字独立渲染并做颜色/透明度插值 → 平滑过渡，节点数 O(3) 不随行长增长
 */
export const KaraokeText = memo(({ text, progress, posMs, lineTime, activeColor, inactiveColor, size, lineHeight, textAlign }: KaraokeTextProps) => {
  const chars = useMemo(() => Array.from(text), [text])
  const tokens = useMemo(() => (lineTime != null ? getWordLine(lineTime) : null), [lineTime])
  const fills = useMemo(
    () => computeCharFills(chars, tokens, posMs ?? -1, progress),
    [chars, tokens, posMs, progress],
  )
  const active = useMemo(() => parseColor(activeColor), [activeColor])
  const inactive = useMemo(() => parseColor(inactiveColor), [inactiveColor])

  const nodes = useMemo(() => {
    if (!fills) return null
    const groups: { text: string, kind: 0 | 1 | 2, fill: number }[] = []
    for (let i = 0; i < chars.length; i++) {
      const f = fills[i]
      const kind: 0 | 1 | 2 = f <= 0.02 ? 0 : f >= 0.98 ? 2 : 1
      const last = groups[groups.length - 1]
      // 同状态的连续字符合并成一个节点；过渡字单独成节点
      if (last && last.kind === kind && kind !== 1) last.text += chars[i]
      else groups.push({ text: chars[i], kind, fill: f })
    }
    return groups.map((g, i) => {
      if (g.kind === 2) {
        return <Text key={i} style={{ color: activeColor, opacity: 1 }}>{g.text}</Text>
      }
      if (g.kind === 0) {
        return <Text key={i} style={{ color: inactiveColor, opacity: 0.6 }}>{g.text}</Text>
      }
      const f = Math.min(1, Math.max(0, g.fill))
      const color = active && inactive ? mixColor(inactive, active, f) : activeColor
      return <Text key={i} style={{ color, opacity: 0.6 + 0.4 * f }}>{g.text}</Text>
    })
  }, [chars, fills, activeColor, inactiveColor, active, inactive])

  // 解析不了颜色时整体退回单色方案（几乎不会发生，主题色都是 rgb() 格式）
  if (!nodes) {
    const filled = Math.max(0, Math.min(chars.length, Math.round(progress * chars.length)))
    return (
      <Text
        style={{
          fontSize: setSpText(size),
          lineHeight,
          textAlign: textAlign as TextStyle['textAlign'],
        }}
        textBreakStrategy="simple"
      >{
        chars.map((ch, index) => (
          <Text key={index} style={{ color: index < filled ? activeColor : inactiveColor, opacity: index < filled ? 1 : 0.6 }}>{ch}</Text>
        ))
      }</Text>
    )
  }

  return (
    <Text
      style={{
        fontSize: setSpText(size),
        lineHeight,
        textAlign: textAlign as TextStyle['textAlign'],
      }}
      textBreakStrategy="simple"
    >{nodes}</Text>
  )
})

type MeasurableLine = { time: number, text: string }

/**
 * 轮询播放进度，折算出当前行填充进度与绝对位置(ms)
 * - 10Hz 插值轮询：每次同步真实位置后，用本地时钟 + 倍速推算，弥补跨原生桥取进度的抖动（旧版 200ms 裸轮询跳字的主因）
 * - 暂停时冻结当前填充；换行瞬间先归零，杜绝残留上一行进度的闪跳
 * - 无激活行 / 时间越界时返回 -1
 */
export const useKaraokeProgress = (lines: readonly MeasurableLine[], activeLine: number) => {
  const [info, setInfo] = useState({ progress: -1, posMs: -1 })
  const linesRef = useRef(lines)
  const activeLineRef = useRef(activeLine)

  linesRef.current = lines
  activeLineRef.current = activeLine

  useEffect(() => {
    if (activeLine < 0) {
      setInfo({ progress: -1, posMs: -1 })
      return
    }
    // 换行瞬间立即清零，防止渲染出上一行残留的旧进度
    setInfo({ progress: -1, posMs: -1 })
    let disposed = false
    const sync = { pos: 0, at: 0 }

    const syncPosition = async() => {
      try {
        const position = await getPosition()
        if (!disposed && typeof position === 'number') {
          sync.pos = position * 1000
          sync.at = Date.now()
        }
      } catch {
        // 播放器未就绪等情况，静默忽略
      }
    }

    const tick = () => {
      if (!playerState.isPlay) {
        sync.at = 0 // 暂停：作废插值基准，恢复播放后等下一次同步再继续
        return
      }
      if (!sync.at) return
      const posMs = sync.pos + (Date.now() - sync.at) * (playerState.playRate || 1)
      const curLines = linesRef.current
      const lineNum = activeLineRef.current
      const line = curLines[lineNum]
      if (!line || !line.text) return
      const start = line.time
      const next = curLines[lineNum + 1]
      // 最后一行按 8 秒收尾估算
      const end = next && next.time > start ? next.time : start + 8000
      if (posMs < start - 60 || posMs > end) {
        setInfo(prev => (prev.progress === -1 && prev.posMs === -1) ? prev : { progress: -1, posMs: -1 })
        return
      }
      const progress = Math.min(1, Math.max(0, (posMs - start) / (end - start)))
      setInfo(prev => (prev.progress === progress && Math.abs(prev.posMs - posMs) < 1) ? prev : { progress, posMs })
    }

    void syncPosition()
    const timer = setInterval(tick, 100)
    const syncTimer = setInterval(syncPosition, 1200)
    return () => {
      disposed = true
      clearInterval(timer)
      clearInterval(syncTimer)
    }
  }, [activeLine])

  return info
}
