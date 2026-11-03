# Rato al Sol

**¿En qué terraza tendré sol o sombra a la hora a la que quiero sentarme?**

Un mapa sencillo de terrazas con intervalos estimados de sol y sombra, un selector de hora y la incertidumbre visible donde cambie la decisión.

## Estado real

La web reúne el mapa 3D de Ayala y sombras orientativas. En `mobile/` hay un prototipo React Native para iOS y Android con búsqueda por nombre o cercanía, selector de hora, mapa y estimaciones para un punto exterior elegido. La vista web del prototipo comparte la interfaz y el motor solar; la web anterior permanece disponible.

Madrid aporta alturas estimadas municipales; en otras zonas la geometría y las alturas dependen de OpenStreetMap y pueden ser insuficientes. La fuente pública de búsqueda general no respondió en las pruebas de este entorno; se ha probado una alternativa con parques municipales y nombres del censo de Madrid, además de la selección manual de un punto. Las entradas de locales **no identifican las mesas** y la sombra de los árboles no está modelada. Ni las estimaciones ni las sombras se han contrastado sobre el terreno; faltan pruebas en dispositivos nativos y no hay despliegue.

## Orientación obligatoria

Leer [PROYECTO_Y_DESPLIEGUE.md](PROYECTO_Y_DESPLIEGUE.md): qué construir, rutas previstas y cómo se publicaría cada parte. BuildApp está protegido; estas tres apps pueden compartir solo un backend NUEVO y dedicado de Cool Projects, todavía no creado.

## Empezar

Para abrir la web anterior, desde la raíz del proyecto y con el puerto libre:

```bash
python3 -m http.server 5182 --bind 127.0.0.1 --directory frontend
```

Abrir `http://127.0.0.1:5182/` y parar el servidor con `Ctrl+C`. Si el puerto está ocupado, elegir otro; no detener procesos ajenos. El frontend es estático y no necesita instalar paquetes ni ejecutar un build. El mapa, las alturas y el censo necesitan conexión a internet; las consultas municipales se hacen al abrir la página y se pueden repetir si fallan.

Para desarrollar el prototipo nativo o abrir su vista web local:

```bash
cd mobile
npm ci
npx expo start --host localhost
```

Expo usa el puerto 8081 si está libre. `localhost` limita la conexión a este ordenador; abrir el teléfono por la red requiere configurarlo expresamente. La app usa mapas nativos de Apple o Google, no una página web incrustada. Para probarla en un dispositivo se necesita una versión compatible de Expo Go o una compilación de desarrollo; para publicar se deben configurar credenciales propias de los mapas y revisar costes y permisos.

Para las comprobaciones locales se necesitan Python 3.11 o posterior y Node.js:

```bash
node tests/demo.test.mjs
node tests/solar.test.mjs
node tests/madrid.test.mjs
node tests/map-shadows.test.mjs
node --test tests/mobile.test.mjs
node --check frontend/app.mjs
python3 scripts/repo_check.py
bash scripts/check-ai-instructions.sh
```

Al editar reglas, cambiar `AI_SHARED_INSTRUCTIONS.md` y ejecutar:

```bash
bash scripts/sync-ai-instructions.sh
bash scripts/check-ai-instructions.sh
```

Los tests comprueban casos solares y geométricos concretos, no la precisión de predicciones reales. Las comprobaciones de documentación y configuración no prueban la interfaz; el alcance de las pruebas está en [calidad](docs/QUALITY.md). La biblioteca solar [SunCalc 2.0.2](https://github.com/mourner/suncalc/tree/v2.0.2) se incluye localmente con su licencia BSD-2-Clause en `frontend/vendor/`.

## Guías

- [Producto y primer recorrido](docs/PRODUCT.md)
- [Diseño de la interfaz](docs/DESIGN.md)
- [Fuentes, relojes y cobertura](docs/DATA_SOURCES.md)
- [Criterios de calidad](docs/QUALITY.md)
- [Fases de desarrollo](docs/ROADMAP.md)
- [Estado y siguiente paso](NOTES.md)
- [Arquitectura](.memory/architecture.md), [decisiones](.memory/decisions.md) y [tareas](.memory/todo.md)
- [Qué se ha aprovechado de BuildApp y MTM](docs/INHERITED_PRACTICES.md)

## Configuración

El mapa utiliza MapLibre y OpenFreeMap, con datos de OpenStreetMap y atribución visible; Leaflet y OpenStreetMap proporcionan un respaldo 2D. El código anterior de Google Maps se conserva, pero no aparece como opción en esta vista porque aún no está verificado con las sombras: la clave compartida rechaza el origen local y falta acceso a su cuenta de Cloud para ajustar la restricción previamente autorizada por Tony. No copiar claves privadas de servidor. Véase [fuentes y contratos](docs/DATA_SOURCES.md) antes de publicar o ampliar tráfico.

`.env.example` contiene nombres internos propuestos, sin credenciales. Mantener claves privadas fuera del cliente y del repositorio.

`.codex/config.toml` declara Auto Review sin cambiar modelo, red, sandbox ni directorios. Su aplicación depende del cliente, confianza del proyecto y requisitos administrados; no modifica una sesión ya iniciada.

El repositorio de código es privado: [TonyRod116/rato-al-sol](https://github.com/TonyRod116/rato-al-sol). La app todavía no está publicada como sitio web.
