# Calidad — Rato al Sol

## Comprobación disponible hoy

```bash
node tests/demo.test.mjs
node tests/solar.test.mjs
node tests/madrid.test.mjs
node tests/map-shadows.test.mjs
node --test tests/mobile.test.mjs
node --check frontend/app.mjs
node --check frontend/demo-data.mjs
node --check frontend/solar.mjs
node --check frontend/madrid.mjs
node --check frontend/madrid-buildings.mjs
node --check frontend/map-shadows.mjs
node --check frontend/google-map.mjs
node --check frontend/open-map.mjs
node --check frontend/city-map.mjs
python3 scripts/repo_check.py
bash scripts/check-ai-instructions.sh
```

Los tests de Node comprueban una posición solar de referencia con tolerancia de 0,1°, cambios de horario de Madrid, geometría analítica simple y dirección de sombra dibujada, intervalos, noche, datos ausentes, filtros, privacidad de consultas y contratos municipales. La prueba solar cubre solo ese caso, no su precisión global ni la sombra real en terrazas. Los dos últimos comandos comprueban solo documentación/configuración. La web anterior es estática; el prototipo nativo usa Expo.

Para comprobar el empaquetado nativo, desde `mobile/`: `npx expo export --platform android --output-dir /tmp/rato-android-export` y equivalente con `--platform ios`. Esto verifica el empaquetado JavaScript, no instala ni prueba una app en un dispositivo.

El 2026-11-03 se probó en Chromium la vista web del prototipo: selección de un punto real en Madrid y respuesta de alturas municipales, cambio de hora con teclado, búsqueda municipal real tras fallo simulado de Overpass y filtro de sol con lugares y edificios ficticios. Con Overpass simulado como caído se consultaron el catálogo real de parques y alturas municipales para dos puntos; se verificó también la validación de un radio personalizado. Se inspeccionaron capturas de móvil y escritorio; falta QA de dispositivo iOS/Android, comprobación de accesibilidad nativa y contraste sobre el terreno. La búsqueda general no pudo validarse con datos reales por 406/timeout. El análisis npm señaló 13 avisos, dos altos en dependencias de Expo CLI; la corrección automática propone cambiar de versión mayor de Expo y queda pendiente de revisión antes de publicar.

En la unificación del 2026-11-03 se consultaron 1.324 polígonos municipales y se inspeccionaron en Chromium capturas reales del mapa 3D por la mañana y la tarde y de móvil; se midieron 320, 390, 768 y 1440 px sin desbordamiento horizontal y zoom CSS del 200 %. La flecha, la iluminación y las sombras cambian con la hora, y la flecha responde al giro. Se comprobaron selección, reproducción/pausa, teclado, movimiento reducido, noche, enlace antiguo, aviso al salir de la zona y fallo/recuperación de alturas. Al bloquear MapLibre, Leaflet mostró la misma capa de sombras en 2D. No hubo errores JavaScript; no se probó en dispositivos reales ni se ha contrastado la precisión con observaciones sobre el terreno. Los tests geométricos comprueban un edificio de 10 m con sol a 45°, direcciones norte y oeste, patios y el umbral del horizonte; validan también alturas inválidas y respuestas incompletas o excesivas.

En la revisión del mapa 3D del 2026-11-03 se inspeccionaron capturas en Chromium a 320, 390, 768 y 1440 px y ampliación CSS al 200 %, con WebGL por software: se cargaron edificios de OpenFreeMap y tres entradas del censo real, se verificaron giro, cambio 2D/3D, selección sincronizada, teclado y movimiento reducido. La prueba solar ficticia movió la sombra al cambiar la hora. Se bloqueó la biblioteca 3D para comprobar el respaldo 2D y sus puntos, y ambas bibliotecas para comprobar que la lista y el ejemplo seguían disponibles. Google rechazó de nuevo el origen y devolvió la interfaz al mapa 3D; el cambio de proveedor y sus controles se probaron también con Google simulado. No se probó una cuenta de Google autorizada ni dispositivos reales; la geometría visual no valida alturas ni sombras reales.

