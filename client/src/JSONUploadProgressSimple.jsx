import { useState, useEffect, useRef } from 'react'
import { Progress, Alert, Button, Card } from 'antd'
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import { ROUTES } from './routes'

export const JSONUploadProgress = ({
  clientId,
  onComplete,
  isMinimized = false,
  onToggleMinimize,
}) => {
  const [status, setStatus] = useState('connecting') // connecting, processing, completed, error
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('Подключение к серверу...')
  const eventSourceRef = useRef(null)

  useEffect(() => {
    if (!clientId) return

    const connectSSE = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
      const sseUrl = `${baseUrl}/files/progress?clientId=${clientId}`

      const eventSource = new EventSource(sseUrl)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setStatus('connected')
        setMessage('Ожидание начала обработки...')
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('SSE Event:', data)

          switch (data.type) {
            case 'connected':
              setStatus('connected')
              setMessage('Готов к обработке файлов')
              break

            case 'processing_started':
              setStatus('processing')
              setMessage(data.message || 'Начало обработки файлов')
              setProgress(0)
              break

            case 'file_start':
              setStatus('processing')
              setMessage(`Начата обработка файла: ${data.fileName || ''}`)
              break

            case 'file_complete':
              setMessage(`Файл обработан: ${data.fileName || ''}`)
              // Увеличиваем прогресс при завершении файла
              setProgress((prev) => Math.min(prev + 20, 95))
              break

            case 'file_progress':
              // Обновляем прогресс из данных сервера
              if (data.processed && data.total) {
                const newProgress = Math.round(
                  (data.processed / data.total) * 100
                )
                setProgress(newProgress)
              }
              if (data.message) setMessage(data.message)
              break

            case 'processing_complete':
            case 'all_complete':
              setStatus('completed')
              setProgress(100)
              setMessage('Все файлы успешно обработаны')
              onComplete?.()
              break

            case 'file_error':
              setStatus('error')
              setMessage(`Ошибка файла: ${data.error || 'Неизвестная ошибка'}`)
              break

            case 'processing_error':
              setStatus('error')
              setMessage(
                `Ошибка обработки: ${data.error || 'Неизвестная ошибка'}`
              )
              break
          }
        } catch (error) {
          console.error('Ошибка обработки события:', error)
        }
      }

      eventSource.onerror = () => {
        setStatus('error')
        setMessage('Ошибка соединения с сервером')
      }
    }

    connectSSE()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [clientId])

  const getStatusIcon = () => {
    switch (status) {
      case 'processing':
        return <LoadingOutlined style={{ color: '#1890ff' }} />
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'error':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
      default:
        return <LoadingOutlined />
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'connecting':
        return 'Подключение...'
      case 'processing':
        return 'В процессе'
      case 'completed':
        return 'Завершено'
      case 'error':
        return 'Ошибка'
      default:
        return 'Подключение...'
    }
  }

  // Компактный вид
  if (isMinimized) {
    return (
      <Card
        size="small"
        style={{ width: 300 }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {getStatusIcon()}
            <span>{getStatusText()}</span>
          </div>
        }
        extra={
          onToggleMinimize && (
            <Button
              size="small"
              type="text"
              onClick={(e) => {
                e.stopPropagation()
                onToggleMinimize()
              }}
            >
              Развернуть
            </Button>
          )
        }
      >
        <Progress
          percent={progress}
          status={status === 'error' ? 'exception' : 'active'}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          {message}
        </div>
      </Card>
    )
  }

  // Полный вид
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: 16, fontSize: 24 }}>
        {getStatusIcon()}
        <div style={{ marginTop: 8, fontWeight: 'bold' }}>
          {getStatusText()}
        </div>
      </div>

      <Progress
        percent={progress}
        status={
          status === 'processing'
            ? 'active'
            : status === 'completed'
              ? 'success'
              : status === 'error'
                ? 'exception'
                : 'normal'
        }
        strokeWidth={10}
        style={{ marginBottom: 24 }}
      />

      <div style={{ marginBottom: 24, color: '#666' }}>{message}</div>

      {status === 'completed' && (
        <Alert
          message="Импорт завершен успешно!"
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {status === 'error' && (
        <Alert
          message="Ошибка импорта"
          description="Попробуйте загрузить файлы снова или проверьте их формат."
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {onToggleMinimize && (
        <Button
          type="default"
          onClick={onToggleMinimize}
          style={{ marginTop: 16 }}
        >
          Свернуть
        </Button>
      )}
    </div>
  )
}