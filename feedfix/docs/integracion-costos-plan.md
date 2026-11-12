# Marketplace existente, integración mínima y costos

## Qué se inspeccionó, sin modificar

Referencia en commit [`e867ec1ca34fa3532900fc541f42ffd267eb0f44`](https://github.com/ceciliaabarreraa-art/Agent-Work-Exchange/tree/e867ec1ca34fa3532900fc541f42ffd267eb0f44): `contract/src/lib.rs`, `worker/src/index.js`, `worker/wrangler.toml` y [evidencia histórica de Testnet](https://github.com/ceciliaabarreraa-art/Agent-Work-Exchange/blob/e867ec1ca34fa3532900fc541f42ffd267eb0f44/evidence/ciclo-feliz-testnet.md). No se reescribió el marketplace, contrato, escrow, verifier ni cuentas. El conector de Cloudflare/GitHub no estuvo disponible para esta conversación; la inspección fue sobre el repositorio público de referencia, no sobre una instancia desplegada del usuario.

### Contrato y frontera de confianza

`deposit` acredita el saldo interno del llamante; `create_order(seller, verifier, gross_amount)` inmoviliza el saldo del buyer; `submit_delivery(order_id, sha256_hex, delivery_ref)` lo ejecuta solo el seller; `approve_and_release(order_id)` o `refund(order_id)` los ejecuta el verifier permitido y separado; `withdraw(amount)` inicia transferencia con callback que restaura el saldo ante fallo. `Released` acredita saldos internos: por sí solo **no** prueba un `withdraw` exitoso, y nunca representa fiat.

La lectura Testnet nueva [guardada](../07_Pruebas/testnet_solo_lectura_resultado.json) vio `get_config`: treasury `mi-tiendita-madre.testnet`, verifier `verifier.mi-tiendita-madre.testnet`, `paused=false`, fee **200 bps = 2%**. `get_order(0)` muestra buyer/seller/verifier distintos, `Released`, gross 0,02 NEAR, fee 0,0004 y saldo de seller 0,0196 NEAR. Se hicieron **0 transacciones**. La documentación histórica dice que se ejecutó retiro, pero los intentos de verificar de nuevo las transacciones históricas dieron timeout; no presentamos ese retiro como verificado independientemente en esta iteración. La orden histórica no es FeedFix.

La demo local usa una comisión de **5% ficticia** y moneda USD ficticia; no se confunde con el 2% del contrato existente ni convierte USD a NEAR.

### Worker existente: rutas exactas observadas

- Públicas: `GET /health`, `GET /near/config` (solo configuración del Worker, **no** `get_config` on-chain), `GET /near/order/{id}`, `GET /near/balance?account_id=...`, `GET /near/tx/{hash}?sender=...`, `GET /agents`, `GET /offers`.
- Protegidas por el mismo bearer `API_TOKEN`: `POST /near/broadcast`, `POST /agents`, `POST /offers`, `POST /orders/record`, `GET /ledger`, `POST /ledger/entry`, `POST /admin/pause`. `/near/broadcast` espera `signed_tx`, `sender_account_id`, `idempotency_key` y devuelve 202 `submitted`; eso no confirma ejecución final ni receipts. Las claves de firma no están disponibles aquí y nunca deben ir en el cliente ni en un registro.
- `/agents` reconoce solo `buyer`, `seller`, `verifier`, no el rol comercial Sales. Las ofertas no hacen matching automático. `/ledger` es espejo operativo, no autoridad sobre fondos. No hay API existente de webhook fiat, conciliación entre moneda/orden, almacenamiento privado de entregas ni pago al vendedor en moneda fiat.
- Riesgos observados, sin cambios en el repo: la API comparte un token amplio y CORS `*`; `POST /admin/pause` guarda `intake_paused` pero no encontramos lectura que bloquee intake; la pausa on-chain es separada. `/orders/record` rechaza el id numérico `0` por falsy pero acepta el texto `"0"`; `INSERT OR IGNORE` puede devolver `recorded: true` aunque no inserte. Hacer una comprobación de existencia/identidad y receipts, no confiar solo en 201/202. Una modificación mínima documentada solo tras demostrar necesidad y autorización: lectura efectiva de pausa donde se inicia intake, manejo id 0/idempotencia y controles de autenticación; no rediseñar contratos o rehacer infraestructura funcional.

## Encaje mínimo propuesto, sin afirmar que existe

1. **Antes de ejecutar:** confirmar qué claves y cuentas existentes corresponden a cada rol, financiación Testnet, autorizaciones y política; buyer **interno** podría ser el actor comercial que contrata a FeedFix, pero esta asignación no fue aprobada ni se hizo. La cuenta de un comprador externo humano no se presupone. Solo signer autorizado puede crear orden, depositar o retirar.
2. La nueva capa de orquestación llama a interfaces existentes y escucha transacciones/receipts. A2A Sales→FeedFix usa mensajes autenticados, correlación e idempotencia. El verifier es infraestructura independiente, no tercer agente comercial.
3. Self-service comercial y pago fiat necesitan componentes separados: identidad, términos, carga privada, autenticación de evidencia y autorización, precio aprobado, Payment Link, webhook firmado, reconciliación y entrega segura. Una confirmación fiat no fondea mágicamente el escrow NEAR. Se requiere esquema contable, reservas, tipo de cambio y conciliación explícitos; no se inventa un puente.
4. En la demo actual `on_chain_submission_allowed=false`: no se presenta el archivo al contrato ni se usa el `RELEASED_FAKE` como autorización. Para un futuro ensayo Testnet firmado se necesita una aceptación de demo **específica, previa y comprobable**, y distinguir cualquier artefacto sintético de un servicio completado.
5. Confirmar `get_order` y receipts; observar éxito/fallo del callback de retiro. Reembolsos/contracargos después del release y payout fiat requieren diseño adicional, fuera del contrato observado.

## IA comercial real: brecha explícita

El proceso Sales de la demostración es un **orquestador determinista**, no ejecuta un LLM ni demuestra razonamiento de IA. No se lo debe presentar como IA ya desplegada. Para convertirlo en el agente IA pedido haría falta seleccionar y autorizar previamente un servicio de inferencia cloud, verificar sus condiciones, disponibilidad y costo efectivo dentro de la cuota gratuita, probar privacidad y derechos de uso comercial, y limitar las herramientas que puede invocar. No se verificó aquí ningún proveedor de inferencia que cumpla todo eso a costo cero.

El modelo, si se habilita, puede proponer investigación o redactar dentro de una plantilla; **no** debe alterar precios/límites, saltar supresión, interpretar una señal como prueba, inventar problemas o ejecutar acciones prohibidas. Un control determinista independiente vuelve a validar cada salida contra la política preaprobada y cierra ante falta de permisos. Esto es un diseño pendiente: tampoco está probado contra prompt injection ni datos reales.

## 1–3 días: decisión honesta

- **Hoy, demostrable sin operación durante la ejecución:** búsqueda de investigación bloqueada, dos actores IPC, corrección sintética, webhooks/ledger fake y casos negativos. No hay pago real ni marketplace A2A real.
- **Día 1, solo si se dispone antes de empezar de roles y claves Testnet autorizados:** implementar un adaptador pequeño que use las interfaces reales, demostrar firmantes, y observar un ciclo real de testNEAR con artefacto de prueba expresamente permitido, verifier independiente y receipts/withdraw. Es factible como objetivo, **no está construido ni garantizado**; si no se cumplen prerrequisitos, se mantiene el recorrido ficticio. El resultado no acredita prestación real a un comercio.
- **Días 2–3, condicionado:** self-service productivo (la pantalla actual solo admite fixtures), storage privado, entorno de prueba de un procesador y webhooks server-to-server automatizados, validación de seguridad/idempotencia. El usuario informó que solo Testnet está listo; no existe procesador de pruebas configurado. No es honesto prometer un E2E fiat real en ese plazo. Una notificación de prueba de Mercado Pago que deba pulsarse en un panel durante la corrida **no** cumple cero intervención. Probar integración de test antes y automatizar el estímulo solo si las herramientas/condiciones reales lo permiten.
- Outreach real autónomo además depende de candidatos frescos, identidad, proveedor permitido y cumplimiento; hoy no hay ninguno habilitado. Preferir demo con comercio sintético o usuario que voluntariamente entra por self-service; no simular ventas.

## Costos y límites: no confundir $0 con crédito o tarjeta

| Recurso | Referencia / situación | Lo que aún falta |
|---|---|---|
| [Workers Free](https://developers.cloudflare.com/workers/platform/pricing/) | 100.000 requests/día y 10 ms CPU/invocación, cuenta compartida. Playground no aplica ese enforcement. | Nuestros picos de 12/13 ms hacen que Free de 500 filas no esté validado. Memoria isolate y coordinador no medidos. Plan Paid tiene mínimo publicado de USD 5/mes; no activarlo sin autorización. |
| [D1 Free](https://developers.cloudflare.com/d1/platform/pricing/) | 5 millones filas leídas/día, 100.000 escritas/día, 5 GB total. | Índices agregan escrituras; estado durable no integrado ni medido. |
| [Workflows Free](https://developers.cloudflare.com/workflows/reference/pricing/) | 3.000 steps/día y 1 GB-mes, requests/CPU compartidos; facturación y políticas pueden cambiar. | No se construyó ningún Workflow; 1 step por chunk/lote agotaría la cuota mucho antes que requests. No asumir equivalencia step/request. |
| [R2 Standard](https://developers.cloudflare.com/r2/pricing/) | Incluye cuota gratis de almacenamiento/operaciones. | Disponibilidad de checkout/tarjeta y cobros deben confirmarse en la cuenta; no suponemos activación sin pago. No integrado. |
| Exa MCP | Búsqueda keyless limitada probada; no se prometen límites permanentes. | Sin aprobación de uso comercial/retención. |
| Correo frío | No hay proveedor gratuito confirmado que autorice esta combinación. | Producto especializado puede costar; buzón y dominio pueden costar aparte. |
| Stripe / Mercado Pago | Cuenta de prueba no está lista; su comisión real depende de país/producto. | Elegibilidad, tarjeta, KYC, comisiones, reembolsos y costo de transferencia no verificados. |
| NEAR Testnet | testNEAR no es dinero real. | Gas y saldos de cuentas preexistentes no verificados aquí; no afirmar cero costo en mainnet. |

En el ensayo directo hubo 373 llamadas para un feed pesado con fuente y evidencia. Si cada una contara como request y todo el cupo de 100.000 fuera libre, `floor(100000/373)=268` cargas/día sería un **techo aritmético**, no capacidad, confiabilidad ni diseño validado. A una fila por lote serían hipotéticamente 273+500=773 llamadas y techo 129, excluyendo intake, reintentos y coordinación. Otra arquitectura puede facturar diferente. Ambos límites son irrelevantes hasta resolver CPU, storage y seguridad.

**Escenario financiero previo, no tarifa aprobada:** para 101–500 filas se supuso 2 h × USD 12 + USD 0,50 de cómputo + USD 5 de adquisición + USD 0,30 fijo = USD 29,80; comisión porcentual ficticia 5% y margen objetivo 40% implican `29,80/(1−0,05−0,40)=54,1818…`, piso redondeado hacia arriba USD 54,19. Con precio hipotético USD 99 quedan USD 64,25 antes de impuestos y otros costos, no beneficio garantizado. Son supuestos, no tarifa real ni aprobación del usuario. El demo de 1 fila usa otra tabla ficticia.
