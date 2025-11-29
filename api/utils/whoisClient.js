import { Socket } from 'net';

export class WhoisClient {
  async query(server, ip) {
    return new Promise((resolve) => {
      const socket = new Socket();
      let data = '';
      
      socket.setTimeout(10000);
      socket.setEncoding('utf8');
      
      socket.on('data', (chunk) => {
        data += chunk;
      });
      
      socket.on('close', () => {
        resolve(this.parseWhois(data));
      });
      
      socket.on('error', (error) => {
        console.error(`WHOIS ошибка для ${ip} на сервере ${server}:`, error.message);
        resolve({ error: 'Whois query failed' });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ error: 'Whois query timeout' });
      });
      
      socket.connect(43, server, () => {
        socket.write(`${ip}\r\n`);
      });
    });
  }

  parseWhois(raw) {
    const result = {};
    const lines = raw.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('%') || line.startsWith('#') || line.trim() === '') {
        continue;
      }
      
      if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const keyName = key.trim();
        const value = valueParts.join(':').trim();
        
        if (keyName && value) {
          // Обработка дублирующихся ключей
          if (result[keyName]) {
            if (Array.isArray(result[keyName])) {
              result[keyName].push(value);
            } else {
              result[keyName] = [result[keyName], value];
            }
          } else {
            result[keyName] = value;
          }
        }
      }
    }
    
    return Object.keys(result).length > 0 ? result : { error: 'No WHOIS data found' };
  }

  async getWhois(ip) {
    try {
      console.log(`Запрос WHOIS для IP: ${ip}`);
      
      const ianaResponse = await this.query('whois.iana.org', ip);
      
      if (ianaResponse.error || !ianaResponse.whois) {
        console.log(`IANA не дала WHOIS сервер, пробуем whois.arin.net для ${ip}`);
        return await this.query('whois.arin.net', ip);
      }
      
      const server = ianaResponse.whois.trim();
      if (!server) {
        return { error: 'No WHOIS server found' };
      }
      
      console.log(`Найден WHOIS сервер для ${ip}: ${server}`);
      const finalResult = await this.query(server, ip);
      
      // Объединяем результаты если нужно
      return { ...ianaResponse, ...finalResult };
      
    } catch (error) {
      console.error(`Критическая ошибка WHOIS для ${ip}:`, error.message);
      return { error: 'WHOIS request failed' };
    }
  }
}