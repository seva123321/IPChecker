import { Tabs, Input } from 'antd'
import { useState, useCallback, useEffect, useMemo } from 'react'
import cn from './TabsGroup.module.scss'
import useFilter from './hooks/useFilter'

const TabsGroup = ({ 
  tabs: originalTabs, 
  onSearch, 
  searchParams, 
  setSearchParams 
}) => {
  const [activeTab, setActiveTab] = useState(
    searchParams?.groupValue || originalTabs[0]?.key || null
  )

  // Используем useMemo для безопасного получения активного таба
  const initialActiveTab = useMemo(() => {
    return searchParams?.groupValue || originalTabs[0]?.key || null
  }, [searchParams?.groupValue, originalTabs])

  useEffect(() => {
    setActiveTab(initialActiveTab)
  }, [initialActiveTab])

  // Используем хук useFilter для фильтрации
  const {
    searchValue,
    handleValueChange,
    clearSearch,
    setSearchValue
  } = useFilter({
    items: originalTabs,
    setFiltered: (filteredItems) => {
      // Если активная вкладка не видна после фильтрации, сбрасываем ее
      if (activeTab && searchValue.trim()) {
        const isActiveTabVisible = filteredItems.some(
          (tab) => tab.key === activeTab
        )
        if (!isActiveTabVisible) {
          setActiveTab(initialActiveTab)
        }
      }
    }
  })

  // Фильтруем табы на основе поиска
  const filteredTabs = useMemo(() => {
    if (!searchValue.trim()) return originalTabs
    
    const lowerSearch = searchValue.toLowerCase()
    return originalTabs.filter((tab) => {
      if (tab.originalLabel && tab.originalLabel.toLowerCase().includes(lowerSearch)) {
        return true
      }
      if (tab.label && tab.label.toLowerCase().includes(lowerSearch)) {
        return true
      }
      if (tab.value && tab.value.toString().toLowerCase().includes(lowerSearch)) {
        return true
      }
      if (tab.name && tab.name.toLowerCase().includes(lowerSearch)) {
        return true
      }
      return false
    })
  }, [originalTabs, searchValue])

  const handleTabClick = useCallback((key) => {
    setActiveTab(key)

    // ВАЖНО: Не устанавливаем значение для groupingType!
    // Вместо этого сохраняем только groupValue и очищаем поле groupingType
    const newParams = {
      ...searchParams,
      // Очищаем поле, которое указано в groupingType
      [searchParams?.groupingType || 'group']: '',
      // Устанавливаем только groupValue
      groupValue: key,
    }

    setSearchParams(newParams)
    
    if (onSearch) {
      onSearch(newParams)
    }
  }, [searchParams, setSearchParams, onSearch])

  // Обновляем хендлер для поиска
  const handleSearchChange = useCallback(
    (e) => {
      handleValueChange(e)
    },
    [handleValueChange]
  )

  // Если нет табов вообще
  if (!originalTabs || originalTabs.length === 0) {
    return (
      <div>
        <Input
          value={searchValue}
          placeholder="Поиск Группы"
          style={{ width: 200, marginBottom: 8 }}
          onChange={handleSearchChange}
          allowClear
          onClear={clearSearch}
          disabled
        />
        <div className={cn.tabsWrapper}>
          <div
            style={{ padding: '10px', textAlign: 'center', color: '#8c8c8c' }}
          >
            Нет доступных групп
          </div>
        </div>
        <hr />
      </div>
    )
  }

  // Если после фильтрации нет результатов
  if (filteredTabs.length === 0 && searchValue.trim()) {
    return (
      <div>
        <Input
          value={searchValue}
          placeholder="Поиск Группы"
          style={{ width: 200, marginBottom: 8 }}
          onChange={handleSearchChange}
          allowClear
          onClear={clearSearch}
        />
        <div className={cn.tabsWrapper}>
          <div
            style={{ padding: '10px', textAlign: 'center', color: '#8c8c8c' }}
          >
            Нет результатов по запросу "{searchValue}"
          </div>
        </div>
        <hr />
      </div>
    )
  }

  // Преобразуем для Ant Design Tabs
  const tabItems = filteredTabs.map((tab) => ({
    label: (
      <div
        title={tab.originalLabel || tab.label || tab.name || tab.value}
        style={{
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        {tab.originalLabel || tab.label || tab.name || tab.value}
        {tab.count > 0 && (
          <span style={{ fontSize: '0.8em', marginLeft: 4, color: '#666' }}>
            ({tab.count})
          </span>
        )}
      </div>
    ),
    key: tab.key,
    children: null,
  }))

  return (
    <div>
      <Input
        value={searchValue}
        placeholder="Поиск Группы"
        style={{ width: 200, marginBottom: 8 }}
        onChange={handleSearchChange}
        allowClear
        onClear={clearSearch}
      />
      <div className={cn.tabsWrapper}>
        <Tabs
          activeKey={activeTab || filteredTabs[0]?.key || ''}
          onChange={handleTabClick}
          className={cn.tabs}
          size="small"
          items={tabItems}
          tabBarStyle={{ marginBottom: 0 }}
          tabPosition="top"
          type="card"
          style={{ height: 'auto' }}
        />
      </div>
      <hr />
    </div>
  )
}

export default TabsGroup
// для PannelFilter
// // TabsGroup.jsx (исправленная версия)
// import { Tabs, Input } from 'antd'
// import React, { useState, useMemo, useCallback, useEffect } from 'react'
// import cn from './TabsGroup.module.scss'
// import useFilter from './hooks/useFilter'

// const TabsGroup = ({ tabs, onSearch, fieldType, searchParams }) => {
//   const [activeTab, setActiveTab] = useState(null)
//   console.log('searchParams >>> ', searchParams)

//   // Подготавливаем данные для табов
//   const itemsPrepared = useMemo(() => {
//     if (!tabs || !Array.isArray(tabs)) return []

//     return tabs.map(tab => {
//       const label = tab.name ? `${tab.value} (${tab.name})` : `${tab.value}`
//       const key = `${tab.value}`

//       return {
//         label,
//         key,
//         // Сохраняем оригинальные данные для фильтрации
//         originalLabel: label,
//         value: tab.value,
//         name: tab.name,
//         count: tab.host_count || 0,
//         // Сохраняем оригинальный объект для передачи в onSearch
//         originalData: tab
//       }
//     })
//   }, [tabs])

//   const [tabsFiltered, setTabsFiltered] = useState(itemsPrepared)

//   // Обновляем отфильтрованные табы при изменении исходных данных
//   useEffect(() => {
//     setTabsFiltered(itemsPrepared)
//   }, [itemsPrepared])

//   // Используем хук useFilter для фильтрации
//   const {
//     searchValue,
//     handleValueChange,
//     clearSearch,
//     setSearchValue
//   } = useFilter({
//     items: itemsPrepared,
//   setFiltered: (filteredItems) => {
//     // Сохраняем отфильтрованные табы
//     setTabsFiltered(filteredItems)

//     // Если активная вкладка не видна после фильтрации, сбрасываем ее
//     if (activeTab && searchValue.trim()) {
//       const isActiveTabVisible = filteredItems.some(tab => tab.key === activeTab)
//       if (!isActiveTabVisible) {
//         setActiveTab(null)
//       }
//     }
//   }
// })

//   // Очистка параметров поиска - оставляем только примитивные значения
//   const cleanSearchParams = useMemo(() => {
//     if (!searchParams) return {}

//     const params = {}
//     Object.entries(searchParams).forEach(([key, value]) => {
//       // Проверяем, что значение не является объектом и не пустое
//       if (value !== null &&
//           value !== undefined &&
//           value !== '' &&
//           typeof value !== 'object') {
//         params[key] = value
//       }
//     })
//     return params
//   }, [searchParams])

//   // TabsGroup.jsx - исправленный handleTabClick
//   const handleTabClick = useCallback((key, tabData = null) => {
//     setActiveTab(key)

//     // Находим данные таба если не переданы
//     const tabToSearch = tabData || tabsFiltered.find(tab => tab.key === key)?.originalData

//     if (!tabToSearch) {
//       console.warn(`Tab with key ${key} not found`)
//       return
//     }

//     console.log(`Clicked on tab with key: ${key}, tab data:`, tabToSearch)

//     // Создаем объект параметров для запроса
//     const requestParams = { ...cleanSearchParams }

//     // Добавляем параметр для поиска в зависимости от fieldType
//     if (fieldType) {
//       // Используем value из данных таба
//       requestParams[fieldType] = tabToSearch.value
//     }

//     // Формируем endpoint в зависимости от типа поля
//     let endpoint = fieldType || 'ip' // Используем fieldType или значение по умолчанию

//     console.log('Request params:', requestParams)
//     console.log('Endpoint:', endpoint)

//     // Передаем endpoint и параметры в onSearch
//     onSearch(endpoint, requestParams, tabToSearch)
//   }, [onSearch, fieldType, cleanSearchParams, tabsFiltered])

//   // Устанавливаем активную вкладку по умолчанию
//   useEffect(() => {
//     if (tabsFiltered.length > 0 && !activeTab) {
//       const firstTab = tabsFiltered[0]
//       setActiveTab(firstTab.key)
//       // Автоматически загружаем данные для первой вкладки
//       handleTabClick(firstTab.key, firstTab.originalData)
//     }
//   }, [tabsFiltered])

//   // Обновляем хендлер для поиска
//   const handleSearchChange = useCallback((e) => {
//     handleValueChange(e)
//   }, [handleValueChange])

//   // Если нет данных для отображения
//   if (!tabs || tabs.length === 0) {
//     return null
//   }

//   // Если после фильтрации нет результатов
//   if (tabsFiltered.length === 0) {
//     return (
//       <>
//         <Input
//           value={searchValue}
//           placeholder="Поиск Группы"
//           style={{ width: 200 }}
//           onChange={handleSearchChange}
//           allowClear
//           onClear={clearSearch}
//         />
//         <div className={cn.tabsWrapper}>
//           <div style={{ padding: '10px', textAlign: 'center', color: '#8c8c8c' }}>
//             Нет результатов по запросу "{searchValue}"
//           </div>
//         </div>
//         <hr />
//       </>
//     )
//   }

//   // Преобразуем для Ant Design Tabs
//   const tabItems = tabsFiltered.map(tab => ({
//     label: (
//       <div
//         title={tab.originalLabel}
//         style={{
//           maxWidth: 200,
//           overflow: 'hidden',
//           textOverflow: 'ellipsis',
//           whiteSpace: 'nowrap',
//           cursor: 'pointer'
//         }}
//         onClick={() => handleTabClick(tab.key, tab.originalData)}
//       >
//         {tab.originalLabel}
//         {tab.count > 0 && (
//           <span style={{ fontSize: '0.8em', marginLeft: 4, color: '#666' }}>
//             ({tab.count})
//           </span>
//         )}
//       </div>
//     ),
//     key: tab.key,
//     children: null,
//   }))

//   return (
//     <>
//       <Input
//         value={searchValue}
//         placeholder="Поиск Группы"
//         style={{ width: 200, marginBottom: 8 }}
//         onChange={handleSearchChange}
//         allowClear
//         onClear={clearSearch}
//       />
//       <div className={cn.tabsWrapper}>
//         <Tabs
//           activeKey={activeTab || (tabsFiltered[0]?.key || '')}
//           onChange={(key) => {
//             const tab = tabsFiltered.find(t => t.key === key)
//             if (tab) {
//               handleTabClick(key, tab.originalData)
//             }
//           }}
//           className={cn.tabs}
//           size="small"
//           items={tabItems}
//           tabBarStyle={{ marginBottom: 0 }}
//           tabPosition="top"
//           type="card"
//           style={{ height: 'auto' }}
//         />
//       </div>
//       <hr />
//     </>
//   )
// }

// export default TabsGroup

/****************************************************************** */

// // TabsGroup.jsx (исправленная версия)
// import { Tabs, Input } from 'antd'
// import React, { useState, useMemo, useCallback } from 'react'
// import cn from './TabsGroup.module.scss'

// const TabsGroup = ({ tabs, onSearch, fieldType, searchParams }) => {
//   const [activeTab, setActiveTab] = useState(null)
//   const [filterValue, setFilterValue] = useState('')

//   // Очистка параметров поиска - оставляем только примитивные значения
//   const cleanSearchParams = useMemo(() => {
//     if (!searchParams) return {}

//     const params = {}
//     Object.entries(searchParams).forEach(([key, value]) => {
//       // Проверяем, что значение не является объектом и не пустое
//       if (value !== null &&
//           value !== undefined &&
//           value !== '' &&
//           typeof value !== 'object') {
//         params[key] = value
//       }
//     })
//     return params
//   }, [searchParams])

//   // Мемоизированная подготовка данных табов
//   const itemsPrepared = useMemo(() => {
//     if (!tabs || !Array.isArray(tabs)) return []

//     return tabs.map(tab => {
//       const label = tab.name ? `${tab.value} (${tab.name})` : `${tab.value}`
//       const key = `${tab.value}`

//       return {
//         label,
//         key,
//         // Сохраняем оригинальные данные для фильтрации
//         originalLabel: label,
//         value: tab.value,
//         name: tab.name,
//         count: tab.host_count || 0
//       }
//     })
//   }, [tabs])

//   // Мемоизированный фильтрованный список
//   const tabsFiltered = useMemo(() => {
//     if (!filterValue.trim()) return itemsPrepared

//     const searchLower = filterValue.toLowerCase()
//     return itemsPrepared.filter(item =>
//       item.originalLabel.toLowerCase().includes(searchLower)
//     )
//   }, [itemsPrepared, filterValue])

//   // Устанавливаем активную вкладку по умолчанию
//   React.useEffect(() => {
//     if (tabsFiltered.length > 0 && !activeTab) {
//       const firstTab = tabsFiltered[0]
//       setActiveTab(firstTab.key)
//       // Автоматически загружаем данные для первой вкладки
//       handleTabClick(firstTab.key, firstTab.value)
//     }
//   }, [tabsFiltered])

//   const handleTabClick = useCallback((key, tabValue = null) => {
//     setActiveTab(key)

//     // Получаем значение из key или из переданного параметра
//     const valueToSearch = tabValue || key

//     console.log(`Clicked on tab with key: ${key}, value: ${valueToSearch}`)

//     // Создаем объект параметров для запроса
//     const requestParams = { ...cleanSearchParams }

//     // Добавляем параметр для поиска (port, keyword и т.д.)
//     if (fieldType) {
//       requestParams[fieldType] = valueToSearch
//     }

//     // Формируем endpoint в зависимости от типа поля
//     let endpoint = ''
//     if (fieldType === 'port') {
//       endpoint = 'ports'
//     } else if (fieldType === 'keyword') {
//       endpoint = 'keywords'
//     } else {
//       endpoint = `${fieldType}s`
//     }

//     console.log('Request params:', requestParams)
//     console.log('Endpoint:', endpoint)

//     onSearch(endpoint, requestParams)
//   }, [onSearch, fieldType, cleanSearchParams])

//   const handleValueChange = useCallback((e) => {
//     const value = e.target.value
//     setFilterValue(value)

//     // Если после фильтрации активная вкладка не видна, сбрасываем активную вкладку
//     if (value.trim() && activeTab) {
//       const isActiveTabVisible = tabsFiltered.some(tab => tab.key === activeTab)
//       if (!isActiveTabVisible) {
//         setActiveTab(null)
//       }
//     }
//   }, [activeTab, tabsFiltered])

//   const clearSearch = useCallback(() => {
//     setFilterValue('')
//   }, [])

//   // Если нет данных для отображения
//   if (!tabs || tabs.length === 0) {
//     return null
//   }

//   // Если после фильтрации нет результатов
//   if (tabsFiltered.length === 0) {
//     return (
//       <>
//         <Input
//           value={filterValue}
//           placeholder="Поиск Группы"
//           style={{ width: 200 }}
//           onChange={handleValueChange}
//           allowClear
//           onClear={clearSearch}
//         />
//         <div className={cn.tabsWrapper}>
//           <div style={{ padding: '10px', textAlign: 'center', color: '#8c8c8c' }}>
//             Нет результатов по запросу "{filterValue}"
//           </div>
//         </div>
//         <hr />
//       </>
//     )
//   }

//   // Преобразуем для Ant Design Tabs
//   const tabItems = tabsFiltered.map(tab => ({
//     label: (
//       <div
//         title={tab.originalLabel}
//         style={{
//           maxWidth: 200,
//           overflow: 'hidden',
//           textOverflow: 'ellipsis',
//           whiteSpace: 'nowrap'
//         }}
//       >
//         {tab.originalLabel}
//         {tab.count > 0 && (
//           <span style={{ fontSize: '0.8em', marginLeft: 4, color: '#666' }}>
//             ({tab.count})
//           </span>
//         )}
//       </div>
//     ),
//     key: tab.key,
//     children: null,
//   }))

//   return (
//     <>
//       <Input
//         value={filterValue}
//         placeholder="Поиск Группы"
//         style={{ width: 200, marginBottom: 8 }}
//         onChange={handleValueChange}
//         allowClear
//         onClear={clearSearch}
//       />
//       <div className={cn.tabsWrapper}>
//         <Tabs
//           activeKey={activeTab || (tabsFiltered[0]?.key || '')}
//           onChange={(key) => {
//             const tab = tabsFiltered.find(t => t.key === key)
//             if (tab) {
//               handleTabClick(key, tab.value)
//             }
//           }}
//           className={cn.tabs}
//           size="small"
//           items={tabItems}
//           tabBarStyle={{ marginBottom: 0 }}
//           tabPosition="top"
//           type="card"
//           style={{ height: 'auto' }}
//         />
//       </div>
//       <hr />
//     </>
//   )
// }

// export default TabsGroup

// import { Tabs } from 'antd'
// import React, { useState, useEffect } from 'react'
// import cn from './TabsGroup.module.scss'
// import FilterInput from './Filter'

// const TabsGroup = ({ tabs, onSearch, fieldType, searchParams }) => {
//   const [activeTab, setActiveTab] = useState('ip')
//   const [tabsFiltered, setTabsFiltered] = useState([])

//   const handleTabChange = (key) => {
//     setActiveTab(key)
//   }

//   const handleTabClick = (key, event) => {
//     console.log(`Clicked on tab with key: ${key}`)

//     onSearch(`${fieldType}s`, {
//       //{port}s
//       ...searchParams,
//       [fieldType]: key,
//     })
//   }

//   // Подготовка списка табов из входных данных
//   const itemsPrepared = tabs?.map((tab) => ({
//     label: tab.name ? `${tab.value} (${tab.name})` : tab.value,
//     key: `${tab.value}`,
//     children: null,
//   }))

//   // Обновление отфильтрованного списка при изменении входных данных
//   useEffect(() => {
//     setTabsFiltered(itemsPrepared)
//   }, [tabs])

//   return (
//     <>
//       <FilterInput items={itemsPrepared} setFiltered={setTabsFiltered} />
//       <div className={cn.tabsWrapper}>
//         <Tabs
//           activeKey={activeTab}
//           onChange={handleTabChange}
//           onTabClick={handleTabClick}
//           className={cn.tabs}
//           size="small"
//           items={tabsFiltered}
//         />
//       </div>
//       <hr />
//     </>
//   )
// }

// export default TabsGroup

// import { Input, Tabs } from 'antd'
// import React, { useState } from 'react'
// import cn from './TabsGroup.module.scss'

// const TabsGroup = ({ tabs, onSearch }) => {
//   const [activeTab, setActiveTab] = useState('ip')
//   const [searchValue, setSearchValue] = useState('')

//   const handleTabChange = (key) => {
//     setActiveTab(key)
//   }

//   const itemsPrepared = tabs.map((tab) => {
//     return {
//       label: `${tab.port} (${tab.port_name})`,
//       key: `${tab.port}`,
//       children: null,
//     }
//   })

//   const [tabsFiltered, setTabsFiltered] = useState(itemsPrepared ?? [])

//   const handleValueChange = (e) =>{
//     const value = e.target.value
//     setSearchValue(value)
//     const listFiltered = tabsFiltered.filter(item => item.label.include(value))
//     setTabsFiltered(listFiltered)
//   }

//   return (
//     <>
//       <Input
//         value={searchValue}
//         placeholder="Поиск Группы"
//         containerClass={{ width: 300 }}
//         onChange={handleValueChange}
//         showClear
//         onClear={() => clearField('ip')}
//       />
//       <Tabs
//         activeKey={activeTab}
//         onChange={handleTabChange}
//         className={cn['tabs']}
//         size="small"
//         items={tabsFiltered}
//       />
//     </>
//   )
// }

// export default TabsGroup
