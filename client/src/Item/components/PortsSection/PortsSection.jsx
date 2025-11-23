import { Row, Col, Tag } from 'antd'
import { DatabaseOutlined } from '@ant-design/icons'
import { renderPortsData } from '../../../utils/function'
import cn from './PortsSection.module.scss'

export const PortsSection = ({ openPorts, filteredPorts }) => {
  return (
    <div className={cn.portsSection}>
      <div className={cn.sectionHeader}>
        <DatabaseOutlined />
        <span className={cn.sectionTitle}>Порты</span>
      </div>

      <Row gutter={[8, 8]} className={cn.portsGrid}>
        <Col span={24}>
          <div className={cn.portItem}>
            <Tag color="green" className={cn.portTag}>
              Открытые
            </Tag>
            <span className={cn.portList}>
              {openPorts.length > 0
                ? renderPortsData(openPorts)
                : 'Нет открытых портов'}
            </span>
          </div>
        </Col>
        <Col span={24}>
          <div className={cn.portItem}>
            <Tag color="orange" className={cn.portTag}>
              Фильтрованные
            </Tag>
            <span className={cn.portList}>
              {filteredPorts.length > 0
                ? renderPortsData(filteredPorts)
                : 'Нет фильтрованных портов'}
            </span>
          </div>
        </Col>
      </Row>
    </div>
  )
}
