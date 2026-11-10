import { memo } from 'react'
import { StyleSheet, View } from 'react-native'

import Section from '../components/Section'

import { useI18n } from '@/lang'
import Text from '@/components/common/Text'

// 🔒 私有分发版：移除版本对比与「检查/打开更新」入口。
// 更新由发布者统一分发，App 内不提供更新通道。
const currentVer = process.versions.app
export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_version')}>
      <View style={styles.desc}>
        <Text size={14}>当前版本：{currentVer}</Text>
      </View>
    </Section>
  )
})

const styles = StyleSheet.create({
  desc: {
    marginBottom: 8,
    marginLeft: 15,
    marginRight: 15,
  },
})
