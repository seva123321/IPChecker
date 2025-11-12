import React, { useState } from 'react'
import { Input } from '../Input/Input'
import { Button } from '../Button/Button'
import cn from './PanelFilters.module.scss'
import {DataList} from '../DataList/DataList'

export function PanelFilters({ onSearch, onGroup, service }) {
  const [searchText, setSearchText] = useState({
    ip: '',
    port: '',
    keyword: '',
  })
  const hasAnyValue = Object.values(searchText).some((el) => el.trim() !== '')

  const updateField = (field, value) => {
    setSearchText((prev) => ({ ...prev, [field]: value }))
  }

  const clearField = (field) => {
    updateField(field, '')
  }

  const handleClearAll = () => {
    setSearchText({
      ip: '',
      port: '',
      keyword: '',
    })
    // onGroup('ip/group')
    onSearch('ip')
  }

  // Обработчик для DataList (по портам)
  const handlePortChange = (value) => {
    updateField('port', value)
  }

  // Обработчик для текстового поля ключевых слов
  const handleKeywordInputChange = (e) => {
    updateField('keyword', e.target.value)
  }

  return (
    <div className={cn.panel}>
      <h2>Введите значение</h2>
      <ul className={cn.list}>
        <li className={cn.searchGroup}>
          <Input
            value={searchText.ip}
            placeholder="Поиск по IP"
            containerClass={{ width: 300 }}
            onChange={(e) => updateField('ip', e.target.value)}
            showClear
            onClear={() => clearField('ip')}
          />
          <Button
            onClick={() => onSearch('ip', { ip: searchText.ip })}
            className={cn.searchButton}
            disabled={!searchText.ip.trim()}
          >
            Найти
          </Button>
          <Button
            onClick={() => onGroup('ip/group')}
            className={cn.groupButton}
          >
            Группировать
          </Button>
        </li>
        <li className={cn.searchGroup}>
          <DataList 
            service={service} 
            onKeywordChange={handlePortChange}
            keywordValue={searchText.port}
            placeholder="Поиск по портам"
          />
          <Button
            onClick={() => onSearch('ports', { port: searchText.port })}
            className={cn.searchButton}
            disabled={!searchText.port.trim()}
          >
            Найти
          </Button>
          <Button
            onClick={() => onGroup('ports/group')}
            className={cn.groupButton}
          >
            Группировать
          </Button>
        </li>
        <li className={cn.searchGroup}>
          <Input
            value={searchText.keyword}
            placeholder="Поиск по ключевым словам"
            containerClass={{ width: 300 }}
            onChange={handleKeywordInputChange}
            showClear
            onClear={() => clearField('keyword')}
          />
          <Button
            onClick={() =>
              onSearch('keywords', { keyword: searchText.keyword })
            }
            className={cn.searchButton}
            disabled={!searchText.keyword.trim()}
          >
            Найти
          </Button>
          <Button
            onClick={() => onGroup('keywords/group')}
            className={cn.groupButton}
          >
            Группировать
          </Button>
        </li>
        <li className={cn.actionsGroup}>
          <Button
            onClick={handleClearAll}
            className={cn.clearAllButton}
            disabled={!hasAnyValue}
          >
            Очистить все поля
          </Button>
        </li>
      </ul>
    </div>
  )
}

// import React, { useState } from 'react'
// import { Input } from '../Input/Input'
// import { Button } from '../Button/Button'
// import cn from './PanelFilters.module.scss'
// import DataList from '../DataList/DataList'

// export function PanelFilters({ onSearch, onGroup, service }) {
//   const [searchText, setSearchText] = useState({
//     ip: '',
//     port: '',
//     keyword: '',
//   })
//   const hasAnyValue = Object.values(searchText).some((el) => el.trim() !== '')

//   const updateField = (field, value) => {
//     setSearchText((prev) => ({ ...prev, [field]: value }))
//   }

//   const clearField = (field) => {
//     updateField(field, '')
//   }

//   const handleClearAll = () => {
//     setSearchText({
//       ip: '',
//       port: '',
//       keyword: '',
//     })
//     // onGroup('ip/group')
//     onSearch('ip')
//   }

