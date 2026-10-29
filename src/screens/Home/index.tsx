import { useEffect } from 'react'
import { useHorizontalMode } from '@/utils/hooks'
import PageContent from '@/components/PageContent'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import Vertical from './Vertical'
import Horizontal from './Horizontal'
import { navigations } from '@/navigation'
import settingState from '@/store/setting/state'
import { AppGuardModal } from '@/components/AppGuardModal' // 引入开屏门禁组件

interface Props {
  componentId: string
}

export default ({ componentId }: Props) => {
  const isHorizontalMode = useHorizontalMode()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.home, componentId)

    if (settingState.setting['player.startupPushPlayDetailScreen']) {
      navigations.pushPlayDetailScreen(componentId, true)
    }
  }, [])

  return (
    <>
      {/* 挂载 AppGuardModal 门禁：未激活时跳出带有蓝色高亮 TextInput 的全屏遮罩 */}
      <AppGuardModal />

      <PageContent>
        {
          isHorizontalMode
            ? <Horizontal />
            : <Vertical />
        }
      </PageContent>
    </>
  )
}
