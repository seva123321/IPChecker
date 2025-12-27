import { Button } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import cn from './WhoisSection.module.scss'
import { WhoisList } from '../WhoisList/WhoisList'

export const WhoisSection = ({
  hasWhois,
  isWhoisOpen,
  whois,
  onToggleWhois,
}) => {
  if (!hasWhois) return null

  return (
    <div className={cn.whoisSection}>
      <Button
        type="dashed"
        onClick={onToggleWhois}
        className={cn.whoisToggle}
        icon={<InfoCircleOutlined />}
      >
        {isWhoisOpen ? 'Скрыть Whois' : 'Показать Whois'}
      </Button>

      {isWhoisOpen && whois && (
        <div className={cn.whoisInfo}>
          <div className={cn.sectionHeader}>
            <span className={cn.sectionTitle}>WHOIS информация</span>
          </div>
          <WhoisList whois={whois} />
        </div>
      )}
    </div>
  )
}
