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
    const isFetchingRef = useRef(false)

    // Мемоизированный обработчик скролла
    const handleScroll = useCallback(() => {
      if (isLoading || isFetchingRef.current || !hasMore) return

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const windowHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight

      // Проверяем, достигли ли мы конца страницы с небольшим отступом
      const offset = 100
      if (scrollTop + windowHeight >= documentHeight - offset) {
        isFetchingRef.current = true
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
            isFetchingRef.current = false
          }
        }, 300)
      }
    }, [isLoading, hasMore, loadMoreData])

    useEffect(() => {
      // Троттлинг для производительности
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
    }, [handleScroll])

    // Сбрасываем isFetching когда загрузка завершена
    useEffect(() => {
      if (!isLoading && isFetching) {
        setIsFetching(false)
        isFetchingRef.current = false
      }
    }, [isLoading, isFetching])

    return (
      <WrappedComponent 
        {...props} 
        isLoading={isLoading || isFetching} 
        hasMore={hasMore}
      />
    )
  }

  WithInfiniteScroll.displayName = `WithInfiniteScroll(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`

  return WithInfiniteScroll
}

export default withInfiniteScroll
