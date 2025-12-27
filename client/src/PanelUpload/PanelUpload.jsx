import { useState, useRef, useCallback, useEffect } from 'react'
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
import { ProgressPortal } from '../ProgressPortal'

export function PanelUpload({ service }) {
  const [activeTab, setActiveTab] = useState('ip')
  const [fileList, setFileList] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progressVisible, setProgressVisible] = useState(false)
  const [isProgressMinimized, setIsProgressMinimized] = useState(false)
  const [currentClientId, setCurrentClientId] = useState(null)
  const [uploadSessionId, setUploadSessionId] = useState(null)
  
  // Реф для хранения состояния вне зависимости от перерисовок
  const processStateRef = useRef({
    clientId: null,
    sessionId: null,
    isActive: false
  })

  // Реф для модального окна
  const modalRef = useRef(null)

  // Обработчик изменений вкладок
  const handleTabChange = (key) => {
    setActiveTab(key)
    if (key !== 'export') {
      setFileList([])
    }
  }

  const handleUpload = async (files) => {
    // Если уже есть активный процесс, используем его
    if (processStateRef.current.isActive && processStateRef.current.sessionId) {
      console.log('Используем существующий процесс:', processStateRef.current.sessionId)
      
      // Если прогресс свернут - разворачиваем
      if (isProgressMinimized) {
        setIsProgressMinimized(false)
      }
      
      // Показываем модальное окно если оно скрыто
      if (!progressVisible) {
        setProgressVisible(true)
      }
      
      return
    }

    const newClientId = generateClientId()
    const newSessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Обновляем состояние процесса
    processStateRef.current = {
      clientId: newClientId,
      sessionId: newSessionId,
      isActive: true
    }

    setCurrentClientId(newClientId)
    setUploadSessionId(newSessionId)
    setIsProgressMinimized(false)
    setProgressVisible(true)

    const formData = new FormData()
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
      const endpoint = activeTab === 'ip' 
        ? '/files/upload/ip' 
        : '/files/upload/json'

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
      
      // Если ошибка загрузки, закрываем прогресс через 3 секунды
      setTimeout(() => {
        if (processStateRef.current.sessionId === newSessionId) {
          handleModalClose()
        }
      }, 3000)
    } finally {
      setUploading(false)
    }
  }

  const handleProgressComplete = (processedFiles) => {
    console.log('Обработка завершена:', processedFiles)
    message.success('Обработка всех файлов завершена!')
    
    // Помечаем процесс как завершенный
    processStateRef.current.isActive = false
    
    // Автоматически закрываем если свернуто
    if (isProgressMinimized) {
      setTimeout(() => {
        handleModalClose()
      }, 3000)
    }
  }

  const handleModalClose = () => {
    console.log('Закрытие прогресса для sessionId:', uploadSessionId)
    
    // Сбрасываем состояние процесса
    processStateRef.current = {
      clientId: null,
      sessionId: null,
      isActive: false
    }
    
    setProgressVisible(false)
    setCurrentClientId(null)
    setUploadSessionId(null)
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

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      processStateRef.current = {
        clientId: null,
        sessionId: null,
        isActive: false
      }
    }
  }, [])

  // Получаем ключ для прогресса
  const getProgressKey = () => {
    return uploadSessionId || 'default'
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

      {/* Единый портал для прогресса */}
      <ProgressPortal>
        {/* Модальное окно для полного вида */}
        {progressVisible && !isProgressMinimized && currentClientId && (
          <Modal
            key={`modal-${getProgressKey()}`}
            title={`${activeTab === 'json' ? 'Импорт JSON файлов' : 'Обработка IP файлов'}`}
            open={true}
            onCancel={handleModalClose}
            footer={null}
            width={activeTab === 'json' ? 800 : 600}
            maskClosable={false}
            destroyOnClose={false}
            closable={true}
            style={{
              top: 20,
              marginBottom: 20,
            }}
            afterClose={() => {
              console.log('Modal afterClose')
            }}
          >
            {activeTab === 'json' ? (
              <JSONUploadProgress
                key={`json-${getProgressKey()}`}
                clientId={currentClientId}
                sessionId={uploadSessionId}
                onComplete={handleProgressComplete}
                onClose={handleModalClose}
                onToggleMinimize={toggleProgressMinimize}
                decodeFileName={decodeFileName}
                isMinimized={false}
                isModal={true}
              />
            ) : (
              <ProgressTracker
                key={`ip-${getProgressKey()}`}
                clientId={currentClientId}
                sessionId={uploadSessionId}
                onComplete={handleProgressComplete}
                onClose={handleModalClose}
                onToggleMinimize={toggleProgressMinimize}
                decodeFileName={decodeFileName}
                isMinimized={false}
                isModal={true}
              />
            )}
          </Modal>
        )}
      </ProgressPortal>

      {/* Свернутый вид в углу экрана - рендерим всегда если есть активный процесс */}
      {progressVisible && isProgressMinimized && currentClientId && (
        <div
          key={`minimized-${getProgressKey()}`}
          style={{
            position: 'fixed',
            bottom: 24,
            left: 24,
            zIndex: 1000,
          }}
        >
          {activeTab === 'json' ? (
            <JSONUploadProgress
              key={`json-minimized-${getProgressKey()}`}
              clientId={currentClientId}
              sessionId={uploadSessionId}
              onComplete={handleProgressComplete}
              onClose={handleModalClose}
              onToggleMinimize={toggleProgressMinimize}
              decodeFileName={decodeFileName}
              isMinimized={true}
              isModal={false}
            />
          ) : (
            <ProgressTracker
              key={`ip-minimized-${getProgressKey()}`}
              clientId={currentClientId}
              sessionId={uploadSessionId}
              onComplete={handleProgressComplete}
              onClose={handleModalClose}
              onToggleMinimize={toggleProgressMinimize}
              decodeFileName={decodeFileName}
              isMinimized={true}
              isModal={false}
            />
          )}
        </div>
      )}
    </div>
  )
}

