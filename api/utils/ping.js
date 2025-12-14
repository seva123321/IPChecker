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
    // Параллельная проверка для скорости
    const [tcpSuccess, icmpSuccess] = await Promise.race([
      Promise.allSettled([
        isTCPPortOpen(ip, 80, timeout),
        ping(ip, timeout)
      ]),
      // Общий таймаут для всей операции
      new Promise(resolve => setTimeout(
        () => resolve([{status: 'rejected'}, {status: 'rejected'}]),
        timeout * 2
      ))
    ]);

    const tcpAvailable = tcpSuccess.status === 'fulfilled' && tcpSuccess.value;
    const icmpAvailable = icmpSuccess.status === 'fulfilled' && icmpSuccess.value;

    if (tcpAvailable) {
      console.log(`✓ Хост ${ip} доступен по TCP порту 80`);
      return true;
    }

    if (icmpAvailable) {
      console.log(`✓ Хост ${ip} доступен по ICMP (ping)`);
      return true;
    }

    console.log(`✗ Хост ${ip} недоступен`);
    return false;
    
  } catch (error) {
    console.error(`Ошибка при проверке доступности ${ip}:`, error.message);
    return false;
  }
}



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
