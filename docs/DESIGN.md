# Diseño — Rato al Sol

## Dirección de la primera pantalla

La pantalla es una herramienta para elegir un momento y comparar terrazas. La referencia visual generada para esta iteración propuso papel cálido, amarillo de sol, tipografía con carácter, un barrio en perspectiva y una línea de sol junto al mapa. La implementación es una maqueta vectorial interactiva, no la imagen ni un mapa real de Madrid; los intervalos se calculan a partir de la escena ficticia.

- En escritorio, la escena ocupa el espacio principal y el detalle diario acompaña al mapa; en móvil, escena y controles preceden al detalle y la lista. Todos comparten la misma selección.
- La fecha, el control de hora y la reproducción opcional mueven las sombras; una línea presenta los tramos aproximados y la hora elegida. El aviso de ejemplo y los estados con texto son visibles sin depender solo del color.
- Paleta: fondo crema, texto verde oscuro, amarillo solar, azul apagado para sombra y terracota para acentos. Títulos con serif del sistema y controles con tipografía de sistema; no se descargan fuentes.
- Controles con foco visible y tamaños cómodos; la escena ficticia es un SVG con botones reales y equivalentes en la lista. La reproducción solo comienza si la persona la solicita y puede detenerse; se respeta la preferencia de movimiento reducido.

La referencia es un boceto, no evidencia del producto. Se revisaron capturas reales del ejemplo en 320, 390, 768 y 1440 px, además de ampliación CSS al 200 %; el registro del alcance está en [calidad](QUALITY.md).
