import { useState } from 'react'
import classNames from 'classnames'
import cn from './Item.module.scss'
import PriorityStatus from '../PriorityStatus/PriorityStatus'
import { renderPortsData } from '../utils/function'
import { Badge, Button, Card, Tag, Row, Col, Divider } from 'antd'
import { ApiService } from '../ApiService'
import { List } from '../List'
import {
  GlobalOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'

export const Item = ({ item }) => {
  const [isWhoisOpen, setIsWhoisOpen] = useState(false)
  const [whois, setWhois] = useState(null)
  const [whoisLoaded, setWhoisLoaded] = useState(false)
  const [currentItem, setCurrentItem] = useState(item)

  const handlePriorityStatusUpdate = (updatedData) => {
    setCurrentItem((prev) => ({
      ...prev,
      priority_info: {
        ...prev.priority_info,
        priority: updatedData.priority,
        grouping: updatedData.grouping,
        comment: updatedData.comment,
      },
    }))
  }

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

  const handleClickWhois = async () => {
    if (whoisLoaded) {
      setIsWhoisOpen(!isWhoisOpen)
      return
    }

    if (hostId && !whoisLoaded) {
      try {
        const response = await ApiService.getData('keywords/search', {
          id: hostId,
        })
        setWhois(response.whois)
        setWhoisLoaded(true)
        setIsWhoisOpen(true)
      } catch (error) {
        setWhois({ error: 'Ошибка получения whois' })
        setWhoisLoaded(true)
        setIsWhoisOpen(true)
      }
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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
      <Card
        className={cardPriorityClasses}
        size="small"
        bodyStyle={{ padding: '16px' }}
      >
        {/* Заголовок IP и страны */}
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

          {/* Статусы */}
          <div className={cn.statusWrapper}>
            <PriorityStatus
              priority={currentItem.priority_info?.priority}
              grouping={currentItem.priority_info?.grouping}
              hostId={currentItem.id}
              onUpdate={handlePriorityStatusUpdate}
            />
          </div>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* Порты */}
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

        {/* Комментарий (если есть)
        {comment && (
          <div className={cn.commentSection}>
            <div className={cn.sectionHeader}>
              <InfoCircleOutlined />
              <span className={cn.sectionTitle}>Комментарий</span>
            </div>
            <div className={cn.commentText}>{comment}</div>
          </div>
        )} */}

        {/* Whois */}
        {hasWhois && (
          <div className={cn.whoisSection}>
            <Button
              type="dashed"
              onClick={handleClickWhois}
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
                <List
                  items={Object.entries(whois)}
                  render={([key, value]) => (
                    <li key={key} className={cn.whoisItem}>
                      <span className={cn.whoisKey}>{key}:</span>
                      <span className={cn.whoisValue}>{String(value)}</span>
                    </li>
                  )}
                />
              </div>
            )}
          </div>
        )}
      </Card>
    </Badge.Ribbon>
  )
}
