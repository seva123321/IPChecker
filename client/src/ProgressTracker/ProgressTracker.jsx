// ! Экспорт не работает НО ПРОЦЕССЫ отображаются корректно
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

export const ProgressTracker = ({
  clientId,
  onComplete,
  isMinimized = false,
  onToggleMinimize,
  decodeFileName = (fileName) => fileName,
  showExportButtons = true,
}) => {
  const [connectionStatus, setConnectionStatus] = useState('connecting')

  // Основное состояние прогресса
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

  // Счетчики для корректной синхронизации
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

    // Временные счетчики для файла в обработке
    currentFileStats: {
      totalIPs: 0,
      processedIPs: 0,
      successful: 0,
      failed: 0,
      progress: 0,
    },
  })

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
      // Сбрасываем счетчики при новом подключении
      progressCountersRef.current = {
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
        currentFileStats: {
          totalIPs: 0,
          processedIPs: 0,
          successful: 0,
          failed: 0,
          progress: 0,
        },
      }
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('SSE Event:', data)

        switch (data.type) {
          case 'connected':
            setConnectionStatus('connected')
            setCurrentOperation('Готов к обработке файлов')
            break

          case 'files_start':
            // Начало обработки нескольких файлов
            progressCountersRef.current.filesTotal = data.totalFiles || 0
            setCurrentOperation(`Начата обработка ${data.totalFiles} файлов`)
            setProgress((prev) => ({
              ...prev,
              totalFiles: data.totalFiles || 0,
            }))
            break

          case 'file_start':
            const decodedFileName = decodeFileName(data.fileName)
            setFiles((prev) => {
              const exists = prev.find((f) => f.fileName === decodedFileName)
              if (exists) return prev

              return [
                ...prev,
                {
                  fileName: decodedFileName,
                  status: 'processing',
                  progress: 0,
                  fileIndex: data.fileIndex,
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

            // Увеличиваем счетчик обрабатываемых файлов
            progressCountersRef.current.filesProcessed++

            setConnectionStatus('processing')
            setCurrentOperation(`Начата обработка файла: ${decodedFileName}`)

            // Обновляем общую статистику
            setProgress((prev) => ({
              ...prev,
              processedFiles: progressCountersRef.current.filesProcessed,
              totalFiles: progressCountersRef.current.filesTotal,
            }))
            break

          case 'processing_started':
            // Начало обработки IP для текущего файла
            progressCountersRef.current.currentFileStats = {
              totalIPs: data.totalIPs || 0,
              processedIPs: 0,
              successful: 0,
              failed: 0,
              progress: 0,
            }

            // Добавляем к общему количеству IP
            progressCountersRef.current.ipTotal += data.totalIPs || 0

            setFiles((prev) =>
              prev.map((file) =>
                file.fileName === decodeFileName(data.fileName)
                  ? {
                      ...file,
                      stats: progressCountersRef.current.currentFileStats,
                    }
                  : file
              )
            )

            setCurrentOperation(
              `Начата обработка ${data.totalIPs || 0} IP-адресов`
            )

            // Обновляем общую статистику
            setProgress((prev) => ({
              ...prev,
              totalIPs: progressCountersRef.current.ipTotal,
            }))
            break

          case 'processing_completed':
            progressCountersRef.current.ipSuccessful += data.successful || 0
            progressCountersRef.current.ipFailed += data.failed || 0

            break
          case 'batch_complete':
            // Обновляем статистику текущего файла
            const updatedFileStats = {
              totalIPs: data.totalIPs || 0,
              processedIPs: data.processedIPs || 0,
              successful: data.successful || 0,
              failed: data.failed || 0,
              progress: data.progress || 0,
            }

            // Обновляем глобальные счетчики IP (суммируем)
            progressCountersRef.current.ipProcessed += data.processedIPs || 0


            // Обновляем прогресс файла
            setFiles((prev) =>
              prev.map((file) =>
                file.fileName === decodeFileName(data.fileName)
                  ? {
                      ...file,
                      progress: data.progress || 0,
                      stats: { ...updatedFileStats },
                    }
                  : file
              )
            )

            setCurrentOperation(
              `Обработано ${data.processedIPs || 0} из ${data.totalIPs || 0} IP (${data.progress || 0}%)`
            )

            // Обновляем общую статистику
            setProgress((prev) => ({
              ...prev,
              processedIPs: progressCountersRef.current.ipProcessed,
              successful: progressCountersRef.current.ipSuccessful,
              failed: progressCountersRef.current.ipFailed,
              progress:
                progressCountersRef.current.ipTotal > 0
                  ? Math.round(
                      (progressCountersRef.current.ipProcessed /
                        progressCountersRef.current.ipTotal) *
                        100
                    )
                  : 0,
            }))
            break

          case 'file_complete':
            progressCountersRef.current.filesCompleted++

            setFiles((prev) =>
              prev.map((file) =>
                file.fileName === decodeFileName(data.fileName)
                  ? {
                      ...file,
                      status: 'completed',
                      progress: 100,
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

            // Обновляем общую статистику
            setProgress((prev) => ({
              ...prev,
              processedFiles: progressCountersRef.current.filesProcessed,
              totalFiles: progressCountersRef.current.filesTotal,
            }))
            break

          case 'file_error':
            progressCountersRef.current.filesError++

            setFiles((prev) =>
              prev.map((file) =>
                file.fileName === decodeFileName(data.fileName)
                  ? {
                      ...file,
                      status: 'error',
                      error: data.error,
                      progress: 0,
                    }
                  : file
              )
            )
            setCurrentOperation(
              `Ошибка обработки файла: ${decodeFileName(data.fileName)}`
            )
            break

          case 'all_complete':
            setConnectionStatus('completed')
            setProgress((prev) => ({
              ...prev,
              progress: 100,
              processedFiles: progressCountersRef.current.filesTotal,
              processedIPs: progressCountersRef.current.ipTotal,
              successful: progressCountersRef.current.ipSuccessful,
              failed: progressCountersRef.current.ipFailed,
            }))
            setCurrentOperation('Все файлы успешно обработаны')
            onComplete?.()
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

  const exportSingleFile = async (fileName) => {
    try {
      setExportLoading(true)
      console.log('Exporting file:', fileName)

      // Используем оригинальное имя файла для экспорта
      const fileToExport = files.find((f) => f.fileName === fileName)
      const exportName = fileToExport?.originalFileName || fileName

      const response = await fetch(
        `http://localhost:5000/files/export/${fileName}`
      )
      // const response = await fetch(`http://localhost:5000/files/export/${encodeURIComponent(exportName)}`)

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Файл не найден на сервере')
        }
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()

      // Получаем имя файла из заголовка или используем оригинальное
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
      const sessionId = clientId
      console.log('Exporting all files for session:', sessionId)

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
      a.download = `export_${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      console.log('All files exported successfully')
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

        {/* Статистика - ИСПРАВЛЕННЫЕ ПОДСЧЕТЫ */}
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Файлов"
              value={progress.processedFiles || completedFiles.length}
              suffix={progress.totalFiles > 0 ? `/ ${progress.totalFiles}` : ''}
              prefix={<FileTextOutlined />}
              valueStyle={{
                fontSize: '18px',
                color:
                  progress.processedFiles === progress.totalFiles &&
                  progress.totalFiles > 0
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

        {/* Информация о батчах */}
        {progress.totalBatches > 0 && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid #f0f0f0',
            }}
          >
            <div
              style={{ color: '#666', fontSize: '12px', textAlign: 'center' }}
            >
              Батч: {progress.currentBatch} / {progress.totalBatches}
            </div>
          </div>
        )}

        {/* Кнопки экспорта */}
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

              {/* Детальная статистика по файлу */}
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
