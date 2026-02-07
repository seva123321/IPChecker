import { createConnection } from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function ping(ip, timeout = 1000) {
  try {
    const isWindows = process.platform === 'win32';
    const countFlag = isWindows ? '-n' : '-c';
    const timeoutFlag = isWindows ? '-w' : '-W';
    
    // Преобразование таймаута для разных ОС
    let timeoutValue;
    if (isWindows) {
      timeoutValue = timeout; // Windows: миллисекунды
    } else {
      timeoutValue = Math.ceil(timeout / 1000); // Unix: секунды
      if (timeoutValue < 1) timeoutValue = 1;
    }

    const command = `ping ${countFlag} 1 ${timeoutFlag} ${timeoutValue} ${ip}`;
    
    // Добавляем запас по времени для исполнения команды
    const { stdout } = await execAsync(command, { 
      timeout: timeout + 1000,
      windowsHide: true 
    });
    
    // Более надежные признаки успешного ping
    const successIndicators = [
      'TTL=', 
      'ttl=', 
      'bytes from',
      'time=',
      'Reply from'
    ];
    
    return successIndicators.some(indicator => 
      stdout.toLowerCase().includes(indicator.toLowerCase())
    );
  } catch (error) {
    // Игнорируем ошибки таймаута и другие - хост недоступен
    return false;
  }
}

export function isTCPPortOpen(ip, port = 80, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = createConnection({ 
      host: ip, 
      port, 
      timeout 
    });
    
    let resolved = false;
    
    const cleanup = (result) => {
      if (!resolved) {
        resolved = true;
        if (!socket.destroyed) {
          socket.destroy();
        }
        resolve(result);
      }
    };
    
    socket.on('connect', () => {
      cleanup(true);
    });
    
    socket.on('error', (err) => {
      cleanup(false);
    });
    
    socket.on('timeout', () => {
      cleanup(false);
    });
    
    setTimeout(() => {
      cleanup(false);
    }, timeout + 100);
  });
}

export async function checkReachability(ip, timeout = 1000) {
  try {
    // Параллельная проверка TCP и ICMP
    const [tcpCheck, pingCheck] = await Promise.allSettled([
      isTCPPortOpen(ip, 80, timeout),
      ping(ip, timeout)
    ]);

    const tcpAvailable = tcpCheck.status === 'fulfilled' && tcpCheck.value === true;
    const icmpAvailable = pingCheck.status === 'fulfilled' && pingCheck.value === true;

    if (tcpAvailable || icmpAvailable) {
      console.log(`✓ Хост ${ip} доступен (TCP: ${tcpAvailable}, ICMP: ${icmpAvailable})`);
      return true;
    }

    console.log(`✗ Хост ${ip} недоступен`);
    return false;
    
  } catch (error) {
    console.error(`Ошибка при проверке доступности ${ip}:`, error.message);
    return false;
  }
}

//! ДОСТУПНОСТЬ НА ОСНОВЕ NMAP - не используется
/**
 * Проверка доступности хоста через nmap
 * @param {string} ip - IP адрес для проверки
 * @param {number} timeout - Таймаут в секундах
 * @returns {Promise<boolean>} - true если хост доступен
 */
export async function checkReachabilityWithNmap(ip, timeout = 5) {
  try {
    // Быстрая проверка доступности через nmap
    // -sn: только проверка доступности (no port scan)
    // -PE: использовать ICMP echo
    // -PS80: TCP SYN на порт 80
    // -PA443: TCP ACK на порт 443
    // -PU53: UDP на порт 53 (DNS)
    const command = `nmap -sn -PE -PS80,443 -PA80,443 -PU53 --max-retries 1 --host-timeout ${timeout}s ${ip}`;
    
    const { stdout } = await execAsync(command, { timeout: (timeout + 2) * 1000 });
    
    // Анализируем вывод nmap
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      // Хост доступен если есть "Host is up"
      if (line.includes('Host is up')) {
        console.log(`✓ Nmap: хост ${ip} доступен`);
        return true;
      }
      
      // Хост недоступен если есть "Host seems down"
      if (line.includes('Host seems down') || line.includes('0 hosts up')) {
        console.log(`✗ Nmap: хост ${ip} недоступен`);
        return false;
      }
    }
    
    console.log(`? Nmap: статус хоста ${ip} неопределенный`);
    return false;
    
  } catch (error) {
    console.error(`Ошибка nmap при проверке доступности ${ip}:`, error.message);
    return false;
  }
}

