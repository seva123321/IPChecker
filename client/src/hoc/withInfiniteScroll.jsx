import React, { useState, useEffect } from 'react';

const withInfiniteScroll = (WrappedComponent) => {
  const WithInfiniteScroll = ({ loadMoreData, hasMore, ...props }) => {
    const [isFetching, setIsFetching] = useState(false);

    useEffect(() => {
      if (!hasMore || isFetching) return;

      const handleScroll = () => {
        const scrollTop =
          window.pageYOffset ||
          document.documentElement.scrollTop ||
          document.body.scrollTop;
        const windowHeight = window.innerHeight;
        const bodyHeight =
          document.documentElement.scrollHeight || document.body.scrollHeight;

        if (scrollTop + windowHeight >= 0.8 * bodyHeight && !isFetching) {
          setIsFetching(true);
        }
      };

      window.addEventListener('scroll', handleScroll);

      return () => {
        window.removeEventListener('scroll', handleScroll);
      };
    }, [isFetching, hasMore]);

    useEffect(() => {
      if (!isFetching) return;

      const fetchData = async () => {
        await loadMoreData();
        setIsFetching(false);
      };

      fetchData();
    }, [isFetching, loadMoreData]);

    return <WrappedComponent {...props} />;
  };

  WithInfiniteScroll.displayName = `WithInfiniteScroll(${getDisplayName(
    WrappedComponent
  )})`;

  function getDisplayName(WrappedComponent) {
    return WrappedComponent.displayName || WrappedComponent.name || 'Component';
  }

  return WithInfiniteScroll;
};

export default withInfiniteScroll;



/****************************************************** */

// import React, { useState, useEffect } from 'react';

// const withInfiniteScroll = (WrappedComponent) => {
//   const WithInfiniteScroll = ({ loadMoreData, hasMore, ...props }) => {
//     const [isFetching, setIsFetching] = useState(false);
//     const observerRef = React.createRef();

//     useEffect(() => {
//       if (!hasMore || isFetching) return;

//       const observer = new IntersectionObserver(
//         ([entry]) => {
//           if (entry.isIntersecting && !isFetching) {
//             setIsFetching(true);
//           }
//         },
//         { threshold: 0.1 }
//       );

//       if (observerRef.current) {
//         observer.observe(observerRef.current);
//       }

//       return () => {
//         if (observerRef.current) {
//           observer.unobserve(observerRef.current);
//         }
//       };
//     }, [isFetching, hasMore]);

//     useEffect(() => {
//       if (!isFetching) return;

//       const fetchData = async () => {
//         await loadMoreData();
//         setIsFetching(false);
//       };

//       fetchData();
//     }, [isFetching, loadMoreData]);

//     return (
//       <>
//         <WrappedComponent {...props} />
//         {hasMore && (
//           <div ref={observerRef} style={{ height: '1px' }}></div>
//         )}
//       </>
//     );
//   };

//   WithInfiniteScroll.displayName = `WithInfiniteScroll(${getDisplayName(
//     WrappedComponent
//   )})`;

//   function getDisplayName(WrappedComponent) {
//     return WrappedComponent.displayName || WrappedComponent.name || 'Component';
//   }

//   return WithInfiniteScroll;
// };

// export default withInfiniteScroll;

/****************************************************** */
// // hoc/withInfiniteScroll.jsx
// import React, { useState, useEffect, useCallback, useRef } from 'react'

// export const withInfiniteScroll = (WrappedComponent, entityType = 'items') => {
//   return (props) => {
//     const [data, setData] = useState([])
//     const [loading, setLoading] = useState(false)
//     const [page, setPage] = useState(1)
//     const [hasMore, setHasMore] = useState(true)
//     const [loadingMore, setLoadingMore] = useState(false)
//     const [totalItems, setTotalItems] = useState(0)
//     const loaderRef = useRef(null)
//     const observerRef = useRef(null)

//     const fetchData = useCallback(async (pageNum = 1, reset = false) => {
//       // Проверяем, не выполняется ли уже загрузка
//       if ((loading && !reset) || (loadingMore && !reset)) return

//       // Устанавливаем состояние загрузки
//       if (reset) {
//         setLoading(true)
//       } else {
//         setLoadingMore(true)
//       }

//       try {
//         const params = {
//           page: pageNum,
//           limit: 10
//         }

//         // console.log(`Запрос данных: page=${pageNum}, limit=10`);
//         const response = await props.service.getData(props.endpoint || entityType, params)

//         // Извлекаем данные
//         const fetchedData = response?.data?.items || response?.items || []
//         const pagination = response?.data?.pagination || response?.pagination || {}

//         if (reset) {
//           setData(fetchedData)
//           setTotalItems(pagination.totalItems || 0)
//         } else {
//           // Проверяем, что добавляем новые данные
//           if (fetchedData.length > 0) {
//             setData(prevData => [...prevData, ...fetchedData])
//           }
//         }

//         // Проверяем наличие следующей страницы
//         const hasNext = pagination.hasNext || fetchedData.length === 10
//         setHasMore(hasNext)
//         setPage(pageNum)

//         // console.log(`Страница ${pageNum} загружена. Есть еще данные: ${hasNext}`);

//       } catch (error) {
//         console.error(`Error fetching ${entityType}:`, error)
//         setHasMore(false)
//       } finally {
//         if (reset) {
//           setLoading(false)
//         } else {
//           setLoadingMore(false)
//         }
//       }
//     }, [props.service, props.endpoint])

//     const refreshData = useCallback(() => {
//       setPage(1)
//       setHasMore(true)
//       fetchData(1, true)
//     }, [fetchData])

//     // Intersection Observer для бесконечной прокрутки
//     useEffect(() => {
//       // Очищаем предыдущий observer
//       if (observerRef.current) {
//         observerRef.current.disconnect();
//       }

//       const observer = new IntersectionObserver(
//         (entries) => {
//           if (entries[0].isIntersecting && hasMore && !loadingMore) {
//             // console.log('Intersection observer сработал, загружаем следующую страницу');
//             fetchData(page + 1)
//           }
//         },
//         {
//           root: null, // viewport
//           rootMargin: '200px', // начать загрузку за 200px до конца
//           threshold: 0.1
//         }
//       )

//       if (loaderRef.current) {
//         observer.observe(loaderRef.current)
//         observerRef.current = observer;
//       }

//       return () => {
//         if (observerRef.current) {
//           observerRef.current.disconnect();
//         }
//       }
//     }, [hasMore, loadingMore, page, fetchData])

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
//       refreshData: refreshData,
//       currentPage: page
//     }

//     // Возвращаем обернутый компонент с loader для бесконечной прокрутки
//     return (
//       <>
//         <WrappedComponent {...enhancedProps} />

//         {/* Loader для бесконечной прокрутки */}
//         <div ref={loaderRef} style={{ height: '50px', margin: '20px 0' }}>
//           {loadingMore && (
//             <div style={{ textAlign: 'center', padding: '20px' }}>
//               Загрузка...
//             </div>
//           )}
//         </div>

//         {/* Сообщение о завершении */}
//         {!hasMore && data.length > 0 && (
//           <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
//             Больше данных нет
//           </div>
//         )}
//       </>
//     )
//   }
// }
