import { useState } from 'react'
import { Input } from '../Input/Input'
import { Button } from '../Button/Button'
import cn from './SearchPanel.module.scss'
import {
  MultiSelectDataList,
  SingleSelectDataList,
} from '../MultiSelectDataList'
import DatePicker from '../DatePicker/DatePicker'
import { Radio, Tooltip } from 'antd'
import { initialDateRange } from '../utils/constant'
import { DownloadOutlined, ClearOutlined } from '@ant-design/icons'

const defaultInputValues = {
  ip: '',
  portOpened: '',
  portFiltered: '',
  keyword: '',
  priority: '',
  group: '',
  isWhois: true,
}

export const SearchPanel = ({ service }) => {
  const [searchValue, setSearchValue] = useState(defaultInputValues)
  const [dateRange, setDateRange] = useState(initialDateRange)

  const updateField = (field, value) => {
    setSearchValue((prev) => ({ ...prev, [field]: value }))
  }

  const clearField = (field) => {
    updateField(field, '')
  }

  const handleClearAll = () => {
    setSearchValue(defaultInputValues)
  }

  // Обработчики для MultiSelectDataList
  const handlePortOpenedChange = (newValue) => {
    updateField('portOpened', newValue)
  }

  const handlePortFilteredChange = (newValue) => {
    updateField('portFiltered', newValue)
  }

  const handlePriorityChange = (newValue) => {
    updateField('priority', newValue)
  }

  const handleGroupChange = (newValue) => {
    updateField('group', newValue)
  }

  const handleKeywordInputChange = (newValue) => {
    updateField('keyword', newValue)
  }

  const handleWithWhoisChange = (e) => {
    updateField('isWhois', e.target.value == 1)
  }

  // Функция для подготовки данных для запроса
  const prepareRequestData = () => {
    const requestData = {
      ip: searchValue.ip || undefined,
      portOpened: searchValue.portOpened || undefined,
      portFiltered: searchValue.portFiltered || undefined,
      keyword: searchValue.keyword || undefined,
      priority: searchValue.priority || undefined,
      group: searchValue.group || undefined,
      isWhois: searchValue.isWhois,
      dateRange: {
        startDate: dateRange[0],
        endDate: dateRange[1],
      },
    }

    // Удаляем undefined значения
    Object.keys(requestData).forEach((key) => {
      if (requestData[key] === undefined) {
        delete requestData[key]
      }
    })

    return requestData
  }

  // Обработчик для кнопки "Найти"
  const handleSearch = async () => {
    const requestData = prepareRequestData()
    console.log('POST /data/search - данные для запроса:', requestData)

    try {
      const response = await service.postData('/data/search', requestData)
      console.log('POST /data/search - ответ:', response)
      // Здесь можно обработать успешный ответ
    } catch (error) {
      console.error('POST /data/search - ошибка:', error)
      // Здесь можно обработать ошибку
    }
  }

  // Обработчик для кнопки "Группировать"
  const handleGroup = async () => {
    const requestData = prepareRequestData()
    console.log('POST /data/group - данные для запроса:', requestData)

    try {
      const response = await service.postData('/data/group', requestData)
      console.log('POST /data/group - ответ:', response)
      // Здесь можно обработать успешный ответ
    } catch (error) {
      console.error('POST /data/group - ошибка:', error)
      // Здесь можно обработать ошибку
    }
  }

  const getUniversalPrepared = (data) =>
    data?.data?.map((el) => `[${el.id}] ${el.name}`) || []

  const getPortPrepared = (data) =>
    data?.data?.map((el) => `${el.port} (${el.name})`) || []

  return (
    <div className={cn.panel}>
      <div className={cn.actionsGroup}>
        <h2>Введите значение</h2>
        <Tooltip title='Сбросить все поля'>
          <Button onClick={handleClearAll} className={cn.clearAllButton}>
            <ClearOutlined />
          </Button>
        </Tooltip>
      </div>

      <ul className={cn.list}>
        <li className={cn.searchGroup}>
          <label className={cn.fieldLabel}>Период</label>
          <DatePicker dateRange={dateRange} setDateRange={setDateRange} />
        </li>
        <li className={cn.searchGroup}>
          <label className={cn.fieldLabel}>Поиск по IP</label>
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
          <label className={cn.fieldLabel}>Порты</label>
          <div className={cn.portWrapper}>
            <MultiSelectDataList
              service={service}
              value={searchValue.portOpened}
              onChange={handlePortOpenedChange}
              placeholder="Открытые порты"
              fetchDataUrl="data"
              getDataPrepared={getPortPrepared}
              fetchParams={{ q: 'ports' }}
              dataListId="portsOpened"
              mode="multiple"
              style={{ width: '100%', maxWidth: '300px' }}
            />

            <MultiSelectDataList
              service={service}
              value={searchValue.portFiltered}
              onChange={handlePortFilteredChange}
              placeholder="Фильтрованные порты"
              fetchDataUrl="data"
              fetchParams={{ q: 'ports' }}
              getDataPrepared={getPortPrepared}
              dataListId="portsFiltered"
              mode="multiple"
              style={{ width: '100%', maxWidth: '300px' }}
            />
          </div>
        </li>

        <li className={cn.searchGroup}>
          <label className={cn.fieldLabel}>Ключевые слова</label>
          {/* <Input
            value={searchValue.keyword}
            placeholder="Введите ключевые слова"
            containerClass={{ width: 300 }}
            onChange={handleKeywordInputChange}
            showClear
            onClear={() => clearField('keyword')}
          /> */}
          <MultiSelectDataList
            service={service}
            value={searchValue.keyword}
            onChange={handleKeywordInputChange}
            placeholder="Введите ключевые слова"
            fetchDataUrl="data"
            fetchParams={{ q: 'keywords' }}
            getDataPrepared={getUniversalPrepared}
            dataListId="keywords"
            mode="multiple"
            style={{ width: '100%', maxWidth: '300px' }}
          />
        </li>

        <li className={cn.searchGroup}>
          <label className={cn.fieldLabel}>Whois</label>
          <Radio.Group
            onChange={handleWithWhoisChange}
            value={searchValue.isWhois ? 1 : 2}
          >
            <Radio value={1}>Только с Whois</Radio>
            <Radio value={2}>Только без Whois</Radio>
          </Radio.Group>
        </li>

        <li className={cn.searchGroup}>
          <label className={cn.fieldLabel}>Приоритет</label>
          <SingleSelectDataList
            service={service}
            value={searchValue.priority}
            onChange={handlePriorityChange}
            placeholder="Выберите приоритет"
            fetchDataUrl="data"
            fetchParams={{ q: 'priority' }}
            getDataPrepared={getUniversalPrepared}
            dataListId="priority"
            style={{ width: '100%', maxWidth: '300px' }}
          />
        </li>

        <li className={cn.searchGroup}>
          <label className={cn.fieldLabel}>Группа</label>
          <MultiSelectDataList
            service={service}
            value={searchValue.group}
            onChange={handleGroupChange}
            placeholder="Выберите группу"
            fetchDataUrl="data"
            fetchParams={{ q: 'group' }}
            getDataPrepared={getUniversalPrepared}
            dataListId="group"
            mode="multiple"
            style={{ width: '100%', maxWidth: '300px' }}
          />
        </li>
      </ul>

      <div className={cn.btnGroup}>
        <Button onClick={handleSearch} className={cn.searchButton}>
          Найти
        </Button>
        <Button onClick={handleGroup} className={cn.groupButton}>
          Группировать
        </Button>
        <Button size="small" className={cn.searchButton}>
          <DownloadOutlined /> Экспорт данных
        </Button>
      </div>
    </div>
  )
}

