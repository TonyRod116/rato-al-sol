# Rato al Sol

**¿En qué terraza tendré sol o sombra a la hora a la que quiero sentarme?**

Un mapa sencillo de terrazas con intervalos estimados de sol y sombra, un selector de hora y la incertidumbre visible donde cambie la decisión.

## Estado real

La primera pantalla muestra un mapa interactivo de Ayala, en Madrid, y las terrazas incluidas en el censo municipal. Los puntos corresponden a las **entradas aproximadas de los locales**, no a sus mesas; todavía no se calculan sus horas de sol. Si Google Maps no está disponible, se usa un mapa de OpenStreetMap. En «Prueba de sol» hay un barrio inventado con sombras que se mueven, reproducción y tramos de luz aproximados: esos resultados no describen terrazas reales. No hay despliegue.

## Orientación obligatoria

Leer [PROYECTO_Y_DESPLIEGUE.md](PROYECTO_Y_DESPLIEGUE.md): qué construir, rutas previstas y cómo se publicaría cada parte. BuildApp está protegido; estas tres apps pueden compartir solo un backend NUEVO y dedicado de Cool Projects, todavía no creado.

## Empezar

Para abrir el ejemplo, desde la raíz del proyecto y con el puerto libre:

```bash
python3 -m http.server 5182 --bind 127.0.0.1 --directory frontend
```

Abrir `http://127.0.0.1:5182/` y parar el servidor con `Ctrl+C`. Si el puerto está ocupado, elegir otro; no detener procesos ajenos. El frontend es estático y no necesita instalar paquetes ni ejecutar un build. El mapa y el censo necesitan conexión a internet; la consulta municipal comienza al abrir la página y se puede actualizar manualmente.

Para las comprobaciones locales se necesitan Python 3.11 o posterior y Node.js:

```bash
node tests/demo.test.mjs
node tests/solar.test.mjs
node tests/madrid.test.mjs
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

La integración opcional de Google Maps usa exclusivamente una clave **de navegador** para Maps JavaScript, con restricciones de origen y API. Copiar `frontend/maps-config.example.json` a `frontend/maps-config.local.json` y configurar ahí la clave; el archivo local está ignorado por Git. No usar claves privadas de servidor, Routes o Places. La clave compartida de desarrollo que Tony autorizó reutilizar rechaza actualmente `http://127.0.0.1:5182/`: para activarla en este origen habría que añadirlo a sus restricciones en Google Cloud. Con clave ausente o rechazada, el mapa alternativo utiliza Leaflet y OpenStreetMap, con atribución visible. La integración real de Google todavía requiere una prueba tras autorizar el origen; `DEMO_MAP_ID` es solo para desarrollo. Véase [fuentes y contratos](docs/DATA_SOURCES.md) antes de publicar o ampliar tráfico.

`.env.example` contiene nombres internos propuestos, sin credenciales. Mantener claves privadas fuera del cliente y del repositorio.

`.codex/config.toml` declara Auto Review sin cambiar modelo, red, sandbox ni directorios. Su aplicación depende del cliente, confianza del proyecto y requisitos administrados; no modifica una sesión ya iniciada.

El repositorio de código es privado: [TonyRod116/rato-al-sol](https://github.com/TonyRod116/rato-al-sol). La app todavía no está publicada como sitio web.
