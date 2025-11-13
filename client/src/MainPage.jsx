import React, { useState, useEffect } from 'react'
import itemsMock from '../scan_report.json'
import { List } from './List'
import { Item } from './Item/Item'
import { PanelFilters } from './PanelFilters/PanelFilters'
import { PanelUpload } from './PanelUpload/PanelUpload'
import cn from './MainPage.module.scss'
import { message } from 'antd'
import InfiniteList from './DataListInfiniteWithScroll'
import { GroupList } from './GroupList/GroupList'

export function MainPage({ service }) {
  const [reportData, setReportData] = useState(null)
  const [page, setPage] = useState(1)
  const [path, setPath] = useState({ params: {}, endpoint: 'ip' })

  const fetchData = async (endpoint, params) => {
    try {
      const filteredParams = params
        ? Object.fromEntries(
            Object.entries(params).filter(([key, value]) => value.trim() !== '')
          )
        : {}
      const data = await service.getData(endpoint, {
        ...filteredParams,
        page: 1,
        limit: 10,
      })
      
      setReportData(data || [])
      setPath((prev) => ({ params: filteredParams, endpoint }))
      if (endpoint !== path.endpoint) setPage(1)
    } catch (error) {
      console.error('Error fetching report:', error)
      message.error(`${error.response?.data?.error || error.message}`)
    }
  }

  useEffect(() => {
    fetchData('ip')
  }, [])

  const fetchGroupData = async (endpoint) => {
    try {
      const data = await service.getData(endpoint, {})
      setReportData(data || [])
    } catch (error) {
      console.error(`Error fetching grouped report for ${endpoint}:`, error)
    }
  }

  if (!reportData?.items?.length) {
    return <div className={cn.loading}>Загрузка...</div>
  }

  const isRenderGroupList =
    reportData?.items.length &&
    reportData.type === 'group' &&
    (reportData.field === 'keyword' || reportData.field === 'port')

  const getHeader = (type, field) => {
    const fieldCollection = {
      ip: 'IP адресам',
      port: 'Портам',
      keyword: 'Ключевым словам',
    }
    const header = {
      group: `Результаты группировки по ${fieldCollection[field].toUpperCase()}`,
      search: `Результаты поиска по ${fieldCollection[field].toUpperCase()}`,
    }
    return header[type] || 'Неизвестный тип отчета'
  }

  const loadMoreItems = async () => {
    try {
      if (!reportData.pagination.hasNext) return
      const data = await service.getData(path.endpoint, {
        ...path.params,
        page: page + 1,
        limit: 10,
      })

      if (data?.data?.items.length > 0) {
        setReportData((prevData) => ({
          ...prevData,
          items: [...prevData.items, ...data.data.items],
        }))
        setPage((prevPage) => prevPage + 1)
      } else {
        // Установка hasMore в false при отсутствии новых данных
        setReportData((prevData) => ({
          ...prevData,
          hasMore: false,
        }))
      }
    } catch (error) {
      console.error('Error loading more items:', error)
      message.error(`${error.response?.data?.error || error.message}`)
    }
  }

  return (
    <div className={cn.wrapper}>
      <div className={cn.panels}>
        <PanelFilters
          onSearch={(endpoint, params) => fetchData(endpoint, params)}
          onGroup={(endpoint) => fetchGroupData(endpoint)}
          service={service}
        />
        <PanelUpload service={service} />
      </div>
      <div>
        <div className={cn.header}>
          <span>{getHeader(reportData.type, reportData.field)}</span>
          <span>
            {`Всего: ${reportData?.pagination?.totalItems ?? 'Нет данных'}`}
          </span>
        </div>
        <hr />
        {/* <div className={`${cn.itemsGrid} ${cn.groupedList}`}> */}
                <div
          className={`${cn.itemsGrid} ${
            isRenderGroupList ? cn.groupedList : ''
          }`}
        >
          {isRenderGroupList ? (
            <GroupList
              data={reportData}
              service={service}
              currentEndpoint={reportData?.field}
            />
          ) : reportData?.items.length > 0 ? (
            
            <InfiniteList
              items={reportData.items}
              render={(item) => <Item item={item} />}
              loadMoreData={loadMoreItems}
              hasMore={reportData.hasMore || true}
            />
          ) : (
            <p className={cn.noData}>Нет данных</p>
          )}
        </div>
      </div>
    </div>
  )
}

// import { useState, useEffect } from 'react'
// import itemsMock from '../scan_report.json'
// import { List } from './List'
// import { Item } from './Item/Item'
// import { PanelFilters } from './PanelFilters/PanelFilters'
// import { PanelUpload } from './PanelUpload/PanelUpload'
// import cn from './MainPage.module.scss'
// import { message } from 'antd'
// import { GroupList } from './GroupList/GroupList'

