import { useState, useCallback } from 'react'

const useFilter = ({ items, setFiltered, customFilterFn }) => {
  const [searchValue, setSearchValue] = useState('')

  const getFilteredItems = useCallback((items, filterValue) => {
    if (!filterValue.trim()) return items
    
    // Если передана кастомная функция фильтрации, используем ее
    if (customFilterFn) {
      return customFilterFn(items, filterValue)
    }
    
    const lowerFilter = filterValue.toLowerCase()
    return items.filter((item) => {
      // Проверяем различные поля для поиска
      if (item.originalLabel && item.originalLabel.toLowerCase().includes(lowerFilter)) {
        return true
      }
      if (item.label && item.label.toLowerCase().includes(lowerFilter)) {
        return true
      }
      if (item.value && item.value.toString().toLowerCase().includes(lowerFilter)) {
        return true
      }
      if (item.name && item.name.toLowerCase().includes(lowerFilter)) {
        return true
      }
      return false
    })
  }, [customFilterFn])

  const handleValueChange = useCallback((e) => {
    const value = e.target.value
    setSearchValue(value)

    const filtered = getFilteredItems(items, value)
    setFiltered(filtered)
  }, [items, getFilteredItems, setFiltered])

  const clearSearch = useCallback(() => {
    setSearchValue('')
    const filtered = getFilteredItems(items, '')
    setFiltered(filtered)
  }, [items, getFilteredItems, setFiltered])

  return { 
    searchValue, 
    handleValueChange, 
    clearSearch, 
    setSearchValue 
  }
}

export default useFilter

// // useFilter.js
// import { useState, useCallback } from 'react'

// const useFilter = ({ items, setFiltered }) => {
//   const [searchValue, setSearchValue] = useState('')

//   const getFilterItem = useCallback((items, filterValue) => {
//     if (!filterValue.trim()) return items
    
//     const lowerFilter = filterValue.toLowerCase()
//     return items.filter((item) => {
//       // Проверяем различные поля для поиска
//       if (item.originalLabel && item.originalLabel.toLowerCase().includes(lowerFilter)) {
//         return true
//       }
//       if (item.label && item.label.toLowerCase().includes(lowerFilter)) {
//         return true
//       }
//       if (item.value && item.value.toString().toLowerCase().includes(lowerFilter)) {
//         return true
//       }
//       if (item.name && item.name.toLowerCase().includes(lowerFilter)) {
//         return true
//       }
//       return false
//     })
//   }, [])

//   const handleValueChange = useCallback((e) => {
//     const value = e.target.value
//     setSearchValue(value)

//     const listFiltered = getFilterItem(items, value)
//     setFiltered(listFiltered)
//   }, [items, getFilterItem, setFiltered])

//   const clearSearch = useCallback(() => {
//     setSearchValue('')
//     setFiltered(items)
//   }, [items, setFiltered])

//   return { 
//     searchValue, 
//     handleValueChange, 
//     clearSearch, 
//     setSearchValue 
//   }
// }

// export default useFilter

// import { useState } from 'react'

// const useFilter = ({ items, setFiltered }) => {
//   const [searchValue, setSearchValue] = useState('')

//   const getFilterItem = (items, filterValue) => {
//     return items.filter((item) =>
//       item.label.toLowerCase().includes(filterValue.toLowerCase())
//     )
//   }

//   const handleValueChange = (e) => {
//     const value = e.target.value
//     setSearchValue(value)

//     const listFiltered = getFilterItem(items, value)

//     setFiltered(listFiltered)
//   }

//   const clearSearch = () => {
//     setSearchValue('')
//     setFiltered(items)
//   }
//   return { handleValueChange, clearSearch, searchValue, setSearchValue }
// }

// export default useFilter
