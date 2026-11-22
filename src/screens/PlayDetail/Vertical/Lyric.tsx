import { memo, useMemo, useEffect, useRef, useCallback } from 'react'
import { View, FlatList, type FlatListProps, type NativeSyntheticEvent, type NativeScrollEvent, type LayoutChangeEvent } from 'react-native'
// import { useLayout } from '@/utils/hooks'
import { type Line, useLrcPlay, useLrcSet } from '@/plugins/lyric'
import { createStyle } from '@/utils/tools'
// import { useComponentIds } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { AnimatedColorText } from '@/components/common/Text'
import { KaraokeText, useKaraokeProgress } from '@/components/common/KaraokeText'
import { setSpText } from '@/utils/pixelRatio'
import playerState from '@/store/player/state'
import { getPosition } from '@/plugins/player'
import { scrollTo } from '@/utils/scroll'
import PlayLine, { type PlayLineType } from '../components/PlayLine'
// import { screenkeepAwake } from '@/utils/nativeModules/utils'
// import { log } from '@/utils/log'
// import { toast } from '@/utils/tools'

type FlatListType = FlatListProps<Line>

// const useLock = () => {
//   const showCommentRef = useRef(false)


//   useEffect(() => {
//     let appstateListener = AppState.addEventListener('change', (state) => {
//       switch (state) {
//         case 'active':
//           if (showLyricRef.current && !showCommentRef.current) screenkeepAwake()
//           break
//         case 'background':
//           screenUnkeepAwake()
//           break
//       }
//     })
//     return () => {
//       appstateListener.remove()
//     }
//   }, [])
//   useEffect(() => {
//     let listener: ReturnType<typeof onNavigationComponentDidDisappearEvent>
//     showCommentRef.current = !!componentIds.comment
//     if (showCommentRef.current) {
//       showLyricRef.current ? screenUnkeepAwake() : screenkeepAwake()
//       listener = onNavigationComponentDidDisappearEvent(componentIds.comment as string, () => {
//         if (showLyricRef.current && AppState.currentState == 'active') screenkeepAwake()
//       })
//     }
//     const rm = global.state_event.on('componentIdsUpdated', (ids) => {

//     })
//     return () => {
//       if (listener) listener.remove()
//     }
//   }, [])
// }

interface LineProps {
  line: Line
  lineNum: number
  activeLine: number
  progress: number
  onLayout: (lineNum: number, height: number, width: number) => void
}
const LrcLine = memo(({ line, lineNum, activeLine, progress, onLayout }: LineProps) => {
  const theme = useTheme()
  const lrcFontSize = useSettingValue('playDetail.vertical.style.lrcFontSize')
  const textAlign = useSettingValue('playDetail.style.align')
  const size = lrcFontSize / 10
  const lineHeight = setSpText(size) * 1.3

  const colors = useMemo(() => {
    const active = activeLine == lineNum
    return active ? [
      theme['c-primary'],
      theme['c-primary-alpha-200'],
      1,
    ] as const : [
      theme['c-350'],
      theme['c-300'],
      0.6,
    ] as const
  }, [activeLine, lineNum, theme])

  const handleLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    onLayout(lineNum, nativeEvent.layout.height, nativeEvent.layout.width)
  }


  // textBreakStrategy="simple" 用于解决某些设备上字体被截断的问题
  // https://stackoverflow.com/a/72822360
  return (
    <View style={styles.line} onLayout={handleLayout}>
      {/* 🎤 当前句:逐字卡拉OK填充效果(酷狗样式),其余行保持整句变色 */}
      {activeLine == lineNum ? (
        <KaraokeText
          text={line.text}
          progress={Math.max(0, progress)}
          activeColor={theme['c-primary']}
          inactiveColor={theme['c-350']}
          size={size}
          lineHeight={lineHeight}
          textAlign={textAlign}
        />
      ) : (
        <AnimatedColorText style={{
          ...styles.lineText,
          textAlign,
          lineHeight,
        }} textBreakStrategy="simple" color={colors[0]} opacity={colors[2]} size={size}>{line.text}</AnimatedColorText>
      )}
      {
        line.extendedLyrics.map((lrc, index) => {
          return (<AnimatedColorText style={{
            ...styles.lineTranslationText,
            textAlign,
            lineHeight: lineHeight * 0.8,
          }} textBreakStrategy="simple" key={index} color={colors[1]} opacity={colors[2]} size={size * 0.8}>{lrc}</AnimatedColorText>)
        })
      }
    </View>
  )
}, (prevProps, nextProps) => {
  return prevProps.line === nextProps.line &&
    prevProps.activeLine != nextProps.lineNum &&
    nextProps.activeLine != nextProps.lineNum
})
const wait = async() => new Promise(resolve => setTimeout(resolve, 100))

