# FeedFix + FeedFix Sales — paquete para el repositorio real

Reempaquetado de la entrega de iteración 4 (auditada por Claude), reorganizado para vivir
en esta carpeta `feedfix/` dentro de `agent-work-exchange`. No modifica `contract/` ni
`worker/` existentes.

## Qué hay acá

- `motor/` — el motor FeedFix (parser incremental + reglas de corrección). 39/39 tests.
  CPU a 500 filas: 12-13 ms medidos en Cloudflare Playground — todavía por encima del
  límite nominal de 10 ms de Workers Free, sin validar por debajo de ese límite.
- `demo-a2a/` — demo del flujo FeedFix Sales → FeedFix → cobro → pago, **completamente
  simulado** (todo evento de dinero/NEAR está marcado `_FAKE` en el propio protocolo).
  No hay NEAR real, no hay procesador de pagos real.
- `discovery/` — búsqueda de candidatos comerciales vía API real de Exa, con scoring
  0/1/2 por señales. Última corrida real: 0 candidatos habilitados para contacto.
- `docs/` — arquitectura, política de modos (autónomo de demo vs. supervisado de
  producción), plan de integración y costos, investigación de candidatos reales,
  canal/texto de contacto, e investigación de nombre (Svarog, descartado: colisión
  directa con "Svarog AI" y choca con el criterio de no usar deidades de religión viva).
- `pruebas/` — matriz de pruebas y verificación de integridad de la entrega.

## Qué falta (no está en este paquete porque no existe todavía)

Procesador de pagos de prueba configurado, proveedor de correo frío autorizado,
self-service productivo (hoy solo acepta dos fixtures exactas), ciclo NEAR testnet real
firmado por FeedFix, y nombre definitivo (Svarog descartado, buscando reemplazo).

## Cómo probar localmente antes de subir

Requiere Node 20+ y Python 3, sin credenciales ni Internet para las pruebas de motor/demo:

```bash
cd feedfix
node --test motor/test/*.mjs
node demo-a2a/demo.mjs
node demo-a2a/demo.mjs --bloqueado
(cd discovery && python -m unittest -v test_discovery.py)
```
