import { useCallback, useState } from 'react'
import { initialSearchText } from '../../utils/constant'

const useSearch = ({onSearch, setSearchParams}) => {
  const [searchText, setSearchText] = useState({
    ip: initialSearchText.ip || '',
    port: initialSearchText.port || '',
    keyword: initialSearchText.keyword || '',
    isPortOpened: initialSearchText.isPortOpened || false,
    isPortFiltered: initialSearchText.isPortFiltered || false,
  })

  // Оптимизированные обработчики с использованием useCallback
  const updateField = useCallback((field, value) => {
    setSearchText((prev) => ({ ...prev, [field]: value }))
    setSearchParams((prev) => ({ 
      ...prev, 
      [field]: value 
    }))
  }, [setSearchParams])

  const clearField = useCallback(
    (field) => {
      updateField(field, '')
    },
    [updateField]
  )

  const handleClearAll = useCallback(() => {
    setSearchText({
      ip: '',
      port: '',
      keyword: '',
      isPortOpened: false,
      isPortFiltered: false,
    })
    setSearchParams({
      ip: '',
      port: '',
      keyword: '',
      isPortOpened: false,
      isPortFiltered: false,
    })
    onSearch('ip', {})
  }, [onSearch, setSearchParams])

  const handlePortChange = useCallback(
    (value) => {
      // Извлекаем только номер порта из строки "53 (dns)"
      const portNumber = value ? value.split(' ')[0] : ''
      updateField('port', portNumber)
    },
    [updateField]
  )

  const handleKeywordChange = useCallback(
    (e) => {
      updateField('keyword', e.target.value || '')
    },
    [updateField]
  )

  const getPortPrepared = useCallback(
    (data) => data?.data?.map((el) => `${el.port} (${el.name})`) || [],
    []
  )

  const handleCheckboxChange = useCallback(
    (fieldName, e) => {
      updateField(fieldName, e.target.checked || false)
    },
    [updateField]
  )
  
  const handleInputChange = useCallback(
    (fieldName, e) => {
      updateField(fieldName, e.target.value || '')
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