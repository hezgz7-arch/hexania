# Hexania — Prompt para Claude Code

Nov 7, 2026 · @Heber López

## 0. Cómo usar este documento

Exporta este documento a Markdown, guárdalo en la raíz de una carpeta vacía como `SPEC.md` y abre Claude Code en esa carpeta. Primer mensaje: *"Lee SPEC.md entero y constrúyelo siguiendo las fases del apartado 7, de principio a fin"*. Todo lo que viene a partir de aquí está escrito para Claude Code.

## 1. Tu misión

Eres el desarrollador principal de **Hexania**, un juego de mesa digital de colonización sobre tablero hexagonal. Se juega en grupo, en la misma habitación: una **tablet hace de tablero compartido** y cada jugador usa su **móvil como mando privado**. Es un proyecto privado para un grupo de amigos; no se publicará en tiendas.

Reglas de trabajo:

- **Construye todo de un tirón**, fase a fase, sin hacerme preguntas intermedias. Cuando algo sea ambiguo, toma la decisión más razonable, apúntala en `DECISIONS.md` y sigue.
- **Las reglas del juego son innegociables**: deben ser exactamente las del apartado 4 (y 5 para 5-6 jugadores). Ante cualquier duda de reglas, aplica el criterio del reglamento oficial de la edición base del juego clásico de colonización en hexágonos y de su ampliación para 5-6 jugadores, y anótalo en `DECISIONS.md`.
- Haz un commit de git al terminar cada fase, con los tests en verde.
- Trabajo en **Windows**: todos los scripts deben funcionar en Windows, macOS y Linux (nada de comandos solo-bash en `package.json`).
- Interfaz y textos del juego en **español**. Código, nombres de variables y comentarios en inglés.

## 2. Identidad visual (original)

La estética debe sentirse como un **juego de mesa clásico de madera y cartón**: cálida, táctil y muy legible a distancia. Todo el arte es **original y generado por código** (SVG/CSS). No uses logos, ilustraciones, nombres comerciales ni tipografías de ningún juego comercial existente.

- **Mar y marco:** fondo de agua azul con oleaje sutil animado y un marco de madera clara alrededor de la isla.
- **Hexágonos de terreno**, cada uno con un paisaje ilustrado en estilo plano y un color dominante: bosque (madera, verde oscuro, árboles), pasto (lana, verde claro, ovejas), cultivo (trigo, dorado, surcos), colinas (arcilla, terracota, ladrillos), montañas (mineral, gris azulado, picos) y desierto (arena, dunas).
- **Fichas de número:** discos color crema con el número grande y, debajo, puntos que indican su probabilidad (2 y 12 = 1 punto; 6 y 8 = 5 puntos). El 6 y el 8 van en rojo para destacarlos.
- **Piezas de jugador** con aspecto de madera pintada: carretera = barra, poblado = casita, ciudad = casa con torre. Colores: rojo, azul, blanco, naranja, verde y marrón (estos dos últimos para 5-6 jugadores).
- **Ladrón:** figura oscura con sombra, que se desplaza con animación.
- **Puertos:** barco o muelle en la costa, con la proporción (3:1 o 2:1) y el icono del recurso.
- **Cartas de recurso y de desarrollo:** diseño propio, con un icono grande del recurso y un marco de color. Cada recurso tiene **icono + color** (accesible para daltónicos).
- **Tipografía:** fuentes con licencia libre incluidas dentro del propio proyecto (paquetes @fontsource o archivos .woff2 locales), nunca cargadas desde internet. Títulos en una serif con carácter (p. ej. *Alegreya SC*) y texto en *Inter*.
- **Sonidos** sintetizados con la Web Audio API (dados, construir, robo, victoria), con botón de silencio. Nada de audio externo.

## 3. Stack y arquitectura

El stack es una web app en TypeScript con un servidor autoritativo: nadie instala nada, todos entran escaneando un QR.

