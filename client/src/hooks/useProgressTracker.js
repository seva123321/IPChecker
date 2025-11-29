// hooks/useProgressTracker.js
import { useState, useCallback } from 'react'

export const useProgressTracker = () => {
  const [progressState, setProgressState] = useState({
    connectionStatus: 'connecting',
    progress: {
      processedIPs: 0,
      totalIPs: 0,
      progress: 0,
      successful: 0,
      failed: 0,
    },
    files: [],
    currentOperation: 'Подключение к серверу...',
    events: [],
  })

  const updateProgressState = useCallback((updates) => {
    setProgressState((prev) => ({
      ...prev,
      ...updates,
    }))
  }, [])

  const addEvent = useCallback((message, type, data = null) => {
    const event = {
      id: Date.now(),
      message,
      type,
      data,
      timestamp: new Date().toLocaleTimeString(),
    }

    setProgressState((prev) => ({
      ...prev,
      events: [event, ...prev.events].slice(0, 20),
    }))
  }, [])

  const resetProgressState = useCallback(() => {
    setProgressState({
      connectionStatus: 'connecting',
      progress: {
        processedIPs: 0,
        totalIPs: 0,
        progress: 0,
        successful: 0,
        failed: 0,
      },
      files: [],
      currentOperation: 'Подключение к серверу...',
      events: [],
    })
  }, [])

  return {
    progressState,
    updateProgressState,
    addEvent,
    resetProgressState,
  }
}
