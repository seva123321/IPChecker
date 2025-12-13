import { useState, useRef, useCallback } from 'react'
import { Tabs, message, Modal } from 'antd'
import cn from './PanelUpload.module.scss'
import { UploadArea } from './UploadArea'
import { ExportButton } from '../ExportButton/ExportButton'
import { ProgressTracker } from '../ProgressTracker/ProgressTracker'
import {
  decodeFileName,
  encodeFileName,
  generateClientId,
} from '../utils/function'
import { JSONUploadProgress } from '../JSONUploadProgress'

export function PanelUpload({ service }) {
  const [activeTab, setActiveTab] = useState('ip')
  const [fileList, setFileList] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progressVisible, setProgressVisible] = useState(false)
  const [isProgressMinimized, setIsProgressMinimized] = useState(false)
  const [currentClientId, setCurrentClientId] = useState(null)
  const progressTrackerKeyRef = useRef(0)

  const handleTabChange = (key) => {
    setActiveTab(key)
    if (key !== 'export') {
      setFileList([])
    }
  }

  const handleUpload = async (files) => {
    setIsProgressMinimized(false)

    const newClientId = generateClientId()
    setCurrentClientId(newClientId)
    progressTrackerKeyRef.current += 1
    setProgressVisible(true)

    // Время для подключения SSE
    await new Promise((resolve) => setTimeout(resolve, 500))

    const formData = new FormData()

    // Добавляем файлы с закодированными именами
    files.forEach((file) => {
      const encodedFileName = encodeFileName(file.name)
      const encodedFile = new File([file], encodedFileName, {
        type: file.type,
        lastModified: file.lastModified,
      })

      formData.append('files', encodedFile)
    })

    formData.append('clientId', newClientId)

    setUploading(true)

    try {
      const endpoint =
        activeTab === 'ip' ? '/files/upload/ip' : '/files/upload/json'

      const response = await service.uploadFiles(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      message.success('Файлы успешно отправлены')
      setFileList([])
    } catch (err) {
      console.error('Ошибка загрузки:', err)
      message.error(`Ошибка: ${err.response?.data?.message || err.message}`)
      setProgressVisible(false)
      setCurrentClientId(null)
    } finally {
      setUploading(false)
    }
  }

  const handleProgressComplete = (processedFiles) => {
    console.log('Обработка завершена:', processedFiles)

    message.success('Обработка всех файлов завершена!')

    // Автоматически закрываем через 5 секунд
    // setTimeout(() => {
    //   setProgressVisible(false)
    //   setCurrentClientId(null)
    //   setIsProgressMinimized(false)
    // }, 5000)
  }

  const handleModalClose = () => {
    setProgressVisible(false)
    setCurrentClientId(null)
    setIsProgressMinimized(false)
  }

  const toggleProgressMinimize = () => {
    setIsProgressMinimized(!isProgressMinimized)
  }

  const getUploadText = useCallback(() => {
    switch (activeTab) {
      case 'ip':
        return 'Нажмите или перетащите файл с IP-адресами (.txt) в эту область'
      case 'json':
        return 'Нажмите или перетащите JSON-файл в эту область'
      default:
        return 'Нажмите или перетащите файл в эту область'
    }
  }, [activeTab])

  const getUploadHint = useCallback(() => {
    switch (activeTab) {
      case 'ip':
        return 'Поддерживаются только файлы с расширением .txt'
      case 'json':
        return 'Поддерживаются только файлы с расширением .json'
      default:
        return 'Поддерживаются файлы с определенными расширениями'
    }
  }, [activeTab])

  return (
    <div className={cn['panel-upload']}>
      <h2>Админ панель</h2>

      <div className={cn['tabs-and-export']}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          className={cn['upload-tabs']}
          size="small"
          items={[
            {
              label: 'IP-файл (.txt)',
              key: 'ip',
              children: null,
            },
            {
              label: 'JSON-отчёт (.json)',
              key: 'json',
              children: null,
            },
          ]}
        />
        <ExportButton service={service} />
      </div>

      <UploadArea
        activeTab={activeTab}
        fileList={fileList}
        setFileList={setFileList}
        uploading={uploading}
        onUpload={handleUpload}
        uploadText={getUploadText()}
        uploadHint={getUploadHint()}
      />

      {/* Модальное окно с прогрессом */}
      <Modal
        title={
          isProgressMinimized
            ? null
            : `${activeTab === 'json' ? 'Импорт JSON файлов' : 'Обработка IP файлов'}`
        }
        open={progressVisible && !isProgressMinimized}
        onCancel={handleModalClose}
        footer={null}
        width={activeTab === 'json' ? 800 : 600}
        maskClosable={false}
        destroyOnClose={true}
        style={{
          top: 20,
          marginBottom: 20,
        }}
      >
        {currentClientId && (
          <>
            {activeTab === 'json' ? (
              <JSONUploadProgress
                key={`json-${progressTrackerKeyRef.current}`}
                clientId={currentClientId}
                onComplete={handleProgressComplete}
                onToggleMinimize={toggleProgressMinimize}
                decodeFileName={decodeFileName}
                showExportButtons={false}
              />
            ) : (
              <ProgressTracker
                key={`ip-${progressTrackerKeyRef.current}`}
                clientId={currentClientId}
                onComplete={handleProgressComplete}
                onToggleMinimize={toggleProgressMinimize}
                decodeFileName={decodeFileName}
              />
            )}
          </>
        )}
      </Modal>

      {/* Компактное отображение прогресса в углу экрана */}
      {progressVisible && isProgressMinimized && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: 24,
            width: activeTab === 'json' ? 350 : 300,
            zIndex: 1000,
          }}
        >
          {activeTab === 'json' ? (
            <JSONUploadProgress
              key={`json-mini-${progressTrackerKeyRef.current}`}
              clientId={currentClientId}
              onComplete={handleProgressComplete}
              isMinimized={true}
              onToggleMinimize={toggleProgressMinimize}
              decodeFileName={decodeFileName}
            />
          ) : (
            <ProgressTracker
              key={`ip-mini-${progressTrackerKeyRef.current}`}
              clientId={currentClientId}
              onComplete={handleProgressComplete}
              isMinimized={true}
              onToggleMinimize={toggleProgressMinimize}
              decodeFileName={decodeFileName}
            />
          )}
        </div>
      )}
    </div>
  )
}
