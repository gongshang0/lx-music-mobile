import { memo, useEffect, useRef, useState } from 'react'
import { View, TouchableOpacity, FlatList, type NativeScrollEvent, type NativeSyntheticEvent, type FlatListProps } from 'react-native'

import { Icon } from '@/components/common/Icon'

import { useTheme } from '@/store/theme/hook'
import { useActiveListId, useListFetching, useMyList } from '@/store/list/hook'
import { createStyle } from '@/utils/tools'
import { LIST_SCROLL_POSITION_KEY } from '@/config/constant'
import { getListPosition, saveListPosition } from '@/utils/data'
import { setActiveList } from '@/core/list'
import Text from '@/components/common/Text'
import { type Position } from './ListMenu'
import { scaleSizeH } from '@/utils/pixelRatio'
import Loading from '@/components/common/Loading'

// 新增：引入导入歌单所需的工具和创建 API
import { tipDialog } from '@/utils/tools'
import { importPlaylistFromUrl } from '@/utils/playlistImporter'
import { createUserList } from '@/core/list'

type FlatListType = FlatListProps<LX.List.MyListInfo>

const ITEM_HEIGHT = scaleSizeH(40)

const ListItem = memo(({ item, index, activeId, onPress, onShowMenu }: {
  onPress: (item: LX.List.MyListInfo) => void
  index: number
  activeId: string
  item: LX.List.MyListInfo
  onShowMenu: (item: LX.List.MyListInfo, index: number, position: { x: number, y: number, w: number, h: number }) => void
}) => {
  const theme = useTheme()
  const moreButtonRef = useRef<TouchableOpacity>(null)
  const fetching = useListFetching(item.id)

  const active = activeId == item.id

  const handleShowMenu = () => {
    if (moreButtonRef.current?.measure) {
      moreButtonRef.current.measure((fx, fy, width, height, px, py) => {
        onShowMenu(item, index, { x: Math.ceil(px), y: Math.ceil(py), w: Math.ceil(width), h: Math.ceil(height) })
      })
    }
  }

  const handlePress = () => {
    onPress(item)
  }

  return (
    <View style={{ ...styles.listItem, height: ITEM_HEIGHT }}>
      {
        active
          ? <Icon style={styles.listActiveIcon} name="chevron-right" size={12} color={theme['c-primary-font']} />
          : null
      }
      { fetching ? <Loading color={active ? theme['c-primary-font'] : theme['c-font']} style={styles.loading} /> : null }
      <TouchableOpacity style={styles.listName} onPress={handlePress}>
        <Text numberOfLines={1} color={active ? theme['c-primary-font'] : theme['c-font']}>{item.name}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleShowMenu} ref={moreButtonRef} style={styles.listMoreBtn}>
        <Icon name="dots-vertical" color={theme['c-350']} size={12} />
      </TouchableOpacity>
    </View>
  )
}, (prevProps, nextProps) => {
  return !!(prevProps.item === nextProps.item &&
    prevProps.index === nextProps.index &&
    prevProps.item.name == nextProps.item.name &&
    prevProps.activeId != nextProps.item.id &&
    nextProps.activeId != nextProps.item.id
  )
})


export default ({ onShowMenu }: {
  onShowMenu: (info: { listInfo: LX.List.MyListInfo, index: number }, position: Position) => void
}) => {
  const flatListRef = useRef<FlatList>(null)
  const allList = useMyList()
  const activeListId = useActiveListId()

  const handleToggleList = (item: LX.List.MyListInfo) => {
    global.app_event.changeLoveListVisible(false)
    requestAnimationFrame(() => {
      setActiveList(item.id)
    })
  }

  // 新增：全平台歌单导入处理逻辑
  const handleImportPlaylist = () => {
    void tipDialog({
      title: '🎵 导入外部歌单',
      message: '支持粘贴 网易云、QQ音乐、酷狗、酷我、咪咕 的歌单链接或 ID：',
      btnText: '一键解析导入',
      bgClose: true,
      isPrompt: true, // 启用输入框模式
      placeholder: '在此粘贴歌单链接或 ID...',
    }).then(async (inputText?: string) => {
      if (!inputText || !inputText.trim()) return

      try {
        const playlistData = await importPlaylistFromUrl(inputText.trim())

        if (playlistData && playlistData.list) {
          await createUserList({
            name: playlistData.name,
            list: playlistData.list,
          })

          void tipDialog({
            title: '导入成功 🎉',
            message: `成功导入歌单《${playlistData.name}》\n共包含 ${playlistData.count} 首歌曲！`,
            btnText: '查看歌单',
          })
        }
      } catch (error: any) {
        void tipDialog({
          title: '导入失败',
          message: error.message || '解析歌单超时或遇到错误',
          btnText: '重新输入',
        })
      }
    })
  }

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    void saveListPosition(LIST_SCROLL_POSITION_KEY, nativeEvent.contentOffset.y)
  }

  const showMenu = (listInfo: LX.List.MyListInfo, index: number, position: Position) => {
    onShowMenu({ listInfo, index }, position)
  }

  useEffect(() => {
    void getListPosition(LIST_SCROLL_POSITION_KEY).then((offset) => {
      flatListRef.current?.scrollToOffset({ offset, animated: false })
    })
  }, [])

  const renderItem: FlatListType['renderItem'] = ({ item, index }) => (
    <ListItem
      key={item.id}
      item={item}
      index={index}
      activeId={activeListId}
      onPress={handleToggleList}
      onShowMenu={showMenu}
    />
  )
  const getkey: FlatListType['keyExtractor'] = item => item.id
  const getItemLayout: FlatListType['getItemLayout'] = (data, index) => {
    return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }
  }

  return (
    <View style={styles.container}>
      {/* 新增：顶部导入歌单快捷操作栏 */}
      <View style={styles.importBar}>
        <TouchableOpacity style={styles.importBtn} onPress={handleImportPlaylist} activeOpacity={0.8}>
          <Text style={styles.importBtnText}>+ 导入外部歌单</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        onScroll={handleScroll}
        style={styles.flatList}
        data={allList}
        maxToRenderPerBatch={9}
        windowSize={9}
        removeClippedSubviews={true}
        initialNumToRender={18}
        renderItem={renderItem}
        keyExtractor={getkey}
        getItemLayout={getItemLayout}
      />
    </View>
  )
}


const styles = createStyle({
  container: {
    flexShrink: 1,
    flexGrow: 0,
  },
  flatList: {
    flexShrink: 1,
    flexGrow: 0,
  },
  // 新增：导入按钮栏样式
  importBar: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  importBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  listItem: {
    height: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 5,
    paddingLeft: 5,
  },
  listActiveIcon: {
    marginLeft: 3,
    textAlign: 'center',
  },
  loading: {
    marginLeft: 5,
  },
  listName: {
    height: '100%',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 5,
  },
  listMoreBtn: {
    height: '100%',
    width: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