- **Monorepo** con pnpm workspaces, TypeScript estricto, Node 20+.
- **Motor de reglas** (`packages/engine`): TypeScript puro, sin dependencias de red ni de UI, determinista, con RNG con semilla.
- **Servidor** (`apps/server`): Fastify + Socket.IO. Gestiona salas, valida cada acción con el motor y difunde el estado. También sirve los clientes ya compilados.
- **Clientes** (`apps/web`): React + Vite, una única app con dos rutas: `/board/:room` (tablet) y `/play/:room` (móvil). Tablero en SVG con animaciones (Framer Motion o CSS). PWA instalable, pantalla completa y Wake Lock para que no se apague la pantalla.
- **Tests:** Vitest para el motor y Playwright para un flujo end-to-end básico.

```
hexania/
  packages/engine/   # reglas, estado, acciones, generación de tablero
  apps/server/       # salas, sockets, persistencia
  apps/web/          # /board (tablet) y /play (móvil)
  SPEC.md  DECISIONS.md  README.md
```

**Principios de arquitectura:**

1. **El servidor es la única fuente de verdad.** Los clientes nunca modifican el estado: envían una acción (`{type: "BUILD_ROAD", edgeId}`) y el servidor la valida con el motor.
2. **API del motor:** `createGame(config, seed)`, `getLegalActions(state, playerId)`, `applyAction(state, action) → {state, events}` (lanza un error tipado si la acción es ilegal) y `getPlayerView(state, playerId)`.
3. **Información oculta:** cada móvil recibe solo su vista. La mano y las cartas de desarrollo de los demás aparecen como recuentos. La tablet recibe la vista pública. Los puntos de victoria ocultos solo se ven en el móvil de su dueño.
4. **Eventos para animaciones:** cada `applyAction` devuelve eventos (`DICE_ROLLED`, `RESOURCES_PRODUCED`, `ROBBER_MOVED`, `CARD_STOLEN`…) que la tablet anima en orden.
5. **Geometría:** coordenadas axiales para hexágonos, con vértices (intersecciones) y aristas (caminos) con IDs estables y tablas de adyacencia precalculadas.
6. **Persistencia:** guarda el estado en SQLite (o JSON) tras cada acción, para que si el servidor se reinicia la partida continúe.
7. **Reconexión:** cada jugador recibe un token que se guarda en su navegador. Al recargar o perder la red, vuelve a su asiento con su mano intacta. Si se recarga la tablet, recupera el tablero completo.

**Despliegue: la nube es el modo principal.** Cada jugador se conecta con su propia conexión (datos móviles o cualquier WiFi), sin necesidad de compartir red. Los dos modos van documentados en el README:

- **Modo nube (principal):** `Dockerfile` listo para Fly.io o Render, servido con HTTPS (necesario para la PWA y Wake Lock en móviles).
  - La variable `PUBLIC_URL` define la dirección pública, y en modo nube el QR y los enlaces de la tablet la usan siempre.
  - Si el plan del hosting duerme la instancia por inactividad, muestra una pantalla de *"Despertando servidor…"* mientras arranca, y mantenla activa mientras haya una partida en curso.
  - Reconexión automática de Socket.IO preparada para cortes y cambios de red de los datos móviles (por ejemplo, al pasar de WiFi a 4G en mitad de la partida).
- **Modo casa (alternativa, misma WiFi):** `pnpm start` en un PC; el servidor detecta la IP local del PC en la red y el QR apunta a ella (si hay varias interfaces de red, muestra un selector). Debe funcionar al 100 % sin internet: basta una red WiFi compartida aunque no tenga salida a internet, como el router de casa o el punto de acceso de un móvil. Por eso la app no carga nada externo en tiempo de ejecución: fuentes, iconos, sonidos y librerías van incluidos en el build.

## 4. Reglas completas (3-4 jugadores)

Implementa exactamente estas reglas. Cada una necesita al menos un test.

### 4.1 Componentes

