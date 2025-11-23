import { Select, Input, Button } from 'antd'
import cn from '../PriorityStatus.module.scss'

export const SelectStep = ({
  newPriority,
  onPriorityChange,
  groupingSelectValue,
  onGroupingChange,
  onFocusGrouping,
  groupingOptions,
  comment,
  onCommentChange,
  existingComment,
  onCancel,
  onNext,
  loading,
}) => (
  <>
    <h2>Обновление статуса</h2>
    <div className={cn.selectWrapper}>
      <Select
        value={newPriority}
        onChange={onPriorityChange}
        placeholder="Выберите приоритет"
        className={cn.fixedWidthSelectPriority}
        getPopupContainer={(trigger) => trigger.parentNode}
      >
        <Select.Option value="1">Обычный</Select.Option>
        <Select.Option value="2">Интересный</Select.Option>
        <Select.Option value="3">Важный</Select.Option>
      </Select>

      <Select
        value={groupingSelectValue}
        onChange={onGroupingChange}
        onFocus={onFocusGrouping}
        placeholder="Выберите группу"
        className={cn.fixedWidthSelectGrouping}
        getPopupContainer={(trigger) => trigger.parentNode}
        dropdownStyle={{
          minWidth: '300px',
          maxHeight: '400px',
          overflow: 'auto',
        }}
        labelInValue={true}
      >
        {groupingOptions.map((option) => (
          <Select.Option key={option.value} value={option.value}>
            <div
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {option.label}
            </div>
          </Select.Option>
        ))}
      </Select>
    </div>

    <Input.TextArea
      placeholder="Комментарий"
      value={comment}
      rows="5"
      onChange={onCommentChange}
      style={{ marginTop: '10px' }}
      maxLength={1000}
    />

    {existingComment.createdAt && (
      <span style={{ textAlign: 'right', display: 'block', marginTop: '10px' }}>
        <b>Последнее обновление:</b>&nbsp;
        {existingComment.createdAt.toLocaleString()}
      </span>
    )}

    <div style={{ marginTop: '20px', textAlign: 'right' }}>
      <Button
        onClick={onCancel}
        style={{ marginRight: '10px' }}
        disabled={loading}
      >
        Закрыть
      </Button>
      <Button type="primary" onClick={onNext} disabled={loading}>
        Далее
      </Button>
    </div>
  </>
)
