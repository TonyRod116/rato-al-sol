# Web de Rato al Sol

La web ofrece navegación entre Madrid y Barcelona y está en español, catalán e inglés. Si el navegador ya tiene permiso, el mapa se abre cerca de la ubicación actual. Si no puede localizarte, recupera el último centro del mapa guardado en el navegador. La reproducción parte de la hora elegida y vuelve al inicio al llegar a las 22:00.

El paquete usa el mismo lector y la misma cartografía de sombras que el móvil. El navegador pide los tramos de archivo correspondientes a la vista o al punto elegido. Las teselas recientes se reutilizan al mover el mapa. Cuando una zona queda fuera de la cobertura incluida o los archivos no están disponibles, la web consulta los proveedores habituales.

## Preparar una versión

Ejecuta desde `web-release/`.

```sh
node --test tests/*.test.mjs
node scripts/build-web.mjs --output /ruta/nueva/rato-al-sol
```

El empaquetador copia el lector y los datos generados de la app móvil a `releases/<id>/`. El identificador depende del contenido. El alojamiento debe admitir solicitudes HTTP por rangos en los archivos `.bin`. Sirve la carpeta generada para probar esta capa. La vista directa de `frontend/` usa los proveedores habituales.

Para actualizar el sitio, carga primero el directorio de versión completo y comprueba los rangos de los dos archivos de edificios. Sube el nuevo `index.html` cuando los archivos estén disponibles. Conserva una copia del índice anterior para volver a su versión si falla la comprobación pública.

[Fuentes, atribuciones y regeneración de los datos](../docs/DATA_SOURCES.md)
