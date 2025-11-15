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
const callApi = async (method, pathname, params = {}, data = null) => {
  let url

  switch (method.toLowerCase()) {
    case 'get':
      url = createUrl(pathname, params)
      console.log(`${method.toUpperCase()} - URL:`, url.toString())
      return await axios.get(url.toString())
    case 'post':
      url = createUrl(pathname)
      console.log(`${method.toUpperCase()} - URL:`, url.toString())
      return await axios.post(url.toString(), data)
    case 'put':
      url = createUrl(pathname)
      console.log(`${method.toUpperCase()} - URL:`, url.toString())
      return await axios.put(url.toString(), data)
    case 'patch':
      url = createUrl(pathname)
      console.log(`${method.toUpperCase()} - URL:`, url.toString())
      return await axios.patch(url.toString(), data)
    case 'delete':
      url = createUrl(pathname, params)
      console.log(`${method.toUpperCase()} - URL:`, url.toString())
      return await axios.delete(url.toString())
    default:
      throw new Error(`Unsupported method: ${method}`)
  }
}

export class ApiService {
  // Универсальный метод для вызова API
  static async call(method, pathname, params = {}, data = null) {
    return await callApi(method, pathname, params, data)
  }

  static async getData(pathname, params) {
    try {
      const response = await callApi('get', pathname, params)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  static async postData(pathname, formData) {
    try {
      const response = await callApi('post', pathname, {}, formData)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  static async patchData(pathname, formData) {
    try {
      const response = await callApi('patch', pathname, {}, formData)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  static async searchData(pathname, params) {
    try {
      const response = await callApi('get', pathname, params)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  static async getFileJson(pathname) {
    try {
      const response = await callApi('get', pathname)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  static async uploadFiles(endpoint, formData) {
    try {
      const response = await callApi('post', endpoint, {}, formData)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  //**************** */
  static async exportAll(pathname) {
    try {
      const response = await callApi('get', pathname)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  static async exportSession(limit = 100) {
    try {
      const response = await callApi('get', '/api/export/session', {
        limit,
      })
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  // Добавлен метод для экспорта по датам
  static async exportByDateRange(startDate, endDate) {
    try {
      const response = await callApi('get', '/files/daterange', {
        startDate,
        endDate,
      })
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  }

  //**************** */
}

export const service = new ApiService()

// // ApiService.js
// import axios from 'axios'
// import { ROUTES } from './routes'

// // Универсальная функция для создания URL
// export const createUrl = (pathname, params = {}) => {
//   const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`

//   // Если pathname - полный URL, возвращаем его
//   if (pathname.startsWith('http')) {
//     return new URL(pathname)
//   }

//   // Если pathname - ключ из ROUTES
//   let path = pathname
//   if (ROUTES[pathname.toUpperCase()]) {
//     path = ROUTES[pathname.toUpperCase()]
//   }

//   // Если pathname - относительный путь
//   if (!path.startsWith('/')) {
//     path = `/${path}`
//   }

//   const url = new URL(path, baseUrl)

//   // Добавляем параметры query string
//   Object.entries(params).forEach(([key, value]) => {
//     if (value !== null && value !== undefined) {
//       url.searchParams.set(key, value)
//     }
//   })

//   return url
// }

// export class ApiService {
//   // Универсальный метод для вызова API
//   static async call(method, pathname, params = {}, data = null) {
//     let url

//     switch (method.toLowerCase()) {
//       case 'get':
//         url = createUrl(pathname, params)
//         console.log(`${method.toUpperCase()} - URL:`, url.toString())
//         return await axios.get(url.toString())
//       case 'post':
//         url = createUrl(pathname)
//         console.log(`${method.toUpperCase()} - URL:`, url.toString())
//         return await axios.post(url.toString(), data)
//       case 'put':
//         url = createUrl(pathname)
//         console.log(`${method.toUpperCase()} - URL:`, url.toString())
//         return await axios.put(url.toString(), data)
//       case 'delete':
//         url = createUrl(pathname, params)
//         console.log(`${method.toUpperCase()} - URL:`, url.toString())
//         return await axios.delete(url.toString())
//       default:
//         throw new Error(`Unsupported method: ${method}`)
//     }
//   }

//   static async getData(pathname, params) {
//     const data = await ApiService.call('get', pathname, params)
//     return data
//   }

//   static async postData(pathname, formData) {
//     const data = await ApiService.call('post', pathname, formData)
//     return data
//   }

//   static async searchData(pathname, params) {
//     const data = await ApiService.call('get', pathname, params)
//     return data
//   }

//   static async getFileJson(pathname) {
//     const data = await ApiService.call('get', pathname)
//     return data
//   }

//   static async uploadFiles(endpoint, formData) {
//     const response = await ApiService.call('post', endpoint, {}, formData)
//     return response
//   }

//   //**************** */
//   static async exportAll(pathname) {
//     const data = await ApiService.call('get', pathname)
//     return data
//   }

//   static async exportSession(limit = 100) {
//     const response = await ApiService.call('get', '/api/export/session', {
//       limit,
//     })
//     return response
//   }

//   // Добавлен метод для экспорта по датам
//   static async exportByDateRange(startDate, endDate) {
//     const response = await ApiService.call('get', '/files/daterange', {
//       startDate,
//       endDate,
//     })
//     return response
//   }

//   //**************** */
// }

// export const service = new ApiService()
