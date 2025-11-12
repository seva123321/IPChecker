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

export class ApiService {
  // Универсальный метод для вызова API
  static async call(method, pathname, params = {}, data = null) {
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
      case 'delete':
        url = createUrl(pathname, params)
        console.log(`${method.toUpperCase()} - URL:`, url.toString())
        return await axios.delete(url.toString())
      default:
        throw new Error(`Unsupported method: ${method}`)
    }
  }

  static async getData(pathname, params) {
    const data = await ApiService.call('get', pathname, params)
    return data
  }

  static async searchData(pathname, params) {
    const data = await ApiService.call('get', pathname, params)
    return data
  }

  static async getFileJson(pathname) {
    const data = await ApiService.call('get', pathname)
    return data
  }

  static async uploadFiles(endpoint, formData) {
    const response = await ApiService.call('post', endpoint, {}, formData)
    return response
  }

  //**************** */
  static async exportAll(pathname) {
    const data = await ApiService.call('get', pathname)
    return data
  }

  static async exportSession(limit = 100) {
    const response = await ApiService.call('get', '/api/export/session', {
      limit,
    })
    return response
  }

  // Добавлен метод для экспорта по датам
  static async exportByDateRange(startDate, endDate) {
    const response = await ApiService.call('get', '/files/daterange', {
      startDate,
      endDate,
    })
    return response
  }

  //**************** */
}

export const service = new ApiService()

//**************** */
// УНИВЕРСАЛЬНЫЙ
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
//   static async getData(pathname, params) {
//     let url
//     if (params) {
//       // Для поисковых запросов используем createUrl с параметрами
//       url = createUrl(pathname, params)
//       console.log('getData - search URL:', url.toString())
//     } else {
//       // Для обычных запросов используем createUrl
//       url = createUrl(pathname)
//       console.log('getData - data URL:', url.toString())
//     }

//     const data = await axios.get(url.toString())
//     return data
//   }

//   static async searchData(pathname, params) {
//     const data = await ApiService.getData(pathname, params)
//     return data
//   }

//   static async getFileJson(pathname) {
//     const data = await ApiService.getData(pathname)
//     return data
//   }

//   static async uploadFiles(endpoint, formData) {
//     const url = createUrl(endpoint)
//     const response = await axios.post(url.toString(), formData, {
//       headers: { 'Content-Type': 'multipart/form-data' },
//     })
//     return response
//   }

//   //**************** */
//   static async exportAll(pathname) {
//     const data = await ApiService.call('get', pathname)
//     return data
//   }

//   static async exportSession(limit = 100) {
//     const url = createUrl('/api/export/session', { limit })
//     const response = await axios.get(url.toString())
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

//   static async exportRange(startIp, endIp) {
//     const url = createUrl('/api/export/range', { startIp, endIp })
//     const response = await axios.get(url.toString())
//     return response
//   }

//   // Универсальный метод для вызова API
//   static async call(method, pathname, params = {}, data = null) {
//     let url

//     switch (method.toLowerCase()) {
//       case 'get':
//         url = createUrl(pathname, params)
//         return await axios.get(url.toString())
//       case 'post':
//         url = createUrl(pathname)
//         return await axios.post(url.toString(), data)
//       case 'put':
//         url = createUrl(pathname)
//         return await axios.put(url.toString(), data)
//       case 'delete':
//         url = createUrl(pathname, params)
//         return await axios.delete(url.toString())
//       default:
//         throw new Error(`Unsupported method: ${method}`)
//     }
//   }
//   //**************** */
// }

// export const service = new ApiService()

//**************** */
// УНИВЕРСАЛЬНЫЙ КОНЕЦ

// import axios from 'axios'
// import { ROUTES } from './routes'

// export class ApiService {
//   static createUrlData(pathname) {
//     const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
//     const path = `${ROUTES[String(pathname).toUpperCase()]}`
//     const url = new URL(path, baseUrl)
//     return url
//   }

//   static createUrlSearch(pathname, { name, value }) {
//     const baseUrl = `${ROUTES.BASE_URL}:${ROUTES.PORT}`
//     const pathRes = `${ROUTES[String(pathname.split('/')[0]).toUpperCase()]}`
//     const path =
//       pathname.split('/')[1] === 'group' ? `${pathRes}/group` : pathRes

//     const url = new URL(path, baseUrl)
//     url.searchParams.set(name, value)
//     return url
//   }

//   static async getData(pathname, params) {
//     if (params) {
//       const url = ApiService.createUrlSearch(pathname, params)
//       console.log('getData - search URL:', url.toString())
//       const data = await axios.get(url.toString())
//       return data
//     } else {
//       const url = ApiService.createUrlData(pathname)
//       console.log('getData - data URL:', url.toString())
//       const data = await axios.get(url.toString())
//       return data
//     }
//   }

//   static async searchData(pathname, params) {
//     const data = await ApiService.getData(pathname, params)
//     return data
//   }
//   static async getFileJson(pathname) {
//     const data = await ApiService.getData(pathname)
//     return data
//   }

//   static async uploadFiles(endpoint, formData) {
//     const url = new URL(endpoint, `${ROUTES.BASE_URL}:${ROUTES.PORT}`)
//     const response = await axios.post(url.toString(), formData, {
//       headers: { 'Content-Type': 'multipart/form-data' },
//     })
//     return response
//   }

//   //**************** */
//   static async exportAll() {
//     const url = new URL('/api/export/all', `${ROUTES.BASE_URL}:${ROUTES.PORT}`)
//     const response = await axios.get(url.toString())
//     return response
//   }

//   static async exportSession(limit = 100) {
//     const url = new URL(
//       `/api/export/session?limit=${limit}`,
//       `${ROUTES.BASE_URL}:${ROUTES.PORT}`
//     )
//     const response = await axios.get(url.toString())
//     return response
//   }

//   // Добавлен метод для экспорта по датам
//   static async exportByDateRange(startDate, endDate) {
//     const url = new URL(
//       '/api/export/daterange',
//       `${ROUTES.BASE_URL}:${ROUTES.PORT}`
//     )
//     url.searchParams.set('startDate', startDate)
//     url.searchParams.set('endDate', endDate)
//     const response = await axios.get(url.toString())
//     return response
//   }

//   static async exportRange(startIp, endIp) {
//     const url = new URL(
//       `/api/export/range?startIp=${startIp}&endIp=${endIp}`,
//       `${ROUTES.BASE_URL}:${ROUTES.PORT}`
//     )
//     const response = await axios.get(url.toString())
//     return response
//   }
//   //**************** */
// }

// export const service = new ApiService()
