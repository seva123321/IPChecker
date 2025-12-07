import { useState } from 'react'
import { Input } from '../Input/Input'
import { Button } from '../Button/Button'
import cn from './SearchPanel.module.scss'
import styled from 'styled-components'
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
  country: '',
  whois: 'all',
}

const StyledRadio = styled(Radio)`
  .ant-radio-checked {
    .ant-radio-inner {
      border-color: #218838;
      background-color: #218838;

      &:after {
        background-color: white;
      }
    }

    .ant-radio-input:focus + .ant-radio-inner {
      border-color: #19672c !important;
    }
  }
`

const SearchPanel = ({ service, onSearch, onGroup }) => {
  const [searchValue, setSearchValue] = useState(defaultInputValues)
  const [groupValue, setGroupValue] = useState('ip')
  const [dateRange, setDateRange] = useState(initialDateRange)

  const updateSearchField = (field, value) => {
    setSearchValue((prev) => ({ ...prev, [field]: value }))
  }

  const clearField = (field) => {
    updateSearchField(field, '')
  }

  const handleClearAll = () => {
    setSearchValue(defaultInputValues)
    setGroupValue('ip') // Сброс radio к значению по умолчанию
  }

  // Обработчики для MultiSelectDataList
  const handlePortOpenedChange = (newValue) => {
    updateSearchField('portOpened', newValue)
  }

  const handlePortFilteredChange = (newValue) => {
    updateSearchField('portFiltered', newValue)
  }

  const handlePriorityChange = (newValue) => {
    updateSearchField('priority', newValue)
  }

  const handleGroupChange = (newValue) => {
    updateSearchField('group', newValue)
  }

  const handleCountryChange = (newValue) => {
    updateSearchField('country', newValue)
  }

  const handleKeywordInputChange = (newValue) => {
    updateSearchField('keyword', newValue)
  }

  const handleWithWhoisChange = (e) => {
    updateSearchField('whois', e.target.value)
  }
  // const handleWithWhoisChange = (e) => {
  //   updateSearchField('isWhois', e.target.value == 1)
  // }

  // Обработчик изменения радио-кнопки типа группировки
  const handleCommonGroupChange = (e) => {
    setGroupValue(e.target.value)
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
      country: searchValue.country || undefined,
      whois: searchValue.whois,
      dateRange: {
        startDate: dateRange && dateRange[0],
        endDate: dateRange && dateRange[1],
      },
    }

    // Добавляем поле группировки в зависимости от выбранного radio
    requestData.groupingType = groupValue

    // Удаляем undefined значения
    Object.keys(requestData).forEach((key) => {
      if (requestData[key] === undefined) {
        delete requestData[key]
      }
    })

    // Удаляем dateRange если оба значения null
    if (!requestData.dateRange.startDate && !requestData.dateRange.endDate) {
      delete requestData.dateRange
    }

    return requestData
  }

  // Обработчик для кнопки "Найти"
  const handleSearch = async () => {
    const requestData = prepareRequestData()

    try {
      // Вызываем колбэк из MainPage вместо прямого вызова API
      if (onSearch) {
        await onSearch(requestData)
      }
    } catch (error) {
      console.error('Ошибка при поиске:', error)
    }
  }

  // Обработчик для кнопки "Группировать"
  const handleGroup = async () => {
    const requestData = prepareRequestData()

    try {
      // Указываем тип группировки из выбранного radio
      requestData.groupingType = groupValue

      // Вызываем колбэк из MainPage
      if (onGroup) {
        await onGroup(requestData)
      }
    } catch (error) {
      console.error('Ошибка при группировке:', error)
    }
  }

  // Функция для обновления поля (исправленная опечатка)
  const updateField = (field, value) => {
    updateSearchField(field, value)
  }

  const getUniversalPrepared = (data) =>
    data?.data?.map((el) => `${el.name}`) || []
  // data?.data?.map((el) => `[${el.id}] ${el.name}`) || []

  const getPortPrepared = (data) =>
    data?.data?.map((el) => `${el.port} (${el.name})`) || []

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

      {/* Radio.Group для выбора типа группировки */}
      <Radio.Group
        onChange={handleCommonGroupChange}
        value={groupValue}
        className={cn.groupRadioGroup}
      >
        <ul className={cn.list}>
          <li className={`${cn.searchGroup} ${cn.searchGroup__range}`}>
            <label className={cn.fieldLabel}>Период</label>
            <DatePicker dateRange={dateRange} setDateRange={setDateRange} />
          </li>

          <li className={cn.searchGroup}>
            <StyledRadio value="ip">
              <label className={cn.fieldLabel}>Поиск по IP</label>
            </StyledRadio>
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
            <StyledRadio value="ports">
              <label className={cn.fieldLabel}>Порты</label>
            </StyledRadio>
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
            <StyledRadio value="keywords">
              <label className={cn.fieldLabel}>Ключевые слова</label>
            </StyledRadio>
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
            <StyledRadio value="whois">
              <label className={cn.fieldLabel}>Whois</label>
            </StyledRadio>
            <Radio.Group
              onChange={handleWithWhoisChange}
              value={searchValue.whois}
            >
              <Radio value="all">Все</Radio>
              <Radio value="withWhois">Только с Whois</Radio>
              <Radio value="noWhois">Только без Whois</Radio>
            </Radio.Group>
          </li>

          <li className={cn.searchGroup}>
            <StyledRadio value="priority">
              <label className={cn.fieldLabel}>Приоритет</label>
            </StyledRadio>
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
            <StyledRadio value="group">
              <label className={cn.fieldLabel}>Группа</label>
            </StyledRadio>
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

          <li className={cn.searchGroup}>
            <StyledRadio value="country">
              <label className={cn.fieldLabel}>Страна</label>
            </StyledRadio>
            <MultiSelectDataList
              service={service}
              value={searchValue.country}
              onChange={handleCountryChange}
              placeholder="Выберите страну"
              fetchDataUrl="data"
              fetchParams={{ q: 'country' }}
              getDataPrepared={getUniversalPrepared}
              dataListId="country"
              mode="multiple"
              style={{ width: '100%', maxWidth: '300px' }}
            />
          </li>
        </ul>
      </Radio.Group>

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