//   return (
//     <div className={cn.panel}>
//       <h2>Введите значение</h2>
//       <ul className={cn.list}>
//         <li className={cn.searchGroup}>
//           <Input
//             value={searchText.ip}
//             placeholder="Поиск по IP"
//             containerClass={{ width: 300 }}
//             onChange={(e) => updateField('ip', e.target.value)}
//             showClear
//             onClear={() => clearField('ip')}
//           />
//           <Button
//             onClick={() => onSearch('ip', { ip: searchText.ip })}
//             className={cn.searchButton}
//             disabled={!searchText.ip.trim()}
//           >
//             Найти
//           </Button>
//           <Button
//             onClick={(e) => onSearch('ip')} // onGroup('ip/group')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//         <li className={cn.searchGroup}>
//           <Input
//             value={searchText.port}
//             placeholder="Поиск по портам"
//             containerClass={{ width: 300 }}
//             onChange={(e) => updateField('port', e.target.value)}
//             showClear
//             onClear={() => clearField('port')}
//           />
//           <Button
//             onClick={() => onSearch('ports', { port: searchText.port })}
//             className={cn.searchButton}
//             disabled={!searchText.port.trim()}
//           >
//             Найти
//           </Button>
//           <Button
//             onClick={(e) => onGroup('ports/group')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//         <li className={cn.searchGroup}>
//           <DataList service={service} />
//           <Button
//             onClick={() => onSearch('ports', { port: searchText.port })}
//             className={cn.searchButton}
//             disabled={!searchText.port.trim()}
//           >
//             Найти
//           </Button>
//           <Button
//             onClick={(e) => onGroup('ports/group')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>

//         <li className={cn.searchGroup}>
//           <Input
//             value={searchText.keyword}
//             placeholder="Поиск по ключевым словам"
//             containerClass={{ width: 300 }}
//             onChange={(e) => updateField('keyword', e.target.value)}
//             showClear
//             onClear={() => clearField('keyword')}
//           />
//           <Button
//             onClick={() =>
//               onSearch('keywords', { keyword: searchText.keyword })
//             }
//             className={cn.searchButton}
//             disabled={!searchText.keyword.trim()}
//           >
//             Найти
//           </Button>
//           <Button
//             // onClick={(e) => onGroup('keywords/group?page=1&limit=10&keyword=# available at')}
//             onClick={(e) => onGroup('keywords/group')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//         <li className={cn.actionsGroup}>
//           {/* <Button
//             onClick={handleSearch}
//             className={cn.searchButton}
//             disabled={!hasAnyValue}
//           >
//             Найти
//           </Button> */}
//           <Button
//             onClick={handleClearAll}
//             className={cn.clearAllButton}
//             disabled={!hasAnyValue}
//           >
//             Очистить все поля
//           </Button>
//         </li>
//       </ul>
//     </div>
//   )
// }

/************************************************* */
// // components/PanelFilters.jsx
// import React, { useState } from 'react'
// import { Input } from '../Input/Input'
// import { Button } from '../Button/Button'
// import { Switch } from '../Switch/Switch'
// import { ROUTES } from '../routes'
// import cn from './PanelFilters.module.scss'

// export function PanelFilters({ service }) {
//   const [searchText, setSearchText] = useState({
//     ip: '',
//     ports: '',
//     keywords: '',
//   })

//   const [groupResult, setGroupResult] = useState(null)
//   const [reportData, setReportData] = useState(null)
//   const [isEnabled, setIsEnabled] = useState(false)

//   const updateField = (field, value) => {
//     setSearchText((prev) => ({ ...prev, [field]: value }))
//   }

//   const fetchData = async (endpoint, params = {}) => {
//     try {
//       const data = await service.getData(endpoint, params)
//       return data
//     } catch (error) {
//       console.error('Error fetching report:', error)
//       throw error
//     }
//   }

//   console.log('PanelFilters reportData > ', reportData)
//   console.log('PanelFilters groupResult > ', groupResult)

