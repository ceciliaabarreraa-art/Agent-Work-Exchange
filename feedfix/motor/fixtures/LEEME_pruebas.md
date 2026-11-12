# Fixture sintético para diseñar la prueba de FeedFix

**Estado:** archivos de prueba físicos y resultados **esperados** preparados manualmente. El agente no existe y no se ejecutó este caso contra una implementación. No son datos de un cliente, identificadores reales de productos ni una muestra de una entrega comercial.

## 1. Archivos

| Archivo | Propósito |
|---|---|
| `feed_google_entrada.csv` | Entrada ficticia de seis filas y diez columnas. |
| `fuente_autorizada.csv` | Catálogo de prueba para la variante `SYN-001`. Su autorización existe solo como supuesto del caso sintético. |
| `evidencia_pagina_y_checkout_SIMULADA.csv` | Evidencia inventada para el test de `SYN-001`; es un *mock*, no una observación de Internet. |
| `NO_APTO_feed_esperado.csv` | Resultado de referencia escrito a mano para comparar; mantiene problemas y **no es apto para cargar**. |
| `cambios_esperados.csv` | Dos modificaciones esperadas, con línea, antes, después y fuente de prueba. |
| `pendientes_esperados.csv` | Cinco registros esperados de pendientes por fila. |

Todas las URLs usan `example.invalid`, reservado para pruebas. Ninguno de los enlaces, páginas, imágenes o checkouts se consultó. No debe enviarse ningún archivo al Merchant Center.

## 2. Configuración explícita de la prueba

- Perfil simulado: feed Google Shopping en CSV, mercado `US`, moneda del catálogo `USD`, codificación UTF-8, una línea por registro, cabecera en línea 1.
- Hora de evaluación fija: `2026-11-09T15:00:00Z`. El catálogo y la evidencia simulada de `SYN-001` tienen hora `14:30Z`; para esta prueba se considera vigente una fuente de hasta 60 minutos.
- La fuente de `SYN-001` corresponde exactamente al ID de variante, mercado y moneda; se considera autorizada **solo para este caso de prueba**. La página y el checkout simulados coinciden con esa fuente para el precio.
- No hay fuente autorizada para ninguna otra fila. No debe extrapolarse de `SYN-001` a otro producto ni obtener datos de Internet.
- Se comprueban únicamente: conservación de filas/IDs/columnas, precio, disponibilidad, checksum del GTIN aportado, duplicados y procedencia de cambios. Otros requisitos condicionales, imágenes, enlaces y políticas de Google quedan **no evaluados** en esta prueba parcial.
- La palabra `available` se trata como ambigua en este escenario; no se convierte en `in_stock`. `In Stock` de `SYN-001` puede mapearse a `in_stock` porque la fuente simulada confirma el significado.
- Todos los precios y códigos son ficticios. El checksum inválido está sembrado intencionalmente; no se pretende asignar un código a un producto real.

## 3. Resultados esperados

| Fila de datos / línea de archivo | Problema | Decisión esperada |
|---|---|---|
| 1 / 2, `SYN-001` | Precio `19.90 USD` y disponibilidad `In Stock` difieren de la representación de la fuente. | Cambiar a `24.90 USD` e `in_stock`, con dos diffs y referencia a la fuente de la misma variante. Evidencia de página/checkout es simulada. |
| 2 / 3, `SYN-002` | GTIN sintético `1234567890123` no supera su dígito de control. | Mantenerlo sin fabricar uno nuevo; `GTIN_INVALID_CHECK_DIGIT`, pedir dato o evidencia. |
| 3 / 4, `SYN-003` | Precio vacío y sin fuente. | Conservar vacío; `PRICE_MISSING`, pedir precio comprobable. |
| 4 / 5 y 5 / 6, `SYN-004` | Dos filas comparten ID. | Mantener ambas y su secuencia; dos registros por fila de `DUPLICATE_ID`. No fusionar ni renumerar. |
| 6 / 7, `SYN-005` | `availability=available` es ambiguo sin fuente. | Mantener valor original; `AVAILABILITY_AMBIGUOUS` y pregunta. |

**Totales esperados:** seis filas de entrada y salida; seis valores de ID conservados en el mismo orden; una fila modificada; dos campos modificados; cinco registros de pendientes que afectan a cinco filas; cuatro categorías de incidencia. Las dos filas con `SYN-004` son un grupo de duplicado, pero se enumeran por separado para que el comprador identifique ambas. Un sistema que contabilice un único hallazgo por grupo debe conservar también las dos referencias de fila y documentar su métrica.

**Resultado global:** `BLOCKED_NEEDS_INPUT`; `on_chain_submission_allowed=false`. El archivo de referencia conserva problemas críticos y pruebas de canal incompletas. La aceptación de un informe parcial no convierte el feed en apto para carga.

## 4. Procedimiento de prueba una vez construido el agente

1. Fijar el reloj de prueba y registrar versiones del código y del paquete de reglas.
2. Inyectar los tres archivos de entrada; configurar la evidencia simulada sin realizar ninguna llamada de red.
3. Ejecutar el caso y volver a leer el archivo de salida.
4. Comparar por filas/columnas y valores con `NO_APTO_feed_esperado.csv`; comparar los cambios con `cambios_esperados.csv` y los pendientes por código y línea con `pendientes_esperados.csv`.
5. Verificar el resultado global y que no se haya solicitado firma o entrega on-chain. Revisar que el informe indique las comprobaciones no realizadas.
6. Guardar informe de prueba, hash de las entradas, versión del motor y resultado. Si se crea un ZIP para el test, verificar sus bytes y hashes aparte; no confundirlo con un entregable real.

Esta fixture no sustituye las pruebas de archivos corruptos, CSV complejos, separadores, duplicados de cabecera, seguridad, múltiples mercados, reglas de Meta, tamaños grandes, transacciones o aceptaciones del plan general de arquitectura.
