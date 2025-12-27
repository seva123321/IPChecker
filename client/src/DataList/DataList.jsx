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
