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
  FILE_START: 'file_start',
  FILE_COMPLETE: 'file_complete',
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

export const JSONUploadProgress = ({
  clientId,
  onComplete,
  isMinimized = false,
  onToggleMinimize,
  decodeFileName = (fileName) => fileName,
}) => {
  const [connectionStatus, setConnectionStatus] = useState(
    CONNECTION_STATUS.CONNECTING
  )
  const [progress, setProgress] = useState(INITIAL_PROGRESS)
  const [currentOperation, setCurrentOperation] = useState(
    'Подключение к серверу...'
  )
  const eventSourceRef = useRef(null)

  // Мемоизированная конфигурация статуса
  const statusConfig = useMemo(
    () =>
      STATUS_CONFIG[connectionStatus] ||
      STATUS_CONFIG[CONNECTION_STATUS.CONNECTING],
    [connectionStatus]
  )

  // Оптимизированная функция обновления прогресса
  const updateProgress = useCallback((updater) => {
    setProgress((prev) => {
      const updates = typeof updater === 'function' ? updater(prev) : updater
      const newState = { ...prev, ...updates }

      // Автоматически вычисляем processedHosts
      newState.processedHosts =
        (newState.hostsCreated || 0) +
        (newState.hostsUpdated || 0) +
        (newState.hostsSkipped || 0) +
        (newState.hostsErrors || 0)

      // Вычисляем процент выполнения
      if (newState.totalFiles > 0) {
        newState.progress = Math.round(
          ((newState.processedFiles || 0) / newState.totalFiles) * 100
        )
      } else {
        newState.progress = newState.processedFiles > 0 ? 100 : 0
      }

      // Не позволяем прогрессу быть больше 100%
      newState.progress = Math.min(newState.progress, 100)

      return newState
    })
  }, [])

  // Функция подключения к SSE
  const connectSSE = useCallback(() => {
    if (!clientId) return

    // Закрываем предыдущее соединение
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
    const sseUrl = `${baseUrl}/files/progress?clientId=${clientId}`

    try {
      const eventSource = new EventSource(sseUrl)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setConnectionStatus(CONNECTION_STATUS.CONNECTED)
        setCurrentOperation('Ожидание начала обработки JSON файлов...')
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('JSON Upload SSE Event:', data)

          switch (data.type) {
            case EVENT_TYPES.CONNECTED:
              setConnectionStatus(CONNECTION_STATUS.CONNECTED)
              setCurrentOperation('Готов к обработке JSON файлов')
              break

            case EVENT_TYPES.PROCESSING_STARTED:
              setConnectionStatus(CONNECTION_STATUS.PROCESSING)
              setCurrentOperation(
                data.message || 'Начало обработки JSON файлов'
              )
              updateProgress({
                totalFiles: data.totalFiles || 1,
                totalHosts: data.total_hosts || 0,
                progress: 0,
              })

              break

            case EVENT_TYPES.FILE_START:
              setCurrentOperation(
                `Начата обработка JSON файла: ${decodeFileName(data.fileName)}`
              )
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
              setCurrentOperation(
                `Файл ${decodeFileName(data.fileName)} обработан: ${fileResult.created || 0} создано, ${fileResult.updated || 0} обновлено`
              )
              break
            }

            case EVENT_TYPES.FILE_ERROR:
              updateProgress((prev) => ({
                processedFiles: prev.processedFiles + 1,
                filesError: prev.filesError + 1,
              }))
              setCurrentOperation(
                `Ошибка обработки файла: ${decodeFileName(data.fileName)}`
              )
              break

            case EVENT_TYPES.PROCESSING_COMPLETE:
              updateProgress((prev) => ({
                completedFiles: prev.completedFiles + 1,
              }))
              break

            case EVENT_TYPES.ALL_COMPLETE:
              setConnectionStatus(CONNECTION_STATUS.COMPLETED)
              updateProgress({ progress: 100 })
              setCurrentOperation('Все JSON файлы успешно обработаны')
              onComplete?.()
              break

            case EVENT_TYPES.PROCESSING_ERROR:
              setConnectionStatus(CONNECTION_STATUS.ERROR)
              setCurrentOperation(`Ошибка обработки: ${data.error}`)
              break

            default:
              console.warn('Неизвестный тип события:', data.type)
          }
        } catch (error) {
          console.error('Ошибка обработки события SSE:', error)
        }
      }

      eventSource.onerror = (error) => {
        console.error('SSE Connection Error:', error)
        if (eventSource.readyState === EventSource.CLOSED) {
          setConnectionStatus(CONNECTION_STATUS.ERROR)
          setCurrentOperation('Ошибка соединения с сервером')
        }
      }
    } catch (error) {
      console.error('Ошибка создания EventSource:', error)
      setConnectionStatus(CONNECTION_STATUS.ERROR)
      setCurrentOperation('Не удалось подключиться к серверу')
    }
  }, [clientId, decodeFileName, onComplete, updateProgress])

  // Эффект для управления SSE соединением
  useEffect(() => {
    if (clientId) {
      connectSSE()
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [clientId, connectSSE])

  // Компактный вид для свернутого состояния
  const renderMinimizedView = () => (
    <div
      style={{
        padding: '12px 16px',
        background: '#f0f8ff',
        border: '1px solid #d6e4ff',
        borderRadius: '8px',
        cursor: 'pointer',
        minWidth: 300,
      }}
      onClick={onToggleMinimize}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {statusConfig.icon}
          <span style={{ fontWeight: '500' }}>
            JSON импорт: {progress.progress}%
          </span>
        </div>
        <Button
          type="text"
          icon={<ArrowsAltOutlined />}
          onClick={(e) => {
            e.stopPropagation()
            onToggleMinimize?.()
          }}
          size="small"
        />
      </div>

      <Progress
        percent={progress.progress}
        size="small"
        style={{ marginBottom: 8 }}
        status={statusConfig.progressStatus}
        strokeColor={statusConfig.strokeColor}
      />

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
            {onToggleMinimize && (
              <Button
                type="text"
                icon={<MinusOutlined />}
                onClick={onToggleMinimize}
                title="Свернуть"
                size="small"
              />
            )}
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

//! РАБОЧИЙ но НЕОПТИМИЗИРОВАННЫЙ
// import { useState, useEffect, useRef } from 'react'
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

// const initialProgressCounters = {
//   // Файлы
//   totalFiles: 0,
//   processedFiles: 0,
//   completedFiles: 0,
//   filesError: 0,

//   // Хосты
//   totalHosts: 0,
//   processedHosts: 0,
//   hostsCreated: 0,
//   hostsUpdated: 0,
//   hostsSkipped: 0,
//   hostsErrors: 0,

//   // Прогресс
//   progress: 0,
// }

// export const JSONUploadProgress = ({
//   clientId,
//   onComplete,
//   isMinimized = false,
//   onToggleMinimize,
//   decodeFileName = (fileName) => fileName,
// }) => {
//   const [connectionStatus, setConnectionStatus] = useState('connecting')
//   const [progress, setProgress] = useState(initialProgressCounters)
//   const [currentOperation, setCurrentOperation] = useState(
//     'Подключение к серверу...'
//   )
//   const eventSourceRef = useRef(null)

//   const connectSSE = () => {
//     if (!clientId) return

//     if (eventSourceRef.current) {
//       eventSourceRef.current.close()
//     }

//     const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
//     const sseUrl = `${baseUrl}/files/progress?clientId=${clientId}`

//     const eventSource = new EventSource(sseUrl)
//     eventSourceRef.current = eventSource

//     eventSource.onopen = () => {
//       setConnectionStatus('connected')
//       setCurrentOperation('Ожидание начала обработки JSON файлов...')
//     }

//     eventSource.onmessage = (event) => {
//       try {
//         const data = JSON.parse(event.data)
//         console.log('JSON Upload SSE Event:', data)

//         switch (data.type) {
//           case 'connected':
//             setConnectionStatus('connected')
//             setCurrentOperation('Готов к обработке JSON файлов')
//             break

//           case 'processing_started':
//             setConnectionStatus('processing')
//             setCurrentOperation(data.message || 'Начало обработки JSON файлов')

//             setProgress((prev) => ({
//               ...prev,
//               totalFiles: data.totalFiles || 1,
//               totalHosts: data.total_hosts || 0,
//               progress: 0,
//             }))
//             break

//           case 'file_start':
//             const decodedFileName = decodeFileName(data.fileName)
//             setCurrentOperation(
//               `Начата обработка JSON файла: ${decodedFileName}`
//             )
//             break

//           case 'file_complete': {
//             const completeFileName = decodeFileName(data.fileName)
//             const fileResult = data.result || {}

//             setProgress((prev) => ({
//               ...prev,
//               processedFiles: prev.processedFiles + 1,
//               hostsCreated:
//                 (prev.hostsCreated || 0) + (+fileResult.created || 0),
//               hostsUpdated:
//                 (prev.hostsUpdated || 0) + (+fileResult.updated || 0),
//               hostsSkipped:
//                 (prev.hostsSkipped || 0) + (+fileResult.skipped || 0),
//               hostsErrors: (prev.hostsErrors || 0) + (+fileResult.errors || 0),
//               processedHosts:
//                 (prev.hostsCreated || 0) +
//                 (+fileResult.created || 0) +
//                 (prev.hostsUpdated || 0) +
//                 (+fileResult.updated || 0) +
//                 (prev.hostsSkipped || 0) +
//                 (+fileResult.skipped || 0) +
//                 (prev.hostsErrors || 0) +
//                 (+fileResult.errors || 0),
//               progress:
//                 prev.totalFiles > 0
//                   ? Math.round(
//                       ((prev.processedFiles + 1) / prev.totalFiles) * 100
//                     )
//                   : 100,
//             }))

//             setCurrentOperation(
//               `Файл ${completeFileName} обработан: ${fileResult.created || 0} создано, ${fileResult.updated || 0} обновлено`
//             )
//             break
//           }

//           case 'file_error': {
//             const errorFileName = decodeFileName(data.fileName)

//             setProgress((prev) => ({
//               ...prev,
//               processedFiles: prev.processedFiles + 1,
//               filesError: prev.filesError + 1,
//               progress:
//                 prev.totalFiles > 0
//                   ? Math.round(
//                       ((prev.processedFiles + 1) / prev.totalFiles) * 100
//                     )
//                   : prev.progress,
//             }))

//             setCurrentOperation(`Ошибка обработки файла: ${errorFileName}`)
//             break
//           }

//           case 'processing_complete':
//             console.log('processing_complete >>> ', data)

//             setProgress((prev) => ({
//               ...prev,
//               totalHosts: data.total_hosts || 0,
//               completedFiles: prev.completedFiles + 1,
//               progress: 0,
//             }))
//             break

//           case 'all_complete':
//             setConnectionStatus('completed')

//             console.log(' all_complete ', data.results)

//             // // Финальное обновление прогресса
//             // if (data.results) {
//             //   setProgress((prev) => ({
//             //     ...prev,
//             //     progress: 100,
//             //     hostsCreated: data.results.hosts_created || prev.hostsCreated,
//             //     hostsUpdated: data.results.hosts_updated || prev.hostsUpdated,
//             //     hostsSkipped: data.results.hosts_skipped || prev.hostsSkipped,
//             //     hostsErrors: data.results.errors?.length || prev.hostsErrors,
//             //     totalHosts: data.results.total_hosts || prev.totalHosts,
//             //     processedHosts: data.results.total_hosts || prev.totalHosts,
//             //   }))
//             // } else {
//             setProgress((prev) => ({
//               ...prev,
//               progress: 100,
//               // processedHosts: prev.totalHosts || 0,
//             }))
//             // }

//             setCurrentOperation('Все JSON файлы успешно обработаны')
//             onComplete?.()
//             break

//           case 'processing_error':
//             setConnectionStatus('error')
//             setCurrentOperation(`Ошибка обработки: ${data.error}`)
//             break
//         }
//       } catch (error) {
//         console.error('Ошибка обработки события:', error)
//       }
//     }

//     eventSource.onerror = (error) => {
//       console.error('SSE Error:', error)
//       if (eventSource.readyState === EventSource.CLOSED) {
//         setConnectionStatus('error')
//         setCurrentOperation('Ошибка соединения с сервером')
//       }
//     }
//   }

//   useEffect(() => {
//     if (clientId) {
//       connectSSE()
//     }

//     return () => {
//       if (eventSourceRef.current) {
//         eventSourceRef.current.close()
//       }
//     }
//   }, [clientId])

//   const getStatusColor = () => {
//     switch (connectionStatus) {
//       case 'connected':
//         return 'blue'
//       case 'processing':
//         return 'orange'
//       case 'completed':
//         return 'green'
//       case 'error':
//         return 'red'
//       default:
//         return 'gray'
//     }
//   }

//   const getStatusIcon = () => {
//     switch (connectionStatus) {
//       case 'connected':
//         return <CheckCircleOutlined style={{ color: '#1890ff' }} />
//       case 'processing':
//         return <LoadingOutlined style={{ color: '#fa8c16' }} />
//       case 'completed':
//         return <CheckCircleOutlined style={{ color: '#52c41a' }} />
//       case 'error':
//         return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
//       default:
//         return <LoadingOutlined />
//     }
//   }

//   const getStatusText = () => {
//     switch (connectionStatus) {
//       case 'connected':
//         return 'Подключено'
//       case 'processing':
//         return 'В процессе'
//       case 'completed':
//         return 'Завершено'
//       case 'error':
//         return 'Ошибка'
//       default:
//         return 'Подключение...'
//     }
//   }

//   // Компактный вид для свернутого состояния
//   if (isMinimized) {
//     return (
//       <div
//         style={{
//           padding: '12px 16px',
//           background: '#f0f8ff',
//           border: '1px solid #d6e4ff',
//           borderRadius: '8px',
//           cursor: 'pointer',
//           minWidth: 300,
//         }}
//       >
//         <div
//           style={{
//             display: 'flex',
//             justifyContent: 'space-between',
//             alignItems: 'center',
//             marginBottom: 8,
//           }}
//         >
//           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//             {getStatusIcon()}
//             <span style={{ fontWeight: '500' }}>
//               JSON импорт: {progress.progress}%
//             </span>
//           </div>
//           <Button
//             type="text"
//             icon={<ArrowsAltOutlined />}
//             onClick={(e) => {
//               e.stopPropagation()
//               onToggleMinimize?.()
//             }}
//           />
//         </div>

//         <Progress
//           percent={progress.progress}
//           size="small"
//           style={{ marginBottom: 8 }}
//           status={
//             connectionStatus === 'processing'
//               ? 'active'
//               : connectionStatus === 'completed'
//                 ? 'success'
//                 : connectionStatus === 'error'
//                   ? 'exception'
//                   : 'normal'
//           }
//         />

//         <Row gutter={8} style={{ fontSize: '12px', color: '#666' }}>
//           <Col span={6}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//               <PlusOutlined style={{ color: '#52c41a', fontSize: '10px' }} />
//               <span>{progress.hostsCreated || 0}</span>
//             </div>
//           </Col>
//           <Col span={6}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//               <SyncOutlined style={{ color: '#1890ff', fontSize: '10px' }} />
//               <span>{progress.hostsUpdated || 0}</span>
//             </div>
//           </Col>
//           <Col span={6}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//               <DatabaseOutlined style={{ color: '#666', fontSize: '10px' }} />
//               <span>{progress.totalHosts || 0}</span>
//             </div>
//           </Col>
//           <Col span={6}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//               <WarningOutlined
//                 style={{
//                   color: progress.hostsErrors > 0 ? '#ff4d4f' : '#666',
//                   fontSize: '10px',
//                 }}
//               />
//               <span
//                 style={{
//                   color: progress.hostsErrors > 0 ? '#ff4d4f' : '#666',
//                 }}
//               >
//                 {progress.hostsErrors || 0}
//               </span>
//             </div>
//           </Col>
//         </Row>
//       </div>
//     )
//   }

//   // Полный вид
//   return (
//     <div style={{ maxWidth: 800 }}>
//       {/* Шапка с общей информацией */}
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
//             <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//               <Tag color={getStatusColor()}>{getStatusText()}</Tag>
//             </span>
//             {onToggleMinimize && (
//               <Button
//                 type="text"
//                 icon={<MinusOutlined />}
//                 onClick={onToggleMinimize}
//                 title="Свернуть"
//               />
//             )}
//           </div>
//         }
//       >
//         <div style={{ marginBottom: 12 }}>
//           <div style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>
//             {currentOperation}
//           </div>

//           <Progress
//             percent={progress.progress}
//             status={
//               connectionStatus === 'processing'
//                 ? 'active'
//                 : connectionStatus === 'completed'
//                   ? 'success'
//                   : connectionStatus === 'error'
//                     ? 'exception'
//                     : 'normal'
//             }
//             strokeColor={
//               connectionStatus === 'completed'
//                 ? '#52c41a'
//                 : connectionStatus === 'error'
//                   ? '#ff4d4f'
//                   : '#1890ff'
//             }
//             strokeWidth={8}
//           />
//         </div>

//         {/* Основная статистика импорта */}
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
//                     suffix={`${progress.completedFiles} / ${progress.totalFiles}`}
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

//       {/* Сообщение об ошибке */}
//       {connectionStatus === 'error' && (
//         <Alert
//           message="Произошла ошибка при импорте JSON"
//           description="Проверьте формат файла и попробуйте снова."
//           type="error"
//           showIcon
//           style={{ marginBottom: 16 }}
//         />
//       )}

//       {/* Итоговое сообщение о завершении */}
//       {connectionStatus === 'completed' && (
//         <Alert
//           message={
//             <div style={{ fontWeight: 'bold' }}>
//               Импорт JSON файлов завершен успешно!
//             </div>
//           }
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
//                   пропущено (данные не изменились)
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
//           type="success"
//           showIcon
//         />
//       )}
//     </div>
//   )
// }