// рабочий код без запроса
/************************************* */
// import { useState } from 'react'
// import { Input } from '../Input/Input'
// import { Button } from '../Button/Button'
// import cn from './SearchPanel.module.scss'
// import { DataList } from '../DataList/DataList'
// import {
//   MultiSelectDataList,
//   SingleSelectDataList,
// } from '../MultiSelectDataList'
// import DatePicker from '../DatePicker/DatePicker'
// import { Checkbox, Radio } from 'antd'
// import { initialDateRange } from '../utils/constant'
// import { DownloadOutlined } from '@ant-design/icons'

// const defaultInputValues = {
//   ip: '',
//   portOpened: '',
//   portFiltered: '',
//   keyword: '',
//   priority: '',
//   group: '',
//   isWhois: true,
// }

// export const SearchPanel = ({ onSearch, onGroup, service }) => {
//   const [searchValue, setSearchValue] = useState(defaultInputValues)
//   const [dateRange, setDateRange] = useState(initialDateRange)

//   const { isWhois, ...rest } = searchValue
//   const hasAnyValue =
//     Object.values(rest).some((el) => el.trim() !== '') || !searchValue.isWhois

//   const updateField = (field, value) => {
//     setSearchValue((prev) => ({ ...prev, [field]: value }))
//   }

