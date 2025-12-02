import React, { useState, useCallback } from 'react'
import { Input } from '../Input/Input'
import { Button } from '../Button/Button'
import cn from './PanelFilters.module.scss'
import { SingleSelectDataList } from '../MultiSelectDataList'
import { Checkbox, Tooltip } from 'antd'
import { ClearOutlined } from '@ant-design/icons'

const initialSearchText = {
  ip: '',
  port: '',
  keyword: '',
  portOpened: true,
  portFiltered: false,
}

export function PanelFilters({ onSearch, onGroup, service }) {
  const [searchText, setSearchText] = useState(initialSearchText)

  // Оптимизированные обработчики с использованием useCallback
  const updateField = useCallback((field, value) => {
    setSearchText((prev) => ({ ...prev, [field]: value }))
  }, [])

  const clearField = useCallback(
    (field) => {
      updateField(field, '')
    },
    [updateField]
  )

  const handleClearAll = useCallback(() => {
    setSearchText(initialSearchText)
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

  const handleKeywordInputChange = useCallback(
    (e) => {
      updateField('keyword', e.target.value)
    },
    [updateField]
  )

  const getPortPrepared = useCallback(
    (data) => data?.data?.map((el) => `${el.port} (${el.name})`) || [],
    []
  )

  const handlePortOpenedChange = useCallback(
    (e) => {
      updateField('portOpened', e.target.checked)
    },
    [updateField]
  )

  const handlePortFilteredChange = useCallback(
    (e) => {
      updateField('portFiltered', e.target.checked)
    },
    [updateField]
  )

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
            onClick={() => onGroup('ip/group')}
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
              fetchParams={{ q: 'ports' }}
              getDataPrepared={getPortPrepared}
              dataListId="ports"
            />
            <div className={cn.checkboxContainer}>
              <Tooltip title="Открытые порты">
                <label className={cn.checkboxLabel}>
                  <Checkbox
                    checked={searchText.portOpened}
                    onChange={handlePortOpenedChange}
                  />
                  Открытые
                </label>
              </Tooltip>
              <Tooltip title="Фильтрованные порты">
                <label className={cn.checkboxLabel}>
                  <Checkbox
                    checked={searchText.portFiltered}
                    onChange={handlePortFilteredChange}
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
                o: searchText.portOpened,
                f: searchText.portFiltered,
              })
            }
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
      </ul>
    </div>
  )
}

// import React, { useState } from 'react'
// import { Input } from '../Input/Input'
// import { Button } from '../Button/Button'
// import cn from './PanelFilters.module.scss'
// import { SingleSelectDataList } from '../MultiSelectDataList'
// import { Checkbox, Tooltip } from 'antd'
// import { ClearOutlined } from '@ant-design/icons'

// const initialSearchText = {
//   ip: '',
//   port: '',
//   keyword: '',
//   portOpened: true,
//   portFiltered: false,
// }

// export function PanelFilters({ onSearch, onGroup, service }) {
//   const [searchText, setSearchText] = useState(initialSearchText)

//   const updateField = (field, value) => {
//     setSearchText((prev) => ({ ...prev, [field]: value }))
//   }

//   const clearField = (field) => {
//     updateField(field, '')
//   }

//   const handleClearAll = () => {
//     setSearchText(initialSearchText)
//     onSearch('ip', {})
//   }

//   const handlePortChange = (value) => {
//     // Извлекаем только номер порта из строки "53 (dns)"
//     const portNumber = value.split(' ')[0]
//     updateField('port', portNumber)
//   }

//   const handleKeywordInputChange = (e) => {
//     updateField('keyword', e.target.value)
//   }

//   const getPortPrepared = (data) =>
//     data?.data?.map((el) => `${el.port} (${el.name})`) || []

//   const handlePortOpenedChange = (e) => {
//     updateField('portOpened', e.target.checked)
//   }

//   const handlePortFilteredChange = (e) => {
//     updateField('portFiltered', e.target.checked)
//   }

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
//             onClick={() => onGroup('ip/group')}
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
//               fetchParams={{ q: 'ports' }}
//               getDataPrepared={getPortPrepared}
//               dataListId="ports"
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
//                 o: searchText.portOpened,
//                 f: searchText.portFiltered,
//               })
//             }
//             className={cn.searchButton}
//             disabled={!searchText.port.trim()}
//           >
//             Найти
//           </Button>
//           <Button
//             onClick={() => onGroup('ports/group')}
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
//             onClick={() => onGroup('keywords/group')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//       </ul>
//     </div>
//   )
// }

