import { useState } from 'react'
import { Input } from '../Input/Input'
import { Button } from '../Button/Button'
import cn from './SearchPanel.module.scss'
import { DataList } from '../DataList/DataList'
import DatePicker from '../DatePicker/DatePicker'
import { Checkbox, Radio } from 'antd'
import { initialDateRange } from '../utils/constant'
import { DownloadOutlined } from '@ant-design/icons'

const defaultInputValues = {
  ip: '',
  portOpened: '',
  portFiltered: '',
  keyword: '',
  priority: '',
  group: '',
  isWhois: true,
}

export const SearchPanel = ({ onSearch, onGroup, service }) => {
  const [searchValue, setSearchValue] = useState(defaultInputValues)
  const [dataList, setDataList] = useState([])
  const [dateRange, setDateRange] = useState(initialDateRange)

  const { isWhois, ...rest } = searchValue
  const hasAnyValue =
    Object.values(rest).some((el) => el.trim() !== '') || !searchValue.isWhois

  const updateField = (field, value) => {
    setSearchValue((prev) => ({ ...prev, [field]: value }))
  }

  const clearField = (field) => {
    updateField(field, '')
  }

  const handleClearAll = () => {
    setSearchValue(defaultInputValues)
    onSearch('ip')
  }

  const handlePortOpenedChange = (newValue) => {
    // updateField('portOpened', newValue)
    const valuesArray = newValue
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    setSearchValue((prev) => ({
      ...prev,
      portFiltered: prev.portOpened + ', ' + valuesArray.join(', '),
    }))
  }

  const handlePortFilteredChange = (newValue) => {
    // updateField('portFiltered', newValue)
    const valuesArray = newValue
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    setSearchValue((prev) => ({
      ...prev,
      portFiltered: prev.portOpened + ', ' + valuesArray.join(', '),
    }))
  }

  const handlePriorityChange = (newValue) => {
    updateField('priority', newValue)
  }
  const handleGroupChange = (newValue) => {
    updateField('group', newValue)
  }

  const handleKeywordInputChange = (e) => {
    updateField('keyword', e.target.value)
  }

  const handleWithWhoisChange = (e) => {
    updateField('isWhois', e.target.value == 1)
  }

  const handleColorChange = (e) => {
    const checkbox = document.querySelector(`[value=${e.target.value}]`)
    const item = checkbox.parentElement.parentElement.parentElement
    item.classList.toggle('border')
  }

  const getGroupPrepared = (data) =>
    data?.data?.map((el) => `[${el.id}] ${el.name}`) || []

  const getPortPrepared = (data) =>
    data?.data?.map((el) => `${el.port} (${el.name})`) || []

  return (
    <div className={cn.panel}>
      <h2>Введите значение</h2>
      <div className={cn.btnGroup}>
        <DatePicker dateRange={dateRange} setDateRange={setDateRange} />
        <Button
          onClick={() => onSearch('keywords', { keyword: searchValue.keyword })}
          className={cn.searchButton}
          // disabled={!searchValue.keyword.trim()}
        >
          Найти
        </Button>
        <Button
          onClick={() => onGroup('keywords/group')}
          className={cn.groupButton}
        >
          Группировать
        </Button>
      </div>

      <Checkbox.Group style={{ width: '100%' }}>
        <ul className={cn.list}>
          <li className={cn.searchGroup}>
            <Checkbox value="ip" onChange={handleColorChange}>
              Поиск по IP
            </Checkbox>
            <Input
              value={searchValue.ip}
              placeholder="Введите IP"
              containerClass={{ width: 300 }}
              onChange={(e) => updateField('ip', e.target.value)}
              showClear
              onClear={() => clearField('ip')}
            />
          </li>

          <li className={cn.searchGroup}>
            <Checkbox value="ports" onChange={handleColorChange}>
              Порты
            </Checkbox>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <DataList
                service={service}
                value={searchValue.portOpened}
                // dataList={dataList}
                // setDataList={setDataList}
                onChange={handlePortOpenedChange}
                placeholder="Открытые порты"
                containerClass={{ marginRight: 12 }}
                fetchDataUrl="data"
                fetchParams={{ q: 'ports' }}
                getDataPrepared={getPortPrepared}
                // dataListId="portsOpened"
              />
              <DataList
                service={service}
                value={searchValue.portFiltered}
                // dataList={dataList}
                // setDataList={setDataList}
                onChange={handlePortFilteredChange}
                placeholder="Закрытые порты"
                containerClass={{ marginRight: 12 }}
                fetchDataUrl="data"
                fetchParams={{ q: 'portsFiltered' }}
                getDataPrepared={getPortPrepared}
                // dataListId="portsFiltered"
              />
              {/* <DataList
                service={service}
                value={searchText.port}
                onChange={handlePortChange}
                placeholder="Поиск по портам (например, 443 или 443 (https))"
                fetchDataUrl="data"
                fetchParams={{ q: 'ports' }}
                getDataPrepared={getPortPrepared}
              /> */}

              {/* <DataList
                service={service}
                value={searchValue.portFiltered}
                onChange={handlePortFilteredChange}
                placeholder="Закрытые порты"
              /> */}
            </div>
          </li>

          <li className={cn.searchGroup}>
            <Checkbox value="whois" onChange={handleColorChange}>
              Whois
            </Checkbox>
            <Radio.Group
              onChange={handleWithWhoisChange}
              value={searchValue.isWhois ? 1 : 2}
            >
              <Radio value={1}>Только с Whois</Radio>
              <Radio value={2}>Только без Whois</Radio>
            </Radio.Group>
          </li>

          <li className={cn.searchGroup}>
            <Checkbox value="keywords" onChange={handleColorChange}>
              Ключевые слова
            </Checkbox>
            <Input
              value={searchValue.keyword}
              placeholder="Введите ключевые слова"
              containerClass={{ width: 300 }}
              onChange={handleKeywordInputChange}
              showClear
              onClear={() => clearField('keyword')}
            />
          </li>

          <li className={cn.searchGroup}>
            <Checkbox value="priority" onChange={handleColorChange}>
              Приоритет
            </Checkbox>
            {/* <DataList
              service={service}
              value={searchValue.priority}
              onChange={handlePriorityChange}
              placeholder="Приоритет"
            /> */}
            <DataList
              service={service}
              value={searchValue.priority}
              // dataList={dataList}
              // setDataList={setDataList}
              onChange={handlePriorityChange}
              placeholder="Приоритет"
              containerClass={{ marginRight: 12 }}
              fetchDataUrl="data"
              fetchParams={{ q: 'priority' }}
              getDataPrepared={getGroupPrepared}
              // dataListId="priority"
            />
          </li>

          <li className={cn.searchGroup}>
            <Checkbox value="group" onChange={handleColorChange}>
              Группа
            </Checkbox>
            {/* <DataList
              service={service}
              value={searchValue.group}
              onChange={handleGroupChange}
              placeholder="Группа"
              fetchDataUrl="ports/data"
              getDataPrepared={getGroupPrepared}
            /> */}
            <DataList
              service={service}
              value={searchValue.group}
              // dataList={dataList}
              // setDataList={setDataList}
              onChange={handleGroupChange}
              placeholder="Группа"
              containerClass={{ marginRight: 12 }}
              fetchDataUrl="data"
              fetchParams={{ q: 'group' }}
              getDataPrepared={getGroupPrepared}
              // dataListId="priority"
            />
          </li>
        </ul>
      </Checkbox.Group>

      <div className={cn.actionsGroup}>
        <Button
          // onClick={handleExportJson}
          size="small"
        >
          <DownloadOutlined /> Экспорт данных
        </Button>
        <Button
          onClick={handleClearAll}
          className={cn.clearAllButton}
          disabled={!hasAnyValue}
        >
          Сбросить все поля
        </Button>
      </div>
    </div>
  )
}

