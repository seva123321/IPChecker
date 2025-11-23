// РАБОЧИЙ но СЛОЖНО СОСТАВНОЙ
import { useState, useEffect, useRef } from 'react'
import classNames from 'classnames'
import cn from './PriorityStatus.module.scss'
import { Modal, Select, Input, Button, message, Tooltip } from 'antd'
import { ApiService } from '../ApiService'
import { getPriorityDisplayName } from '../utils/function'

// Функция для санитизации текста - удаляет потенциально опасные теги и скрипты
const sanitizeText = (text) => {
  if (!text) return text

  return text
    .replace(/</g, '&lt;') // Экранируем угловые скобки
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

// Функция для безопасного отображения текста (для шага подтверждения)
const SafeText = ({ text }) => {
  if (!text) return null

  return (
    <span
      dangerouslySetInnerHTML={{
        __html: sanitizeText(text).replace(/\n/g, '<br />'),
      }}
    />
  )
}

const PriorityStatus = ({ priority, grouping, hostId, onUpdate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState('select')
  const [newPriority, setNewPriority] = useState(
    priority?.id ? priority.id.toString() : ''
  )
  const [groupingOptions, setGroupingOptions] = useState([])
  const [newGrouping, setNewGrouping] = useState(
    grouping || { id: '', name: '' }
  )
  const [comment, setComment] = useState('')
  const [existingComment, setExistingComment] = useState({})
  const [loading, setLoading] = useState(false)
  const selectRef = useRef(null)

  const handleFetchGroupingOptions = async () => {
    try {
      const response = await ApiService.getData('data', { q: 'group' })
      const options = response.data.map((option) => ({
        label: option.name,
        value: option.id.toString(),
        ...option,
      }))
      setGroupingOptions(options)
    } catch (error) {
      console.error('Ошибка получения группировки:', error)
      message.error('Не удалось загрузить опции группировки')
    }
  }

  // Получаем существующий комментарий при открытии модального окна
  const handleModalOpen = async () => {
    setIsModalOpen(true)
    if (hostId) {
      try {
        const commentData = await ApiService.getData('data/comment', {
          id: hostId,
        })
        if (commentData && commentData.comment) {
          setExistingComment({
            comment: commentData.comment,
            createdAt: new Date(commentData.created_at),
          })
          // Комментарий с сервера считается безопасным
          setComment(commentData.comment)
        }
      } catch (error) {
        console.error('Ошибка получения комментария:', error)
        message.error('Не удалось загрузить существующий комментарий')
        setExistingComment({})
        setComment('')
      }
    }
  }

  const handleNextStep = () => {
    setCurrentStep('confirm')
  }

  const handleCancel = () => {
    setIsModalOpen(false)
    setCurrentStep('select')
    setComment(existingComment.comment || '')
    setNewPriority(priority?.id ? priority.id.toString() : '')
    setNewGrouping(grouping || { id: '', name: '' })
  }

  // Обработчик изменения комментария с базовой валидацией
  const handleCommentChange = (e) => {
    const value = e.target.value
    // Можно добавить дополнительные проверки здесь при необходимости
    setComment(value)
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)

      // Санитизируем комментарий перед отправкой
      const sanitizedComment = comment.trim()
        ? sanitizeText(comment.trim())
        : ''

      const response = await ApiService.patchData('data/comment', {
        id: hostId,
        priority_id: newPriority,
        grouping_id: newGrouping.id.toString(),
        comment: sanitizedComment,
      })

      console.log('response', response)

      if (response.message === 'Данные успешно обновлены') {
        // Создаем обновленные объекты priority и grouping
        const updatedPriority = {
          id: parseInt(response.priority_id),
          name: getPriorityDisplayName(response.priority_id),
        }

        // Находим название группировки из options или используем текущее
        const updatedGroupingOption = groupingOptions.find(
          (option) => option.value === response.grouping_id
        )
        const updatedGrouping = {
          id: parseInt(response.grouping_id),
          name: updatedGroupingOption
            ? updatedGroupingOption.label
            : newGrouping.name,
        }

        // Обновляем локальное состояние
        setNewPriority(response.priority_id)
        setNewGrouping(updatedGrouping)

        // Вызываем callback для обновления родительского компонента
        if (onUpdate) {
          onUpdate({
            priority: updatedPriority,
            grouping: updatedGrouping,
            comment: response.comment, // Комментарий с сервера считается безопасным
          })
        }

        message.success('Данные успешно обновлены')
        setIsModalOpen(false)
        setCurrentStep('select')
      }
    } catch (error) {
      console.error('Ошибка обновления данных:', error)
      message.error(
        'Ошибка при обновлении данных: ' +
          (error.message || 'Неизвестная ошибка')
      )
    } finally {
      setLoading(false)
    }
  }

  // Синхронизация состояния при открытии модального окна
  useEffect(() => {
    if (isModalOpen) {
      setNewPriority(priority?.id ? priority.id.toString() : '')
      setNewGrouping(grouping || { id: '', name: '' })
      setComment(existingComment.comment || '')
    }
  }, [isModalOpen, grouping, priority, existingComment])

  // Получаем текущее отображаемое значение для группировки
  const getGroupingDisplayValue = () => {
    if (!newGrouping.id && !newGrouping.name) return undefined

    if (newGrouping.name) return newGrouping.name

    const foundOption = groupingOptions.find(
      (option) => option.value === newGrouping.id.toString()
    )
    return foundOption ? foundOption.label : newGrouping.id.toString()
  }

  // Получаем значение для Select с правильным отображением
  const getGroupingSelectValue = () => {
    if (!newGrouping.id) return undefined

    // Находим опцию по ID чтобы получить название
    const currentOption = groupingOptions.find(
      (option) => option.value === newGrouping.id.toString()
    )

    // Если нашли опцию, возвращаем объект с value и label
    if (currentOption) {
      return {
        value: currentOption.value,
        label: currentOption.label,
      }
    }

    // Если не нашли, возвращаем просто значение
    return newGrouping.id.toString()
  }

  return (
    <>
      <div className={cn.statusWrapper} onClick={handleModalOpen}>
        {grouping?.name && (
          <Tooltip title="Сменить принадлежность">
            <span className={cn.statusReachable}>{grouping.name}</span>
          </Tooltip>
        )}
        {priority?.id && (
          <Tooltip title="Сменить статус">
            <span
              className={classNames(cn.statusPriority, {
                [cn.usual]: priority.id === 1,
                [cn.interesting]: priority.id === 2,
                [cn.important]: priority.id === 3,
              })}
            >
              {getPriorityDisplayName(priority.id?.toString())}
            </span>
          </Tooltip>
        )}
      </div>
      <Modal
        open={isModalOpen}
        onCancel={handleCancel}
        footer={null}
        width={500}
        confirmLoading={loading}
        style={{
          top: 20,
        }}
      >
        {currentStep === 'select' && (
          <>
            <h2>Обновление статуса</h2>
            <div className={cn.selectWrapper}>
              <Select
                value={newPriority}
                onChange={(value) => setNewPriority(value)}
                placeholder="Выберите приоритет"
                className={cn.fixedWidthSelectPriority}
                getPopupContainer={(trigger) => trigger.parentNode}
              >
                <Select.Option value="1">Обычный</Select.Option>
                <Select.Option value="2">Интересный</Select.Option>
                <Select.Option value="3">Важный</Select.Option>
              </Select>

              {/* Select для группировки */}
              <Select
                value={getGroupingSelectValue()}
                onChange={(value, option) => {
                  // Обрабатываем как объект, так и строку
                  const selectedValue =
                    typeof value === 'object' ? value.value : value
                  const selectedOption = groupingOptions.find(
                    (opt) => opt.value === selectedValue
                  )
                  setNewGrouping(
                    selectedOption || { id: selectedValue, name: selectedValue }
                  )
                }}
                onFocus={handleFetchGroupingOptions}
                placeholder="Выберите группу"
                className={cn.fixedWidthSelectGrouping}
                getPopupContainer={(trigger) => trigger.parentNode}
                dropdownStyle={{
                  minWidth: '300px',
                  maxHeight: '400px',
                  overflow: 'auto',
                }}
                labelInValue={true}
                ref={selectRef}
              >
                {groupingOptions.map((option) => (
                  <Select.Option key={option.value} value={option.value}>
                    <div
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {option.label}
                    </div>
                  </Select.Option>
                ))}
              </Select>
            </div>

            <Input.TextArea
              placeholder="Комментарий"
              value={comment}
              rows="5"
              onChange={handleCommentChange}
              style={{ marginTop: '10px' }}
              maxLength={1000} // Ограничение длины для безопасности
            />
            {existingComment.createdAt && (
              <span
                style={{
                  textAlign: 'right',
                  display: 'block',
                  marginTop: '10px',
                }}
              >
                <b>Последнее обновление:</b>&nbsp;
                {existingComment.createdAt.toLocaleString()}
              </span>
            )}
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <Button
                onClick={handleCancel}
                style={{ marginRight: '10px' }}
                disabled={loading}
              >
                Закрыть
              </Button>
              <Button
                type="primary"
                onClick={handleNextStep}
                disabled={loading}
              >
                Далее
              </Button>
            </div>
          </>
        )}
        {currentStep === 'confirm' && (
          <>
            <h2>Подтверждение обновления статуса</h2>
            <p>Вы уверены, что хотите обновить статус?</p>
            <p>
              <strong>Приоритет:</strong>{' '}
              {newPriority === '1'
                ? 'Обычный'
                : newPriority === '2'
                  ? 'Интересный'
                  : newPriority === '3'
                    ? 'Важный'
                    : 'Не выбран'}
            </p>
            <p>
              <strong>Группировка:</strong>{' '}
              {getGroupingDisplayValue() || 'Не выбрано'}
            </p>
            {comment && (
              <p>
                <strong>Комментарий:</strong> <SafeText text={comment} />
              </p>
            )}
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <Button
                onClick={() => setCurrentStep('select')}
                style={{ marginRight: '10px' }}
                disabled={loading}
              >
                Назад
              </Button>
              <Button
                onClick={handleCancel}
                style={{ marginRight: '10px' }}
                disabled={loading}
              >
                Отмена
              </Button>
              <Button type="primary" onClick={handleSubmit} loading={loading}>
                Подтвердить
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

export default PriorityStatus
