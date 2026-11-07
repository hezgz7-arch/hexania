import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createHexaniaServer } from './server';
import { lanAddresses, type LanAddress } from './net';

const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const argValue = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const port = Number(argValue('--port') ?? process.env.PORT ?? 3000);
const dataDir = resolve(process.env.DATA_DIR ?? join(here, '..', '..', '..', 'data'));
const webDir = resolve(process.env.WEB_DIR ?? join(here, '..', '..', 'web', 'dist'));
const demo = args.has('--demo');

async function chooseAddress(list: LanAddress[]): Promise<LanAddress | null> {
  if (!list.length) return null;
  if (list.length === 1 || !process.stdin.isTTY) return list[0]!;
  console.log('\nHe encontrado varias conexiones de red. ¿Cuál usa tu Wi-Fi?\n');
  list.forEach((a, i) => console.log(`  ${i + 1}) ${a.address}  (${a.name})${a.privateRange ? '' : '  [no parece una red local]'}`));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (await rl.question(`\nEscribe el número [1]: `)).trim();
      if (!answer) return list[0]!;
      const n = Number(answer);
      if (Number.isInteger(n) && n >= 1 && n <= list.length) return list[n - 1]!;
      console.log('Número no válido.');
    }
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const cloudUrl = process.env.PUBLIC_URL?.replace(/\/+$/, '');
  let publicUrl: string;
  if (cloudUrl) publicUrl = cloudUrl;
  else {
    const chosen = await chooseAddress(lanAddresses());
    publicUrl = chosen ? `http://${chosen.address}:${port}` : `http://localhost:${port}`;
  }

  const server = await createHexaniaServer({ dataDir, publicUrl: () => publicUrl, webDir, logger: false });
  const actualPort = await server.listen(port);
  if (!cloudUrl && actualPort !== port) publicUrl = publicUrl.replace(`:${port}`, `:${actualPort}`);

  console.log('\n  Hexania está en marcha.\n');
  console.log(`  Modo:        ${cloudUrl ? 'nube' : 'red local (LAN)'}`);
  console.log(`  Dirección:   ${publicUrl}`);
  if (demo) {
    const room = server.createRoom({ demo: true });
    console.log(`\n  DEMO — sala ${room.code}: 3 bots y un asiento para ti.`);
    console.log(`  Tablero (tablet o PC): ${publicUrl}/board/${room.code}?host=${room.hostToken}`);
    console.log(`  Tu móvil:              ${publicUrl}/play/${room.code}`);
  } else {
    console.log(`\n  Abre ${publicUrl}/board en la tablet para crear una partida.`);
  }
  console.log('\n  Pulsa Ctrl+C para parar.\n');

  const stop = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
