import React, { useState } from 'react'
import { Select, Spin } from 'antd'

export const MultiSelectDataList = ({
  service,
  value,
  onChange,
  placeholder = 'Выберите значения',
  fetchDataUrl,
  fetchParams = {},
  getDataPrepared = (value) => value,
  dataListId,
  mode = 'multiple',
  size = 'middle',
  allowClear = true,
  showSearch = true,
  style = { width: '100%' },
  maxTagCount = 'responsive',
  onBlur,
}) => {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)

  // Преобразуем значение в массив для Select компонента
  const selectedValues = React.useMemo(() => {
    if (!value) return []
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item)
    }
    return [value]
  }, [value])

  const fetchData = async () => {
    if (hasFetched || loading) return

    setLoading(true)
    try {
      const response = await service.getData(fetchDataUrl, fetchParams)
      const dataPrepared = getDataPrepared(response)

      // Преобразуем данные в формат для Select
      const selectOptions = dataPrepared.map((item) => ({
        value: item,
        label: item,
      }))

      // console.log(`Data fetched for ${dataListId}:`, selectOptions)
      setOptions(selectOptions)
      setHasFetched(true)
    } catch (error) {
      console.error(`Error fetching data from ${fetchDataUrl}:`, error)
      setOptions([])
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (selectedValues) => {
    if (mode === 'single') {
      // Для одиночного выбора
      onChange(selectedValues || '')
    } else {
      // Для множественного выбора - объединяем в строку через запятую
      const valueString = selectedValues ? selectedValues.join(', ') : ''
      onChange(valueString)
    }
  }

  const handleFocus = () => {
    // Загружаем данные только при первом фокусе
    if (!hasFetched && !loading) {
      fetchData()
    }
  }

  const styleSize = {
    width: '100%',
    maxWidth: '300px',
    height: '50px',
    textAlign: 'start',
  }

  return (
    <Select
      mode={mode === 'single' ? undefined : mode}
      size={size}
      placeholder={placeholder}
      value={
        mode === 'single' ? selectedValues[0] || undefined : selectedValues
      }
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={onBlur}
      style={(style, styleSize)}
      options={options}
      loading={loading}
      allowClear={allowClear}
      showSearch={showSearch}
      maxTagCount={maxTagCount}
      filterOption={(input, option) =>
        option?.label?.toLowerCase().includes(input.toLowerCase()) || false
      }
      notFoundContent={loading ? <Spin size="small" /> : 'Нет данных'}
    />
  )
}

// Компонент для одиночного выбора
export const SingleSelectDataList = (props) => (
  <MultiSelectDataList {...props} mode="single" />
)
// import React, { useState, useEffect } from 'react'
// import { Select, Spin } from 'antd'

// export const MultiSelectDataList = ({
//   service,
//   value,
//   onChange,
//   placeholder = 'Выберите значения',
//   fetchDataUrl,
//   fetchParams = {},
//   getDataPrepared = (value) => value,
//   dataListId,
//   mode = 'multiple', // 'multiple' | 'tags' | 'single'
//   size = 'middle',
//   allowClear = true,
//   showSearch = true,
//   style = { width: '100%' },
//   maxTagCount = 'responsive',
// }) => {
//   const [options, setOptions] = useState([])
//   const [loading, setLoading] = useState(false)
//   const [hasFetched, setHasFetched] = useState(false)

//   // Преобразуем значение в массив для Select компонента
//   const selectedValues = React.useMemo(() => {
//     if (!value) return []
//     if (Array.isArray(value)) return value
//     if (typeof value === 'string') {
//       return value
//         .split(',')
//         .map((item) => item.trim())
//         .filter((item) => item)
//     }
//     return [value]
//   }, [value])

//   const fetchData = async () => {
//     if (hasFetched) return

//     setLoading(true)
//     try {
//       const response = await service.getData(fetchDataUrl, fetchParams)
//       const dataPrepared = getDataPrepared(response)

//       // Преобразуем данные в формат для Select
//       const selectOptions = dataPrepared.map((item) => ({
//         value: item,
//         label: item,
//       }))

//       console.log(`Data fetched for ${dataListId}:`, selectOptions)
//       setOptions(selectOptions)
//       setHasFetched(true)
//     } catch (error) {
//       console.error(`Error fetching data from ${fetchDataUrl}:`, error)
//       setOptions([])
//     } finally {
//       setLoading(false)
//     }
//   }

//   const handleChange = (selectedValues) => {
//     if (mode === 'single') {
//       // Для одиночного выбора
//       onChange(selectedValues || '')
//     } else {
//       // Для множественного выбора - объединяем в строку через запятую
//       const valueString = selectedValues ? selectedValues.join(', ') : ''
//       onChange(valueString)
//     }
//   }

//   const handleFocus = () => {
//     if (!hasFetched && !loading) {
//       fetchData()
//     }
//   }

//   // Если нужно загружать данные автоматически при монтировании
//   useEffect(() => {
//     // Автоматическая загрузка при монтировании
//     if (!hasFetched && !loading) {
//       fetchData()
//     }
//   }, [])

//   return (
//     <Select
//       mode={mode === 'single' ? undefined : mode}
//       size={size}
//       placeholder={placeholder}
//       value={
//         mode === 'single' ? selectedValues[0] || undefined : selectedValues
//       }
//       onChange={handleChange}
//       onFocus={handleFocus}
//       style={style}
//       options={options}
//       loading={loading}
//       allowClear={allowClear}
//       showSearch={showSearch}
//       maxTagCount={maxTagCount}
//       filterOption={(input, option) =>
//         option?.label?.toLowerCase().includes(input.toLowerCase()) || false
//       }
//       notFoundContent={loading ? <Spin size="small" /> : 'Нет данных'}
//     />
//   )
// }

// // Компонент для одиночного выбора (удобная обертка)
// export const SingleSelectDataList = (props) => (
//   <MultiSelectDataList {...props} mode="single" />
// )