// import { useState, useRef, useCallback } from 'react'
// import { Tabs, message, Modal } from 'antd'
// import cn from './PanelUpload.module.scss'
// import { UploadArea } from './UploadArea'
// import { ExportButton } from '../ExportButton/ExportButton'
// import { ProgressTracker } from '../ProgressTracker/ProgressTracker'
// import {
//   decodeFileName,
//   encodeFileName,
//   generateClientId,
// } from '../utils/function'
// import { JSONUploadProgress } from '../JSONUploadProgress'
// import { ProgressPortal } from '../ProgressPortal'

// export function PanelUpload({ service }) {
//   const [activeTab, setActiveTab] = useState('ip')
//   const [fileList, setFileList] = useState([])
//   const [uploading, setUploading] = useState(false)
//   const [progressVisible, setProgressVisible] = useState(false)
//   const [isProgressMinimized, setIsProgressMinimized] = useState(false)
//   const [currentClientId, setCurrentClientId] = useState(null)
//   // const progressTrackerKeyRef = useRef(0)

//   const handleTabChange = (key) => {
//     setActiveTab(key)
//     if (key !== 'export') {
//       setFileList([])
//     }
//   }

//   const handleUpload = async (files) => {
//     setIsProgressMinimized(false)

//     const newClientId = generateClientId()
//     setCurrentClientId(newClientId)
//     // progressTrackerKeyRef.current += 1
//     setProgressVisible(true)

//     // Время для подключения SSE
//     await new Promise((resolve) => setTimeout(resolve, 500))

//     const formData = new FormData()

//     // Добавляем файлы с закодированными именами
//     files.forEach((file) => {
//       const encodedFileName = encodeFileName(file.name)
//       const encodedFile = new File([file], encodedFileName, {
//         type: file.type,
//         lastModified: file.lastModified,
//       })

//       formData.append('files', encodedFile)
//     })

//     formData.append('clientId', newClientId)

//     setUploading(true)

//     try {
//       const endpoint =
//         activeTab === 'ip' ? '/files/upload/ip' : '/files/upload/json'

//       const response = await service.uploadFiles(endpoint, formData, {
//         headers: {
//           'Content-Type': 'multipart/form-data',
//         },
//       })

