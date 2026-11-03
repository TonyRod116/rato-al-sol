# Arquitectura — Rato al Sol

Estado: frontend local en HTML, CSS y JavaScript, sin instalación ni build. `frontend/solar.mjs` usa SunCalc 2.0.2 incluido localmente y calcula sombra sobre polígonos sintéticos; `frontend/demo-data.mjs` aporta un barrio imaginario que comparten mapa y lista. `frontend/madrid.mjs` consulta a demanda una selección del censo público municipal; los locales reales se muestran sin estimación solar. No hay backend propio.

El escenario trabaja con metros, eje X hacia el este e Y hacia el sur, cubiertas planas y `Europe/Madrid`. Con el sol cerca del horizonte devuelve desconocido y no modela árboles, toldos ni nubes. Los polígonos del ejemplo son simples y conocidos: antes de admitir fuentes reales hay que validar topología, cobertura, alturas, coordenadas y ubicación de mesas; los tests actuales no acreditan precisión sobre el terreno.

La escena ilustra las mismas huellas y alturas en una perspectiva fija: proyecta sus sombras sobre el suelo con la posición del mismo sol que clasifica las terrazas. Los tramos del día agrupan muestras cada 10 minutos entre las 09:00 y las 20:00 y son aproximados, no límites exactos. No se dibuja una sombra cuando el sol está por debajo del umbral de confianza del ejemplo.

## Flujo propuesto

Entrada: fecha, hora y zona local, coordenadas de terraza, geometría/alturas y sus derechos; nubosidad si se integra.

Adaptador de proveedor -> contrato normalizado y procedencia -> cálculo de dominio puro -> presentación accesible.

Salida: intervalos geométricos de sol/sombra, cobertura y limitaciones; nubosidad como capa separada.

## Límites

- Presentación, cálculo y acceso a proveedores tienen responsabilidades separadas; no exige microservicios ni una jerarquía de abstracciones.
- El cálculo recibe tiempo y datos explícitos para poder reproducirlo. La UI consume su salida, no implementa otro motor.
- Proveedor privado detrás de un servidor mínimo cuando lo exijan las claves. Preferencias locales al dispositivo por defecto.
- Modo ejemplo separado de datos reales; caché con antigüedad y fuente. Su disponibilidad no implica validez actual.
- Frontend autónomo y portable; sin imports ni enlaces simbólicos a BuildApp, Trading u otra app hermana. Las tres apps pueden consumir por HTTP un backend NUEVO común de Cool Projects, con contratos versionados y recursos dedicados.
- Ubicación propuesta de API común: `/home/tonirod/code/Cool_Projects/cool-projects-api/`, no creada. Ningún dato, credencial, servicio o base de BuildApp forma parte de este sistema.
- El ejemplo usa `frontend/` y los tests `tests/`; mantener lo mínimo que permita el recorrido completo.

Registrar decisiones nuevas en [decisiones](decisions.md); contratos externos en [fuentes](../docs/DATA_SOURCES.md).

## Publicación y separación

La orientación operativa y las rutas propuestas viven en [proyecto y despliegue](../PROYECTO_Y_DESPLIEGUE.md). Patrón de referencia: frontend propio en IONOS/Cloudflare y backend propio en Render; todos los destinos concretos siguen pendientes. No se han creado ni cambiado recursos.