En la mejora anterior del mapa del 2026-11-03 se revisaron capturas de 320, 390, 768 y 1440 px y zoom al 200 %. El censo real devolvió tres entradas y se vio el mapa real de OpenStreetMap; se comprobó selección de lista y puntos, selector solar, sombras, reproducción, teclado y movimiento reducido. Se simularon Google disponible, errores de autenticación y de ambos mapas, texto no confiable, fallo de actualización conservando la fecha anterior y enlace compartido. La clave real de Google rechazó el puerto 5182, por lo que Google y sus edificios vectoriales quedan pendientes de prueba real. El motor de conversión se contrastó con una referencia pública aproximada y límites de zona; no acredita precisión de mesas ni validación sobre el terreno. No sustituye pruebas en dispositivos reales.

En la revisión anterior de la escena en perspectiva del 2026-11-03 se inspeccionaron capturas en Chromium de 320, 390, 768 y 1440 px y con ampliación CSS al 200 %. Se comprobaron la selección, movimiento de las sombras y de la dirección del sol, intervalos, reproducción y pausa, teclado, noche, falta de mesas, filtro vacío, enlace y movimiento reducido. En esa revisión anterior, la respuesta municipal se simuló para comprobar el texto no confiable y que entonces la petición solo se hacía al pulsar. No se observaron errores de JavaScript. No sustituye pruebas en dispositivos ni la validación de una escena real.

El 2026-11-03 se probó en Chromium a 320, 390, 768 y 1440 px: cambio de fecha y hora, noche, filtros, mapa/lista/detalle, enlace y teclado. La consulta municipal se probó con una respuesta real (tres registros) y con respuestas sintéticas válidas, vacías, fallidas y con texto malicioso; entonces no consultaba antes de pulsar ni enviaba el plan; ahora consulta también al abrir la página. Se inspeccionaron capturas de cada tamaño. Falta prueba en dispositivos reales, validación geométrica con datos reales y contraste sobre el terreno.

El 2026-11-02 se probaron con Chromium y datos inventados las anchuras 320, 390, 768 y 1440 px: filtros, lista y mapa sincronizados, caso vacío, enlace compartido, teclado, movimiento reducido y consola/red. Se inspeccionaron capturas y se corrigió la distribución en pantalla intermedia y con ampliación CSS al 200 %. Sin JavaScript se comprobó el aviso. No sustituye una auditoría completa de accesibilidad ni la prueba en dispositivos reales.

## Casos del producto

- Noche, horizonte bajo, amanecer y atardecer; no emitir minutos de sol cuando el sol está bajo el horizonte.
- Misma entrada => mismo resultado en mapa, lista y tarjeta; reloj fijo para reproducirlo.
- Edificio simple con altura conocida y coordenadas métricas; resultado contrastado con una referencia independiente apropiada.
- Altura ausente, terraza sin posición de mesas o geometría insuficiente => `unknown`, nunca sol garantizado.
- Acera opuesta, cambio de zona horaria, fecha cercana al cambio de hora y selección de fecha futura.
- Nubosidad alta no reescribe el estado geométrico. Toldos y vegetación no modelados no se esconden como precisión falsa.
- Lista usable sin mapa, con teclado y lector de pantalla; no depender solo de amarillo/azul.
- Piloto: anotar observación real, hora, ubicación de mesas y condiciones; conservar errores del modelo, no solo aciertos.

## Revisión heredada de BuildApp

1. Comportamiento correcto y regresiones del recorrido real.
2. Secretos, permisos, privacidad y validación de entradas externas.
3. Compatibilidad entre proveedor, normalización, cálculo y presentación.
4. Pruebas pertinentes y limitaciones no cubiertas.
5. Rendimiento: cadencia de red, coste de cálculo y tamaño del cliente donde importen.
6. Sencillez: eliminar complejidad del cambio sin reescribir trabajo vecino.

## QA de interfaz

Móvil y escritorio, teclado/tacto, zoom 200%, foco visible, contraste, texto sin recortes, movimiento reducido, consola/red y carga/vacío/error/dato antiguo. Verificar la experiencia del usuario, no solo una captura aislada.

Actualizar aquí los comandos reales de tipos, lint, tests y build si cambia el stack. Usar reloj fijo y entradas reproducibles para cálculos; fuentes reales para comprobar el adaptador. Si una comprobación no pudo ejecutarse, indicarlo con su impacto.

## Evidencia y cierre

Registrar qué entrada, fuente, fecha/modelo y resultado se comprobaron, sin datos privados. Una prueba verde demuestra su alcance, no garantiza utilidad, precisión global o disponibilidad futura. Registrar también fallos y la condición concreta para reabrir un enfoque descartado.
