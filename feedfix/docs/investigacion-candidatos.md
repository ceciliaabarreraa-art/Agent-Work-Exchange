# Investigación de candidatos: señales, no una lista de envío

Fecha local indicada por la sesión: **9 noviembre 2026**. El reloj del sandbox y algunos servidores devolvieron **10 noviembre UTC**; conservar las horas observadas y verificar la fecha externa antes de dar por vigente una prueba. Las fechas bajo cada fuente son las publicadas por esa fuente, no la fecha de un diagnóstico actual.

## Regla de elegibilidad, no negociable

1. **Tanda 1:** comercio/startup tecnológica con tienda propia + interés en IA + problema concreto y actual del feed Google verificable y dentro del alcance.
2. **Tanda 2:** agencia e-commerce + interés en IA + evidencia verificable de feed problemático que justifique la oferta actual y su relación con la agencia.
3. **Tanda 3:** comercio con problema actual y verificable de feed Google. **No se exige interés en IA**. Sin problema verificable tampoco entra.

Además: certeza razonable de EE. UU. del destinatario y el mercado correspondiente, dirección publicada en el sitio propio del comercio/empresa, alcance probado, legitimidad y autorización contractual del buscador/proveedor de correo, remitente y domicilio reales, baja operativa y supresión. Si falta una, **no se envía**. Una noticia vieja, una mención de Shopping, un `Product` JSON-LD o que una web no figure en búsquedas no prueban un feed erróneo. El estado `Needs attention` de Google no es público sin autorización.

## Tandas de investigación: todos bloqueados

| Prioridad de investigación | Empresa y evidencia | Señales | Obstáculo que impide contactar |
|---|---|---|---|
| 1, **hipótesis** | [Packwire, 6 ago 2026](https://packwire.com/blog/ai-shopping-agents-product-feed): cuenta que tenía diez fichas antiguas y reconstruyó su feed para agentes de compras. Es una tienda propia con clara señal IA. | Problema pasado **autodeclarado**, ya abordado; IA sí. | El artículo informa 893 filas generadas: puede exceder el límite probado de 500; startup tecnológica en sentido estricto no demostrada; problema actual no probado; [política](https://packwire.com/privacy-policy) describe operaciones/ámbitos de EE. UU. y Canadá, no establece por sí sola la ubicación del destinatario. No enviar. |
| 2 | [Greenlane, 20 mar 2025](https://www.greenlanemarketing.com/case-studies/how-ai-powered-descriptions-helped-our-clients-ads-break-through-googles-shopping-feed): agencia relata un caso estadounidense de cliente anónimo con descripciones pobres y solución asistida por IA. | IA y problema histórico relatado; agencia real. | El cliente no está identificado, la agencia relata haberlo trabajado, y generar descripciones de salud no es capacidad habilitada de FeedFix. No es evidencia de necesidad actual ni justifica escribirle. |
| 2 | [W3Era, 2 nov 2026](https://www.w3era.com/blog/artificial-intelligence/ai-marketing-agency/): habla de IA y de un caso de feed restringido de Cured Pharmacy, UK, corregido en 2025. | IA; caso histórico informado por la agencia. | Operación/destinatario concretos en EE. UU. no confirmados; problema era de un cliente británico, con productos sanitarios y solución relatada. La restricción de productos médicos no es corrección de datos que el motor ofrezca. No enviar. |
| 3, fuera por país | [Ruby Rose Bloom, 14 ago 2026](https://dev.to/dalenguyen/rich-results-shopping-and-ai-mode-what-google-merchant-center-actually-gets-you-5fem): la persona que publica describe una contradicción `identifier_exists`/marca en 35 artículos y dice haberla corregido. | Evidencia histórica detallada, no necesariamente error de Google; interés en IA. | [Su tienda indica Canadá y envía solo allí](https://rubyrosebloom.com/returns). Problema descrito como corregido y campo no habilitado para autocorrección. No contactar. |
| 3, fuera por país | [Caso HairMax, febrero 2025](https://community.shopify.com/t/shopify-markets-google-merchant-centre-pricing-error/392668/1): se reportan precios EUR/GBP y redirecciones para UK/EU. | Problema histórico relatado; IA irrelevante en tanda 3. | Caso público alojado en una comunidad: **solo contexto**, no origen de email ni canal de contacto. No demuestra vigencia ni destinatario US; no se presume que una alteración del feed resuelva redirects/schema. No contactar. |

Resultado: **0 candidatos habilitados**. Aun los dos primeros tienen las dos señales de investigación, no dos pruebas suficientes para un envío. La lista no se convirtió en CRM de contactos ni se extrajeron direcciones personales. No hacer afirmaciones sobre la situación actual de ninguna empresa.

## Qué evidencia sí permitiría avanzar

- Declaración pública reciente y específica del propio comercio sobre su feed, o comparación autorizada y reproducible de **feed real + producto/variante/mercado/moneda + precio y disponibilidad de página y checkout**. Registrar URLs y hora, sin extraer áreas privadas, respetando permisos y sin concluir el estado interno de Google.
- Identidad/ubicación US del comercio y destinatario, email publicado en dominio propio, base y uso que no infrinjan términos de la fuente y del proveedor. En caso de jurisdicción incierta, no enviar.
- Alcance: hasta 500 filas y 1 MiB por archivo bajo el parser incremental, registro ≤8.192 unidades UTF-16; price/availability solo con evidencia, autorización auténtica y fresca. El prototipo aún no verifica autenticidad de esas pruebas y jamás certifica aprobación Google.
- Volver a comprobar que el problema no se solucionó y que no hubo baja. Ningún campo faltante se completa por intuición.

## Comprobación dinámica

[Discovery ejecutable](../03_Discovery/README.md) obtiene resultados nuevos por API y ordena señales 0/1/2, pero **no verifica** automáticamente el problema, correo ni jurisdicción. El modo real es investigación, no sender. En la prueba guardada: 3 búsquedas, 24 resultados, 9 dominios no bloqueados únicos, 0 para enviar; no se guardaron snippets ni direcciones. Uso comercial y conservación de resultados Exa pendientes de aclaración contractual.