// import React, { useState } from 'react'
// import { Input } from '../Input/Input'
// import { Button } from '../Button/Button'
// import cn from './SearchForm.module.scss'
// import { DataList } from '../DataList/DataList'
// import { Checkbox, Form, Radio } from 'antd'

// export const SearchForm = ({ onSearch, onGroup, service }) => {
//   const [searchText, setSearchText] = useState({
//     ip: '',
//     port: '',
//     keyword: '',
//   })
//   const [isChecked, setIsChecked] = React.useState(false)
//   const [valueRadio, setValueRadio] = React.useState(1)

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

//   const handleChange = (e) => {
//     console.log('Radio checked:', e.target.value)
//     setValueRadio(e.target.value)
//   }

//   return (
//     <div className={cn.panel}>
//       <h2>Введите значение</h2>
//       <Checkbox.Group style={{ width: '100%' }}>
//         <ul className={cn.list}>
//           <li className={cn.searchGroup}>
//             <Checkbox value="ip">
//               <li className={cn.searchGroup}>
//                 <Input
//                   value={searchText.ip}
//                   placeholder="Поиск по IP"
//                   containerClass={{ width: 300 }}
//                   onChange={(e) => updateField('ip', e.target.value)}
//                   showClear
//                   onClear={() => clearField('ip')}
//                 />
//               </li>
//             </Checkbox>
//           </li>
//           <li className={cn.searchGroup}>
//             <Checkbox value="ports">
//               <li className={cn.searchGroup}>
//                 <DataList
//                   service={service}
//                   value={searchText.port}
//                   onChange={handlePortChange}
//                   placeholder="Открытые порты"
//                 />
//               </li>
//               <li className={cn.searchGroup}>
//                 <DataList
//                   service={service}
//                   value={searchText.port}
//                   onChange={handlePortChange}
//                   placeholder="Закртые порты"
//                 />
//               </li>
//             </Checkbox>
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="whois">
//               <li className={cn.searchGroup}>
//                 <Radio.Group onChange={handleChange} value={valueRadio}>
//                   <Radio value={1}>Только с Whois</Radio>
//                   <Radio value={2}>Только без Whois</Radio>
//                 </Radio.Group>
//               </li>
//             </Checkbox>
//           </li>
//           <li className={cn.searchGroup}>
//             <Checkbox value="keywords">
//               <li className={cn.searchGroup}>
//                 <Input
//                   value={searchText.keyword}
//                   placeholder="Поиск по ключевым словам"
//                   containerClass={{ width: 300 }}
//                   onChange={handleKeywordInputChange}
//                   showClear
//                   onClear={() => clearField('keyword')}
//                 />
//               </li>
//             </Checkbox>
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="priority">
//               <li className={cn.searchGroup}>
//                 <DataList
//                   service={service}
//                   value={searchText.port}
//                   onChange={handlePortChange}
//                   placeholder="Приоритет"
//                 />
//               </li>
//             </Checkbox>
//           </li>
//           <li className={cn.searchGroup}>
//             <Checkbox value="group">
//               <li className={cn.searchGroup}>
//                 <DataList
//                   service={service}
//                   value={searchText.port}
//                   onChange={handlePortChange}
//                   placeholder="Группа"
//                 />
//               </li>
//             </Checkbox>
//           </li>

//           <li className={cn.searchGroup}>
//             <Button
//               onClick={() =>
//                 onSearch('keywords', { keyword: searchText.keyword })
//               }
//               className={cn.searchButton}
//               disabled={!searchText.keyword.trim()}
//             >
//               Найти
//             </Button>
//             <Button
//               onClick={() => onGroup('keywords/group')}
//               className={cn.groupButton}
//             >
//               Группировать
//             </Button>
//           </li>
//           <li className={cn.actionsGroup}>
//             <Button
//               onClick={handleClearAll}
//               className={cn.clearAllButton}
//               disabled={!hasAnyValue}
//             >
//               Очистить все поля
//             </Button>
//           </li>
//         </ul>
//       </Checkbox.Group>
//     </div>
//   )
// }
