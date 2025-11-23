import { List } from '../../../List'
import cn from './WhoisList.module.scss'

export const WhoisList = ({ whois }) => {
  return (
    <List
      items={Object.entries(whois)}
      render={([key, value]) => (
        <li key={key} className={cn.whoisItem}>
          <span className={cn.whoisKey}>{key}:</span>
          <span className={cn.whoisValue}>{String(value)}</span>
        </li>
      )}
    />
  )
}
