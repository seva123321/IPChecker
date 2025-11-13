// DataList.jsx
import { useState, useEffect, useRef } from 'react'
import { Button } from 'antd'
import cn from './DataList.module.css'
import { Input } from '../Input/Input'
import { PortDataList } from '../PortDataList/PortDataList'

export const DataList = ({
  service,
  value, // controlled: получаем значение из родителя
  onChange, // controlled: вызываем при любом изменении
  placeholder = 'Поиск по портам (например, 443 или 443 (https))',
}) => {
  const [dataList, setDataList] = useState([])
  const [filteredDataList, setFilteredDataList] = useState([])
  const [showSendButton, setShowSendButton] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const inputRef = useRef(null)

  // Загружаем данные один раз при первом фокусе или монтировании
  const fetchData = async () => {
    if (dataList.length > 0) return // уже загружено
    try {
      const response = await service.getData('ports/data')
      const dataPrepared =
        response?.port_data?.map((el) => `${el.port} (${el.name})`) || []

      setDataList(dataPrepared)
      setFilteredDataList(dataPrepared)
    } catch (error) {
      console.error('Error fetching port data:', error)
    }
  }

  const handleInputFocus = () => {
    fetchData()
  }

  const handleInputChange = (e) => {
    const inputValue = e.target.value
    onChange(inputValue) // передаём любое значение родителю

    // Фильтрация списка
    if (inputValue.trim() === '') {
      setFilteredDataList(dataList)
      setShowSendButton(false)
    } else {
      const filtered = dataList.filter((item) =>
        item.toLowerCase().includes(inputValue.toLowerCase())
      )
      setFilteredDataList(filtered)

      // Показываем кнопку "Отправить", только если:
      // - введено число (номер порта)
      // - такого порта нет в списке (даже без имени)
      const isPortNumber = /^\d+$/.test(inputValue.trim())
      const portExists = dataList.some((item) =>
        item.startsWith(inputValue.trim() + ' ')
      )
      setShowSendButton(isPortNumber && !portExists)
    }
  }

  const handleClear = () => {
    onChange('')
    setShowSendButton(false)
    setFilteredDataList(dataList)
  }

  // Обновляем фильтр при изменении value извне (например, после clearAll)
  useEffect(() => {
    if (value.trim() === '') {
      setFilteredDataList(dataList)
      setShowSendButton(false)
    } else {
      const filtered = dataList.filter((item) =>
        item.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredDataList(filtered)

      const isPortNumber = /^\d+$/.test(value.trim())
      const portExists = dataList.some((item) =>
        item.startsWith(value.trim() + ' ')
      )
      setShowSendButton(isPortNumber && !portExists)
    }
  }, [value, dataList])

  return (
    <div>
      <Input
        ref={inputRef}
        list="portsName"
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        suffix={
          showSendButton && (
            <Button
              type="link"
              onClick={() => setIsModalOpen(true)}
              className={cn.sendButton}
            >
              Отправить
            </Button>
          )
        }
        onClear={handleClear}
        className={cn.input}
        containerClass={{ width: 300 }}
      />
      <datalist id="portsName">
        {filteredDataList.map((item) => (
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
