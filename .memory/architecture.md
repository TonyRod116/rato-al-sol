# Arquitectura — Rato al Sol

Estado: web local estática y prototipo nativo React Native/Expo en `mobile/`. `frontend/solar.mjs` y SunCalc 2.0.2 calculan el mismo sol para ambas interfaces. `frontend/madrid.mjs` consulta el censo y transforma la posición aproximada de las entradas. `frontend/madrid-buildings.mjs` consulta una zona fija de edificios con alturas estimadas del Ayuntamiento para la web anterior. `frontend/map-shadows.mjs` proyecta sus cubiertas y bordes.

`frontend/shared/places.mjs` consulta lugares y edificios de OpenStreetMap por POST; `madrid-scene.mjs` obtiene alturas municipales para un punto y `ayala-fallback.mjs` consulta el censo y un catálogo limitado de parques. `frontend/shared/estimate.mjs` sirve tanto a la web como al prototipo nativo: combina el mismo cálculo solar y la geometría, genera intervalos aproximados, filtra franjas y conserva como desconocidos los obstáculos sin altura. El reloj web se identifica como hora de Madrid y el nativo como hora del dispositivo. Los componentes de mapa son nativos en iOS/Android; no hay backend propio.

`frontend/city-map.mjs` dibuja sombras y edificios municipales sobre MapLibre/OpenFreeMap, sustituyendo los edificios esquemáticos dentro del área de estudio; `frontend/open-map.mjs` dibuja las mismas sombras en el respaldo Leaflet. Las sombras dibujadas siguen limitadas a Ayala; el cálculo de un punto elegido puede consultar otra geometría y ofrece resultados solo si hay datos suficientes. La interfaz distingue ambos alcances. Google se conserva en código pero no está en esta interfaz mientras su acceso y superposición no se hayan comprobado. No hay backend propio.

El modelo usa cubiertas planas, alturas estimadas y unidades métricas. La web usa `Europe/Madrid`; la app utiliza y muestra la zona del dispositivo. Oculta sombras con el sol por debajo de 5° y no modela árboles, toldos, nubosidad ni reflejos. Las pruebas de geometría no acreditan precisión sobre el terreno, cobertura completa ni posición de mesas. Las geometrías ficticias históricas se conservan para pruebas aisladas; no se presentan como lugares reales.

## Flujo propuesto

Entrada: fecha, hora y zona local, coordenadas de terraza, geometría/alturas y sus derechos; nubosidad si se integra.

Adaptador de proveedor -> contrato normalizado y procedencia -> cálculo de dominio puro -> presentación accesible.

Salida: intervalos geométricos de sol/sombra, cobertura y limitaciones; nubosidad como capa separada.

## Límites

- Presentación, cálculo y acceso a proveedores tienen responsabilidades separadas; no exige microservicios ni una jerarquía de abstracciones.
- El cálculo recibe tiempo y datos explícitos para poder reproducirlo. La UI consume su salida, no implementa otro motor.
- Proveedor privado detrás de un servidor mínimo cuando lo exijan las claves. Preferencias locales al dispositivo por defecto.
- Separar siempre el ejemplo sintético de los datos reales; la consulta y su fecha no garantizan vigencia ni cobertura.
- Frontend autónomo y portable; sin imports ni enlaces simbólicos a BuildApp, Trading u otra app hermana. Las tres apps pueden consumir por HTTP un backend NUEVO común de Cool Projects, con contratos versionados y recursos dedicados.
- Ubicación propuesta de API común: `/home/tonirod/code/Cool_Projects/cool-projects-api/`, no creada. Ningún dato, credencial, servicio o base de BuildApp forma parte de este sistema.
- El ejemplo usa `frontend/` y los tests `tests/`; mantener lo mínimo que permita el recorrido completo.

Registrar decisiones nuevas en [decisiones](decisions.md); contratos externos en [fuentes](../docs/DATA_SOURCES.md).

## Publicación y separación

La orientación operativa y las rutas propuestas viven en [proyecto y despliegue](../PROYECTO_Y_DESPLIEGUE.md). Patrón de referencia: frontend propio en IONOS/Cloudflare y backend propio en Render; todos los destinos concretos siguen pendientes. No se han creado ni cambiado recursos.