// export function MainPage({ service }) {
//   const [reportData, setReportData] = useState(null)
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
//       setReportData(data?.data || [])
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
//       setReportData(data?.data || [])
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
//   const getHeader = (type, field) => {
//     const fieldCollection = {
//       ip: 'IP адресам',
//       port: 'Портам',
//       keyword: 'Ключевым словам',
//     }
//     const header = {
//       group: `Результаты группировки по ${fieldCollection[field].toUpperCase()}`,
//       search: `Результаты поиска по ${fieldCollection[field].toUpperCase()}`,
//     }
//     return header[type] || 'Неизвестный тип отчета'
//   }
//   return (
//     <div className={cn.wrapper}>
//       <div className={cn.panels}>
//         <PanelFilters onSearch={fetchData} onGroup={fetchGroupData} />
//         <PanelUpload service={service} />
//       </div>
//       <div>
//         <div className={cn.header}>
//           <span>{getHeader(reportData.type, reportData.field)}</span>
//           <span>
//             {`Всего: ${reportData?.pagination?.totalItems ?? 'Нет данных'}`}
//           </span>
//         </div>
//         <hr />
        // <div
        //   className={`${cn.itemsGrid} ${
        //     isRenderGroupList ? cn.groupedList : ''
        //   }`}
        // >
//           {isRenderGroupList ? (
//             <GroupList
//               data={reportData}
//               service={service}
//               currentEndpoint={reportData.field}
//             />
//           ) : reportData?.items.length > 0 ? (
//             <List
//               items={reportData.items}
//               render={(item) => <Item item={item} />}
//             />
//           ) : (
//             <p className={cn.noData}>Нет данных</p>
//           )}
//         </div>
//       </div>
//     </div>
//   )
// }

/*********************************************************** */

// import { useState, useEffect } from 'react'
// import itemsMock from '../scan_report.json'
// import { List } from './List'
// import { Item } from './Item/Item'
// import { PanelFilters } from './PanelFilters/PanelFilters'
// import { PanelUpload } from './PanelUpload/PanelUpload'
// import cn from './MainPage.module.scss'

// export function MainPage({ service }) {
//   const [reportData, setReportData] = useState(null)
//   const [filterParams, setFilterParams] = useState({
//     ip: '',
//     ports: '',
//     keywords: '',
//   })
//   // const [root, setRoot] = useState('ip')

//   const fetchData = async (endpoint, params) => {
//     try {
//       const filteredParams = Object.fromEntries(
//         Object.entries(params).filter(([key, value]) => value.trim() !== '')
//       )

//       const data = await service.getData(endpoint, {
//         ...filteredParams,
//         ...{ page: 1, limit: 10 },
//       })
//       setReportData(data?.data || [])
//     } catch (error) {
//       console.error('Error fetching report:', error)
//     }
//   }

//   useEffect(() => {
//     fetchData('ip', filterParams)
//   }, [])

//   const handleGroup = (endpoint) => {
//     fetchGroupData(endpoint)
//     // fetchGroupData('ip/group')
//   }

//   const handleSearch = (endpoint, params) => {
//     fetchData(endpoint, params)
//   }

//   const fetchGroupData = async (endpoint) => {
//     try {
//       const data = await service.getData(endpoint, {})
//       console.log(`Grouped data for ${endpoint}:`, data.data)
//       // setReportData(data?.data || [])
//     } catch (error) {
//       console.error(`Error fetching grouped report for ${endpoint}:`, error)
//     }
//   }

//   if (!reportData?.items?.length) {
//     return <div className={cn.loading}>Загрузка...</div>
//   }

//   return (
//     <div className={cn.wrapper}>
//       <div className={cn.panels}>
//         <PanelFilters
//           service={service}
//           filterParams={filterParams}
//           setFilterParams={setFilterParams}
//           onSearch={handleSearch}
//           onGroup={handleGroup}
//         />
//         <PanelUpload service={service} />
//       </div>
//       <div>
//         <div className={cn.header}>
//           <span>Результаты анализа IP адресов </span>
//           <span>{`Всего: ${reportData?.pagination?.totalItems ?? 'Нет данных'}`}</span>
//         </div>
//         <hr />

//         <div className={cn.itemsGrid}>
//           {reportData?.items.length > 0 ? (
//             <List
//               items={reportData.items}
//               render={(item) => <Item item={item} />}
//             />
//           ) : (
//             <p>Нет данных</p>
//           )}
//         </div>
//       </div>
//     </div>
//   )
// }