export default SearchPanel
// import { useState } from 'react'
// import { Input } from '../Input/Input'
// import { Button } from '../Button/Button'
// import cn from './SearchPanel.module.scss'
// import styled from 'styled-components'
// import {
//   MultiSelectDataList,
//   SingleSelectDataList,
// } from '../MultiSelectDataList'
// import DatePicker from '../DatePicker/DatePicker'
// import { Radio, Tooltip } from 'antd'
// import { initialDateRange } from '../utils/constant'
// import { DownloadOutlined, ClearOutlined } from '@ant-design/icons'

// const defaultInputValues = {
//   ip: '',
//   portOpened: '',
//   portFiltered: '',
//   keyword: '',
//   priority: '',
//   group: '',
//   country: '',
//   isWhois: true,
// }

// const StyledRadio = styled(Radio)`
//   .ant-radio-checked {
//     .ant-radio-inner {
//       border-color: #218838;
//       background-color: #218838;

//       &:after {
//         background-color: white;
//       }
//     }

//     .ant-radio-input:focus + .ant-radio-inner {
//       border-color: #19672c !important;
//     }
//   }
// `

// const SearchPanel = ({ service }) => {
//   const [searchValue, setSearchValue] = useState(defaultInputValues)
//   const [groupValue, setGroupValue] = useState('ip')
//   const [dateRange, setDateRange] = useState(initialDateRange)

//   const updateSearchField = (field, value) => {
//     setSearchValue((prev) => ({ ...prev, [field]: value }))
//   }

//   const clearField = (field) => {
//     updateSearchField(field, '')
//   }

//   const handleClearAll = () => {
//     setSearchValue(defaultInputValues)
//     setGroupValue('ip') // Сброс radio к значению по умолчанию
//   }

//   // Обработчики для MultiSelectDataList
//   const handlePortOpenedChange = (newValue) => {
//     updateSearchField('portOpened', newValue)
//   }

//   const handlePortFilteredChange = (newValue) => {
//     updateSearchField('portFiltered', newValue)
//   }

//   const handlePriorityChange = (newValue) => {
//     updateSearchField('priority', newValue)
//   }

