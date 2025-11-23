import { useState } from 'react'
import { Tabs } from 'antd'
import cn from './PanelUpload.module.scss'

// Импортируем специализированные компоненты
import { UploadArea } from './UploadArea'
import { ExportButton } from '../ExportButton/ExportButton'

export function PanelUpload({ service }) {
  const [activeTab, setActiveTab] = useState('ip') // 'ip', 'json', 'export'
  const [fileList, setFileList] = useState([])
  const [uploading, setUploading] = useState(false)

  const handleTabChange = (key) => {
    setActiveTab(key)
    if (key !== 'export') {
      setFileList([]) // очищаем список при смене таба (кроме export)
    }
  }

  const handleUpload = async (files) => {
    if (files.length === 0) {
      message.warning('Выберите файлы для загрузки')
      return
    }
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })
    setUploading(true)
    try {
      const endpoint =
        activeTab === 'ip' ? '/files/upload/ip' : '/files/upload/json'

      // Используем service для отправки
      const response = await service.uploadFiles(endpoint, formData)

      message.success(
        `Файлы успешно отправлены (${activeTab === 'ip' ? 'IP-адреса' : 'JSON-данные'})`
      )

      setFileList([]) // очищаем после отправки
    } catch (err) {
      console.error('Ошибка загрузки:', err)
      message.error(`Ошибка: ${err.response?.data?.message || err.message}`)
    } finally {
      setUploading(false)
    }
  }

  // Определяем текст в зависимости от активной вкладки
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

  // Определяем подсказку в зависимости от активной вкладки
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

      {/* Контейнер для табов и кнопки экспорта */}
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
    </div>
  )
}

// import  { useState } from 'react'
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
//             { label: 'IP-файл (.txt)', key: 'ip' },
//             { label: 'JSON-отчёт (.json)', key: 'json' },
//           ]}
//         ></Tabs>
//         <ExportButton service={service} />
//       </div>

//       <UploadArea
//         activeTab={activeTab}
//         fileList={fileList}
//         setFileList={setFileList}
//         uploading={uploading}
//         onUpload={handleUpload}
//       />
//     </div>
//   )
// }
// import React, { useState } from 'react'
// import { Upload, Tabs, message } from 'antd'
// import cn from './PanelUpload.module.scss'

// // Импортируем специализированные компоненты
// import { UploadArea } from './UploadArea'
// import { ExportButton } from '../ExportButton/ExportButton'

// const { Dragger } = Upload
// const { TabPane } = Tabs

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

//   const title =
//     activeTab === 'ip'
//       ? 'Загрузить IP-адреса (Доступность nmap, whois)'
//       : activeTab === 'json'
//         ? 'Загрузить JSON-отчёт (Обновление БД)'
//         : 'Экспорт JSON-отчёта'

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
//           // items={[
//           //   { label: 'IP-файл (.txt)', key: 'ip' },
//           //   { label: 'JSON-отчёт (.json)', key: 'json' },
//           // ]}
//         >
//           <TabPane tab="IP-файл (.txt)" key="ip" />
//           <TabPane tab="JSON-отчёт (.json)" key="json" />
//         </Tabs>
//         <ExportButton service={service} />
//       </div>

//       <UploadArea
//         activeTab={activeTab}
//         fileList={fileList}
//         setFileList={setFileList}
//         uploading={uploading}
//         onUpload={handleUpload}
//       />
//     </div>
//   )
// }
