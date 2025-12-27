// ApiService.js
import axios from 'axios'
import { ROUTES } from './routes'

// Универсальная функция для создания URL
export const createUrl = (pathname, params = {}) => {
  const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`

  // Если pathname - полный URL, возвращаем его
  if (pathname.startsWith('http')) {
    return new URL(pathname)
  }

  // Если pathname - ключ из ROUTES
  let path = pathname
  if (ROUTES[pathname.toUpperCase()]) {
    path = ROUTES[pathname.toUpperCase()]
  }

  // Если pathname - относительный путь
  if (!path.startsWith('/')) {
    path = `/${path}`
  }

  const url = new URL(path, baseUrl)

  // Добавляем параметры query string
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, value)
    }
  })

  return url
}

// Универсальная функция обработки ошибок
const handleApiError = (error) => {
  // Обрабатываем ошибки и возвращаем сообщение из ответа сервера
  if (error.response && error.response.data) {
    // Если сервер вернул JSON с сообщением
    if (error.response.data.message) {
      return new Error(error.response.data.message)
    }
    // Если сервер вернул ошибку в другом формате
    if (error.response.data.error) {
      return new Error(error.response.data.error)
    }
  }
  // Если нет данных от сервера, но есть сообщение об ошибке
  if (error.message) {
    return new Error(error.message)
  }
  return new Error('Произошла ошибка при запросе')
}

// Универсальная функция для вызова API с обработкой ошибок
const callApi = async (method, pathname, params = {}, data = null, config = {}) => {
  let url = createUrl(pathname, params)
  
  console.log(`${method.toUpperCase()} - URL:`, url.toString(), 'Config:', config)

  switch (method.toLowerCase()) {
    case 'get':
      return await axios.get(url.toString(), config)
    case 'post':
      return await axios.post(url.toString(), data, config)
    case 'put':
      return await axios.put(url.toString(), data, config)
    case 'patch':
      return await axios.patch(url.toString(), data, config)
    case 'delete':
      return await axios.delete(url.toString(), config)
    default:
      throw new Error(`Unsupported method: ${method}`)
  }
}

export class ApiService {
  // Универсальный метод для вызова API
  static async call(method, pathname, params = {}, data = null, config = {}) {
    return await callApi(method, pathname, params, data, config)
  }

  static async getData(pathname, params, config = {}) {
    try {
      const response = await callApi('get', pathname, params, null, config)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  static async postData(pathname, formData, config = {}) {
    try {
      const response = await callApi('post', pathname, {}, formData, config)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  static async patchData(pathname, formData, config = {}) {
    try {
      const response = await callApi('patch', pathname, {}, formData, config)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  static async searchData(pathname, params, config = {}) {
    try {
      const response = await callApi('get', pathname, params, null, config)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  static async getFileJson(pathname, config = {}) {
    try {
      const response = await callApi('get', pathname, {}, null, config)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  static async uploadFiles(endpoint, formData, config = {}) {
    try {
      const response = await callApi('post', endpoint, {}, formData, config)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  // Экспортные методы
  static async exportAll() {
    try {
      const response = await callApi('get', '/files/export-all/json', {}, null, {
        responseType: 'blob'
      });
      
      return response;
    } catch (error) {
      console.error('Error in exportAll:', error);
      // Попробуем получить более детальную информацию об ошибке
      if (error.response && error.response.data) {
        console.error('Error response data:', error.response.data);
      }
      throw handleApiError(error);
    }
  }

  static async exportByDateRange(startDate, endDate) {
    try {
      const response = await callApi('get', '/files/daterange', {
        startDate,
        endDate
      }, null, {
        responseType: 'blob'
      });
      
      return response;
    } catch (error) {
      console.error('Error in exportByDateRange:', error);
      if (error.response && error.response.data) {
        console.error('Error response data:', error.response.data);
      }
      throw handleApiError(error);
    }
  }

  // Старый метод для обратной совместимости
  static async exportSession(limit = 100) {
    try {
      const response = await callApi('get', '/api/export/session', { limit });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }
}

export const service = new ApiService();
