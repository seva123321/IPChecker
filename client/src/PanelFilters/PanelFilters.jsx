import React, { useState } from 'react'
import { Input } from '../Input/Input'
import { Button } from '../Button/Button'
import cn from './PanelFilters.module.scss'
import { DataList } from '../DataList/DataList'

export function PanelFilters({ onSearch, onGroup, service }) {
  const [searchText, setSearchText] = useState({
    ip: '',
    port: '',
    keyword: '',
  })
  const hasAnyValue = Object.values(searchText).some((el) => el.trim() !== '')

  const updateField = (field, value) => {
    setSearchText((prev) => ({ ...prev, [field]: value }))
  }

  const clearField = (field) => {
    updateField(field, '')
  }

  const handleClearAll = () => {
    setSearchText({
      ip: '',
      port: '',
      keyword: '',
    })
    // onGroup('ip/group')
    onSearch('ip')
  }

  const handlePortChange = (value) => {
    updateField('port', value)
  }

  const handleKeywordInputChange = (e) => {
    updateField('keyword', e.target.value)
  }

  return (
    <div className={cn.panel}>
      <h2>Введите значение</h2>
      <ul className={cn.list}>
        <li className={cn.searchGroup}>
          <Input
            value={searchText.ip}
            placeholder="Поиск по IP"
            containerClass={{ width: 300 }}
            onChange={(e) => updateField('ip', e.target.value)}
            showClear
            onClear={() => clearField('ip')}
          />
          <Button
            onClick={() => onSearch('ip', { ip: searchText.ip })}
            className={cn.searchButton}
            disabled={!searchText.ip.trim()}
          >
            Найти
          </Button>
          <Button
            onClick={() => onGroup('ip/group')}
            className={cn.groupButton}
          >
            Группировать
          </Button>
        </li>
        <li className={cn.searchGroup}>
          <DataList
            service={service}
            value={searchText.port}
            onChange={handlePortChange}
            placeholder="Поиск по портам (например, 443 или 443 (https))"
          />
          <Button
            onClick={() => onSearch('ports', { port: searchText.port })}
            className={cn.searchButton}
            disabled={!searchText.port.trim()}
          >
            Найти
          </Button>
          <Button
            onClick={() => onGroup('ports/group')}
            className={cn.groupButton}
          >
            Группировать
          </Button>
        </li>
        <li className={cn.searchGroup}>
          <Input
            value={searchText.keyword}
            placeholder="Поиск по ключевым словам"
            containerClass={{ width: 300 }}
            onChange={handleKeywordInputChange}
            showClear
            onClear={() => clearField('keyword')}
          />
          <Button
            onClick={() =>
              onSearch('keywords', { keyword: searchText.keyword })
            }
            className={cn.searchButton}
            disabled={!searchText.keyword.trim()}
          >
            Найти
          </Button>
          <Button
            onClick={() => onGroup('keywords/group')}
            className={cn.groupButton}
          >
            Группировать
          </Button>
        </li>
        <li className={cn.actionsGroup}>
          <Button
            onClick={handleClearAll}
            className={cn.clearAllButton}
            disabled={!hasAnyValue}
          >
            Очистить все поля
          </Button>
        </li>
      </ul>
    </div>
  )
}
