# Demo A2A autónoma — solo sintética

## Ejecutar en el equipo de evaluación

Requiere Node.js 20 o superior; sin instalar paquetes, sin credenciales ni conexión.

```bash
cd iteracion-4
node 05_A2A_Demo/demo.mjs
node 05_A2A_Demo/demo.mjs --bloqueado
node --test 05_A2A_Demo/test_demo.mjs
```

Tras el comando no se pide ninguna acción al operador. Se sobrescriben solo archivos en [`resultados/`](resultados/). La entrada es un comercio y fuente **ficticios**; no se envía email. El primer recorrido registra diez eventos y produce un CSV y auditoría sintéticos. El segundo usa las seis filas del golden, detecta 5 pendientes y termina sin cobro ni pago. Las pruebas [guardadas](resultados/pruebas_demo.txt) son 8/8.

### Recorrido self-service interactivo

```bash
# Desde iteracion-4: iniciar una vez y dejar corriendo
node 05_A2A_Demo/servidor_local.mjs
# Desde otra terminal: pruebas HTTP sintéticas
node --test 05_A2A_Demo/test_self_service.mjs
```

En una computadora local se abre `http://localhost:8797`; en una vista previa remota se usa **la URL que provee la plataforma**, no `localhost`. La persona que representa al comercio descarga la fixture de 1 o 6 filas desde la página, la sube y pulsa cotización y, si procede, pago ficticio. Sales solicita el trabajo en un segundo proceso FeedFix. Solo se aceptan los dos hashes exactos de fixture; la de 6 filas queda bloqueada. Para la de 1 fila, el botón genera evento, entrega, release y retiro **fake**, permite descargar el CSV `NO_APTO` y muestra importes ficticios. Las [pruebas HTTP](resultados/pruebas_self_service.txt) son 8/8; no son una prueba automatizada de navegador ni de accesibilidad.

El servidor es **de laboratorio, sin login, sin persistencia segura y expuesto a quien pueda alcanzar su puerto**. No aceptar, subir ni transportar datos reales; no exponerlo en una red no confiable, usarlo para producción ni interpretar su ID aleatorio como autenticación. Una persona puede representar al comercio; el equipo operador no necesita intervenir una vez iniciado. Se detiene después de la demo. Tiene un límite por corrida de 50 peticiones de cotización y la política ficticia limita las cotizaciones exitosas; reiniciarlo borra la memoria. Los pagos reales y el self-service productivo faltan.

## Qué comprueba y qué no

| Paso | Lo que se ejecuta aquí | Lo que **no** prueba |
|---|---|---|
| Cliente sube feed | En consola hay fixture automática; en self-service la persona sube una de dos fixtures exactas | No hay sesión ni cliente, feed o upload productivo real. |
| Sales consulta a FeedFix | Dos procesos Node separados, mensajes IPC y `job_id` | No se usó un modelo LLM, infraestructura A2A estándar ni red productiva; son actores de software, no prueba de inteligencia general. |
| FeedFix prepara | Motor incremental: 1 fila, 2 cambios, 0 incidencias, hash y auditoría | La evidencia/autorización es ficticia; `NO_APTO` y ambos permisos reales son `false`. No certifica Google. |
| Precio/link | Tabla fija ficticia USD 29, sin descuentos; link bajo `.invalid` | No es precio aprobado ni Payment Link Stripe/MP. |
| Webhook y cobro | Evento local `PAID_FAKE`, HMAC con clave pública de prueba, correlación e idempotencia | No integra ni valida firma real de Stripe/MP, ni representa dinero real. |
| Entrega | Hash, archivo y auditoría sintéticos locales | No existe storage privado, destinatario ni entrega real. |
| Aprobación y pago | Guardia determinista simulada y asientos `RELEASED_FAKE`/`WITHDRAWN_FAKE`, fee hipotético 5% | No consulta el verifier existente, no llama marketplace ni NEAR; no es liquidación ni retiro Testnet/fiat. |

La guardia acepta **deliberadamente una corrección parcial sin incidencias** dentro del mundo de juguete, únicamente para visualizar la cadena de contabilidad simulada. El motor a la vez conserva `on_chain_submission_allowed=false`. Estos no son estados contradictorios: **ningún adaptador real puede tomar esa aceptación como permiso para presentar o liberar en NEAR**. Si se pretende un resultado comercial completo, falta definir y probar el contrato de aceptación real, autorizar fuentes, y habilitarlo de manera independiente. Un informe o un `NO_APTO` no equivalen a trabajo terminado.

### Evidencia exacta de la simulación

[Traza feliz](resultados/traza_sintetica.json): `PARTIAL_REVIEW_REQUIRED`, 1 fila, 2 cambios, 0 pendientes, SHA-256 `af8615d80b4e3d6ded1728fdb550fc30d1ddfff02eb4568948e58279a626de4f`; el vendedor recibe un apunte ficticio de 2.755 centavos y la tesorería otro de 145 centavos, no fondos. [Traza bloqueada](resultados/traza_bloqueado.json): seis filas, cinco pendientes, cero webhook de pago. Los identificadores de proceso cambian en cada corrida.

## Política previa vs ejecución

La persona del equipo configuraría una vez **antes** del arranque identidad, capacidades habilitadas, tabla y límites, supresión, proveedor, remitente y firmantes. El archivo `politica_solo_simulacion.json` contiene únicamente parámetros ficticios no aprobados; invalida cualquier bandera real. Después de iniciar, el demo no pregunta. Una condición fuera de política se rechaza o queda bloqueada, no espera aprobación en vivo. En este escenario el comprador externo real **sería un comercio humano** que sube un archivo y paga en self-service; aquí la persona interactúa solo con fixtures y dinero ficticio. El verificador/guardia es infraestructura del marketplace, no un tercer vendedor ni un cliente agente.

## Seguridad de laboratorio

No usar la clave HMAC pública, los mensajes IPC, el ledger en memoria ni enlaces `.invalid` en producción. El estado/cupo se pierde al terminar el proceso. La prueba de replay cubre eventos repetidos; no cubre concurrencia distribuida, recuperación tras caída, contracargos ni firmas de proveedores. El cliente y cualquier evidencia pueden ser maliciosos; hay que autenticar, limitar y validar independientemente antes de activar un proceso real.
