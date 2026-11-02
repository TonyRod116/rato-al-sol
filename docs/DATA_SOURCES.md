# Fuentes y contratos — Rato al Sol

Fecha de preparación: 2026-10-30. Estado: referencias candidatas; no hay una integración real conectada o validada en este repo.

## Fuentes

| Fuente candidata | Uso | Estado en esta preparación | Falta antes de integrar |
|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Negocios, huellas y, donde existan, alturas | Candidata; no se ha auditado una zona ni descargado geometría | Licencia/atribución, cobertura de alturas y ubicación real de mesas |
| [CNIG/IGN](https://centrodedescargas.cnig.es/CentroDescargas/) | Posibles datos de elevación o geometría | Referencia a investigar, no fuente admitida todavía | Dataset exacto, licencia, resolución, área, tamaño y proceso mínimo |
| Portal de datos abiertos del municipio seleccionado | Terrazas autorizadas y/o edificios 3D si se publican | Ciudad y dataset pendientes | Acceso, derechos, frescura y precisión espacial |
| [AEMET OpenData](https://opendata.aemet.es/dist/) | Nubosidad/previsión, si se incorpora | Portal oficial conocido; sin credenciales ni consulta de producción | Producto horario adecuado, cobertura, licencia, cuota y reloj de emisión |
| [ShadeMap](https://shademap.app/help/) | Referencia de experiencia y comparación | Competidor/referencia, no proveedor configurado | No integrar ni copiar su contenido sin permiso/licencia aplicable |

La ciudad se elige después de verificar geometría suficiente en un barrio. Las terrazas visibles en el mapa no implican estar abiertas ni tener mesas disponibles.

## Primera comprobación: Madrid, 2026-11-02

- El [censo municipal de locales y terrazas](https://datos.madrid.es/dataset/200085-0-censo-locales/information) es un candidato con actualización declarada diaria y licencia CC BY 4.0. El Ayuntamiento advierte de posibles inconsistencias del registro administrativo.
- El [diccionario municipal](https://datos.madrid.es/dataset/200085-0-censo-locales/resource/200085-10-censo-locales/download/200085-10-censo-locales.pdf) indica que `coordenada_x_local` y `coordenada_y_local` identifican aproximadamente la entrada del local, no las mesas. También describe una dirección cercana a la terraza y superficie autorizada; eso no permite reconstruir su polígono real ni la acera ocupada con precisión.
- El Ayuntamiento ofrece también un [servicio de alturas estimadas de edificios](https://datos.madrid.es/dataset/300750-0-servicio-mapas) y un [modelo 3D de edificios descargable por distritos](https://datos.madrid.es/dataset/300722-0-ancho-viario-mapas), ambos publicados con licencia CC BY 4.0. El primero advierte de posibles omisiones y no especifica frecuencia de actualización; hay que comprobar cobertura y fechas en la zona concreta y cómo acceder a los datos necesarios para calcular.
- Conclusión: Madrid es candidata para descubrir locales y geometría, no una zona ya seleccionada ni evidencia suficiente para calcular su sombra. Faltan comprobar las alturas y su acceso en un barrio, la posición real de mesas y las condiciones aplicables de cada fuente, además de la validación sobre el terreno. No se han descargado ni conectado estos datos.
- Las [condiciones del servicio de teselas de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) exigen, entre otras cosas, atribución visible y respeto de sus reglas de uso y caché. El mapa del ejemplo es inventado y no usa teselas ni datos de OpenStreetMap.

## Contrato mínimo del dominio

- Cada terraza guarda identificador estable, nombre, coordenadas o polígono de mesas, procedencia y fecha de revisión; no basta la dirección comercial.
- La geometría guarda sistema de coordenadas, unidad, altura, versión, cobertura y licencia. Convertir a metros antes de calcular sombras; nunca tratar grados como metros.
- Guardar versión del motor, fecha/hora de evaluación y zona IANA; separar hora calculada, última actualización de geometría y emisión de previsión.
- Clasificar salida `geometric_sun`, `geometric_shadow`, `night` o `unknown`; añadir nubosidad aparte. La falta de altura no produce sol por defecto.
- Elegir algoritmo/biblioteca solar después de comprobar licencia, exactitud y coste. No crear un motor astronómico paralelo sin necesidad.
- Establecer granularidad y tolerancia con comprobación sobre el terreno; redondear el lenguaje a la precisión que realmente se pueda sostener.

## Admisión de un proveedor

Antes de integrarlo, registrar enlace oficial y fecha de revisión, acceso, licencia/atribución, coste/cuotas, cobertura, campos/unidades, relojes, cadencia, horizonte cuando proceda y tratamiento de fallos. Distinguir lo comprobado en documentación de una consulta real.

No guardar secretos, direcciones precisas ni respuestas completas con datos personales como fixture. Un ejemplo sintético se identifica; una muestra real solo se conserva cuando sus derechos y contenido lo permiten.

No sustituir un error del proveedor por un dato inventado. Cambiar de fuente requiere revisar compatibilidad semántica y comunicar los límites relevantes, sin arrastrar derechos o confianza del proveedor anterior.
