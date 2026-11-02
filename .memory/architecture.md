# Arquitectura — Rato al Sol

Estado: primer frontend local en HTML, CSS y JavaScript nativos, sin dependencias ni build. `frontend/demo-data.mjs` contiene escenarios inventados compartidos por mapa y lista; no es un motor solar. No hay API ni proveedor real conectado.

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
