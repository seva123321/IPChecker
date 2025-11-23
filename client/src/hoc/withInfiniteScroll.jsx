import React, { useState, useEffect, useRef, useCallback } from 'react'

const withInfiniteScroll = (WrappedComponent) => {
  const WithInfiniteScroll = ({
    loadMoreData,
    hasMore,
    isLoading,
    ...props
  }) => {
    const [isFetching, setIsFetching] = useState(false)
    const timeoutRef = useRef(null)
    const scrollHandlerRef = useRef(null)

    // Мемоизированный обработчик скролла
    scrollHandlerRef.current = useCallback(() => {
      if (isLoading || isFetching || !hasMore) return

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const windowHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight

      // Проверяем, достигли ли мы 80% от всей высоты документа
      const scrollThreshold = 0.8 * documentHeight

      if (scrollTop + windowHeight >= scrollThreshold) {
        setIsFetching(true)

        // Очищаем предыдущий таймаут
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }

        // Добавляем небольшую задержку чтобы избежать множественных запросов
        timeoutRef.current = setTimeout(async () => {
          try {
            await loadMoreData()
          } catch (error) {
            console.error('Error in infinite scroll:', error)
          } finally {
            setIsFetching(false)
          }
        }, 100)
      }
    }, [isLoading, isFetching, hasMore, loadMoreData])

    useEffect(() => {
      const handleScroll = () => {
        scrollHandlerRef.current()
      }

      // Добавляем троттлинг для производительности
      let ticking = false
      const throttledScroll = () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            handleScroll()
            ticking = false
          })
          ticking = true
        }
      }

      window.addEventListener('scroll', throttledScroll, { passive: true })
      window.addEventListener('resize', throttledScroll, { passive: true })

      // Проверяем сразу при монтировании, может данные не заполняют экран
      handleScroll()

      return () => {
        window.removeEventListener('scroll', throttledScroll)
        window.removeEventListener('resize', throttledScroll)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
      }
    }, [])

    // Сбрасываем isFetching когда загрузка завершена
    useEffect(() => {
      if (!isLoading && isFetching) {
        setIsFetching(false)
      }
    }, [isLoading, isFetching])

    return <WrappedComponent {...props} isLoading={isLoading || isFetching} />
  }

  WithInfiniteScroll.displayName = `WithInfiniteScroll(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`

  return WithInfiniteScroll
}

export default withInfiniteScroll

// import React, { useState, useEffect } from 'react';

// const withInfiniteScroll = (WrappedComponent) => {
//   const WithInfiniteScroll = ({ loadMoreData, hasMore, ...props }) => {
//     const [isFetching, setIsFetching] = useState(false);

//     useEffect(() => {
//       if (!hasMore || isFetching) return;

//       const handleScroll = () => {
//         const scrollTop =
//           window.pageYOffset ||
//           document.documentElement.scrollTop ||
//           document.body.scrollTop;
//         const windowHeight = window.innerHeight;
//         const bodyHeight =
//           document.documentElement.scrollHeight || document.body.scrollHeight;

//         if (scrollTop + windowHeight >= 0.8 * bodyHeight && !isFetching) {
//           setIsFetching(true);
//         }
//       };

//       window.addEventListener('scroll', handleScroll);

//       return () => {
//         window.removeEventListener('scroll', handleScroll);
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

//     return <WrappedComponent {...props} />;
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
