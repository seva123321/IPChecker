import { useState } from 'react'
import { Modal, Space, message } from 'antd'
import DatePicker from '../../DatePicker/DatePicker'
import cn from './ModalRange.module.scss'
import { initialDateRange } from '../../utils/constant'

const ModalRange = ({ open, setOpen, onExport, loading }) => {
  const [dateRange, setDateRange] = useState(initialDateRange)

  const handleOk = () => {
    if (dateRange && dateRange.length === 2) {
      const [startDate, endDate] = dateRange
      const formattedStartDate = startDate.format('YYYY-MM-DD')
      const formattedEndDate = endDate.format('YYYY-MM-DD')

      onExport('dateRange', {
        startDate: formattedStartDate,
        endDate: formattedEndDate,
      })
      setOpen(false)
      setDateRange(initialDateRange)
    } else {
      message.warning('Выберите обе даты')
    }
  }

  const handleCancel = () => {
    setOpen(false)
    setDateRange(initialDateRange)
  }

  return (
    <Modal
      style={{ textAlign: 'center' }}
      title="Экспорт по выбранным датам"
      open={open}
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
  )
}

export default ModalRange
