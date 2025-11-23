export const renderPortsData = (data) => {
  return data
    .sort((a, b) => a.port - b.port)
    .map((item) => `${item.port} (${item.name})`)
    .join(', ')
}

export const getPriorityDisplayName = (priorityId) => {
  switch (priorityId) {
    case '1':
      return 'Обычный'
    case '2':
      return 'Интересный'
    case '3':
      return 'Важный'
    default:
      return priority?.name || 'Неизвестно'
  }
}
