import { List } from '../List'
import { Item } from '../Item/Item'
import cn from './GroupList.module.scss'
import { Button } from '../Button/Button'
import { useState, useEffect } from 'react'

export const GroupList = ({ data, service, currentEndpoint }) => {
  // Используем состояние для хранения данных с пагинацией
  const [paginatedData, setPaginatedData] = useState([])
  // const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Функция для загрузки дополнительных данных
  const handleMore = async (endpoint, param, page) => {
    console.log('param > ', param)
    try {
      setLoading(true) // Устанавливаем состояние загрузки
      const response = await service.getData(`${endpoint}s/group`, {
        [endpoint]: param,
        page: page, // Используем переданную страницу
        limit: 10,
      })

      // Обновляем данные для конкретного порта/ключа
      setPaginatedData((prevData) => {
        // Находим индекс элемента, который нужно обновить
        const itemIndex = prevData.findIndex(
          (item) =>
            (item.keyword && item.keyword === param) ||
            (item.port && item.port === param)
        )

        if (itemIndex !== -1) {
          // Если элемент найден, объединяем существующие данные с новыми
          const updatedItems = [...prevData]
          const existingItem = updatedItems[itemIndex]

          // Объединяем данные по IP (убираем дубликаты)
          const allItems = [
            ...existingItem.items,
            ...(response.data.items[0]?.items || []),
          ]
          const uniqueItems = allItems.filter(
            (item, index, self) =>
              index === self.findIndex((i) => i.ip === item.ip)
          )

          // Обновляем элемент
          updatedItems[itemIndex] = {
            ...existingItem,
            items: uniqueItems,
            pagination:
              response.data.items[0]?.pagination || existingItem.pagination,
          }

          return updatedItems
        } else {
          // Если элемент не найден, добавляем новый
          return [...prevData, ...response.data.items]
        }
      })
      // setCurrentPage((prevPage) => prevPage + 1)
    } catch (error) {
      console.error(`Error fetching grouped report for ${endpoint}s:`, error)
    } finally {
      setLoading(false) // Сбрасываем состояние загрузки
    }
  }

  // Инициализация данных при изменении `data`
  useEffect(() => {
    if (data?.items.length) {
      // Изначально загружаем только первую страницу данных
      setPaginatedData(
        data.items.map((item) => ({
          ...item,
          items: item.items.slice(0, 10), // Первые 10 элементов
          pagination: {
            ...item.pagination,
            currentPage: 1,
            hasNext: item.pagination.totalItems > 10,
            hasPrev: false,
          },
        }))
      )
      // setCurrentPage(1)
    }
  }, [data])

  // Обработчик кнопки "Еще 10"
  const handleLoadMore = (endpoint, param) => {
    const currentItem = paginatedData.find(
      (item) =>
        (item.keyword && item.keyword === param) ||
        (item.port && item.port === param)
    )
    if (currentItem) {
      const nextPage = currentItem.pagination.currentPage + 1
      handleMore(endpoint, param, nextPage)
    }
  }

  // Функция для проверки, нужно ли показывать кнопку "Еще 10"
  const shouldShowLoadMore = (item) => {
    return item.pagination.hasNext
  }

  return (
    <>
      {paginatedData?.map((itemData, index) => (
        <div key={index} className={cn.listGroup}>
          <div className={cn.groupHeaderWrapper}>
            <div className={cn.groupHeader}>
              <span>{itemData.name}</span>&nbsp;
              <span>
                {itemData.name
                  ? `(порт ${itemData.port})`
                  : `${itemData.keyword}`}
              </span>
            </div>
            <span>{`Всего: ${itemData.pagination.totalItems}`}</span>
          </div>
          <List
            items={itemData.items}
            render={(item) => <Item item={item} />}
          />
          {shouldShowLoadMore(itemData) && (
            <Button
              onClick={() =>
                handleLoadMore(
                  currentEndpoint,
                  itemData.keyword ?? itemData.port
                )
              }
              loading={loading} // Добавляем состояние загрузки
            >
              Еще 10
            </Button>
          )}
        </div>
      ))}
    </>
  )
}

// import { List } from '../List'
// import { Item } from '../Item/Item'
// import cn from './GroupList.module.scss'
// import { Button } from '../Button/Button'
// import { useState, useEffect } from 'react'

// export const GroupList = ({ data, service, currentEndpoint }) => {
//   const [dataMore, setDataMore] = useState(null)
//   const [currentPage, setCurrentPage] = useState(1)

//   const handleMore = async (endpoint, param) => {
//     console.log('param > ', param)
//     try {
//       const response = await service.getData(`${endpoint + 's'}/group`, {
//         [endpoint]: param,
//         page: currentPage + 1,
//         limit: 10,
//       })
//       setDataMore((prevData) => {
//         const oldData = prevData.filter(
//           (item) => item.port === param || item.keyword === param
//         )
//         const newData = [...oldData, ...response.data.items]
//         // if (oldData.length) {
//           console.log('newData > ', newData)
//         // }
//         return [...prevData, ...response.data.items]
//       })
//       setCurrentPage((prevPage) => prevPage + 1)
//     } catch (error) {
//       console.error(
//         `Error fetching grouped report for ${endpoint + 's'}:`,
//         error
//       )
//     }
//   }

//   useEffect(() => {
//     if (!dataMore && data?.items.length) {
//       setDataMore(data.items)
//     }
//   }, [data])

//   console.log(dataMore)

//   return (
//     <>
//       {dataMore?.map((itemData, index) => (
//         <div key={index} className={cn.listGroup}>
//           <div className={cn.groupHeaderWrapper}>
//             <div className={cn.groupHeader}>
//               <span>{itemData.name}</span>&nbsp;
//               <span>
//                 {itemData.name
//                   ? `(порт ${itemData[data.field]})`
//                   : `${itemData[data.field]}`}
//               </span>
//             </div>
//             <span>{`Всего: ${itemData.pagination.totalItems}`}</span>
//           </div>
//           <List
//             items={itemData.items}
//             render={(item) => <Item item={item} />}
//           />
//           {
//             <Button
//               onClick={() =>
//                 handleMore(currentEndpoint, itemData.keyword ?? itemData.port)
//               }
//             >
//               Еще 10
//             </Button>
//           }
//         </div>
//       ))}
//     </>
//   )
// }

// import { List } from '../List'
// import { Item } from '../Item/Item'
// import cn from './GroupList.module.scss'
// import { Button } from '../Button/Button'

// export const GroupList = ({ data }) => {
//   const [dataMore, setDataMore] =

//   return data.items.map((itemData) => (
//     <div key={itemData[data.field]} className={cn.listGroup}>
//       <div className={cn.groupHeaderWrapper}>
//         <div className={cn.groupHeader}>
//           <span>{itemData.name}</span>&nbsp;
//           <span>
//             {itemData.name
//               ? `(порт ${itemData[data.field]})`
//               : `${itemData[data.field]}`}
//           </span>
//         </div>
//         <span>{`Всего: ${itemData.pagination.totalItems}`}</span>
//       </div>

//       <List items={itemData.items} render={(item) => <Item item={item} />} />
//     </div>
//   ))
// }
