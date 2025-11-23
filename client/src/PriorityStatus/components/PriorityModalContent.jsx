import { usePriorityStatus } from './hooks/usePriorityStatus'
import { SelectStep } from './components/SelectStep'
import { ConfirmStep } from './components/ConfirmStep'

const PriorityModalContent = ({
  state,
  priority,
  grouping,
  hostId,
  onUpdate,
  onCancel,
}) => {
  const {
    updateState,
    handleFetchGroupingOptions,
    handleNextStep,
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

    const currentOption = state.groupingOptions.find(
      (option) => option.value === state.newGrouping.id.toString()
    )

    if (currentOption) {
      return { value: currentOption.value, label: currentOption.label }
    }

    if (state.newGrouping.name && !state.optionsLoaded) {
      return {
        value: state.newGrouping.id.toString(),
        label: state.newGrouping.name,
      }
    }

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
          onCancel={onCancel}
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
          onCancel={onCancel}
          onSubmit={handleSubmit}
          loading={state.loading}
        />
      )}
    </>
  )
}

export default PriorityModalContent