//   const handleGroupChange = (newValue) => {
//     updateSearchField('group', newValue)
//   }

//   const handleCountryChange = (newValue) => {
//     updateSearchField('country', newValue)
//   }

//   const handleKeywordInputChange = (newValue) => {
//     updateSearchField('keyword', newValue)
//   }

//   const handleWithWhoisChange = (e) => {
//     updateSearchField('isWhois', e.target.value == 1)
//   }

//   // Обработчик изменения радио-кнопки типа группировки
//   const handleCommonGroupChange = (e) => {
//     setGroupValue(e.target.value)
//   }

//   // Функция для подготовки данных для запроса
//   const prepareRequestData = () => {
//     const requestData = {
//       ip: searchValue.ip || undefined,
//       portOpened: searchValue.portOpened || undefined,
//       portFiltered: searchValue.portFiltered || undefined,
//       keyword: searchValue.keyword || undefined,
//       priority: searchValue.priority || undefined,
//       group: searchValue.group || undefined,
//       country: searchValue.country || undefined,
//       isWhois: searchValue.isWhois,
//       dateRange: {
//         startDate: dateRange && dateRange[0],
//         endDate: dateRange && dateRange[1],
//       },
//     }

//     // Добавляем поле группировки в зависимости от выбранного radio
//     requestData.groupingType = groupValue

//     // Удаляем undefined значения
//     Object.keys(requestData).forEach((key) => {
//       if (requestData[key] === undefined) {
//         delete requestData[key]
//       }
//     })

//     // Удаляем dateRange если оба значения null
//     if (!requestData.dateRange.startDate && !requestData.dateRange.endDate) {
//       delete requestData.dateRange
//     }

//     return requestData
//   }

//   // Обработчик для кнопки "Найти"
//   const handleSearch = async () => {
//     const requestData = prepareRequestData()
//     console.log('POST /data/search - данные для запроса:', requestData)

//     try {
//       const response = await service.postData('/data/search', requestData)
//       console.log('POST /data/search - ответ:', response)
//       // Здесь можно обработать успешный ответ
//     } catch (error) {
//       console.error('POST /data/search - ошибка:', error)
//       // Здесь можно обработать ошибку
//     }
//   }

//   // Обработчик для кнопки "Группировать"
//   const handleGroup = async () => {
//     const requestData = prepareRequestData()
//     console.log('POST /data/group - данные для запроса:', requestData)

//     try {
//       const response = await service.postData('/data/group', requestData)
//       console.log('POST /data/group - ответ:', response)
//       // Здесь можно обработать успешный ответ
//     } catch (error) {
//       console.error('POST /data/group - ошибка:', error)
//       // Здесь можно обработать ошибку
//     }
//   }

//   // Функция для обновления поля (исправленная опечатка)
//   const updateField = (field, value) => {
//     updateSearchField(field, value)
//   }

//   const getUniversalPrepared = (data) =>
//     data?.data?.map((el) => `${el.name}`) || []
//     // data?.data?.map((el) => `[${el.id}] ${el.name}`) || []

//   const getPortPrepared = (data) =>
//     data?.data?.map((el) => `${el.port} (${el.name})`) || []

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

//       {/* Radio.Group для выбора типа группировки */}
//       <Radio.Group
//         onChange={handleCommonGroupChange}
//         value={groupValue}
//         className={cn.groupRadioGroup}
//       >
//         <ul className={cn.list}>
//           <li className={`${cn.searchGroup} ${cn.searchGroup__range}`}>
//             <label className={cn.fieldLabel}>Период</label>
//             <DatePicker dateRange={dateRange} setDateRange={setDateRange} />
//           </li>

