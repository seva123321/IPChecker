import React from 'react'
import { Button } from 'antd'
import cn from './SendButton.module.css'

export const SendButton = ({onClick}) => {
//   const handleSendClick = async () => {
//     try {
//       await service.postData('ports', inputValue.trim())
//       fetchData() // Обновляем список после успешной отправки
//       setInputValue('')
//       setShowSendButton(false)
//       setErrorMessage('')
//     } catch (error) {
//       console.error('Error sending data:', error)
//     }
//   }

  return (
    <Button type="link" onClick={onClick} className={cn.button}>
      Отправить
    </Button>
  )
}