| Elemento | Cantidad |
| --- | --- |
| Hexágonos de terreno | 19: 4 bosque (madera), 4 pasto (lana), 4 cultivo (trigo), 3 colinas (arcilla), 3 montañas (mineral), 1 desierto |
| Fichas de número | 18: 2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12 (no hay 7) |
| Puertos | 9: 4 genéricos (3:1) y 5 específicos (2:1), uno por recurso |
| Cartas de recurso (banca) | 19 de cada recurso (95) |
| Cartas de desarrollo | 25: 14 caballeros, 5 de punto de victoria, 2 de construcción de carreteras, 2 de año de abundancia, 2 de monopolio |
| Piezas por jugador | 15 carreteras, 5 poblados, 4 ciudades |
| Cartas especiales | Camino más largo (2 PV) y Gran ejército (2 PV) |

### 4.2 Preparación del tablero

- La isla tiene forma hexagonal en filas de 3-4-5-4-3. Los terrenos se reparten al azar.
- Hay dos modos de colocar los números, configurables en el lobby:
  - **Espiral (por defecto):** fichas en este orden, empezando en un hexágono de esquina y avanzando en espiral hacia el centro, saltando el desierto: 5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11.
  - **Aleatorio equilibrado:** al azar, pero con la condición de que ningún 6 u 8 quede adyacente a otro 6 u 8.
- Los 9 puertos van repartidos por la costa en posiciones fijas y su tipo se asigna al azar. Cada puerto toca 2 intersecciones.
- El ladrón empieza en el desierto.

### 4.3 Colocación inicial

1. Se tiran dos dados para decidir quién empieza; si hay empate en la tirada más alta, se repite entre los empatados.
2. **Ronda 1**, en sentido horario: cada jugador coloca 1 poblado y 1 carretera adyacente a él.
3. **Ronda 2**, en orden inverso (el último en colocar en la ronda 1 coloca primero): otro poblado y otra carretera adyacente a él.
4. El segundo poblado da 1 recurso de cada hexágono adyacente (el desierto no da nada).
5. **Regla de distancia** (siempre, también aquí): no se puede construir un poblado en una intersección adyacente a otro poblado o ciudad, de nadie. Los poblados iniciales no necesitan estar conectados a una carretera previa.

### 4.4 Turno

1. **Tirar dados** (2d6). Antes de tirar, el jugador puede jugar un caballero.
2. **Producción:** cada hexágono con el número que ha salido da 1 recurso por cada poblado adyacente y 2 por cada ciudad adyacente. El hexágono con el ladrón no produce.
   - **Escasez de la banca:** si la banca no tiene suficientes cartas de un recurso para pagar a todos, nadie recibe ese recurso. Excepción: si solo un jugador debe recibirlo, se le da lo que quede.
3. **Comerciar y construir**, en cualquier orden y tantas veces como quiera.
4. **Terminar turno.**

### 4.5 Comercio

- **Entre jugadores:** solo con el jugador activo; los demás no pueden comerciar entre sí. No se pueden regalar cartas, ni cambiar un recurso por el mismo recurso, ni intercambiar cartas de desarrollo.
- **Marítimo:** 4:1 con la banca siempre; 3:1 si tienes un poblado o ciudad en un puerto genérico; 2:1 del recurso concreto si estás en su puerto específico.

### 4.6 Construcción

| Construcción | Coste | Condiciones |
| --- | --- | --- |
| Carretera | 1 madera + 1 arcilla | Conectada a una carretera, poblado o ciudad propios. No puede continuar a través de un poblado o ciudad rival |
| Poblado | 1 madera + 1 arcilla + 1 lana + 1 trigo | Conectado a una carretera propia y cumpliendo la regla de distancia |
| Ciudad | 2 trigo + 3 mineral | Sustituye a un poblado propio, cuya pieza vuelve al jugador |
| Carta de desarrollo | 1 lana + 1 trigo + 1 mineral | Se roba del mazo; si el mazo está vacío, no se puede comprar |

No se puede construir si no quedan piezas de ese tipo.

### 4.7 Sale un 7

