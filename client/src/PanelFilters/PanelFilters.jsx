import { Input } from '../Input/Input'
import { Button } from '../Button/Button'
import cn from './PanelFilters.module.scss'
import { SingleSelectDataList } from '../MultiSelectDataList'
import { Checkbox, Tooltip } from 'antd'
import { ClearOutlined } from '@ant-design/icons'
import useSearch from './hooks/useSearch'

export function PanelFilters({ onSearch, onGroup, service, setSearchParams }) {
  const {
    searchText,
    clearField,
    updateField,
    handleClearAll,
    getPortPrepared,
    handlePortChange,
    handleKeywordChange,
    handleCheckboxChange,
  } = useSearch({ onSearch, setSearchParams })

  return (
    <div className={cn.panel}>
      <div className={cn.actionsGroup}>
        <h2>Введите значение</h2>
        <Tooltip title="Сбросить все поля">
          <Button onClick={handleClearAll} className={cn.clearAllButton}>
            <ClearOutlined />
          </Button>
        </Tooltip>
      </div>
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
            // onClick={() => onGroup('ip/group')}
            onClick={() => onSearch('ip')}
            className={cn.groupButton}
          >
            Группировать
          </Button>
        </li>
        <li className={cn.searchGroup}>
          <div className={cn.portInputsContainer}>
            <SingleSelectDataList
              service={service}
              value={searchText.port}
              onChange={handlePortChange}
              placeholder="Поиск по портам"
              fetchDataUrl="data"
              fetchParams={{ q: 'port' }}
              getDataPrepared={getPortPrepared}
              dataListId="port"
            />
            <div className={cn.checkboxContainer}>
              <Tooltip title="Открытые порты">
                <label className={cn.checkboxLabel}>
                  <Checkbox
                    checked={searchText.portOpened}
                    onChange={(e) => handleCheckboxChange('portOpened', e)}
                  />
                  Открытые
                </label>
              </Tooltip>
              <Tooltip title="Фильтрованные порты">
                <label className={cn.checkboxLabel}>
                  <Checkbox
                    checked={searchText.portFiltered}
                    onChange={(e) => handleCheckboxChange('portFiltered', e)}
                  />
                  Фильтрованные
                </label>
              </Tooltip>
            </div>
          </div>

          <Button
            onClick={() =>
              onSearch('ports', {
                port: searchText.port,
                portOpened: searchText.portOpened,
                portFiltered: searchText.portFiltered,
              })
            }
            className={cn.searchButton}
            disabled={!searchText.port.trim()}
          >
            Найти
          </Button>
          <Button
            onClick={() =>
              onSearch('ports/group', {
                // port: '',
                portOpened: searchText.portOpened,
                portFiltered: searchText.portFiltered,
              })
            }
            // onClick={() => onGroup('ports/group')}
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
            onChange={handleKeywordChange}
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
            onClick={() => onSearch('keywords/group', {})}
            // onClick={() => onGroup('keywords/group', {})}
            className={cn.groupButton}
          >
            Группировать
          </Button>
        </li>
      </ul>
    </div>
  )
}
// import React, { useState, useCallback } from 'react'
// import { Input } from '../Input/Input'
// import { Button } from '../Button/Button'
// import cn from './PanelFilters.module.scss'
// import { SingleSelectDataList } from '../MultiSelectDataList'
// import { Checkbox, Tooltip } from 'antd'
// import { ClearOutlined } from '@ant-design/icons'
// import { initialSearchText } from '../utils/constant'

// export function PanelFilters({ onSearch, onGroup, service, setSearchParams}) {
//   const [searchText, setSearchText] = useState(initialSearchText)

//   // Оптимизированные обработчики с использованием useCallback
//   const updateField = useCallback((field, value) => {
//     setSearchText((prev) => ({ ...prev, [field]: value }))
//     setSearchParams((prev) => ({ ...prev, [field]: value }))
//   }, [])

//   const clearField = useCallback(
//     (field) => {
//       updateField(field, '')
//     },
//     [updateField]
//   )

//   const handleClearAll = useCallback(() => {
//     setSearchText(initialSearchText)
//     setSearchParams(initialSearchText)
//     onSearch('ip', {})
//   }, [onSearch])

//   const handlePortChange = useCallback(
//     (value) => {
//       // Извлекаем только номер порта из строки "53 (dns)"
//       const portNumber = value.split(' ')[0]
//       updateField('port', portNumber)
//     },
//     [updateField]
//   )

//   const handleKeywordInputChange = useCallback(
//     (e) => {
//       updateField('keyword', e.target.value)
//     },
//     [updateField]
//   )

//   const getPortPrepared = useCallback(
//     (data) => data?.data?.map((el) => `${el.port} (${el.name})`) || [],
//     []
//   )

//   const handlePortOpenedChange = useCallback(
//     (e) => {
//       updateField('portOpened', e.target.checked)
//     },
//     [updateField]
//   )

//   const handlePortFilteredChange = useCallback(
//     (e) => {
//       updateField('portFiltered', e.target.checked)
//     },
//     [updateField]
//   )

//   return (
//     <div className={cn.panel}>
//       <div className={cn.actionsGroup}>
//         <h2>Введите значение</h2>
//         <Tooltip title="Сбросить все поля">
//           <Button onClick={handleClearAll} className={cn.clearAllButton}>
//             <ClearOutlined />
//           </Button>
//         </Tooltip>
//       </div>
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
//             // onClick={() => onGroup('ip/group')}
//             onClick={() => onSearch('ip')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//         <li className={cn.searchGroup}>
//           <div className={cn.portInputsContainer}>
//             <SingleSelectDataList
//               service={service}
//               value={searchText.port}
//               onChange={handlePortChange}
//               placeholder="Поиск по портам"
//               fetchDataUrl="data"
//               fetchParams={{ q: 'port' }}
//               getDataPrepared={getPortPrepared}
//               dataListId="port"
//             />
//             <div className={cn.checkboxContainer}>
//               <Tooltip title="Открытые порты">
//                 <label className={cn.checkboxLabel}>
//                   <Checkbox
//                     checked={searchText.portOpened}
//                     onChange={handlePortOpenedChange}
//                   />
//                   Открытые
//                 </label>
//               </Tooltip>
//               <Tooltip title="Фильтрованные порты">
//                 <label className={cn.checkboxLabel}>
//                   <Checkbox
//                     checked={searchText.portFiltered}
//                     onChange={handlePortFilteredChange}
//                   />
//                   Фильтрованные
//                 </label>
//               </Tooltip>
//             </div>
//           </div>

//           <Button
//             onClick={() =>
//               onSearch('ports', {
//                 port: searchText.port,
//                 portOpened: searchText.portOpened,
//                 portFiltered: searchText.portFiltered,
//               })
//             }
//             className={cn.searchButton}
//             disabled={!searchText.port.trim()}
//           >
//             Найти
//           </Button>
//           <Button
//                onClick={() =>
//               onSearch('ports/group', {
//                 // port: '',
//                 portOpened: searchText.portOpened,
//                 portFiltered: searchText.portFiltered,
//               })
//             }
//             // onClick={() => onGroup('ports/group')}
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
//             onChange={handleKeywordInputChange}
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
//             onClick={() => onGroup('keywords/group',{})}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//       </ul>
//     </div>
//   )
// }
