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

// Функция для кодирования имени файла с сохранением кириллицы
export const encodeFileName = (fileName) => {
  // Сохраняем расширение файла
  const extension = fileName.split('.').pop()
  const nameWithoutExtension = fileName.substring(0, fileName.lastIndexOf('.'))

  // Кодируем имя файла для передачи, сохраняя кириллицу
  const encodedName = encodeURIComponent(nameWithoutExtension)

  // Возвращаем имя с оригинальным расширением
  return `${encodedName}.${extension}`
}

// Функция для декодирования имени файла
export const decodeFileName = (fileName) => {
  try {
    // Разделяем имя и расширение
    const extension = fileName.split('.').pop()
    const encodedName = fileName.substring(0, fileName.lastIndexOf('.'))

    // Декодируем имя файла
    const decodedName = decodeURIComponent(encodedName)

    return `${decodedName}.${extension}`
  } catch (error) {
    console.warn('Ошибка декодирования имени файла:', error)
    return fileName // Возвращаем оригинальное имя в случае ошибки
  }
}

export const generateClientId = () => {
  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