1. Nadie produce.
2. Cada jugador con **más de 7 cartas** de recurso descarta la mitad, redondeando hacia abajo, y elige cuáles. Todos descartan a la vez; se espera a que acaben.
3. El jugador activo **debe** mover el ladrón a otro hexágono (puede ser el desierto).
4. Roba 1 carta al azar a un jugador, elegido por él, que tenga un poblado o ciudad adyacente a ese hexágono y al menos 1 carta. Si nadie cumple la condición, no hay robo.

### 4.8 Cartas de desarrollo

- **Caballero:** mueve el ladrón y roba igual que con un 7, pero sin descartes. Queda boca arriba y cuenta para el Gran ejército.
- **Construcción de carreteras:** coloca 2 carreteras gratis (o las que te queden).
- **Año de abundancia:** toma 2 recursos cualesquiera de la banca (según disponibilidad).
- **Monopolio:** nombra un recurso; todos los demás te dan todas sus cartas de ese recurso.
- **Punto de victoria:** 1 PV oculto. No se "juega": cuenta automáticamente y se revela al ganar.
- Restricciones: **máximo 1 carta de desarrollo jugada por turno**; solo en tu turno (también antes de tirar); nunca la que has comprado en ese mismo turno. Excepción: los PV ocultos cuentan desde el momento en que los compras.

### 4.9 Camino más largo y Gran ejército

- **Camino más largo:** el primero en tener una ruta continua de **5 o más** tramos se lleva la carta (2 PV). Solo cuenta la ruta más larga sin repetir tramos (las ramas no suman). Otro jugador solo la quita **superándola**; un empate no basta.
  - Un poblado o ciudad rival construido en mitad de una carretera **la corta**. Tras el corte se recalcula: si un único jugador tiene el camino más largo (de 5 o más), se la queda. Si hay empate en el máximo o nadie llega a 5, la carta queda sin dueño hasta que alguien lo tenga en solitario. Verifica este caso con el almanaque oficial y documéntalo.
  - El algoritmo es una búsqueda en profundidad sobre el grafo de aristas propias, que no puede atravesar vértices ocupados por rivales.
- **Gran ejército:** el primero en jugar **3 caballeros** se lleva la carta (2 PV). Otro jugador solo la quita superando su número de caballeros.

### 4.10 Victoria

- PV: poblado = 1, ciudad = 2, Camino más largo = 2, Gran ejército = 2, carta de PV = 1.
- Gana quien llega a **10 PV durante su propio turno**, en el momento exacto en que ocurre. Si llegas a 10 en el turno de otro, ganas al comenzar el tuyo, en cuanto se compruebe la victoria.

## 5. Ampliación para 5-6 jugadores

Es un modo opcional que se elige en el lobby. Se activa automáticamente al haber 5 o 6 jugadores; con 3-4 se usa el tablero base. Todas las reglas del apartado 4 se mantienen, con estos cambios:

| Elemento | 5-6 jugadores |
| --- | --- |
| Hexágonos de terreno | 30 en filas de 3-4-5-6-5-4-3: 6 bosque, 6 pasto, 6 cultivo, 5 colinas, 5 montañas, 2 desiertos |
| Fichas de número | 28: dos 2, tres de cada número del 3 al 11 (sin 7) y dos 12 |
| Puertos | 11: 5 genéricos (3:1) y 6 específicos (2:1), con 2 de lana |
| Cartas de recurso (banca) | 24 de cada recurso |
| Cartas de desarrollo | 34: 20 caballeros, 5 de punto de victoria, 3 de construcción de carreteras, 3 de año de abundancia, 3 de monopolio |
| Colores extra | Verde y marrón |

