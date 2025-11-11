// Импортируем только те функции, которые нужны
import { isLocalIp } from './ipUtils.js';
import { scanPortsSimple, scanVersionDetection } from './portScanner.js';
import { checkReachability } from './ping.js';
import { WhoisClient } from './whoisClient.js';

// Экспортируем только нужные функции
export { isLocalIp, scanPortsSimple, scanVersionDetection, checkReachability, WhoisClient };

// import { isReachable } from './ping.js';
// import { WhoisClient } from './whoisClient.js';
// import { isLocalIp } from './ipUtils.js';

// export { isReachable, isLocalIp, WhoisClient };