// utils/simpleWebParser.js
import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

// HTTPS agent с игнорированием SSL ошибок
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true
});

// Расширенный список User-Agent (5 вариантов, без признаков России)
const USER_AGENTS = [
  // Chrome на Windows (современный)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  
  // Firefox на Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  
  // Safari на macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  
  // Chrome на macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  
  // Edge на Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Извлечение основной информации о странице
 */
export async function parseWebPageSimple(ip, port, protocol = 'http') {
  const startTime = Date.now();
  
  // Задержка для снижения нагрузки
  await delay(Math.floor(Math.random() * 1000) + 500);

  const url = `${protocol}://${ip}:${port}`;
  
  const config = {
    timeout: 5000,
    maxRedirects: 2,
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,de;q=0.7,es;q=0.6', 
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    },
    httpsAgent: protocol === 'https' ? httpsAgent : undefined,
    validateStatus: (status) => status >= 200 && status < 500
  };

  try {
    const response = await axios.get(url, config);
    const responseTime = Date.now() - startTime;
    
    const $ = cheerio.load(response.data);
    const html = response.data;
    const text = $('body').text().replace(/\s+/g, ' ').trim();

    // 1. Заголовки страницы
    const title = $('title').text().trim();
    const h1 = $('h1').map((i, el) => $(el).text().trim()).get();
    const h2 = $('h2').map((i, el) => $(el).text().trim()).get();
    const h3 = $('h3').map((i, el) => $(el).text().trim()).get();

    // 2. Метаданные
    const metadata = {
      description: $('meta[name="description"]').attr('content') || '',
      keywords: $('meta[name="keywords"]').attr('content') || '',
      author: $('meta[name="author"]').attr('content') || '',
      viewport: $('meta[name="viewport"]').attr('content') || '',
      ogTitle: $('meta[property="og:title"]').attr('content') || '',
      ogDescription: $('meta[property="og:description"]').attr('content') || '',
      ogType: $('meta[property="og:type"]').attr('content') || '',
      ogImage: $('meta[property="og:image"]').attr('content') || '',
      canonical: $('link[rel="canonical"]').attr('href') || '',
      robots: $('meta[name="robots"]').attr('content') || '',
      language: $('html').attr('lang') || ''
    };

    // 3. Формы
    const forms = $('form').map((i, form) => {
      const $form = $(form);
      const inputs = $form.find('input, textarea, select').map((j, input) => {
        const $input = $(input);
        return {
          type: $input.attr('type') || 'text',
          name: $input.attr('name') || '',
          placeholder: $input.attr('placeholder') || '',
          required: $input.attr('required') !== undefined
        };
      }).get();

      return {
        action: $form.attr('action') || '',
        method: $form.attr('method') || 'get',
        hasPassword: $form.find('input[type="password"]').length > 0,
        hasFileUpload: $form.find('input[type="file"]').length > 0,
        inputs: inputs
      };
    }).get();

    // 4. Основной текст (первые 5000 символов)
    const mainText = text.substring(0, 5000);
    
    // 5. Ссылки (первые 20)
    const links = $('a').map((i, a) => {
      const $a = $(a);
      return {
        text: $a.text().trim(),
        href: $a.attr('href') || '',
        isInternal: ($a.attr('href') || '').startsWith('/') || 
                    ($a.attr('href') || '').includes(ip)
      };
    }).get().slice(0, 20);

    // 6. Изображения (первые 10)
    const images = $('img').map((i, img) => {
      const $img = $(img);
      return {
        src: $img.attr('src') || '',
        alt: $img.attr('alt') || '',
        title: $img.attr('title') || ''
      };
    }).get().slice(0, 10);

    // 7. Определение типа контента (обновлены ключевые слова)
    const textLower = text.toLowerCase();
    let contentType = 'unknown';
    
    if (textLower.includes('login') || textLower.includes('sign in') || textLower.includes('log in')) {
      contentType = 'login';
    } else if (textLower.includes('admin') || textLower.includes('dashboard') || textLower.includes('control panel')) {
      contentType = 'admin';
    } else if (textLower.includes('shop') || textLower.includes('cart') || textLower.includes('checkout') || textLower.includes('buy')) {
      contentType = 'ecommerce';
    } else if (textLower.includes('blog') || textLower.includes('post') || textLower.includes('article')) {
      contentType = 'blog';
    } else if ($('form').length > 0) {
      contentType = 'form_page';
    } else if (text.length > 500) {
      contentType = 'content';
    } else {
      contentType = 'simple';
    }

    // Собираем результат
    return {
      success: true,
      url,
      port,
      protocol,
      response: {
        status: response.status,
        time: responseTime,
        size: html.length,
        headers: {
          server: response.headers['server'] || '',
          contentType: response.headers['content-type'] || '',
          poweredBy: response.headers['x-powered-by'] || ''
        }
      },
      content: {
        type: contentType,
        title,
        headers: {
          h1: h1,
          h2: h2,
          h3: h3
        },
        metadata: metadata,
        forms: forms,
        text_preview: mainText,
        text_length: text.length,
        links_count: $('a').length,
        images_count: $('img').length,
        sample_links: links,
        sample_images: images
      },
      scanned_at: new Date().toISOString(),
      user_agent: config.headers['User-Agent'] // Добавлено для отладки
    };

  } catch (error) {
    console.warn(`Failed to fetch page ${url}:`, error.message);
    
    return {
      success: false,
      url,
      port,
      protocol,
      error: error.message,
      error_code: error.code,
      scanned_at: new Date().toISOString()
    };
  }
}

