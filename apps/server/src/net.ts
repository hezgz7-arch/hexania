import { networkInterfaces } from 'node:os';

export interface LanAddress {
  name: string;
  address: string;
  /** 192.168.x.x, 10.x.x.x or 172.16-31.x.x */
  privateRange: boolean;
}

const isPrivate = (ip: string): boolean => {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b! >= 16 && b! <= 31);
};

/** IPv4 addresses of the local network interfaces, private ranges first. */
export function lanAddresses(): LanAddress[] {
  const out: LanAddress[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      if (i.address.startsWith('169.254.')) continue; // link-local: no DHCP
      out.push({ name, address: i.address, privateRange: isPrivate(i.address) });
    }
  }
  return out.sort((a, b) => Number(b.privateRange) - Number(a.privateRange));
}
