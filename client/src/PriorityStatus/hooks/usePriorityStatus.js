import { useState, useEffect } from 'react'
import { message } from 'antd'
import { ApiService } from '../../ApiService'
import { sanitizeText } from '../utils/sanitize'
import { getPriorityDisplayName } from '../../utils/function'

export const usePriorityStatus = ({ priority, grouping, hostId, onUpdate }) => {
  const [state, setState] = useState({
    isModalOpen: false,
    currentStep: 'select',
    newPriority: priority?.id ? priority.id.toString() : '',
    groupingOptions: [],
    newGrouping: grouping || { id: '', name: '' },
    comment: '',
    existingComment: {},
    loading: false,
    optionsLoaded: false, // Добавляем флаг загрузки опций
  })

  const updateState = (updates) => setState((prev) => ({ ...prev, ...updates }))

  const handleFetchGroupingOptions = async () => {
    try {
      const response = await ApiService.getData('data', { q: 'group' })
      const options = response.data.map((option) => ({
        label: option.name,
        value: option.id.toString(),
        ...option,
      }))
      updateState({
        groupingOptions: options,
        optionsLoaded: true,
      })
    } catch (error) {
      console.error('Ошибка получения группировки:', error)
      message.error('Не удалось загрузить опции группировки')
    }
  }

  const handleModalOpen = async () => {
    updateState({ isModalOpen: true })

    // Загружаем опции при открытии модального окна
    if (!state.optionsLoaded) {
      await handleFetchGroupingOptions()
    }

    if (hostId) {
      try {
        const commentData = await ApiService.getData('data/comment', {
          id: hostId,
        })
        if (commentData?.comment) {
          const existingComment = {
            comment: commentData.comment,
            createdAt: new Date(commentData.created_at),
          }
          updateState({
            existingComment,
            comment: commentData.comment,
          })
        }
      } catch (error) {
        // console.error('Ошибка получения комментария:', error)
        // message.error('Не удалось загрузить существующий комментарий')
        updateState({ existingComment: {}, comment: '' })
      }
    }
  }

  const handleNextStep = () => updateState({ currentStep: 'confirm' })

  const handleCancel = () => {
    updateState({
      isModalOpen: false,
      currentStep: 'select',
      comment: state.existingComment.comment || '',
      newPriority: priority?.id ? priority.id.toString() : '',
      newGrouping: grouping || { id: '', name: '' },
    })
  }

  const handleSubmit = async () => {
    try {
      updateState({ loading: true })

      const sanitizedComment = state.comment.trim()
        ? sanitizeText(state.comment.trim())
        : ''

      const response = await ApiService.patchData('data/comment', {
        id: hostId,
        priority_id: state.newPriority,
        grouping_id: state.newGrouping.id.toString(),
        comment: sanitizedComment,
      })

      if (response.message === 'Данные успешно обновлены') {
        const updatedPriority = {
          id: parseInt(response.priority_id),
          name: getPriorityDisplayName(response.priority_id),
        }

        const updatedGroupingOption = state.groupingOptions.find(
          (option) => option.value === response.grouping_id
        )
        const updatedGrouping = {
          id: parseInt(response.grouping_id),
          name: updatedGroupingOption?.label || state.newGrouping.name,
        }

        updateState({
          newPriority: response.priority_id,
          newGrouping: updatedGrouping,
          loading: false,
          isModalOpen: false,
          currentStep: 'select',
        })

        onUpdate?.({
          priority: updatedPriority,
          grouping: updatedGrouping,
          comment: response.comment,
        })

        message.success('Данные успешно обновлены')
      }
    } catch (error) {
      console.error('Ошибка обновления данных:', error)
      message.error(
        'Ошибка при обновлении данных: ' +
          (error.message || 'Неизвестная ошибка')
      )
      updateState({ loading: false })
    }
  }

  // Синхронизация состояния при открытии модального окна
  useEffect(() => {
    if (state.isModalOpen) {
      updateState({
        newPriority: priority?.id ? priority.id.toString() : '',
        newGrouping: grouping || { id: '', name: '' },
        comment: state.existingComment.comment || '',
      })
    }
  }, [state.isModalOpen, grouping, priority, state.existingComment])

  return {
    state,
    updateState,
    handleFetchGroupingOptions,
    handleModalOpen,
    handleNextStep,
    handleCancel,
    handleSubmit,
  }
}
