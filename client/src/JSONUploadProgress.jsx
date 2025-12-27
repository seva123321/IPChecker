import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Card,
  Progress,
  Statistic,
  Row,
  Col,
  Tag,
  Alert,
  Button,
  Typography,
} from 'antd'
import {
  FileTextOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  MinusOutlined,
  ArrowsAltOutlined,
  PlusOutlined,
  EditOutlined,
  SyncOutlined,
  WarningOutlined,
  DatabaseOutlined,
} from '@ant-design/icons'
import { ROUTES } from './routes'

const { Title } = Typography

const CONNECTION_STATUS = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error',
}

const EVENT_TYPES = {
  CONNECTED: 'connected',
  PROCESSING_STARTED: 'processing_started',
  PROCESSING_START: 'processing_start',
  BATCH_COMPLETE: 'batch_complete',
  FILE_START: 'file_start',
  FILE_COMPLETE: 'file_complete',
  FILE_PROGRESS: 'file_progress',
  FILE_ERROR: 'file_error',
  PROCESSING_COMPLETE: 'processing_complete',
  ALL_COMPLETE: 'all_complete',
  PROCESSING_ERROR: 'processing_error',
}

const INITIAL_PROGRESS = {
  totalFiles: 0,
  processedFiles: 0,
  completedFiles: 0,
  filesError: 0,
  totalHosts: 0,
  processedHosts: 0,
  hostsCreated: 0,
  hostsUpdated: 0,
  hostsSkipped: 0,
  hostsErrors: 0,
  progress: 0,
}

const STATUS_CONFIG = {
  [CONNECTION_STATUS.CONNECTED]: {
    color: 'blue',
    icon: <CheckCircleOutlined style={{ color: '#1890ff' }} />,
    text: 'Подключено',
    progressStatus: 'normal',
    strokeColor: '#1890ff',
  },
  [CONNECTION_STATUS.PROCESSING]: {
    color: 'orange',
    icon: <LoadingOutlined style={{ color: '#fa8c16' }} />,
    text: 'В процессе',
    progressStatus: 'active',
    strokeColor: '#1890ff',
  },
  [CONNECTION_STATUS.COMPLETED]: {
    color: 'green',
    icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
    text: 'Завершено',
    progressStatus: 'success',
    strokeColor: '#52c41a',
  },
  [CONNECTION_STATUS.ERROR]: {
    color: 'red',
    icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
    text: 'Ошибка',
    progressStatus: 'exception',
    strokeColor: '#ff4d4f',
  },
  [CONNECTION_STATUS.CONNECTING]: {
    color: 'gray',
    icon: <LoadingOutlined />,
    text: 'Подключение...',
    progressStatus: 'normal',
    strokeColor: '#1890ff',
  },
}

// Глобальное хранилище для данных прогресса (не соединений)
const globalProgressStorage = {
  data: new Map(),

  get(sessionId) {
    return this.data.get(sessionId)
  },

  set(sessionId, progressData) {
    this.data.set(sessionId, {
      ...progressData,
      timestamp: Date.now(),
    })
  },

  delete(sessionId) {
    this.data.delete(sessionId)
  },

  cleanupOldData(maxAge = 5 * 60 * 1000) {
    // 5 минут
    const now = Date.now()
    for (const [key, data] of this.data.entries()) {
      if (now - data.timestamp > maxAge) {
        this.data.delete(key)
      }
    }
  },
}

// Глобальное хранилище для соединений
const globalSSEConnections = new Map()

