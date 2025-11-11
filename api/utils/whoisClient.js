import { Socket } from 'net';

export class WhoisClient {
  async query(server, ip) {
    return new Promise((resolve) => {
      const socket = new Socket();
      let data = '';
      socket.setTimeout(10000);
      socket.on('data', (chunk) => (data += chunk));
      socket.on('close', () => resolve(this.parseWhois(data)));
      socket.on('error', () => resolve({ error: 'Whois query failed' }));
      socket.connect(43, server, () => socket.write(`${ip}\r\n`));
    });
  }

  parseWhois(raw) {
    const result = {};
    raw.split('\n').forEach(line => {
      if (line.startsWith('%') || !line.includes(':')) return;
      const [key, ...value] = line.split(':');
      result[key.trim()] = value.join(':').trim();
    });
    return result;
  }

  async getWhois(ip) {
    try {
      const iana = await this.query('whois.iana.org', ip);
      if (iana.error || !iana.whois) {
        return await this.query('whois.ripe.net', ip);
      }
      const server = iana.whois.trim();
      if (!server) {
        return { error: 'No WHOIS server found' };
      }
      return await this.query(server, ip);
    } catch (e) {
      return { error: 'WHOIS request failed' };
    }
  }
}

// import { Socket } from 'net';

// export class WhoisClient {
//   async query(server, ip) {
//     return new Promise((resolve) => {
//       const socket = new Socket();
//       let data = '';
//       socket.setTimeout(10000);
//       socket.on('data', (chunk) => (data += chunk));
//       socket.on('close', () => resolve(this.parseWhois(data)));
//       socket.on('error', () => resolve({ error: 'Whois query failed' }));
//       socket.connect(43, server, () => socket.write(`${ip}\r\n`));
//     });
//   }

//   parseWhois(raw) {
//     // Аналогично Python: парсим строки, пропускаем %, собираем ключ-значение
//     const result = {};
//     raw.split('\n').forEach(line => {
//       if (line.startsWith('%') || !line.includes(':')) return;
//       const [key, ...value] = line.split(':');
//       result[key.trim()] = value.join(':').trim();
//     });
//     return result;
//   }

// async getWhois(ip) {
//   try {
//     const iana = await this.query('whois.iana.org', ip);
    
//     // Если IANA вернул ошибку — пробуем RIPE
//     if (iana.error || !iana.whois) {
//       return await this.query('whois.ripe.net', ip);
//     }

//     const server = iana.whois.trim();
//     if (!server) {
//       return { error: 'No WHOIS server found' };
//     }

//     return await this.query(server, ip);
//   } catch (e) {
//     return { error: 'WHOIS request failed' };
//   }
// }
// }