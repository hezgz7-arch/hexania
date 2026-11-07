# Hexania

Juego de colonización en tablero hexagonal: **la tablet es el tablero compartido y los móviles son los mandos privados** (la mano de cada uno). De 3 a 6 jugadores, con bots opcionales.

## Probarlo en 1 minuto (Windows)

1. Instala [Node.js 20 o superior](https://nodejs.org) (versión LTS).
2. Abre PowerShell en esta carpeta y ejecuta:
   ```powershell
   corepack enable
   pnpm install
   pnpm demo
   ```
3. Se imprimen dos direcciones: abre la del **Tablero** en el navegador y la de **Tu móvil** en el teléfono. Hay 3 bots y un asiento libre para ti.

## Opción A (recomendada): jugar desde internet

Así tablet y móviles se conectan desde cualquier red, sin configurar nada en casa. Necesitas una cuenta gratuita en [Fly.io](https://fly.io) (o [Render](https://render.com), que usa el mismo `Dockerfile`).

```powershell
winget install flyctl
fly auth login
fly launch --no-deploy --copy-config      # acepta el nombre o elige otro
fly volumes create hexania_data --size 1
fly secrets set PUBLIC_URL=https://TU-APP.fly.dev
fly deploy
```

- El servidor gratuito se duerme si nadie juega: la primera vez verás «Despertando servidor…» (hasta un minuto). No cierres la página.
- En la tablet abre `https://TU-APP.fly.dev/board`. Aparece un código QR: cada jugador lo escanea con su móvil y escribe su nombre.

## Opción B: en casa, sin internet (red local)

Todos los dispositivos deben estar en el mismo wifi.

```powershell
pnpm install
pnpm start
```

El programa detecta tu IP local y la muestra (por ejemplo `http://192.168.1.20:3000`). Si tu PC tiene varias redes (wifi, VPN, Docker…), te lista las interfaces para que elijas la correcta.

1. En la tablet abre `http://TU-IP:3000/board`.
2. Escanea el QR con cada móvil.
3. Si Windows pregunta por el firewall, permite el acceso en **redes privadas**.

## Cómo se juega

- **Tablet**: se ve el tablero, los puntos y el registro. El anfitrión (quien creó la sala) empieza la partida, pausa, deshace la última construcción, expulsa jugadores y activa un tiempo límite por turno.
- **Móvil**: tus cartas, el botón de tirar dados (también agitando el móvil), construir, comerciar (banco, puertos y otros jugadores con ofertas y contraofertas) y jugar cartas de desarrollo. El móvil vibra cuando es tu turno.
- Si recargas la página o se corta la conexión, vuelves a tu asiento automáticamente.
- Con 5 o 6 jugadores se usa el tablero ampliado y hay una fase de construcción especial entre turnos.

## Para desarrolladores

```powershell
pnpm test            # motor (reglas, 1000 partidas de bots) y servidor (4 clientes)
pnpm dev             # servidor con recarga; en otra terminal: pnpm --filter @hexania/web dev
pnpm e2e             # prueba de navegador con Playwright (primera vez: pnpm exec playwright install chromium)
```

- `packages/engine`: reglas puras y deterministas (RNG con semilla).
- `apps/server`: Fastify + Socket.IO, persistencia JSON, token de reconexión.
- `apps/web`: React + Vite, tablero SVG, PWA.

Las decisiones de reglas y diseño están en [DECISIONS.md](DECISIONS.md).
