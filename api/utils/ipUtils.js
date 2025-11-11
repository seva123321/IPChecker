import ipLib from 'ip';

export function isLocalIp(ip) {
  return ipLib.isPrivate(ip) || ipLib.isLoopback(ip);
}