//       message.success('Файлы успешно отправлены')
//       setFileList([])
//     } catch (err) {
//       console.error('Ошибка загрузки:', err)
//       message.error(`Ошибка: ${err.response?.data?.message || err.message}`)
//       setProgressVisible(false)
//       setCurrentClientId(null)
//     } finally {
//       setUploading(false)
//     }
//   }

//   const handleProgressComplete = (processedFiles) => {
//     console.log('Обработка завершена:', processedFiles)
//     message.success('Обработка всех файлов завершена!')
//   }

//   const handleModalClose = () => {
//     setProgressVisible(false)
//     setCurrentClientId(null)
//     setIsProgressMinimized(false)
//   }

//   const toggleProgressMinimize = () => {
//     setIsProgressMinimized(!isProgressMinimized)
//   }

//   const getUploadText = useCallback(() => {
//     switch (activeTab) {
//       case 'ip':
//         return 'Нажмите или перетащите файл с IP-адресами (.txt) в эту область'
//       case 'json':
//         return 'Нажмите или перетащите JSON-файл в эту область'
//       default:
//         return 'Нажмите или перетащите файл в эту область'
//     }
//   }, [activeTab])

//   const getUploadHint = useCallback(() => {
//     switch (activeTab) {
//       case 'ip':
//         return 'Поддерживаются только файлы с расширением .txt'
//       case 'json':
//         return 'Поддерживаются только файлы с расширением .json'
//       default:
//         return 'Поддерживаются файлы с определенными расширениями'
//     }
//   }, [activeTab])

//   // // Один ключ для всех экземпляров прогресс-трекера
//   // const progressKey = currentClientId 
//   //   ? `${activeTab}-${progressTrackerKeyRef.current}` 
//   //   : null

//   return (
//     <div className={cn['panel-upload']}>
//       <h2>Админ панель</h2>

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

//  {/* Единый портал для прогресса */}
//     <ProgressPortal>

//       {/* Модальное окно для полного вида */}
//       {progressVisible && !isProgressMinimized && (
//         <Modal
//           title={`${activeTab === 'json' ? 'Импорт JSON файлов' : 'Обработка IP файлов'}`}
//           open={true}
//           onCancel={handleModalClose}
//           footer={null}
//           width={activeTab === 'json' ? 800 : 600}
//           maskClosable={false}
//           destroyOnClose={true}
//           style={{
//             top: 20,
//             marginBottom: 20,
//           }}
//         >
//           {currentClientId && (
//             <>
//               {activeTab === 'json' ? (
//                 <JSONUploadProgress
//                   // key={progressKey}
//                   clientId={currentClientId}
//                   onComplete={handleProgressComplete}
//                   onToggleMinimize={toggleProgressMinimize}
//                   decodeFileName={decodeFileName}
//                   isMinimized={false}
//                 />
//               ) : (
//                 <ProgressTracker
//                   // key={progressKey}
//                   clientId={currentClientId}
//                   onComplete={handleProgressComplete}
//                   onToggleMinimize={toggleProgressMinimize}
//                   decodeFileName={decodeFileName}
//                   isMinimized={false}
//                 />
//               )}
//             </>
//           )}
//         </Modal>
//       )}
//     </ProgressPortal>


//       {/* Свернутый вид в углу экрана */}
//       {progressVisible && isProgressMinimized && (
//         <div
//           style={{
//             position: 'fixed',
//             bottom: 24,
//             left: 24,
//             zIndex: 1000,
//           }}
//         >
//           {currentClientId && (
//             <>
//               {activeTab === 'json' ? (
//                 <JSONUploadProgress
//                   // key={progressKey}
//                   clientId={currentClientId}
//                   onComplete={handleProgressComplete}
//                   onToggleMinimize={toggleProgressMinimize}
//                   decodeFileName={decodeFileName}
//                   isMinimized={true}
//                 />
//               ) : (
//                 <ProgressTracker
//                   // key={progressKey}
//                   clientId={currentClientId}
//                   onComplete={handleProgressComplete}
//                   onToggleMinimize={toggleProgressMinimize}
//                   decodeFileName={decodeFileName}
//                   isMinimized={true}
//                 />
//               )}
//             </>
//           )}
//         </div>
//       )}
//     </div>
//   )
// }
