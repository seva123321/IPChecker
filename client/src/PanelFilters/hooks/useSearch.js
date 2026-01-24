import { useCallback, useState } from 'react'
import { initialSearchText } from '../../utils/constant'

const useSearch = ({onSearch, setSearchParams}) => {
  const [searchText, setSearchText] = useState(initialSearchText)

  // Оптимизированные обработчики с использованием useCallback
  const updateField = useCallback((field, value) => {
    setSearchText((prev) => ({ ...prev, [field]: value }))
    setSearchParams((prev) => ({ ...prev, [field]: value }))
  }, [])

  const clearField = useCallback(
    (field) => {
      updateField(field, '')
    },
    [updateField]
  )

  const handleClearAll = useCallback(() => {
    setSearchText(initialSearchText)
    setSearchParams(initialSearchText)
    onSearch('ip', {})
  }, [onSearch])

  const handlePortChange = useCallback(
    (value) => {
      // Извлекаем только номер порта из строки "53 (dns)"
      const portNumber = value.split(' ')[0]
      updateField('port', portNumber)
    },
    [updateField]
  )

  const handleKeywordChange = useCallback(
    (e) => {
      updateField('keyword', e.target.value)
    },
    [updateField]
  )

  const getPortPrepared = useCallback(
    (data) => data?.data?.map((el) => `${el.port} (${el.name})`) || [],
    []
  )

  const handleCheckboxChange = useCallback(
    (fieldName, e) => {
      updateField(fieldName, e.target.checked)
    },
    [updateField]
  )
  
  const handleInputChange = useCallback(
    (fieldName, e) => {
      updateField(fieldName, e.target.value)
    },
    [updateField]
  )

  return {
    searchText,
    clearField,
    handleClearAll,
    getPortPrepared,
    handlePortChange,
    handleKeywordChange,
    handleCheckboxChange,
    updateField
  }
}

export default useSearch