export default () => {
  const lyricLines = useLrcSet()
  const { line } = useLrcPlay()
  const karaokeProgress = useKaraokeProgress(lyricLines, line)
  const flatListRef = useRef<FlatList>(null)
  const playLineRef = useRef<PlayLineType>(null)
  const isPauseScrollRef = useRef(true)
  const scrollTimoutRef = useRef<NodeJS.Timeout | null>(null)
  const delayScrollTimeout = useRef<NodeJS.Timeout | null>(null)
  const lineRef = useRef({ line: 0, prevLine: 0 })
  const isFirstSetLrc = useRef(true)
  const scrollInfoRef = useRef<NativeSyntheticEvent<NativeScrollEvent>['nativeEvent'] | null>(null)
  const listLayoutInfoRef = useRef<{ spaceHeight: number, lineHeights: number[] }>({ spaceHeight: 0, lineHeights: [] })
  const scrollCancelRef = useRef<(() => void) | null>(null)
  const isShowLyricProgressSetting = useSettingValue('playDetail.isShowLyricProgressSetting')
  // useLock()
  // const [imgUrl, setImgUrl] = useState(null)
  // const theme = useGetter('common', 'theme')
  // const { onLayout, ...layout } = useLayout()

  // useEffect(() => {
  //   const url = playMusicInfo ? playMusicInfo.musicInfo.img : null
  //   if (imgUrl == url) return
  //   setImgUrl(url)
  // // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [playMusicInfo])

  // const imgWidth = useMemo(() => layout.width * 0.75, [layout.width])

  // 🎬 计算某行居中时对应的滚动 offset（行顶 + 半行高 - 视口 42%）
  const getLineOffset = useCallback((index: number): number | null => {
    if (index < 0 || !scrollInfoRef.current) return null
    let offset = listLayoutInfoRef.current.spaceHeight
    for (let i = 0; i < index; i++) offset += listLayoutInfoRef.current.lineHeights[i] ?? 0
    offset += (listLayoutInfoRef.current.lineHeights[index] ?? 0) / 2
    return offset - scrollInfoRef.current.layoutMeasurement.height * 0.42
  }, [])

  // 🎬 连续平滑滚动：把 offset 直接设为目标值(跳过 RN 动画)，由外部按帧高频调用驱动
  const applySmoothOffset = useCallback((index: number, ratio: number) => {
    if (!flatListRef.current || isPauseScrollRef.current) return
    const to = getLineOffset(index)
    if (to == null) return
    const from = index > 0
      ? getLineOffset(index - 1)
      : to - (listLayoutInfoRef.current.lineHeights[index] ?? 0) // 首行从更上方平滑移入
    if (from == null) return
    // ratio=0 时停在上一行位置，=1 时停在当前行位置；在行间连续插值
    const offset = from + (to - from) * Math.min(1, Math.max(0, ratio))
    if (offset < 0) return
    try {
      flatListRef.current.scrollToOffset({ offset, animated: false })
    } catch {}
  }, [getLineOffset])

  // 🎬 定位到活动行（用于换歌/拖动结束后/跳转等“非连续”场景）
  const handleScrollToActive = (index = lineRef.current.line) => {
    if (index < 0) return
    if (scrollCancelRef.current) {
      scrollCancelRef.current()
      scrollCancelRef.current = null
    }
    const target = getLineOffset(index)
    if (target != null && scrollInfoRef.current) {
      try {
        scrollCancelRef.current = scrollTo(flatListRef.current!, scrollInfoRef.current, target, 300, () => {
          scrollCancelRef.current = null
        })
      } catch {}
    }
  }

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollInfoRef.current = nativeEvent
    if (isPauseScrollRef.current) {
      playLineRef.current?.updateScrollInfo(nativeEvent)
    }
  }
  const handleScrollBeginDrag = () => {
    isPauseScrollRef.current = true
    playLineRef.current?.setVisible(true)
    if (delayScrollTimeout.current) {
      clearTimeout(delayScrollTimeout.current)
      delayScrollTimeout.current = null
    }
    if (scrollTimoutRef.current) {
      clearTimeout(scrollTimoutRef.current)
      scrollTimoutRef.current = null
    }
    if (scrollCancelRef.current) {
      scrollCancelRef.current()
      scrollCancelRef.current = null
    }
  }

  const onScrollEndDrag = () => {
    if (!isPauseScrollRef.current) return
    if (scrollTimoutRef.current) clearTimeout(scrollTimoutRef.current)
    scrollTimoutRef.current = setTimeout(() => {
      playLineRef.current?.setVisible(false)
      scrollTimoutRef.current = null
      isPauseScrollRef.current = false
      if (!playerState.isPlay) return
      handleScrollToActive()
    }, 3000)
  }


  useEffect(() => {
    return () => {
      if (delayScrollTimeout.current) {
        clearTimeout(delayScrollTimeout.current)
        delayScrollTimeout.current = null
      }
      if (scrollTimoutRef.current) {
        clearTimeout(scrollTimoutRef.current)
        scrollTimoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    // linesRef.current = lyricLines
    listLayoutInfoRef.current.lineHeights = []
    lineRef.current.prevLine = 0
    lineRef.current.line = 0
    if (!flatListRef.current) return
    flatListRef.current.scrollToOffset({
      offset: 0,
      animated: false,
    })
    if (!lyricLines.length) return
    playLineRef.current?.updateLyricLines(lyricLines)
    requestAnimationFrame(() => {
      if (isFirstSetLrc.current) {
        isFirstSetLrc.current = false
        setTimeout(() => {
          isPauseScrollRef.current = false
          handleScrollToActive()
        }, 100)
      } else {
        if (delayScrollTimeout.current) clearTimeout(delayScrollTimeout.current)
        delayScrollTimeout.current = setTimeout(() => {
          handleScrollToActive(0)
        }, 100)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyricLines])

  // 🎬 连续平滑滚动驱动：按播放进度在当前行/下一行之间连续插值，歌词随进度匀速上移
  useEffect(() => {
    const activeLine = lineRef.current.line
    if (activeLine < 0 || !lyricLines.length) return
    let disposed = false
    const sync = { pos: 0, at: 0 }

    const syncPosition = async() => {
      try {
        const position = await getPosition()
        if (!disposed && typeof position === 'number') {
          sync.pos = position * 1000
          sync.at = Date.now()
        }
      } catch {}
    }

    const tick = () => {
      if (disposed) return
      if (!playerState.isPlay) {
        sync.at = 0 // 暂停作废插值基准，恢复后等重新同步，避免进度突变导致跳行
        return
      }
      if (!sync.at) return
      const idx = lineRef.current.line
      if (idx < 0 || idx >= lyricLines.length) return
      const posMs = sync.pos + (Date.now() - sync.at) * (playerState.playRate || 1)
      const cur = lyricLines[idx]
      const next = lyricLines[idx + 1]
      const start = cur.time
      const end = next && next.time > start ? next.time : start + 8000
      // 行内进度 0→1，驱动 offset 从上一行平滑走到当前行
      const ratio = Math.min(1, Math.max(0, (posMs - start) / Math.max(1, end - start)))
      applySmoothOffset(idx, ratio)
    }

    void syncPosition()
    const tickTimer = setInterval(tick, 50)
    const syncTimer = setInterval(syncPosition, 1000)
    const onPlayStateChange = (isPlay: boolean) => {
      if (isPlay) void syncPosition() // 恢复播放时立即重新同步，滚动无缝接续
    }
    global.state_event.on('playStateChanged', onPlayStateChange)
    return () => {
      disposed = true
      clearInterval(tickTimer)
      clearInterval(syncTimer)
      global.state_event.off('playStateChanged', onPlayStateChange)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, lyricLines, applySmoothOffset])

  useEffect(() => {
    if (line < 0) return
    lineRef.current.prevLine = lineRef.current.line
    lineRef.current.line = line
    if (!flatListRef.current || isPauseScrollRef.current) return

    // 跳转(非相邻行)时快速定位到目标行；相邻行交给上面的连续滚动驱动平滑过渡
    if (Math.abs(line - lineRef.current.prevLine) != 1) handleScrollToActive()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line])

  useEffect(() => {
    requestAnimationFrame(() => {
      playLineRef.current?.updateLayoutInfo(listLayoutInfoRef.current)
      playLineRef.current?.updateLyricLines(lyricLines)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShowLyricProgressSetting])

  const handleScrollToIndexFailed: FlatListType['onScrollToIndexFailed'] = (info) => {
    void wait().then(() => {
      handleScrollToActive(info.index)
    })
  }

  const handleLineLayout = useCallback<LineProps['onLayout']>((lineNum, height) => {
    listLayoutInfoRef.current.lineHeights[lineNum] = height
    playLineRef.current?.updateLayoutInfo(listLayoutInfoRef.current)
  }, [])

  const handleSpaceLayout = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    listLayoutInfoRef.current.spaceHeight = nativeEvent.layout.height
    playLineRef.current?.updateLayoutInfo(listLayoutInfoRef.current)
  }, [])

  const handlePlayLine = useCallback((time: number) => {
    playLineRef.current?.setVisible(false)
    global.app_event.setProgress(time)
  }, [])

  const renderItem: FlatListType['renderItem'] = ({ item, index }) => {
    return (
      <LrcLine line={item} lineNum={index} activeLine={line} progress={karaokeProgress} onLayout={handleLineLayout} />
    )
  }
  const getkey: FlatListType['keyExtractor'] = (item, index) => `${index}${item.text}`

  const spaceComponent = useMemo(() => (
    <View style={styles.space} onLayout={handleSpaceLayout}></View>
  ), [handleSpaceLayout])

  return (
    <>
      <FlatList
        data={lyricLines}
        renderItem={renderItem}
        keyExtractor={getkey}
        style={styles.container}
        ref={flatListRef}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={spaceComponent}
        ListFooterComponent={spaceComponent}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        fadingEdgeLength={100}
        initialNumToRender={Math.max(line + 10, 10)}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        onScroll={handleScroll}
      />
      { isShowLyricProgressSetting ? <PlayLine ref={playLineRef} onPlayLine={handlePlayLine} /> : null }
    </>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
    paddingLeft: 20,
    paddingRight: 20,
    // backgroundColor: 'rgba(0,0,0,0.1)',
  },
  space: {
    paddingTop: '100%',
  },
  line: {
    paddingTop: 10,
    paddingBottom: 10,
    // opacity: 0,
  },
  lineText: {
    textAlign: 'center',
    // fontSize: 16,
    // lineHeight: 20,
    // paddingTop: 5,
    // paddingBottom: 5,
    // opacity: 0,
  },
  lineTranslationText: {
    textAlign: 'center',
    // fontSize: 13,
    // lineHeight: 17,
    paddingTop: 5,
    // paddingBottom: 5,
  },
})
