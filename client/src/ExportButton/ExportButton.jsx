import { Suspense, lazy, useState } from 'react'
import { Button, Dropdown, Modal, message } from 'antd'
import { DownloadOutlined, DownOutlined } from '@ant-design/icons'

const ModalRange = lazy(() => import('./components/ModalRange'))

const ModalFallBack = () => (
  <Modal style={{ textAlign: 'center' }} title="Экспорт по выбранным датам" />
)

export const ExportButton = ({ service }) => {
  const [isModalVisible, setIsModalVisible] = useState(false)

  const [loading, setLoading] = useState(false)

  const handleExport = async (type, params = {}) => {
    try {
      setLoading(true)
      let response

      switch (type) {
        case 'all':
          response = await service.exportAll()
          break
        case 'dateRange':
          if (!params.startDate || !params.endDate) {
            throw new Error('Выберите обе даты')
          }
          response = await service.exportByDateRange(
            params.startDate,
            params.endDate
          )
          break
        default:
          throw new Error('Неизвестный тип экспорта')
      }

      // Получаем имя файла из заголовков или создаем по умолчанию
      const contentDisposition = response.headers?.['content-disposition']
      let fileName = ''

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) {
          fileName = match[1]
        }
      }

      // Если имя файла не получено из заголовков, создаем по умолчанию
      if (!fileName) {
        if (type === 'all') {
          fileName = `all_db_export_${new Date().toISOString().slice(0, 10)}.zip`
        } else if (type === 'dateRange') {
          fileName = `export_${params.startDate}_to_${params.endDate}.zip`
        }
      }

      // Создаем blob из данных
      const blob = new Blob([response.data], {
        type: response.data.type || 'application/zip',
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()

      // Очистка
      setTimeout(() => {
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        message.success(`Экспорт ${type} данных завершен`)
      }, 100)
    } catch (error) {
      console.log(error)
      console.error('Ошибка при экспорте:', error)
      message.error(`Ошибка экспорта: ${error.error}`)
    } finally {
      setLoading(false)
    }
  }
  const showModal = () => {
    setIsModalVisible(true)
  }

  const menuItems = [
    {
      key: 'all',
      label: 'Экспорт всех данных БД',
      onClick: () => handleExport('all'),
    },
    {
      key: 'dateRange',
      label: 'Экспорт по выбранным датам',
      onClick: showModal,
    },
  ]

  return (
    <>
      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
        <Button type="primary" icon={<DownloadOutlined />} loading={loading}>
          Экспорт данных <DownOutlined />
        </Button>
      </Dropdown>

      <Suspense fallback={<ModalFallBack />}>
        <ModalRange
          open={isModalVisible}
          setOpen={setIsModalVisible}
          onExport={handleExport}
          loading={loading}
        />
      </Suspense>
    </>
  )
}
// import { useState } from 'react'
// import { Button, Dropdown, Menu, Modal, Space, message } from 'antd'
// import { DownloadOutlined, DownOutlined } from '@ant-design/icons'
// import DatePicker from '../DatePicker/DatePicker'
// import cn from './ExportButton.module.scss'
// import { initialDateRange } from '../utils/constant'

// export const ExportButton = ({ service }) => {
//   const [isModalVisible, setIsModalVisible] = useState(false)
//   const [dateRange, setDateRange] = useState(initialDateRange)
//   const [loading, setLoading] = useState(false)

//   const handleExport = async (type, params = {}) => {
//     try {
//       setLoading(true)
//       let response

//       switch (type) {
//         case 'all':
//         //   response = await service.exportAll()
//           response = await service.getData('files')
//           break
//         case 'session':
//           response = await service.exportSession(params.limit)
//           break
//         case 'dateRange':
//           if (!params.startDate || !params.endDate) {
//             throw new Error('Выберите обе даты')
//           }
//           response = await service.exportByDateRange(
//             params.startDate,
//             params.endDate
//           )
//           break
//         default:
//           throw new Error('Неизвестный тип экспорта')
//       }

//       if (!response || !response.data) {
//         throw new Error('Пустой ответ от сервера')
//       }

//       // Создание и скачивание файла
//       const blob = new Blob([JSON.stringify(response.data, null, 2)], {
//         type: 'application/json',
//       })

//       const url = window.URL.createObjectURL(blob)
//       const a = document.createElement('a')
//       a.href = url
//       a.download = `scan_report_${type}.json`
//       document.body.appendChild(a)
//       a.click()

//       setTimeout(() => {
//         window.URL.revokeObjectURL(url)
//         document.body.removeChild(a)
//       }, 100)

//       message.success(`Экспорт ${type} данных завершен`)
//     } catch (error) {
//       console.error('Ошибка при экспорте:', error)
//       message.error(`Ошибка экспорта: ${error.message}`)
//     } finally {
//       setLoading(false)
//     }
//   }

//   const showModal = () => {
//     setIsModalVisible(true)
//   }

//   const handleOk = () => {
//     if (dateRange && dateRange.length === 2) {
//       const [startDate, endDate] = dateRange
//       // Преобразуем даты в нужный формат (например, YYYY-MM-DD)
//       const formattedStartDate = startDate.format('YYYY-MM-DD')
//       const formattedEndDate = endDate.format('YYYY-MM-DD')

//       handleExport('dateRange', {
//         startDate: formattedStartDate,
//         endDate: formattedEndDate,
//       })
//       setIsModalVisible(false)
//       setDateRange(null)
//     } else {
//       message.warning('Выберите обе даты')
//     }
//   }

//   const handleCancel = () => {
//     setIsModalVisible(false)
//     setDateRange(null)
//   }

//   const menuItems = [
//     {
//       key: 'all',
//       label: 'Экспорт всех данных БД',
//       onClick: () => handleExport('all'),
//     },
//     // {
//     //   key: 'session',
//     //   label: 'Экспорт текущей сессии (100 записей)',
//     //   onClick: () => handleExport('session', { limit: 100 }),
//     // },
//     {
//       key: 'dateRange',
//       label: 'Экспорт по выбранным датам',
//       onClick: showModal,
//     },
//   ]

//   return (
//     <>
//       <Dropdown menu={{ items: menuItems }} trigger={['click']}>
//         <Button type="primary" icon={<DownloadOutlined />} loading={loading}>
//           Экспорт данных <DownOutlined />
//         </Button>
//       </Dropdown>

//       <Modal
//         style={{textAlign:'center'}}
//         title="Экспорт по выбранным датам"
//         open={isModalVisible}
//         onOk={handleOk}
//         onCancel={handleCancel}
//         okButtonProps={{ loading }}
//       >
//         <Space direction="vertical" style={{ width: '100%' }}>
//           <div className={cn.wrapper}>
//             <DatePicker dateRange={dateRange} setDateRange={setDateRange} />
//           </div>
//         </Space>
//       </Modal>
//     </>
//   )
// }
