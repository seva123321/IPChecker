
import { createConnection } from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Функция для проверки ICMP (ping)
export async function ping(ip, timeout = 1000) {
  try {
    // Для Windows:
    const command = `ping -n 1 -w ${timeout} ${ip}`;
    // Для Linux/macOS:
    // const command = `ping -c 1 -W ${timeout/1000} ${ip}`;

    const { stdout, stderr } = await execAsync(command, { timeout: timeout + 500 });
    if (stdout.includes('TTL=') || stdout.includes('bytes from')) {
      return true;
    } else {
      if (stderr && (stderr.includes('Request timed out') || stderr.includes('Destination host unreachable'))) {
        return false;
      }
      return stdout.includes('TTL=') || stdout.includes('bytes from');
    }
  } catch (error) {
    return false;
  }
}

// Функция для проверки TCP порта
export function isTCPPortOpen(ip, port = 80, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: ip, port, timeout });
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// Основная функция проверки доступности: ICMP -> TCP
export async function checkReachability(ip, timeout = 1000) {
  try {
    const icmpSuccess = await ping(ip, timeout);
    if (icmpSuccess) {
      // console.log(`Хост ${ip} доступен по ICMP (ping)`);
      return true;
    } else {
      // console.log(`Хост ${ip} недоступен по ICMP (ping), проверяем TCP порт 80`);
      const tcpSuccess = await isTCPPortOpen(ip, 80, timeout);
      if (tcpSuccess) {
        // console.log(`Хост ${ip} доступен по TCP порту 80`);
        return true;
      } else {
        // console.log(`Хост ${ip} недоступен ни по ICMP, ни по TCP порту 80`);
        return false;
      }
    }
  } catch (error) {
    // console.error(`Ошибка при проверке доступности ${ip}:`, error.message);
    try {
      const tcpSuccess = await isTCPPortOpen(ip, 80, timeout);
      if (tcpSuccess) {
        // console.log(`Хост ${ip} доступен по TCP порту 80 (ошибка ICMP)`);
        return true;
      } else {
        // console.log(`Хост ${ip} недоступен по TCP порту 80 (ошибка ICMP и TCP)`);
        return false;
      }
    } catch (tcpError) {
      // console.error(`Ошибка при проверке TCP порта ${ip}:`, tcpError.message);
      return false;
    }
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