/**
 * Улучшенная проверка доступности с fallback на старые методы
 */
export async function checkReachabilityEnhanced(ip, timeout = 2000) {
  try {
    // Сначала пробуем nmap
    const nmapReachable = await checkReachabilityWithNmap(ip, Math.ceil(timeout / 1000));
    
    if (nmapReachable) {
      return true;
    }
    
    // Если nmap не дал результата, пробуем старые методы как fallback
    const [tcpSuccess, icmpSuccess] = await Promise.allSettled([
      isTCPPortOpen(ip, 443, timeout), // Добавляем проверку порта 443
      ping(ip, timeout)
    ]);
    
    const tcpAvailable = tcpSuccess.status === 'fulfilled' && tcpSuccess.value;
    const icmpAvailable = icmpSuccess.status === 'fulfilled' && icmpSuccess.value;
    
    return tcpAvailable || icmpAvailable;
    
  } catch (error) {
    console.error(`Ошибка при проверке доступности ${ip}:`, error.message);
    return false;
  }
}

/************** */

//! РАБОЧИЙ КОД
// import { createConnection } from 'net';
// import { exec } from 'child_process';
// import { promisify } from 'util';

// const execAsync = promisify(exec);

// export async function ping(ip, timeout = 1000) {
//   try {
//     const isWindows = process.platform === 'win32';
//     const countFlag = isWindows ? '-n' : '-c';
//     const timeoutFlag = isWindows ? '-w' : '-W';
//     const timeoutValue = isWindows ? timeout : Math.ceil(timeout / 1000);

//     const command = `ping ${countFlag} 1 ${timeoutFlag} ${timeoutValue} ${ip}`;
    
//     const { stdout } = await execAsync(command, { timeout: timeout + 500 });
    
//     return stdout.includes('TTL=') || 
//            stdout.includes('ttl=') || 
//            stdout.includes('bytes from') ||
//            (isWindows && stdout.includes('Received = 1'));
//   } catch (error) {
//     return false;
//   }
// }

// export function isTCPPortOpen(ip, port = 80, timeout = 1000) {
//   return new Promise((resolve) => {
//     const socket = createConnection({ host: ip, port, timeout });
    
//     socket.on('connect', () => {
//       socket.destroy();
//       resolve(true);
//     });
    
//     socket.on('error', () => {
//       socket.destroy();
//       resolve(false);
//     });
    
//     socket.on('timeout', () => {
//       socket.destroy();
//       resolve(false);
//     });
//   });
// }

// export async function checkReachability(ip, timeout = 1000) {
//   try {
//     // Сначала проверяем TCP (быстрее для веб-серверов)
//     const tcpSuccess = await isTCPPortOpen(ip, 80, timeout);
//     if (tcpSuccess) {
//       console.log(`Хост ${ip} доступен по TCP порту 80`);
//       return true;
//     }

//     // Затем проверяем ICMP
//     const icmpSuccess = await ping(ip, timeout);
//     if (icmpSuccess) {
//       console.log(`Хост ${ip} доступен по ICMP (ping)`);
//       return true;
//     }

//     console.log(`Хост ${ip} недоступен`);
//     return false;
    
//   } catch (error) {
//     console.error(`Ошибка при проверке доступности ${ip}:`, error.message);
//     return false;
//   }
// }
