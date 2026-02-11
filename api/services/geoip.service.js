// utils/geoIPService.js
import axios from 'axios';

export class GeoIPService {
  static async getCountryByIP(ip) {
    try {
      const geoIpServices = [
        {
          name: 'ipapi.co',
          url: `https://ipapi.co/${ip}/json/`,
          countryField: 'country_code',
          countryNameField: 'country_name'
        },
        {
          name: 'ipinfo.io',
          url: `https://ipinfo.io/${ip}/json`,
          countryField: 'country',
          countryNameField: 'country'
        },
        {
          name: 'ip-api.com',
          url: `http://ip-api.com/json/${ip}`,
          countryField: 'countryCode',
          countryNameField: 'country'
        }
      ];

      let geoIPData = null;

      for (const service of geoIpServices) {
        try {
          console.log(`🌍 Запрос к ${service.name} для IP ${ip}`);
          
          const response = await axios.get(service.url, {
            timeout: 5000,
            headers: {
              'User-Agent': 'Mozilla/5.0'
            }
          });

          if (response.data && response.data[service.countryField]) {
            geoIPData = {
              countryCode: response.data[service.countryField].toUpperCase(),
              countryName: response.data[service.countryNameField] || response.data[service.countryField],
              source: service.name,
              fullData: response.data
            };
            break;
          }
        } catch (error) {
          console.warn(`⚠️ ${service.name} не доступен для ${ip}:`, error.message);
          continue;
        }
      }

      if (!geoIPData) {
        throw new Error('Не удалось определить страну через GeoIP API');
      }

      console.log(`✅ GeoIP для ${ip}: ${geoIPData.countryCode} (${geoIPData.countryName}) via ${geoIPData.source}`);
      return geoIPData;

    } catch (error) {
      console.error(`❌ Ошибка GeoIP для ${ip}:`, error.message);
      throw error;
    }
  }

  static parseWhoisCountry(countryString) {
    if (!countryString || typeof countryString !== 'string' || countryString.trim() === '') {
      return null;
    }

    // Убираем лишние пробелы
    const cleanString = countryString.trim().toUpperCase();
    
    // Разделяем по запятым, точкам с запятой, пробелам
    const countries = cleanString
      .split(/[,;\s]+/)
      .map(country => country.trim())
      .filter(country => country.length > 0)
      .filter((country, index, self) => self.indexOf(country) === index); // Уникальные

    if (countries.length === 0) {
      return null;
    }

    return {
      primary: countries[0],
      all: countries,
      source: 'whois'
    };
  }

  static async resolveCountryForIP(ip, whoisData = {}) {
    try {
      const result = {
        ip: ip,
        countryCode: null,
        countryName: null,
        source: null,
        details: {}
      };

      // 1. Пробуем получить страну из WHOIS данных
      const whoisCountryFields = [
        'country',
        'Country',
        'CountryCode',
        'country-code',
        'Registrant Country',
        'Country:',
        'registrantcountry'
      ];

      let whoisCountry = null;
      for (const field of whoisCountryFields) {
        const fieldValue = whoisData[field] || whoisData[field.toLowerCase()];
        if (fieldValue && typeof fieldValue === 'string') {
          const parsed = this.parseWhoisCountry(fieldValue);
          if (parsed) {
            whoisCountry = parsed;
            break;
          }
        }
      }

      // Если нашли страну в WHOIS
      if (whoisCountry) {
        result.countryCode = whoisCountry.primary;
        result.countryName = whoisCountry.primary;
        result.source = 'whois';
        result.details = {
          whoisCountry: whoisCountry,
          multipleCountries: whoisCountry.all.length > 1 ? whoisCountry.all : null
        };
        console.log(`✅ Страна из WHOIS для ${ip}: ${result.countryCode}`);
        return result;
      }

      // 2. Если в WHOIS нет страны, пробуем GeoIP
      try {
        const geoIPData = await this.getCountryByIP(ip);
        result.countryCode = geoIPData.countryCode;
        result.countryName = geoIPData.countryName || geoIPData.countryCode;
        result.source = 'geoip';
        result.details = {
          geoIPService: geoIPData.source,
          fullData: geoIPData.fullData
        };
        console.log(`✅ Страна из GeoIP для ${ip}: ${result.countryCode}`);
        return result;
      } catch (geoIPError) {
        console.warn(`⚠️ GeoIP не сработал для ${ip}:`, geoIPError.message);
      }

      // 3. Если ничего не сработало, возвращаем null
      console.warn(`⚠️ Не удалось определить страну для ${ip}`);
      return null;

    } catch (error) {
      console.error(`❌ Ошибка при определении страны для ${ip}:`, error);
      return null;
    }
  }
}