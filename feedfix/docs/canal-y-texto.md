# Canal comercial: bloqueado hasta configurar y demostrar cumplimiento

## La ley y el contrato del proveedor son dos puertas distintas

- [FTC CAN-SPAM](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business): se aplica también a B2B. Encabezados veraces, asunto no engañoso, identificar el anuncio, domicilio postal físico válido, baja clara y funcional, mantener la opción de baja por al menos 30 días y honrarla dentro de 10 días hábiles. Comprobar además reglas estatales y aplicables al remitente y destinatario; esto no es asesoría legal.
- El contacto debe ser de un comercio cuya ubicación US sea razonablemente verificable y estar publicado por él en su **propio sitio**. Ningún envío desde redes sociales, plataformas freelance, listas compradas o áreas privadas. Si el país o titular del dominio es incierto: no enviar.
- [Resend](https://resend.com/legal/acceptable-use) prohíbe expresamente cold outreach, contactos scrapeados y mensajes no solicitados. [SendGrid](https://support.sendgrid.com/hc/en-us/articles/4404315959835-Email-Opt-in-and-Opt-out-Requirements) requiere consentimiento afirmativo para no transaccionales, también para correos encontrados en Internet. [Mailgun](https://www.mailgun.com/legal/aup/) exige consentimiento explícito y demostrable para mensajes no transaccionales. [Zoho Mail](https://www.zoho.com/mail/help/usage-policy.html) excluye marketing y mensajes automatizados. Sus cuotas gratis **no autorizan** el funnel propuesto.
- [Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html) trata mensajes no pedidos como motivo de revisión y recomienda destinatarios que los solicitaron; no se selecciona para este uso. [Instantly](https://instantly.ai/blog/best-email-api-for-ai-sdr-tools-integration-guide-benchmarks/) comercializa infraestructura de cold outreach, pero su [plan Outreach Growth figura en USD 47/mes](https://instantly.ai/pricing); políticas de buzón, términos, jurisdicción, tarjeta y costo del dominio por verificar. No cumple la hipótesis de operación gratuita continua. No se recomienda rotar dominios para evadir límites ni generar interacción falsa.
- [Tavily AUP](https://www.tavily.com/acceptable-use-policy) prohíbe transmitir, distribuir **o facilitar** marketing no solicitado: no usar sus resultados en el funnel. [Exa MCP](https://exa.ai/docs/get-started/exa-mcp) permite búsqueda sin clave con tasa limitada y su documentación menciona prospección, pero [sus términos §4.2](https://exa.ai/assets/Exa_Labs_Terms_of_Service.pdf) requieren aclarar extracción/copias; la prueba Exa aquí es solo investigación y no habilita guardar resultados ni incorporarlos a outreach.

**Conclusión:** no se verificó proveedor de búsqueda + correo comercial apropiado, gratis y autorizado de extremo a extremo. No enviar ni registrar destinatarios reales hasta cerrar esa brecha; una prueba promocional temporal tampoco es gratis para siempre. Alternativa opt-in: landing donde el comercio solicite información; requiere implementación, identidad y consentimiento reales.

## Política operativa propuesta (ejemplos NO aprobados)

- Arranque solo si están configurados y aprobados, antes de comenzar: nombre legal y dirección postal reales, dominio y SPF/DKIM/DMARC, vendedor identificado como agente IA, capacidad y versión habilitadas, tabla de precios, máximo de descuentos, cobertura, política de supresión, proveedor que permite el uso y registro persistente.
- Ejemplo de límites iniciales a aprobar: máximo 5 empresas/día, 1 mensaje por empresa, sin seguimientos, sin negociación ni descuentos no autorizados. Motivo de tandas: cuotas y reputación/deliverabilidad, nunca una autorización para escribir sin evidencia. El código de demo aplica **0 emails**.
- En producción: baja inmediata vía token firmado de un solo propósito, persistencia duradera de supresión antes de confirmar, además de mecanismo accesible por email; procesar quejas, bounces y petición `No` como supresión. Verificar que funcione durante 30 días como mínimo y dentro de plazo legal y contractual; deduplicar empresas, reservar cuota en transacción y revalidar la supresión justo antes de enviar. En caso de error, reintentar el guardado de baja sin volver a enviar.
- Mensajes reales, respuestas y adjuntos son entrada no confiable: nunca instrucciones de sistema ni autorización de cambios, compras, descuentos, pagos o divulgación. Enlaces solo a dominio verificado; no píxeles de apertura ni tracking invasivo por defecto.
- Si falta cualquier condición o el cliente necesita algo fuera de reglas, el agente **se detiene/cierra o rechaza**, no pide una aprobación humana durante la demo ni inventa evidencias. El cliente podrá subir su archivo real y pagar por self-service cuando los componentes productivos existan; el formulario actual solo admite fixtures y un pago falso.

## Borrador único en inglés — NO LISTO PARA ENVIAR

Este texto es deliberadamente una plantilla con campos sin completar; los vínculos y la baja **no están implementados**. No inventar nombre legal, dirección física, señal de problema ni capacidad. Hay una sola pregunta sí/no y no hay secuencia de seguimiento.

**Subject:** A limited product-feed repair offer from an AI agent

Hello [BUSINESS NAME] team,

I am FeedFix Sales, an AI agent operated by [REAL LEGAL OPERATOR]. This is an advertisement for our product-data service. I am contacting your business because [SPECIFIC, CURRENT, VERIFIABLE EVIDENCE FROM AN ALLOWED SOURCE]; I do not have access to your private Google Merchant Center account and I am not claiming that Google has rejected your products.

My partner FeedFix is intended to provide a limited set of corrections to a CSV or TSV feed, subject to the capabilities and file limits actually enabled and tested before any offer. It must not invent product identifiers, prices, stock or features. Any future change to price or availability would require your authorization and matching, current evidence for the same product variant, market and currency. Anything outside the rules would remain pending; a corrected file would not guarantee Google approval. You would review the scope and price before paying and use a self-service upload rather than grant account access.

We are exploring an agentic economy in which specialized AI agents transparently provide useful services while people keep control of the data and decisions that belong to them. The service and payment terms are available at [LIVE VERIFIED TERMS LINK].

**Would you like to try a scoped FeedFix check?** [Yes — view the offer and upload a file](<YES_LINK_TO_BE_IMPLEMENTED>) · [No](<NO_LINK_TO_BE_IMPLEMENTED>)

To stop any future promotional email from us, [unsubscribe here](<FUNCTIONAL_UNSUBSCRIBE_LINK_TO_BE_IMPLEMENTED>), or reply with “unsubscribe”.

FeedFix Sales — AI agent for [REAL LEGAL OPERATOR]\n[REAL, VALID PHYSICAL POSTAL ADDRESS]\n[REAL REPLY ADDRESS AND WEBSITE]

## Pagos y entrega

Stripe Payment Links o Mercado Pago son opciones documentadas, no integraciones ejecutadas. Se necesita cuenta elegible, moneda/pais habilitados, identidad y titularidad, link por pedido o mecanismo confiable de correlación, verificación de firma, consulta del objeto de pago, importe/moneda/estado, idempotencia, privacidad, antifraude, reembolsos y entrega segura. Una redirección del navegador **no prueba pago**. [Stripe](https://docs.stripe.com/api/payment-link); [Mercado Pago](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-preferences/payment-notifications) advierte que el test no produce notificaciones reales salvo simulación desde integraciones. La aceptación, orden NEAR Testnet, pago fiat y payout al vendedor son pruebas diferentes.
