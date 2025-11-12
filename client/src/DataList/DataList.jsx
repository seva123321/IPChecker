import { useState, useEffect } from 'react'
import { Button } from 'antd'
import cn from './DataList.module.css'
import { Input } from '../Input/Input'
import { PortDataList } from '../PortDataList/PortDataList'

export const DataList = ({
  service,
  onKeywordChange,
  keywordValue,
  placeholder = 'Поиск по портам Пример, 443 (https)',
}) => {
  const [inputValue, setInputValue] = useState('')
  const [dataList, setDataList] = useState([])
  const [filteredDataList, setFilteredDataList] = useState([])
  const [showSendButton, setShowSendButton] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchData = async () => {
    try {
      const response = await service.getData('ports/data')
      const dataPrepared = response.data?.port_data.map(
        (el) => `${el.port} (${el.name})`
      )
      setDataList(dataPrepared)
      setFilteredDataList(dataPrepared)
    } catch (error) {
      console.error('Error fetching ', error)
    }
  }

  const handleInputFocus = () => {
    if (!dataList.length) fetchData()
  }

  const handleInputChange = (e) => {
    let value = e.target.value
    // Проверяем формат ввода: число + пробел + название порта в скобках
    if (/^\d+\s+\([a-zA-Z]+\)$/.test(value)) {
      setInputValue(value)
      setErrorMessage('')
      // Вызываем обратный вызов для обновления состояния в родительском компоненте
      if (onKeywordChange) {
        onKeywordChange(value)
      }
    } else {
      // Если не соответствует формату, отображаем сообщение об ошибке
      setInputValue(value)
      setErrorMessage('Введите значение в формате "443 (https)"')
    }
    if (value.trim() === '') {
      setShowSendButton(false)
      setErrorMessage('')
      // Сбрасываем фильтрацию и показываем весь список
      setFilteredDataList(dataList)
      // Вызываем обратный вызов для обновления состояния в родительском компоненте
      if (onKeywordChange) {
        onKeywordChange('')
      }
    } else {
      const filteredData = dataList.filter((item) =>
        item.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredDataList(filteredData)
      setShowSendButton(
        !filteredData.some((item) => item.toLowerCase() === value.toLowerCase())
      )
    }
  }

  const handleClear = () => {
    setInputValue('')
    setShowSendButton(false)
    setErrorMessage('')
    // Сбрасываем фильтрацию и показываем весь список
    setFilteredDataList(dataList)
    // Вызываем обратный вызов для обновления состояния в родительском компоненте
    if (onKeywordChange) {
      onKeywordChange('')
    }
  }

  // Обновляем inputValue при изменении keywordValue из родителя
  useEffect(() => {
    setInputValue(keywordValue)
    // При изменении keywordValue, если список данных загружен, обновляем фильтр
    if (dataList.length > 0) {
      setFilteredDataList(dataList)
    }
  }, [keywordValue, dataList])

  return (
    <div>
      <Input
        list="portsName"
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        suffix={
          showSendButton &&
          !errorMessage && (
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
        errorMessage={errorMessage}
        className={cn.input}
        containerClass={{ width: 300 }}
      />
      <datalist id="portsName">
        {filteredDataList?.map((item) => (
          <option value={item} key={item} />
        ))}
      </datalist>

      <PortDataList
        service={service}
        inputValue={inputValue}
        onKeywordChange={onKeywordChange}
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        fetchData={fetchData}
      />
    </div>
  )
}