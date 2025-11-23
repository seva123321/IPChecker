import { Button } from 'antd'
import { SafeText } from '../utils/sanitize'

export const ConfirmStep = ({
  newPriority,
  groupingDisplayValue,
  comment,
  onBack,
  onCancel,
  onSubmit,
  loading,
}) => {
  const getPriorityText = () => {
    switch (newPriority) {
      case '1':
        return 'Обычный'
      case '2':
        return 'Интересный'
      case '3':
        return 'Важный'
      default:
        return 'Не выбран'
    }
  }

  return (
    <>
      <h2>Подтверждение обновления статуса</h2>
      <p>Вы уверены, что хотите обновить статус?</p>
      <p>
        <strong>Приоритет:</strong> {getPriorityText()}
      </p>
      <p>
        <strong>Группировка:</strong> {groupingDisplayValue || 'Не выбрано'}
      </p>

      {comment && (
        <p>
          <strong>Комментарий:</strong> <SafeText text={comment} />
        </p>
      )}

      <div style={{ marginTop: '20px', textAlign: 'right' }}>
        <Button
          onClick={onBack}
          style={{ marginRight: '10px' }}
          disabled={loading}
        >
          Назад
        </Button>
        <Button
          onClick={onCancel}
          style={{ marginRight: '10px' }}
          disabled={loading}
        >
          Отмена
        </Button>
        <Button type="primary" onClick={onSubmit} loading={loading}>
          Подтвердить
        </Button>
      </div>
    </>
  )
}
