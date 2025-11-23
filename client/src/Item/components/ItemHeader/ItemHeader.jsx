import { Tag } from 'antd'
import { GlobalOutlined, ClockCircleOutlined } from '@ant-design/icons'
import PriorityStatus from '../../../PriorityStatus/PriorityStatus'
import cn from './ItemHeader.module.scss'

export const ItemHeader = ({
  ip,
  country,
  updatedAt,
  priority,
  grouping,
  hostId,
  onUpdate,
  formatDate,
}) => {
  return (
    <div className={cn.ipHeader}>
      <div className={cn.ipMainInfo}>
        <div className={cn.ipAddressContainer}>
          <GlobalOutlined className={cn.ipIcon} />
          <span className={cn.ipAddress}>{ip}</span>
          {country && (
            <Tag
              className={cn.countryTag}
              color="blue"
              icon={<GlobalOutlined />}
            >
              {country}
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
