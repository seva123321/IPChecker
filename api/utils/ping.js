import { createConnection } from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function ping(ip, timeout = 1000) {
  try {
    const isWindows = process.platform === 'win32';
    const countFlag = isWindows ? '-n' : '-c';
    const timeoutFlag = isWindows ? '-w' : '-W';
    const timeoutValue = isWindows ? timeout : Math.ceil(timeout / 1000);

    const command = `ping ${countFlag} 1 ${timeoutFlag} ${timeoutValue} ${ip}`;
    
    const { stdout } = await execAsync(command, { timeout: timeout + 500 });
    
    return stdout.includes('TTL=') || 
           stdout.includes('ttl=') || 
           stdout.includes('bytes from') ||
           (isWindows && stdout.includes('Received = 1'));
  } catch (error) {
    return false;
  }
}

export function isTCPPortOpen(ip, port = 80, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: ip, port, timeout });
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function checkReachability(ip, timeout = 1000) {
  try {
    // Сначала проверяем TCP (быстрее для веб-серверов)
    const tcpSuccess = await isTCPPortOpen(ip, 80, timeout);
    if (tcpSuccess) {
      console.log(`Хост ${ip} доступен по TCP порту 80`);
      return true;
    }

    // Затем проверяем ICMP
    const icmpSuccess = await ping(ip, timeout);
    if (icmpSuccess) {
      console.log(`Хост ${ip} доступен по ICMP (ping)`);
      return true;
    }

    console.log(`Хост ${ip} недоступен`);
    return false;
    
  } catch (error) {
    console.error(`Ошибка при проверке доступности ${ip}:`, error.message);
    return false;
  }
}
// import { createConnection } from 'net';

// export function isReachable(ip, port = 80, timeout = 1000) {
//   return new Promise((resolve) => {
//     const socket = createConnection({ host: ip, port, timeout });
//     socket.on('connect', () => {
//       socket.destroy();
//       resolve(true);
//     });
//     socket.on('error', () => resolve(false));
//     socket.on('timeout', () => {
//       socket.destroy();
//       resolve(false);
//     });
//   });
// }