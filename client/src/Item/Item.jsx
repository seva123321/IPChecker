import { Badge, Card, Divider } from 'antd'
import classNames from 'classnames'
import { useItemData } from './hooks/useItemData'
import { ItemHeader } from './components/ItemHeader/ItemHeader'
import { PortsSection } from './components/PortsSection/PortsSection'
import { WhoisSection } from './components/WhoisSection/WhoisSection'
import cn from './Item.module.scss'

export const Item = ({ item }) => {
  const {
    currentItem,
    setCurrentItem,
    isWhoisOpen,
    whois,
    handlePriorityStatusUpdate,
    handleClickWhois,
    formatDate,
  } = useItemData(item)

  const {
    id: hostId,
    ip,
    port_data: portData,
    country,
    updated_at: updatedAt,
    reachable,
    has_whois: hasWhois,
    priority_info: priorityInfo = {},
  } = currentItem

  const { comment, grouping, priority } = priorityInfo
  const openPorts = portData?.open || []
  const filteredPorts = portData?.filtered || []

  const cardPriorityClasses = priority
    ? classNames(cn.ipItem, {
        [cn.usual]: priority.id === 1,
        [cn.interesting]: priority.id === 2,
        [cn.important]: priority.id === 3,
      })
    : cn.ipItem

  // Функция для обработки обновления данных
  const handleItemUpdate = (updatedData) => {
    if (updatedData && updatedData.ip === ip) {
      // Используем setCurrentItem из useItemData
      setCurrentItem(prev => ({
        ...prev,
        ...updatedData,
        // Сохраняем приоритетную информацию, если она не пришла в обновлении
        priority_info: updatedData.priority_info || prev.priority_info,
      }))
    }
  }

  return (
    <Badge.Ribbon
      text={reachable ? '✅ Доступен' : '❌ Недоступен'}
      color={reachable ? 'green' : 'red'}
      placement="start"
      style={{
        top: '-6px',
        fontSize: '12px',
        fontWeight: '500',
      }}
    >
      <Card className={cardPriorityClasses} size="small">
        <ItemHeader
          ip={ip}
          country={country}
          updatedAt={updatedAt}
          priority={priority}
          grouping={grouping}
          hostId={hostId}
          onUpdate={handleItemUpdate} // Передаем функцию обновления
          formatDate={formatDate}
          currentItem={currentItem} // Добавляем текущие данные
        />

        <Divider style={{ margin: '12px 0' }} />

        <PortsSection 
          openPorts={openPorts} 
          filteredPorts={filteredPorts} 
          currentItem={currentItem} // Передаем для обновления
        />

        <WhoisSection
          hasWhois={hasWhois}
          isWhoisOpen={isWhoisOpen}
          whois={whois}
          onToggleWhois={() => handleClickWhois(hostId)}
        />
      </Card>
    </Badge.Ribbon>
  )
}

// import { Badge, Card, Divider } from 'antd'
// import classNames from 'classnames'
// import { useItemData } from './hooks/useItemData'
// import { ItemHeader } from './components/ItemHeader/ItemHeader'
// import { PortsSection } from './components/PortsSection/PortsSection'
// import { WhoisSection } from './components/WhoisSection/WhoisSection'
// import cn from './Item.module.scss'

// // Item.jsx - обновленный компонент
// export const Item = ({ item }) => {
//   const {
//     currentItem,
//     setCurrentItem, // Добавим setCurrentItem из useItemData
//     isWhoisOpen,
//     whois,
//     handlePriorityStatusUpdate,
//     handleClickWhois,
//     formatDate,
//   } = useItemData(item)

//   const {
//     id: hostId,
//     ip,
//     port_data: portData,
//     country,
//     updated_at: updatedAt,
//     reachable,
//     has_whois: hasWhois,
//     priority_info: priorityInfo = {},
//   } = currentItem

//   const { comment, grouping, priority } = priorityInfo
//   const openPorts = portData?.open || []
//   const filteredPorts = portData?.filtered || []

//   const cardPriorityClasses = priority
//     ? classNames(cn.ipItem, {
//         [cn.usual]: priority.id === 1,
//         [cn.interesting]: priority.id === 2,
//         [cn.important]: priority.id === 3,
//       })
//     : cn.ipItem

//   // Функция для обработки обновления данных
//   const handleItemUpdate = (updatedData) => {
//     if (updatedData && updatedData.ip === ip) {
//       // Обновляем текущие данные
//       setCurrentItem(updatedData)
//     }
//   }

//   return (
//     <Badge.Ribbon
//       text={reachable ? '✅ Доступен' : '❌ Недоступен'}
//       color={reachable ? 'green' : 'red'}
//       placement="start"
//       style={{
//         top: '-6px',
//         fontSize: '12px',
//         fontWeight: '500',
//       }}
//     >
//       <Card className={cardPriorityClasses} size="small">
//         <ItemHeader
//           ip={ip}
//           country={country}
//           updatedAt={updatedAt}
//           priority={priority}
//           grouping={grouping}
//           hostId={hostId}
//           onUpdate={handleItemUpdate} // Передаем функцию обновления
//           formatDate={formatDate}
//         />

//         <Divider style={{ margin: '12px 0' }} />

//         <PortsSection openPorts={openPorts} filteredPorts={filteredPorts} />

//         <WhoisSection
//           hasWhois={hasWhois}
//           isWhoisOpen={isWhoisOpen}
//           whois={whois}
//           onToggleWhois={() => handleClickWhois(hostId)}
//         />
//       </Card>
//     </Badge.Ribbon>
//   )
// }
