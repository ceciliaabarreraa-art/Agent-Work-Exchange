# FeedFix: motor incremental sintético

## Alcance demostrado

- CSV/TSV hasta 500 filas y 1 MiB **por cada archivo** de feed/fuente/evidencia, con límite adicional incremental de 8.192 unidades UTF-16 por registro y chunks de 4.096 bytes. Admite BOM, UTF-8, comillas, separadores y saltos internos, CR/LF/CRLF; errores de formato cierran por defecto.
- A: normalizar `condition` solo con regla explícita. B: cambiar precio/disponibilidad solo si autorización, identificador exacto, mercado, moneda, frescura y evidencia de página **y checkout** coinciden. En esta entrega autorizaciones y evidencias son textos/archivos sintéticos: el prototipo **no autentica al autorizante ni prueba la existencia real** de esas fuentes. No inventa GTIN, precio, stock ni características. Una comprobación del dígito GTIN no acredita asignación.
- Auditoría de cambios y tabla de pendientes; preservación de líneas originales y de duplicados globales. El archivo corregido conserva los campos originales, por lo que hay que tratarlo como dato no confiable si se abre en una planilla; el CSV de auditoría sí protege expresiones de fórmula. El resultado es siempre `NO_APTO`, `on_merchant_upload_allowed=false` y `on_chain_submission_allowed=false`.
- Coordinador en **un proceso local**: valida todos los archivos, calcula conteos globales y luego separa lotes. Es responsable de que las líneas/conteos sean verdaderos; el endpoint de laboratorio confía en ellos. No entregar ese contexto a un cliente no confiable. `cloud_worker.mjs` no tiene autenticación, persistencia, secreto ni controles de producción.

## Pruebas funcionales

```bash
cd iteracion-4
node --test 04_Motor/test/*.mjs
```

Resultado guardado [pruebas_motor_final.txt](results/pruebas_motor_final.txt): **39/39**, con 28 heredadas, 8 incrementales y 3 de endpoint incremental. El caso de seis filas produce exactamente 2 cambios, 5 pendientes, `BLOCKED_NEEDS_INPUT` y SHA-256 `754352fa7070d8fd526ee3c11612251850c50caf5e63c093a6a16d290d8270d9` para el feed `NO_APTO`. Coincide con el motor monolítico con lotes de 1, 2 y 5; duplicados en líneas 5 y 6 se mantienen aunque caigan en lotes diferentes. En la carga sintética de 500 filas y 1.047.469 bytes, el resultado incremental coincide con el monolítico en feed, auditoría, cambios, pendientes y estado. 100 tablas aleatorias deterministas × 6 tamaños de chunk ayudan a comprobar el parser; no prueban todos los datos posibles.

## Playground: procesamiento completo y pérdida de trazas

[playground_incremental.json](results/playground_incremental.json) registra una ejecución de laboratorio íntegra en Cloudflare Playground: los archivos de 500 filas fueron parseados remotamente, en lotes de 5, y cada lote se comparó con el motor local. Hubo 273 invocaciones de parsing + 100 de reparación, todas HTTP exitosas y resultados coincidentes. El ensamblado se hizo localmente y su SHA-256 es `10788306a6b3cc3848abe51940567b34b001ee1a425426bef0b82f2734dcefea`; 1.500 cambios sintéticos, 0 pendientes y `PARTIAL_REVIEW_REQUIRED`.

| Fase | HTTP OK | Trazas recibidas / faltantes | CPU observada min/mediana/máx. | >10 ms |
|---|---:|---:|---:|---:|
| Parse en bloques de 4.096 B | 273/273 | 23 / 250 | 0 / 1 / 3 ms | 0 de 23 |
| Reparación, lote de 5 filas | 100/100 | 7 / 93 | 0 / 1 / **12 ms** | **1 de 7** |

Las 343 invocaciones sin traza no tienen CPU conocida. El valor 0 es resolución de medición, no ausencia de consumo. La salida de Cloudflare Playground no representa una cuenta Free ni demuestra cumplimiento del límite de 10 ms.

## Muestras pausadas de 1 fila

[playground_muestras_1_fila.json](results/playground_muestras_1_fila.json): 2 calentamientos exitosos y 10 muestras con traza por caso, sin excluir las perdidas. Cada HTTP 200 se comparó íntegramente con resultado local.

| Caso | HTTP OK | Trazas recibidas / perdidas | 10 muestras medidas: min/mediana/máx. | >10 ms |
|---|---:|---:|---:|---:|
| Parser en bloques | 13/13 | 12 / 1 | 2 / 2 / 4 ms | 0 |
| Una fila de la carga de 500 | 14/14 | 12 / 2 | 1 / 1 / 2 ms | 0 |
| Una fila sintética cercana al límite de registro | 15/15 | 12 / 3 | 0 / 1 / **13 ms** | **1** |

Conclusión: reducir a una fila mejora esta muestra ordinaria pero **no elimina los excesos**. No se probó que toda entrada bajo los límites cumpla 10 ms. No se probó RAM de isolate, ni durabilidad, coordinación cloud o reintentos. Una métrica `process.memoryUsage()` previa devolvió ceros y es inválida, no "memoria cero". [Workers límites](https://developers.cloudflare.com/workers/platform/limits/) y [Playground](https://developers.cloudflare.com/workers/playground/) describen entornos distintos.

Los scripts cloud son opcionales y requieren Internet, `requests` y `websocket-client`. Hacen numerosas llamadas a Playground y usan solo fixtures sintéticas; no los ejecute con datos de un comercio.

## Implicaciones para un producto

La siguiente fase requeriría orquestación confiable en cloud, estado durable, autorización/sesión por lote, evidencia autenticada y entregas privadas, recursos y reintentos idempotentes, costos/retención, y pruebas en una cuenta Free real. El pico de 12/13 ms obliga a rediseñar o reducir alcance antes de prometer 500 filas en Free. El motor **no verifica** reglas completas, aprobación de Google, `Needs attention`, checkout vivo ni derecho de subir el archivo. No vender el diagnóstico o un archivo `NO_APTO` como servicio terminado.
