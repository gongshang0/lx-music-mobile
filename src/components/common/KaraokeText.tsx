import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Text, type TextStyle } from 'react-native'
import { getPosition } from '@/plugins/player'
import { setSpText } from '@/utils/pixelRatio'

export interface KaraokeTextProps {
  /**
   * 整行歌词文本
   */
  text: string
  /**
   * 当前行填充进度 0 ~ 1
   */
  progress: number
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

/**
 * 逐字卡拉OK歌词(酷狗样式):文字按 progress 依次点亮
 */
export const KaraokeText = memo(({ text, progress, activeColor, inactiveColor, size, lineHeight, textAlign }: KaraokeTextProps) => {
  const chars = useMemo(() => Array.from(text), [text])
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
})

type MeasurableLine = { time: number, text: string }

/**
 * 轮询播放进度,折算出当前行逐字填充进度(0 ~ 1)
 * 歌词未激活或时间越界时返回 -1
 */
export const useKaraokeProgress = (lines: readonly MeasurableLine[], activeLine: number) => {
  const [progress, setProgress] = useState(-1)
  const linesRef = useRef(lines)
  const activeLineRef = useRef(activeLine)

  linesRef.current = lines
  activeLineRef.current = activeLine

  useEffect(() => {
    if (activeLine < 0) {
      setProgress(-1)
      return
    }
    let disposed = false
    const tick = async() => {
      try {
        const position = await getPosition()
        if (disposed) return
        const curLines = linesRef.current
        const lineNum = activeLineRef.current
        const line = curLines[lineNum]
        if (!line || !line.text) {
          setProgress(-1)
          return
        }
        const start = line.time
        const next = curLines[lineNum + 1]
        // 最后一行按 8 秒收尾估算
        const end = next && next.time > start ? next.time : start + 8000
        const pos = position * 1000
        if (pos < start || pos > end) {
          setProgress(-1)
          return
        }
        setProgress(Math.min(1, Math.max(0, (pos - start) / (end - start))))
      } catch {
        // 播放器未就绪等情况,静默忽略
      }
    }
    void tick()
    const timer = setInterval(() => { void tick() }, 200)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [activeLine])

  return progress
}