// import { useState, useEffect } from 'react'
// import itemsMock from '../scan_report.json'
// import { List } from './List'
// import { Item } from './Item/Item'
// import { PanelFilters } from './PanelFilters/PanelFilters'
// import { PanelUpload } from './PanelUpload/PanelUpload'
// import cn from './MainPage.module.scss'

// export function MainPage({ service }) {
//   const [reportData, setReportData] = useState(null)
//   const defaultFilterParams = {
//     ip: '',
//     ports: '',
//     keywords: '',
//   }
//   const [filterParams, setFilterParams] = useState(defaultFilterParams)
//   const [root, setRoot] = useState('ip')

//   const fetchData = async (params) => {
//     try {
//       const filteredParams = Object.fromEntries(
//         Object.entries(params).filter(([key, value]) => value.trim() !== '')
//       )
//       console.log('filteredParams > ', filteredParams)
//       const data = await service.getData(root, {
//         ...{ page: 1, limit: 10 },
//         ...filteredParams,
//       })
//       setReportData(data?.data || [])
//     } catch (error) {
//       console.error('Error fetching report:', error)
//     }
//   }

//   useEffect(() => {
//     fetchData(filterParams)
//   }, [])

//   const handleFilterChange = (params) => {
//     setFilterParams(params)
//     fetchData(params)
//   }

//   const handleGroupByIp = () => {
//     fetchGroupData('ip/group')
//   }

//   const handleGroupByPorts = () => {
//     fetchGroupData('ports/group')
//   }

//   const handleGroupByKeyWords = () => {
//     fetchGroupData('keywords/group')
//   }

//   const fetchGroupData = async (endpoint) => {
//     try {
//       const data = await service.getData(endpoint, {})
//       console.log(`Grouped data for ${endpoint}:`, data.data)
//     } catch (error) {
//       console.error(`Error fetching grouped report for ${endpoint}:`, error)
//     }
//   }

//   if (!reportData?.items?.length) {
//     return <div className={cn.loading}>Загрузка...</div>
//   }

//   return (
//     <div className={cn.wrapper}>
//       <div className={cn.panels}>
//         <PanelFilters
//           service={service}
//           defaultFilterParams={defaultFilterParams}
//           filterParams={filterParams}
//           setRoot={setRoot}
//           setFilterParams={setFilterParams}
//           onFilterChange={handleFilterChange}
//           onGroupByIp={handleGroupByIp}
//           onGroupByPorts={handleGroupByPorts}
//           onGroupByKeyWords={handleGroupByKeyWords}
//         />
//         <PanelUpload service={service} />
//       </div>
//       <div>
//         <div className={cn.header}>
//           <span>Результаты анализа IP адресов </span>
//           <span>{`Всего: ${reportData.pagination.totalItems}`}</span>
//         </div>
//         <hr />
//         <div className={cn.itemsGrid}>
//           {reportData?.items.length > 0 ? (
//             <List
//               items={reportData.items}
//               render={(item) => <Item item={item} />}
//             />
//           ) : (
//             <p>Нет данных</p>
//           )}
//         </div>
//       </div>
//     </div>
//   )
// }
// // без пагинации

// import { useState, useEffect } from 'react'
// import itemsMock from '../scan_report.json'
// import { List } from './List'
// import { Item } from './Item/Item'
// import { PanelFilters } from './PanelFilters/PanelFilters'
// import { PanelUpload } from './PanelUpload/PanelUpload'
// import cn from './MainPage.module.scss'

// export function MainPage({ service }) {
//   const [reportData, setReportData] = useState([])

//   const fetchData = async () => {
//     try {
//       const data = await service.getData('ip', { page: 1, limit: 10 })
//       console.log(data.data)
//       setReportData(data?.data || [])
//     } catch (error) {
//       console.error('Error fetching report:', error)
//     }
//   }

//   useEffect(() => {
//     fetchData()
//   }, [])

//   if (!reportData?.items?.length) {
//     return <div className={cn.loading}>Загрузка...</div>
//   }

//   return (
//     <div className={cn.wrapper}>
//       <div className={cn.panels}>
//         <PanelFilters service={service} />
//         <PanelUpload service={service} />
//       </div>
//       <div>
//         <div className={cn.header}>
//           <span>Результаты анализа IP адресов </span>
//           <span>{`Всего: ${reportData.pagination.totalItems}`}</span>
//         </div>

//         <hr />

//         <div className={cn.itemsGrid}>
//           {reportData?.items.length > 0 ? (
//             <List
//               items={reportData.items}
//               render={(item) => <Item item={item} />}
//             />
//           ) : (
//             <p>Нет данных</p>
//           )}
//         </div>
//       </div>
//     </div>
//   )
// }

