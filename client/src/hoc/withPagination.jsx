// hoc/withPagination.js

import React, { useState, useEffect } from 'react';

export const withPagination = (WrappedComponent) => {
  return ({ service, endpoint, data }) => {
    const [items, setItems] = useState(data.items || []);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(data.pagination?.hasMore || false);
    const [page, setPage] = useState(1);

    useEffect(() => {
      if (data) {
        setItems(data.items || []);
        setHasMore(data.pagination?.hasMore || false);
      }
    }, [data]);

    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await service.getData(endpoint, { page, limit: 10 });
        if (response.data) {
          setItems((prevItems) => [...prevItems, ...response.data.items]);
          setHasMore(response.data.pagination.hasMore);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    const loadMore = () => {
      if (!loading && hasMore) {
        setPage((prevPage) => prevPage + 1);
        fetchData();
      }
    };

    return (
      <WrappedComponent
        items={items}
        loading={loading}
        hasMore={hasMore}
        loadMore={loadMore}
        service={service}
      />
    );
  };
};

// // hoc/withPagination.jsx
// import React, { useState, useEffect, useCallback } from 'react'

// export const withPagination = (WrappedComponent, entityType = 'items') => {
//   return (props) => {
//     const [data, setData] = useState([])
//     const [loading, setLoading] = useState(false)
//     const [page, setPage] = useState(1)
//     const [hasMore, setHasMore] = useState(true)
//     const [loadingMore, setLoadingMore] = useState(false)
//     const [totalItems, setTotalItems] = useState(0)

//     const fetchData = useCallback(
//       async (pageNum = 1, reset = false) => {
//         // Проверяем, не выполняется ли уже загрузка
//         if ((loading && !reset) || (loadingMore && !reset)) return

//         // Устанавливаем состояние загрузки
//         if (reset) {
//           setLoading(true)
//         } else {
//           setLoadingMore(true)
//         }

//         try {
//           const params = {
//             page: pageNum,
//             limit: 10,
//           }

//           // console.log(`Запрос данных: page=${pageNum}, limit=10`);
//           const response = await props.service.getData(
//             props.endpoint || entityType,
//             params
//           )

//           // Извлекаем данные
//           const fetchedData = response?.data?.items || response?.items || []
//           const pagination =
//             response?.data?.pagination || response?.pagination || {}

//           if (reset) {
//             setData(fetchedData)
//             setTotalItems(pagination.totalItems || 0)
//           } else {
//             // Проверяем, что добавляем новые данные
//             if (fetchedData.length > 0) {
//               setData((prevData) => [...prevData, ...fetchedData])
//             }
//           }

//           // Проверяем наличие следующей страницы
//           const hasNext = pagination.hasNext || fetchedData.length === 10
//           setHasMore(hasNext)
//           setPage(pageNum)

//           // console.log(`Страница ${pageNum} загружена. Есть еще данные: ${hasNext}`);
//         } catch (error) {
//           console.error(`Error fetching ${entityType}:`, error)
//           setHasMore(false)
//         } finally {
//           if (reset) {
//             setLoading(false)
//           } else {
//             setLoadingMore(false)
//           }
//         }
//       },
//       [props.service, props.endpoint]
//     )

//     const loadMore = useCallback(() => {
//       if (hasMore && !loadingMore) {
//         fetchData(page + 1)
//       }
//     }, [hasMore, loadingMore, page, fetchData])

//     const refreshData = useCallback(() => {
//       setPage(1)
//       setHasMore(true)
//       fetchData(1, true)
//     }, [fetchData])

//     // Используем useEffect для первоначальной загрузки данных
//     useEffect(() => {
//       fetchData(1, true)
//     }, [fetchData])

//     // Передаем обновленные пропсы в WrappedComponent
//     const enhancedProps = {
//       ...props,
//       [entityType]: data,
//       loading: loading || loadingMore,
//       hasMore: hasMore,
//       totalItems: totalItems,
//       loadMore: loadMore,
//       refreshData: refreshData,
//       currentPage: page,
//     }

//     // Возвращаем обернутый компонент напрямую
//     return (
//       <>
//         <WrappedComponent {...enhancedProps} />

//         {/* Кнопка пагинации */}
//         {hasMore && (
//           <div style={{ textAlign: 'center', margin: '20px 0' }}>
//             <button
//               onClick={loadMore}
//               disabled={loading || loadingMore}
//               style={{
//                 padding: '10px 20px',
//                 backgroundColor: '#007bff',
//                 color: 'white',
//                 border: 'none',
//                 borderRadius: '4px',
//                 cursor: loading || loadingMore ? 'not-allowed' : 'pointer',
//                 fontSize: '16px',
//                 opacity: loading || loadingMore ? 0.6 : 1,
//               }}
//             >
//               {loading || loadingMore ? 'Загрузка...' : 'Показать еще'}
//             </button>
//           </div>
//         )}
//       </>
//     )
//   }
// }