/**
 * Проверка веб-портов хоста
 */
export async function scanWebPortsSimple(ip, ports = [80, 443, 8080]) {
  const results = {};
  
  for (const port of ports) {
    try {
      const protocol = port === 443  ? 'https' : 'http';
      
      console.log(`🌐 Checking ${protocol}://${ip}:${port}`);
      
      const result = await parseWebPageSimple(ip, port, protocol);
      results[port] = result;
      
      // Небольшая задержка между портами
      if (port !== ports[ports.length - 1]) {
        await delay(800 + Math.random() * 400);
      }
      
    } catch (error) {
      console.warn(`Error checking port ${port}:`, error.message);
      results[port] = {
        success: false,
        port,
        error: error.message
      };
    }
  }
  
  return results;
}

// // utils/webParser.js
// import axios from 'axios';
// import * as cheerio from 'cheerio';
// import https from 'https';

// // Агенты для обхода SSL и улучшения производительности
// const httpsAgent = new https.Agent({
//   rejectUnauthorized: false, // Игнорируем ошибки SSL (для самоподписанных сертификатов)
//   keepAlive: true,
//   maxSockets: 50
// });

// // Случайные User-Agent для снижения заметности
// const USER_AGENTS = [
//   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//   'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
//   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//   'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//   'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
// ];

// // CMS/фреймворки для определения
// const CMS_SIGNATURES = {
//   'wordpress': ['wp-content', 'wp-includes', 'wordpress'],
//   'joomla': ['joomla', 'media/jui', 'templates/joomla'],
//   'drupal': ['drupal', 'sites/all/modules', 'sites/all/themes'],
//   'laravel': ['laravel', 'mix-manifest.json'],
//   'react': ['react', '__next', '_next'],
//   'vue': ['vue', '__vue'],
//   'angular': ['angular', 'ng-'],
//   'django': ['django', 'csrfmiddlewaretoken'],
//   'express': ['express', 'node'],
//   'nginx': ['nginx', 'server: nginx'],
//   'apache': ['apache', 'server: apache'],
//   'iis': ['iis', 'microsoft', 'server: microsoft']
// };

// /**
//  * Получение случайного User-Agent
//  */
// function getRandomUserAgent() {
//   return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
// }

// /**
//  * Задержка для снижения заметности
//  */
// function delay(ms) {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// /**
//  * Анализ контента страницы для определения типа информации
//  */
// function analyzeContentType(html, url) {
//   const analysis = {
//     isLoginPage: false,
//     isAdminPanel: false,
//     isDashboard: false,
//     isEcommerce: false,
//     isBlog: false,
//     isApi: false,
//     isErrorPage: false,
//     isRedirect: false,
//     isMaintenance: false,
//     technologies: [],
//     hasForms: false,
//     hasSearch: false,
//     hasContact: false,
//     contentKeywords: []
//   };

//   const $ = cheerio.load(html);
//   const text = $('body').text().toLowerCase();
//   const htmlLower = html.toLowerCase();

