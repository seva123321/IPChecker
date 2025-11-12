import { Modal } from 'antd'

export const PortDataList = ({
  service,
  inputValue,
  onKeywordChange,
  isModalOpen,
  setIsModalOpen,
  fetchData,
}) => {
  const handleOk = async () => {
    try {
    //   // Извлекаем только содержимое в скобках
    //   const match = inputValue.match(/^\d+\s+\(([^)]+)\)$/)
    //   const name = match ? match[1] : inputValue

      await service.postData('ports', inputValue)
      fetchData() // Обновляем список после успешной отправки
      // Сбрасываем состояние в родительском компоненте
      if (onKeywordChange) {
        onKeywordChange('')
      }
    } catch (error) {
      console.error('Error sending data:', error)
    } finally {
      setIsModalOpen(false)
    }
  }

  const handleCancel = () => {
    setIsModalOpen(false)
  }

  return (
    <Modal
      title="Подтверждение отправки"
      open={isModalOpen}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Согласен"
      cancelText="Отмена"
    >
      <p>Вы уверены, что хотите добавить данные в БД?</p>
    </Modal>
  )
}
