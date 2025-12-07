import React, {
  useState,
  useEffect,
  Suspense,
  lazy,
  useCallback,
  useRef,
} from 'react'
import { Item } from './Item/Item'
import { PanelFilters } from './PanelFilters/PanelFilters'
import { PanelUpload } from './PanelUpload/PanelUpload'
import cn from './MainPage.module.scss'
import { Tabs, message } from 'antd'
import InfiniteList from './DataListInfiniteWithScroll'
import { GroupList } from './GroupList/GroupList'
import { SearchTitle } from './SearchTitle/SearchTitle'
import classNames from 'classnames'

const SearchPanel = lazy(() => import('./SearchPanel/SearchPanel'))

const SearchPanelFallback = () => (
  <div style={{ padding: '20px', textAlign: 'center', color: '#8c8c8c' }}>
    Загрузка расширенного поиска...
  </div>
)

export function MainPage({ service }) {
  const [reportData, setReportData] = useState({ items: [], pagination: {} })
  const [page, setPage] = useState(1)
  const [path, setPath] = useState({ params: {}, endpoint: 'ip' })
  const [activeTab, setActiveTab] = useState('searchFast')
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const isLoadMoreRef = useRef(false)

  // Функция для запросов из PanelFilters
  const fetchData = async (endpoint, params = {}, isLoadMore = false) => {
    if (isLoading) return

    try {
      setIsLoading(true)
      isLoadMoreRef.current = isLoadMore

      const filteredParams = params
        ? Object.fromEntries(
            Object.entries(params).filter(
              ([key, value]) => value?.toString().trim() !== ''
            )
          )
        : {}

      const currentPage = isLoadMore ? page : 1
      const data = await service.getData(endpoint, {
        ...filteredParams,
        page: currentPage,
        limit: 10,
      })

      if (isLoadMore) {
        // Для подгрузки добавляем к существующим данным
        setReportData((prevData) => {
          const existingIds = new Set(prevData.items.map(item => item.id))
          const newItems = data.items.filter(item => !existingIds.has(item.id))

          return {
            ...prevData,
            items: [...prevData.items, ...newItems],
            pagination: data.pagination || {},
            type: data.type || 'search',
            field: data.field || endpoint
          }
        })
        setPage(currentPage + 1)
      } else {
        // Для нового поиска заменяем данные
        setReportData({
          items: data?.items || [],
          pagination: data?.pagination || {},
          type: data?.type || 'search',
          field: data?.field || endpoint
        })
        setPage(2)
        setPath({ params: filteredParams, endpoint })
      }

      setHasMore(data?.pagination?.hasNext || false)
    } catch (error) {
      console.error('Error fetching report:', error)
      message.error(`${error.response?.data?.error || error.message}`)

      if (isLoadMore) {
        setHasMore(false)
      }
    } finally {
      setIsLoading(false)
      isLoadMoreRef.current = false
    }
  }

  useEffect(() => {
    fetchData('ip')
  }, [])

  // Функция для запросов из SearchPanel
  const fetchSearchData = async (endpoint, params = {}, isGroup = false, isLoadMore = false) => {
    if (isLoading) return

    try {
      setIsLoading(true)
      isLoadMoreRef.current = isLoadMore
      
      const currentPage = isLoadMore ? page : 1
      
      // Добавляем параметры пагинации
      const requestData = {
        ...params,
        page: currentPage,
        limit: 10
      }
      
      const data = await service.postData(endpoint, requestData)

      if (isLoadMore) {
        // Для подгрузки добавляем к существующим данным
        setReportData((prevData) => {
          const existingIds = new Set(prevData.items.map(item => item.id))
          const newItems = data.items.filter(item => !existingIds.has(item.id))
          
          return {
            ...prevData,
            items: [...prevData.items, ...newItems],
            pagination: data?.pagination || {},
            type: isGroup ? 'group' : 'search',
            field: data?.field || endpoint
          }
        })
        setPage(currentPage + 1)
      } else {
        // Для нового поиска заменяем данные
        setReportData({
          items: data?.items || [],
          pagination: data?.pagination || {},
          type: isGroup ? 'group' : 'search',
          field: data?.field || endpoint
        })
        setPage(2)
        setPath({ params, endpoint })
      }

      // Обновляем состояние hasMore
      setHasMore(data?.pagination?.hasNext || false)
      
    } catch (error) {
      console.error('Error fetching search data:', error)
      message.error(`${error.response?.data?.error || error.message}`)
      
      if (isLoadMore) {
        setHasMore(false)
      }
    } finally {
      setIsLoading(false)
      isLoadMoreRef.current = false
    }
  }

  const fetchGroupData = async (endpoint) => {
    try {
      const data = await service.getData(endpoint, {})
      setReportData({
        items: data?.items || [],
        pagination: data?.pagination || {},
        type: data?.type || 'group',
        field: data?.field || endpoint
      })
      setHasMore(false)
      setPage(1)
    } catch (error) {
      console.error(`Error fetching grouped report for ${endpoint}:`, error)
    }
  }

  // Мемоизированная функция для подгрузки
  const loadMoreItems = useCallback(async () => {
    if (!hasMore || isLoading || isLoadMoreRef.current) return
    
    if (path.endpoint === '/data/search' || path.endpoint === '/data/group') {
      // Для запросов из SearchPanel
      await fetchSearchData(path.endpoint, path.params, reportData.type === 'group', true)
    } else {
      // Для обычных запросов из PanelFilters
      await fetchData(path.endpoint, path.params, true)
    }
  }, [hasMore, isLoading, path.endpoint, path.params, reportData.type])

  const preloadSearchPanel = () => {
    import('./SearchPanel/SearchPanel')
  }

  // Условие для отображения GroupList
  const isRenderGroupList =
    reportData?.items?.length &&
    reportData.type === 'group' &&
    (reportData.field === '/data/group' ||
      reportData.field === 'keyword' ||
      reportData.field === 'keywords' ||
      reportData.field === 'ports' ||
      reportData.field === 'port')
      // console.log('reportData.field > ', reportData.field)

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
                      onSearch={(params) =>
                        fetchSearchData('/data/search', params, false, false)
                      }
                      onGroup={(params) =>
                        fetchSearchData('/data/group', params, true, false)
                      }
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
          {console.log('reportData.items > ', reportData.items)}
          {isRenderGroupList ? (
            <GroupList
              items={reportData.items}
              service={service}
              currentEndpoint={reportData?.field}
              groupingType={reportData?.field}
            />
          ) : reportData?.items?.length > 0 ? (
            <InfiniteList
              items={reportData.items}
              render={(item) => <Item key={item.id} item={item} />}
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

// import React, {
//   useState,
//   useEffect,
//   Suspense,
//   lazy,
//   useCallback,
//   useRef,
// } from 'react'
// import { Item } from './Item/Item'
// import { PanelFilters } from './PanelFilters/PanelFilters'
// import { PanelUpload } from './PanelUpload/PanelUpload'
// import cn from './MainPage.module.scss'
// import { Tabs, message } from 'antd'
// import InfiniteList from './DataListInfiniteWithScroll'
// import { GroupList } from './GroupList/GroupList'
// import { SearchTitle } from './SearchTitle/SearchTitle'
// import classNames from 'classnames'

// // Lazy загрузка только SearchPanel
// const SearchPanel = lazy(() => import('./SearchPanel/SearchPanel'))

// const SearchPanelFallback = () => (
//   <div style={{ padding: '20px', textAlign: 'center', color: '#8c8c8c' }}>
//     Загрузка расширенного поиска...
//   </div>
// )

// export function MainPage({ service }) {
//   const [reportData, setReportData] = useState({ items: [], pagination: {} })
//   const [page, setPage] = useState(1)
//   const [path, setPath] = useState({ params: {}, endpoint: 'ip' })
//   const [activeTab, setActiveTab] = useState('searchFast')
//   const [isLoading, setIsLoading] = useState(false)
//   const [hasMore, setHasMore] = useState(false)

//   // Реф для отслеживания, является ли текущий запрос подгрузкой
//   const isLoadMoreRef = useRef(false)

//   const fetchData = async (endpoint, params = {}, isLoadMore = false) => {
//     if (isLoading) return

//     try {
//       setIsLoading(true)
//       isLoadMoreRef.current = isLoadMore

//       const filteredParams = params
//         ? Object.fromEntries(
//             Object.entries(params).filter(
//               ([key, value]) => value?.toString().trim() !== ''
//             )
//           )
//         : {}

//       const currentPage = isLoadMore ? page : 1
//       const data = await service.getData(endpoint, {
//         ...filteredParams,
//         page: currentPage,
//         limit: 10,
//       })

//       if (isLoadMore) {
//         // Для подгрузки добавляем к существующим данным
//         setReportData((prevData) => {
//           // Проверяем, что данные действительно новые
//           const existingIds = new Set(prevData.items.map((item) => item.id))
//           const newItems = data.items.filter(
//             (item) => !existingIds.has(item.id)
//           )

//           return {
//             ...prevData,
//             items: [...prevData.items, ...newItems],
//             pagination: data.pagination || {},
//             type: data.type || 'search',
//             field: data.field || endpoint,
//           }
//         })
//         setPage(currentPage + 1)
//       } else {
//         // Для нового поиска заменяем данные
//         setReportData({
//           items: data?.items || [],
//           pagination: data?.pagination || {},
//           type: data?.type || 'search',
//           field: data?.field || endpoint,
//         })
//         setPage(2) // Следующая страница для подгрузки
//         setPath({ params: filteredParams, endpoint })
//       }

//       // Обновляем состояние hasMore на основе пагинации
//       setHasMore(data?.pagination?.hasNext || false)
//     } catch (error) {
//       console.error('Error fetching report:', error)
//       message.error(`${error.response?.data?.error || error.message}`)

//       // При ошибке сбрасываем флаг загрузки
//       if (isLoadMore) {
//         setHasMore(false)
//       }
//     } finally {
//       setIsLoading(false)
//       isLoadMoreRef.current = false
//     }
//   }

//   useEffect(() => {
//     fetchData('ip')
//   }, [])

//   const fetchSearchData = async (endpoint, params = {}, isGroup = false) => {
//     if (isLoading) return

//     try {
//       setIsLoading(true)

//       // Для поисковых запросов используем POST и специальную обработку
//       const data = await service.postData(endpoint, params)

//       setReportData({
//         items: data?.items || [],
//         pagination: data?.pagination || {},
//         type: isGroup ? 'group' : 'search',
//         field: data?.field || endpoint,
//       })

//       // Для пагинации в поиске
//       if (!isGroup) {
//         setPath({ params, endpoint })
//         setPage(2)
//         setHasMore(data?.pagination?.hasNext || false)
//       } else {
//         setHasMore(false) // Группированные данные обычно без пагинации
//         setPage(1)
//       }
//     } catch (error) {
//       console.error('Error fetching search data:', error)
//       message.error(`${error.response?.data?.error || error.message}`)
//     } finally {
//       setIsLoading(false)
//     }
//   }

//   const fetchGroupData = async (endpoint) => {
//     try {
//       const data = await service.getData(endpoint, {})
//       setReportData({
//         items: data?.items || [],
//         pagination: data?.pagination || {},
//         type: data?.type || 'group',
//         field: data?.field || endpoint,
//       })
//       setHasMore(false) // Группированные данные обычно не поддерживают пагинацию
//       setPage(1)
//     } catch (error) {
//       console.error(`Error fetching grouped report for ${endpoint}:`, error)
//     }
//   }

//   // Мемоизированная функция для подгрузки
//   const loadMoreItems = useCallback(async () => {
//     if (!hasMore || isLoading || isLoadMoreRef.current) return
//     await fetchData(path.endpoint, path.params, true)
//   }, [hasMore, isLoading, path.endpoint, path.params])

//   const preloadSearchPanel = () => {
//     import('./SearchPanel/SearchPanel')
//   }

  // const isRenderGroupList =
  //   reportData?.items?.length &&
  //   reportData.type === 'group' &&
  //   (reportData.field === '/data/group' ||
  //     reportData.field === 'keyword' ||
  //     reportData.field === 'port')

//   const listWrapper = classNames(cn.itemsGrid, {
//     [cn.groupedList]: isRenderGroupList,
//   })

//   if (!reportData) {
//     return <div className={cn.loading}>Загрузка...</div>
//   }

//   return (
//     <div className={cn.wrapper}>
//       <div className={cn.panels}>
//         <div className={cn.tabsWrapper}>
//           <Tabs
//             size="small"
//             activeKey={activeTab}
//             onChange={setActiveTab}
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
//                   <Suspense fallback={<SearchPanelFallback />}>
//                     <SearchPanel
//                       onSearch={(params) =>
//                         fetchSearchData('/data/search', params, false)
//                       }
//                       onGroup={(params) =>
//                         fetchSearchData('/data/group', params, true)
//                       }
//                       service={service}
//                     />
//                   </Suspense>
//                 ),
//               },
//             ]}
//             onTabClick={(key) => {
//               if (key === 'searchSuper') {
//                 preloadSearchPanel()
//               }
//             }}
//           />
//         </div>
//         <PanelUpload service={service} />
//       </div>
//       <div>
//         <div className={cn.header}>
//           <SearchTitle type={reportData.type} field={reportData.field} />
//           <span>
//             {`Всего: ${reportData?.pagination?.totalItems ?? reportData?.items?.length ?? 'Нет данных'}`}
//           </span>
//         </div>
//         <hr />
//         <div className={listWrapper}>
//           {isRenderGroupList ? (
//             <GroupList
//               items={reportData.items}
//               service={service}
//               currentEndpoint={reportData?.field}
//               // groupingType={reportData?.pagination?.groupingType} // если бэкенд возвращает тип группировки
//             />
//           ) : reportData?.items?.length > 0 ? (
//             <InfiniteList
//               items={reportData.items}
//               render={(item) => <Item key={item.id} item={item} />}
//               loadMoreData={loadMoreItems}
//               hasMore={hasMore}
//               isLoading={isLoading}
//             />
//           ) : (
//             <p className={cn.noData}>Нет данных</p>
//           )}
//         </div>
//       </div>
//     </div>
//   )
// }

//! рабочий код без данных с searchPanel

// import React, { useState, useEffect, Suspense, lazy, useCallback, useRef } from 'react'
// import { Item } from './Item/Item'
// import { PanelFilters } from './PanelFilters/PanelFilters'
// import { PanelUpload } from './PanelUpload/PanelUpload'
// import cn from './MainPage.module.scss'
// import { Tabs, message } from 'antd'
// import InfiniteList from './DataListInfiniteWithScroll'
// import { GroupList } from './GroupList/GroupList'
// import { SearchTitle } from './SearchTitle/SearchTitle'
// import classNames from 'classnames'

// // Lazy загрузка только SearchPanel
// const SearchPanel = lazy(() => import('./SearchPanel/SearchPanel'))

// const SearchPanelFallback = () => (
//   <div style={{ padding: '20px', textAlign: 'center', color: '#8c8c8c' }}>
//     Загрузка расширенного поиска...
//   </div>
// )

// export function MainPage({ service }) {
//   const [reportData, setReportData] = useState({ items: [], pagination: {} })
//   const [page, setPage] = useState(1)
//   const [path, setPath] = useState({ params: {}, endpoint: 'ip' })
//   const [activeTab, setActiveTab] = useState('searchFast')
//   const [isLoading, setIsLoading] = useState(false)
//   const [hasMore, setHasMore] = useState(false)

//   // Реф для отслеживания, является ли текущий запрос подгрузкой
//   const isLoadMoreRef = useRef(false)

//   const fetchData = async (endpoint, params = {}, isLoadMore = false) => {
//     if (isLoading) return

//     try {
//       setIsLoading(true)
//       isLoadMoreRef.current = isLoadMore

//       const filteredParams = params
//         ? Object.fromEntries(
//             Object.entries(params).filter(
//               ([key, value]) => value?.toString().trim() !== ''
//             )
//           )
//         : {}

//       const currentPage = isLoadMore ? page : 1
//       const data = await service.getData(endpoint, {
//         ...filteredParams,
//         page: currentPage,
//         limit: 10,
//       })

//       if (isLoadMore) {
//         // Для подгрузки добавляем к существующим данным
//         setReportData((prevData) => {
//           // Проверяем, что данные действительно новые
//           const existingIds = new Set(prevData.items.map(item => item.id))
//           const newItems = data.items.filter(item => !existingIds.has(item.id))

//           return {
//             ...prevData,
//             items: [...prevData.items, ...newItems],
//             pagination: data.pagination || {},
//             type: data.type || 'search',
//             field: data.field || endpoint
//           }
//         })
//         setPage(currentPage + 1)
//       } else {
//         // Для нового поиска заменяем данные
//         setReportData({
//           items: data?.items || [],
//           pagination: data?.pagination || {},
//           type: data?.type || 'search',
//           field: data?.field || endpoint
//         })
//         setPage(2) // Следующая страница для подгрузки
//         setPath({ params: filteredParams, endpoint })
//       }

//       // Обновляем состояние hasMore на основе пагинации
//       setHasMore(data?.pagination?.hasNext || false)
//     } catch (error) {
//       console.error('Error fetching report:', error)
//       message.error(`${error.response?.data?.error || error.message}`)

//       // При ошибке сбрасываем флаг загрузки
//       if (isLoadMore) {
//         setHasMore(false)
//       }
//     } finally {
//       setIsLoading(false)
//       isLoadMoreRef.current = false
//     }
//   }

//   useEffect(() => {
//     fetchData('ip')
//   }, [])

//   const fetchGroupData = async (endpoint) => {
//     try {
//       const data = await service.getData(endpoint, {})
//       setReportData({
//         items: data?.items || [],
//         pagination: data?.pagination || {},
//         type: data?.type || 'group',
//         field: data?.field || endpoint
//       })
//       setHasMore(false) // Группированные данные обычно не поддерживают пагинацию
//       setPage(1)
//     } catch (error) {
//       console.error(`Error fetching grouped report for ${endpoint}:`, error)
//     }
//   }

//   // Мемоизированная функция для подгрузки
//   const loadMoreItems = useCallback(async () => {
//     if (!hasMore || isLoading || isLoadMoreRef.current) return
//     await fetchData(path.endpoint, path.params, true)
//   }, [hasMore, isLoading, path.endpoint, path.params])

//   const preloadSearchPanel = () => {
//     import('./SearchPanel/SearchPanel')
//   }

//   const isRenderGroupList =
//     reportData?.items?.length &&
//     reportData.type === 'group' &&
//     (reportData.field === 'keyword' || reportData.field === 'port')

//   const listWrapper = classNames(cn.itemsGrid, {
//     [cn.groupedList]: isRenderGroupList,
//   })

//   if (!reportData) {
//     return <div className={cn.loading}>Загрузка...</div>
//   }

//   return (
//     <div className={cn.wrapper}>
//       <div className={cn.panels}>
//         <div className={cn.tabsWrapper}>
//           <Tabs
//             size="small"
//             activeKey={activeTab}
//             onChange={setActiveTab}
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
//                   <Suspense fallback={<SearchPanelFallback />}>
//                     <SearchPanel
//                       onSearch={(endpoint, params) =>
//                         fetchData(endpoint, params)
//                       }
//                       onGroup={(endpoint) => fetchGroupData(endpoint)}
//                       service={service}
//                     />
//                   </Suspense>
//                 ),
//               },
//             ]}
//             onTabClick={(key) => {
//               if (key === 'searchSuper') {
//                 preloadSearchPanel()
//               }
//             }}
//           />
//         </div>
//         <PanelUpload service={service} />
//       </div>
//       <div>
//         <div className={cn.header}>
//           <SearchTitle type={reportData.type} field={reportData.field} />
//           <span>
//             {`Всего: ${reportData?.pagination?.totalItems ?? reportData?.items?.length ?? 'Нет данных'}`}
//           </span>
//         </div>
//         <hr />
//         <div className={listWrapper}>
//           {isRenderGroupList ? (
//             <GroupList
//               items={reportData.items}
//               service={service}
//               currentEndpoint={reportData?.field}
//             />
//           ) : reportData?.items?.length > 0 ? (
//             <InfiniteList
//               items={reportData.items}
//               render={(item) => <Item key={item.id} item={item} />}
//               loadMoreData={loadMoreItems}
//               hasMore={hasMore}
//               isLoading={isLoading}
//             />
//           ) : (
//             <p className={cn.noData}>Нет данных</p>
//           )}
//         </div>
//       </div>
//     </div>
//   )
// }
