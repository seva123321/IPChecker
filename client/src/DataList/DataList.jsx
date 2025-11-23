import { useState, useRef } from 'react'
import { Button } from 'antd'
import cn from './DataList.module.css'
import { Input } from '../Input/Input'
import { PortDataList } from '../PortDataList/PortDataList'

export const DataList = ({
  service,
  value,
  onChange,
  placeholder = 'Поиск',
  fetchDataUrl,
  fetchParams = {},
  getDataPrepared = (value) => value,
  dataListId,
  multiple = false, // Новый проп для множественного выбора
}) => {
  const [dataList, setDataList] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const inputRef = useRef(null)

  const fetchData = async () => {
    if (hasFetched) return
    
    try {
      const response = await service.getData(fetchDataUrl, fetchParams)
      const dataPrepared = getDataPrepared(response)
      console.log(`Data fetched for ${dataListId}:`, dataPrepared)
      setDataList(dataPrepared)
      setHasFetched(true)
    } catch (error) {
      console.error(`Error fetching data from ${fetchDataUrl}:`, error)
    }
  }

  const handleInputChange = (e) => {
    const inputValue = e.target.value
    onChange(inputValue)
  }

  const handleClear = () => {
    onChange('')
  }

  const handleFocus = () => {
    if (!hasFetched) {
      fetchData()
    }
  }

  // Функция для обработки выбора из datalist
  const handleSelect = (e) => {
    if (multiple) {
      const selectedValue = e.target.value
      if (selectedValue && dataList.includes(selectedValue)) {
        // Для множественного выбора добавляем значение через запятую
        const currentValues = value ? value.split(',').map(v => v.trim()).filter(v => v) : []
        
        // Проверяем, нет ли уже этого значения в списке
        if (!currentValues.includes(selectedValue)) {
          const newValues = [...currentValues, selectedValue].join(', ')
          onChange(newValues)
        }
        
        // Очищаем input после выбора
        e.target.value = ''
      }
    }
  }

  const uniqueId = dataListId || `datalist-${Math.random().toString(36).substr(2, 9)}`

  return (
    <div>
      <Input
        ref={inputRef}
        placeholder={multiple ? `${placeholder} (можно выбрать несколько)` : placeholder}
        value={value}
        list={uniqueId}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleSelect} // Обрабатываем выбор при потере фокуса
        onClear={handleClear}
        className={cn.input}
        containerClass={{ width: 300 }}
      />
      <datalist id={uniqueId}>
        {dataList?.map((item) => (
          <option value={item} key={item} />
        ))}
      </datalist>
      <PortDataList
        service={service}
        inputValue={value}
        onKeywordChange={onChange}
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        fetchData={fetchData}
      />
    </div>
  )
}


// import { useState, useRef } from 'react'
// import { Button } from 'antd'
// import cn from './DataList.module.css'
// import { Input } from '../Input/Input'
// import { PortDataList } from '../PortDataList/PortDataList'

// export const DataList = ({
//   service,
//   value,
//   onChange,
//   placeholder = 'Поиск',
//   fetchDataUrl,
//   fetchParams = {},
//   getDataPrepared = (value) => value,
//   dataListId, // Уникальный ID для каждого DataList
// }) => {
//   const [dataList, setDataList] = useState([])
//   const [isModalOpen, setIsModalOpen] = useState(false)
//   const [hasFetched, setHasFetched] = useState(false) // Флаг, что данные уже загружены
//   const inputRef = useRef(null)

//   const fetchData = async () => {
//     // Если данные уже загружены, не делаем повторный запрос
//     if (hasFetched) return
    
//     try {
//       const response = await service.getData(fetchDataUrl, fetchParams)
//       const dataPrepared = getDataPrepared(response)
//       console.log(`Data fetched for ${dataListId}:`, dataPrepared)
//       setDataList(dataPrepared)
//       setHasFetched(true) // Помечаем, что данные загружены
//     } catch (error) {
//       console.error(`Error fetching data from ${fetchDataUrl}:`, error)
//     }
//   }

