// hoc/withInternetCheck.jsx
import React, { useState } from 'react'
import { message } from 'antd'

// HOC для проверки интернета
export const withInternetCheck = (WrappedComponent) => {
  return (props) => {
    const [checking, setChecking] = useState(false)
    const [isOnline, setIsOnline] = useState(true)

    // Проверка подключения к интернету
    const checkInternetConnection = async () => {
      setChecking(true)
      try {
        // Пытаемся сделать запрос к внешнему ресурсу
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // Таймаут 5 секунд

        const response = await fetch('https://www.google.com', {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal,
        })

        clearTimeout(timeoutId)
        const online =
          response.type === 'opaque' || response.ok || response.status === 0
        setIsOnline(online)
        setChecking(false)
        return online
      } catch (error) {
        clearTimeout(timeoutId)
        setIsOnline(false)
        setChecking(false)
        return false
      }
    }

    // Обёртка для обработчика загрузки
    const handleUploadWithCheck = async (files) => {
      // Проверяем подключение перед загрузкой
      const isConnected = await checkInternetConnection()

      if (!isConnected) {
        message.error(
          'Нет подключения к интернету. Загрузка файлов невозможна.'
        )
        return
      }

      // Если подключение есть, вызываем оригинальный обработчик
      return props.onUpload(files)
    }

    // Передаем обновленный обработчик вWrappedComponent
    const enhancedProps = {
      ...props,
      onUpload: handleUploadWithCheck,
      checkingInternet: checking,
      isOnline: isOnline,
    }

    return <WrappedComponent {...enhancedProps} />
  }
}