//   const handleSearch = async (field) => {
//     const value = searchText[field]?.trim()
//     if (!value) return

//     try {
//       let endpoint = ''
//       let params = {}

//       switch (field) {
//         case ROUTES.IP:
//           endpoint = ROUTES.IP
//           params = { ip: value }
//           break
//         case ROUTES.PORTS:
//           endpoint = ROUTES.PORTS
//           params = { port: value }
//           break
//         case ROUTES.KEYWORDS:
//           endpoint = ROUTES.KEYWORDS
//           params = { keyword: value }
//           break
//         default:
//           return
//       }
//       // пагинация
//       const res = await fetchData(endpoint, {
//         ...{ page: 1, limit: 10 },
//         ...params,
//       })
//       setReportData(res.data)
//     } catch (error) {
//       console.error(`Ошибка поиска по ${field}:`, error)
//     }
//   }

//   const handleGroup = async (field) => {
//     try {
//       let endpoint = ''

//       switch (field) {
//         case ROUTES.IP:
//           endpoint = ROUTES.IP + ROUTES.GROUP
//           break
//         case ROUTES.PORTS:
//           endpoint = ROUTES.PORTS + ROUTES.GROUP
//           break
//         case ROUTES.KEYWORDS:
//           endpoint = ROUTES.KEYWORDS + ROUTES.GROUP
//           break
//         default:
//           return
//       }

//       // Для группировки параметры не передаются
//       const res = await fetchData(endpoint, {})
//       setGroupResult(res.data)
//     } catch (error) {
//       console.error(`Ошибка группировки по ${field}:`, error)
//     }
//   }

//   // console.log('groupResult > ', groupResult?.data)
//   // console.log('reportData > ',reportData?.data)

//   const clearField = (field) => {
//     updateField(field, '')
//   }

//   const handleClearAll = () => {
//     setSearchText({
//       ip: '',
//       ports: '',
//       keywords: '',
//     })
//   }

//   // const handleSearchAll = () => {
//   //   console.log('Поиск по всем полям:', searchText)
//   //   // Логика глобального поиска
//   // }

//   const hasAnyValue = Object.values(searchText).some((val) => val.trim())

//   const configFields = [
//     { inputPlaceholder: 'Поиск по IP', fieldType: ROUTES.IP },
//     { inputPlaceholder: 'Поиск по портам', fieldType: ROUTES.PORTS },
//     {
//       inputPlaceholder: 'Поиск по ключевым словам',
//       fieldType: ROUTES.KEYWORDS,
//     },
//   ]

//   return (
//     <div className={cn.panel}>
//       <h2>Введите значение</h2>
//       <ul className={cn.list}>
//         {configFields.map((item) => (
//           <li className={cn.searchGroup} key={item.fieldType}>
//             <Input
//               value={searchText[item.fieldType]}
//               placeholder={item.inputPlaceholder}
//               containerClass={{ width: 300 }}
//               onChange={(e) => updateField(item.fieldType, e.target.value)}
//               showClear
//               onClear={() => clearField(item.fieldType)}
//             />
//             <div className={cn.btnGroup}>
//               <Button
//                 onClick={() => handleSearch(item.fieldType)}
//                 className={cn.searchButton}
//                 disabled={!searchText[item.fieldType].trim()}
//               >
//                 Найти
//               </Button>
//               <Button
//                 onClick={() => handleGroup(item.fieldType)}
//                 className={cn.groupButton}
//               >
//                 Группировать
//               </Button>
//             </div>
//           </li>
//         ))}
//         {/* Общие действия */}
//         <li className={cn.actionsGroup}>
//           {/* <Button
//             onClick={handleSearchAll}
//             className={cn.searchAllButton}
//             disabled={!hasAnyValue}
//           >
//             Поиск по всем
//           </Button> */}
//           <Button
//             onClick={handleClearAll}
//             className={cn.clearAllButton}
//             disabled={!hasAnyValue}
//           >
//             Очистить все поля
//           </Button>
//         </li>
//       </ul>
//     </div>
//   )
// }
