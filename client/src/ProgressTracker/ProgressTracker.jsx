import { useState, useEffect, useRef } from 'react'
import {
  Card,
  Progress,
  Statistic,
  Row,
  Col,
  Tag,
  Alert,
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

const EVENT_TYPES = {
  CONNECTED: 'connected',
  PROCESSING_STARTED: 'processing_started',
  BATCH_START: 'batch_start',
  BATCH_COMPLETE: 'batch_complete',
  FILE_START: 'file_start',
  FILES_START: 'files_start',
  FILE_COMPLETE: 'file_complete',
  FILE_ERROR: 'file_error',
  PROCESSING_COMPLETED: 'processing_completed',
  ALL_COMPLETE: 'all_complete',
  PROCESSING_ERROR: 'processing_error',
}

export const ProgressTracker = ({
  clientId,
  onComplete,
  filesCount,
  fileList = [], // Принимаем список файлов из родителя
  isMinimized = false,
  onToggleMinimize,
  decodeFileName = (fileName) => fileName,
  showExportButtons = true,
}) => {
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const sessionIdRef = useRef(null)

  const [progress, setProgress] = useState({
    processedIPs: 0,
    totalIPs: 0,
    progress: 0,
    successful: 0,
    failed: 0,
    currentBatch: 0,
    totalBatches: 0,
    totalFiles: 0,
    processedFiles: 0,
  })

  const [files, setFiles] = useState([])
  const [currentOperation, setCurrentOperation] = useState(
    'Подключение к серверу...'
  )
  const [exportLoading, setExportLoading] = useState(false)
  const eventSourceRef = useRef(null)

  const progressCountersRef = useRef({
    filesTotal: 0,
    filesProcessed: 0,
    filesCompleted: 0,
    filesError: 0,
    ipTotal: 0,
    ipProcessed: 0,
    ipSuccessful: 0,
    ipFailed: 0,
    batchCurrent: 0,
    batchTotal: 0,
  })

  // Инициализируем файлы при получении данных из родительского компонента
  useEffect(() => {
    if (fileList && fileList.length > 0) {
      // Создаем список файлов с декодированными именами
      const initialFiles = fileList.map((file, index) => {
        const fileName = file.name || file.fileName || `Файл ${index + 1}`
        const decodedName = decodeFileName(fileName)

        return {
          fileName: decodedName,
          originalFileName: fileName,
          status: 'pending',
          fileIndex: index + 1,
          stats: {
            totalIPs: 0,
            processedIPs: 0,
            successful: 0,
            failed: 0,
            progress: 0,
          },
        }
      })

      setFiles(initialFiles)
      setProgress((prev) => ({
        ...prev,
        totalFiles: initialFiles.length,
        processedFiles: 0,
      }))

      progressCountersRef.current.filesTotal = initialFiles.length
    } else if (filesCount && filesCount > 0 && files.length === 0) {
      // Если нет списка файлов, но есть количество
      const initialFiles = Array.from({ length: filesCount }, (_, index) => ({
        fileName: `Файл ${index + 1}`,
        status: 'pending',
        fileIndex: index + 1,
        stats: {
          totalIPs: 0,
          processedIPs: 0,
          successful: 0,
          failed: 0,
          progress: 0,
        },
      }))

      setFiles(initialFiles)
      setProgress((prev) => ({
        ...prev,
        totalFiles: filesCount,
        processedFiles: 0,
      }))

      progressCountersRef.current.filesTotal = filesCount
    }
  }, [fileList, filesCount, decodeFileName])

  function calculateTotals(processedFiles) {
    const totals = {
      total: 0,
      successful: 0,
      failed: 0,
    }

    processedFiles.forEach((file) => {
      if (file.result) {
        totals.total += file.result.total || 0
        totals.successful += file.result.successful || 0
        totals.failed += file.result.failed || 0
      }
    })

    return totals
  }

  const connectSSE = () => {
    if (!clientId) return

    if (!sessionIdRef.current) {
      sessionIdRef.current = clientId
    }

    const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
    const sseUrl = `${baseUrl}/files/progress?clientId=${sessionIdRef.current}`

    const eventSource = new EventSource(sseUrl)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setConnectionStatus('')
      setCurrentOperation('Ожидание начала обработки...')
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('SSE Event:', data)

        switch (data.type) {
          case EVENT_TYPES.CONNECTED:
            setConnectionStatus(EVENT_TYPES.CONNECTED)
            setCurrentOperation('Готов к обработке файлов')
            break

          case EVENT_TYPES.FILES_START:
            const totalFiles = data.totalFiles || files.length || 0
            progressCountersRef.current.filesTotal = totalFiles

            // Обновляем файлы с правильными именами, если они пришли с сервера
            if (data.fileNames && Array.isArray(data.fileNames)) {
              setFiles((prev) => {
                return data.fileNames.map((fileName, index) => {
                  const decodedName = decodeFileName(fileName)
                  const existingFile = prev.find(
                    (f) => f.fileIndex === index + 1
                  )

                  if (existingFile) {
                    return {
                      ...existingFile,
                      fileName: decodedName,
                      originalFileName: fileName,
                      status: 'pending',
                    }
                  }

                  // Если файла еще нет, создаем новый
                  return {
                    fileName: decodedName,
                    originalFileName: fileName,
                    status: 'pending',
                    fileIndex: index + 1,
                    stats: {
                      totalIPs: 0,
                      processedIPs: 0,
                      successful: 0,
                      failed: 0,
                      progress: 0,
                    },
                  }
                })
              })
            }

            setCurrentOperation(`Начата обработка ${totalFiles} файлов`)
            setProgress((prev) => ({
              ...prev,
              totalFiles: totalFiles,
            }))
            break

          case EVENT_TYPES.FILE_START:
            const decodedFileName = decodeFileName(data.fileName)

            setFiles((prev) => {
              return prev.map((file) => {
                // Ищем файл по оригинальному имени или индексу
                if (
                  file.originalFileName === data.fileName ||
                  file.fileName === decodedFileName ||
                  file.fileIndex === data.fileIndex
                ) {
                  return {
                    ...file,
                    fileName: decodedFileName,
                    originalFileName: data.fileName,
                    status: 'processing',
                    fileIndex: data.fileIndex || file.fileIndex,
                  }
                }
                return file
              })
            })

            progressCountersRef.current.filesProcessed++
            setConnectionStatus('processing')
            setCurrentOperation(`Начата обработка файла: ${decodedFileName}`)

            setProgress((prev) => ({
              ...prev,
              processedFiles: progressCountersRef.current.filesProcessed,
            }))
            break

          case EVENT_TYPES.PROCESSING_STARTED:
            setProgress((prev) => ({
              ...prev,
              totalIPs: data.totalIPs || 0,
            }))
            break

          // case EVENT_TYPES.BATCH_START:
          //   const fileNameFromBatch = decodeFileName(data.fileName)

          //   setFiles((prev) => {
          //     return prev.map((file) => {
          //       if (
          //         file.originalFileName === data.fileName ||
          //         file.fileName === fileNameFromBatch ||
          //         file.fileIndex === data.fileIndex
          //       ) {
          //         return {
          //           ...file,
          //           fileName: fileNameFromBatch,
          //           originalFileName: data.fileName,
          //           status: 'processing',
          //           fileIndex: data.fileIndex || file.fileIndex,
          //         }
          //       }
          //       return file
          //     })
          //   })

          //   setProgress((prev) => ({
          //     ...prev,
          //     currentBatch: data.batchIndex || 0,
          //     totalBatches: data.totalBatches || 0,
          //   }))

          //   setCurrentOperation(
          //     `Начат батч ${data.batchIndex || 0} из ${data.totalBatches || 0}`
          //   )
          //   break
          case EVENT_TYPES.BATCH_START:
            // Если файл еще не добавлен через FILE_START, добавляем его здесь
            const fileNameFromBatch = decodeFileName(data.fileName)

            setFiles((prev) => {
              const exists = prev.find((f) => f.fileName === fileNameFromBatch)
              if (exists) return prev

              return [
                ...prev,
                {
                  fileName: fileNameFromBatch,
                  status: 'processing',
                  // progress: 0,
                  fileIndex: data.fileIndex || 0,
                  originalFileName: data.fileName,
                  stats: {
                    totalIPs: 0,
                    processedIPs: 0,
                    successful: 0,
                    failed: 0,
                    progress: 0,
                  },
                },
              ]
            })

            // Обновляем информацию о батчах
            setProgress((prev) => ({
              ...prev,
              currentBatch: data.batchIndex || 0,
              totalBatches: data.totalBatches || 0,
            }))

            setCurrentOperation(
              `Начат батч ${data.batchIndex || 0} из ${data.totalBatches || 0}`
            )
            break

          case EVENT_TYPES.BATCH_COMPLETE:
            // Обновляем статистику файла
            const currentFileName = decodeFileName(data.fileName)
            console.log('currentFileName > ', currentFileName)
            setFiles((prev) =>
              prev.map((file) =>
                file.fileName === currentFileName
                  ? {
                      ...file,
                      // progress: data.progress || 0,
                      stats: {
                        totalIPs: data.totalIPs || 0,
                        processedIPs: data.processedIPs || 0,
                        successful: data.successful || 0,
                        failed: data.failed || 0,
                        progress: data.progress || 0,
                      },
                    }
                  : file
              )
            )

            const newSuccessful = progress.successful + (data.successful || 0)
            const newFailed = progress.failed + (data.failed || 0)

            setProgress((prev) => ({
              ...prev,
              processedIPs: prev.processedIPs +  data.processedIPs,
              successful: prev.successful + (data.successful || 0),
              // successful: newSuccessful,
              // failed: newFailed,
              failed: prev.failed + (data.failed || 0),
              // progress: Math.round(progress.processedIPs / prev.totalIPs) * 100,
              progress: prev.progress + Math.round(prev.processedIPs + data.processedIPs / prev.totalIPs) * 100,
              currentBatch: data.batchIndex || 0,
              totalBatches: data.totalBatches || 0,
            }))

            setCurrentOperation(
              `Обработано ${data.processedIPs || 0} из ${data.totalIPs || 0} IP (${data.progress || 0}%)`
            )
            break

          case EVENT_TYPES.PROCESSING_COMPLETED:
            const completedFileName = decodeFileName(data.fileName)
            setFiles((prev) =>
              prev.map((file) =>
                file.originalFileName === data.fileName ||
                file.fileName === completedFileName
                  ? {
                      ...file,
                      stats: {
                        totalIPs: data.total || 0,
                        processedIPs: data.total || 0,
                        successful: data.successful || 0,
                        failed: data.failed || 0,
                        progress: 100,
                      },
                    }
                  : file
              )
            )

            setProgress((prev) => ({
              ...prev,
              processedIPs: data.total || 0,
              successful: data.successful || 0,
              failed: data.failed || 0,
              // progress: 100,
            }))
            break

          case EVENT_TYPES.FILE_COMPLETE:
            progressCountersRef.current.filesCompleted++

            setFiles((prev) =>
              prev.map((file) =>
                file.originalFileName === data.fileName ||
                file.fileName === decodeFileName(data.fileName)
                  ? {
                      ...file,
                      status: 'completed',
                      result: data.result,
                      stats: {
                        totalIPs: data.result?.total || 0,
                        processedIPs: data.result?.total || 0,
                        successful: data.result?.successful || 0,
                        failed: data.result?.failed || 0,
                        progress: 100,
                      },
                    }
                  : file
              )
            )

            setCurrentOperation(
              `Файл ${decodeFileName(data.fileName)} обработан`
            )

            setProgress((prev) => ({
              ...prev,
              processedFiles: progressCountersRef.current.filesProcessed,
            }))
            break

          case EVENT_TYPES.FILE_ERROR:
            progressCountersRef.current.filesError++

            setFiles((prev) =>
              prev.map((file) =>
                file.originalFileName === data.fileName ||
                file.fileName === decodeFileName(data.fileName)
                  ? {
                      ...file,
                      status: 'error',
                      error: data.error,
                      stats: {
                        ...file.stats,
                        progress: 0,
                      },
                    }
                  : file
              )
            )
            setCurrentOperation(
              `Ошибка обработки файла: ${decodeFileName(data.fileName)}`
            )
            break

          case EVENT_TYPES.ALL_COMPLETE:
            setConnectionStatus('completed')

            const result = calculateTotals(
              data.processedFiles.filter((f) => f.result)
            )

            setProgress((prev) => ({
              ...prev,
              progress: 100,
              processedFiles: files.length,
              processedIPs: result.total,
              totalIPs: result.total,
              successful: result.successful,
              failed: result.failed,
            }))
            setCurrentOperation('Все файлы успешно обработаны')
            onComplete?.()
            break

          case EVENT_TYPES.PROCESSING_ERROR:
            setConnectionStatus('error')
            setCurrentOperation(`Ошибка обработки: ${data.error}`)
            break
        }
      } catch (error) {
        console.error('Ошибка обработки события:', error)
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE Error:', error)
      if (eventSource.readyState === EventSource.CLOSED) {
        setConnectionStatus('error')
        setCurrentOperation('Ошибка соединения с сервером')
      }
    }
  }

  useEffect(() => {
    if (clientId) {
      connectSSE()

      const cleanupOnUnload = async () => {
        try {
          await fetch(
            `http://localhost:5000/files/cleanup-session/${clientId}`,
            {
              method: 'DELETE',
            }
          )
        } catch (error) {
          console.error('Ошибка при очистке сессии:', error)
        }
      }

      window.addEventListener('beforeunload', cleanupOnUnload)

      return () => {
        window.removeEventListener('beforeunload', cleanupOnUnload)
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
        }
        cleanupOnUnload()
      }
    }
  }, [clientId])

  const exportSingleFile = async (fileName) => {
    try {
      setExportLoading(true)
      console.log('Exporting file:', fileName)

      const fileToExport = files.find((f) => f.fileName === fileName)
      const exportName = fileToExport?.originalFileName || fileName

      const response = await fetch(
        `http://localhost:5000/files/export/${encodeURIComponent(exportName)}`
      )

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Файл не найден на сервере')
        }
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('Content-Disposition')
      let downloadName = `${fileName}_export.json`

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
        if (filenameMatch) {
          downloadName = filenameMatch[1]
        }
      }

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      console.log('File exported successfully')
    } catch (error) {
      console.error('Ошибка экспорта:', error)
      alert(`Ошибка экспорта: ${error.message}`)
    } finally {
      setExportLoading(false)
    }
  }

  const exportAllFiles = async () => {
    try {
      setExportLoading(true)
      const sessionId = sessionIdRef.current || clientId
      console.log('Exporting all files for session:', sessionId)

      const checkResponse = await fetch(
        `http://localhost:5000/files/check-session/${sessionId}`
      )

      const checkData = await checkResponse.json()

      if (!checkData.exists) {
        throw new Error(
          'Сессия не найдена. Возможно, файлы уже были экспортированы и удалены.'
        )
      }

      if (checkData.fileCount === 0) {
        throw new Error('В сессии нет файлов для экспорта')
      }

      const response = await fetch(
        `http://localhost:5000/files/export-all?sessionId=${sessionId}`
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export_session_${sessionId}_${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      console.log('Все файлы сессии экспортированы успешно')
    } catch (error) {
      console.error('Ошибка экспорта всех файлов:', error)
      alert(`Ошибка экспорта: ${error.message}`)
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

  return (
    <div>
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

        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Файлов"
              value={files.length}
              suffix={progress.totalFiles > 0 ? `/ ${progress.totalFiles}` : ''}
              prefix={<FileTextOutlined />}
              valueStyle={{
                fontSize: '18px',
                color:
                  files.filter((f) => f.status === 'completed').length ===
                    files.length && files.length > 0
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

      {files.length > 0 && (
        <Card
          title={`Обработка файлов (${files.length})`}
          size="small"
          style={{ marginBottom: 16 }}
        >
          {files.map((file, index) => (
            <div
              key={file.fileName || file.fileIndex || index}
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
                    percent={file.stats?.progress || 0}
                    size="small"
                    style={{ marginBottom: 4 }}
                    status={
                      file.status === 'processing'
                        ? 'active'
                        : file.status === 'completed'
                          ? 'success'
                          : file.status === 'error'
                            ? 'exception'
                            : file.status === 'pending'
                              ? 'normal'
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
                          : file.status === 'processing'
                            ? 'blue'
                            : 'default'
                    }
                  >
                    {file.status === 'completed'
                      ? 'Завершён'
                      : file.status === 'error'
                        ? 'Ошибка'
                        : file.status === 'processing'
                          ? `${file.stats?.progress || 0}%`
                          : 'Ожидание'}
                  </Tag>
                </Space>
              </div>

              {file.stats && (
                <Row
                  gutter={8}
                  style={{ fontSize: '12px', color: '#666', marginTop: 4 }}
                >
                  <Col span={6}>
                    IP: {file.stats.processedIPs}/{file.stats.totalIPs}
                  </Col>
                  <Col span={6} style={{ color: '#52c41a' }}>
                    Успешно: {file.stats.successful}
                  </Col>
                  <Col
                    span={6}
                    style={{
                      color: file.stats.failed > 0 ? '#ff4d4f' : '#666',
                    }}
                  >
                    Ошибок: {file.stats.failed}
                  </Col>
                  <Col span={6}>Прогресс: {file.stats.progress}%</Col>
                </Row>
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

      {connectionStatus === 'error' && (
        <Alert
          message="Произошла ошибка"
          description="Попробуйте перезагрузить страницу и повторить попытку."
          type="error"
          showIcon
        />
      )}

      {connectionStatus === 'completed' && (
        <Alert
          message="Обработка завершена"
          description={
            hasCompletedFiles
              ? `Обработано ${completedFiles.length} файлов, ${progress.successful} IP адресов успешно. Вы можете экспортировать результаты.`
              : 'Обработка завершена, но нет файлов для экспорта.'
          }
          type="success"
          showIcon
        />
      )}
    </div>
  )
}

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
//   Divider,
//   Space,
// } from 'antd'
// import {
//   FileTextOutlined,
//   CloudUploadOutlined,
//   CheckCircleOutlined,
//   CloseCircleOutlined,
//   LoadingOutlined,
//   MinusOutlined,
//   ArrowsAltOutlined,
//   DownloadOutlined,
//   ExportOutlined,
// } from '@ant-design/icons'
// import { ROUTES } from '../routes'

// const EVENT_TYPES = {
//   CONNECTED: 'connected',
//   PROCESSING_STARTED: 'processing_started',
//   BATCH_START: 'batch_start',
//   BATCH_COMPLETE: 'batch_complete',
//   FILE_START: 'file_start',
//   FILES_START: 'files_start',
//   FILE_COMPLETE: 'file_complete',
//   FILE_ERROR: 'file_error',
//   PROCESSING_COMPLETED: 'processing_completed',
//   ALL_COMPLETE: 'all_complete',
//   PROCESSING_ERROR: 'processing_error',
// }

// export const ProgressTracker = ({
//   clientId,
//   onComplete,
//   filesCount,
//   isMinimized = false,
//   onToggleMinimize,
//   decodeFileName = (fileName) => fileName,
//   showExportButtons = true,
// }) => {
//   const [connectionStatus, setConnectionStatus] = useState('connecting')
//   const sessionIdRef = useRef(null)

//   const [progress, setProgress] = useState({
//     processedIPs: 0,
//     totalIPs: 0,
//     progress: 0,
//     successful: 0,
//     failed: 0,
//     currentBatch: 0,
//     totalBatches: 0,
//     totalFiles: 0,
//     processedFiles: 0,
//   })

//   const [files, setFiles] = useState([])
//   const [currentOperation, setCurrentOperation] = useState(
//     'Подключение к серверу...'
//   )
//   const [exportLoading, setExportLoading] = useState(false)
//   const eventSourceRef = useRef(null)

//   const progressCountersRef = useRef({
//     filesTotal: 0,
//     filesProcessed: 0,
//     filesCompleted: 0,
//     filesError: 0,
//     ipTotal: 0,
//     ipProcessed: 0,
//     ipSuccessful: 0,
//     ipFailed: 0,
//     batchCurrent: 0,
//     batchTotal: 0,
//   })

//   function calculateTotals(processedFiles) {
//     const totals = {
//       total: 0,
//       successful: 0,
//       failed: 0,
//     }

//     processedFiles.forEach((file) => {
//       if (file.result) {
//         totals.total += file.result.total || 0
//         totals.successful += file.result.successful || 0
//         totals.failed += file.result.failed || 0
//       }
//     })

//     return totals
//   }

//   const connectSSE = () => {
//     if (!clientId) return

//     if (!sessionIdRef.current) {
//       sessionIdRef.current = clientId
//     }

//     const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
//     const sseUrl = `${baseUrl}/files/progress?clientId=${sessionIdRef.current}`

//     const eventSource = new EventSource(sseUrl)
//     eventSourceRef.current = eventSource

//     eventSource.onopen = () => {
//       setConnectionStatus('')
//       setCurrentOperation('Ожидание начала обработки...')
//       // Сбрасываем состояние
//       setFiles([])
//       progressCountersRef.current = {
//         filesTotal: 0,
//         filesProcessed: 0,
//         filesCompleted: 0,
//         filesError: 0,
//         ipTotal: 0,
//         ipProcessed: 0,
//         ipSuccessful: 0,
//         ipFailed: 0,
//         batchCurrent: 0,
//         batchTotal: 0,
//       }
//     }

//     eventSource.onmessage = (event) => {
//       try {
//         const data = JSON.parse(event.data)
//         console.log('SSE Event:', data)

//         switch (data.type) {
//           case EVENT_TYPES.CONNECTED:
//             setConnectionStatus(EVENT_TYPES.CONNECTED)
//             setCurrentOperation('Готов к обработке файлов')
//             break

//           case EVENT_TYPES.FILES_START:
//             progressCountersRef.current.filesTotal = data.totalFiles || 0
//             setCurrentOperation(`Начата обработка ${data.totalFiles} файлов`)
//             setProgress((prev) => ({
//               ...prev,
//               totalFiles: data.totalFiles || 0,
//             }))
//             break

//           case EVENT_TYPES.FILE_START:
//             const decodedFileName = decodeFileName(data.fileName)
//             setFiles((prev) => {
//               const exists = prev.find((f) => f.fileName === decodedFileName)
//               if (exists) return prev

//               return [
//                 ...prev,
//                 {
//                   fileName: decodedFileName,
//                   status: 'processing',
//                   // progress: 0,
//                   fileIndex: data.fileIndex,
//                   originalFileName: data.fileName,
//                   stats: {
//                     totalIPs: 0,
//                     processedIPs: 0,
//                     successful: 0,
//                     failed: 0,
//                     progress: 0,
//                   },
//                 },
//               ]
//             })

//             progressCountersRef.current.filesProcessed++
//             setConnectionStatus('processing')
//             setCurrentOperation(`Начата обработка файла: ${decodedFileName}`)

//             setProgress((prev) => ({
//               ...prev,
//               processedFiles: progressCountersRef.current.filesProcessed,
//               totalFiles: progressCountersRef.current.filesTotal,
//             }))
//             break

//           case EVENT_TYPES.PROCESSING_STARTED:
//             setProgress((prev) => ({
//               ...prev,
//               totalIPs: data.totalIPs || 0,
//             }))
//             break

//           case EVENT_TYPES.BATCH_START:
//             // Если файл еще не добавлен через FILE_START, добавляем его здесь
//             const fileNameFromBatch = decodeFileName(data.fileName)

//             setFiles((prev) => {
//               const exists = prev.find((f) => f.fileName === fileNameFromBatch)
//               if (exists) return prev

//               return [
//                 ...prev,
//                 {
//                   fileName: fileNameFromBatch,
//                   status: 'processing',
//                   // progress: 0,
//                   fileIndex: data.fileIndex || 0,
//                   originalFileName: data.fileName,
//                   stats: {
//                     totalIPs: 0,
//                     processedIPs: 0,
//                     successful: 0,
//                     failed: 0,
//                     progress: 0,
//                   },
//                 },
//               ]
//             })

//             // Обновляем информацию о батчах
//             setProgress((prev) => ({
//               ...prev,
//               currentBatch: data.batchIndex || 0,
//               totalBatches: data.totalBatches || 0,
//             }))

//             setCurrentOperation(
//               `Начат батч ${data.batchIndex || 0} из ${data.totalBatches || 0}`
//             )
//             break

//           case EVENT_TYPES.BATCH_COMPLETE:
//             // Обновляем статистику файла
//             const currentFileName = decodeFileName(data.fileName)
//             console.log('currentFileName > ', currentFileName)
//             setFiles((prev) =>
//               prev.map((file) =>
//                 file.fileName === currentFileName
//                   ? {
//                       ...file,
//                       // progress: data.progress || 0,
//                       stats: {
//                         // totalIPs: data.totalIPs || 0,
//                         processedIPs: data.processedIPs || 0,
//                         successful: data.successful || 0,
//                         failed: data.failed || 0,
//                         progress: data.progress || 0,
//                       },
//                     }
//                   : file
//               )
//             )

//             // Обновляем общую статистику
//             const newProcessedIPs =
//               progress.processedIPs + (data.processedIPs || 0)
//             const newSuccessful = progress.successful + (data.successful || 0)
//             const newFailed = progress.failed + (data.failed || 0)

//             // Вычисляем общий прогресс
//             // const totalIPs = data.totalIPs || progress.totalIPs
//             // const overallProgress =
//             //   totalIPs > 0 ? (Math.round(progress.processedIPs / prev.totalIPs) * 100) : 0

//             setProgress((prev) => ({
//               ...prev,
//               processedIPs: progress.processedIPs,
//               // processedIPs: newProcessedIPs,
//               // totalIPs: Math.max(prev.totalIPs, data.totalIPs || 0),
//               // progress: overallProgress,
//               successful: newSuccessful,
//               failed: newFailed,
//               progress: Math.round(progress.processedIPs / prev.totalIPs) * 100,
//               currentBatch: data.batchIndex || 0,
//               totalBatches: data.totalBatches || 0,
//             }))

//             setCurrentOperation(
//               `Обработано ${data.processedIPs || 0} из ${data.totalIPs || 0} IP (${data.progress || 0}%)`
//             )
//             break

//           case EVENT_TYPES.PROCESSING_COMPLETED:
//             // Обновляем статистику для текущего файла
//             const completedFileName = decodeFileName(data.fileName)
//             setFiles((prev) =>
//               prev.map((file) =>
//                 file.fileName === completedFileName
//                   ? {
//                       ...file,
//                       // progress: 100,
//                       stats: {
//                         totalIPs: data.total || 0,
//                         processedIPs: data.total || 0,
//                         successful: data.successful || 0,
//                         failed: data.failed || 0,
//                         progress: 100,
//                       },
//                     }
//                   : file
//               )
//             )

//             // Обновляем общую статистику
//             setProgress((prev) => ({
//               ...prev,
//               processedIPs: data.total || 0,
//               // totalIPs: data.total || 0,
//               successful: data.successful || 0,
//               failed: data.failed || 0,
//               progress: 100,
//             }))
//             break

//           case EVENT_TYPES.FILE_COMPLETE:
//             progressCountersRef.current.filesCompleted++

//             setFiles((prev) =>
//               prev.map((file) =>
//                 file.fileName === decodeFileName(data.fileName)
//                   ? {
//                       ...file,
//                       status: 'completed',
//                       // progress: 100,
//                       result: data.result,
//                       stats: {
//                         totalIPs: data.result?.total || 0,
//                         processedIPs: data.result?.total || 0,
//                         successful: data.result?.successful || 0,
//                         failed: data.result?.failed || 0,
//                         progress: 100,
//                       },
//                     }
//                   : file
//               )
//             )

//             setCurrentOperation(
//               `Файл ${decodeFileName(data.fileName)} обработан`
//             )

//             setProgress((prev) => ({
//               ...prev,
//               processedFiles: progressCountersRef.current.filesProcessed,
//               totalFiles: progressCountersRef.current.filesTotal,
//             }))
//             break

//           case EVENT_TYPES.FILE_ERROR:
//             progressCountersRef.current.filesError++

//             setFiles((prev) =>
//               prev.map((file) =>
//                 file.fileName === decodeFileName(data.fileName)
//                   ? {
//                       ...file,
//                       status: 'error',
//                       error: data.error,
//                       progress: 0,
//                     }
//                   : file
//               )
//             )
//             setCurrentOperation(
//               `Ошибка обработки файла: ${decodeFileName(data.fileName)}`
//             )
//             break

//           case EVENT_TYPES.ALL_COMPLETE:
//             setConnectionStatus('completed')

//             const result = calculateTotals(
//               data.processedFiles.filter((f) => f.result)
//             )

//             setProgress((prev) => ({
//               ...prev,
//               progress: 100,
//               processedFiles: files.length,
//               processedIPs: result.total,
//               totalIPs: result.total,
//               successful: result.successful,
//               failed: result.failed,
//             }))
//             setCurrentOperation('Все файлы успешно обработаны')
//             onComplete?.()
//             break

//           case EVENT_TYPES.PROCESSING_ERROR:
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

//       const cleanupOnUnload = async () => {
//         try {
//           await fetch(
//             `http://localhost:5000/files/cleanup-session/${clientId}`,
//             {
//               method: 'DELETE',
//             }
//           )
//         } catch (error) {
//           console.error('Ошибка при очистке сессии:', error)
//         }
//       }

//       window.addEventListener('beforeunload', cleanupOnUnload)

//       return () => {
//         window.removeEventListener('beforeunload', cleanupOnUnload)
//         if (eventSourceRef.current) {
//           eventSourceRef.current.close()
//         }
//         cleanupOnUnload()
//       }
//     }
//   }, [clientId])

//   const exportSingleFile = async (fileName) => {
//     try {
//       setExportLoading(true)
//       console.log('Exporting file:', fileName)

//       const fileToExport = files.find((f) => f.fileName === fileName)
//       const exportName = fileToExport?.originalFileName || fileName

//       const response = await fetch(
//         `http://localhost:5000/files/export/${encodeURIComponent(exportName)}`
//       )

//       if (!response.ok) {
//         if (response.status === 404) {
//           throw new Error('Файл не найден на сервере')
//         }
//         throw new Error(`HTTP error! status: ${response.status}`)
//       }

//       const blob = await response.blob()
//       const contentDisposition = response.headers.get('Content-Disposition')
//       let downloadName = `${fileName}_export.json`

//       if (contentDisposition) {
//         const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
//         if (filenameMatch) {
//           downloadName = filenameMatch[1]
//         }
//       }

//       const url = window.URL.createObjectURL(blob)
//       const a = document.createElement('a')
//       a.href = url
//       a.download = downloadName
//       document.body.appendChild(a)
//       a.click()
//       window.URL.revokeObjectURL(url)
//       document.body.removeChild(a)

//       console.log('File exported successfully')
//     } catch (error) {
//       console.error('Ошибка экспорта:', error)
//       alert(`Ошибка экспорта: ${error.message}`)
//     } finally {
//       setExportLoading(false)
//     }
//   }

//   const exportAllFiles = async () => {
//     try {
//       setExportLoading(true)
//       const sessionId = sessionIdRef.current || clientId
//       console.log('Exporting all files for session:', sessionId)

//       const checkResponse = await fetch(
//         `http://localhost:5000/files/check-session/${sessionId}`
//       )

//       const checkData = await checkResponse.json()

//       if (!checkData.exists) {
//         throw new Error(
//           'Сессия не найдена. Возможно, файлы уже были экспортированы и удалены.'
//         )
//       }

//       if (checkData.fileCount === 0) {
//         throw new Error('В сессии нет файлов для экспорта')
//       }

//       const response = await fetch(
//         `http://localhost:5000/files/export-all?sessionId=${sessionId}`
//       )

//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`)
//       }

//       const blob = await response.blob()
//       const url = window.URL.createObjectURL(blob)
//       const a = document.createElement('a')
//       a.href = url
//       a.download = `export_session_${sessionId}_${Date.now()}.zip`
//       document.body.appendChild(a)
//       a.click()
//       window.URL.revokeObjectURL(url)
//       document.body.removeChild(a)

//       console.log('Все файлы сессии экспортированы успешно')
//     } catch (error) {
//       console.error('Ошибка экспорта всех файлов:', error)
//       alert(`Ошибка экспорта: ${error.message}`)
//     } finally {
//       setExportLoading(false)
//     }
//   }

//   const exportAllFilesFromDB = async () => {
//     try {
//       setExportLoading(true)

//       const response = await fetch(`http://localhost:5000/files/export-all-db`)

//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`)
//       }

//       const blob = await response.blob()
//       const url = window.URL.createObjectURL(blob)
//       const a = document.createElement('a')
//       a.href = url
//       a.download = `export_all_database_${Date.now()}.zip`
//       document.body.appendChild(a)
//       a.click()
//       window.URL.revokeObjectURL(url)
//       document.body.removeChild(a)

//       console.log('Все файлы из БД экспортированы успешно')
//     } catch (error) {
//       console.error('Ошибка экспорта всех файлов из БД:', error)
//       alert(`Ошибка экспорта: ${error.message}`)
//     } finally {
//       setExportLoading(false)
//     }
//   }

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

//   const completedFiles = files.filter((f) => f.status === 'completed')
//   const hasCompletedFiles = completedFiles.length > 0

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

//   return (
//     <div>
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

//         <Row gutter={16}>
//           <Col span={6}>
//             <Statistic
//               title="Файлов"
//               value={files.length}
//               suffix={progress.totalFiles > 0 ? `/ ${progress.totalFiles}` : ''}
//               prefix={<FileTextOutlined />}
//               valueStyle={{
//                 fontSize: '18px',
//                 color:
//                   files.filter((f) => f.status === 'completed').length ===
//                     files.length && files.length > 0
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

//         {progress.totalBatches > 0 && (
//           <div
//             style={{
//               marginTop: 12,
//               paddingTop: 12,
//               borderTop: '1px solid #f0f0f0',
//             }}
//           >
//             <div
//               style={{ color: '#666', fontSize: '12px', textAlign: 'center' }}
//             >
//               Батч: {progress.currentBatch} / {progress.totalBatches}
//             </div>
//           </div>
//         )}

//         {showExportButtons &&
//           connectionStatus === 'completed' &&
//           hasCompletedFiles && (
//             <div
//               style={{
//                 marginTop: 16,
//                 paddingTop: 16,
//                 borderTop: '1px solid #f0f0f0',
//               }}
//             >
//               <div style={{ textAlign: 'center' }}>
//                 <Space direction="vertical" style={{ width: '100%' }}>
//                   <Button
//                     type="primary"
//                     icon={<ExportOutlined />}
//                     onClick={exportAllFiles}
//                     loading={exportLoading}
//                     size="large"
//                     style={{ marginBottom: 8 }}
//                   >
//                     Экспортировать все файлы в ZIP
//                   </Button>
//                   <div style={{ color: '#666', fontSize: '12px' }}>
//                     Или экспортируйте отдельные файлы ниже
//                   </div>
//                 </Space>
//               </div>
//             </div>
//           )}
//       </Card>

//       {files.length > 0 && (
//         <Card
//           title={`Обработка файлов (${files.length})`}
//           size="small"
//           style={{ marginBottom: 16 }}
//         >
//           {files.map((file, index) => (
//             <div
//               key={file.fileName || index}
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
//                     percent={file.stats.progress || 0}
//                     size="small"
//                     style={{ marginBottom: 4 }}
//                     status={
//                       file.status === 'processing'
//                         ? 'active'
//                         : file.status === 'completed'
//                           ? 'success'
//                           : file.status === 'error'
//                             ? 'exception'
//                             : 'normal'
//                     }
//                   />
//                 </div>
//                 <Space>
//                   {showExportButtons && file.status === 'completed' && (
//                     <Button
//                       type="link"
//                       icon={<DownloadOutlined />}
//                       onClick={() => exportSingleFile(file.fileName)}
//                       size="small"
//                       loading={exportLoading}
//                     >
//                       Экспорт JSON
//                     </Button>
//                   )}
//                   <Tag
//                     color={
//                       file.status === 'completed'
//                         ? 'green'
//                         : file.status === 'error'
//                           ? 'red'
//                           : 'blue'
//                     }
//                   >
//                     {file.status === 'completed'
//                       ? 'Завершён'
//                       : file.status === 'error'
//                         ? 'Ошибка'
//                         : `${file.stats.progress || 0}%`}
//                   </Tag>
//                 </Space>
//               </div>

//               {file.stats && (
//                 <Row
//                   gutter={8}
//                   style={{ fontSize: '12px', color: '#666', marginTop: 4 }}
//                 >
//                   <Col span={6}>
//                     IP: {file.stats.processedIPs}/{file.stats.totalIPs}
//                   </Col>
//                   <Col span={6} style={{ color: '#52c41a' }}>
//                     Успешно: {file.stats.successful}
//                   </Col>
//                   <Col
//                     span={6}
//                     style={{
//                       color: file.stats.failed > 0 ? '#ff4d4f' : '#666',
//                     }}
//                   >
//                     Ошибок: {file.stats.failed}
//                   </Col>
//                   <Col span={6}>Прогресс: {file.stats.progress}%</Col>
//                 </Row>
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

//       {connectionStatus === 'error' && (
//         <Alert
//           message="Произошла ошибка"
//           description="Попробуйте перезагрузить страницу и повторить попытку."
//           type="error"
//           showIcon
//         />
//       )}

//       {connectionStatus === 'completed' && (
//         <Alert
//           message="Обработка завершена"
//           description={
//             hasCompletedFiles
//               ? `Обработано ${completedFiles.length} файлов, ${progress.successful} IP адресов успешно. Вы можете экспортировать результаты.`
//               : 'Обработка завершена, но нет файлов для экспорта.'
//           }
//           type="success"
//           showIcon
//         />
//       )}
//     </div>
//   )
// }

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
//   Divider,
//   Space,
// } from 'antd'
// import {
//   FileTextOutlined,
//   CloudUploadOutlined,
//   CheckCircleOutlined,
//   CloseCircleOutlined,
//   LoadingOutlined,
//   MinusOutlined,
//   ArrowsAltOutlined,
//   DownloadOutlined,
//   ExportOutlined,
// } from '@ant-design/icons'
// import { ROUTES } from '../routes'

// const EVENT_TYPES = {
//   CONNECTED: 'connected',
//   PROCESSING_STARTED: 'processing_started',
//   BATCH_COMPLETE: 'batch_complete',
//   FILE_START: 'file_start',
//   FILES_START: 'files_start',
//   FILE_COMPLETE: 'file_complete',
//   FILE_ERROR: 'file_error',
//   PROCESSING_COMPLETED: 'processing_completed',
//   ALL_COMPLETE: 'all_complete',
//   PROCESSING_ERROR: 'processing_error',
// }

// export const ProgressTracker = ({
//   clientId,
//   onComplete,
//   filesCount,
//   isMinimized = false,
//   onToggleMinimize,
//   decodeFileName = (fileName) => fileName,
//   showExportButtons = true,
// }) => {
//   const [connectionStatus, setConnectionStatus] = useState('connecting')
//   // Используем ref для хранения реального sessionId
//   const sessionIdRef = useRef(null)

//   // Основное состояние прогресса
//   const [progress, setProgress] = useState({
//     processedIPs: 0,
//     totalIPs: 0,
//     progress: 0,
//     successful: 0,
//     failed: 0,
//     currentBatch: 0,
//     totalBatches: 0,
//     totalFiles: 0,
//     processedFiles: 0,
//   })

//   const [files, setFiles] = useState([])
//   const [currentOperation, setCurrentOperation] = useState(
//     'Подключение к серверу...'
//   )
//   const [exportLoading, setExportLoading] = useState(false)
//   const eventSourceRef = useRef(null)

//   // Счетчики для корректной синхронизации
//   const progressCountersRef = useRef({
//     filesTotal: 0,
//     filesProcessed: 0,
//     filesCompleted: 0,
//     filesError: 0,

//     ipTotal: 0,
//     ipProcessed: 0,
//     ipSuccessful: 0,
//     ipFailed: 0,

//     batchCurrent: 0,
//     batchTotal: 0,

//     // Временные счетчики для файла в обработке
//     currentFileStats: {
//       totalIPs: 0,
//       processedIPs: 0,
//       successful: 0,
//       failed: 0,
//       progress: 0,
//     },
//   })

//   const connectSSE = () => {
//     if (!clientId) return

//     // Если sessionId еще не установлен, используем clientId
//     if (!sessionIdRef.current) {
//       sessionIdRef.current = clientId
//     }

//     const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
//     // Передаем sessionId на сервер
//     const sseUrl = `${baseUrl}/files/progress?clientId=${sessionIdRef.current}`

//     const eventSource = new EventSource(sseUrl)
//     eventSourceRef.current = eventSource

//     eventSource.onopen = () => {
//       setConnectionStatus('')
//       setCurrentOperation('Ожидание начала обработки...')
//       // Сбрасываем счетчики при новом подключении
//       progressCountersRef.current = {
//         filesTotal: 0,
//         filesProcessed: 0,
//         filesCompleted: 0,
//         filesError: 0,
//         ipTotal: 0,
//         ipProcessed: 0,
//         ipSuccessful: 0,
//         ipFailed: 0,
//         batchCurrent: 0,
//         batchTotal: 0,
//         currentFileStats: {
//           totalIPs: 0,
//           processedIPs: 0,
//           successful: 0,
//           failed: 0,
//           progress: 0,
//         },
//       }
//     }

//     eventSource.onmessage = (event) => {
//       try {
//         const data = JSON.parse(event.data)
//         console.log('SSE Event:', data)

//         switch (data.type) {
//           case EVENT_TYPES.CONNECTED:
//             setConnectionStatus(EVENT_TYPES.CONNECTED)
//             setCurrentOperation('Готов к обработке файлов')
//             break

//           case EVENT_TYPES.FILES_START:
//             // Начало обработки нескольких файлов
//             progressCountersRef.current.filesTotal = data.totalFiles || 0
//             setCurrentOperation(`Начата обработка ${data.totalFiles} файлов`)
//             setProgress((prev) => ({
//               ...prev,
//               totalFiles: data.totalFiles || 0,
//             }))
//             break

//           case EVENT_TYPES.FILE_START:
//             const decodedFileName = decodeFileName(data.fileName)
//             setFiles((prev) => {
//               const exists = prev.find((f) => f.fileName === decodedFileName)
//               if (exists) return prev

//               return [
//                 ...prev,
//                 {
//                   fileName: decodedFileName,
//                   status: 'processing',
//                   progress: 0,
//                   fileIndex: data.fileIndex,
//                   originalFileName: data.fileName,
//                   stats: {
//                     totalIPs: 0,
//                     processedIPs: 0,
//                     successful: 0,
//                     failed: 0,
//                     progress: 0,
//                   },
//                 },
//               ]
//             })

//             // Увеличиваем счетчик обрабатываемых файлов
//             progressCountersRef.current.filesProcessed++

//             setConnectionStatus('processing')
//             setCurrentOperation(`Начата обработка файла: ${decodedFileName}`)

//             // Обновляем общую статистику
//             setProgress((prev) => ({
//               ...prev,
//               processedFiles: progressCountersRef.current.filesProcessed,
//               totalFiles: progressCountersRef.current.filesTotal,
//             }))
//             break

//           case EVENT_TYPES.PROCESSING_STARTED:
//             // Начало обработки IP для текущего файла
//             progressCountersRef.current.currentFileStats = {
//               totalIPs: data.totalIPs || 0,
//               processedIPs: 0,
//               successful: 0,
//               failed: 0,
//               progress: 0,
//             }

//             // Добавляем к общему количеству IP
//             progressCountersRef.current.ipTotal += data.totalIPs || 0

//             setFiles((prev) =>
//               prev.map((file) =>
//                 file.fileName === decodeFileName(data.fileName)
//                   ? {
//                       ...file,
//                       stats: progressCountersRef.current.currentFileStats,
//                     }
//                   : file
//               )
//             )

//             setCurrentOperation(
//               `Начата обработка ${data.totalIPs || 0} IP-адресов`
//             )

//             // Обновляем общую статистику
//             setProgress((prev) => ({
//               ...prev,
//               totalIPs: progressCountersRef.current.ipTotal,
//             }))
//             break

//           case EVENT_TYPES.PROCESSING_COMPLETED:
//             progressCountersRef.current.ipSuccessful += data.successful || 0
//             progressCountersRef.current.ipFailed += data.failed || 0

//             break
//           case EVENT_TYPES.BATCH_COMPLETE:
//             // Обновляем статистику текущего файла
//             const updatedFileStats = {
//               totalIPs: data.totalIPs || 0,
//               processedIPs: data.processedIPs || 0,
//               successful: data.successful || 0,
//               failed: data.failed || 0,
//               progress: data.progress || 0,
//             }

//             // Обновляем глобальные счетчики IP (суммируем)
//             progressCountersRef.current.ipProcessed += data.processedIPs || 0

//             // Обновляем прогресс файла
//             setFiles((prev) =>
//               prev.map((file) =>
//                 file.fileName === decodeFileName(data.fileName)
//                   ? {
//                       ...file,
//                       progress: data.progress || 0,
//                       stats: { ...updatedFileStats },
//                     }
//                   : file
//               )
//             )

//             setCurrentOperation(
//               `Обработано ${data.processedIPs || 0} из ${data.totalIPs || 0} IP (${data.progress || 0}%)`
//             )

//             // Обновляем общую статистику
//             setProgress((prev) => ({
//               ...prev,
//               processedIPs: progressCountersRef.current.ipProcessed,
//               successful: progressCountersRef.current.ipSuccessful,
//               failed: progressCountersRef.current.ipFailed,
//               progress:
//                 progressCountersRef.current.ipTotal > 0
//                   ? Math.round(
//                       (progressCountersRef.current.ipProcessed /
//                         progressCountersRef.current.ipTotal) *
//                         100
//                     )
//                   : 0,
//             }))
//             break

//           // case EVENT_TYPES.BATCH_COMPLETE: {
//           //   const isCompleted = data.batchIndex === data.totalBatches
//           //   updateProgress((prev) => ({
//           //     completedFiles: prev.completedFiles + isCompleted ? 1 : 0,
//           //   }))
//           //   break
//           // }
//           case EVENT_TYPES.FILE_COMPLETE:
//             progressCountersRef.current.filesCompleted++

//             setFiles((prev) =>
//               prev.map((file) =>
//                 file.fileName === decodeFileName(data.fileName)
//                   ? {
//                       ...file,
//                       status: 'completed',
//                       progress: 100,
//                       result: data.result,
//                       stats: {
//                         totalIPs: data.result?.total || 0,
//                         processedIPs: data.result?.total || 0,
//                         successful: data.result?.successful || 0,
//                         failed: data.result?.failed || 0,
//                         progress: 100,
//                       },
//                     }
//                   : file
//               )
//             )

//             setCurrentOperation(
//               `Файл ${decodeFileName(data.fileName)} обработан`
//             )

//             // Обновляем общую статистику
//             setProgress((prev) => ({
//               ...prev,
//               processedFiles: progressCountersRef.current.filesProcessed,
//               totalFiles: progressCountersRef.current.filesTotal,
//             }))
//             break

//           case EVENT_TYPES.FILE_ERROR:
//             progressCountersRef.current.filesError++

//             setFiles((prev) =>
//               prev.map((file) =>
//                 file.fileName === decodeFileName(data.fileName)
//                   ? {
//                       ...file,
//                       status: 'error',
//                       error: data.error,
//                       progress: 0,
//                     }
//                   : file
//               )
//             )
//             setCurrentOperation(
//               `Ошибка обработки файла: ${decodeFileName(data.fileName)}`
//             )
//             break

//           case EVENT_TYPES.ALL_COMPLETE:
//             setConnectionStatus('completed')
//             setProgress((prev) => ({
//               ...prev,
//               progress: 100,
//               processedFiles: progressCountersRef.current.filesTotal,
//               processedIPs: progressCountersRef.current.ipTotal,
//               successful: progressCountersRef.current.ipSuccessful,
//               failed: progressCountersRef.current.ipFailed,
//             }))
//             setCurrentOperation('Все файлы успешно обработаны')
//             onComplete?.()
//             break

//           case EVENT_TYPES.PROCESSING_ERROR:
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

//   // В функции connectSSE добавьте обработку разрыва соединения
//   useEffect(() => {
//     if (clientId) {
//       connectSSE()

//       // Функция для очистки при разрыве соединения
//       const cleanupOnUnload = async () => {
//         try {
//           await fetch(
//             `http://localhost:5000/files/cleanup-session/${clientId}`,
//             {
//               method: 'DELETE',
//             }
//           )
//         } catch (error) {
//           console.error('Ошибка при очистке сессии:', error)
//         }
//       }

//       // Очистка при закрытии вкладки/браузера
//       window.addEventListener('beforeunload', cleanupOnUnload)

//       // Очистка при размонтировании компонента
//       return () => {
//         window.removeEventListener('beforeunload', cleanupOnUnload)
//         if (eventSourceRef.current) {
//           eventSourceRef.current.close()
//         }

//         // Также очищаем сессию при размонтировании
//         cleanupOnUnload()
//       }
//     }
//   }, [clientId])

//   const exportSingleFile = async (fileName) => {
//     try {
//       setExportLoading(true)
//       console.log('Exporting file:', fileName)

//       // Используем оригинальное имя файла для экспорта
//       const fileToExport = files.find((f) => f.fileName === fileName)
//       const exportName = fileToExport?.originalFileName || fileName

//       const response = await fetch(
//         `http://localhost:5000/files/export/${fileName}`
//       )
//       // const response = await fetch(`http://localhost:5000/files/export/${encodeURIComponent(exportName)}`)

//       if (!response.ok) {
//         if (response.status === 404) {
//           throw new Error('Файл не найден на сервере')
//         }
//         throw new Error(`HTTP error! status: ${response.status}`)
//       }

//       const blob = await response.blob()

//       // Получаем имя файла из заголовка или используем оригинальное
//       const contentDisposition = response.headers.get('Content-Disposition')
//       let downloadName = `${fileName}_export.json`

//       if (contentDisposition) {
//         const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
//         if (filenameMatch) {
//           downloadName = filenameMatch[1]
//         }
//       }

//       const url = window.URL.createObjectURL(blob)
//       const a = document.createElement('a')
//       a.href = url
//       a.download = downloadName
//       document.body.appendChild(a)
//       a.click()
//       window.URL.revokeObjectURL(url)
//       document.body.removeChild(a)

//       console.log('File exported successfully')
//     } catch (error) {
//       console.error('Ошибка экспорта:', error)
//       alert(`Ошибка экспорта: ${error.message}`)
//     } finally {
//       setExportLoading(false)
//     }
//   }

//   // В ProgressTracker компоненте
//   const exportAllFiles = async () => {
//     try {
//       setExportLoading(true)
//       const sessionId = sessionIdRef.current || clientId
//       console.log('Exporting all files for session:', sessionId)

//       // Сначала проверяем существование сессии
//       const checkResponse = await fetch(
//         `http://localhost:5000/files/check-session/${sessionId}`
//       )

//       const checkData = await checkResponse.json()

//       if (!checkData.exists) {
//         throw new Error(
//           'Сессия не найдена. Возможно, файлы уже были экспортированы и удалены.'
//         )
//       }

//       if (checkData.fileCount === 0) {
//         throw new Error('В сессии нет файлов для экспорта')
//       }

//       // Экспортируем файлы сессии
//       const response = await fetch(
//         `http://localhost:5000/files/export-all?sessionId=${sessionId}`
//       )

//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`)
//       }

//       const blob = await response.blob()
//       const url = window.URL.createObjectURL(blob)
//       const a = document.createElement('a')
//       a.href = url
//       a.download = `export_session_${sessionId}_${Date.now()}.zip`
//       document.body.appendChild(a)
//       a.click()
//       window.URL.revokeObjectURL(url)
//       document.body.removeChild(a)

//       console.log('Все файлы сессии экспортированы успешно')
//     } catch (error) {
//       console.error('Ошибка экспорта всех файлов:', error)
//       alert(`Ошибка экспорта: ${error.message}`)
//     } finally {
//       setExportLoading(false)
//     }
//   }

//   // Дополнительная кнопка для экспорта всей БД
//   const exportAllFilesFromDB = async () => {
//     try {
//       setExportLoading(true)

//       const response = await fetch(`http://localhost:5000/files/export-all-db`)

//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`)
//       }

//       const blob = await response.blob()
//       const url = window.URL.createObjectURL(blob)
//       const a = document.createElement('a')
//       a.href = url
//       a.download = `export_all_database_${Date.now()}.zip`
//       document.body.appendChild(a)
//       a.click()
//       window.URL.revokeObjectURL(url)
//       document.body.removeChild(a)

//       console.log('Все файлы из БД экспортированы успешно')
//     } catch (error) {
//       console.error('Ошибка экспорта всех файлов из БД:', error)
//       alert(`Ошибка экспорта: ${error.message}`)
//     } finally {
//       setExportLoading(false)
//     }
//   }

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

//   const completedFiles = files.filter((f) => f.status === 'completed')
//   const hasCompletedFiles = completedFiles.length > 0

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

//         {/* Статистика - ИСПРАВЛЕННЫЕ ПОДСЧЕТЫ */}
//         <Row gutter={16}>
//           <Col span={6}>
//             <Statistic
//               title="Файлов"
//               value={filesCount}
//               suffix={progress.totalFiles > 0 ? `/ ${filesCount}` : ''}
//               prefix={<FileTextOutlined />}
//               valueStyle={{
//                 fontSize: '18px',
//                 color:
//                   progress.processedFiles === progress.totalFiles &&
//                   progress.totalFiles > 0
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

//         {/* Информация о батчах */}
//         {progress.totalBatches > 0 && (
//           <div
//             style={{
//               marginTop: 12,
//               paddingTop: 12,
//               borderTop: '1px solid #f0f0f0',
//             }}
//           >
//             <div
//               style={{ color: '#666', fontSize: '12px', textAlign: 'center' }}
//             >
//               Батч: {progress.currentBatch} / {progress.totalBatches}
//             </div>
//           </div>
//         )}

//         {/* Кнопки экспорта */}
//         {showExportButtons &&
//           connectionStatus === 'completed' &&
//           hasCompletedFiles && (
//             <div
//               style={{
//                 marginTop: 16,
//                 paddingTop: 16,
//                 borderTop: '1px solid #f0f0f0',
//               }}
//             >
//               <div style={{ textAlign: 'center' }}>
//                 <Space direction="vertical" style={{ width: '100%' }}>
//                   <Button
//                     type="primary"
//                     icon={<ExportOutlined />}
//                     onClick={exportAllFiles}
//                     loading={exportLoading}
//                     size="large"
//                     style={{ marginBottom: 8 }}
//                   >
//                     Экспортировать все файлы в ZIP
//                   </Button>
//                   <div style={{ color: '#666', fontSize: '12px' }}>
//                     Или экспортируйте отдельные файлы ниже
//                   </div>
//                 </Space>
//               </div>
//             </div>
//           )}
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
//               key={file.fileName || index}
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
//                     percent={file.progress || 0}
//                     size="small"
//                     style={{ marginBottom: 4 }}
//                     status={
//                       file.status === 'processing'
//                         ? 'active'
//                         : file.status === 'completed'
//                           ? 'success'
//                           : file.status === 'error'
//                             ? 'exception'
//                             : 'normal'
//                     }
//                   />
//                 </div>
//                 <Space>
//                   {showExportButtons && file.status === 'completed' && (
//                     <Button
//                       type="link"
//                       icon={<DownloadOutlined />}
//                       onClick={() => exportSingleFile(file.fileName)}
//                       size="small"
//                       loading={exportLoading}
//                     >
//                       Экспорт JSON
//                     </Button>
//                   )}
//                   <Tag
//                     color={
//                       file.status === 'completed'
//                         ? 'green'
//                         : file.status === 'error'
//                           ? 'red'
//                           : 'blue'
//                     }
//                   >
//                     {file.status === 'completed'
//                       ? 'Завершён'
//                       : file.status === 'error'
//                         ? 'Ошибка'
//                         : `${file.progress || 0}%`}
//                   </Tag>
//                 </Space>
//               </div>

//               {/* Детальная статистика по файлу */}
//               {file.stats && (
//                 <Row
//                   gutter={8}
//                   style={{ fontSize: '12px', color: '#666', marginTop: 4 }}
//                 >
//                   <Col span={6}>
//                     IP: {file.stats.processedIPs}/{file.stats.totalIPs}
//                   </Col>
//                   <Col span={6} style={{ color: '#52c41a' }}>
//                     Успешно: {file.stats.successful}
//                   </Col>
//                   <Col
//                     span={6}
//                     style={{
//                       color: file.stats.failed > 0 ? '#ff4d4f' : '#666',
//                     }}
//                   >
//                     Ошибок: {file.stats.failed}
//                   </Col>
//                   <Col span={6}>Прогресс: {file.stats.progress}%</Col>
//                 </Row>
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
//           description={
//             hasCompletedFiles
//               ? `Обработано ${completedFiles.length} файлов, ${progress.successful} IP адресов успешно. Вы можете экспортировать результаты.`
//               : 'Обработка завершена, но нет файлов для экспорта.'
//           }
//           type="success"
//           showIcon
//         />
//       )}
//     </div>
//   )
// }

// предложенная оптимизированная версия
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
//   Divider,
//   Space,
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
//   DownloadOutlined,
//   ExportOutlined,
// } from '@ant-design/icons'
// import { ROUTES } from '../routes'

// const { Title } = Typography

// // Константы для статусов и событий
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
//   BATCH_COMPLETE: 'batch_complete',
//   FILE_START: 'file_start',
//   FILES_START: 'files_start',
//   FILE_COMPLETE: 'file_complete',
//   FILE_ERROR: 'file_error',
//   PROCESSING_COMPLETED: 'processing_completed',
//   ALL_COMPLETE: 'all_complete',
//   PROCESSING_ERROR: 'processing_error',
// }

// const FILE_STATUS = {
//   PROCESSING: 'processing',
//   COMPLETED: 'completed',
//   ERROR: 'error',
// }

// const INITIAL_PROGRESS = {
//   processedIPs: 0,
//   totalIPs: 0,
//   progress: 0,
//   successful: 0,
//   failed: 0,
//   currentBatch: 0,
//   totalBatches: 0,
//   totalFiles: 0,
//   processedFiles: 0,
// }

// const INITIAL_COUNTERS = {
//   filesTotal: 0,
//   filesProcessed: 0,
//   filesCompleted: 0,
//   filesError: 0,
//   ipTotal: 0,
//   ipProcessed: 0,
//   ipSuccessful: 0,
//   ipFailed: 0,
//   batchCurrent: 0,
//   batchTotal: 0,
//   currentFileStats: {
//     totalIPs: 0,
//     processedIPs: 0,
//     successful: 0,
//     failed: 0,
//     progress: 0,
//   },
// }

// // Конфигурация статусов
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

// const FILE_STATUS_CONFIG = {
//   [FILE_STATUS.PROCESSING]: {
//     color: 'blue',
//     text: 'В процессе',
//     progressStatus: 'active',
//   },
//   [FILE_STATUS.COMPLETED]: {
//     color: 'green',
//     text: 'Завершён',
//     progressStatus: 'success',
//   },
//   [FILE_STATUS.ERROR]: {
//     color: 'red',
//     text: 'Ошибка',
//     progressStatus: 'exception',
//   },
// }

// // Глобальное хранилище для данных прогресса
// const globalProgressStorage = {
//   data: new Map(),

//   get(sessionId) {
//     return this.data.get(sessionId)
//   },

//   set(sessionId, data) {
//     this.data.set(sessionId, {
//       ...data,
//       timestamp: Date.now(),
//     })
//   },

//   delete(sessionId) {
//     this.data.delete(sessionId)
//   },

//   cleanupOldData(maxAge = 5 * 60 * 1000) {
//     const now = Date.now()
//     for (const [key, data] of this.data.entries()) {
//       if (now - data.timestamp > maxAge) {
//         this.data.delete(key)
//       }
//     }
//   },
// }

// // Глобальное хранилище для соединений SSE
// const globalSSEConnections = new Map()

// export const ProgressTracker = ({
//   clientId,
//   sessionId: externalSessionId,
//   onComplete,
//   onClose,
//   isMinimized = false,
//   onToggleMinimize,
//   decodeFileName = (fileName) => fileName,
//   showExportButtons = true,
//   isModal = false,
// }) => {
//   // Состояние
//   const [connectionStatus, setConnectionStatus] = useState(() => {
//     if (externalSessionId && globalProgressStorage.get(externalSessionId)) {
//       return (
//         globalProgressStorage.get(externalSessionId).connectionStatus ||
//         CONNECTION_STATUS.CONNECTING
//       )
//     }
//     return CONNECTION_STATUS.CONNECTING
//   })

//   const [progress, setProgress] = useState(() => {
//     if (externalSessionId && globalProgressStorage.get(externalSessionId)) {
//       return {
//         ...INITIAL_PROGRESS,
//         ...globalProgressStorage.get(externalSessionId).progress,
//       }
//     }
//     return INITIAL_PROGRESS
//   })

//   const [files, setFiles] = useState(() => {
//     if (externalSessionId && globalProgressStorage.get(externalSessionId)) {
//       return globalProgressStorage.get(externalSessionId).files || []
//     }
//     return []
//   })

//   const [currentOperation, setCurrentOperation] = useState(() => {
//     if (externalSessionId && globalProgressStorage.get(externalSessionId)) {
//       return (
//         globalProgressStorage.get(externalSessionId).currentOperation ||
//         'Подключение к серверу...'
//       )
//     }
//     return 'Подключение к серверу...'
//   })

//   const [exportLoading, setExportLoading] = useState(false)

//   // Рефы
//   const isMountedRef = useRef(false)
//   const sessionIdRef = useRef(externalSessionId || clientId)
//   const eventSourceRef = useRef(null)
//   const reconnectTimeoutRef = useRef(null)
//   const reconnectAttemptRef = useRef(0)

//   // Рефы для хранения текущих значений
//   const latestProgressRef = useRef(progress)
//   const latestFilesRef = useRef(files)
//   const latestConnectionStatusRef = useRef(connectionStatus)
//   const latestOperationRef = useRef(currentOperation)

//   const progressCountersRef = useRef({ ...INITIAL_COUNTERS })

//   // Добавьте в ProgressTracker функцию для сохранения данных
//   const saveToStorage = useCallback(() => {
//     if (sessionIdRef.current && isMountedRef.current) {
//       globalProgressStorage.set(sessionIdRef.current, {
//         progress: latestProgressRef.current,
//         files: latestFilesRef.current,
//         connectionStatus: latestConnectionStatusRef.current,
//         currentOperation: latestOperationRef.current,
//       })
//     }
//   }, [])

//   // Обновляйте рефы и сохраняйте при изменениях
//   useEffect(() => {
//     latestProgressRef.current = progress
//     latestFilesRef.current = files
//     latestConnectionStatusRef.current = connectionStatus
//     latestOperationRef.current = currentOperation

//     saveToStorage()
//   }, [progress, files, connectionStatus, currentOperation, saveToStorage])

//   // Обновление рефов при изменении состояния
//   useEffect(() => {
//     latestProgressRef.current = progress
//     latestFilesRef.current = files
//     latestConnectionStatusRef.current = connectionStatus
//     latestOperationRef.current = currentOperation

//     // Сохранение в глобальное хранилище
//     if (sessionIdRef.current) {
//       globalProgressStorage.set(sessionIdRef.current, {
//         progress,
//         files,
//         connectionStatus,
//         currentOperation,
//       })
//     }
//   }, [progress, files, connectionStatus, currentOperation])

//   // Мемоизированные значения
//   const statusConfig = useMemo(
//     () =>
//       STATUS_CONFIG[connectionStatus] ||
//       STATUS_CONFIG[CONNECTION_STATUS.CONNECTING],
//     [connectionStatus]
//   )

//   const completedFiles = useMemo(
//     () => files.filter((f) => f.status === FILE_STATUS.COMPLETED),
//     [files]
//   )

//   const hasCompletedFiles = useMemo(
//     () => completedFiles.length > 0,
//     [completedFiles]
//   )

//   // Вспомогательные функции
//   const updateStatus = useCallback((status, operation = null) => {
//     if (!isMountedRef.current) return

//     setConnectionStatus(status)
//     latestConnectionStatusRef.current = status

//     if (operation) {
//       setCurrentOperation(operation)
//       latestOperationRef.current = operation
//     }
//   }, [])

//   const updateProgress = useCallback((updater) => {
//     if (!isMountedRef.current) return

//     setProgress((prev) => {
//       const updates = typeof updater === 'function' ? updater(prev) : updater
//       const newState = { ...prev, ...updates }

//       // Вычисляем общий прогресс
//       if (newState.totalIPs > 0) {
//         newState.progress = Math.round(
//           (newState.processedIPs / newState.totalIPs) * 100
//         )
//       } else {
//         newState.progress = newState.processedFiles > 0 ? 100 : 0
//       }

//       newState.progress = Math.min(newState.progress, 100)

//       return newState
//     })
//   }, [])

//   const updateFile = useCallback((fileName, updates) => {
//     setFiles((prev) =>
//       prev.map((file) =>
//         file.fileName === fileName ? { ...file, ...updates } : file
//       )
//     )
//   }, [])

//   const addFile = useCallback((fileData) => {
//     setFiles((prev) => {
//       const exists = prev.find((f) => f.fileName === fileData.fileName)
//       if (exists) return prev
//       return [...prev, fileData]
//     })
//   }, [])

//   // Обработчики событий SSE
//   const handleSSEEvent = useCallback(
//     (data) => {
//       switch (data.type) {
//         case EVENT_TYPES.CONNECTED:
//           updateStatus(CONNECTION_STATUS.CONNECTED, 'Готов к обработке файлов')
//           break

//         case EVENT_TYPES.FILES_START:
//           progressCountersRef.current.filesTotal = data.totalFiles || 0
//           updateStatus(
//             CONNECTION_STATUS.PROCESSING,
//             `Начата обработка ${data.totalFiles} файлов`
//           )
//           updateProgress({ totalFiles: data.totalFiles || 0 })
//           break

//         case EVENT_TYPES.FILE_START:
//           const decodedFileName = decodeFileName(data.fileName)

//           addFile({
//             fileName: decodedFileName,
//             status: FILE_STATUS.PROCESSING,
//             progress: 0,
//             fileIndex: data.fileIndex,
//             originalFileName: data.fileName,
//             stats: {
//               totalIPs: 0,
//               processedIPs: 0,
//               successful: 0,
//               failed: 0,
//               progress: 0,
//             },
//           })

//           progressCountersRef.current.filesProcessed++
//           updateStatus(
//             CONNECTION_STATUS.PROCESSING,
//             `Начата обработка файла: ${decodedFileName}`
//           )
//           updateProgress({
//             processedFiles: progressCountersRef.current.filesProcessed,
//             totalFiles: progressCountersRef.current.filesTotal,
//           })
//           break

//         case EVENT_TYPES.PROCESSING_STARTED:
//           const currentFileStats = {
//             totalIPs: data.totalIPs || 0,
//             processedIPs: 0,
//             successful: 0,
//             failed: 0,
//             progress: 0,
//           }

//           progressCountersRef.current.currentFileStats = currentFileStats
//           progressCountersRef.current.ipTotal += data.totalIPs || 0

//           updateFile(decodeFileName(data.fileName), { stats: currentFileStats })
//           updateStatus(
//             CONNECTION_STATUS.PROCESSING,
//             `Начата обработка ${data.totalIPs || 0} IP-адресов`
//           )
//           updateProgress({ totalIPs: progressCountersRef.current.ipTotal })
//           break

//         case EVENT_TYPES.PROCESSING_COMPLETED:
//           progressCountersRef.current.ipSuccessful += data.successful || 0
//           progressCountersRef.current.ipFailed += data.failed || 0
//           break

//         case EVENT_TYPES.BATCH_COMPLETE:
//           const updatedFileStats = {
//             totalIPs: data.totalIPs || 0,
//             processedIPs: data.processedIPs || 0,
//             successful: data.successful || 0,
//             failed: data.failed || 0,
//             progress: data.progress || 0,
//           }

//           progressCountersRef.current.ipProcessed += data.processedIPs || 0

//           updateFile(decodeFileName(data.fileName), {
//             progress: data.progress || 0,
//             stats: { ...updatedFileStats },
//           })

//           updateStatus(
//             CONNECTION_STATUS.PROCESSING,
//             `Обработано ${data.processedIPs || 0} из ${data.totalIPs || 0} IP (${data.progress || 0}%)`
//           )

//           updateProgress({
//             processedIPs: progressCountersRef.current.ipProcessed,
//             successful: progressCountersRef.current.ipSuccessful,
//             failed: progressCountersRef.current.ipFailed,
//             progress:
//               progressCountersRef.current.ipTotal > 0
//                 ? Math.round(
//                     (progressCountersRef.current.ipProcessed /
//                       progressCountersRef.current.ipTotal) *
//                       100
//                   )
//                 : 0,
//           })
//           break

//         case EVENT_TYPES.FILE_COMPLETE:
//           progressCountersRef.current.filesCompleted++

//           updateFile(decodeFileName(data.fileName), {
//             status: FILE_STATUS.COMPLETED,
//             progress: 100,
//             result: data.result,
//             stats: {
//               totalIPs: data.result?.total || 0,
//               processedIPs: data.result?.total || 0,
//               successful: data.result?.successful || 0,
//               failed: data.result?.failed || 0,
//               progress: 100,
//             },
//           })

//           updateStatus(
//             CONNECTION_STATUS.PROCESSING,
//             `Файл ${decodeFileName(data.fileName)} обработан`
//           )
//           updateProgress({
//             processedFiles: progressCountersRef.current.filesProcessed,
//             totalFiles: progressCountersRef.current.filesTotal,
//           })
//           break

//         case EVENT_TYPES.FILE_ERROR:
//           progressCountersRef.current.filesError++

//           updateFile(decodeFileName(data.fileName), {
//             status: FILE_STATUS.ERROR,
//             error: data.error,
//             progress: 0,
//           })

//           updateStatus(
//             CONNECTION_STATUS.PROCESSING,
//             `Ошибка обработки файла: ${decodeFileName(data.fileName)}`
//           )
//           break

//         case EVENT_TYPES.ALL_COMPLETE:
//           updateStatus(
//             CONNECTION_STATUS.COMPLETED,
//             'Все файлы успешно обработаны'
//           )
//           updateProgress({
//             progress: 100,
//             processedFiles: progressCountersRef.current.filesTotal,
//             processedIPs: progressCountersRef.current.ipTotal,
//             successful: progressCountersRef.current.ipSuccessful,
//             failed: progressCountersRef.current.ipFailed,
//           })
//           onComplete?.()
//           break

//         case EVENT_TYPES.PROCESSING_ERROR:
//           updateStatus(
//             CONNECTION_STATUS.ERROR,
//             `Ошибка обработки: ${data.error}`
//           )
//           break

//         default:
//           console.warn('Неизвестный тип события:', data.type)
//       }
//     },
//     [
//       decodeFileName,
//       updateStatus,
//       updateProgress,
//       updateFile,
//       addFile,
//       onComplete,
//     ]
//   )

//   // Управление SSE соединением
//   const setupSSEHandlers = useCallback(
//     (eventSource) => {
//       if (!eventSource || !isMountedRef.current) return

//       eventSource.onopen = () => {
//         if (isMountedRef.current) {
//           updateStatus(
//             CONNECTION_STATUS.CONNECTED,
//             'Ожидание начала обработки...'
//           )
//           reconnectAttemptRef.current = 0
//           progressCountersRef.current = { ...INITIAL_COUNTERS }
//         }
//       }

//       eventSource.onmessage = (event) => {
//         if (!isMountedRef.current) return

//         try {
//           const data = JSON.parse(event.data)
//           handleSSEEvent(data)
//         } catch (error) {
//           console.error('Ошибка обработки события:', error)
//         }
//       }

//       eventSource.onerror = (error) => {
//         if (
//           isMountedRef.current &&
//           eventSource.readyState === EventSource.CLOSED
//         ) {
//           updateStatus(CONNECTION_STATUS.ERROR, 'Ошибка соединения с сервером')

//           if (reconnectAttemptRef.current < 3) {
//             reconnectAttemptRef.current++
//             reconnectTimeoutRef.current = setTimeout(() => {
//               setupSSEHandlers(eventSource)
//             }, 2000 * reconnectAttemptRef.current)
//           }
//         }
//       }
//     },
//     [updateStatus, handleSSEEvent]
//   )

//   const getOrCreateSSEConnection = useCallback(() => {
//     if (!clientId) return null

//     const connectionKey = clientId

//     if (globalSSEConnections.has(connectionKey)) {
//       const existingEventSource = globalSSEConnections.get(connectionKey)

//       if (existingEventSource.readyState === EventSource.OPEN) {
//         return existingEventSource
//       } else {
//         existingEventSource.close()
//         globalSSEConnections.delete(connectionKey)
//       }
//     }

//     try {
//       const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
//       const sseUrl = `${baseUrl}/files/progress?clientId=${sessionIdRef.current}`

//       const eventSource = new EventSource(sseUrl)
//       globalSSEConnections.set(connectionKey, eventSource)

//       return eventSource
//     } catch (error) {
//       console.error('Ошибка создания EventSource для', clientId, error)
//       return null
//     }
//   }, [clientId])

//   const connectSSE = useCallback(() => {
//     if (!clientId || !isMountedRef.current) return

//     const eventSource = getOrCreateSSEConnection()
//     if (eventSource) {
//       eventSourceRef.current = eventSource
//       setupSSEHandlers(eventSource)
//     } else {
//       updateStatus(CONNECTION_STATUS.ERROR, 'Не удалось подключиться к серверу')
//     }
//   }, [clientId, getOrCreateSSEConnection, setupSSEHandlers, updateStatus])

//   // Очистка
//   const cleanup = useCallback(() => {
//     if (reconnectTimeoutRef.current) {
//       clearTimeout(reconnectTimeoutRef.current)
//       reconnectTimeoutRef.current = null
//     }

//     reconnectAttemptRef.current = 0
//   }, [])

//   const cleanupSession = useCallback(async () => {
//     try {
//       await fetch(
//         `${ROUTES.BASE_URL}:${ROUTES.PORT}/files/cleanup-session/${sessionIdRef.current}`,
//         {
//           method: 'DELETE',
//         }
//       )
//     } catch (error) {
//       console.error('Ошибка при очистке сессии:', error)
//     }
//   }, [])

//   // Эффекты

//   // В ProgressTracker добавьте эту функцию для инициализации соединения
//   useEffect(() => {
//     isMountedRef.current = true
//     globalProgressStorage.cleanupOldData()

//     // Восстанавливаем состояние из хранилища
//     if (externalSessionId && globalProgressStorage.get(externalSessionId)) {
//       const savedData = globalProgressStorage.get(externalSessionId)
//       setProgress(savedData.progress || INITIAL_PROGRESS)
//       setFiles(savedData.files || [])
//       setConnectionStatus(
//         savedData.connectionStatus || CONNECTION_STATUS.CONNECTING
//       )
//       setCurrentOperation(
//         savedData.currentOperation || 'Подключение к серверу...'
//       )
//     }

//     if (clientId) {
//       console.log('Подключаем SSE для:', {
//         clientId,
//         sessionId: externalSessionId,
//       })
//       connectSSE()
//     }

//     return () => {
//       isMountedRef.current = false
//       cleanup()
//     }
//   }, [clientId, externalSessionId, connectSSE, cleanup])

//   useEffect(() => {
//     isMountedRef.current = true
//     globalProgressStorage.cleanupOldData()

//     if (clientId) {
//       connectSSE()
//     }

//     return () => {
//       isMountedRef.current = false
//       cleanup()
//     }
//   }, [clientId, connectSSE, cleanup])

//   useEffect(() => {
//     if (
//       connectionStatus === CONNECTION_STATUS.COMPLETED ||
//       connectionStatus === CONNECTION_STATUS.ERROR
//     ) {
//       const cleanupTimer = setTimeout(() => {
//         if (clientId && globalSSEConnections.has(clientId)) {
//           const eventSource = globalSSEConnections.get(clientId)
//           eventSource.close()
//           globalSSEConnections.delete(clientId)
//         }
//       }, 30000)

//       return () => clearTimeout(cleanupTimer)
//     }
//   }, [connectionStatus, clientId])

//   // В обработчике закрытия
//   const handleClose = () => {
//     // Закрываем соединение
//     if (clientId && globalSSEConnections.has(clientId)) {
//       const eventSource = globalSSEConnections.get(clientId)
//       eventSource.close()
//       globalSSEConnections.delete(clientId)
//     }

//     // Удаляем данные из хранилища
//     if (sessionIdRef.current) {
//       globalProgressStorage.delete(sessionIdRef.current)
//     }

//     cleanup()
//     cleanupSession()
//     onClose?.()
//   }

//   // Функции экспорта
//   const exportSingleFile = useCallback(
//     async (fileName) => {
//       try {
//         setExportLoading(true)
//         const fileToExport = files.find((f) => f.fileName === fileName)
//         const exportName = fileToExport?.originalFileName || fileName

//         const response = await fetch(
//           `${ROUTES.BASE_URL}:${ROUTES.PORT}/files/export/${fileName}`
//         )

//         if (!response.ok) {
//           if (response.status === 404) {
//             throw new Error('Файл не найден на сервере')
//           }
//           throw new Error(`HTTP error! status: ${response.status}`)
//         }

//         const blob = await response.blob()
//         const contentDisposition = response.headers.get('Content-Disposition')
//         let downloadName = `${fileName}_export.json`

//         if (contentDisposition) {
//           const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
//           if (filenameMatch) {
//             downloadName = filenameMatch[1]
//           }
//         }

//         const url = window.URL.createObjectURL(blob)
//         const a = document.createElement('a')
//         a.href = url
//         a.download = downloadName
//         document.body.appendChild(a)
//         a.click()
//         window.URL.revokeObjectURL(url)
//         document.body.removeChild(a)
//       } catch (error) {
//         console.error('Ошибка экспорта:', error)
//         alert(`Ошибка экспорта: ${error.message}`)
//       } finally {
//         setExportLoading(false)
//       }
//     },
//     [files]
//   )

//   const exportAllFiles = useCallback(async () => {
//     try {
//       setExportLoading(true)
//       const sessionId = sessionIdRef.current

//       const checkResponse = await fetch(
//         `${ROUTES.BASE_URL}:${ROUTES.PORT}/files/check-session/${sessionId}`
//       )

//       const checkData = await checkResponse.json()

//       if (!checkData.exists) {
//         throw new Error(
//           'Сессия не найдена. Возможно, файлы уже были экспортированы и удалены.'
//         )
//       }

//       if (checkData.fileCount === 0) {
//         throw new Error('В сессии нет файлов для экспорта')
//       }

//       const response = await fetch(
//         `${ROUTES.BASE_URL}:${ROUTES.PORT}/files/export-all?sessionId=${sessionId}`
//       )

//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`)
//       }

//       const blob = await response.blob()
//       const url = window.URL.createObjectURL(blob)
//       const a = document.createElement('a')
//       a.href = url
//       a.download = `export_session_${sessionId}_${Date.now()}.zip`
//       document.body.appendChild(a)
//       a.click()
//       window.URL.revokeObjectURL(url)
//       document.body.removeChild(a)
//     } catch (error) {
//       console.error('Ошибка экспорта всех файлов:', error)
//       alert(`Ошибка экспорта: ${error.message}`)
//     } finally {
//       setExportLoading(false)
//     }
//   }, [])

//   // Компоненты представления
//   const renderStatistics = () => (
//     <Row gutter={16}>
//       <Col span={6}>
//         <Statistic
//           title="Файлов"
//           value={progress.processedFiles || completedFiles.length}
//           suffix={progress.totalFiles > 0 ? `/ ${progress.totalFiles}` : ''}
//           prefix={<FileTextOutlined />}
//           valueStyle={{
//             fontSize: '18px',
//             color:
//               progress.processedFiles === progress.totalFiles &&
//               progress.totalFiles > 0
//                 ? '#52c41a'
//                 : '#1890ff',
//           }}
//         />
//       </Col>
//       <Col span={6}>
//         <Statistic
//           title="IP адресов"
//           value={progress.processedIPs}
//           suffix={progress.totalIPs > 0 ? `/ ${progress.totalIPs}` : ''}
//           prefix={<CloudUploadOutlined />}
//           valueStyle={{ fontSize: '18px' }}
//         />
//       </Col>
//       <Col span={6}>
//         <Statistic
//           title="Успешно"
//           value={progress.successful}
//           valueStyle={{ color: '#52c41a', fontSize: '18px' }}
//         />
//       </Col>
//       <Col span={6}>
//         <Statistic
//           title="Ошибок"
//           value={progress.failed}
//           valueStyle={{
//             color: progress.failed > 0 ? '#ff4d4f' : '#666',
//             fontSize: '18px',
//           }}
//         />
//       </Col>
//     </Row>
//   )

//   const renderBatchInfo = () =>
//     progress.totalBatches > 0 && (
//       <div
//         style={{
//           marginTop: 12,
//           paddingTop: 12,
//           borderTop: '1px solid #f0f0f0',
//         }}
//       >
//         <div style={{ color: '#666', fontSize: '12px', textAlign: 'center' }}>
//           Батч: {progress.currentBatch} / {progress.totalBatches}
//         </div>
//       </div>
//     )

//   const renderExportButtons = () =>
//     showExportButtons &&
//     connectionStatus === CONNECTION_STATUS.COMPLETED &&
//     hasCompletedFiles && (
//       <div
//         style={{
//           marginTop: 16,
//           paddingTop: 16,
//           borderTop: '1px solid #f0f0f0',
//         }}
//       >
//         <div style={{ textAlign: 'center' }}>
//           <Space direction="vertical" style={{ width: '100%' }}>
//             <Button
//               type="primary"
//               icon={<ExportOutlined />}
//               onClick={exportAllFiles}
//               loading={exportLoading}
//               size="large"
//               style={{ marginBottom: 8 }}
//             >
//               Экспортировать все файлы в ZIP
//             </Button>
//             <div style={{ color: '#666', fontSize: '12px' }}>
//               Или экспортируйте отдельные файлы ниже
//             </div>
//           </Space>
//         </div>
//       </div>
//     )

//   const renderFileItem = (file, index) => {
//     const fileStatusConfig =
//       FILE_STATUS_CONFIG[file.status] ||
//       FILE_STATUS_CONFIG[FILE_STATUS.PROCESSING]

//     return (
//       <div
//         key={file.fileName || index}
//         style={{ marginBottom: index < files.length - 1 ? 12 : 0 }}
//       >
//         <div
//           style={{
//             display: 'flex',
//             justifyContent: 'space-between',
//             alignItems: 'flex-start',
//             marginBottom: 8,
//           }}
//         >
//           <div style={{ flex: 1 }}>
//             <div style={{ fontWeight: '500', marginBottom: 4 }}>
//               {file.fileName}
//             </div>
//             <Progress
//               percent={file.progress || 0}
//               size="small"
//               style={{ marginBottom: 4 }}
//               status={fileStatusConfig.progressStatus}
//             />
//           </div>
//           <Space>
//             {showExportButtons && file.status === FILE_STATUS.COMPLETED && (
//               <Button
//                 type="link"
//                 icon={<DownloadOutlined />}
//                 onClick={() => exportSingleFile(file.fileName)}
//                 size="small"
//                 loading={exportLoading}
//               >
//                 Экспорт JSON
//               </Button>
//             )}
//             <Tag color={fileStatusConfig.color}>
//               {fileStatusConfig.text}
//               {file.status === FILE_STATUS.PROCESSING &&
//                 ` ${file.progress || 0}%`}
//             </Tag>
//           </Space>
//         </div>

//         {file.stats && (
//           <Row
//             gutter={8}
//             style={{ fontSize: '12px', color: '#666', marginTop: 4 }}
//           >
//             <Col span={6}>
//               IP: {file.stats.processedIPs}/{file.stats.totalIPs}
//             </Col>
//             <Col span={6} style={{ color: '#52c41a' }}>
//               Успешно: {file.stats.successful}
//             </Col>
//             <Col
//               span={6}
//               style={{ color: file.stats.failed > 0 ? '#ff4d4f' : '#666' }}
//             >
//               Ошибок: {file.stats.failed}
//             </Col>
//             <Col span={6}>Прогресс: {file.stats.progress}%</Col>
//           </Row>
//         )}

//         {file.error && (
//           <Alert
//             message={file.error}
//             type="error"
//             size="small"
//             showIcon
//             style={{ marginTop: 8 }}
//           />
//         )}

//         {index < files.length - 1 && <Divider style={{ margin: '12px 0' }} />}
//       </div>
//     )
//   }

//   const renderFilesList = () =>
//     files.length > 0 && (
//       <Card
//         title={`Обработка файлов (${files.length})`}
//         size="small"
//         style={{ marginBottom: 16 }}
//       >
//         {files.map(renderFileItem)}
//       </Card>
//     )

//   const renderStatusMessage = () => {
//     if (connectionStatus === CONNECTION_STATUS.ERROR) {
//       return (
//         <Alert
//           message="Произошла ошибка"
//           description="Попробуйте перезагрузить страницу и повторить попытку."
//           type="error"
//           showIcon
//         />
//       )
//     }

//     if (connectionStatus === CONNECTION_STATUS.COMPLETED) {
//       return (
//         <Alert
//           message="Обработка завершена"
//           description={
//             hasCompletedFiles
//               ? `Обработано ${completedFiles.length} файлов, ${progress.successful} IP адресов успешно. Вы можете экспортировать результаты.`
//               : 'Обработка завершена, но нет файлов для экспорта.'
//           }
//           type="success"
//           showIcon
//         />
//       )
//     }

//     return null
//   }

//   // Свернутый вид
//   const renderMinimizedView = () => (
//     <div
//       style={{
//         padding: '12px 16px',
//         background: '#f0f8ff',
//         border: '1px solid #d6e4ff',
//         borderRadius: '8px',
//         minWidth: 300,
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
//             cursor: 'pointer',
//           }}
//           onClick={() => onToggleMinimize?.()}
//         >
//           {statusConfig.icon}
//           <span style={{ fontWeight: '500', fontSize: '14px' }}>
//             Обработка: {progress.progress}%
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
//             title={isModal ? 'Свернуть' : 'Развернуть'}
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
//             <FileTextOutlined style={{ color: '#1890ff', fontSize: '10px' }} />
//             <span>
//               {progress.processedFiles || 0}/{progress.totalFiles || 0}
//             </span>
//           </div>
//         </Col>
//         <Col span={6}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//             <CloudUploadOutlined
//               style={{ color: '#1890ff', fontSize: '10px' }}
//             />
//             <span>
//               {progress.processedIPs || 0}/{progress.totalIPs || 0}
//             </span>
//           </div>
//         </Col>
//         <Col span={6}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//             <CheckCircleOutlined
//               style={{ color: '#52c41a', fontSize: '10px' }}
//             />
//             <span>{progress.successful || 0}</span>
//           </div>
//         </Col>
//         <Col span={6}>
//           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
//             <CloseCircleOutlined
//               style={{
//                 color: progress.failed > 0 ? '#ff4d4f' : '#666',
//                 fontSize: '10px',
//               }}
//             />
//             <span>{progress.failed || 0}</span>
//           </div>
//         </Col>
//       </Row>
//     </div>
//   )

//   // Полный вид
//   const renderFullView = () => (
//     <div>
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
//             <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
//               {statusConfig.icon}
//               <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
//               <span style={{ fontSize: '12px', color: '#999' }}>
//                 ID: {sessionIdRef.current?.substring(0, 8)}
//               </span>
//             </div>
//             <div style={{ display: 'flex', gap: '4px' }}>
//               {onToggleMinimize && (
//                 <Button
//                   type="text"
//                   icon={isModal ? <MinusOutlined /> : <ArrowsAltOutlined />}
//                   onClick={onToggleMinimize}
//                   title={isModal ? 'Свернуть' : 'Развернуть'}
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

//         {renderStatistics()}
//         {renderBatchInfo()}
//         {renderExportButtons()}
//       </Card>

//       {renderFilesList()}
//       {renderStatusMessage()}
//     </div>
//   )

//   return isMinimized ? renderMinimizedView() : renderFullView()
// }
