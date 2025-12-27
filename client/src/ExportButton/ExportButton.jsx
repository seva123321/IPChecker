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
