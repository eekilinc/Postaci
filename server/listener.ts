import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export function boundPort(server: Server): number {
  const address = server.address();
  return address && typeof address !== 'string' ? address.port : 0;
}

export function listenLoopback(server: Server, port: number, timeoutMs = 15000): Promise<{ port: number; origin: string }> {
  return new Promise((resolve, reject) => {
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      reject(new Error('Geçersiz yerel sunucu portu.'));
      return;
    }
    const timer = setTimeout(() => {
      server.close();
      fail(new Error('Yerel sunucu zamanında dinlemeye başlayamadı.'));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      server.removeListener('error', fail);
      server.removeListener('listening', ready);
    };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const ready = () => {
      cleanup();
      const address = server.address() as AddressInfo;
      resolve({ port: address.port, origin: 'http://127.0.0.1:' + address.port });
    };
    server.once('error', fail);
    server.once('listening', ready);
    try { server.listen({ port, host: '127.0.0.1', exclusive: true }); }
    catch (error) { fail(error as Error); }
  });
}
