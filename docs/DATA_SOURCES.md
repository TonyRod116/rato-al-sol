# Fuentes y contratos — Rato al Sol

Actualizado: 2026-11-03. Estado: consulta limitada al censo y alturas estimadas del Ayuntamiento, con sombras orientativas en Ayala; no hay predicción para terrazas reales.

## Fuentes

| Fuente candidata | Uso | Estado en esta preparación | Falta antes de integrar |
|---|---|---|---|
| [OpenFreeMap](https://openfreemap.org/quick_start/) | Mapa visual 3D con datos de OpenStreetMap/OpenMapTiles | Conectado sin clave; la geometría para sombras se obtiene por separado del Ayuntamiento | Comprobar disponibilidad y sostenibilidad antes de publicar |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Mapa base de respaldo; posible geometría futura | Teselas con atribución visible; no se usa geometría para predicciones | Proveedor y capacidad para publicación, cobertura de alturas y posición de mesas |
| [Google Maps JavaScript](https://developers.google.com/maps/documentation/javascript/overview) | Mapa base pendiente | Código conservado, opción oculta; la clave local rechaza el origen 5182 | Ajustar origen con acceso a Cloud, probar mapa y sombras y revisar facturación antes de publicar |
| [CNIG/IGN](https://centrodedescargas.cnig.es/CentroDescargas/) | Posibles datos de elevación o geometría | Referencia a investigar, no fuente admitida todavía | Dataset exacto, licencia, resolución, área, tamaño y proceso mínimo |
| Portal de datos abiertos de Madrid | Terrazas registradas y alturas de edificios | Consultas limitadas a Ayala/Recoletos; sombras orientativas con alturas estimadas | Posiciones reales de mesas, vigencia y cobertura/precisión de alturas |
| [AEMET OpenData](https://opendata.aemet.es/dist/) | Nubosidad/previsión, si se incorpora | Portal oficial conocido; sin credenciales ni consulta de producción | Producto horario adecuado, cobertura, licencia, cuota y reloj de emisión |
| [ShadeMap](https://shademap.app/help/) | Referencia de experiencia y comparación | Competidor/referencia, no proveedor configurado | No integrar ni copiar su contenido sin permiso/licencia aplicable |

Tony eligió Madrid para la primera prueba. La cobertura suficiente para calcular sol en una terraza todavía no está verificada. Un registro de terraza no implica que esté abierta en ese momento ni que tenga mesas disponibles.

## Primera comprobación: Madrid, 2026-11-02

- El [censo municipal de locales y terrazas](https://datos.madrid.es/dataset/200085-0-censo-locales/information) es un candidato con actualización declarada diaria y licencia CC BY 4.0. El Ayuntamiento advierte de posibles inconsistencias del registro administrativo.
- El [diccionario municipal](https://datos.madrid.es/dataset/200085-0-censo-locales/resource/200085-10-censo-locales/download/200085-10-censo-locales.pdf) indica que `coordenada_x_local` y `coordenada_y_local` identifican aproximadamente la entrada del local, no las mesas. También describe una dirección cercana a la terraza y superficie autorizada; eso no permite reconstruir su polígono real ni la acera ocupada con precisión.
- El Ayuntamiento ofrece también un [servicio de alturas estimadas de edificios](https://datos.madrid.es/dataset/300750-0-servicio-mapas) y un [modelo 3D de edificios descargable por distritos](https://datos.madrid.es/dataset/300722-0-ancho-viario-mapas), ambos publicados con licencia CC BY 4.0. El primero advierte de posibles omisiones y no especifica frecuencia de actualización; hay que comprobar cobertura y fechas en la zona concreta y cómo acceder a los datos necesarios para calcular.
- Conclusión inicial: el censo no permite calcular sol en mesas. La sección posterior documenta la conexión de las alturas y sus límites; sigue pendiente contrastar sombras y mesas sobre el terreno.
- Las [condiciones del servicio de teselas de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) exigen atribución visible, referencia HTTP y respeto de caché; no admiten descarga masiva ni precarga sin visualización. El mapa real de respaldo las usa.

## Consulta municipal limitada: 2026-11-03

- Tony seleccionó Madrid; se usa como primera muestra la calle de Ayala dentro del barrio de Recoletos. La [API pública del recurso municipal de terrazas](https://datos.madrid.es/dataset/200085-0-censo-locales/resource/200085-6-censo-locales) devolvió tres registros en una consulta real; el número y los nombres pueden cambiar. Se filtran los estados administrativos `Abierto`/`Abierta`, que no prueban horario ni disponibilidad actuales.
- Se solicitan como máximo diez registros y los campos necesarios para identificar nombre, dirección, estado, tipo de acceso y coordenadas de entrada; se validan y se muestran solo como texto. Se transforma ETRS89/UTM 30N a coordenadas geográficas y solo se dibujan entradas de tipo «Puerta Calle» con coordenadas válidas. La petición fija no incluye ubicación personal, fecha ni hora elegidas, ni cookies o referencia de la página. Se hace al abrir la página o al pulsar actualizar, con timeout de ocho segundos y sin reintentos automáticos. Fallo, lista vacía y ausencia de posición de mesas se muestran de forma explícita.
- El recurso y las [condiciones municipales](https://datos.madrid.es/pages/condiciones-de-uso) indican CC BY 4.0; la interfaz atribuye y enlaza fuente y licencia e informa de la selección de campos. La API confirmó acceso desde navegador (`Access-Control-Allow-Origin: *`) en la prueba local. No se ha identificado una cuota o garantía de disponibilidad; antes de ampliar tráfico hay que revisarlas y decidir caché responsable.
- El instante de consulta se muestra separado de la vigencia del registro. La información municipal puede contener inconsistencias y no demuestra la posición de las mesas ni el estado real de apertura. No se usa para inferir la luz de una terraza ni la posición de sus mesas.

## Mapas base y privacidad: 2026-11-03

- El mapa principal usa [MapLibre GL JS 5.24.0](https://maplibre.org/maplibre-gl-js/docs/) y el estilo Liberty de [OpenFreeMap](https://openfreemap.org/quick_start/), con colores ajustados para la app. El servicio público se anuncia gratuito y sin clave; sus [condiciones](https://openfreemap.org/tos/) no garantizan disponibilidad y prohíben la recopilación automatizada. El mapa se usa de manera interactiva, sin descarga masiva, con atribución a OpenFreeMap, OpenMapTiles y OpenStreetMap. MapLibre se carga desde jsDelivr con versión e integridad fijadas; los hashes se contrastaron con un segundo CDN.
- Fuera de la zona de Ayala las huellas del mapa son orientativas. La [capa de edificios de OpenMapTiles](https://github.com/openmaptiles/openmaptiles/blob/master/layers/building/building.sql) puede calcular alturas a partir del número de plantas o emplear un valor predeterminado. No se extrae geometría de OpenFreeMap para el cálculo: los polígonos y alturas proceden de la consulta municipal descrita abajo.
- El código de Google Maps JavaScript se conserva pero no se ofrece en la interfaz unificada y utiliza exclusivamente una clave de navegador, expuesta como corresponde a esta API y restringida por origen y API; nunca se copian claves privadas de rutas o lugares. La clave autorizada del proyecto hermano produce `RefererNotAllowedMapError` en `http://127.0.0.1:5182/`. Tony autorizó añadir el origen, pero el almacén local de Cloud no contiene cuentas: no se ha podido verificar el proyecto propietario ni modificar la clave. La conexión real de Google, la vista vectorial y los edificios 3D no están validados en este proyecto. La disponibilidad y el precio dependen de la [facturación y precios de Google](https://developers.google.com/maps/billing-and-pricing/pricing). `DEMO_MAP_ID` es para desarrollo.
- Si el mapa 3D falla, [Leaflet 1.9.4](https://leafletjs.com/install.html) se carga desde jsDelivr con las sumas de integridad publicadas por su proyecto. Dibuja solo las teselas visibles de `tile.openstreetmap.org`, sin precarga, con caché normal del navegador y atribución enlazada. La política de teselas es de mejor esfuerzo y no garantiza disponibilidad; antes de una publicación con tráfico hay que evaluar un proveedor o infraestructura apropiados.
- El proveedor del mapa recibe las solicitudes normales del navegador y la zona de mapa que se visualiza. No se solicita ni envía geolocalización personal, ni se mandan al censo la fecha o la hora elegidas. Si fallan ambos mapas, la lista municipal sigue disponible.

## Sombras orientativas en Ayala: 2026-11-03

- La [cartografía municipal de alturas](https://datos.madrid.es/dataset/300750-0-servicio-mapas) se ofrece bajo CC BY 4.0. Su [capa de consulta](https://sigma.madrid.es/hosted/rest/services/cartografia/EDIFICIOS_ALTURAS/MapServer/0) proporciona polígonos y `ALTURA` en metros. Son alturas estimadas y el proveedor advierte de omisiones; no se ha verificado la fecha de cada edificio ni la precisión sobre el terreno.
- Una petición fija y acotada en WGS84 para el entorno de Ayala, `[-3.692, 40.425, -3.685, 40.429]`, devolvió 1.324 polígonos (aprox. 0,81 MB sin comprimir) el 2026-11-03. El servicio acepta CORS desde el origen local. La app valida coordenadas, geometría y alturas; rechaza resultados vacíos, truncados o que alcancen el límite del servicio y avisa si descarta edificios inválidos. Hay un solo intento al abrir y repetición manual tras un fallo; no envía la hora, fecha ni ubicación personal. No se conoce una cuota o garantía del servicio: revisar caché, frecuencia y capacidad antes de ampliar tráfico.
- Cada volumen de esa zona y su sombra se apoyan en la misma geometría municipal. La sombra desplaza las cubiertas y barre los bordes a partir del sol y la altura, usando una aproximación métrica local. No se consulta ni recopila geometría de las teselas. Fuera de la zona, o cerca de sus límites, pueden faltar obstáculos y sus sombras; la interfaz identifica el alcance y avisa cuando el centro del mapa sale de él. Con el sol por debajo de 5° no se dibujan sombras.
- La altura estimada, patios y sol geométrico no describen árboles, toldos, sombrillas, nubes, iluminación indirecta ni la posición de mesas. Una zona sin sombra dibujada no acredita que vaya a estar soleada. No se han comparado resultados con observaciones reales.

## Cálculo solar

- [SunCalc 2.0.2](https://github.com/mourner/suncalc/tree/v2.0.2), biblioteca JavaScript con licencia BSD-2-Clause, incluida en `frontend/vendor/` junto con su licencia, sin llamadas externas. Se emplean coordenadas del entorno de Ayala y la zona `Europe/Madrid`.
- Se contrastó una posición con el [caso del laboratorio NLR](https://midcdmz.nlr.gov/spa/spa_tester.c) y los [resultados independientes de pvlib](https://github.com/pvlib/pvlib-python/blob/main/tests/test_solarposition.py), con tolerancia de 0,1°. Es una comprobación puntual, no una garantía de precisión global. Los casos analíticos son sintéticos y las sombras sobre edificios municipales no se han contrastado sobre el terreno; cerca del horizonte no se muestran y no se calculan nubes, árboles ni toldos.

## Contrato mínimo del dominio

- Cada terraza guarda identificador estable, nombre, coordenadas o polígono de mesas, procedencia y fecha de revisión; no basta la dirección comercial.
- La geometría guarda sistema de coordenadas, unidad, altura, versión, cobertura y licencia. Convertir a metros antes de calcular sombras; nunca tratar grados como metros.
- Guardar versión del motor, fecha/hora de evaluación y zona IANA; separar hora calculada, última actualización de geometría y emisión de previsión.
- Clasificar salida `geometric_sun`, `geometric_shadow`, `night` o `unknown`; añadir nubosidad aparte. La falta de altura no produce sol por defecto.
- Mantener un único cálculo astronómico y documentar biblioteca, licencia y alcance de exactitud. No crear un motor astronómico paralelo sin necesidad.
- Establecer granularidad y tolerancia con comprobación sobre el terreno; redondear el lenguaje a la precisión que realmente se pueda sostener.

## Admisión de un proveedor

Antes de integrarlo, registrar enlace oficial y fecha de revisión, acceso, licencia/atribución, coste/cuotas, cobertura, campos/unidades, relojes, cadencia, horizonte cuando proceda y tratamiento de fallos. Distinguir lo comprobado en documentación de una consulta real.

No guardar secretos, direcciones precisas ni respuestas completas con datos personales como fixture. Un ejemplo sintético se identifica; una muestra real solo se conserva cuando sus derechos y contenido lo permiten.

No sustituir un error del proveedor por un dato inventado. Cambiar de fuente requiere revisar compatibilidad semántica y comunicar los límites relevantes, sin arrastrar derechos o confianza del proveedor anterior.