- **Números:** en 5-6 usa siempre el modo *aleatorio equilibrado* (ningún 6 u 8 adyacente a otro 6 u 8). Ningún desierto lleva ficha y el ladrón empieza en uno de ellos.
- **Fase especial de construcción:** al terminar el turno de cada jugador, los demás, uno a uno en orden horario, pueden construir y comprar cartas de desarrollo, pero **no** pueden comerciar (ni con jugadores ni con la banca o puertos) ni jugar cartas de desarrollo. Respeta este orden secuencial del reglamento: cada jugador ve lo que han construido los anteriores. En su móvil aparece *"Tu fase de construcción"* con un botón grande de **Pasar**, y quien no pueda pagar nada pasa automáticamente para no frenar la partida.
- Un jugador que llega a 10 PV en la fase especial de otro no gana hasta su propio turno (apartado 4.10).

## 6. Experiencia de juego

La tablet es para **mirar** y el móvil es para **decidir**: ninguna acción se hace tocando la tablet, salvo los controles del anfitrión.

### 6.1 Lobby

1. La tablet abre `/board/new`, crea una sala y muestra un **QR grande** y un código de 4 letras. El QR apunta a la dirección del modo activo: la URL pública en modo nube o la IP local del PC en modo casa.
2. Cada móvil escanea el QR, escribe su nombre y elige un color libre.
3. En la tablet se ven los jugadores conectados y la configuración: modo de números, número de jugadores (3-6), temporizador de turno (desactivado por defecto) y sonido.
4. El primer jugador en unirse es el **anfitrión** y tiene en su móvil el botón *Empezar partida*.

### 6.2 Tablet (tablero)

- Orientación horizontal, con el tablero centrado y lo más grande posible.
- Alrededor, un **panel por jugador** con: color, nombre, PV públicos, número de cartas en mano, cartas de desarrollo sin jugar, caballeros jugados, longitud de su camino más largo, y si tiene las cartas de Camino más largo o Gran ejército. El jugador activo se resalta con un brillo.
- **Animaciones:** tirada de dados en 3D o 2D animada; cartas que vuelan desde los hexágonos productores hasta el panel de cada jugador; piezas que aparecen con un pequeño rebote; ladrón que se desliza; robo con una carta boca abajo viajando entre paneles.
- **Vista previa en tiempo real:** mientras un jugador elige dónde construir en su móvil, la tablet muestra una pieza fantasma semitransparente en esa posición.
- Un **banner de estado** grande, del tipo *"Turno de Lucía: tirando dados"*, *"Esperando descartes: Pablo (4), Ana (5)"* o *"Oferta de comercio abierta"*.
- Un **registro** discreto con las últimas 5-8 acciones.
- Las ofertas de comercio se muestran en grande en el centro mientras están abiertas.
- **Pantalla final:** ganador con animación, desglose de PV de cada jugador y estadísticas: histograma de tiradas de dados (real frente a esperado), recursos producidos y robados por jugador, y la mano más grande.

### 6.3 Móvil (mando privado)

- Diseño vertical, pensado para usar con una mano.
- **Arriba:** tus PV (incluidos los ocultos, marcados como tales), tu color y de quién es el turno.
- **Centro: tu mano**, con cartas de recurso agrupadas por tipo y un contador, y tus cartas de desarrollo (indicando las que no puedes jugar este turno).
- **Abajo: barra de acciones contextual.** Solo se habilitan las acciones legales según `getLegalActions`. Cada botón muestra su coste en iconos, y si está deshabilitado, al tocarlo dice por qué (*"Te falta 1 trigo"*).
- **Construir:** al pulsar *Carretera*, *Poblado* o *Ciudad* se abre un **minimapa del tablero** en el móvil, con zoom y desplazamiento, en el que solo se iluminan las posiciones legales. Se toca una posición, se ve la pieza fantasma (también en la tablet) y se confirma. Nada se aplica sin confirmar.
- **Tirar dados:** botón grande, y también agitando el móvil (opcional, con la API de movimiento).
- **Ladrón:** un minimapa para elegir el hexágono y después una lista de víctimas posibles, con su número de cartas.
- **Descartes por un 7:** pantalla obligatoria con selectores +/− y un contador del tipo *"Descarta 4 (te quedan 2 por elegir)"*.
- **Monopolio y año de abundancia:** selectores de recurso sencillos.
- **Comercio entre jugadores:**
  1. El jugador activo crea una oferta con selectores de *Doy* y *Pido*.
  2. La oferta llega a todos los demás, que pueden **Aceptar**, **Rechazar** o **Contraofertar**.
  3. El activo ve las respuestas y elige con quién cerrar el trato. El intercambio es atómico y lo valida el servidor.
  4. Los jugadores no activos también pueden enviar una propuesta al jugador activo.
