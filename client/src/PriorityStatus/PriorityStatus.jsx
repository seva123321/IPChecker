import { Modal } from 'antd'
import { usePriorityStatus } from './hooks/usePriorityStatus'
import { StatusDisplay } from './components/StatusDisplay'
import { SelectStep } from './components/SelectStep'
import { ConfirmStep } from './components/ConfirmStep'

const PriorityStatus = ({ priority, grouping, hostId, onUpdate }) => {
  const {
    state,
    updateState,
    handleFetchGroupingOptions,
    handleModalOpen,
    handleNextStep,
    handleCancel,
    handleSubmit,
  } = usePriorityStatus({ priority, grouping, hostId, onUpdate })

  // Вспомогательные функции
  const getGroupingDisplayValue = () => {
    if (!state.newGrouping.id && !state.newGrouping.name) return undefined
    if (state.newGrouping.name) return state.newGrouping.name

    const foundOption = state.groupingOptions.find(
      (option) => option.value === state.newGrouping.id.toString()
    )
    return foundOption ? foundOption.label : state.newGrouping.id.toString()
  }

  const getGroupingSelectValue = () => {
    if (!state.newGrouping.id) return undefined

    // Сначала ищем в загруженных опциях
    const currentOption = state.groupingOptions.find(
      (option) => option.value === state.newGrouping.id.toString()
    )

    if (currentOption) {
      return { value: currentOption.value, label: currentOption.label }
    }

    // Если опции еще не загружены, но у нас есть имя группировки из пропсов
    if (state.newGrouping.name && !state.optionsLoaded) {
      return {
        value: state.newGrouping.id.toString(),
        label: state.newGrouping.name,
      }
    }

    // Если ничего не нашли, возвращаем просто ID
    return state.newGrouping.id.toString()
  }

  // Обработчики
  const handlePriorityChange = (value) => updateState({ newPriority: value })

  const handleGroupingChange = (value) => {
    const selectedValue = typeof value === 'object' ? value.value : value
    const selectedOption = state.groupingOptions.find(
      (opt) => opt.value === selectedValue
    )
    updateState({
      newGrouping: selectedOption || { id: selectedValue, name: selectedValue },
    })
  }

  const handleCommentChange = (e) => updateState({ comment: e.target.value })
  const handleBack = () => updateState({ currentStep: 'select' })

  return (
    <>
      <StatusDisplay
        priority={priority}
        grouping={grouping}
        onOpenModal={handleModalOpen}
      />

      <Modal
        open={state.isModalOpen}
        onCancel={handleCancel}
        footer={null}
        width={500}
        confirmLoading={state.loading}
        style={{ top: 20 }}
      >
        {state.currentStep === 'select' && (
          <SelectStep
            newPriority={state.newPriority}
            onPriorityChange={handlePriorityChange}
            groupingSelectValue={getGroupingSelectValue()}
            onGroupingChange={handleGroupingChange}
            onFocusGrouping={handleFetchGroupingOptions}
            groupingOptions={state.groupingOptions}
            comment={state.comment}
            onCommentChange={handleCommentChange}
            existingComment={state.existingComment}
            onCancel={handleCancel}
            onNext={handleNextStep}
            loading={state.loading}
          />
        )}

        {state.currentStep === 'confirm' && (
          <ConfirmStep
            newPriority={state.newPriority}
            groupingDisplayValue={getGroupingDisplayValue()}
            comment={state.comment}
            onBack={handleBack}
            onCancel={handleCancel}
            onSubmit={handleSubmit}
            loading={state.loading}
          />
        )}
      </Modal>
    </>
  )
}

export default PriorityStatus
