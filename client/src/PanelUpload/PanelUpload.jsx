import { useState, useRef, useCallback } from 'react'
import { Tabs, message, Modal, FloatButton } from 'antd'
import { MinusOutlined, ArrowsAltOutlined } from '@ant-design/icons'
import cn from './PanelUpload.module.scss'
import { UploadArea } from './UploadArea'
import { ExportButton } from '../ExportButton/ExportButton'
import { ProgressTracker } from '../ProgressTracker/ProgressTracker'

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

  const generateClientId = useCallback(() => {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }, [])

  const handleUpload = async (files) => {
    if (files.length === 0) {
      message.warning('Выберите файлы для загрузки')
      return
    }

    // Сбрасываем состояние минимизации при новой загрузке
    setIsProgressMinimized(false)

    const newClientId = generateClientId()
    setCurrentClientId(newClientId)
    progressTrackerKeyRef.current += 1
    setProgressVisible(true)

    // Даем время для подключения SSE
    await new Promise((resolve) => setTimeout(resolve, 500))

    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
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

      message.success(
        `Файлы успешно отправлены (${activeTab === 'ip' ? 'IP-адреса' : 'JSON-данные'})`
      )

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
    setTimeout(() => {
      setProgressVisible(false)
      setCurrentClientId(null)
      setIsProgressMinimized(false)
    }, 5000)
  }

  const handleModalClose = () => {
    setProgressVisible(false)
    setCurrentClientId(null)
    setIsProgressMinimized(false)
  }

  const toggleProgressMinimize = () => {
    setIsProgressMinimized(!isProgressMinimized)
  }

  const getUploadText = () => {
    switch (activeTab) {
      case 'ip':
        return 'Нажмите или перетащите файл с IP-адресами (.txt) в эту область'
      case 'json':
        return 'Нажмите или перетащите JSON-файл в эту область'
      default:
        return 'Нажмите или перетащите файл в эту область'
    }
  }

  const getUploadHint = () => {
    switch (activeTab) {
      case 'ip':
        return 'Поддерживаются только файлы с расширением .txt'
      case 'json':
        return 'Поддерживаются только файлы с расширением .json'
      default:
        return 'Поддерживаются файлы с определенными расширениями'
    }
  }

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
        title={isProgressMinimized ? null : 'Обработка файлов'}
        open={progressVisible && !isProgressMinimized}
        onCancel={handleModalClose}
        footer={null}
        width={600}
        maskClosable={false}
        destroyOnClose={true}
        style={{
          top: 20,
          marginBottom: 20,
        }}
      >
        {currentClientId && (
          <ProgressTracker
            key={progressTrackerKeyRef.current}
            clientId={currentClientId}
            onComplete={handleProgressComplete}
            onToggleMinimize={toggleProgressMinimize}
          />
        )}
      </Modal>

      {/* Компактное отображение прогресса в углу экрана */}
      {progressVisible && isProgressMinimized && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: 24,
            width: 300,
            zIndex: 1000,
          }}
        >
          <ProgressTracker
            key={progressTrackerKeyRef.current}
            clientId={currentClientId}
            onComplete={handleProgressComplete}
            isMinimized={true}
            onToggleMinimize={toggleProgressMinimize}
          />
        </div>
      )}

      {/* Кнопка для разворачивания свернутого прогресса */}
      {progressVisible && isProgressMinimized && (
        <FloatButton
          icon={<ArrowsAltOutlined />}
          type="primary"
          style={{
            right: 24,
            bottom: 24,
          }}
          onClick={toggleProgressMinimize}
          tooltip="Развернуть окно прогресса"
        />
      )}
    </div>
  )
}

// import { useState } from 'react'
// import { Tabs, message } from 'antd'
// import cn from './PanelUpload.module.scss'

// // Импортируем специализированные компоненты
// import { UploadArea } from './UploadArea'
// import { ExportButton } from '../ExportButton/ExportButton'

// export function PanelUpload({ service }) {
//   const [activeTab, setActiveTab] = useState('ip') // 'ip', 'json', 'export'
//   const [fileList, setFileList] = useState([])
//   const [uploading, setUploading] = useState(false)

//   const handleTabChange = (key) => {
//     setActiveTab(key)
//     if (key !== 'export') {
//       setFileList([]) // очищаем список при смене таба (кроме export)
//     }
//   }

//   const handleUpload = async (files) => {
//     if (files.length === 0) {
//       message.warning('Выберите файлы для загрузки')
//       return
//     }
//     const formData = new FormData()
//     files.forEach((file) => {
//       formData.append('files', file)
//     })
//     setUploading(true)
//     try {
//       const endpoint =
//         activeTab === 'ip' ? '/files/upload/ip' : '/files/upload/json'

//       // Используем service для отправки
//       const response = await service.uploadFiles(endpoint, formData)

//       message.success(
//         `Файлы успешно отправлены (${activeTab === 'ip' ? 'IP-адреса' : 'JSON-данные'})`
//       )

//       setFileList([]) // очищаем после отправки
//     } catch (err) {
//       console.error('Ошибка загрузки:', err)
//       message.error(`Ошибка: ${err.response?.data?.message || err.message}`)
//     } finally {
//       setUploading(false)
//     }
//   }

//   // Определяем текст в зависимости от активной вкладки
//   const getUploadText = () => {
//     switch (activeTab) {
//       case 'ip':
//         return 'Нажмите или перетащите файл с IP-адресами (.txt) в эту область'
//       case 'json':
//         return 'Нажмите или перетащите JSON-файл в эту область'
//       default:
//         return 'Нажмите или перетащите файл в эту область'
//     }
//   }

//   // Определяем подсказку в зависимости от активной вкладки
//   const getUploadHint = () => {
//     switch (activeTab) {
//       case 'ip':
//         return 'Поддерживаются только файлы с расширением .txt'
//       case 'json':
//         return 'Поддерживаются только файлы с расширением .json'
//       default:
//         return 'Поддерживаются файлы с определенными расширениями'
//     }
//   }

//   return (
//     <div className={cn['panel-upload']}>
//       <h2>Админ панель</h2>

//       {/* Контейнер для табов и кнопки экспорта */}
//       <div className={cn['tabs-and-export']}>
//         <Tabs
//           activeKey={activeTab}
//           onChange={handleTabChange}
//           className={cn['upload-tabs']}
//           size="small"
//           items={[
//             {
//               label: 'IP-файл (.txt)',
//               key: 'ip',
//               children: null,
//             },
//             {
//               label: 'JSON-отчёт (.json)',
//               key: 'json',
//               children: null,
//             },
//           ]}
//         />
//         <ExportButton service={service} />
//       </div>

//       <UploadArea
//         activeTab={activeTab}
//         fileList={fileList}
//         setFileList={setFileList}
//         uploading={uploading}
//         onUpload={handleUpload}
//         uploadText={getUploadText()}
//         uploadHint={getUploadHint()}
//       />
//     </div>
//   )
// }
