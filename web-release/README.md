# Fuente web de Rato al Sol — versión 63c5771784796ce6

Esta carpeta conserva de forma independiente la fuente y el empaquetador de la versión web identificada como `63c5771784796ce6`. Coincide con la versión publicada en https://tony-r.com/rato-al-sol/. Está separada del código compartido con la app móvil.

Contiene únicamente los 31 archivos de `frontend` declarados en `scripts/build-web.mjs`, el empaquetador y seis archivos de pruebas de la web. El directorio `frontend` de esta copia es independiente del `frontend` compartido con la app móvil: no debe sustituirse el de la app por esta copia sin revisar sus imports y volver a probarla. En particular, `shared/time-selection.mjs` difiere en ambas versiones.

## Reproducir y comprobar

Desde esta carpeta, con Node.js instalado:

```sh
node --test tests/*.test.mjs
node scripts/build-web.mjs --output /ruta/nueva/rato-al-sol
```

La ruta de salida debe ser nueva. El directorio creado debe contener `releases/63c5771784796ce6`; el SHA-256 de `index.html` esperado es `0168c2573404b72326a7a9657afdf3fe14efdf7b39ee9c914d3dc8c4d981f6af`. Los 30 archivos de la carpeta de esa versión se han comparado byte a byte con la copia preparada para publicación. Para verificar el contenido de una instalación pública se necesita además contrastarla con el servidor.

Este subdirectorio conserva una versión web independiente. Antes de cambiar archivos compartidos con móvil, revisa sus imports y vuelve a probar ambas plataformas.
