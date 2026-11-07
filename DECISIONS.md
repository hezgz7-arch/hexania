# Decisiones de diseño

Ambigüedades de la especificación y cómo las resolví. Las reglas (secciones 4 y 5) se respetan tal cual.

## Motor (fase 1)
- **Quién empieza**: cada jugador tira dos dados; gana la suma más alta y los empates se repiten solo entre los empatados. El ganador pasa a ser el asiento 0 y el orden de la mesa se rota a partir de él.
- **Orden de colocación inicial**: serpiente 1..n, n..1. Cada jugador pone poblado y carretera seguidos; el segundo poblado da 1 carta por hexágono adyacente (el desierto no da nada).
- **Escasez del banco**: si el banco no puede pagar a todos los que cobran un recurso, nadie cobra ese recurso, salvo que solo cobre un jugador: entonces recibe lo que quede.
- **Descarte con 7**: con más de 7 cartas se descarta la mitad redondeando hacia abajo; con exactamente 7 no se descarta. El juego espera a todos antes de mover el ladrón.
- **Ladrón**: debe moverse a otro hexágono. Si hay varios rivales adyacentes con cartas, el jugador elige a quién robar; sin víctimas no se roba.
- **Cartas de desarrollo**: una por turno, no se puede jugar la comprada en ese mismo turno (las de victoria cuentan al instante y son secretas). El caballero se puede jugar antes de tirar; las demás solo en fase principal.
- **Carretera más larga**: mínimo 5. Un poblado/ciudad rival rompe el camino. Si el poseedor pierde la carta y varios empatan en el máximo, la carta queda sin dueño; con un máximo único pasa a ese jugador. Empatar con el poseedor no basta para quitársela.
- **Ejército más grande**: mínimo 3 caballeros; hay que superar estrictamente al poseedor.
- **Victoria**: solo se comprueba en el turno propio. Si alguien llega a 10 PV fuera de su turno, gana al empezar su turno.
- **Intercambios entre jugadores**: solo en la fase principal del turno. El jugador activo abre una oferta (abierta) y los demás aceptan, rechazan o contraofertan; el activo confirma con quién cierra. Los jugadores no activos solo pueden negociar con el activo. Las ofertas se borran al acabar el turno.
- **Tablero 5-6**: 30 hexágonos (filas 3-4-5-6-5-4-3), 2 desiertos, 11 puertos, 24 cartas por recurso y 34 cartas de desarrollo. Las coordenadas axiales se desplazan medio hexágono para mantenerlas enteras.
- **Fase de construcción especial (5-6)**: tras cada turno, los demás en orden pueden construir o comprar (sin comerciar ni jugar cartas). Quien no puede hacer nada se salta automáticamente.
- **Números del tablero**: modo `spiral` (orden oficial, empieza en una esquina aleatoria) o `balanced` (6/8 nunca adyacentes).
- **Determinismo**: el RNG (mulberry32) vive dentro del estado serializable, así que cada partida es reproducible desde la semilla.

## Servidor y cliente (fases 2-8)
- **Servidor autoritativo**: el cliente solo envía intenciones; el servidor valida con el motor y reparte a cada móvil únicamente su vista (`getPlayerView`). El tablero recibe la vista pública (sin manos ni cartas ocultas).
- **Reconexión**: cada móvil guarda un token en `localStorage`; recargar la página devuelve el mismo asiento. Si se abre el asiento en otro dispositivo, el primero recibe «Sesión abierta en otro dispositivo».
- **Anfitrión**: quien crea la sala desde `/board` recibe un `hostToken` que se guarda en su navegador y se quita de la URL. Solo ese tablero puede empezar, pausar, deshacer, expulsar y cambiar opciones. Otros tableros de la misma sala solo miran.
- **Deshacer**: solo la última construcción del jugador activo, antes de tirar dados o robar carta de nuevo (el motor guarda una instantánea).
- **Temporizador**: opcional. Al agotarse, el servidor termina el turno con acciones por defecto (descarta automáticamente, mueve el ladrón sin robar).
- **Bots**: ocupan asientos como cualquier jugador y juegan con `chooseBotAction`; el anfitrión puede añadirlos o quitarlos en el vestíbulo. Los asientos expulsados quedan libres para que entre otra persona.
- **Persistencia**: JSON en `DATA_DIR`, una escritura atómica por sala; al reiniciar el servidor se recuperan las salas.
- **Modo nube y LAN**: mismo servidor. En LAN detecta la IP local, avisa si hay varias interfaces y usa esa dirección en el QR; en la nube se usa `PUBLIC_URL`.
- **Pantalla «Despertando servidor…»**: el cliente consulta `/api/health` hasta que responde antes de abrir el socket (planes gratuitos que duermen).
- **Elegir sitio en el móvil**: se toca cerca de un punto brillante y se confirma; la pieza se ve «fantasma» antes de construir, para evitar errores con el dedo.
- **Sonidos**: sintetizados con Web Audio (sin archivos). Vibración solo en móvil y solo en tu turno, al descartar y al recibir una oferta.
- **Iconos PWA**: un SVG propio (`icon.svg`); no se generan PNG para no añadir dependencias.