//   const handleInputChange = (e) => {
//     const inputValue = e.target.value
//     onChange(inputValue)
//   }

//   const handleClear = () => {
//     onChange('')
//   }

//   const handleFocus = () => {
//     // Загружаем данные только при первом фокусе
//     if (!hasFetched) {
//       fetchData()
//     }
//   }

//   // Генерируем уникальный ID для datalist
//   const uniqueId = dataListId || `datalist-${Math.random().toString(36).substr(2, 9)}`

//   return (
//     <div>
//       <Input
//         ref={inputRef}
//         placeholder={placeholder}
//         value={value}
//         list={uniqueId}
//         onChange={handleInputChange}
//         onFocus={handleFocus}
//         onClear={handleClear}
//         className={cn.input}
//         containerClass={{ width: 300 }}
//       />
//       <datalist id={uniqueId}>
//         {dataList?.map((item) => (
//           <option value={item} key={item} />
//         ))}
//       </datalist>
//       <PortDataList
//         service={service}
//         inputValue={value}
//         onKeywordChange={onChange}
//         isModalOpen={isModalOpen}
//         setIsModalOpen={setIsModalOpen}
//         fetchData={fetchData}
//       />
//     </div>
//   )
// }

//УНИВЕРСАЛЬНЫЙ
// // DataList.jsx
// import { useState, useEffect, useRef } from 'react'
// import { Button } from 'antd'
// import cn from './DataList.module.css'
// import { Input } from '../Input/Input'
// import { PortDataList } from '../PortDataList/PortDataList'

// export const DataList = ({
//   service,
//   value, // controlled: получаем значение из родителя
//   onChange, // controlled: вызываем при любом изменении
//   placeholder = 'Поиск',
//   fetchDataUrl, // URL для запроса данных
//   fetchParams = {}, // Параметры для запроса (если необходимо)
//   getDataPrepared = (value) => value,
// }) => {
//   const [dataList, setDataList] = useState([])
//   const [filteredDataList, setFilteredDataList] = useState([])
//   const [showSendButton, setShowSendButton] = useState(false)
//   const [isModalOpen, setIsModalOpen] = useState(false)
//   const inputRef = useRef(null)

//   const fetchData = async () => {
//     if (dataList.length > 0) return

//     try {
//       const response = await service.getData(fetchDataUrl, fetchParams)
//       const dataPrepared = getDataPrepared(response)

//       setDataList(dataPrepared)
//       setFilteredDataList(dataPrepared)
//     } catch (error) {
//       console.error(`Error fetching data from ${fetchDataUrl}:`, error)
//     }
//   }

//   const handleInputFocus = () => {
//     fetchData()
//   }

//   const handleInputChange = (e) => {
//     const inputValue = e.target.value
//     onChange(inputValue)

//     if (inputValue.trim() === '') {
//       setFilteredDataList(dataList)
//       setShowSendButton(false)
//     } else {
//       const filtered = dataList.filter((item) =>
//         item.toLowerCase().includes(inputValue.toLowerCase())
//       )
//       setFilteredDataList(filtered)

//       // Показываем кнопку "Отправить", только если:
//       // - введено число (номер порта)
//       // - такого порта нет в списке (даже без имени)
//       const isNumber = /^\d+$/.test(inputValue.trim())
//       const itemExists = dataList.some((item) =>
//         item.startsWith(inputValue.trim() + ' ')
//       )
//       setShowSendButton(isNumber && !itemExists)
//     }
//   }

//   const handleClear = () => {
//     onChange('')
//     setShowSendButton(false)
//     setFilteredDataList(dataList)
//   }

