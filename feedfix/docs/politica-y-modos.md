# Dos modos distintos: autonomía de demo y supervisión posterior

## A. Política preaprobada: demo/hackathon

**Una única configuración y aprobación previa al arranque por la persona responsable. Después del arranque, cero intervención del operador:** nada de G3–G5 en vivo, confirmaciones manuales de precio, revisión en mitad de la orden o firmar manualmente. El cliente externo es un comercio humano, no un agente; puede elegir, subir un archivo, aceptar términos y pagar en self-service. No cuenta como operación del equipo.

La política actualmente incluida es **ficticia** y solo sirve para el simulador. Para una demo real, debería fijarse fuera de esta entrega:

1. Identidad legal y fiscal real, dirección postal física válida, dominio, remitente y disclosure inequívoco de IA; credenciales en gestor de secretos, no en chat ni ZIP.
2. Capacidades concretas y versión comprobada de FeedFix; formatos, tamaños, máximo de filas/registro; archivos y mercados permitidos; prohibición de inventar datos. Qué evidencia será suficiente y quién la autentica; alcance de archivo corregido frente a validación por Google. No habilitar `on_chain_submission_allowed` de este prototipo por decreto.
3. Tabla de precios, moneda, vigencia, límites máximos por operación/día y descuentos, impuestos, devolución, límites de riesgo y número de correos; reglas de cuotas y entregabilidad persistentes. Sin precios reales aprobados, sin cotizar ni cobrar a terceros.
4. Cómo demostrar empresa/mercado US, fuente permitida, contacto en sitio propio, fecha y evidencia del problema, consentimiento cuando corresponda, baja, quejas y bounces. Si falta certeza, **omitir y seguir con el siguiente candidato**. Si no hay ninguno, terminar sin enviar.
5. Firmantes y roles reales autorizados antes de la demo: buyer interno, seller FeedFix, verifier independiente y treasury; límites por firma, testnet, fees, saldo, RPC, retención y claves. El comercio humano externo no necesita ni se supone que tenga una de las cinco cuentas existentes.
6. Ruta de cobro, validación de webhook, aceptación, entrega privada, reintentos, fallos/refund, decisión de verificación y `withdraw`. Una operación incierta no se repite ciegamente ni se declara pagada; se reconcilia automáticamente o queda bloqueada. Sin webhook real configurado, no hay pago real probado.
7. Tiempo de vigencia, caducidad, límites y un cierre/pausa seguros **predefinidos**. Un kill switch técnico debe prevenir órdenes nuevas en el lugar correcto; la bandera `/admin/pause` observada no bloquea por sí misma el intake. El contrato pausa creación, no necesariamente otras acciones. No atribuirle un stop completo inexistente.

La configuración se guarda versionada y autenticada por quien corresponda, con auditoría sin secretos. La ejecución verifica la versión autorizada antes de cualquier paso; una política faltante, vencida o incoherente causa cierre seguro. Estas son **especificaciones**, salvo los límites y checks sintéticos concretos del simulador.

## B. Supervisión para producción posterior

Fuera del hackathon se conserva un modo distinto, no obligatorio para la demo:

- **G3, propuesta:** un humano revisa fuentes, jurisdicción, destinatario y texto cuando la política de operación así lo exija.
- **G4, orden/cobro:** un humano aprueba contratos, precio o excepciones sensibles; no se puede alterar el importe luego del pago sin acuerdo.
- **G5, entrega/liquidación:** un verificador independiente revisa evidencia, hash, alcance y aceptación, y se autoriza liberación conforme al proceso real. La decisión puede implicar devolución.

Este modo tiene espera humana y, por definición, **no cumple cero intervención una vez iniciado**. Está documentado para un entorno futuro y no debe confundirse con el modo de demo. Los controles de legalidad, seguridad y verdad no desaparecen en modo autónomo: se hacen previos o mediante reglas automáticas que cierran por defecto.

## Estados de un flujo real propuesto (no implementado)

`RESEARCH_ONLY → QUALIFIED → OFFERED → UPLOADED → QUOTED → PAYMENT_PENDING → PAYMENT_VERIFIED → PROCESSING → DELIVERY_VERIFIED → DELIVERED → RELEASED → WITHDRAWN`.

Ramas: `NOT_ELIGIBLE`, `SUPPRESSED`, `OUT_OF_SCOPE`, `BLOCKED_NEEDS_INPUT`, `PAYMENT_FAILED`, `REFUND_PENDING`, `REFUNDED`, `RECONCILIATION_REQUIRED` y `ERROR_CLOSED`. El webhook se valida y reconcilia servidor a servidor; el depósito de marketplace y la confirmación de pago fiat no son equivalentes. Si un feed devuelve incidencias, no debe presentarse como terminado ni liberarse con el verifier real. Reembolsos o contracargos posteriores a `Released` necesitan un mecanismo adicional, no soportado por el contrato inspeccionado.