//   const clearField = (field) => {
//     updateField(field, '')
//   }

//   const handleClearAll = () => {
//     setSearchValue(defaultInputValues)
//     onSearch('ip')
//   }

//   // Обработчики для MultiSelectDataList
//   const handlePortOpenedChange = (newValue) => {
//     updateField('portOpened', newValue)
//   }

//   const handlePortFilteredChange = (newValue) => {
//     updateField('portFiltered', newValue)
//   }

//   const handlePriorityChange = (newValue) => {
//     updateField('priority', newValue)
//   }

//   const handleGroupChange = (newValue) => {
//     updateField('group', newValue)
//   }

//   const handleKeywordInputChange = (e) => {
//     updateField('keyword', e.target.value)
//   }

//   const handleWithWhoisChange = (e) => {
//     updateField('isWhois', e.target.value == 1)
//   }

//   const handleColorChange = (e) => {
//     const checkbox = document.querySelector(`[value=${e.target.value}]`)
//     const item = checkbox.parentElement.parentElement.parentElement
//     item.classList.toggle('border')
//   }

//   const getGroupPrepared = (data) =>
//     data?.data?.map((el) => `[${el.id}] ${el.name}`) || []

//   const getPortPrepared = (data) =>
//     data?.data?.map((el) => `${el.port} (${el.name})`) || []

//   return (
//     <div className={cn.panel}>
//       <h2>Введите значение</h2>
//       <div className={cn.btnGroup}>
//         <DatePicker dateRange={dateRange} setDateRange={setDateRange} />
//         <Button
//           onClick={() => onSearch('keywords', { keyword: searchValue.keyword })}
//           className={cn.searchButton}
//         >
//           Найти
//         </Button>
//         <Button
//           onClick={() => onGroup('keywords/group')}
//           className={cn.groupButton}
//         >
//           Группировать
//         </Button>
//       </div>

//       <Checkbox.Group style={{ width: '100%' }}>
//         <ul className={cn.list}>
//           <li className={cn.searchGroup}>
//             <Checkbox value="ip" onChange={handleColorChange}>
//               Поиск по IP
//             </Checkbox>
//             <Input
//               value={searchValue.ip}
//               placeholder="Введите IP"
//               containerClass={{ width: 300 }}
//               onChange={(e) => updateField('ip', e.target.value)}
//               showClear
//               onClear={() => clearField('ip')}
//             />
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="ports" onChange={handleColorChange}>
//               Порты
//             </Checkbox>
//             <div
//               style={{
//                 display: 'flex',
//                 flexDirection: 'column',
//                 gap: '8px',
//                 width: '100%',
//               }}
//             >
//               <div>
//                 <label
//                   style={{
//                     display: 'block',
//                     marginBottom: '4px',
//                     fontSize: '12px',
//                   }}
//                 >
//                   Открытые порты:
//                 </label>
//                 <MultiSelectDataList
//                   service={service}
//                   value={searchValue.portOpened}
//                   onChange={handlePortOpenedChange}
//                   placeholder="Выберите открытые порты"
//                   fetchDataUrl="data"
//                   getDataPrepared={getPortPrepared}
//                   fetchParams={{ q: 'ports' }}
//                   dataListId="portsOpened"
//                   mode="multiple"
//                   style={{ width: '100%', maxWidth: '400px' }}
//                 />
//               </div>

