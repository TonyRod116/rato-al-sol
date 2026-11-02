# Rato al Sol

**¿En qué terraza tendré sol o sombra a la hora a la que quiero sentarme?**

Un mapa sencillo de terrazas con intervalos estimados de sol y sombra, un selector de hora y la incertidumbre visible donde cambie la decisión.

## Estado real

Existe un primer ejemplo interactivo local de mapa, lista, fecha, hora y filtros. **El barrio, las terrazas y sus estados están inventados: no son predicciones ni sirven todavía para elegir una terraza real.** No hay proveedor conectado, motor solar validado ni despliegue.

## Orientación obligatoria

Leer [PROYECTO_Y_DESPLIEGUE.md](PROYECTO_Y_DESPLIEGUE.md): qué construir, rutas previstas y cómo se publicaría cada parte. BuildApp está protegido; estas tres apps pueden compartir solo un backend NUEVO y dedicado de Cool Projects, todavía no creado.

## Empezar

Para abrir el ejemplo, desde la raíz del proyecto y con el puerto libre:

```bash
python3 -m http.server 5182 --bind 127.0.0.1 --directory frontend
```

Abrir `http://127.0.0.1:5182/` y parar el servidor con `Ctrl+C`. Si el puerto está ocupado, elegir otro; no detener procesos ajenos. El ejemplo es estático y no necesita instalar paquetes ni ejecutar un build.

Para las comprobaciones locales se necesitan Python 3.11 o posterior y Node.js:

```bash
node tests/demo.test.mjs
node --check frontend/app.mjs
python3 scripts/repo_check.py
bash scripts/check-ai-instructions.sh
```

Al editar reglas, cambiar `AI_SHARED_INSTRUCTIONS.md` y ejecutar:

```bash
bash scripts/sync-ai-instructions.sh
bash scripts/check-ai-instructions.sh
```

Los tests verifican el comportamiento del ejemplo, no la exactitud solar. Las comprobaciones de documentación y configuración no prueban la interfaz; el alcance de las pruebas está en [calidad](docs/QUALITY.md).

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

`.env.example` contiene solo nombres internos de variables propuestos, sin credenciales. Su presencia no conecta un proveedor ni fija la API del futuro código. Mantener claves privadas fuera del cliente y del repositorio.

`.codex/config.toml` declara Auto Review sin cambiar modelo, red, sandbox ni directorios. Su aplicación depende del cliente, confianza del proyecto y requisitos administrados; no modifica una sesión ya iniciada.

El repositorio de código es privado: [TonyRod116/rato-al-sol](https://github.com/TonyRod116/rato-al-sol). La app todavía no está publicada como sitio web.