//   // Обновляем фильтр при изменении value извне (например, после clearAll)
//   useEffect(() => {
//     if (value.trim() === '') {
//       setFilteredDataList(dataList)
//       setShowSendButton(false)
//     } else {
//       const filtered = dataList.filter((item) =>
//         item.toLowerCase().includes(value.toLowerCase())
//       )
//       setFilteredDataList(filtered)

//       const isNumber = /^\d+$/.test(value.trim())
//       const itemExists = dataList.some((item) =>
//         item.startsWith(value.trim() + ' ')
//       )
//       setShowSendButton(isNumber && !itemExists)
//     }
//   }, [value, dataList])

//   return (
//     <div>
//       <Input
//         ref={inputRef}
//         list="dataName"
//         placeholder={placeholder}
//         value={value}
//         onChange={handleInputChange}
//         onFocus={handleInputFocus}
//         suffix={
//           showSendButton && (
//             <Button
//               type="link"
//               onClick={() => setIsModalOpen(true)}
//               className={cn.sendButton}
//             >
//               Отправить
//             </Button>
//           )
//         }
//         onClear={handleClear}
//         className={cn.input}
//         containerClass={{ width: 300 }}
//       />
//       <datalist id="dataName">
//         {filteredDataList?.map((item) => (
//           <option value={item} key={item} />
//         ))}
//       </datalist>
//       <PortDataList
//         service={service}
//         inputValue={value}
//         onKeywordChange={onChange}
//         isModalOpen={isModalOpen}
//         setIsModalOpen={setIsModalOpen}
//         fetchData={fetchData}
//       />
//     </div>
//   )
// }

/************************ */

// // DataList.jsx
// import { useState, useEffect } from 'react'
// import { Button } from 'antd'
// import cn from './DataList.module.css'
// import { Input } from '../Input/Input'
// import { PortDataList } from '../PortDataList/PortDataList'

// export const DataList = ({
//   value, // controlled: получаем значение из родителя
//   onChange, // controlled: вызываем при любом изменении
//   placeholder = 'Поиск',
//   dataList, // переданные данные для отображения
// }) => {
//   const [filteredDataList, setFilteredDataList] = useState([])
//   const [showSendButton, setShowSendButton] = useState(false)
//   const [isModalOpen, setIsModalOpen] = useState(false)

//   useEffect(() => {
//     if (dataList) {
//       setFilteredDataList(dataList)
//     }
//   }, [dataList])

//   const handleInputChange = (e) => {
//     const inputValue = e.target.value
//     onChange(inputValue) // передаём любое значение родителю

//     // Фильтрация списка
//     if (inputValue.trim() === '') {
//       setFilteredDataList(dataList)
//       setShowSendButton(false)
//     } else {
//       const filtered = dataList.filter((item) =>
//         item.toLowerCase().includes(inputValue.toLowerCase())
//       )
//       setFilteredDataList(filtered)

//       // Показываем кнопку "Отправить", только если:
//       // - введено число
//       // - такого числа нет в списке
//       const isNumber = /^\d+$/.test(inputValue.trim())
//       const itemExists = dataList.some((item) =>
//         item.startsWith(inputValue.trim() + ' ')
//       )
//       setShowSendButton(isNumber && !itemExists)
//     }
//   }

//   const handleClear = () => {
//     onChange('')
//     setShowSendButton(false)
//     setFilteredDataList(dataList)
//   }

//   return (
//     <div>
//       <Input
//         list="dataName"
//         placeholder={placeholder}
//         value={value}
//         onChange={handleInputChange}
//         onClear={handleClear}
//         className={cn.input}
//         containerClass={{ width: 300 }}
//       />
//       <datalist id="dataName">
//         {filteredDataList.map((item) => (
//           <option value={item} key={item} />
//         ))}
//       </datalist>
//       <PortDataList
//         inputValue={value}
//         onKeywordChange={onChange}
//         isModalOpen={isModalOpen}
//         setIsModalOpen={setIsModalOpen}
//       />
//     </div>
//   )
// }