//   // Проверка на логин/админку
//   const loginKeywords = ['login', 'sign in', 'username', 'password', 'войти', 'авторизация'];
//   const adminKeywords = ['admin', 'dashboard', 'панель управления', 'админка', 'control panel'];
//   const ecommerceKeywords = ['cart', 'checkout', 'shop', 'buy', 'product', 'корзина', 'магазин'];
//   const blogKeywords = ['blog', 'post', 'article', 'blog', 'публикация', 'статья'];
  
//   analysis.isLoginPage = loginKeywords.some(keyword => text.includes(keyword));
//   analysis.isAdminPanel = adminKeywords.some(keyword => text.includes(keyword));
//   analysis.isDashboard = adminKeywords.some(keyword => text.includes(keyword));
//   analysis.isEcommerce = ecommerceKeywords.some(keyword => text.includes(keyword));
//   analysis.isBlog = blogKeywords.some(keyword => text.includes(keyword));
  
//   // Проверка на API
//   analysis.isApi = html.includes('{') && html.includes('}') && 
//                    (html.includes('"status"') || html.includes('"error"') || 
//                     html.includes('application/json') || html.includes('xml'));
  
//   // Проверка на страницы ошибок
//   analysis.isErrorPage = text.includes('404') || text.includes('not found') || 
//                          text.includes('500') || text.includes('error') ||
//                          text.includes('ошибка') || text.includes('страница не найдена');
  
//   // Проверка на редирект/тех работы
//   analysis.isRedirect = text.includes('redirect') || html.includes('meta http-equiv="refresh"');
//   analysis.isMaintenance = text.includes('maintenance') || text.includes('технические работы') ||
//                            text.includes('обслуживание');
  
//   // Поиск форм
//   analysis.hasForms = $('form').length > 0;
//   analysis.hasSearch = $('input[type="search"], form[role="search"]').length > 0;
//   analysis.hasContact = text.includes('contact') || text.includes('контакты') || 
//                         $('a[href*="contact"], a[href*="контакты"]').length > 0;
  
//   // Извлечение ключевых слов
//   const words = text.split(/\s+/).filter(word => word.length > 4);
//   const wordFrequency = {};
//   words.forEach(word => {
//     wordFrequency[word] = (wordFrequency[word] || 0) + 1;
//   });
  
//   analysis.contentKeywords = Object.entries(wordFrequency)
//     .sort((a, b) => b[1] - a[1])
//     .slice(0, 10)
//     .map(([word]) => word);
  
//   return analysis;
// }

// /**
//  * Определение технологий/CMS
//  */
// function detectTechnologies(html, headers) {
//   const technologies = [];
//   const htmlLower = html.toLowerCase();
//   const headersLower = Object.entries(headers)
//     .reduce((acc, [key, value]) => {
//       acc[key.toLowerCase()] = value.toString().toLowerCase();
//       return acc;
//     }, {});

//   // Проверка CMS
//   for (const [cms, signatures] of Object.entries(CMS_SIGNATURES)) {
//     if (signatures.some(sig => htmlLower.includes(sig) || 
//         Object.values(headersLower).some(h => h.includes(sig)))) {
//       technologies.push(cms);
//     }
//   }

//   // Проверка в заголовках сервера
//   const serverHeader = headersLower['server'] || '';
//   if (serverHeader.includes('nginx')) technologies.push('nginx');
//   if (serverHeader.includes('apache')) technologies.push('apache');
//   if (serverHeader.includes('iis') || serverHeader.includes('microsoft')) technologies.push('iis');
  
//   // Проверка языков программирования
//   if (htmlLower.includes('.php') || headersLower['x-powered-by']?.includes('php')) {
//     technologies.push('php');
//   }
//   if (headersLower['x-powered-by']?.includes('asp.net')) {
//     technologies.push('asp.net');
//   }
//   if (headersLower['x-powered-by']?.includes('express')) {
//     technologies.push('node.js');
//   }
//   if (htmlLower.includes('python') || headersLower['x-powered-by']?.includes('python')) {
//     technologies.push('python');
//   }
  
//   // Проверка фронтенд фреймворков
//   if (htmlLower.includes('react') || html.includes('React')) technologies.push('react');
//   if (htmlLower.includes('vue') || html.includes('Vue')) technologies.push('vue.js');
//   if (htmlLower.includes('angular') || html.includes('Angular')) technologies.push('angular');
  
