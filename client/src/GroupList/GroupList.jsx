import { List } from '../List'
import { Item } from '../Item/Item'
import cn from './GroupList.module.scss'
import { Button } from '../Button/Button'
import { useState, useEffect } from 'react'

const LIMIT = 10

export const GroupList = ({
  items,
  service,
  currentEndpoint,
  searchFilters = {}, // Получаем фильтры из SearchPanel
}) => {
  // Используем состояние для хранения данных с пагинацией
  const [paginatedData, setPaginatedData] = useState([])
  const [loadingItems, setLoadingItems] = useState({}) // Для отслеживания загрузки конкретных элементов

  // Функция для загрузки дополнительных данных
  const handleMore = async (param, itemIndex) => {
    // console.log('Loading more for:', param, 'index:', itemIndex)
    // console.log('Search filters:', searchFilters)

    try {
      setLoadingItems((prev) => ({ ...prev, [param]: true }))

      const currentItem = paginatedData[itemIndex]
      const nextPage = currentItem.pagination.currentPage + 1

      // Подготавливаем параметры запроса
      const queryParams = {
        [currentEndpoint]: param,
        page: nextPage,
        limit: LIMIT,
        // Добавляем все фильтры из SearchPanel
        ...searchFilters,
      }

      // Убираем пустые значения из queryParams
      Object.keys(queryParams).forEach((key) => {
        const value = queryParams[key]
        if (
          value === null ||
          value === undefined ||
          value === '' ||
          (typeof value === 'object' && Object.keys(value).length === 0)
        ) {
          delete queryParams[key]
        }
      })

      // Если есть dateRange, преобразуем его в startDate и endDate
      if (searchFilters.dateRange) {
        const { startDate, endDate } = searchFilters.dateRange
        if (startDate) queryParams.startDate = startDate
        if (endDate) queryParams.endDate = endDate
        delete queryParams.dateRange // Удаляем объект dateRange
      }

      console.log('Making request with params:', queryParams)

      const response = await service.getData(
        `${currentEndpoint}s/group`,
        queryParams
      )

      console.log('Response received:', response)

      // Проверяем структуру ответа
      if (!response.items || !Array.isArray(response.items)) {
        console.error('Invalid response structure:', response)
        return
      }

      // Находим соответствующий элемент в ответе
      const responseItem = response.items.find(
        (item) =>
          (item.port && item.port === param) ||
          (item.name && item.name === param) ||
          (item.keyword && item.keyword === param)
      )

      if (!responseItem) {
        console.error('Item not found in response:', param, response.items)
        return
      }

      // Обновляем данные для конкретного элемента
      setPaginatedData((prevData) => {
        const updatedItems = [...prevData]
        const existingItem = updatedItems[itemIndex]

        if (!existingItem) {
          console.error('Existing item not found at index:', itemIndex)
          return prevData
        }

        // Объединяем данные, убирая дубликаты по ID
        const existingHostIds = new Set(
          existingItem.items.map((item) => item.id)
        )
        const newItems = responseItem.items.filter(
          (item) => !existingHostIds.has(item.id)
        )

        updatedItems[itemIndex] = {
          ...existingItem,
          items: [...existingItem.items, ...newItems],
          pagination: {
            ...responseItem.pagination,
            currentPage: nextPage,
          },
        }

        console.log('Updated item:', updatedItems[itemIndex])
        return updatedItems
      })
    } catch (error) {
      console.error(
        `Error fetching grouped report for ${currentEndpoint}s:`,
        error
      )
    } finally {
      setLoadingItems((prev) => ({ ...prev, [param]: false }))
    }
  }

  // Инициализация данных при изменении `items`
  useEffect(() => {
    if (items && items.length) {
      console.log('Initializing data with items:', items)
      console.log('With search filters:', searchFilters)

      setPaginatedData(
        items.map((item) => ({
          ...item,
          // Убедимся, что items существует
          items: item.items || [],
          // Убедимся, что пагинация существует
          pagination: {
            currentPage: 1,
            totalPages: item.pagination?.totalPages || 1,
            totalItems: item.pagination?.totalItems || item.items?.length || 0,
            hasNext:
              (item.pagination?.totalItems || item.items?.length || 0) >
              (item.items?.length || LIMIT),
            hasPrev: false,
          },
        }))
      )
    } else {
      setPaginatedData([])
    }
  }, [items, searchFilters])

  // Функция для проверки, нужно ли показывать кнопку "Еще 10"
  const shouldShowLoadMore = (item) => {
    if (!item.pagination) return false
    return item.pagination.hasNext
  }

  // Получаем параметр для текущего элемента
  const getItemParam = (item) => {
    return item.port ?? item.name ?? item.keyword
  }

  return (
    <>
      {paginatedData?.map((itemData, index) => {
        const param = getItemParam(itemData)
        const isLoading = loadingItems[param] || false

        return (
          <div key={`${param}-${index}`} className={cn.listGroup}>
            <div className={cn.groupHeaderWrapper}>
              <div className={cn.groupHeader}>
                {itemData.port ? (
                  <>
                    <span>{itemData.name}</span>&nbsp;
                    <span>{`(порт ${itemData.port})`}</span>
                  </>
                ) : itemData.keyword ? (
                  <span>Ключевое слово: {itemData.keyword}</span>
                ) : (
                  <span>{itemData.name}</span>
                )}
              </div>
              <span>{`Всего: ${itemData.pagination?.totalItems || 0}`}</span>
            </div>

            <List
              items={itemData.items || []}
              render={(item) => <Item item={item} />}
            />

            {shouldShowLoadMore(itemData) && (
              <div className={cn.btnYetWrapper}>
                <Button
                  onClick={() => handleMore(param, index)}
                  loading={isLoading}
                  disabled={isLoading}
                >
                  {isLoading ? 'Загрузка...' : 'Показать еще'}
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// РАБОЧИЙ КОД но с простой пагинацией без учета параметров
// // GroupList.jsx
// import { List } from '../List'
// import { Item } from '../Item/Item'
// import cn from './GroupList.module.scss'
// import { Button } from '../Button/Button'
// import { useState, useEffect } from 'react'

// const LIMIT = 10

// export const GroupList = ({ items, service, currentEndpoint }) => {
//   // Используем состояние для хранения данных с пагинацией
//   const [paginatedData, setPaginatedData] = useState([])
//   const [loading, setLoading] = useState(false)
//   const [loadingItems, setLoadingItems] = useState({}) // Для отслеживания загрузки конкретных элементов

//   // Функция для загрузки дополнительных данных
//   const handleMore = async (param, itemIndex) => {
//     console.log('Loading more for:', param, 'index:', itemIndex)

//     try {
//       setLoadingItems(prev => ({ ...prev, [param]: true }))

//       const currentItem = paginatedData[itemIndex]
//       const nextPage = currentItem.pagination.currentPage + 1

//       console.log('Making request with params:', {
//         [currentEndpoint]: param,
//         page: nextPage,
//         limit: LIMIT,
//       })

//       const response = await service.getData(`${currentEndpoint}s/group`, {
//         [currentEndpoint]: param,
//         page: nextPage,
//         limit: LIMIT,
//       })

//       console.log('Response received:', response)

//       // Проверяем структуру ответа
//       if (!response.items || !Array.isArray(response.items)) {
//         console.error('Invalid response structure:', response)
//         return
//       }

//       // Находим соответствующий элемент в ответе
//       const responseItem = response.items.find(item =>
//         (item.port && item.port === param) || (item.name && item.name === param)
//       )

//       if (!responseItem) {
//         console.error('Item not found in response:', param, response.items)
//         return
//       }

//       // Обновляем данные для конкретного элемента
//       setPaginatedData((prevData) => {
//         const updatedItems = [...prevData]
//         const existingItem = updatedItems[itemIndex]

//         if (!existingItem) {
//           console.error('Existing item not found at index:', itemIndex)
//           return prevData
//         }

//         // Объединяем данные, убирая дубликаты по ID
//         const existingHostIds = new Set(existingItem.items.map(item => item.id))
//         const newItems = responseItem.items.filter(item => !existingHostIds.has(item.id))

//         updatedItems[itemIndex] = {
//           ...existingItem,
//           items: [...existingItem.items, ...newItems],
//           pagination: {
//             ...responseItem.pagination,
//             currentPage: nextPage,
//           },
//         }

//         console.log('Updated item:', updatedItems[itemIndex])
//         return updatedItems
//       })
//     } catch (error) {
//       console.error(`Error fetching grouped report for ${currentEndpoint}s:`, error)
//     } finally {
//       setLoadingItems(prev => ({ ...prev, [param]: false }))
//     }
//   }

//   // Инициализация данных при изменении `items`
//   useEffect(() => {
//     if (items && items.length) {
//       console.log('Initializing data with items:', items)
//       setPaginatedData(
//         items.map((item) => ({
//           ...item,
//           // Убедимся, что items существует
//           items: item.items || [],
//           // Убедимся, что пагинация существует
//           pagination: {
//             currentPage: 1,
//             totalPages: item.pagination?.totalPages || 1,
//             totalItems: item.pagination?.totalItems || item.items?.length || 0,
//             hasNext: (item.pagination?.totalItems || item.items?.length || 0) > (item.items?.length || 0),
//             hasPrev: false,
//           },
//         }))
//       )
//     } else {
//       setPaginatedData([])
//     }
//   }, [items])

//   // Функция для проверки, нужно ли показывать кнопку "Еще 10"
//   const shouldShowLoadMore = (item) => {
//     if (!item.pagination) return false
//     return item.pagination.hasNext
//   }

//   // Получаем параметр для текущего элемента
//   const getItemParam = (item) => {
//     return item.port ?? item.name ?? item.keyword
//   }

//   return (
//     <>
//       {paginatedData?.map((itemData, index) => {
//         const param = getItemParam(itemData)
//         const isLoading = loadingItems[param] || false

//         return (
//           <div key={`${param}-${index}`} className={cn.listGroup}>
//             <div className={cn.groupHeaderWrapper}>
//               <div className={cn.groupHeader}>
//                 {itemData.port ? (
//                   <>
//                     <span>{itemData.name}</span>&nbsp;
//                     <span>{`(порт ${itemData.port})`}</span>
//                   </>
//                 ) : itemData.keyword ? (
//                   <span>Ключевое слово: {itemData.keyword}</span>
//                 ) : (
//                   <span>{itemData.name}</span>
//                 )}
//               </div>
//               <span>{`Всего: ${itemData.pagination?.totalItems || 0}`}</span>
//             </div>

//             <List
//               items={itemData.items || []}
//               render={(item) => <Item item={item} />}
//             />

//             {shouldShowLoadMore(itemData) && (
//               <div className={cn.btnYetWrapper}>
//                 <Button
//                   onClick={() => handleMore(param, index)}
//                   loading={isLoading}
//                   disabled={isLoading}
//                 >
//                   {isLoading ? 'Загрузка...' : 'Показать еще'}
//                 </Button>
//               </div>
//             )}
//           </div>
//         )
//       })}
//     </>
//   )
// }

// // GroupList.jsx
// import { List } from '../List'
// import { Item } from '../Item/Item'
// import cn from './GroupList.module.scss'
// import { Button } from '../Button/Button'
// import { useState, useEffect } from 'react'

// const LIMIT = 10

// export const GroupList = ({ items, service, currentEndpoint }) => {
//   // Используем состояние для хранения данных с пагинацией
//   const [paginatedData, setPaginatedData] = useState([])
//   const [loading, setLoading] = useState(false)

//   // Функция для загрузки дополнительных данных
//   const handleMore = async (endpoint, param, page) => {
//     console.log( 'endpoint, param, page >> ', endpoint, param, page)
//     try {
//       setLoading(true) // Устанавливаем состояние загрузки
//       const response = await service.getData(`${endpoint}s/group`, {
//         [endpoint]: param,
//         page: page, // Используем переданную страницу
//         limit: LIMIT,
//       })
//       console.log('response #', response)

//       // Обновляем данные для конкретного порта/ключа
//       setPaginatedData((prevData) => {
//         // Находим индекс элемента, который нужно обновить
//         const itemIndex = prevData.findIndex(
//           (item) =>
//             (item.port && item.port === param) ||
//             (item.name && item.name === param)
//         )

//         if (itemIndex !== -1) {
//           // Если элемент найден, объединяем существующие данные с новыми
//           const updatedItems = [...prevData]
//           const existingItem = updatedItems[itemIndex]

//           // Объединяем данные по IP (убираем дубликаты)
//           const allItems = [
//             ...existingItem.items,
//             ...(response.items[0]?.items || []),
//           ]
//           const uniqueItems = allItems.filter(
//             (item, index, self) =>
//               index === self.findIndex((i) => i.ip === item.ip)
//           )

//           // Обновляем элемент
//           updatedItems[itemIndex] = {
//             ...existingItem,
//             items: uniqueItems,
//             pagination:
//               response.items[0]?.pagination || existingItem.pagination,
//           }

//           return updatedItems
//         } else {
//           // Если элемент не найден, добавляем новый
//           return [...prevData, ...response.items]
//         }
//       })
//     } catch (error) {
//       console.error(`Error fetching grouped report for ${endpoint}s:`, error)
//     } finally {
//       setLoading(false) // Сбрасываем состояние загрузки
//     }
//   }

//   // Инициализация данных при изменении `item`
//   useEffect(() => {
//     if (items.length) {
//       // Изначально загружаем только первую страницу данных
//       setPaginatedData(
//         items.map((item) => ({
//           ...item,
//           items: item.items,
//           pagination: {
//             ...item.pagination,
//             currentPage: 1,
//             hasNext: item.pagination?.totalItems > LIMIT,
//             hasPrev: false,
//           },
//         }))
//       )
//     }
//   }, [items])

//   const handleLoadMore = (endpoint, param) => {

//     const currentItem = paginatedData.find(
//       (item) =>
//         (item.port && item.port === param) || (item.name && item.name === param)
//     )

//     if (currentItem) {
//       const nextPage = currentItem.pagination.currentPage + 1
//       handleMore(endpoint, param, nextPage)
//     }
//   }

//   // Функция для проверки, нужно ли показывать кнопку "Еще 10"
//   const shouldShowLoadMore = (item) => {
//     return item.pagination.hasNext
//   }

//   return (
//     <>
//       {paginatedData?.map((itemData, index) => (
//         <div key={index} className={cn.listGroup}>
//           <div className={cn.groupHeaderWrapper}>
//             <div className={cn.groupHeader}>
//               {itemData.port ? (
//                 <>
//                   <span>{itemData.name}</span>&nbsp;
//                   <span>{`(порт ${itemData.port})`}</span>
//                 </>
//               ) : (
//                 <span>{itemData.name}</span>
//               )}
//             </div>
//             <span>{`Всего: ${itemData.pagination.totalItems || 0}`}</span>
//           </div>
//           <List
//             items={itemData.items}
//             render={(item) => <Item item={item} />}
//           />
//           {shouldShowLoadMore(itemData) && (
//             <div className={cn.btnYetWrapper}>
//               <Button
//                 onClick={() =>
//                   handleLoadMore(
//                     currentEndpoint,
//                     itemData.port ?? itemData.name
//                   )
//                 }
//                 loading={loading}
//               >
//                 Показать еще
//               </Button>
//             </div>
//           )}
//         </div>
//       ))}
//     </>
//   )
// }
