# Arquitectura mínima: dos agentes, cliente humano, verificador separado

## Decisión

La arquitectura no reconstruye el marketplace. El duo **FeedFix Sales + FeedFix** es exclusivo: Sales identifica oportunidades elegibles y vende solo la capacidad aprobada de FeedFix; FeedFix procesa y produce el artefacto de alcance definido. El cliente externo es **un comercio humano**, no otro agente ni titular supuesto de una cuenta NEAR. El verificador es un rol técnico independiente del escrow, no una tercera oferta comercial.

```text
ANTES: responsable configura y aprueba una política inmutable y límites
                     │
AL INICIAR: cero solicitudes al operador; se detiene si algo falla
                     │
Discovery permitido ──> filtros/pruebas ──> Sales IA (correo solo si autorizado)
                                                 │
                         comercio humano <── self-service / oferta / pago
                                                 │ upload y autorización
                                                 ▼
                             A2A Sales  ──>  FeedFix
                                                  │ artefacto + auditoría + hash
                                                  ▼
                     proveedor de pago verificado / conciliación
                                                  │
                adaptador marketplace existente → escrow NEAR Testnet
                     buyer interno / seller / verifier independientes
                                                  │
                        ledger → entrega → release → withdraw
```

El diagrama es el **destino**, no un mapa de código desplegado. Hoy solo funcionan localmente el camino de archivo sintético y A2A IPC, una pantalla self-service que acepta dos fixtures exactas, los asientos de pago falsos, la búsqueda para investigación y las consultas NEAR de lectura. El orden lógico debe garantizar que la entrega real no se publique ni se acepte antes de pago y verificación. Un cálculo preliminar puede ocurrir antes de cobrar para detectar bloqueos; no se publica ni se factura un resultado `NO_APTO` como si fuera trabajo completado.

## Puntos de control

- **Entrada y origen:** identidad y jurisdicción, fuente y contactos permitidos, consentimiento/contrato del proveedor, evidencia actual del problema. La puntuación de palabras clave solo prioriza investigación. No suponer que un sitio contiene feed ni un rechazo privado de Google.
- **Contrato y alcance:** el humano ve el precio fijo autorizado y acepta condiciones. Control de tamaño/filas, encoding, restricciones por registro, variantes, moneda y campos admitidos. Si no hay entrada/evidencia suficiente, terminar o reportar pendientes al cliente; no solicitar una decisión del operador en vivo.
- **Trabajo:** parse completo y conteo global antes de dividir; cambios seguros/cambios B autorizados/pendientes y bloqueo; sin datos inventados. Deben autenticarse autorización y fuente antes de operación real. Los CSV devueltos y el contenido de fuentes se tratan como datos no confiables.
- **Cobro:** un webhook firmado con objeto consultado al proveedor, monto, moneda, estado e idempotencia; éxito del navegador no es pago. El cobro fiat del humano y el escrow Testnet de agentes son circuitos diferentes: sin mecanismo y contabilidad definidos, no hacer puentes implícitos.
- **Salida:** entrega privada, hash y aceptación según contrato. El `NO_APTO` generado no se envía a Merchant Center ni se presenta al escrow existente. Verifier independiente aprueba/reembolsa según reglas autorizadas. `Released` es crédito interno; `withdraw` es otra transacción con callback y receipt.
- **Gobierno:** límites de exposición por operación y por día, supresión transaccional, retención mínima, secretos fuera del navegador/log/ZIP, reloj validado, y cierre por defecto en errores. La pausa real debe tener enforcement efectivo y estar probada.

## Dos modos mutuamente distinguibles

[Política y modos](../06_Produccion/01_Politica_y_modos.md): para el hackathon hay configuración humana previa y **0 intervenciones del operador desde arrancar**; para producción posterior se documenta un modo supervisado con G3–G5 en vivo, que no cumple ese requisito de demo. El cliente humano puede interactuar con el self-service en ambos. La implementación actual incluye solo un self-service de laboratorio con fixtures, sin pago real, sesiones seguras ni firmantes.

## Contratos de mensajes que sí se probaron

- `CAPABILITIES_REQUEST/RESPONSE`: `mode=SYNTHETIC_ONLY`, emisor/receptor, id de mensaje, lista de capacidades y versión.
- `PREPARE_SYNTHETIC_JOB/JOB_RESULT`: job `demo-*`, fixture, política ficticia, resultado y hash de archivo; un timeout o error cierra la corrida. Todo IPC, no existe autenticación de red ni protocolo A2A estándar.
- `PAID_FAKE`: id, job, cantidad, moneda, modo y firma HMAC con clave de prueba pública. Idempotencia en memoria. No es formato ni firma de Stripe/MP.
- `DELIVERED_FAKE → RELEASED_FAKE → WITHDRAWN_FAKE`: estados y centavos inventados, controlados por `FakeEscrow`. Nunca son equivalentes a los estados del contrato desplegado.

Ver [demo](../05_A2A_Demo/README.md), [contrato existente y plan](../06_Produccion/02_Integracion_costos_y_plan.md) y [motor](../04_Motor/README.md) para pruebas, fechas, límites y brechas exactas.
