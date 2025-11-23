import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react'
import { Item } from './Item/Item'
import { PanelFilters } from './PanelFilters/PanelFilters'
import { PanelUpload } from './PanelUpload/PanelUpload'
import cn from './MainPage.module.scss'
import { Tabs, message } from 'antd'
import InfiniteList from './DataListInfiniteWithScroll'
import { GroupList } from './GroupList/GroupList'
import { SearchTitle } from './SearchTitle/SearchTitle'
import classNames from 'classnames'

// Lazy загрузка только SearchPanel
const SearchPanel = lazy(() => import('./SearchPanel/SearchPanel'))

const SearchPanelFallback = () => (
  <div style={{ padding: '20px', textAlign: 'center', color: '#8c8c8c' }}>
    Загрузка расширенного поиска...
  </div>
)

export function MainPage({ service }) {
  const [reportData, setReportData] = useState(null)
  const [page, setPage] = useState(1)
  const [path, setPath] = useState({ params: {}, endpoint: 'ip' })
  const [activeTab, setActiveTab] = useState('searchFast')
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const fetchData = async (endpoint, params, isLoadMore = false) => {
    if (isLoading) return

    try {
      setIsLoading(true)
      const filteredParams = params
        ? Object.fromEntries(
            Object.entries(params).filter(
              ([key, value]) => value?.toString().trim() !== ''
            )
          )
        : {}

      const currentPage = isLoadMore ? page + 1 : 1
      const data = await service.getData(endpoint, {
        ...filteredParams,
        page: currentPage,
        limit: 10,
      })

      if (isLoadMore) {
        // Для подгрузки добавляем к существующим данным
        setReportData((prevData) => ({
          ...prevData,
          items: [...prevData.items, ...data.items],
          pagination: data.pagination,
        }))
        setPage(currentPage)
      } else {
        // Для нового поиска заменяем данные
        setReportData(data || { items: [], pagination: {} })
        setPage(1)
        setPath({ params: filteredParams, endpoint })
      }

      // Обновляем состояние hasMore на основе пагинации
      setHasMore(data?.pagination?.hasNext || false)
    } catch (error) {
      console.error('Error fetching report:', error)
      message.error(`${error.response?.data?.error || error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData('ip')
  }, [])

  const fetchGroupData = async (endpoint) => {
    try {
      const data = await service.getData(endpoint, {})
      setReportData(data || { items: [], pagination: {} })
      setHasMore(false) // Группированные данные обычно не поддерживают пагинацию
    } catch (error) {
      console.error(`Error fetching grouped report for ${endpoint}:`, error)
    }
  }

  // Мемоизированная функция для подгрузки
  const loadMoreItems = useCallback(async () => {
    if (!hasMore || isLoading) return
    await fetchData(path.endpoint, path.params, true)
  }, [hasMore, isLoading, path.endpoint, path.params, page])

  const preloadSearchPanel = () => {
    import('./SearchPanel/SearchPanel')
  }

  const isRenderGroupList =
    reportData?.items?.length &&
    reportData.type === 'group' &&
    (reportData.field === 'keyword' || reportData.field === 'port')

  const listWrapper = classNames(cn.itemsGrid, {
    [cn.groupedList]: isRenderGroupList,
  })

  if (!reportData) {
    return <div className={cn.loading}>Загрузка...</div>
  }

  return (
    <div className={cn.wrapper}>
      <div className={cn.panels}>
        <div className={cn.tabsWrapper}>
          <Tabs
            size="small"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                label: 'Быстрый поиск',
                key: 'searchFast',
                children: (
                  <PanelFilters
                    onSearch={(endpoint, params) => fetchData(endpoint, params)}
                    onGroup={(endpoint) => fetchGroupData(endpoint)}
                    service={service}
                  />
                ),
              },
              {
                label: 'Супер поиск',
                key: 'searchSuper',
                children: (
                  <Suspense fallback={<SearchPanelFallback />}>
                    <SearchPanel
                      onSearch={(endpoint, params) =>
                        fetchData(endpoint, params)
                      }
                      onGroup={(endpoint) => fetchGroupData(endpoint)}
                      service={service}
                    />
                  </Suspense>
                ),
              },
            ]}
            onTabClick={(key) => {
              if (key === 'searchSuper') {
                preloadSearchPanel()
              }
            }}
          />
        </div>
        <PanelUpload service={service} />
      </div>
      <div>
        <div className={cn.header}>
          <SearchTitle type={reportData.type} field={reportData.field} />
          <span>
            {`Всего: ${reportData?.pagination?.totalItems ?? reportData?.items?.length ?? 'Нет данных'}`}
          </span>
        </div>
        <hr />
        <div className={listWrapper}>
          {isRenderGroupList ? (
            <GroupList
              data={reportData}
              service={service}
              currentEndpoint={reportData?.field}
            />
          ) : reportData?.items?.length > 0 ? (
            <InfiniteList
              items={reportData.items}
              render={(item) => <Item item={item} />}
              loadMoreData={loadMoreItems}
              hasMore={hasMore}
              isLoading={isLoading}
            />
          ) : (
            <p className={cn.noData}>Нет данных</p>
          )}
        </div>
      </div>
    </div>
  )
}

// import React, { useState, useEffect } from 'react'
// import { Item } from './Item/Item'
// import { PanelFilters } from './PanelFilters/PanelFilters'
// import { PanelUpload } from './PanelUpload/PanelUpload'
// import cn from './MainPage.module.scss'
// import { Tabs, message } from 'antd'
// import InfiniteList from './DataListInfiniteWithScroll'
// import { GroupList } from './GroupList/GroupList'
// import { SearchTitle } from './SearchTitle/SearchTitle'
// import classNames from 'classnames'
// import { SearchPanel } from './SearchPanel/SearchPanel'

// export function MainPage({ service }) {
//   const [reportData, setReportData] = useState(null)
//   const [page, setPage] = useState(1)
//   const [path, setPath] = useState({ params: {}, endpoint: 'ip' })

//   const fetchData = async (endpoint, params) => {
//     try {
//       const filteredParams = params
//         ? Object.fromEntries(
//             Object.entries(params).filter(([key, value]) => value.trim() !== '')
//           )
//         : {}
//       const data = await service.getData(endpoint, {
//         ...filteredParams,
//         page: 1,
//         limit: 10,
//       })
//       setReportData(data || [])
//       setPath((prev) => ({ params: filteredParams, endpoint }))
//       if (endpoint !== path.endpoint) setPage(1)
//     } catch (error) {
//       console.error('Error fetching report:', error)
//       message.error(`${error.response?.data?.error || error.message}`)
//     }
//   }

//   useEffect(() => {
//     fetchData('ip')
//   }, [])

//   const fetchGroupData = async (endpoint) => {
//     try {
//       const data = await service.getData(endpoint, {})
//       setReportData(data || [])
//     } catch (error) {
//       console.error(`Error fetching grouped report for ${endpoint}:`, error)
//     }
//   }

//   if (!reportData?.items?.length) {
//     return <div className={cn.loading}>Загрузка...</div>
//   }

//   const isRenderGroupList =
//     reportData?.items.length &&
//     reportData.type === 'group' &&
//     (reportData.field === 'keyword' || reportData.field === 'port')

//   const loadMoreItems = async () => {
//     try {
//       if (!reportData.pagination.hasNext) return
//       const data = await service.getData(path.endpoint, {
//         ...path.params,
//         page: page + 1,
//         limit: 10,
//       })
//       if (data?.items.length > 0) {
//         setReportData((prevData) => ({
//           ...prevData,
//           items: [...prevData.items, ...data.items],
//         }))
//         setPage((prevPage) => prevPage + 1)
//       } else {
//         setReportData((prevData) => ({
//           ...prevData,
//           hasMore: false,
//         }))
//       }
//     } catch (error) {
//       console.error('Error loading more items:', error)
//       message.error(`${error.response?.data?.error || error.message}`)
//     }
//   }

//   const listWrapper = classNames(cn.itemsGrid, {
//     [cn.groupedList]: isRenderGroupList,
//   })

//   return (
//     <div className={cn.wrapper}>
//       <div className={cn.panels}>
//         <div className={cn.tabsWrapper}>
//           <Tabs
//             size="small"
//             items={[
//               {
//                 label: 'Быстрый поиск',
//                 key: 'searchFast',
//                 children: (
//                   <PanelFilters
//                     onSearch={(endpoint, params) => fetchData(endpoint, params)}
//                     onGroup={(endpoint) => fetchGroupData(endpoint)}
//                     service={service}
//                   />
//                 ),
//               },
//               {
//                 label: 'Супер поиск',
//                 key: 'searchSuper',
//                 children: (
//                   <SearchPanel
//                     onSearch={(endpoint, params) => fetchData(endpoint, params)}
//                     onGroup={(endpoint) => fetchGroupData(endpoint)}
//                     service={service}
//                   />
//                 ),
//               },
//             ]}
//           />
//         </div>
//         <PanelUpload service={service} />
//       </div>
//       <div>
//         <div className={cn.header}>
//           <SearchTitle type={reportData.type} field={reportData.field} />
//           <span>
//             {`Всего: ${reportData?.pagination?.totalItems ?? 'Нет данных'}`}
//           </span>
//         </div>
//         <hr />
//         <div className={listWrapper}>
//           {isRenderGroupList ? (
//             <GroupList
//               data={reportData}
//               service={service}
//               currentEndpoint={reportData?.field}
//             />
//           ) : reportData?.items.length > 0 ? (
//             <InfiniteList
//               items={reportData.items}
//               render={(item) => <Item item={item} />}
//               loadMoreData={loadMoreItems}
//               hasMore={reportData.hasMore || true}
//             />
//           ) : (
//             <p className={cn.noData}>Нет данных</p>
//           )}
//         </div>
//       </div>
//     </div>
//   )
// }