//           <li className={cn.searchGroup}>
//             <StyledRadio value="ip">
//               <label className={cn.fieldLabel}>Поиск по IP</label>
//             </StyledRadio>
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
//             <StyledRadio value="ports">
//               <label className={cn.fieldLabel}>Порты</label>
//             </StyledRadio>
//             <div className={cn.portWrapper}>
//               <MultiSelectDataList
//                 service={service}
//                 value={searchValue.portOpened}
//                 onChange={handlePortOpenedChange}
//                 placeholder="Открытые порты"
//                 fetchDataUrl="data"
//                 getDataPrepared={getPortPrepared}
//                 fetchParams={{ q: 'ports' }}
//                 dataListId="portsOpened"
//                 mode="multiple"
//                 style={{ width: '100%', maxWidth: '300px' }}
//               />
//               <MultiSelectDataList
//                 service={service}
//                 value={searchValue.portFiltered}
//                 onChange={handlePortFilteredChange}
//                 placeholder="Фильтрованные порты"
//                 fetchDataUrl="data"
//                 fetchParams={{ q: 'ports' }}
//                 getDataPrepared={getPortPrepared}
//                 dataListId="portsFiltered"
//                 mode="multiple"
//                 style={{ width: '100%', maxWidth: '300px' }}
//               />
//             </div>
//           </li>

//           <li className={cn.searchGroup}>
//             <StyledRadio value="keywords">
//               <label className={cn.fieldLabel}>Ключевые слова</label>
//             </StyledRadio>
//             <MultiSelectDataList
//               service={service}
//               value={searchValue.keyword}
//               onChange={handleKeywordInputChange}
//               placeholder="Введите ключевые слова"
//               fetchDataUrl="data"
//               fetchParams={{ q: 'keywords' }}
//               getDataPrepared={getUniversalPrepared}
//               dataListId="keywords"
//               mode="multiple"
//               style={{ width: '100%', maxWidth: '300px' }}
//             />
//           </li>

//           <li className={cn.searchGroup}>
//             <StyledRadio value="whois">
//               <label className={cn.fieldLabel}>Whois</label>
//             </StyledRadio>
//             <Radio.Group
//               onChange={handleWithWhoisChange}
//               value={searchValue.isWhois ? 1 : 2}
//             >
//               <Radio value={1}>Только с Whois</Radio>
//               <Radio value={2}>Только без Whois</Radio>
//             </Radio.Group>
//           </li>

//           <li className={cn.searchGroup}>
//             <StyledRadio value="priority">
//               <label className={cn.fieldLabel}>Приоритет</label>
//             </StyledRadio>
//             <SingleSelectDataList
//               service={service}
//               value={searchValue.priority}
//               onChange={handlePriorityChange}
//               placeholder="Выберите приоритет"
//               fetchDataUrl="data"
//               fetchParams={{ q: 'priority' }}
//               getDataPrepared={getUniversalPrepared}
//               dataListId="priority"
//               style={{ width: '100%', maxWidth: '300px' }}
//             />
//           </li>

//           <li className={cn.searchGroup}>
//             <StyledRadio value="group">
//               <label className={cn.fieldLabel}>Группа</label>
//             </StyledRadio>
//             <MultiSelectDataList
//               service={service}
//               value={searchValue.group}
//               onChange={handleGroupChange}
//               placeholder="Выберите группу"
//               fetchDataUrl="data"
//               fetchParams={{ q: 'group' }}
//               getDataPrepared={getUniversalPrepared}
//               dataListId="group"
//               mode="multiple"
//               style={{ width: '100%', maxWidth: '300px' }}
//             />
//           </li>

//           <li className={cn.searchGroup}>
//             <StyledRadio value="country">
//               <label className={cn.fieldLabel}>Страна</label>
//             </StyledRadio>
//             <MultiSelectDataList
//               service={service}
//               value={searchValue.country}
//               onChange={handleCountryChange}
//               placeholder="Выберите страну"
//               fetchDataUrl="data"
//               fetchParams={{ q: 'country' }}
//               getDataPrepared={getUniversalPrepared}
//               dataListId="country"
//               mode="multiple"
//               style={{ width: '100%', maxWidth: '300px' }}
//             />
//           </li>
//         </ul>
//       </Radio.Group>

//       <div className={cn.btnGroup}>
//         <Button onClick={handleSearch} className={cn.searchButton}>
//           Найти
//         </Button>
//         <Button onClick={handleGroup} className={cn.groupButton}>
//           Группировать
//         </Button>
//         <Button size="small" className={cn.searchButton}>
//           <DownloadOutlined /> Экспорт данных
//         </Button>
//       </div>
//     </div>
//   )
// }

// export default SearchPanel
