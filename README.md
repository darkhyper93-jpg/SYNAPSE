# SYNAPSE

**El juego aprende cómo juegas y adapta los desafíos a ti.**

SYNAPSE es un juego de desafíos cognitivos rápidos, variados y adaptativos, pensado para **Android (Google Play)**, móvil y tablet. También funciona en el navegador y como PWA. Usa una estética neón animada sobre fondo oscuro.

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

## Experiencia en el móvil

- **Pensado para tocar**: la pantalla de juego cabe siempre sin scroll, desde un móvil de 360×640 hasta una tablet. El contenido se reduce o se amplía automáticamente.
- **Animación e interactividad**:
  - Los botones tienen efecto de onda y vibración, y las pantallas cambian con un destello circular.
  - Cuenta atrás 3·2·1·GO y puntos que vuelan al marcador.
  - Combos (¡BIEN!, ¡GENIAL!, ¡IMPARABLE!…), llama de racha que crece con multiplicador, y de 1 a 3 estrellas por desafío.
  - Pantalla completa al subir de nivel o desbloquear un desafío, y nota final (S/A/B/C/D) con sello.
- **Repeticiones que enseñan**: MIRROR gira o voltea la figura hasta la respuesta, TRACE dibuja el recorrido real de las esferas, CONTRADICT voltea la carta con la solución y ECHO revela la escena completa.
- **Gestos**: en FLEX se desliza a izquierda o derecha y el símbolo sale volando.
- **Mini demo animada** de cada desafío en su tarjeta de presentación, y **tutorial inicial** deslizable de 4 pantallas (se puede volver a ver desde Ajustes).
- **Nativo**:
  - El botón atrás de Android pausa o reanuda la partida, cierra diálogos y vuelve al inicio. En el inicio hay que pulsarlo dos veces para salir.
  - La partida se pausa sola si la app pasa a segundo plano.
  - Vibración háptica (desactivable), barra de estado oscura, pantalla de carga e icono adaptativo (también monocromo para Android 13+).
- **Sin conexión**: las fuentes y todos los recursos van dentro de la app. Sin anuncios, sin cuentas y sin recogida de datos.
- **Gama baja**: en teléfonos modestos se reducen automáticamente los efectos más costosos.

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
- **Accesibilidad**: reducir movimiento, tamaño de texto, alto contraste, asistencia de color (etiquetas con letras), controles de teclado completos y sonido opcional.
- **Idiomas**: español e inglés (detección automática, cambiable en Ajustes).
- **Persistencia**: `localStorage` detrás de un adaptador (`game/storage.js`), preparado para añadir un backend sin tocar la lógica del juego. El Diario usa una semilla UTC común, lista para un futuro ranking global.

## Android y Google Play

