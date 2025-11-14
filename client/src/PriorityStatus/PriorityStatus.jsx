import React, { useState } from 'react'
import classNames from 'classnames'
import cn from './PriorityStatus.module.scss'
import { Modal, Select, Input, Button } from 'antd'

const PriorityStatus = ({ priority, onUpdate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState('select')
  const [newPriority, setNewPriority] = useState(
    priority?.id ? priority?.id?.toString() : '' //@TODO   priority.id ? priority.id.toString() : ''
  )
  const [comment, setComment] = useState('')

  const handleNextStep = () => {
    setCurrentStep('confirm')
  }

  const handleCancel = () => {
    setIsModalOpen(false)
    setCurrentStep('select')
  }

  const handleSubmit = async () => {
    onUpdate(newPriority, comment)
    setIsModalOpen(false)
    setCurrentStep('select')
  }

  const handleModalOpen = ()=> {
    setIsModalOpen(true)
    //@TODO get comment
  }

  return (
    <>
      {priority && (
        <span
          className={classNames(cn.statusPriority, {
            [cn.usual]: priority.id === 1,
            [cn.interesting]: priority.id === 2,
            [cn.important]: priority.id === 3,
          })}
          title={'Статус'}
          onClick={handleModalOpen}
        >
          {priority.name}
        </span>
      )}
      <Modal
        open={isModalOpen}
        onCancel={handleCancel}
        footer={null} // Убираем стандартные кнопки
      >
        {currentStep === 'select' && (
          <>
            <h2>Обновление статуса</h2>
            <Select
              value={newPriority}
              onChange={(value) => setNewPriority(value)}
              placeholder="Выберите приоритет"
              className={cn.fixedWidthSelect}
              defaultValue={priority ? priority?.id?.toString() : ''}
            >
              <Select.Option value="1">Обычный</Select.Option>
              <Select.Option value="2">Интересный</Select.Option>
              <Select.Option value="3">Важный</Select.Option>
            </Select>
            <Input.TextArea
              placeholder="Комментарий"
              value={comment}
              rows="5"
              onChange={(e) => setComment(e.target.value)}
            />
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <Button onClick={handleCancel}>Закрыть</Button>
              <Button type="primary" onClick={handleNextStep}>
                Далее
              </Button>
            </div>
          </>
        )}
        {currentStep === 'confirm' && (
          <>
            <h2>Подтверждение обновления статуса</h2>
            <p>Вы уверены, что хотите обновить статус?</p>
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <Button onClick={handleCancel}>Отмена</Button>
              <Button type="primary" onClick={handleSubmit}>
                Подтвердить
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

export default PriorityStatus
