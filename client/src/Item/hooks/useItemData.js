import { useState } from 'react'
import { ApiService } from '../../ApiService'

export const useItemData = (initialItem) => {
  const [currentItem, setCurrentItem] = useState(initialItem)
  const [isWhoisOpen, setIsWhoisOpen] = useState(false)
  const [whois, setWhois] = useState(null)
  const [whoisLoaded, setWhoisLoaded] = useState(false)

  const handlePriorityStatusUpdate = (newData) => {
    setCurrentItem((prev) => ({
      ...prev,
      ...newData,
      priority_info: {
        ...prev.priority_info,
        priority: newData.priority,
        grouping: newData.grouping,
        comment: newData.comment,
      },
      port_data: {
        ...prev.port_data,
        open: [...prev.port_data.open],
        filtered: [...prev.port_data.filtered],
      },
    }))
  }

  const handleClickWhois = async (hostId) => {
    if (whoisLoaded) {
      setIsWhoisOpen(!isWhoisOpen)
      return
    }

    if (hostId && !whoisLoaded) {
      try {
        const response = await ApiService.getData('keywords/search', {
          id: hostId,
        })
        setWhois(response.whois)
        setWhoisLoaded(true)
        setIsWhoisOpen(true)
      } catch (error) {
        setWhois({ error: 'Ошибка получения whois' })
        setWhoisLoaded(true)
        setIsWhoisOpen(true)
      }
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return {
    currentItem,
    setCurrentItem,
    isWhoisOpen,
    whois,
    whoisLoaded,
    handlePriorityStatusUpdate,
    handleClickWhois,
    formatDate,
  }
}

/*Правильно обновляет название портов*/
// import { useState, useCallback } from 'react'
// import { ApiService } from '../../ApiService'

// export const useItemData = (initialItem) => {
//   const [currentItem, setCurrentItem] = useState(initialItem)
//   const [isWhoisOpen, setIsWhoisOpen] = useState(false)
//   const [whois, setWhois] = useState(null)
//   const [whoisLoaded, setWhoisLoaded] = useState(false)

//   // Функция для полного обновления данных
//   const updateItemData = useCallback((newData) => {
//     setCurrentItem(prev => {
//       // Глубокое слияние данных
//       return {
//         ...prev,
//         ...newData,
//         port_data: {
//           ...prev.port_data,
//           ...(newData.port_data || {})
//         },
//         priority_info: {
//           ...prev.priority_info,
//           ...(newData.priority_info || {})
//         }
//       }
//     })
//   }, [])

//   const handlePriorityStatusUpdate = (updatedData) => {
//     updateItemData({
//       priority_info: updatedData
//     })
//   }

//   const handleClickWhois = async (hostId) => {
//     if (whoisLoaded) {
//       setIsWhoisOpen(!isWhoisOpen)
//       return
//     }

//     if (hostId && !whoisLoaded) {
//       try {
//         const response = await ApiService.getData('keywords/search', {
//           id: hostId,
//         })
//         setWhois(response.whois)
//         setWhoisLoaded(true)
//         setIsWhoisOpen(true)

//         // Обновляем whois в текущем элементе
//         updateItemData({
//           has_whois: true,
//           whois: response.whois
//         })
//       } catch (error) {
//         setWhois({ error: 'Ошибка получения whois' })
//         setWhoisLoaded(true)
//         setIsWhoisOpen(true)
//       }
//     }
//   }

//   const formatDate = (dateString) => {
//     return new Date(dateString).toLocaleString('ru-RU', {
//       day: '2-digit',
//       month: '2-digit',
//       year: 'numeric',
//       hour: '2-digit',
//       minute: '2-digit',
//     })
//   }

//   return {
//     currentItem,
//     setCurrentItem: updateItemData, // Экспортируем функцию обновления
//     isWhoisOpen,
//     whois,
//     whoisLoaded,
//     handlePriorityStatusUpdate,
//     handleClickWhois,
//     formatDate,
//   }
// }
