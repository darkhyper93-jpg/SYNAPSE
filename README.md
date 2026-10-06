# SYNAPSE

**El juego aprende cómo juegas y adapta los desafíos a ti.**

SYNAPSE es un videojuego web de desafíos cognitivos rápidos, variados y adaptativos. Usa una estética neón animada sobre fondo oscuro, con una red neuronal viva de fondo, y funciona en PC, tablet y móvil.

> SYNAPSE es un juego. Las puntuaciones reflejan el rendimiento dentro de las tareas de SYNAPSE: no es un test de CI, ni una herramienta médica, ni una medida clínica.

## Cómo jugar

No hay paso de compilación: es HTML, CSS y JavaScript (módulos ES). Solo hace falta servir la carpeta por HTTP:

```bash
npm start            # npx http-server -p 8080 -c-1 .
# o bien
python3 -m http.server 8080
```

Después abre <http://localhost:8080>.

- **JUGAR / PLAY**: empieza al instante una sesión del modo elegido.
- **Modos**: `RÁPIDA` (5 min), `ESTÁNDAR` (10 min), `DESAFÍO` (más difícil, con multiplicador de puntos), `DIARIO` (7 desafíos, iguales para todos ese día) y `PRÁCTICA` (un desafío concreto, desde el Perfil).
- Enlace directo para practicar o probar: `?practice=parallax&d=0.6`

## Desafíos (12)

| Desafío | Habilidad | Qué pide |
|---|---|---|
| ECHO | Memoria | Posición, símbolo, color, orden o cambio entre dos escenas |
| ONE SECOND | Percepción | Un tablero denso visto entre 1000 y 250 ms |
| TRACE | Percepción | Seguir una o varias esferas en movimiento (trayectorias precalculadas) |
| CONTRADICT | Lógica | Reglas numéricas, secuencias, patrones visuales y "¿qué par contradice la regla?" |
| SPARK | Reacción | Golpear las chispas cian sin tocar los señuelos rojos |
| FOCUS | Atención | Responder solo al objetivo; más adelante, con una regla de excepción y distractores orbitando |
| MIRROR | Espacial | Reflejos, rotaciones, intercambio de colores y combinaciones |
| PARALLAX | Espacial | Rotación mental 3D de policubos isométricos, con imágenes especulares como trampa |
| FLEX | Flexibilidad | Clasificar por color o por forma mientras la regla cambia |
| DECISION | Decisión | Contar, comparar y sumar bajo presión de tiempo |
| DUAL | Atención + memoria | Doble tarea (se desbloquea con ATENCIÓN ≥ 40) |
| NEXUS | Memoria + lógica | Desafío combinado (se desbloquea con MEMORIA y LÓGICA ≥ 40) |

## Sistemas

- **Dificultad adaptativa por habilidad** (`engine/difficultyManager.js`): valor de 0 a 1 que busca mantener la precisión en la zona del 70–90 %. Los cambios son suaves y acotados, con una fase de calibración inicial. La velocidad solo influye cuando además hay precisión.
- **Puntuación** (`engine/scoreSystem.js`): `base × dificultad × acierto × velocidad × racha`. Una respuesta incorrecta vale 0 aunque sea instantánea, y el factor de velocidad está limitado entre 0.85 y 1.25. Hay bonus por constancia y por sesión perfecta.
- **Fairness engine** (`engine/challengeGenerator.js` + `validate()` de cada desafío): cada desafío generado se valida antes de mostrarse. Se comprueba que tenga una única respuesta defendible, que no haya cubos ocultos ni opciones visualmente idénticas en 3D, que no haya simetrías en MIRROR, que los objetos de TRACE no se solapen al final y que no aparezcan elementos parecidos si la dificultad no lo permite.
- **Sesión** (`engine/sessionManager.js`): elige la habilidad (40 % general, 30 % fortalezas, 30 % puntos débiles, configurable) y evita repetir habilidad o tipo de desafío seguidos. La primera sesión empieza por memoria, percepción, lógica y reacción.
- **Anti-frustración**: tras 3 errores seguidos baja un poco la dificultad y presenta un desafío de una habilidad fuerte del jugador. El primer error tras un cambio de regla no rompe la racha.
- **Perfil**: radar de 8 habilidades, índice SYNAPSE, maestría (Principiante → Élite, que solo se gana demostrando rendimiento), evolución en gráficos, historial diario y récords.
- **Descanso**: con una sesión larga o muchas sesiones en el día se recomienda una pausa.
- **Accesibilidad**: reducir movimiento, fondo completo, suave o apagado, tamaño de texto, alto contraste, asistencia de color (etiquetas con letras), controles de teclado completos y sonido opcional.
- **Idiomas**: español e inglés (detección automática, cambiable en Ajustes).
- **Persistencia**: `localStorage` detrás de un adaptador (`game/storage.js`), preparado para añadir un backend sin tocar la lógica del juego. El Diario usa una semilla UTC común, lista para un futuro ranking global.

## Arquitectura

```
index.html
src/
  main.js                 arranque
  engine/                 challenge.js (interfaz común), challengeGenerator.js (registro + fairness),
                          difficultyManager.js, scoreSystem.js, sessionManager.js, daily.js
  challenges/             un archivo por desafío + common.js (tableros, opciones, símbolos)
  game/                   playerProfile.js, settings.js, storage.js, audio.js, i18n.js
  components/             ui.js (router, toasts, modales), background.js (red neuronal), charts.js
    screens/              home, play, results, profile, settings
  data/                   skills.js, visuals.js (formas y colores), strings.js (ES/EN)
  utils/                  rng.js (semillas), math.js, dom.js
  styles/                 main.css, challenges.css
tests/run.mjs             tests del motor (sin dependencias)
```

Cada desafío extiende `Challenge` e implementa `generate()` (puro, sin DOM y con semilla), `validate()` y `run()`. Para añadir un desafío nuevo basta con crear la clase, registrarla en `CHALLENGE_TYPES` y añadir sus textos. Se integra automáticamente con la dificultad, la puntuación, el perfil y la sesión.

## Tests

```bash
npm test
```

Comprueban que los 12 generadores producen desafíos válidos en todas las dificultades. También verifican la unicidad de respuestas en lógica y en 3D, la puntuación, que jugadores simulados de distintos niveles converjan a su zona de ~80 % de precisión, la variedad y la anti-frustración de la sesión, que el Diario sea determinista y la cobertura de traducciones.
