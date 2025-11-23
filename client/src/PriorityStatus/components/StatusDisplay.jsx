import classNames from 'classnames'
import { Tooltip } from 'antd'
import { getPriorityDisplayName } from '../../utils/function'
import cn from '../PriorityStatus.module.scss'

export const StatusDisplay = ({ priority, grouping, onOpenModal }) => (
  <div className={cn.statusWrapper} onClick={onOpenModal}>
    {grouping?.name && (
      <Tooltip title="Сменить принадлежность">
        <span className={cn.statusReachable}>{grouping.name}</span>
      </Tooltip>
    )}
    {priority?.id && (
      <Tooltip title="Сменить статус">
        <span
          className={classNames(cn.statusPriority, {
            [cn.usual]: priority.id === 1,
            [cn.interesting]: priority.id === 2,
            [cn.important]: priority.id === 3,
          })}
        >
          {getPriorityDisplayName(priority.id?.toString())}
        </span>
      </Tooltip>
    )}
  </div>
)
