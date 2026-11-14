import { useTheme } from '@/store/theme/hook'
import { StatusBar as RNStatusBar } from 'react-native'

// barStyle 可选覆盖：渐变头部/播放页底色恒深，需强制白色图标（亮主题默认是深色图标）
const StatusBar = function({ barStyle }: { barStyle?: 'light-content' | 'dark-content' }) {
  const theme = useTheme()
  const style = barStyle ?? (theme.isDark ? 'light-content' : 'dark-content')
  return <RNStatusBar backgroundColor="rgba(0,0,0,0)" barStyle={style} translucent={true} />
}

StatusBar.currentHeight = RNStatusBar.currentHeight ?? 0
StatusBar.setBarStyle = RNStatusBar.setBarStyle

export default StatusBar
