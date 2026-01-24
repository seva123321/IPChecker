import { Button, Tag, Tooltip, message } from 'antd'
import { GlobalOutlined, ClockCircleOutlined } from '@ant-design/icons'
import PriorityStatus from '../../../PriorityStatus/PriorityStatus'
import cn from './ItemHeader.module.scss'
import { UndoOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { checkInternetConnection } from '../../../utils/function'
import { ApiService } from '../../../ApiService'

// ItemHeader.jsx - обновленный handleUpdateClick
export const ItemHeader = (data) => {
  const [dataUpdated, setDataUpdated] = useState(null)
  const [isOnline, setIsOnline] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  const {
    ip,
    country,
    updatedAt,
    priority,
    grouping,
    hostId,
    onUpdate,
    formatDate,
  } = dataUpdated ?? data

  const handleUpdateClick = async () => {
    if (isUpdating) return
    
    setIsUpdating(true)
    
    try {
      const isOnline = await checkInternetConnection()
      setIsOnline(isOnline)

      if (isOnline) {
        // Отправляем запрос на обновление
        const response = await ApiService.getData('/data/ip-updated', { ip: ip })
        
        if (response.success && response.data) {
          // Обновляем локальные данные
          setDataUpdated(response.data)
          
          // Уведомляем родительский компонент об обновлении
          if (data.onUpdate && typeof data.onUpdate === 'function') {
            data.onUpdate(response.data)
          }
          
          message.success(`Данные для ${ip} обновлены!`)
        } else {
          message.error(response.error || 'Ошибка при обновлении данных')
        }
      } else {
        message.error('Для обновления требуется подключение к интернету!')
        setTimeout(() => setIsOnline(true), 2000)
      }
    } catch (error) {
      console.error('Ошибка при обновлении IP:', error)
      message.error('Произошла ошибка при обновлении данных')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className={cn.ipHeader}>
      <div className={cn.ipMainInfo}>
        <div className={cn.ipAddressContainer}>
          <Tooltip title={isUpdating ? "Обновление..." : "Обновить данные"}>
            <Button
              onClick={handleUpdateClick}
              loading={isUpdating}
              disabled={isUpdating}
              icon={
                !isUpdating && (
                  isOnline ? (
                    <UndoOutlined className={cn.ipIcon} />
                  ) : (
                    <CloseCircleOutlined className={cn.failedIcon} />
                  )
                )
              }
            />
          </Tooltip>

          <span className={cn.ipAddress}>{ip}</span>
          {country && (
            <Tag
              className={cn.countryTag}
              color="blue"
              icon={<GlobalOutlined />}
            >
              {country.name || country}
            </Tag>
          )}
        </div>
        {updatedAt && (
          <div className={cn.updateTime}>
            <ClockCircleOutlined />
            <span>Обновлено: {formatDate(updatedAt)}</span>
          </div>
        )}
      </div>

      <div className={cn.statusWrapper}>
        <PriorityStatus
          priority={priority}
          grouping={grouping}
          hostId={hostId}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  )
}
// import { Button, Tag, Tooltip, message } from 'antd'
// import { GlobalOutlined, ClockCircleOutlined } from '@ant-design/icons'
// import PriorityStatus from '../../../PriorityStatus/PriorityStatus'
// import cn from './ItemHeader.module.scss'
// import { UndoOutlined, CloseCircleOutlined } from '@ant-design/icons'
// import { useState } from 'react'
// import { checkInternetConnection } from '../../../utils/function'
// import { ApiService } from '../../../ApiService'

// export const ItemHeader = (data) => {
//   const [dataUpdated, setDataUpdated] = useState(null)
//   const [isOnline, setIsOnline] = useState(true)

//   const {
//     ip,
//     country,
//     updatedAt,
//     priority,
//     grouping,
//     hostId,
//     onUpdate,
//     formatDate,
//   } = dataUpdated ?? data

//   const handleUpdateClick = async () => {
//     const isOnline = await checkInternetConnection()
//     setIsOnline(isOnline)

//     if (isOnline) {
//       const response = await ApiService.getData('/data/ip-updated', { ip: ip })
//       console.log('response > ', response)
//       setDataUpdated(response)
//     } else {
//       message.error('Для обновления требуется подключение к интернету!')
//       setTimeout(() => setIsOnline(true), 2000)
//     }
//   }

//   return (
//     <div className={cn.ipHeader}>
//       <div className={cn.ipMainInfo}>
//         <div className={cn.ipAddressContainer}>
//           <Tooltip title="Обновить данные">
//             <Button
//               onClick={handleUpdateClick}
//               icon={
//                 isOnline ? (
//                   <UndoOutlined className={cn.ipIcon} />
//                 ) : (
//                   <CloseCircleOutlined className={cn.failedIcon} />
//                 )
//               }
//             />
//           </Tooltip>

//           <span className={cn.ipAddress}>{ip}</span>
//           {country && (
//             <Tag
//               className={cn.countryTag}
//               color="blue"
//               icon={<GlobalOutlined />}
//             >
//               {country}
//             </Tag>
//           )}
//         </div>
//         {updatedAt && (
//           <div className={cn.updateTime}>
//             <ClockCircleOutlined />
//             <span>Обновлено: {formatDate(updatedAt)}</span>
//           </div>
//         )}
//       </div>

//       <div className={cn.statusWrapper}>
//         <PriorityStatus
//           priority={priority}
//           grouping={grouping}
//           hostId={hostId}
//           onUpdate={onUpdate}
//         />
//       </div>
//     </div>
//   )
// }