- **Comercio marítimo:** el móvil calcula automáticamente tu mejor proporción por recurso (4:1, 3:1 o 2:1) y solo deja hacer cambios válidos.
- **Avisos:** vibración (`navigator.vibrate`) cuando empieza tu turno, cuando recibes recursos, cuando te roban y cuando te llega una oferta.

### 6.4 Robustez

- Si un móvil se desconecta, su panel en la tablet lo indica y la partida espera. El anfitrión puede **pausar**, **expulsar** o **reasignar** el asiento a otro móvil, que hereda la mano.
- Temporizador de turno opcional: al agotarse, el turno termina solo; los descartes pendientes se hacen al azar.
- No hay deshacer después de confirmar, salvo un botón del anfitrión para deshacer la última construcción (no tiradas ni robos), registrado en el log.

## 7. Fases de construcción y criterios de entrega

Avanza en este orden. Cada fase termina con sus tests en verde y un commit.

1. **Motor de reglas.** Todo el apartado 4 y el 5 en `packages/engine`, sin UI.
   - Tests unitarios de cada regla: regla de distancia, conexión de carreteras, producción con ciudades y ladrón, escasez de la banca, descartes, robo, cada carta de desarrollo, la restricción de comprar y jugar en el mismo turno, el camino más largo (ramas, ciclos, cortes, empates), el gran ejército, los puertos y la victoria solo en tu turno.
   - **Test de simulación:** bots que eligen acciones legales al azar juegan 1.000 partidas (de 3, 4, 5 y 6 jugadores) sin errores, sin estados inválidos (cartas negativas, más piezas de las existentes) y conservando el total de cartas entre banca y jugadores.
2. **Servidor y salas.** Crear sala, unirse con código, asientos con token, difusión de vistas por jugador, persistencia y reconexión. Test de integración con 4 clientes simulados.
3. **Tablet.** Tablero SVG con todo el arte original del apartado 2, paneles de jugador, banner, log, animaciones y QR.
4. **Móvil.** Mano, barra de acciones contextual, minimapa con posiciones legales, piezas fantasma, dados, ladrón, descartes y cartas de desarrollo.
5. **Comercio.** Primero el marítimo y después la negociación entre jugadores con ofertas, contraofertas y respuestas.
6. **5-6 jugadores.** Tablero ampliado y fase especial de construcción.
7. **Pulido.** Sonidos, vibración, pantalla final con estadísticas, controles del anfitrión, temporizador opcional, PWA y Wake Lock.
8. **Entrega.**
   - `README.md` en español con instrucciones paso a paso para un usuario de Windows: instalar Node y pnpm, ejecutar `pnpm install` y `pnpm start`, abrir la tablet y conectar los móviles. Explica primero, paso a paso, el despliegue en la nube (Docker en Fly.io o Render), que es la forma principal de jugar, y después el modo casa como alternativa.
   - `DECISIONS.md` con todas las decisiones tomadas.
   - **Modo demo:** `pnpm demo` arranca una partida con 3 bots y 1 asiento humano, para probar sin reunir al grupo.

**La partida está lista cuando:** 4 móviles y una tablet, cada uno con su propia conexión (datos móviles o WiFi distintas), juegan una partida completa de principio a fin sin recargar, todas las reglas se aplican automáticamente sin que nadie tenga que arbitrar, y si se recarga cualquier dispositivo, la partida continúa en el mismo punto. Además, la partida completa también funciona en modo casa con el router desconectado de internet.
