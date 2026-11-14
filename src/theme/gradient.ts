// 主色渐变底上的前景色工具。
// 背景：亮主题下 c-primary-light-1000 恒为纯白，可直接当「渐变底白字」用；
// 但暗主题（black）的色阶语义整体反转——c-primary-light-1000 是深灰(49,49,49)、
// c-primary-dark-N 反而是近白色，直接复用会导致白字方案在暗主题下不可读。
// 因此所有「渐变底白字」取色必须按主题亮度自适应，不要在组件里写死色键。

// 动态色键访问（ThemeColors 无字符串索引签名，收窄一下）
const colorOf = (theme: LX.ActiveTheme, key: string): string =>
  (theme as unknown as Record<string, string>)[key]

// 实心前景色：亮主题 = 纯白；暗主题 = dark-900（近白）
export const getOnGradientColor = (theme: LX.ActiveTheme): string =>
  theme.isDark ? colorOf(theme, 'c-primary-dark-900') : theme['c-content-background']

// 半透明前景色（alpha: 100~900）
export const getOnGradientAlphaColor = (theme: LX.ActiveTheme, alpha: number): string =>
  theme.isDark
    ? colorOf(theme, `c-primary-dark-900-alpha-${alpha}`)
    : colorOf(theme, `c-primary-light-1000-alpha-${alpha}`)

// 播放页全屏三段垂直渐变：暗主题下 dark-N/light-N 视觉明暗反转，
// 改用 light-N 家族（视觉上由深到浅，白字全程可读）
export const getPageGradientColors = (theme: LX.ActiveTheme): Array<string> =>
  theme.isDark
    ? [colorOf(theme, 'c-primary-light-1000'), colorOf(theme, 'c-primary-light-700'), colorOf(theme, 'c-primary-light-400')]
    : [colorOf(theme, 'c-primary-dark-700'), theme['c-primary'], colorOf(theme, 'c-primary-light-300')]

// 头部两段斜向渐变
export const getHeaderGradientColors = (theme: LX.ActiveTheme): Array<string> =>
  theme.isDark
    ? [colorOf(theme, 'c-primary-light-1000'), colorOf(theme, 'c-primary-light-500')]
    : [theme['c-primary'], colorOf(theme, 'c-primary-light-300')]
