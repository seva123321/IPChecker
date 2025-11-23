import { Badge, Card, Divider } from 'antd'
import classNames from 'classnames'
import { useItemData } from './hooks/useItemData'
import { ItemHeader } from './components/ItemHeader/ItemHeader'
import { PortsSection } from './components/PortsSection/PortsSection'
import { WhoisSection } from './components/WhoisSection/WhoisSection'
// import { CommentSection } from './components/CommentSection/CommentSection'
import cn from './Item.module.scss'

export const Item = ({ item }) => {
  const {
    currentItem,
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
          onUpdate={handlePriorityStatusUpdate}
          formatDate={formatDate}
        />

        <Divider style={{ margin: '12px 0' }} />

        <PortsSection openPorts={openPorts} filteredPorts={filteredPorts} />

        {/* <CommentSection comment={comment} /> */}

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
