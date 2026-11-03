# Trabajo — Rato al Sol

Esta lista es la fuente inicial del trabajo. Beads no está configurado. No mantener una segunda lista equivalente en NOTES o en otro servicio.

## BASE-001 — Preparar fundamentos específicos

- Estado: `done` — verificado el 2026-10-30 en la carpeta definitiva.
- Encargo: crear instrucciones y archivos base inspirados principalmente en BuildApp.
- Propietario: sesión de preparación inicial.
- Alcance de archivos: canon y copias IA, documentación, memoria, configuración de Auto Review y herramientas de comprobación de esta base.
- Aceptación: nombres correctos, reglas adaptadas al dominio, copias idénticas, enlaces locales válidos, comandos existentes y ningún proveedor conectado por accidente.
- Evidencia: `python3 scripts/repo_check.py`, sincronización, `bash -n` de los tres scripts y resumen de sesión pasaron en la carpeta definitiva. Antes de copiar se comprobaron controles negativos de drift, configuración, enlaces, LF, symlinks y secretos ignorados, y repetición de sincronización sin cambios de bytes.
- Límites: esto no acredita funcionamiento, precisión ni despliegue de la aplicación.

## APP-001 — Primera fase del producto

- Estado: `in_progress` — iniciado por petición de Tony el 2026-11-02.
- Resultado: empezar la aplicación con un recorrido interactivo y preparar la elección de una zona real a partir de cobertura y derechos.
- Aceptación de esta entrega inicial: mapa y lista accesibles, selección de fecha y hora, filtro y enlace compartible; datos ficticios y límites visibles, sin presentar resultados como predicciones. Pruebas de comportamiento y revisión de navegador en móvil y escritorio.
- Entrega inicial: ejemplo local implementado con cuatro lugares ficticios, mapa y lista sincronizados, fecha, hora, filtro, selección y enlace compartible. Los estados no se presentan como predicciones.
- Comprobación: cuatro pruebas de comportamiento en Node y revisión en Chromium con anchos de 320, 390, 768 y 1440 píxeles, teclado, movimiento reducido, ampliación CSS al 200 %, enlace compartido y ausencia de JavaScript. La comprobación no sustituye una prueba en dispositivos ni valida predicciones solares.
- Fuentes candidatas: el censo municipal de Madrid identifica aproximadamente la puerta del local, no la posición de sus mesas; el municipio publica alturas estimadas y modelos de edificios que aún requieren revisión de cobertura y precisión.
- Mandato: implementación y pruebas locales en este repositorio; sin publicación ni recursos de BuildApp. La existencia de un futuro backend común no autoriza crearlo en este encargo.
- Continuación 2026-11-03: Tony pidió arrancar la app y eligió Madrid. El ejemplo calcula posición solar y sombras sintéticas; se comprobó una referencia independiente, noche, geometría simple, cambios de hora y navegador. La consulta real del censo municipal de Ayala/Recoletos devolvió tres registros y muestra su falta de datos solares; también se probaron fallo, vacío y texto no confiable.
- Continuación 2026-11-03: Tony pidió una experiencia visual más potente. Se añadió una escena ilustrada en perspectiva con sombras variables, reproducción del día y tramos de sol aproximados cada 10 minutos. Escena, estados y tramos comparten el cálculo solar; el barrio sigue siendo ficticio y la consulta real carece de posición de mesas. Se probaron geometría analítica, límites de reproducción y casos sin datos, y se inspeccionó Chromium en móvil, escritorio y zoom al 200 %. Pendiente validar datos y sombras reales, no cerrado por la mejora visual.
- Siguiente acción: comprobar acceso, fecha, cobertura y calidad de alturas de edificios en Ayala/Recoletos; conseguir posiciones verificables de mesas y contrastar el resultado con observaciones antes de presentar estimaciones reales. Revisar cuota y caché antes de aumentar tráfico.
- Contexto: [fuentes](../docs/DATA_SOURCES.md), [producto](../docs/PRODUCT.md) y [roadmap](../docs/ROADMAP.md).

Al cambiar de etapa: resultado, evidencia, bloqueo y siguiente acción concreta. Cerrar una tarea solo si se cumple su aceptación, no por haber agotado una sesión.

## REPO-001 — Guardar el proyecto en GitHub

- Estado: `done` — completado y comprobado el 2026-11-02.
- Resultado: crear un repositorio privado en su cuenta y subir la copia completa del proyecto, con Git local enlazado.
- Aceptación: comprobar cuenta, privacidad, archivos y sincronización entre el repositorio local y GitHub; excluir credenciales y archivos temporales según `.gitignore`.
- Evidencia: cuenta `TonyRod116` autenticada; Git local enlazado al [repositorio privado](https://github.com/TonyRod116/rato-al-sol) y rama `main` subida. GitHub y la copia local coinciden en 34 archivos, incluidos permisos y contenido; las comprobaciones del proyecto y las cuatro pruebas de comportamiento pasan.
- Siguiente acción: continuar la fase de datos y cálculo real descrita en APP-001.

## DOCS-002 — Orientación de producto, publicación y backend independiente

- Estado: `done` — documentación comprobada el 2026-10-30.
- Encargo: documentar propósito y rutas de frontend/backend, siguiendo las prácticas de BuildApp sin tocar su sistema profesional activo.
- Decisión: puede existir una API nueva común para las tres apps; sin compartir recursos ni credenciales con BuildApp.
- Alcance: guía raíz, canon y copias IA, README e índices de memoria. Solo Markdown; no código de producto, configuración operativa, creación de servicios ni despliegues.
- Aceptación: guía obligatoria visible al entrar desde CLI, rutas propuestas diferenciadas de destinos reales y prohibición explícita de usar BuildApp.
- Evidencia: sincronización IA, `python3 scripts/repo_check.py`, enlaces de la guía y revisión del alcance Markdown superados. Sin operaciones de infraestructura.
