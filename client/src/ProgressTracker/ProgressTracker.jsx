import React, { useState, useEffect, useRef } from 'react'
import {
  Card,
  Progress,
  Statistic,
  Row,
  Col,
  Tag,
  Alert,
  Spin,
  Button,
  Divider,
  Space,
} from 'antd'
import {
  FileTextOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  MinusOutlined,
  ArrowsAltOutlined,
  DownloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { ROUTES } from '../routes'

export const ProgressTracker = ({
  clientId,
  onComplete,
  isMinimized = false,
  onToggleMinimize,
  decodeFileName = (fileName) => fileName,
  showExportButtons = true,
}) => {
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [progress, setProgress] = useState({
    processedIPs: 0,
    totalIPs: 0,
    progress: 0,
    successful: 0,
    failed: 0,
  })
  const [files, setFiles] = useState([])
  const [currentOperation, setCurrentOperation] = useState(
    'Подключение к серверу...'
  )
  const [exportLoading, setExportLoading] = useState(false)
  const eventSourceRef = useRef(null)

  const connectSSE = () => {
    if (!clientId) return

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
    const sseUrl = `${baseUrl}/files/progress?clientId=${clientId}`

    const eventSource = new EventSource(sseUrl)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setConnectionStatus('connected')
      setCurrentOperation('Ожидание начала обработки...')
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('SSE Event:', data) // Добавим лог для отладки

        switch (data.type) {
          case 'connected':
            setConnectionStatus('connected')
            setCurrentOperation('Готов к обработке файлов')
            break

          case 'file_start':
            setFiles((prev) => {
              const decodedFileName = decodeFileName(data.fileName)
              const exists = prev.find((f) => f.fileName === decodedFileName)
              if (exists) return prev

              return [
                ...prev,
                {
                  fileName: decodedFileName,
                  status: 'processing',
                  progress: 0,
                  fileIndex: data.fileIndex,
                  originalFileName: data.fileName, // сохраняем оригинальное имя для экспорта
                },
              ]
            })
            setConnectionStatus('processing')
            setCurrentOperation(`Обработка файла: ${decodedFileName}`)
            break

          case 'processing_started':
            setProgress((prev) => ({
              ...prev,
              totalIPs: data.totalIPs,
              processedIPs: 0,
              progress: 0,
            }))
            setCurrentOperation(`Начата обработка ${data.totalIPs} IP-адресов`)
            break

          case 'batch_start':
            setProgress((prev) => ({
              ...prev,
              currentBatch: data.batchIndex,
              totalBatches: data.totalBatches,
            }))
            setCurrentOperation(
              `Обработка батча ${data.batchIndex} из ${data.totalBatches}`
            )
            break

          case 'batch_complete':
            setProgress((prev) => ({
              ...prev,
              processedIPs: data.processedIPs,
              progress: data.progress,
              successful: data.successful || prev.successful,
              failed: data.failed || prev.failed,
            }))
            setFiles((prev) =>
              prev.map((file) =>
                file.status === 'processing'
                  ? { ...file, progress: data.progress }
                  : file
              )
            )
            setCurrentOperation(
              `Обработано ${data.processedIPs} из ${data.totalIPs} IP (${data.progress}%)`
            )
            break

          case 'file_complete':
            setFiles((prev) =>
              prev.map((file) =>
                file.fileName === decodeFileName(data.fileName)
                  ? {
                      ...file,
                      status: 'completed',
                      progress: 100,
                      result: data.result,
                    }
                  : file
              )
            )
            setCurrentOperation(
              `Файл ${decodeFileName(data.fileName)} обработан`
            )
            break

          case 'file_error':
            setFiles((prev) =>
              prev.map((file) =>
                file.fileName === decodeFileName(data.fileName)
                  ? { ...file, status: 'error', error: data.error }
                  : file
              )
            )
            setCurrentOperation(
              `Ошибка обработки файла: ${decodeFileName(data.fileName)}`
            )
            break

          case 'all_complete':
            setConnectionStatus('completed')
            setProgress((prev) => ({ ...prev, progress: 100 }))
            setCurrentOperation('Все файлы успешно обработаны')
            console.log('All complete, files:', files) // Лог для отладки
            break

          case 'processing_error':
            setConnectionStatus('error')
            setCurrentOperation(`Ошибка обработки: ${data.error}`)
            break
        }
      } catch (error) {
        console.error('Ошибка обработки события:', error)
      }
    }

    eventSource.onerror = (error) => {
      if (eventSource.readyState === EventSource.CLOSED) {
        setConnectionStatus('error')
        setCurrentOperation('Ошибка соединения с сервером')
      }
    }
  }

  useEffect(() => {
    if (clientId) {
      connectSSE()
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [clientId])

// Экспорт одного файла
const exportSingleFile = async (fileName) => {
  try {
    setExportLoading(true);
    console.log('Exporting file:', fileName);
    
    // Кодируем имя файла для URL
    const encodedFileName = encodeURIComponent(fileName);
    const response = await fetch(`http://localhost:5000/files/export/${encodedFileName}`)
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Файл не найден на сервере');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    
    // Получаем имя файла из заголовка или используем оригинальное
    const contentDisposition = response.headers.get('Content-Disposition');
    let downloadName = `${fileName}.json`;
    
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
      if (filenameMatch) {
        try {
          downloadName = decodeURIComponent(filenameMatch[1]);
        } catch (e) {
          downloadName = filenameMatch[1];
        }
      }
    }
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    console.log('File exported successfully');
  } catch (error) {
    console.error('Ошибка экспорта:', error);
    // Показываем уведомление об ошибке
    alert(`Ошибка экспорта: ${error.message}`);
  } finally {
    setExportLoading(false);
  }
}

  // Экспорт всех файлов в ZIP
  const exportAllFiles = async () => {
    try {
      setExportLoading(true)
      const sessionId = clientId
      console.log('Exporting all files for session:', sessionId)

      const response = await fetch(
        // `http://localhost:5000/files/export-all/json` //@TODO 1json для всего в zip

        `http://localhost:5000/files/export-all?sessionId=${sessionId}`
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export_${sessionId}_${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      console.log('All files exported successfully')
    } catch (error) {
      console.error('Ошибка экспорта всех файлов:', error)
      // Можно добавить уведомление об ошибке
    } finally {
      setExportLoading(false)
    }
  }

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'blue'
      case 'processing':
        return 'orange'
      case 'completed':
        return 'green'
      case 'error':
        return 'red'
      default:
        return 'gray'
    }
  }

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <LoadingOutlined />
      case 'processing':
        return <LoadingOutlined />
      case 'completed':
        return <CheckCircleOutlined />
      case 'error':
        return <CloseCircleOutlined />
      default:
        return <LoadingOutlined />
    }
  }

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Подключено'
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

  const completedFiles = files.filter((f) => f.status === 'completed')
  const hasCompletedFiles = completedFiles.length > 0

  console.log('Current state:', {
    connectionStatus,
    files,
    completedFiles,
    hasCompletedFiles,
    showExportButtons,
  })

  // Компактный вид для свернутого состояния
  if (isMinimized) {
    return (
      <div
        style={{
          padding: '12px 16px',
          background: '#f0f8ff',
          border: '1px solid #d6e4ff',
          borderRadius: '8px',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {getStatusIcon()}
            <span style={{ fontWeight: '500' }}>
              Обработка: {progress.progress}%
            </span>
          </div>
          <Button
            type="text"
            icon={<ArrowsAltOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              onToggleMinimize?.()
            }}
          />
        </div>
        <Progress
          percent={progress.progress}
          size="small"
          style={{ marginTop: '8px' }}
          status={
            connectionStatus === 'processing'
              ? 'active'
              : connectionStatus === 'completed'
                ? 'success'
                : connectionStatus === 'error'
                  ? 'exception'
                  : 'normal'
          }
        />
      </div>
    )
  }

  // Полный вид
  return (
    <div>
      {/* Шапка с общей информацией */}
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
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {getStatusIcon()}
              <span>Обработка файлов</span>
              <Tag color={getStatusColor()}>{getStatusText()}</Tag>
            </span>
            {onToggleMinimize && (
              <Button
                type="text"
                icon={<MinusOutlined />}
                onClick={onToggleMinimize}
                title="Свернуть"
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
            status={
              connectionStatus === 'processing'
                ? 'active'
                : connectionStatus === 'completed'
                  ? 'success'
                  : connectionStatus === 'error'
                    ? 'exception'
                    : 'normal'
            }
            strokeColor={
              connectionStatus === 'completed'
                ? '#52c41a'
                : connectionStatus === 'error'
                  ? '#ff4d4f'
                  : '#1890ff'
            }
          />
        </div>

        {/* Статистика */}
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Файлов"
              value={completedFiles.length}
              suffix={`/ ${files.length}`}
              prefix={<FileTextOutlined />}
              valueStyle={{
                fontSize: '18px',
                color:
                  completedFiles.length === files.length
                    ? '#52c41a'
                    : '#1890ff',
              }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="IP адресов"
              value={progress.processedIPs}
              suffix={progress.totalIPs > 0 ? `/ ${progress.totalIPs}` : ''}
              prefix={<CloudUploadOutlined />}
              valueStyle={{ fontSize: '18px' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Успешно"
              value={progress.successful}
              valueStyle={{ color: '#52c41a', fontSize: '18px' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Ошибок"
              value={progress.failed}
              valueStyle={{
                color: progress.failed > 0 ? '#ff4d4f' : '#666',
                fontSize: '18px',
              }}
            />
          </Col>
        </Row>

        {/* Кнопки экспорта - упростим условия появления */}
        {showExportButtons &&
          connectionStatus === 'completed' &&
          hasCompletedFiles && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid #f0f0f0',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button
                    type="primary"
                    icon={<ExportOutlined />}
                    onClick={exportAllFiles}
                    loading={exportLoading}
                    size="large"
                    style={{ marginBottom: 8 }}
                  >
                    Экспортировать все файлы в ZIP
                  </Button>
                  <div style={{ color: '#666', fontSize: '12px' }}>
                    Или экспортируйте отдельные файлы ниже
                  </div>
                </Space>
              </div>
            </div>
          )}
      </Card>

      {/* Детали по файлам */}
      {files.length > 0 && (
        <Card
          title={`Обработка файлов (${files.length})`}
          size="small"
          style={{ marginBottom: 16 }}
        >
          {files.map((file, index) => (
            <div
              key={file.fileName || index}
              style={{ marginBottom: index < files.length - 1 ? 12 : 0 }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 8,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '500', marginBottom: 4 }}>
                    {file.fileName}
                  </div>
                  <Progress
                    percent={file.progress || 0}
                    size="small"
                    style={{ marginBottom: 4 }}
                    status={
                      file.status === 'processing'
                        ? 'active'
                        : file.status === 'completed'
                          ? 'success'
                          : file.status === 'error'
                            ? 'exception'
                            : 'normal'
                    }
                  />
                </div>
                <Space>
                  {showExportButtons && file.status === 'completed' && (
                    <Button
                      type="link"
                      icon={<DownloadOutlined />}
                      onClick={() => exportSingleFile(file.fileName)}
                      size="small"
                      loading={exportLoading}
                    >
                      Экспорт JSON
                    </Button>
                  )}
                  <Tag
                    color={
                      file.status === 'completed'
                        ? 'green'
                        : file.status === 'error'
                          ? 'red'
                          : 'blue'
                    }
                  >
                    {file.status === 'completed'
                      ? 'Завершён'
                      : file.status === 'error'
                        ? 'Ошибка'
                        : `${file.progress || 0}%`}
                  </Tag>
                </Space>
              </div>

              {file.result && (
                <div style={{ fontSize: '12px', color: '#666' }}>
                  Обработано IP: {file.result.successful || 0} успешно,{' '}
                  {file.result.failed || 0} с ошибками
                </div>
              )}

              {file.error && (
                <Alert
                  message={file.error}
                  type="error"
                  size="small"
                  showIcon
                  style={{ marginTop: 8 }}
                />
              )}

              {index < files.length - 1 && (
                <Divider style={{ margin: '12px 0' }} />
              )}
            </div>
          ))}
        </Card>
      )}

      {/* Сообщение об ошибке */}
      {connectionStatus === 'error' && (
        <Alert
          message="Произошла ошибка"
          description="Попробуйте перезагрузить страницу и повторить попытку."
          type="error"
          showIcon
        />
      )}

      {/* Сообщение о завершении */}
      {connectionStatus === 'completed' && (
        <Alert
          message="Обработка завершена"
          description={
            hasCompletedFiles
              ? 'Все файлы успешно обработаны. Вы можете экспортировать результаты используя кнопки выше.'
              : 'Обработка завершена, но нет файлов для экспорта.'
          }
          type="success"
          showIcon
        />
      )}
    </div>
  )
}

// import React, { useState, useEffect, useRef } from 'react'
// import {
//   Card,
//   Progress,
//   Statistic,
//   Row,
//   Col,
//   Tag,
//   Alert,
//   Spin,
//   Button,
//   Divider,
// } from 'antd'
// import {
//   FileTextOutlined,
//   CloudUploadOutlined,
//   CheckCircleOutlined,
//   CloseCircleOutlined,
//   LoadingOutlined,
//   MinusOutlined,
//   ArrowsAltOutlined,
// } from '@ant-design/icons'

// export const ProgressTracker = ({
//   clientId,
//   onComplete,
//   isMinimized = false,
//   onToggleMinimize,
//   decodeFileName = (fileName) => fileName,
// }) => {
//   const [connectionStatus, setConnectionStatus] = useState('connecting')
//   const [progress, setProgress] = useState({
//     processedIPs: 0,
//     totalIPs: 0,
//     progress: 0,
//     successful: 0,
//     failed: 0,
//   })
//   const [files, setFiles] = useState([])
//   const [currentOperation, setCurrentOperation] = useState(
//     'Подключение к серверу...'
//   )
//   const eventSourceRef = useRef(null)

//   const connectSSE = () => {
//     if (!clientId) return

//     if (eventSourceRef.current) {
//       eventSourceRef.current.close()
//     }

//     const baseUrl = 'http://localhost:5000'
//     const sseUrl = `${baseUrl}/files/progress?clientId=${clientId}`

//     const eventSource = new EventSource(sseUrl)
//     eventSourceRef.current = eventSource

//     eventSource.onopen = () => {
//       setConnectionStatus('connected')
//       setCurrentOperation('Ожидание начала обработки...')
//     }

//     eventSource.onmessage = (event) => {
//       try {
//         const data = JSON.parse(event.data)

//         switch (data.type) {
//           case 'connected':
//             setConnectionStatus('connected')
//             setCurrentOperation('Готов к обработке файлов')
//             break

//           case 'file_start':
//             setFiles((prev) => {
//               // Декодируем имя файла если оно есть
//               if (data.fileName) {
//                 data.fileName = decodeFileName(data.fileName)
//               }
//               const exists = prev.find((f) => f.fileName === data.fileName)
//               if (exists) return prev

//               return [
//                 ...prev,
//                 {
//                   fileName: data.fileName,
//                   status: 'processing',
//                   progress: 0,
//                   fileIndex: data.fileIndex,
//                 },
//               ]
//             })
//             setConnectionStatus('processing')
//             setCurrentOperation(`Обработка файла: ${data.fileName}`)
//             break

//           case 'processing_started':
//             setProgress((prev) => ({
//               ...prev,
//               totalIPs: data.totalIPs,
//               processedIPs: 0,
//               progress: 0,
//             }))
//             setCurrentOperation(`Начата обработка ${data.totalIPs} IP-адресов`)
//             break

//           case 'batch_start':
//             setProgress((prev) => ({
//               ...prev,
//               currentBatch: data.batchIndex,
//               totalBatches: data.totalBatches,
//             }))
//             setCurrentOperation(
//               `Обработка батча ${data.batchIndex} из ${data.totalBatches}`
//             )
//             break

//           case 'batch_complete':
//             setProgress((prev) => ({
//               ...prev,
//               processedIPs: data.processedIPs,
//               progress: data.progress,
//               successful: data.successful || prev.successful,
//               failed: data.failed || prev.failed,
//             }))
//             setFiles((prev) =>
//               prev.map((file) =>
//                 file.status === 'processing'
//                   ? { ...file, progress: data.progress }
//                   : file
//               )
//             )
//             setCurrentOperation(
//               `Обработано ${data.processedIPs} из ${data.totalIPs} IP (${data.progress}%)`
//             )
//             break

//           case 'file_complete':
//             setFiles((prev) =>
//               prev.map((file) =>
//                 file.fileName === data.fileName
//                   ? {
//                       ...file,
//                       status: 'completed',
//                       progress: 100,
//                       result: data.result,
//                     }
//                   : file
//               )
//             )
//             setCurrentOperation(`Файл ${data.fileName} обработан`)
//             break

//           case 'file_error':
//             setFiles((prev) =>
//               prev.map((file) =>
//                 file.fileName === data.fileName
//                   ? { ...file, status: 'error', error: data.error }
//                   : file
//               )
//             )
//             setCurrentOperation(`Ошибка обработки файла: ${data.fileName}`)
//             break

//           case 'all_complete':
//             setConnectionStatus('completed')
//             setProgress((prev) => ({ ...prev, progress: 100 }))
//             setCurrentOperation('Все файлы успешно обработаны')
//             if (onComplete) {
//               setTimeout(() => onComplete(data.processedFiles), 1000)
//             }
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
//         return <LoadingOutlined />
//       case 'processing':
//         return <LoadingOutlined />
//       case 'completed':
//         return <CheckCircleOutlined />
//       case 'error':
//         return <CloseCircleOutlined />
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
//         }}
//       >
//         <div
//           style={{
//             display: 'flex',
//             justifyContent: 'space-between',
//             alignItems: 'center',
//           }}
//         >
//           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//             {getStatusIcon()}
//             <span style={{ fontWeight: '500' }}>
//               Обработка: {progress.progress}%
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
//           style={{ marginTop: '8px' }}
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
//       </div>
//     )
//   }

//   // Полный вид
//   return (
//     <div>
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
//               {getStatusIcon()}
//               <span>Обработка файлов</span>
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
//           />
//         </div>

//         {/* Статистика */}
//         <Row gutter={16}>
//           <Col span={6}>
//             <Statistic
//               title="Файлов"
//               value={files.filter((f) => f.status === 'completed').length}
//               suffix={`/ ${files.length}`}
//               prefix={<FileTextOutlined />}
//               valueStyle={{
//                 fontSize: '18px',
//                 color:
//                   files.filter((f) => f.status === 'completed').length ===
//                   files.length
//                     ? '#52c41a'
//                     : '#1890ff',
//               }}
//             />
//           </Col>
//           <Col span={6}>
//             <Statistic
//               title="IP адресов"
//               value={progress.processedIPs}
//               suffix={progress.totalIPs > 0 ? `/ ${progress.totalIPs}` : ''}
//               prefix={<CloudUploadOutlined />}
//               valueStyle={{ fontSize: '18px' }}
//             />
//           </Col>
//           <Col span={6}>
//             <Statistic
//               title="Успешно"
//               value={progress.successful}
//               valueStyle={{ color: '#52c41a', fontSize: '18px' }}
//             />
//           </Col>
//           <Col span={6}>
//             <Statistic
//               title="Ошибок"
//               value={progress.failed}
//               valueStyle={{
//                 color: progress.failed > 0 ? '#ff4d4f' : '#666',
//                 fontSize: '18px',
//               }}
//             />
//           </Col>
//         </Row>
//       </Card>

//       {/* Детали по файлам */}
//       {files.length > 0 && (
//         <Card
//           title={`Обработка файлов (${files.length})`}
//           size="small"
//           style={{ marginBottom: 16 }}
//         >
//           {files.map((file, index) => (
//             <div
//               key={file.fileName}
//               style={{ marginBottom: index < files.length - 1 ? 12 : 0 }}
//             >
//               <div
//                 style={{
//                   display: 'flex',
//                   justifyContent: 'space-between',
//                   alignItems: 'flex-start',
//                   marginBottom: 8,
//                 }}
//               >
//                 <div style={{ flex: 1 }}>
//                   <div style={{ fontWeight: '500', marginBottom: 4 }}>
//                     {file.fileName}
//                   </div>
//                   <Progress
//                     percent={file.progress}
//                     size="small"
//                     style={{ marginBottom: 4 }}
//                     status={
//                       file.status === 'processing'
//                         ? 'active'
//                         : file.status === 'completed'
//                           ? 'success'
//                           : 'exception'
//                     }
//                   />
//                 </div>
//                 <Tag
//                   color={
//                     file.status === 'completed'
//                       ? 'green'
//                       : file.status === 'error'
//                         ? 'red'
//                         : 'blue'
//                   }
//                   style={{ marginLeft: 12 }}
//                 >
//                   {file.status === 'completed'
//                     ? 'Завершён'
//                     : file.status === 'error'
//                       ? 'Ошибка'
//                       : `${file.progress}%`}
//                 </Tag>
//               </div>

//               {file.result && (
//                 <div style={{ fontSize: '12px', color: '#666' }}>
//                   Обработано IP: {file.result.successful || 0} успешно,{' '}
//                   {file.result.failed || 0} с ошибками
//                 </div>
//               )}

//               {file.error && (
//                 <Alert
//                   message={file.error}
//                   type="error"
//                   size="small"
//                   showIcon
//                   style={{ marginTop: 8 }}
//                 />
//               )}

//               {index < files.length - 1 && (
//                 <Divider style={{ margin: '12px 0' }} />
//               )}
//             </div>
//           ))}
//         </Card>
//       )}

//       {/* Сообщение об ошибке */}
//       {connectionStatus === 'error' && (
//         <Alert
//           message="Произошла ошибка"
//           description="Попробуйте перезагрузить страницу и повторить попытку."
//           type="error"
//           showIcon
//         />
//       )}

//       {/* Сообщение о завершении */}
//       {connectionStatus === 'completed' && (
//         <Alert
//           message="Обработка завершена"
//           description="Все файлы успешно обработаны. Окно закроется автоматически через несколько секунд."
//           type="success"
//           showIcon
//         />
//       )}
//     </div>
//   )
// }
