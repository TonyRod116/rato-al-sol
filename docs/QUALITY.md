# Calidad — Rato al Sol

## Comprobación disponible hoy

```bash
node tests/demo.test.mjs
node --check frontend/app.mjs
node --check frontend/demo-data.mjs
python3 scripts/repo_check.py
bash scripts/check-ai-instructions.sh
```

Los tests de Node comprueban intervalos ficticios, datos ausentes, filtros y validación del enlace compartido. Los dos últimos comandos comprueban solo documentación/configuración. El frontend es HTML/CSS/JavaScript estático, sin build, compilador de tipos ni linter configurado. Nada de esto valida un cálculo solar: todavía no existe.

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
