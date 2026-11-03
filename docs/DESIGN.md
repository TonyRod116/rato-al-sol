# Diseño — Rato al Sol

## Dirección de la primera pantalla

La pantalla es una herramienta para explorar terrazas y, a medida que existan datos suficientes, elegir un momento de sol o sombra. La referencia visual aprobada conserva papel cálido, amarillo de sol, tipografía con carácter y un barrio en perspectiva. La primera vista presenta ahora un mapa real de Ayala y el censo municipal; un selector separado abre la escena vectorial ficticia, cuyos intervalos no son predicciones reales.

- En escritorio, el mapa real ocupa el espacio principal y la lista acompaña al mapa; en móvil se muestran el mapa, la invitación a la simulación y la lista. Los edificios se presentan con volúmenes orientativos y se pueden girar o ver desde arriba. Los puntos representan entradas aproximadas, no mesas. En la prueba ficticia, escena y detalle comparten selección.
- La fecha, el control de hora y la reproducción opcional mueven las sombras; una línea presenta los tramos aproximados y la hora elegida. El aviso de ejemplo y los estados con texto son visibles sin depender solo del color.
- Paleta: fondo crema, texto verde oscuro, amarillo solar, azul apagado para sombra y terracota para acentos. Títulos con serif del sistema y controles con tipografía de sistema; no se descargan fuentes.
- Controles con foco visible y tamaños cómodos; la escena ficticia es un SVG con botones reales y equivalentes en la lista. La reproducción solo comienza si la persona la solicita y puede detenerse; se respeta la preferencia de movimiento reducido.

La referencia es un boceto, no evidencia del producto. Se revisaron capturas reales del ejemplo en 320, 390, 768 y 1440 px, además de ampliación CSS al 200 %; el registro del alcance está en [calidad](QUALITY.md).