export const JSONUploadProgress = ({
  clientId,
  sessionId,
  onComplete,
  onClose,
  isMinimized = false,
  onToggleMinimize,
  decodeFileName = (fileName) => fileName,
  showExportButtons = true,
  isModal = false,
}) => {
  const [connectionStatus, setConnectionStatus] = useState(() => {
    // Пытаемся восстановить статус из хранилища
    if (sessionId && globalProgressStorage.get(sessionId)) {
      return (
        globalProgressStorage.get(sessionId).connectionStatus ||
        CONNECTION_STATUS.CONNECTING
      )
    }
    return CONNECTION_STATUS.CONNECTING
  })

  const [progress, setProgress] = useState(() => {
    // Пытаемся восстановить прогресс из хранилища
    if (sessionId && globalProgressStorage.get(sessionId)) {
      return {
        ...INITIAL_PROGRESS,
        ...globalProgressStorage.get(sessionId).progress,
      }
    }
    return INITIAL_PROGRESS
  })

  const [currentOperation, setCurrentOperation] = useState(() => {
    // Пытаемся восстановить операцию из хранилища
    if (sessionId && globalProgressStorage.get(sessionId)) {
      return (
        globalProgressStorage.get(sessionId).currentOperation ||
        'Подключение к серверу...'
      )
    }
    return 'Подключение к серверу...'
  })

  const isMountedRef = useRef(false)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)

  // Реф для сохранения данных между рендерами
  const latestProgressRef = useRef(progress)
  const latestConnectionStatusRef = useRef(connectionStatus)
  const latestOperationRef = useRef(currentOperation)

  // Обновляем рефы при изменении состояния
  useEffect(() => {
    latestProgressRef.current = progress
    latestConnectionStatusRef.current = connectionStatus
    latestOperationRef.current = currentOperation
  }, [progress, connectionStatus, currentOperation])

  // Мемоизированная конфигурация статуса
  const statusConfig = useMemo(
    () =>
      STATUS_CONFIG[connectionStatus] ||
      STATUS_CONFIG[CONNECTION_STATUS.CONNECTING],
    [connectionStatus]
  )

  // Оптимизированная функция обновления прогресса (исправленная версия из оригинального кода)
  const updateProgress = useCallback(
    (updater) => {
      if (!isMountedRef.current) return

      setProgress((prev) => {
        const updates = typeof updater === 'function' ? updater(prev) : updater
        const newState = { ...prev, ...updates }

        // Вычисляем процент выполнения как в оригинальном коде
        if (newState.totalHosts > 0) {
          newState.progress = Math.round(
            ((newState.processedHosts || 0) / newState.totalHosts) * 100
          )
        } else {
          newState.progress = newState.processedFiles > 0 ? 100 : 0
        }

        // Не позволяем прогрессу быть больше 100%
        newState.progress = Math.min(newState.progress, 100)

        // Сохраняем в хранилище
        if (sessionId) {
          globalProgressStorage.set(sessionId, {
            progress: newState,
            connectionStatus: latestConnectionStatusRef.current,
            currentOperation: latestOperationRef.current,
          })
        }

        return newState
      })
    },
    [sessionId]
  )

  // Функция обновления статуса с сохранением
  const updateStatus = useCallback(
    (status, operation = null) => {
      if (!isMountedRef.current) return

      setConnectionStatus(status)
      latestConnectionStatusRef.current = status

      if (operation) {
        setCurrentOperation(operation)
        latestOperationRef.current = operation
      }

      // Сохраняем в хранилище
      if (sessionId) {
        globalProgressStorage.set(sessionId, {
          progress: latestProgressRef.current,
          connectionStatus: status,
          currentOperation: operation || latestOperationRef.current,
        })
      }
    },
    [sessionId]
  )

  // Функция очистки
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    reconnectAttemptRef.current = 0
  }, [])

  // Функция установки обработчиков SSE (исправленная версия из оригинального кода)
  const setupSSEHandlers = useCallback(
    (eventSource) => {
      if (!eventSource || !isMountedRef.current) return

      eventSource.onopen = () => {
        if (isMountedRef.current) {
          updateStatus(
            CONNECTION_STATUS.CONNECTED,
            'Ожидание начала обработки JSON файлов...'
          )
          reconnectAttemptRef.current = 0
        }
      }

      eventSource.onmessage = (event) => {
        if (!isMountedRef.current) return

        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case EVENT_TYPES.CONNECTED:
              updateStatus(
                CONNECTION_STATUS.CONNECTED,
                'Готов к обработке JSON файлов'
              )
              break

            case EVENT_TYPES.PROCESSING_STARTED:
              updateStatus(
                CONNECTION_STATUS.PROCESSING,
                data.message || 'Начало обработки JSON файлов'
              )
              updateProgress({
                totalFiles: data.totalFiles || 1,
                progress: 0,
              })
              break

            case EVENT_TYPES.PROCESSING_START:
              updateProgress({
                totalHosts: data.total_hosts || 0,
              })
              break

            case EVENT_TYPES.FILE_START:
              updateStatus(
                CONNECTION_STATUS.PROCESSING,
                `Начата обработка JSON файла: ${decodeFileName(data.fileName)}`
              )
              break

            case EVENT_TYPES.FILE_PROGRESS:
              updateProgress((prev) => ({
                processedHosts: +data.processedHosts,
              }))
              break

            case EVENT_TYPES.FILE_COMPLETE: {
              const fileResult = data.result || {}

              updateProgress((prev) => ({
                processedFiles: prev.processedFiles + 1,
                hostsCreated: prev.hostsCreated + (+fileResult.created || 0),
                hostsUpdated: prev.hostsUpdated + (+fileResult.updated || 0),
                hostsSkipped: prev.hostsSkipped + (+fileResult.skipped || 0),
                hostsErrors: prev.hostsErrors + (+fileResult.errors || 0),
              }))

              updateStatus(
                CONNECTION_STATUS.PROCESSING,
                `Файл ${decodeFileName(data.fileName)} обработан: ${fileResult.created || 0} создано, ${fileResult.updated || 0} обновлено`
              )
              break
            }

            case EVENT_TYPES.FILE_ERROR:
              updateProgress((prev) => ({
                processedFiles: prev.processedFiles + 1,
                filesError: prev.filesError + 1,
              }))
              updateStatus(
                CONNECTION_STATUS.PROCESSING,
                `Ошибка обработки файла: ${decodeFileName(data.fileName)}`
              )
              break

            case EVENT_TYPES.PROCESSING_COMPLETE:
              updateProgress((prev) => ({
                completedFiles: prev.completedFiles + 1,
              }))
              break

            case EVENT_TYPES.ALL_COMPLETE:
              updateStatus(
                CONNECTION_STATUS.COMPLETED,
                'Все JSON файлы успешно обработаны'
              )
              onComplete?.()
              break

            case EVENT_TYPES.PROCESSING_ERROR:
              updateStatus(
                CONNECTION_STATUS.ERROR,
                `Ошибка обработки: ${data.error}`
              )
              break

            default:
              console.warn('Неизвестный тип события:', data.type)
          }
        } catch (error) {
          console.error('Ошибка обработки события SSE:', error)
        }
      }

      eventSource.onerror = (error) => {
        if (
          isMountedRef.current &&
          eventSource.readyState === EventSource.CLOSED
        ) {
          updateStatus(CONNECTION_STATUS.ERROR, 'Ошибка соединения с сервером')

          // Попытка переподключения
          if (reconnectAttemptRef.current < 3) {
            reconnectAttemptRef.current++
            reconnectTimeoutRef.current = setTimeout(() => {
              setupSSEHandlers(eventSource)
            }, 2000 * reconnectAttemptRef.current)
          }
        }
      }
    },
    [clientId, decodeFileName, onComplete, updateProgress, updateStatus]
  )

  // Проверка существующего соединения
  const getOrCreateSSEConnection = useCallback(() => {
    if (!clientId) return null

    const connectionKey = clientId

    // Проверяем существующее соединение
    if (globalSSEConnections.has(connectionKey)) {
      const existingEventSource = globalSSEConnections.get(connectionKey)

      // Проверяем состояние соединения
      if (existingEventSource.readyState === EventSource.OPEN) {
        return existingEventSource
      } else {
        // Закрываем старое соединение если оно не открыто
        existingEventSource.close()
        globalSSEConnections.delete(connectionKey)
      }
    }

    // Создаем новое соединение
    try {
      const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
      const sseUrl = `${baseUrl}/files/progress?clientId=${clientId}`

      const eventSource = new EventSource(sseUrl)
      globalSSEConnections.set(connectionKey, eventSource)

      return eventSource
    } catch (error) {
      console.error('Ошибка создания EventSource для', clientId, error)
      return null
    }
  }, [clientId])

  // Эффект для управления SSE соединением
  useEffect(() => {
    isMountedRef.current = true

    if (clientId) {
      const eventSource = getOrCreateSSEConnection()
      if (eventSource) {
        setupSSEHandlers(eventSource)
      } else {
        updateStatus(
          CONNECTION_STATUS.ERROR,
          'Не удалось подключиться к серверу'
        )
      }
    }

    return () => {
      isMountedRef.current = false
      cleanup()
    }
  }, [
    clientId,
    sessionId,
    setupSSEHandlers,
    getOrCreateSSEConnection,
    cleanup,
    updateStatus,
  ])

  // Очистка старых данных из хранилища при монтировании
  useEffect(() => {
    globalProgressStorage.cleanupOldData()
  }, [])

  // Очистка соединений при завершении
  useEffect(() => {
    if (
      connectionStatus === CONNECTION_STATUS.COMPLETED ||
      connectionStatus === CONNECTION_STATUS.ERROR
    ) {
      // Через 30 секунд после завершения закрываем соединение
      const cleanupTimer = setTimeout(() => {
        if (clientId && globalSSEConnections.has(clientId)) {
          const eventSource = globalSSEConnections.get(clientId)
          eventSource.close()
          globalSSEConnections.delete(clientId)
        }
      }, 30000)

      return () => clearTimeout(cleanupTimer)
    }
  }, [connectionStatus, clientId])

  // Обработчик закрытия
  const handleClose = () => {
    // Закрываем соединение
    if (clientId && globalSSEConnections.has(clientId)) {
      const eventSource = globalSSEConnections.get(clientId)
      eventSource.close()
      globalSSEConnections.delete(clientId)
    }

    // Удаляем данные из хранилища
    if (sessionId) {
      globalProgressStorage.delete(sessionId)
    }

    cleanup()
    onClose?.()
  }

  // Компактный вид для свернутого состояния
  const renderMinimizedView = () => (
    <div
      style={{
        padding: '12px 16px',
        background: '#f0f8ff',
        border: '1px solid #d6e4ff',
        borderRadius: '8px',
        minWidth: 300,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
          }}
          onClick={() => onToggleMinimize?.()}
        >
          {statusConfig.icon}
          <span style={{ fontWeight: '500', fontSize: '14px' }}>
            JSON импорт: {progress.progress}%
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            type="text"
            icon={isModal ? <MinusOutlined /> : <ArrowsAltOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              onToggleMinimize?.()
            }}
            size="small"
            title={isModal ? 'Свернуть' : 'Развернуть'}
          />
          <Button
            type="text"
            icon={<CloseCircleOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              handleClose()
            }}
            size="small"
            danger
          />
        </div>
      </div>

      <Progress
        percent={progress.progress}
        size="small"
        style={{ marginBottom: 8 }}
        status={statusConfig.progressStatus}
        strokeColor={statusConfig.strokeColor}
        showInfo={false}
      />

      <div style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>
        {currentOperation}
      </div>

      <Row gutter={8} style={{ fontSize: '12px', color: '#666' }}>
        <Col span={6}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <PlusOutlined style={{ color: '#52c41a', fontSize: '10px' }} />
            <span>{progress.hostsCreated || 0}</span>
          </div>
        </Col>
        <Col span={6}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <SyncOutlined style={{ color: '#1890ff', fontSize: '10px' }} />
            <span>{progress.hostsUpdated || 0}</span>
          </div>
        </Col>
        <Col span={6}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <DatabaseOutlined style={{ color: '#666', fontSize: '10px' }} />
            <span>{progress.totalHosts || 0}</span>
          </div>
        </Col>
        <Col span={6}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <WarningOutlined
              style={{
                color: progress.hostsErrors > 0 ? '#ff4d4f' : '#666',
                fontSize: '10px',
              }}
            />
            <span
              style={{
                color: progress.hostsErrors > 0 ? '#ff4d4f' : '#666',
              }}
            >
              {progress.hostsErrors || 0}
            </span>
          </div>
        </Col>
      </Row>
    </div>
  )

  // Полный вид
  const renderFullView = () => (
    <div style={{ maxWidth: 800 }}>
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
            <div style={{ display: 'flex', gap: '4px' }}>
              {onToggleMinimize && (
                <Button
                  type="text"
                  icon={isModal ? <MinusOutlined /> : <ArrowsAltOutlined />}
                  onClick={onToggleMinimize}
                  title={isModal ? 'Свернуть' : 'Развернуть'}
                  size="small"
                />
              )}
              <Button
                type="text"
                icon={<CloseCircleOutlined />}
                onClick={handleClose}
                title="Закрыть"
                size="small"
                danger
              />
            </div>
          </div>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>
            {currentOperation}
          </div>

          <Progress
            percent={progress.progress}
            status={statusConfig.progressStatus}
            strokeColor={statusConfig.strokeColor}
            strokeWidth={8}
          />
        </div>

        <Row gutter={16}>
          <Col span={12}>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Title level={5} style={{ marginBottom: 12 }}>
                <DatabaseOutlined /> Статистика базы данных
              </Title>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic
                    title="Новые записи"
                    value={progress.hostsCreated || 0}
                    valueStyle={{ color: '#52c41a', fontSize: '24px' }}
                    prefix={<PlusOutlined />}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Обновленные записи"
                    value={progress.hostsUpdated || 0}
                    valueStyle={{ color: '#1890ff', fontSize: '24px' }}
                    prefix={<SyncOutlined />}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Пропущено"
                    value={progress.hostsSkipped || 0}
                    valueStyle={{ color: '#666', fontSize: '20px' }}
                    prefix={<EditOutlined />}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Ошибки"
                    value={progress.hostsErrors || 0}
                    valueStyle={{
                      color: progress.hostsErrors > 0 ? '#ff4d4f' : '#666',
                      fontSize: '20px',
                    }}
                    prefix={<WarningOutlined />}
                  />
                </Col>
              </Row>
            </Card>
          </Col>

          <Col span={12}>
            <Card size="small">
              <Title level={5} style={{ marginBottom: 12 }}>
                <FileTextOutlined /> Статистика файлов
              </Title>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic
                    title="Всего файлов"
                    value={progress.totalFiles || 0}
                    valueStyle={{ fontSize: '24px' }}
                    prefix={<FileTextOutlined />}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Обработано"
                    value={progress.completedFiles || 0}
                    valueStyle={{
                      color:
                        progress.completedFiles === progress.totalFiles &&
                        progress.totalFiles > 0
                          ? '#52c41a'
                          : '#1890ff',
                      fontSize: '24px',
                    }}
                    suffix={`/ ${progress.totalFiles}`}
                    prefix={<CheckCircleOutlined />}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Всего хостов"
                    value={progress.totalHosts || 0}
                    valueStyle={{ fontSize: '20px' }}
                    prefix={<CloudUploadOutlined />}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Обработано хостов"
                    value={progress.processedHosts || 0}
                    valueStyle={{ fontSize: '20px' }}
                    suffix={
                      progress.totalHosts > 0 ? `/ ${progress.totalHosts}` : ''
                    }
                    prefix={<DatabaseOutlined />}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Card>

      {connectionStatus === CONNECTION_STATUS.ERROR && (
        <Alert
          message="Произошла ошибка при импорте JSON"
          description="Проверьте формат файла и попробуйте снова."
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {connectionStatus === CONNECTION_STATUS.COMPLETED && (
        <Alert
          message="Импорт JSON файлов завершен успешно!"
          type="success"
          showIcon
          description={
            <div>
              <p>Итоговая статистика:</p>
              <ul style={{ marginBottom: 0 }}>
                <li>
                  <CheckCircleOutlined
                    style={{ color: '#52c41a', marginRight: 8 }}
                  />
                  <strong>{progress.hostsCreated || 0}</strong> новых записей
                  создано
                </li>
                <li>
                  <SyncOutlined style={{ color: '#1890ff', marginRight: 8 }} />
                  <strong>{progress.hostsUpdated || 0}</strong> записей
                  обновлено
                </li>
                <li>
                  <EditOutlined style={{ color: '#666', marginRight: 8 }} />
                  <strong>{progress.hostsSkipped || 0}</strong> записей
                  пропущено
                </li>
                {progress.hostsErrors > 0 && (
                  <li>
                    <WarningOutlined
                      style={{ color: '#ff4d4f', marginRight: 8 }}
                    />
                    <strong>{progress.hostsErrors || 0}</strong> ошибок
                    обработки
                  </li>
                )}
              </ul>
            </div>
          }
        />
      )}
    </div>
  )

  return isMinimized ? renderMinimizedView() : renderFullView()
}

// import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
// import {
//   Card,
//   Progress,
//   Statistic,
//   Row,
//   Col,
//   Tag,
//   Alert,
//   Button,
//   Typography,
// } from 'antd'
// import {
//   FileTextOutlined,
//   CloudUploadOutlined,
//   CheckCircleOutlined,
//   CloseCircleOutlined,
//   LoadingOutlined,
//   MinusOutlined,
//   ArrowsAltOutlined,
//   PlusOutlined,
//   EditOutlined,
//   SyncOutlined,
//   WarningOutlined,
//   DatabaseOutlined,
// } from '@ant-design/icons'
// import { ROUTES } from './routes'

// const { Title } = Typography

// const CONNECTION_STATUS = {
//   CONNECTING: 'connecting',
//   CONNECTED: 'connected',
//   PROCESSING: 'processing',
//   COMPLETED: 'completed',
//   ERROR: 'error',
// }

// const EVENT_TYPES = {
//   CONNECTED: 'connected',
//   PROCESSING_STARTED: 'processing_started',
//   PROCESSING_START: 'processing_start',
//   BATCH_COMPLETE: 'batch_complete',
//   FILE_START: 'file_start',
//   FILE_COMPLETE: 'file_complete',
//   FILE_PROGRESS: 'file_progress',
//   FILE_ERROR: 'file_error',
//   PROCESSING_COMPLETE: 'processing_complete',
//   ALL_COMPLETE: 'all_complete',
//   PROCESSING_ERROR: 'processing_error',
// }

// const INITIAL_PROGRESS = {
//   totalFiles: 0,
//   processedFiles: 0,
//   completedFiles: 0,
//   filesError: 0,
//   totalHosts: 0,
//   processedHosts: 0,
//   hostsCreated: 0,
//   hostsUpdated: 0,
//   hostsSkipped: 0,
//   hostsErrors: 0,
//   progress: 0,
// }

// const STATUS_CONFIG = {
//   [CONNECTION_STATUS.CONNECTED]: {
//     color: 'blue',
//     icon: <CheckCircleOutlined style={{ color: '#1890ff' }} />,
//     text: 'Подключено',
//     progressStatus: 'normal',
//     strokeColor: '#1890ff',
//   },
//   [CONNECTION_STATUS.PROCESSING]: {
//     color: 'orange',
//     icon: <LoadingOutlined style={{ color: '#fa8c16' }} />,
//     text: 'В процессе',
//     progressStatus: 'active',
//     strokeColor: '#1890ff',
//   },
//   [CONNECTION_STATUS.COMPLETED]: {
//     color: 'green',
//     icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
//     text: 'Завершено',
//     progressStatus: 'success',
//     strokeColor: '#52c41a',
//   },
//   [CONNECTION_STATUS.ERROR]: {
//     color: 'red',
//     icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
//     text: 'Ошибка',
//     progressStatus: 'exception',
//     strokeColor: '#ff4d4f',
//   },
//   [CONNECTION_STATUS.CONNECTING]: {
//     color: 'gray',
//     icon: <LoadingOutlined />,
//     text: 'Подключение...',
//     progressStatus: 'normal',
//     strokeColor: '#1890ff',
//   },
// }

// // Глобальное хранилище для данных прогресса
// const globalProgressData = new Map()

// export const JSONUploadProgress = ({
//   clientId,
//   sessionId,
//   onComplete,
//   onClose,
//   isMinimized = false,
//   onToggleMinimize,
//   decodeFileName = (fileName) => fileName,
//   showExportButtons = true,
//   isModal = false,
// }) => {
//   const [connectionStatus, setConnectionStatus] = useState(
//     CONNECTION_STATUS.CONNECTING
//   )
//   const [progress, setProgress] = useState(INITIAL_PROGRESS)
//   const [currentOperation, setCurrentOperation] = useState(
//     'Подключение к серверу...'
//   )

//   const isMountedRef = useRef(false)
//   const reconnectAttemptRef = useRef(0)
//   const reconnectTimeoutRef = useRef(null)

//   // Рефы для хранения данных между рендерами
//   const progressDataRef = useRef(null)
//   const connectionStatusRef = useRef(CONNECTION_STATUS.CONNECTING)
//   const currentOperationRef = useRef('Подключение к серверу...')

//   // Инициализация из глобального хранилища при монтировании
//   useEffect(() => {
//     if (sessionId && globalProgressData.has(sessionId)) {
//       const savedData = globalProgressData.get(sessionId)
//       setProgress(savedData.progress)
//       setConnectionStatus(savedData.connectionStatus)
//       setCurrentOperation(savedData.currentOperation)

//       // Сохраняем в рефы
//       progressDataRef.current = savedData.progress
//       connectionStatusRef.current = savedData.connectionStatus
//       currentOperationRef.current = savedData.currentOperation
//     }
//   }, [sessionId])

//   // Сохранение в глобальное хранилище при изменении
//   useEffect(() => {
//     if (sessionId && progressDataRef.current) {
//       globalProgressData.set(sessionId, {
//         progress: progressDataRef.current,
//         connectionStatus: connectionStatusRef.current,
//         currentOperation: currentOperationRef.current,
//         timestamp: Date.now()
//       })
//     }
//   }, [sessionId, progress, connectionStatus, currentOperation])

//   // Мемоизированная конфигурация статуса
//   const statusConfig = useMemo(
//     () =>
//       STATUS_CONFIG[connectionStatus] ||
//       STATUS_CONFIG[CONNECTION_STATUS.CONNECTING],
//     [connectionStatus]
//   )

//   // Оптимизированная функция обновления прогресса (как в оригинале)
//   const updateProgress = useCallback((updater) => {
//     if (!isMountedRef.current) return

//     setProgress((prev) => {
//       const updates = typeof updater === 'function' ? updater(prev) : updater
//       const newState = { ...prev, ...updates }

//       // Вычисляем процент выполнения (как в оригинале)
//       if (newState.totalHosts > 0) {
//         newState.progress = Math.round(
//           ((newState.processedHosts || 0) / newState.totalHosts) * 100
//         )
//       } else {
//         newState.progress = newState.processedFiles > 0 ? 100 : 0
//       }

//       // Не позволяем прогрессу быть больше 100%
//       newState.progress = Math.min(newState.progress, 100)

//       // Сохраняем в реф
//       progressDataRef.current = newState

//       return newState
//     })
//   }, [])

//   // Функция обновления статуса
//   const updateStatus = useCallback((status, operation = null) => {
//     if (!isMountedRef.current) return

//     connectionStatusRef.current = status
//     setConnectionStatus(status)

//     if (operation) {
//       currentOperationRef.current = operation
//       setCurrentOperation(operation)
//     }
//   }, [])

//   // Функция очистки
//   const cleanup = useCallback(() => {
//     if (reconnectTimeoutRef.current) {
//       clearTimeout(reconnectTimeoutRef.current)
//       reconnectTimeoutRef.current = null
//     }

//     reconnectAttemptRef.current = 0
//   }, [])

//   // Глобальное хранилище для соединений
//   const globalSSEConnections = useRef(new Map())

//   // Функция установки обработчиков SSE
//   const setupSSEHandlers = useCallback((eventSource) => {
//     if (!eventSource || !isMountedRef.current) return

//     eventSource.onopen = () => {
//       if (isMountedRef.current) {
//         updateStatus(CONNECTION_STATUS.CONNECTED, 'Ожидание начала обработки JSON файлов...')
//         reconnectAttemptRef.current = 0
//       }
//     }

//     eventSource.onmessage = (event) => {
//       if (!isMountedRef.current) return

//       try {
//         const data = JSON.parse(event.data)

//         switch (data.type) {
//           case EVENT_TYPES.CONNECTED:
//             updateStatus(CONNECTION_STATUS.CONNECTED, 'Готов к обработке JSON файлов')
//             break

//           case EVENT_TYPES.PROCESSING_STARTED:
//             updateStatus(CONNECTION_STATUS.PROCESSING, data.message || 'Начало обработки JSON файлов')
//             updateProgress({
//               totalFiles: data.totalFiles || 1,
//               progress: 0,
//             })
//             break

//           case EVENT_TYPES.PROCESSING_START:
//             updateProgress({
//               totalHosts: data.total_hosts || 0,
//             })
//             break

//           case EVENT_TYPES.FILE_START:
//             updateStatus(CONNECTION_STATUS.PROCESSING,
//               `Начата обработка JSON файла: ${decodeFileName(data.fileName)}`)
//             break

//           case EVENT_TYPES.FILE_PROGRESS:
//             updateProgress((prev) => ({
//               processedHosts: +data.processedHosts,
//             }))
//             break

//           case EVENT_TYPES.FILE_COMPLETE: {
//             const fileResult = data.result || {}

//             updateProgress((prev) => ({
//               processedFiles: prev.processedFiles + 1,
//               hostsCreated: prev.hostsCreated + (+fileResult.created || 0),
//               hostsUpdated: prev.hostsUpdated + (+fileResult.updated || 0),
//               hostsSkipped: prev.hostsSkipped + (+fileResult.skipped || 0),
//               hostsErrors: prev.hostsErrors + (+fileResult.errors || 0),
//             }))

//             updateStatus(CONNECTION_STATUS.PROCESSING,
//               `Файл ${decodeFileName(data.fileName)} обработан: ${fileResult.created || 0} создано, ${fileResult.updated || 0} обновлено`
//             )
//             break
//           }

//           case EVENT_TYPES.FILE_ERROR:
//             updateProgress((prev) => ({
//               processedFiles: prev.processedFiles + 1,
//               filesError: prev.filesError + 1,
//             }))
//             updateStatus(CONNECTION_STATUS.PROCESSING,
//               `Ошибка обработки файла: ${decodeFileName(data.fileName)}`
//             )
//             break

//           case EVENT_TYPES.PROCESSING_COMPLETE:
//             updateProgress((prev) => ({
//               completedFiles: prev.completedFiles + 1,
//             }))
//             break

//           case EVENT_TYPES.ALL_COMPLETE:
//             updateStatus(CONNECTION_STATUS.COMPLETED, 'Все JSON файлы успешно обработаны')
//             onComplete?.()
//             break

//           case EVENT_TYPES.PROCESSING_ERROR:
//             updateStatus(CONNECTION_STATUS.ERROR, `Ошибка обработки: ${data.error}`)
//             break

//           default:
//             console.warn('Неизвестный тип события:', data.type)
//         }
//       } catch (error) {
//         console.error('Ошибка обработки события SSE:', error)
//       }
//     }

//     eventSource.onerror = (error) => {
//       if (isMountedRef.current && eventSource.readyState === EventSource.CLOSED) {
//         updateStatus(CONNECTION_STATUS.ERROR, 'Ошибка соединения с сервером')

//         // Попытка переподключения
//         if (reconnectAttemptRef.current < 3) {
//           reconnectAttemptRef.current++
//           reconnectTimeoutRef.current = setTimeout(() => {
//             setupSSEHandlers(eventSource)
//           }, 2000 * reconnectAttemptRef.current)
//         }
//       }
//     }
//   }, [clientId, decodeFileName, onComplete, updateProgress, updateStatus])

//   // Проверка существующего соединения
//   const getOrCreateSSEConnection = useCallback(() => {
//     if (!clientId) return null

//     const connectionKey = clientId

//     // Проверяем существующее соединение
//     if (globalSSEConnections.current.has(connectionKey)) {
//       const existingEventSource = globalSSEConnections.current.get(connectionKey)

//       // Проверяем состояние соединения
//       if (existingEventSource.readyState === EventSource.OPEN) {
//         return existingEventSource
//       } else {
//         // Закрываем старое соединение если оно не открыто
//         existingEventSource.close()
//         globalSSEConnections.current.delete(connectionKey)
//       }
//     }

//     // Создаем новое соединение
//     try {
//       const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
//       const sseUrl = `${baseUrl}/files/progress?clientId=${clientId}`

//       const eventSource = new EventSource(sseUrl)
//       globalSSEConnections.current.set(connectionKey, eventSource)

//       return eventSource
//     } catch (error) {
//       console.error('Ошибка создания EventSource для', clientId, error)
//       return null
//     }
//   }, [clientId])

//   // Эффект для управления SSE соединением
//   useEffect(() => {
//     isMountedRef.current = true

//     // Если у нас есть сохраненные данные из глобального хранилища, используем их
//     if (!progressDataRef.current && sessionId && globalProgressData.has(sessionId)) {
//       const savedData = globalProgressData.get(sessionId)
//       progressDataRef.current = savedData.progress
//       connectionStatusRef.current = savedData.connectionStatus
//       currentOperationRef.current = savedData.currentOperation

//       setProgress(savedData.progress)
//       setConnectionStatus(savedData.connectionStatus)
//       setCurrentOperation(savedData.currentOperation)
//     }

//     if (clientId) {
//       const eventSource = getOrCreateSSEConnection()
//       if (eventSource) {
//         setupSSEHandlers(eventSource)
//       } else {
//         updateStatus(CONNECTION_STATUS.ERROR, 'Не удалось подключиться к серверу')
//       }
//     }

//     return () => {
//       isMountedRef.current = false
//       cleanup()
//     }
//   }, [clientId, sessionId, setupSSEHandlers, getOrCreateSSEConnection, cleanup, updateStatus])

//   // Очистка глобального хранилища при завершении или закрытии
//   useEffect(() => {
//     return () => {
//       // Очищаем старые данные (старше 5 минут)
//       const now = Date.now()
//       for (const [key, data] of globalProgressData.entries()) {
//         if (now - data.timestamp > 5 * 60 * 1000) {
//           globalProgressData.delete(key)
//         }
//       }
//     }
//   }, [])

//   // Очистка соединений при завершении
//   useEffect(() => {
//     if (connectionStatus === CONNECTION_STATUS.COMPLETED ||
//         connectionStatus === CONNECTION_STATUS.ERROR) {

//       // Через 30 секунд после завершения закрываем соединение
//       const cleanupTimer = setTimeout(() => {
//         if (clientId && globalSSEConnections.current.has(clientId)) {
//           const eventSource = globalSSEConnections.current.get(clientId)
//           eventSource.close()
//           globalSSEConnections.current.delete(clientId)
//         }

//         // Удаляем данные из глобального хранилища
//         if (sessionId) {
//           globalProgressData.delete(sessionId)
//         }
//       }, 30000)

//       return () => clearTimeout(cleanupTimer)
//     }
//   }, [connectionStatus, clientId, sessionId])

//   // Обработчик закрытия
//   const handleClose = () => {
//     // Закрываем соединение
//     if (clientId && globalSSEConnections.current.has(clientId)) {
//       const eventSource = globalSSEConnections.current.get(clientId)
//       eventSource.close()
//       globalSSEConnections.current.delete(clientId)
//     }

//     // Удаляем данные из глобального хранилища
//     if (sessionId) {
//       globalProgressData.delete(sessionId)
//     }

//     cleanup()
//     onClose?.()
//   }

//   // Компактный вид для свернутого состояния
//   const renderMinimizedView = () => (
//     <div
//       style={{
//         padding: '12px 16px',
//         background: '#f0f8ff',
//         border: '1px solid #d6e4ff',
//         borderRadius: '8px',
//         minWidth: 300,
//         boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
//       }}
//     >
//       <div
//         style={{
//           display: 'flex',
//           justifyContent: 'space-between',
//           alignItems: 'center',
//           marginBottom: 8,
//         }}
//       >
//         <div
//           style={{
//             display: 'flex',
//             alignItems: 'center',
//             gap: '8px',
//             cursor: 'pointer'
//           }}
//           onClick={() => onToggleMinimize?.()}
//         >
//           {statusConfig.icon}
//           <span style={{ fontWeight: '500', fontSize: '14px' }}>
//             JSON импорт: {progress.progress}%
//           </span>
//         </div>
//         <div style={{ display: 'flex', gap: '4px' }}>
//           <Button
//             type="text"
//             icon={isModal ? <MinusOutlined /> : <ArrowsAltOutlined />}
//             onClick={(e) => {
//               e.stopPropagation()
//               onToggleMinimize?.()
//             }}
//             size="small"
//             title={isModal ? "Свернуть" : "Развернуть"}
//           />
//           <Button
//             type="text"
//             icon={<CloseCircleOutlined />}
//             onClick={(e) => {
//               e.stopPropagation()
//               handleClose()
//             }}
//             size="small"
//             danger
//           />
//         </div>
//       </div>

//       <Progress
//         percent={progress.progress}
//         size="small"
//         style={{ marginBottom: 8 }}
//         status={statusConfig.progressStatus}
//         strokeColor={statusConfig.strokeColor}
//         showInfo={false}
//       />

//       <div style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>
//         {currentOperation}
//       </div>

//       <Row gutter={8} style={{ fontSize: '12px', color: '#666' }}>
//         <Col span={6}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//             <PlusOutlined style={{ color: '#52c41a', fontSize: '10px' }} />
//             <span>{progress.hostsCreated || 0}</span>
//           </div>
//         </Col>
//         <Col span={6}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//             <SyncOutlined style={{ color: '#1890ff', fontSize: '10px' }} />
//             <span>{progress.hostsUpdated || 0}</span>
//           </div>
//         </Col>
//         <Col span={6}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//             <DatabaseOutlined style={{ color: '#666', fontSize: '10px' }} />
//             <span>{progress.totalHosts || 0}</span>
//           </div>
//         </Col>
//         <Col span={6}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//             <WarningOutlined
//               style={{
//                 color: progress.hostsErrors > 0 ? '#ff4d4f' : '#666',
//                 fontSize: '10px',
//               }}
//             />
//             <span
//               style={{
//                 color: progress.hostsErrors > 0 ? '#ff4d4f' : '#666',
//               }}
//             >
//               {progress.hostsErrors || 0}
//             </span>
//           </div>
//         </Col>
//       </Row>
//     </div>
//   )

//   // Полный вид
//   const renderFullView = () => (
//     <div style={{ maxWidth: 800 }}>
//       <Card
//         size="small"
//         style={{ marginBottom: 16 }}
//         title={
//           <div
//             style={{
//               display: 'flex',
//               justifyContent: 'space-between',
//               alignItems: 'center',
//             }}
//           >
//             <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
//             <div style={{ display: 'flex', gap: '4px' }}>
//               {onToggleMinimize && (
//                 <Button
//                   type="text"
//                   icon={isModal ? <MinusOutlined /> : <ArrowsAltOutlined />}
//                   onClick={onToggleMinimize}
//                   title={isModal ? "Свернуть" : "Развернуть"}
//                   size="small"
//                 />
//               )}
//               <Button
//                 type="text"
//                 icon={<CloseCircleOutlined />}
//                 onClick={handleClose}
//                 title="Закрыть"
//                 size="small"
//                 danger
//               />
//             </div>
//           </div>
//         }
//       >
//         <div style={{ marginBottom: 12 }}>
//           <div style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>
//             {currentOperation}
//           </div>

//           <Progress
//             percent={progress.progress}
//             status={statusConfig.progressStatus}
//             strokeColor={statusConfig.strokeColor}
//             strokeWidth={8}
//           />
//         </div>

//         <Row gutter={16}>
//           <Col span={12}>
//             <Card size="small" style={{ marginBottom: 16 }}>
//               <Title level={5} style={{ marginBottom: 12 }}>
//                 <DatabaseOutlined /> Статистика базы данных
//               </Title>
//               <Row gutter={[16, 16]}>
//                 <Col span={12}>
//                   <Statistic
//                     title="Новые записи"
//                     value={progress.hostsCreated || 0}
//                     valueStyle={{ color: '#52c41a', fontSize: '24px' }}
//                     prefix={<PlusOutlined />}
//                   />
//                 </Col>
//                 <Col span={12}>
//                   <Statistic
//                     title="Обновленные записи"
//                     value={progress.hostsUpdated || 0}
//                     valueStyle={{ color: '#1890ff', fontSize: '24px' }}
//                     prefix={<SyncOutlined />}
//                   />
//                 </Col>
//                 <Col span={12}>
//                   <Statistic
//                     title="Пропущено"
//                     value={progress.hostsSkipped || 0}
//                     valueStyle={{ color: '#666', fontSize: '20px' }}
//                     prefix={<EditOutlined />}
//                   />
//                 </Col>
//                 <Col span={12}>
//                   <Statistic
//                     title="Ошибки"
//                     value={progress.hostsErrors || 0}
//                     valueStyle={{
//                       color: progress.hostsErrors > 0 ? '#ff4d4f' : '#666',
//                       fontSize: '20px',
//                     }}
//                     prefix={<WarningOutlined />}
//                   />
//                 </Col>
//               </Row>
//             </Card>
//           </Col>

//           <Col span={12}>
//             <Card size="small">
//               <Title level={5} style={{ marginBottom: 12 }}>
//                 <FileTextOutlined /> Статистика файлов
//               </Title>
//               <Row gutter={[16, 16]}>
//                 <Col span={12}>
//                   <Statistic
//                     title="Всего файлов"
//                     value={progress.totalFiles || 0}
//                     valueStyle={{ fontSize: '24px' }}
//                     prefix={<FileTextOutlined />}
//                   />
//                 </Col>
//                 <Col span={12}>
//                   <Statistic
//                     title="Обработано"
//                     value={progress.completedFiles || 0}
//                     valueStyle={{
//                       color:
//                         progress.completedFiles === progress.totalFiles &&
//                         progress.totalFiles > 0
//                           ? '#52c41a'
//                           : '#1890ff',
//                       fontSize: '24px',
//                     }}
//                     suffix={`/ ${progress.totalFiles}`}
//                     prefix={<CheckCircleOutlined />}
//                   />
//                 </Col>
//                 <Col span={12}>
//                   <Statistic
//                     title="Всего хостов"
//                     value={progress.totalHosts || 0}
//                     valueStyle={{ fontSize: '20px' }}
//                     prefix={<CloudUploadOutlined />}
//                   />
//                 </Col>
//                 <Col span={12}>
//                   <Statistic
//                     title="Обработано хостов"
//                     value={progress.processedHosts || 0}
//                     valueStyle={{ fontSize: '20px' }}
//                     suffix={
//                       progress.totalHosts > 0 ? `/ ${progress.totalHosts}` : ''
//                     }
//                     prefix={<DatabaseOutlined />}
//                   />
//                 </Col>
//               </Row>
//             </Card>
//           </Col>
//         </Row>
//       </Card>

//       {connectionStatus === CONNECTION_STATUS.ERROR && (
//         <Alert
//           message="Произошла ошибка при импорте JSON"
//           description="Проверьте формат файла и попробуйте снова."
//           type="error"
//           showIcon
//           style={{ marginBottom: 16 }}
//         />
//       )}

//       {connectionStatus === CONNECTION_STATUS.COMPLETED && (
//         <Alert
//           message="Импорт JSON файлов завершен успешно!"
//           type="success"
//           showIcon
//           description={
//             <div>
//               <p>Итоговая статистика:</p>
//               <ul style={{ marginBottom: 0 }}>
//                 <li>
//                   <CheckCircleOutlined
//                     style={{ color: '#52c41a', marginRight: 8 }}
//                   />
//                   <strong>{progress.hostsCreated || 0}</strong> новых записей
//                   создано
//                 </li>
//                 <li>
//                   <SyncOutlined style={{ color: '#1890ff', marginRight: 8 }} />
//                   <strong>{progress.hostsUpdated || 0}</strong> записей
//                   обновлено
//                 </li>
//                 <li>
//                   <EditOutlined style={{ color: '#666', marginRight: 8 }} />
//                   <strong>{progress.hostsSkipped || 0}</strong> записей
//                   пропущено
//                 </li>
//                 {progress.hostsErrors > 0 && (
//                   <li>
//                     <WarningOutlined
//                       style={{ color: '#ff4d4f', marginRight: 8 }}
//                     />
//                     <strong>{progress.hostsErrors || 0}</strong> ошибок
//                     обработки
//                   </li>
//                 )}
//               </ul>
//             </div>
//           }
//         />
//       )}
//     </div>
//   )

//   return isMinimized ? renderMinimizedView() : renderFullView()
// }
