# Decisiones — Rato al Sol

## 2026-10-30 — identidad y ubicación

- Confirmado por Tony: nombre **Rato al Sol**, carpeta `rato-al-sol` bajo `Cool_Projects` en WSL.
- Alcance de aquel encargo: preparar archivos base, especialmente a partir de BuildApp. La implementación comenzó después, el 2026-11-02.

## 2026-10-30 — reglas y continuidad

- Se adopta el patrón BuildApp: `AI_SHARED_INSTRUCTIONS.md` canónico y cinco copias para agentes, con sincronización y comprobación automáticas.
- Se reutiliza su memoria `.memory`, lectura selectiva, cambios pequeños, revisión por riesgo y QA visual. MTM aporta solo disciplina general de evidencia y conservación de negativos.
- Auto Review sigue la preferencia global de Tony; la configuración del repo no amplía permisos ni fija un modelo.
- Lista inicial de tareas en `todo.md`. No se presupone Beads ni se instala un tracker. Si se configura, se migra el trabajo activo y se conserva una sola fuente de estado.
- No se añaden frameworks, dependencias, credenciales, infraestructura, remotos ni workflows de release de los proyectos de referencia.

## Decisiones abiertas

Ciudad/barrio, posición real de terrazas, dataset de geometría/alturas, biblioteca solar, tolerancia del modelo y hosting del mapa pendientes de comprobación.

Documentar el motivo y la evidencia al resolverlas. No convertir una propuesta en decisión aprobada por copiarla desde una conversación o desde otro repo.

## 2026-10-30 — despliegue documentado y frontera de BuildApp

- Petición explícita de Tony: orientar a cualquier IA desde CLI sobre el producto, frontend, backend y publicación, sin implementar ni tocar infraestructura en este encargo.
- BuildApp es un proyecto profesional activo: no modificar ni utilizar sus servicios, repositorios, bases, credenciales, almacenamiento, web roots, DNS o despliegues para Cool Projects.
- Permitido: un backend NUEVO común exclusivamente para Hora de Salir, Rato al Sol y TiendeYa. Carpeta propuesta `Cool_Projects/cool-projects-api/`, todavía inexistente; no es una cuarta app ya creada.
- Referencia de publicación: IONOS + Cloudflare para cada frontend y Render para un servicio de API nuevo. No hay dominios, servicios, claves o recursos nuevos provisionados.
- Rutas de código, puertos y endpoints en la guía son propuestas, no despliegues reales. Stack y destinos reales se comprobarán y registrarán durante el encargo que los implemente.
- Canon de orientación: [PROYECTO_Y_DESPLIEGUE.md](../PROYECTO_Y_DESPLIEGUE.md). No copiar comandos operativos o secretos de BuildApp.

## 2026-11-02 — primer recorrido local

- Tony pidió empezar a construir la app. Se elige un frontend estático, sin dependencias ni servicios, para probar fecha, hora, filtro, mapa, lista y selección compartida.
- Los intervalos y los cuatro lugares son inventados y están marcados como ejemplo. No se implementa ni valida un motor solar, ni se infiere sombra real de la entrada de un local.
- El censo municipal de Madrid es un candidato útil, pero sus coordenadas describen aproximadamente la puerta del negocio. El municipio también publica datos de edificios y alturas estimadas; falta verificar la posición de las mesas y la cobertura y precisión de esos datos antes de presentar resultados reales. Ver [fuentes](../docs/DATA_SOURCES.md).