El juego se empaqueta como app nativa con [Capacitor](https://capacitorjs.com) (`android/`). El código del juego no cambia: `npm run build` copia la web a `www/` y añade el runtime de Capacitor.

### Compilar el APK/AAB sin instalar nada: GitHub Actions

Cada *push* ejecuta `.github/workflows/android.yml`, que:

1. pasa los tests del motor;
2. genera un **APK de depuración** (artefacto `synapse-debug-apk`) para instalarlo directamente en un móvil;
3. si configuraste la firma (ver abajo), genera el **AAB firmado** para Google Play (artefacto `synapse-release-aab`).

Los artefactos se descargan en GitHub → *Actions* → la ejecución → *Artifacts*. El `versionCode` sale de la hora del commit (decenas de segundos desde 2026-01-01): siempre aumenta, como exige Play, y es el mismo si compilas ese commit en local o vuelves a ejecutar el workflow. La versión visible (`versionName`) es la de `package.json`; Ajustes muestra ambas.

El APK de depuración se firma siempre con la misma clave de prueba (`android/app/debug.keystore`, que no es secreta), así que cada versión nueva se instala encima de la anterior sin perder el progreso. El AAB de Google Play usa tu clave propia.

### Compilar en tu PC (Android Studio)

```bash
npm install
npm run android     # build + cap sync + abre Android Studio
```

Requisitos: Android Studio reciente (SDK 36) y JDK 21.

### Firma para Google Play (una sola vez)

1. Crea tu clave de subida y **guárdala bien**: sin ella no podrás publicar actualizaciones.
   ```bash
   keytool -genkey -v -keystore synapse-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias synapse
   base64 -w0 synapse-upload.jks > keystore.b64
   ```
2. En GitHub → *Settings → Secrets and variables → Actions*, crea estos secretos:
   - `ANDROID_KEYSTORE_BASE64`: el contenido de `keystore.b64`
   - `ANDROID_KEYSTORE_PASSWORD`: la contraseña del almacén
   - `ANDROID_KEY_ALIAS`: `synapse`
   - `ANDROID_KEY_PASSWORD`: la contraseña de la clave
3. Para firmar en local, crea en su lugar `android/keystore.properties`. Está ignorado por git.
   ```properties
   storeFile=/ruta/a/synapse-upload.jks
   storePassword=...
   keyAlias=synapse
   keyPassword=...
   ```

### Publicar en Google Play

1. Crea una cuenta de desarrollador en [Play Console](https://play.google.com/console) (pago único de 25 USD).
2. **Identificador de la app**: es `com.darkhyper93.synapse` (en `capacitor.config.json` y `android/app/build.gradle`). No se puede cambiar después de la primera publicación; si quieres otro, cámbialo antes de subir nada.
3. Crea la app y sube el `.aab` a **Pruebas internas**. Las cuentas personales nuevas deben hacer además una **prueba cerrada con al menos 12 testers durante 14 días** antes de publicar en producción.
4. Completa la ficha con lo que hay en `store/`:
   - `listing.md`: nombre, descripciones ES/EN, categoría y respuestas para "Seguridad de los datos";
   - `icon-512.png` y `feature-graphic-es.png` / `feature-graphic-en.png` (1024×500, uno por idioma de la ficha);
   - `screenshots/{es,en}/phone-*.png` (1080×1920) y `tablet-*.png` (1440×2560, 9:16 como pide Play para pantallas grandes).
5. **Política de privacidad**: Play pide una URL pública. Activa GitHub Pages (*Settings → Pages → Deploy from branch*, raíz). La política queda en `https://<usuario>.github.io/SYNAPSE/privacy.html`, y de paso el juego queda jugable como web/PWA en esa dirección. La misma política está dentro de la app, en *Ajustes → Política de privacidad*.

### Regenerar recursos gráficos

```bash
npm run icons                                              # iconos, splash, icono 512 y gráfico destacado
node scripts/store-screenshots.cjs http://localhost:8080 es # capturas de la tienda (con npm start corriendo)
```

Ambos usan Playwright y solo hacen falta para regenerar los gráficos.

## Arquitectura

```
index.html
src/
  main.js                 arranque
  engine/                 challenge.js (interfaz común), challengeGenerator.js (registro + fairness),
                          difficultyManager.js, scoreSystem.js, sessionManager.js, daily.js
  challenges/             un archivo por desafío + common.js (tableros, opciones, símbolos)
  game/                   playerProfile.js, settings.js, storage.js, audio.js, i18n.js,
                          haptics.js, platform.js (Capacitor/PWA: atrás, pausa, barra de estado)
  components/             ui.js (router, transiciones, botón atrás, ondas táctiles, modales),
                          charts.js, fx.js (puntos voladores, combos, cuenta atrás, celebraciones), demos.js
    screens/              onboarding, home, play, results, profile, settings
  data/                   skills.js, visuals.js (formas y colores), strings.js (ES/EN)
  utils/                  rng.js (semillas), math.js, dom.js
  styles/                 fonts.css (fuentes locales), main.css, challenges.css, fx.css
assets/                   fuentes (OFL) e iconos
android/                  proyecto nativo Capacitor
scripts/                  build-web.mjs, make-icons.cjs, store-screenshots.cjs, perf/ (mediciones de fluidez)
store/                    ficha de Play Store, icono, gráfico destacado y capturas
tests/run.mjs             tests del motor (sin dependencias)
```

Cada desafío extiende `Challenge` e implementa `generate()` (puro, sin DOM y con semilla), `validate()` y `run()`. Para añadir un desafío nuevo basta con crear la clase, registrarla en `CHALLENGE_TYPES` y añadir sus textos. Se integra automáticamente con la dificultad, la puntuación, el perfil y la sesión.

## Tests

```bash
npm test
```

Comprueban que los 12 generadores producen desafíos válidos en todas las dificultades. También verifican la unicidad de respuestas en lógica y en 3D, la puntuación, que jugadores simulados de distintos niveles converjan a su zona de ~80 % de precisión, la variedad y la anti-frustración de la sesión, que el Diario sea determinista y la cobertura de traducciones.

## Rendimiento

Las animaciones están hechas para que las mueva la GPU (solo `transform` y `opacity`): nada se vuelve a dibujar en cada fotograma, así que la app va fluida incluso en móviles modestos. Para medirlo (con `npm start` corriendo; simula un móvil de gama media con la CPU 4× más lenta):

```bash
node scripts/perf/measure.cjs http://localhost:8080 nombre 4   # fps, tirones y coste por pantalla → perf-nombre.json
node scripts/perf/repaints.cjs http://localhost:8080 '?nosw&hq&skipintro'   # qué se repinta continuamente
node scripts/perf/noncomposited.cjs http://localhost:8080   # animaciones que no puede mover la GPU
```