//   // Удаление дубликатов
//   return [...new Set(technologies)];
// }

// /**
//  * Извлечение метаданных
//  */
// function extractMetadata(html) {
//   const $ = cheerio.load(html);
//   const metadata = {
//     title: $('title').text().trim(),
//     description: $('meta[name="description"]').attr('content') || '',
//     keywords: $('meta[name="keywords"]').attr('content') || '',
//     author: $('meta[name="author"]').attr('content') || '',
//     viewport: $('meta[name="viewport"]').attr('content') || '',
//     charset: $('meta[charset]').attr('charset') || '',
//     ogTitle: $('meta[property="og:title"]').attr('content') || '',
//     ogDescription: $('meta[property="og:description"]').attr('content') || '',
//     ogType: $('meta[property="og:type"]').attr('content') || '',
//     ogImage: $('meta[property="og:image"]').attr('content') || '',
//     ogUrl: $('meta[property="og:url"]').attr('content') || '',
//     twitterCard: $('meta[name="twitter:card"]').attr('content') || '',
//     canonical: $('link[rel="canonical"]').attr('href') || '',
//     robots: $('meta[name="robots"]').attr('content') || '',
//     generator: $('meta[name="generator"]').attr('content') || '',
//     language: $('html').attr('lang') || '',
//     icon: $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href') || ''
//   };

//   // Счетчики аналитики
//   const analytics = {
//     hasGoogleAnalytics: html.includes('google-analytics.com') || html.includes('gtag'),
//     hasYandexMetrika: html.includes('yandex.ru/metrika') || html.includes('mc.yandex.ru'),
//     hasFacebookPixel: html.includes('facebook.com/tr') || html.includes('fbq('),
//     hasGoogleTagManager: html.includes('googletagmanager.com'),
//     hasHotjar: html.includes('hotjar.com'),
//     hasLiveInternet: html.includes('liveinternet.ru')
//   };

//   // Ссылки
//   const links = {
//     internal: $('a[href^="/"], a[href^="./"], a[href^="../"]').length,
//     external: $('a[href^="http"]').length,
//     hasLoginLink: $('a[href*="login"], a[href*="signin"], a[href*="auth"]').length > 0,
//     hasAdminLink: $('a[href*="admin"], a[href*="dashboard"]').length > 0,
//     hasContactLink: $('a[href*="contact"], a[href*="контакты"]').length > 0
//   };

//   // Формы
//   const forms = $('form').map((i, form) => {
//     const $form = $(form);
//     return {
//       id: $form.attr('id') || '',
//       action: $form.attr('action') || '',
//       method: $form.attr('method') || 'get',
//       hasPassword: $form.find('input[type="password"]').length > 0,
//       hasFileUpload: $form.find('input[type="file"]').length > 0
//     };
//   }).get();

//   return { metadata, analytics, links, forms };
// }

// /**
//  * Основная функция парсинга страницы
//  */
// export async function parseWebPage(ip, port, protocol = 'http', options = {}) {
//   const startTime = Date.now();
  
//   // Случайная задержка
//   if (options.randomDelay !== false) {
//     await delay(Math.floor(Math.random() * 2000) + 1000);
//   }

//   const url = `${protocol}://${ip}:${port}`;
//   const config = {
//     timeout: options.timeout || 10000,
//     maxRedirects: options.maxRedirects || 5,
//     headers: {
//       'User-Agent': options.userAgent || getRandomUserAgent(),
//       'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
//       'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
//       'Accept-Encoding': 'gzip, deflate, br',
//       'Connection': 'keep-alive',
//       'Upgrade-Insecure-Requests': '1'
//     },
//     httpsAgent: protocol === 'https' ? httpsAgent : undefined,
//     validateStatus: function (status) {
//       return status >= 200 && status < 500; // Принимаем все, кроме 5xx
//     }
//   };

//   try {
//     const response = await axios.get(url, config);
//     const responseTime = Date.now() - startTime;

//     // Если это редирект, проверяем конечный URL
//     const finalUrl = response.request?.res?.responseUrl || url;
//     const isRedirected = finalUrl !== url;

//     // Парсим HTML
//     const $ = cheerio.load(response.data);
//     const html = response.data;
//     const text = $('body').text();
    
