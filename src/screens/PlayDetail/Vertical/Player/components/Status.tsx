// import { useLrcPlay } from '@/plugins/lyric'
import { useStatusText } from '@/store/player/hook'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { getOnGradientAlphaColor } from '@/theme/gradient'
import Text from '@/components/common/Text'


export default () => {
  // const { text } = useLrcPlay()
  const theme = useTheme()
  const statusText = useStatusText()
  // console.log('render status')

  // const status = playerStatus.isPlay ? text : playerStatus.statusText

  return <Text style={styles.text} numberOfLines={1} size={13} color={getOnGradientAlphaColor(theme, 600)}>{statusText}</Text>
}

const styles = createStyle({
  text: {
    textAlign: 'center',
  },
})