//               <div>
//                 <label
//                   style={{
//                     display: 'block',
//                     marginBottom: '4px',
//                     fontSize: '12px',
//                   }}
//                 >
//                   Закрытые порты:
//                 </label>
//                 <MultiSelectDataList
//                   service={service}
//                   value={searchValue.portFiltered}
//                   onChange={handlePortFilteredChange}
//                   placeholder="Выберите закрытые порты"
//                   fetchDataUrl="data"
//                   fetchParams={{ q: 'portsFiltered' }}
//                   getDataPrepared={getPortPrepared}
//                   dataListId="portsFiltered"
//                   mode="multiple"
//                   style={{ width: '100%', maxWidth: '400px' }}
//                 />
//               </div>
//             </div>
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="whois" onChange={handleColorChange}>
//               Whois
//             </Checkbox>
//             <Radio.Group
//               onChange={handleWithWhoisChange}
//               value={searchValue.isWhois ? 1 : 2}
//             >
//               <Radio value={1}>Только с Whois</Radio>
//               <Radio value={2}>Только без Whois</Radio>
//             </Radio.Group>
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="keywords" onChange={handleColorChange}>
//               Ключевые слова
//             </Checkbox>
//             <Input
//               value={searchValue.keyword}
//               placeholder="Введите ключевые слова"
//               containerClass={{ width: 300 }}
//               onChange={handleKeywordInputChange}
//               showClear
//               onClear={() => clearField('keyword')}
//             />
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="priority" onChange={handleColorChange}>
//               Приоритет
//             </Checkbox>
//             {/* <MultiSelectDataList
//               service={service}
//               value={searchValue.priority}
//               onChange={handlePriorityChange}
//               placeholder="Выберите приоритет"
//               fetchDataUrl="data"
//               fetchParams={{ q: 'priority' }}
//               getDataPrepared={getGroupPrepared}
//               dataListId="priority"
//               mode="multiple"
//               style={{ width: '100%', maxWidth: '400px' }}
//             /> */}
//             <SingleSelectDataList
//               service={service}
//               value={searchValue.priority}
//               onChange={handlePriorityChange}
//               placeholder="Выберите приоритет"
//               fetchDataUrl="data"
//               fetchParams={{ q: 'priority' }}
//               getDataPrepared={getGroupPrepared}
//               dataListId="priority"
//               style={{ width: '100%', maxWidth: '400px' }}
//             />
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="group" onChange={handleColorChange}>
//               Группа
//             </Checkbox>
//             <MultiSelectDataList
//               service={service}
//               value={searchValue.group}
//               onChange={handleGroupChange}
//               placeholder="Выберите группу"
//               fetchDataUrl="data"
//               fetchParams={{ q: 'group' }}
//               getDataPrepared={getGroupPrepared}
//               dataListId="group"
//               mode="multiple"
//               style={{ width: '100%', maxWidth: '400px' }}
//             />
//           </li>
//         </ul>
//       </Checkbox.Group>

//       <div className={cn.actionsGroup}>
//         <Button size="small">
//           <DownloadOutlined /> Экспорт данных
//         </Button>
//         <Button
//           onClick={handleClearAll}
//           className={cn.clearAllButton}
//           disabled={!hasAnyValue}
//         >
//           Сбросить все поля
//         </Button>
//       </div>
//     </div>
//   )
// }

/************************************* */
// import { useState } from 'react'
// import { Input } from '../Input/Input'
// import { Button } from '../Button/Button'
// import cn from './SearchPanel.module.scss'
// import { DataList } from '../DataList/DataList'
// import DatePicker from '../DatePicker/DatePicker'
// import { Checkbox, Radio } from 'antd'
// import { initialDateRange } from '../utils/constant'
// import { DownloadOutlined } from '@ant-design/icons'