// import React, { useState } from 'react'
// import { Input } from '../Input/Input'
// import { Button } from '../Button/Button'
// import cn from './PanelFilters.module.scss'
// import { SingleSelectDataList } from '../MultiSelectDataList'

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
//     onSearch('ip')
//   }

//   const handlePortChange = (value) => {
//     updateField('port', value)
//   }

//   const handleKeywordInputChange = (e) => {
//     updateField('keyword', e.target.value)
//   }

//   const getPortPrepared = (data) =>
//     data?.data?.map((el) => `${el.port} (${el.name})`) || []

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
//             // onClick={() => onGroup('ip/group')}
//             onClick={() => onSearch('ip')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//         <li className={cn.searchGroup}>
//           <SingleSelectDataList
//             service={service}
//             value={searchText.port}
//             onChange={handlePortChange}
//             placeholder="Поиск по портам"
//             fetchDataUrl="data"
//             fetchParams={{ q: 'ports' }}
//             getDataPrepared={getPortPrepared}
//             dataListId="ports"
//           />
//           <Button
//             onClick={() => onSearch('ports', { port: searchText.port })}
//             className={cn.searchButton}
//             disabled={!searchText.port.trim()}
//           >
//             Найти
//           </Button>
//           <Button
//             onClick={() => onGroup('ports/group')}
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
//             onClick={() => onGroup('keywords/group')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//         <li className={cn.actionsGroup}>
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

/****************************************** */
// import React, { useState, useEffect } from 'react'
// import { Input } from '../Input/Input'
// import { Button } from '../Button/Button'
// import cn from './PanelFilters.module.scss'
// import { DataList } from '../DataList/DataList'

// export function PanelFilters({ onSearch, onGroup, service }) {
//   const [searchText, setSearchText] = useState({
//     ip: '',
//     port: '',
//     keyword: '',
//   })

//   const [dataList, setDataList] = useState([])

//   useEffect(() => {
//     const fetchData = async () => {
//       if (dataList.length > 0) return
//       try {
//         const response = await service.getData('ports/data')
//         console.log(response)
//         const dataPrepared =
//           response?.port_data?.map((el) => `${el.port} (${el.name})`) || []

//         setDataList(dataPrepared)
//       } catch (error) {
//         console.error('Error fetching data:', error)
//       }
//     }

//     fetchData()
//   }, [service])

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
//     onSearch('ip')
//   }

//   const handlePortChange = (value) => {
//     updateField('port', value)
//   }

//   const handleKeywordInputChange = (e) => {
//     updateField('keyword', e.target.value)
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
//             onClick={() => onGroup('ip/group')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//         <li className={cn.searchGroup}>
//           <DataList
//             service={service}
//             value={searchText.port}
//             onChange={handlePortChange}
//             dataList={dataList}
//             placeholder="Поиск по портам (например, 443 или 443 (https))"
//           />
//           <Button
//             onClick={() => onSearch('ports', { port: searchText.port })}
//             className={cn.searchButton}
//             disabled={!searchText.port.trim()}
//           >
//             Найти
//           </Button>
//           <Button
//             onClick={() => onGroup('ports/group')}
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
//             onClick={() => onGroup('keywords/group')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//         <li className={cn.actionsGroup}>
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

/***************** */

// import React, { useState } from 'react'
// import { Input } from '../Input/Input'
// import { Button } from '../Button/Button'
// import cn from './PanelFilters.module.scss'
// import { DataList } from '../DataList/DataList'

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

//   const handlePortChange = (value) => {
//     updateField('port', value)
//   }

//   const handleKeywordInputChange = (e) => {
//     updateField('keyword', e.target.value)
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
//             onClick={() => onGroup('ip/group')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//         <li className={cn.searchGroup}>
//           <DataList
//             service={service}
//             value={searchText.port}
//             onChange={handlePortChange}
//             placeholder="Поиск по портам (например, 443 или 443 (https))"
//           />
//           <Button
//             onClick={() => onSearch('ports', { port: searchText.port })}
//             className={cn.searchButton}
//             disabled={!searchText.port.trim()}
//           >
//             Найти
//           </Button>
//           <Button
//             onClick={() => onGroup('ports/group')}
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
//             onClick={() => onGroup('keywords/group')}
//             className={cn.groupButton}
//           >
//             Группировать
//           </Button>
//         </li>
//         <li className={cn.actionsGroup}>
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
