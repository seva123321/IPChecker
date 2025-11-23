import { useState } from 'react'
import { ApiService } from '../../ApiService'

export const useItemData = (initialItem) => {
  const [currentItem, setCurrentItem] = useState(initialItem)
  const [isWhoisOpen, setIsWhoisOpen] = useState(false)
  const [whois, setWhois] = useState(null)
  const [whoisLoaded, setWhoisLoaded] = useState(false)

  const handlePriorityStatusUpdate = (updatedData) => {
    setCurrentItem((prev) => ({
      ...prev,
      priority_info: {
        ...prev.priority_info,
        priority: updatedData.priority,
        grouping: updatedData.grouping,
        comment: updatedData.comment,
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
    isWhoisOpen,
    whois,
    whoisLoaded,
    handlePriorityStatusUpdate,
    handleClickWhois,
    formatDate,
  }
}