// const defaultInputValues = {
//   ip: '',
//   portOpened: '',
//   portFiltered: '',
//   keyword: '',
//   priority: '',
//   group: '',
//   isWhois: true,
// }

// export const SearchPanel = ({ onSearch, onGroup, service }) => {
//   const [searchValue, setSearchValue] = useState(defaultInputValues)
//   const [dateRange, setDateRange] = useState(initialDateRange)

//   const { isWhois, ...rest } = searchValue
//   const hasAnyValue =
//     Object.values(rest).some((el) => el.trim() !== '') || !searchValue.isWhois

//   const updateField = (field, value) => {
//     setSearchValue((prev) => ({ ...prev, [field]: value }))
//   }

//   const clearField = (field) => {
//     updateField(field, '')
//   }

//   const handleClearAll = () => {
//     setSearchValue(defaultInputValues)
//     onSearch('ip')
//   }

//   const handlePortOpenedChange = (newValue) => {
//     // updateField('portOpened', newValue)
//     const valuesArray = newValue
//       .split(',')
//       .map((item) => item.trim())
//       .filter((item) => item.length > 0)
//     setSearchValue((prev) => ({
//       ...prev,
//       portFiltered: prev.portOpened + ', ' + valuesArray.join(', '),
//     }))
//   }

//   const handlePortFilteredChange = (newValue) => {
//     // updateField('portFiltered', newValue)
//     const valuesArray = newValue
//       .split(',')
//       .map((item) => item.trim())
//       .filter((item) => item.length > 0)
//     setSearchValue((prev) => ({
//       ...prev,
//       portFiltered: prev.portOpened + ', ' + valuesArray.join(', '),
//     }))
//   }

//   const handlePriorityChange = (newValue) => {
//     updateField('priority', newValue)
//   }
//   const handleGroupChange = (newValue) => {
//     updateField('group', newValue)
//   }

//   const handleKeywordInputChange = (e) => {
//     updateField('keyword', e.target.value)
//   }

//   const handleWithWhoisChange = (e) => {
//     updateField('isWhois', e.target.value == 1)
//   }

//   const handleColorChange = (e) => {
//     const checkbox = document.querySelector(`[value=${e.target.value}]`)
//     const item = checkbox.parentElement.parentElement.parentElement
//     item.classList.toggle('border')
//   }

//   const getGroupPrepared = (data) =>
//     data?.data?.map((el) => `[${el.id}] ${el.name}`) || []

//   const getPortPrepared = (data) =>
//     data?.data?.map((el) => `${el.port} (${el.name})`) || []

//   return (
//     <div className={cn.panel}>
//       <h2>Введите значение</h2>
//       <div className={cn.btnGroup}>
//         <DatePicker dateRange={dateRange} setDateRange={setDateRange} />
//         <Button
//           onClick={() => onSearch('keywords', { keyword: searchValue.keyword })}
//           className={cn.searchButton}
//           // disabled={!searchValue.keyword.trim()}
//         >
//           Найти
//         </Button>
//         <Button
//           onClick={() => onGroup('keywords/group')}
//           className={cn.groupButton}
//         >
//           Группировать
//         </Button>
//       </div>