/************************ */
// // DataList.jsx РАБОЧИЙ
// import { useState, useEffect, useRef } from 'react'
// import { Button } from 'antd'
// import cn from './DataList.module.css'
// import { Input } from '../Input/Input'
// import { PortDataList } from '../PortDataList/PortDataList'

// export const DataList = ({
//   service,
//   value, // controlled: получаем значение из родителя
//   onChange, // controlled: вызываем при любом изменении
//   placeholder = 'Поиск',
// }) => {
//   const [dataList, setDataList] = useState([])
//   const [filteredDataList, setFilteredDataList] = useState([])
//   const [showSendButton, setShowSendButton] = useState(false)
//   const [isModalOpen, setIsModalOpen] = useState(false)
//   const inputRef = useRef(null)

//   // Загружаем данные один раз при первом фокусе или монтировании
//   const fetchData = async () => {
//     if (dataList.length > 0) return // уже загружено
//     try {
//       const response = await service.getData('ports/data')
//       const dataPrepared =
//         response?.port_data?.map((el) => `${el.port} (${el.name})`) || []

//       setDataList(dataPrepared)
//       setFilteredDataList(dataPrepared)
//     } catch (error) {
//       console.error('Error fetching port data:', error)
//     }
//   }

//   const handleInputFocus = () => {
//     fetchData()
//   }

//   const handleInputChange = (e) => {
//     const inputValue = e.target.value
//     onChange(inputValue) // передаём любое значение родителю

//     // Фильтрация списка
//     if (inputValue.trim() === '') {
//       setFilteredDataList(dataList)
//       setShowSendButton(false)
//     } else {
//       const filtered = dataList.filter((item) =>
//         item.toLowerCase().includes(inputValue.toLowerCase())
//       )
//       setFilteredDataList(filtered)

//       // Показываем кнопку "Отправить", только если:
//       // - введено число (номер порта)
//       // - такого порта нет в списке (даже без имени)
//       const isPortNumber = /^\d+$/.test(inputValue.trim())
//       const portExists = dataList.some((item) =>
//         item.startsWith(inputValue.trim() + ' ')
//       )
//       setShowSendButton(isPortNumber && !portExists)
//     }
//   }

//   const handleClear = () => {
//     onChange('')
//     setShowSendButton(false)
//     setFilteredDataList(dataList)
//   }

//   // Обновляем фильтр при изменении value извне (например, после clearAll)
//   useEffect(() => {
//     if (value.trim() === '') {
//       setFilteredDataList(dataList)
//       setShowSendButton(false)
//     } else {
//       const filtered = dataList.filter((item) =>
//         item.toLowerCase().includes(value.toLowerCase())
//       )
//       setFilteredDataList(filtered)

//       const isPortNumber = /^\d+$/.test(value.trim())
//       const portExists = dataList.some((item) =>
//         item.startsWith(value.trim() + ' ')
//       )
//       setShowSendButton(isPortNumber && !portExists)
//     }
//   }, [value, dataList])

//   return (
//     <div>
//       <Input
//         ref={inputRef}
//         list="portsName"
//         placeholder={placeholder}
//         value={value}
//         onChange={handleInputChange}
//         onFocus={handleInputFocus}
//         suffix={
//           showSendButton && (
//             <Button
//               type="link"
//               onClick={() => setIsModalOpen(true)}
//               className={cn.sendButton}
//             >
//               Отправить
//             </Button>
//           )
//         }
//         onClear={handleClear}
//         className={cn.input}
//         containerClass={{ width: 300 }}
//       />
//       <datalist id="portsName">
//         {filteredDataList.map((item) => (
//           <option value={item} key={item} />
//         ))}
//       </datalist>

//       <PortDataList
//         service={service}
//         inputValue={value}
//         onKeywordChange={onChange}
//         isModalOpen={isModalOpen}
//         setIsModalOpen={setIsModalOpen}
//         fetchData={fetchData}
//       />
//     </div>
//   )
// }