//     // Извлекаем метаданные
//     const metadata = extractMetadata(html);
    
//     // Анализируем контент
//     const contentType = analyzeContentType(html, finalUrl);
    
//     // Определяем технологии
//     const technologies = detectTechnologies(html, response.headers);
    
//     // Статистика по странице
//     const stats = {
//       statusCode: response.status,
//       responseTime,
//       contentLength: html.length,
//       textLength: text.length,
//       isRedirected,
//       finalUrl: isRedirected ? finalUrl : null,
//       headers: {
//         server: response.headers['server'] || '',
//         poweredBy: response.headers['x-powered-by'] || '',
//         contentType: response.headers['content-type'] || '',
//         lastModified: response.headers['last-modified'] || '',
//         cacheControl: response.headers['cache-control'] || ''
//       }
//     };

//     // Определяем тип страницы
//     let pageType = 'unknown';
//     if (contentType.isLoginPage) pageType = 'login';
//     else if (contentType.isAdminPanel) pageType = 'admin';
//     else if (contentType.isDashboard) pageType = 'dashboard';
//     else if (contentType.isEcommerce) pageType = 'ecommerce';
//     else if (contentType.isBlog) pageType = 'blog';
//     else if (contentType.isApi) pageType = 'api';
//     else if (contentType.isErrorPage) pageType = 'error';
//     else if (stats.statusCode === 200) pageType = 'content';
//     else pageType = 'other';

//     // Оценка важности
//     let importanceScore = 0;
//     if (contentType.isLoginPage || contentType.isAdminPanel) importanceScore += 3;
//     if (contentType.hasForms) importanceScore += 2;
//     if (technologies.length > 0) importanceScore += 1;
//     if (metadata.analytics.hasGoogleAnalytics) importanceScore += 1;

//     return {
//       success: true,
//       url: finalUrl,
//       port,
//       protocol,
//       pageType,
//       importanceScore,
//       stats,
//       metadata,
//       contentType,
//       technologies,
//       security: {
//         isHttps: protocol === 'https',
//         hasLogin: contentType.isLoginPage,
//         hasAdmin: contentType.isAdminPanel,
//         hasForms: contentType.hasForms
//       },
//       summary: {
//         title: metadata.metadata.title,
//         description: metadata.metadata.description.substring(0, 200),
//         detectedCms: technologies.filter(t => 
//           ['wordpress', 'joomla', 'drupal', 'laravel'].includes(t)
//         ),
//         hasAnalytics: Object.values(metadata.analytics).some(v => v === true),
//         pageSize: Math.round(html.length / 1024) + ' KB'
//       }
//     };

//   } catch (error) {
//     console.warn(`Не удалось спарсить ${url}:`, error.message);
    
//     // Возвращаем информацию даже при ошибке
//     return {
//       success: false,
//       url,
//       port,
//       protocol,
//       error: error.message,
//       errorCode: error.code,
//       stats: {
//         responseTime: Date.now() - startTime
//       },
//       summary: {
//         accessible: false,
//         reason: error.message.includes('timeout') ? 'timeout' : 
//                 error.message.includes('ENOTFOUND') ? 'dns_error' : 
//                 error.message.includes('ECONNREFUSED') ? 'connection_refused' : 'other'
//       }
//     };
//   }
// }

// /**
//  * Проверка всех веб-портов на хосте
//  */
// export async function scanWebPorts(ip, ports = [80, 443, 8080]) {
//   const results = {};
  
//   for (const port of ports) {
//     try {
//       // Определяем протокол по порту
//       const protocol = port === 443 ? 'https' : 'http';
      
//       console.log(`🔍 Проверка веб-страницы ${protocol}://${ip}:${port}`);
      
//       const result = await parseWebPage(ip, port, protocol, {
//         timeout: 8000,
//         randomDelay: true
//       });
      
//       results[port] = result;
      
//       // Задержка между проверками портов
//       if (port !== ports[ports.length - 1]) {
//         await delay(1000);
//       }
      
//     } catch (error) {
//       console.warn(`Ошибка при проверке порта ${port} на ${ip}:`, error.message);
//       results[port] = {
//         success: false,
//         port,
//         error: error.message
//       };
//     }
//   }
  
//   return results;
// }