//       <Checkbox.Group style={{ width: '100%' }}>
//         <ul className={cn.list}>
//           <li className={cn.searchGroup}>
//             <Checkbox value="ip" onChange={handleColorChange}>
//               Поиск по IP
//             </Checkbox>
//             <Input
//               value={searchValue.ip}
//               placeholder="Введите IP"
//               containerClass={{ width: 300 }}
//               onChange={(e) => updateField('ip', e.target.value)}
//               showClear
//               onClear={() => clearField('ip')}
//             />
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="ports" onChange={handleColorChange}>
//               Порты
//             </Checkbox>
//             <div
//               style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
//             >
//               <DataList
//                 service={service}
//                 value={searchValue.portOpened}
//                 // dataList={dataList}
//                 // setDataList={setDataList}
//                 onChange={handlePortOpenedChange}
//                 placeholder="Открытые порты"
//                 containerClass={{ marginRight: 12 }}
//                 fetchDataUrl="data"
//                 getDataPrepared={getPortPrepared}
//                 fetchParams={{ q: 'ports' }}
//                 // fetchParams={{ q: 'portsOpened' }}
//                 dataListId="portsOpened"
//               />
//               <DataList
//                 service={service}
//                 value={searchValue.portFiltered}
//                 // dataList={dataList}
//                 // setDataList={setDataList}
//                 onChange={handlePortFilteredChange}
//                 placeholder="Закрытые порты"
//                 containerClass={{ marginRight: 12 }}
//                 fetchDataUrl="data"
//                 fetchParams={{ q: 'portsFiltered' }}
//                 getDataPrepared={getPortPrepared}
//                 dataListId="portsFiltered"
//               />
//               {/* <DataList
//                 service={service}
//                 value={searchText.port}
//                 onChange={handlePortChange}
//                 placeholder="Поиск по портам (например, 443 или 443 (https))"
//                 fetchDataUrl="data"
//                 fetchParams={{ q: 'ports' }}
//                 getDataPrepared={getPortPrepared}
//               /> */}

//               {/* <DataList
//                 service={service}
//                 value={searchValue.portFiltered}
//                 onChange={handlePortFilteredChange}
//                 placeholder="Закрытые порты"
//               /> */}
//             </div>
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="whois" onChange={handleColorChange}>
//               Whois
//             </Checkbox>
//             <Radio.Group
//               onChange={handleWithWhoisChange}
//               value={searchValue.isWhois ? 1 : 2}
//             >
//               <Radio value={1}>Только с Whois</Radio>
//               <Radio value={2}>Только без Whois</Radio>
//             </Radio.Group>
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="keywords" onChange={handleColorChange}>
//               Ключевые слова
//             </Checkbox>
//             <Input
//               value={searchValue.keyword}
//               placeholder="Введите ключевые слова"
//               containerClass={{ width: 300 }}
//               onChange={handleKeywordInputChange}
//               showClear
//               onClear={() => clearField('keyword')}
//             />
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="priority" onChange={handleColorChange}>
//               Приоритет
//             </Checkbox>
//             {/* <DataList
//               service={service}
//               value={searchValue.priority}
//               onChange={handlePriorityChange}
//               placeholder="Приоритет"
//             /> */}
//             <DataList
//               service={service}
//               value={searchValue.priority}
//               // dataList={dataList}
//               // setDataList={setDataList}
//               onChange={handlePriorityChange}
//               placeholder="Приоритет"
//               containerClass={{ marginRight: 12 }}
//               fetchDataUrl="data"
//               fetchParams={{ q: 'priority' }}
//               getDataPrepared={getGroupPrepared}
//               dataListId="priority"
//             />
//           </li>

//           <li className={cn.searchGroup}>
//             <Checkbox value="group" onChange={handleColorChange}>
//               Группа
//             </Checkbox>
//             {/* <DataList
//               service={service}
//               value={searchValue.group}
//               onChange={handleGroupChange}
//               placeholder="Группа"
//               fetchDataUrl="ports/data"
//               getDataPrepared={getGroupPrepared}
//             /> */}
//             <DataList
//               service={service}
//               value={searchValue.group}
//               // dataList={dataList}
//               // setDataList={setDataList}
//               onChange={handleGroupChange}
//               placeholder="Группа"
//               containerClass={{ marginRight: 12 }}
//               fetchDataUrl="data"
//               fetchParams={{ q: 'group' }}
//               getDataPrepared={getGroupPrepared}
//               dataListId="priority"
//             />
//           </li>
//         </ul>
//       </Checkbox.Group>

//       <div className={cn.actionsGroup}>
//         <Button
//           // onClick={handleExportJson}
//           size="small"
//         >
//           <DownloadOutlined /> Экспорт данных
//         </Button>
//         <Button
//           onClick={handleClearAll}
//           className={cn.clearAllButton}
//           disabled={!hasAnyValue}
//         >
//           Сбросить все поля
//         </Button>
//       </div>
//     </div>
//   )
// }
