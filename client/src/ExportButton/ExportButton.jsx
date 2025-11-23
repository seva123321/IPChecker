import { useState } from 'react'
import { Button, Dropdown, Menu, Modal, Space, message } from 'antd'
import { DownloadOutlined, DownOutlined } from '@ant-design/icons'
import DatePicker from '../DatePicker/DatePicker' 
import cn from './ExportButton.module.scss'
import { initialDateRange } from '../utils/constant'

export const ExportButton = ({ service }) => {
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [dateRange, setDateRange] = useState(initialDateRange)
  const [loading, setLoading] = useState(false)

  const handleExport = async (type, params = {}) => {
    try {
      setLoading(true)
      let response

      switch (type) {
        case 'all':
        //   response = await service.exportAll()
          response = await service.getData('files')
          break
        case 'session':
          response = await service.exportSession(params.limit)
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

      if (!response || !response.data) {
        throw new Error('Пустой ответ от сервера')
      }

      // Создание и скачивание файла
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json',
      })

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `scan_report_${type}.json`
      document.body.appendChild(a)
      a.click()

      setTimeout(() => {
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }, 100)

      message.success(`Экспорт ${type} данных завершен`)
    } catch (error) {
      console.error('Ошибка при экспорте:', error)
      message.error(`Ошибка экспорта: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const showModal = () => {
    setIsModalVisible(true)
  }

  const handleOk = () => {
    if (dateRange && dateRange.length === 2) {
      const [startDate, endDate] = dateRange
      // Преобразуем даты в нужный формат (например, YYYY-MM-DD)
      const formattedStartDate = startDate.format('YYYY-MM-DD')
      const formattedEndDate = endDate.format('YYYY-MM-DD')

      handleExport('dateRange', {
        startDate: formattedStartDate,
        endDate: formattedEndDate,
      })
      setIsModalVisible(false)
      setDateRange(null) 
    } else {
      message.warning('Выберите обе даты')
    }
  }

  const handleCancel = () => {
    setIsModalVisible(false)
    setDateRange(null)
  }

  const menuItems = [
    {
      key: 'all',
      label: 'Экспорт всех данных БД',
      onClick: () => handleExport('all'),
    },
    // {
    //   key: 'session',
    //   label: 'Экспорт текущей сессии (100 записей)',
    //   onClick: () => handleExport('session', { limit: 100 }),
    // },
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

      <Modal
        style={{textAlign:'center'}}
        title="Экспорт по выбранным датам"
        open={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        okButtonProps={{ loading }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div className={cn.wrapper}>
            <DatePicker dateRange={dateRange} setDateRange={setDateRange} />
          </div>
        </Space>
      </Modal>
    </>
  )
}

// // components/ExportButton/ExportButton.jsx
// import { useState } from 'react'
// import { Button, Dropdown, Menu, Modal, Input, Space, message } from 'antd'
// import { DownloadOutlined, DownOutlined } from '@ant-design/icons'

// export const ExportButton = ({ service }) => {
//   const [isModalVisible, setIsModalVisible] = useState(false)
//   const [rangeForm, setRangeForm] = useState({ startIp: '', endIp: '' })
//   const [loading, setLoading] = useState(false)

//   const handleExport = async (type, params = {}) => {
//     try {
//       setLoading(true)
//       let response

//       switch (type) {
//         case 'all':
//           response = await service.exportAll()
//           break
//         case 'session':
//           response = await service.exportSession(params.limit)
//           break
//         case 'range':
//           response = await service.exportRange(params.startIp, params.endIp)
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
//     if (rangeForm.startIp && rangeForm.endIp) {
//       handleExport('range', rangeForm)
//       setIsModalVisible(false)
//       setRangeForm({ startIp: '', endIp: '' })
//     } else {
//       message.warning('Введите оба IP-адреса')
//     }
//   }

//   const handleCancel = () => {
//     setIsModalVisible(false)
//     setRangeForm({ startIp: '', endIp: '' })
//   }

//   // Используем `items` вместо `children` для Menu
//   const menuItems = [
//     {
//       key: 'all',
//       label: 'Экспорт всех данных БД',
//       onClick: () => handleExport('all'),
//     },
//     {
//       key: 'session',
//       label: 'Экспорт текущей сессии (100 записей)',
//       onClick: () => handleExport('session', { limit: 100 }),
//     },
//     {
//       key: 'range',
//       label: 'Экспорт по диапазону IP',
//       onClick: showModal,
//     },
//   ]

//   return (
//     <>
//       {/* Используем `menu` вместо `overlay` */}
//       <Dropdown menu={{ items: menuItems }} trigger={['click']}>
//         <Button type="primary" icon={<DownloadOutlined />} loading={loading}>
//           Экспорт данных <DownOutlined />
//         </Button>
//       </Dropdown>

//       {/* Используем `open` вместо `visible` */}
//       <Modal
//         title="Экспорт по диапазону IP"
//         open={isModalVisible}
//         onOk={handleOk}
//         onCancel={handleCancel}
//         okButtonProps={{ loading }}
//       >
//         <Space direction="vertical" style={{ width: '100%' }}>
//           <div>
//             <Input
//               placeholder="Начальный IP (например: 192.168.1.1)"
//               value={rangeForm.startIp}
//               onChange={(e) =>
//                 setRangeForm({ ...rangeForm, startIp: e.target.value })
//               }
//             />
//           </div>
//           <div>
//             <Input
//               placeholder="Конечный IP (например: 192.168.1.254)"
//               value={rangeForm.endIp}
//               onChange={(e) =>
//                 setRangeForm({ ...rangeForm, endIp: e.target.value })
//               }
//             />
//           </div>
//         </Space>
//       </Modal>
//     </>
//   )
// }

// // components/ExportButton/ExportButton.jsx
// import React from 'react'
// import { Button } from 'antd'
// import { DownloadOutlined } from '@ant-design/icons'

// export const ExportButton = ({ service, fileName = 'scan_report.json' }) => {
//   const handleExportJson = async () => {
//     try {
//       const response = await service.getFileJson('files')

//       if (!response || !response.data) {
//         throw new Error('Пустой ответ от сервера')
//       }

//       // Создаём Blob из данных
//       const blob = new Blob([JSON.stringify(response.data, null, 2)], {
//         type: 'application/json',
//       })

//       // Создаём ссылку для скачивания
//       const url = window.URL.createObjectURL(blob)
//       const a = document.createElement('a')
//       a.href = url
//       a.download = fileName
//       document.body.appendChild(a)
//       a.click()

//       // Очистка
//       setTimeout(() => {
//         window.URL.revokeObjectURL(url)
//         document.body.removeChild(a)
//       }, 100)
//     } catch (error) {
//       console.error('Ошибка при скачивании файла:', error)
//       // Можно показать message.error из antd, если нужно
//     }
//   }

//   return (
//     <Button
//       type="primary"
//       icon={<DownloadOutlined />}
//       onClick={handleExportJson}
//       size="middle"
//     >
//       Экспорт JSON для БД
//     </Button>
//   )
// }
