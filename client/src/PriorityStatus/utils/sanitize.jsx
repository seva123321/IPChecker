// Функция для санитизации текста - удаляет потенциально опасные теги и скрипты
export const sanitizeText = (text) => {
  if (!text) return text

  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

// Компонент для безопасного отображения текста
export const SafeText = ({ text }) => {
  if (!text) return null

  return (
    <span
      dangerouslySetInnerHTML={{
        __html: sanitizeText(text).replace(/\n/g, '<br />'),
      }}
    />
  )
}
