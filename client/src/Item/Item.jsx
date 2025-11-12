import React, { useState } from 'react'

import cn from './Item.module.scss'

const renderPortsData = (data) => {
  return data
    .sort((a, b) => a.port - b.port)
    .map((item) => `${item.port} (${item.name})`)
    .join(', ')
}

export function Item({ item }) {
  const {
    ip,
    port_data: portData,
    whois,
    country,
    updated_at: updatedAt,
    reachable,
    has_whois: hasWhois,
  } = item

  const [isWhoisOpen, setIsWhoisOpen] = useState(false)

  // Определяем, есть ли валидные Whois-данные (не ошибка)
  const isValidWhois = whois
  !whois.error && typeof whois === 'object' && Object.keys(whois).length > 0

  const whoisCount = isValidWhois ? Object.keys(whois).length : 0

  const openPorts = portData?.open || []
  const filteredPorts = portData?.filtered || []

  return (
    <div className={`${cn.ipItem}${isValidWhois ? ` ${cn.highlighted}` : ''}`}>
      {/* Заголовок IP */}
      <div className={cn.ipHeader}>
        <div className={cn.ipAddressContainer}>
          <div>
            <span className={cn.ipAddress}>{ip}</span>
            &nbsp;{country ?? whois?.country ?? whois?.Country}
          </div>
        </div>
      </div>
      <div className={cn.statusWrapper}>
        <span className={reachable ? cn.statusReachable : cn.statusUnreachable}>
          {reachable ? 'Доступен' : 'Недоступен'}
        </span>
        {isValidWhois && whoisCount > 1 && (
          <span
            className={cn.statusReachable}
            title={`Есть данные (${whoisCount} строк)`}
          >
            Есть данные whois
          </span>
        )}
      </div>

      {/* Порты */}
      <div className={cn.portsSection}>
        <div className={cn.portsTitle}>Порты:</div>
        <div className={cn.portsList}>
          <strong>Открытые порты:</strong>&nbsp;
          {openPorts.length > 0 ? renderPortsData(openPorts) : 'Нет'}
        </div>
        <div className={cn.portsList}>
          <strong>Фильтрованные порты:</strong>&nbsp;
          {filteredPorts.length > 0 ? renderPortsData(filteredPorts) : 'Нет'}
        </div>
      </div>

      {/* Время обновления */}
      {updatedAt && (
        <div className={cn.updateTime}>Обновлено:&nbsp;{updatedAt}</div>
      )}
      
      {/* Whois */}
      {isValidWhois && whoisCount >= 1 && (
        <>
          <button
            className={cn.whoisToggle}
            onClick={() => setIsWhoisOpen(!isWhoisOpen)}
          >
            {isWhoisOpen ? 'Скрыть Whois' : 'Показать Whois'}
          </button>
          {isWhoisOpen && (
            <div className={cn.whoisInfo}>
              <ul>
                {Object.entries(whois).map(([key, value]) => (
                  <li key={key}>
                    <span className={cn.whoisKey}>{key}:</span> {String(value)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Если whois есть, но с ошибкой — можно показать уведомление (опционально) */}
      {!isValidWhois && hasWhois && whois?.error && (
        <div className={cn.whoisError}>
          Whois недоступен:
          {whois.error}
        </div>
      )}
    </div>
  )
}
// import React, { useState } from 'react'

// import cn from './Item.module.scss'

// const renderPortsData = (data) => {
//   return data
//     .sort((a, b) => a.port - b.port)
//     .map((item) => `${item.port} (${item.name})`)
//     .join(', ')
// }

// export function Item({ item }) {
//   const {
//     ip,
//     port_data: portData,
//     whois,
//     country,
//     updated_at: updatedAt,
//     reachable,
//     has_whois: hasWhois,
//   } = item

//   const [isWhoisOpen, setIsWhoisOpen] = useState(false)

//   // Определяем, есть ли валидные Whois-данные (не ошибка)
//   const isValidWhois = whois
//   !whois.error && typeof whois === 'object' && Object.keys(whois).length > 0
//   const whoisCount = isValidWhois ? Object.keys(whois).length : 0

//   const openPorts = portData?.open || []
//   const filteredPorts = portData?.filtered || []

//   return (
//     <div className={`${cn.ipItem}${isValidWhois ? ` ${cn.highlighted}` : ''}`}>
//       {/* Заголовок IP */}
//       <div className={cn.ipHeader}>
//         <div className={cn.ipAddressContainer}>
//           <div>
//             <span className={cn.ipAddress}>{ip}</span>
//             &nbsp;{country ?? whois?.country ?? whois?.Country}
//           </div>
//         </div>
//       </div>
//         <div className={cn.statusWrapper}>
//           <span
//             className={reachable ? cn.statusReachable : cn.statusUnreachable}
//           >
//             {reachable ? 'Доступен' : 'Недоступен'}
//           </span>
//           {isValidWhois && whoisCount > 1 && (
//             <span
//               className={cn.statusReachable}
//               title={`Есть данные (${whoisCount} строк)`}
//             >
//               Есть данные whois
//             </span>
//           )}
//         </div>

//       {/* Порты */}
//       <div className={cn.portsSection}>
//         <div className={cn.portsTitle}>Порты:</div>
//         <div className={cn.portsList}>
//           <strong>Открытые порты:</strong>&nbsp;
//           {openPorts.length > 0 ? renderPortsData(openPorts) : 'Нет'}
//         </div>
//         <div className={cn.portsList}>
//           <strong>Фильтрованные порты:</strong>&nbsp;
//           {filteredPorts.length > 0 ? renderPortsData(filteredPorts) : 'Нет'}
//         </div>
//       </div>

//       {/* Время обновления */}
//       {updatedAt && (
//         <div className={cn.updateTime}>Обновлено:&nbsp;{updatedAt}</div>
//       )}

//       {/* Страна (если будет не null) */}
//       {country && <span className={cn.ipCountry}>{country}</span>}

//       {/* Whois */}
//       {isValidWhois && (
//         <>
//           <button
//             className={cn.whoisToggle}
//             onClick={() => setIsWhoisOpen(!isWhoisOpen)}
//           >
//             {isWhoisOpen ? 'Скрыть Whois' : 'Показать Whois'}
//           </button>
//           {isWhoisOpen && (
//             <div className={cn.whoisInfo}>
//               <ul>
//                 {Object.entries(whois).map(([key, value]) => (
//                   <li key={key}>
//                     <span className={cn.whoisKey}>{key}:</span> {String(value)}
//                   </li>
//                 ))}
//               </ul>
//             </div>
//           )}
//         </>
//       )}

//       {/* Если whois есть, но с ошибкой — можно показать уведомление (опционально) */}
//       {!isValidWhois && hasWhois && whois?.error && (
//         <div className={cn.whoisError}>
//           Whois недоступен:
//           {whois.error}
//         </div>
//       )}
//     </div>
//   )
// }