// Пагинация
// // components/MainPage.jsx
// import React from 'react'
// import { List } from './List'
// import { Item } from './Item/Item'
// import { PanelFilters } from './PanelFilters/PanelFilters'
// import { PanelUpload } from './PanelUpload/PanelUpload'
// import cn from './MainPage.module.scss'

// export function MainPage({
//   service,
//   items,
//   loading,
//   // hasMore,
//   totalItems,
//   // loadMore
// }) {

//   if (loading && items.length === 0) {
//     return <div className={cn.loading}>Загрузка...</div>
//   }

//   return (
//     <div className={cn.wrapper}>
//       <div className={cn.panels}>
//         <PanelFilters service={service} />
//         <PanelUpload service={service} />
//       </div>
//       <div>
//         <div className={cn.header}>
//           <span>Результаты анализа IP адресов </span>
//           <span>{`Всего: ${totalItems}`}</span>
//         </div>

//         <hr />

//         <div className={cn.itemsGrid}>
//           {items?.length > 0 ? (
//             <List items={items} render={(item) => <Item item={item} />} />
//           ) : (
//             <p>Нет данных</p>
//           )}
//         </div>
//       </div>
//     </div>
//   )
// }

/* intersectionObserver */
// import React, { useState, useEffect, useCallback, useRef } from 'react'
// import { List } from './List'
// import { Item } from './Item/Item'
// import { PanelFilters } from './PanelFilters/PanelFilters'
// import { PanelUpload } from './PanelUpload/PanelUpload'
// import cn from './MainPage.module.scss'

// export function MainPage({ service }) {
//   const [reportData, setReportData] = useState([])
//   const [loading, setLoading] = useState(false)
//   const [page, setPage] = useState(1)
//   const [hasMore, setHasMore] = useState(true)
//   const [loadingMore, setLoadingMore] = useState(false)
//   const loaderRef = useRef(null)

//   const fetchData = useCallback(async (pageNum = 1, reset = false) => {
//     if (loading || loadingMore) return

//     setLoading(reset ? false : true)
//     setLoadingMore(reset ? false : true)

//     try {
//       const params = {
//         page: pageNum,
//         limit: 10
//       }

//       const data = await service.getData('ip', params)

//       if (reset) {
//         setReportData(data?.items || [])
//       } else {
//         setReportData(prev => [...prev, ...(data?.items || [])])
//       }

//       setHasMore(data?.items?.length === 10) // Если получили меньше 10 - больше нет
//       setPage(pageNum)
//     } catch (error) {
//       console.error('Error fetching report:', error)
//       setHasMore(false)
//     } finally {
//       setLoading(false)
//       setLoadingMore(false)
//     }
//   }, [loading, loadingMore])

//   useEffect(() => {
//     fetchData(1, true)
//   }, [fetchData])

//   // Intersection Observer для бесконечной прокрутки
//   useEffect(() => {
//     const observer = new IntersectionObserver(
//       (entries) => {
//         if (entries[0].isIntersecting && hasMore && !loadingMore) {
//           console.log('Intersection observer сработал, загружаем страницу:', page + 1);
//           fetchData(page + 1)
//         }
//       },
//       {
//         root: null, // viewport
//         rootMargin: '200px', // начать загрузку за 200px до конца
//         threshold: 0.1
//       }
//     )

//     if (loaderRef.current) {
//       observer.observe(loaderRef.current)
//     }

//     return () => {
//       if (loaderRef.current) {
//         observer.unobserve(loaderRef.current)
//       }
//     }
//   }, [hasMore, loadingMore, page, fetchData])

//   if (loading && reportData.length === 0) {
//     return <div className={cn.loading}>Загрузка...</div>
//   }

//   return (
//     <div className={cn.wrapper}>
//       <div className={cn.panels}>
//         <PanelFilters service={service} />
//         <PanelUpload service={service} />
//       </div>
//       <div>
//         <div className={cn.header}>
//           <span>Результаты анализа IP адресов </span>
//           <span>{`Всего: ${reportData.length}`}</span>
//         </div>

//         <hr />

//         <div className={cn.itemsGrid}>
//           {reportData?.length > 0 ? (
//             <List
//               items={reportData}
//               render={(item) => <Item item={item} />}
//             />
//           ) : (
//             <p>Нет данных</p>
//           )}

//           {/* Loader для бесконечной прокрутки */}
//           <div ref={loaderRef} className={cn.loader}>
//             {loadingMore && (
//               <div className={cn.loadingMore}>
//                 Загрузка...
//               </div>
//             )}
//           </div>

//           {!hasMore && reportData.length > 0 && (
//             <div className={cn.noMore}>
//               Больше данных нет
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   )
// }
