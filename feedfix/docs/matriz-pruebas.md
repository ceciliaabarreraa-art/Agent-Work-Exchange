# Matriz de pruebas y reproducibilidad

## Pruebas ejecutadas

| Prueba | Estado | Evidencia |
|---|---|---|
| Motor/parsers, reglas, seguridad de CSV, límites, duplicados entre lotes y endpoint incremental | **39/39** local | [TAP](../04_Motor/results/pruebas_motor_final.txt); Node 20.20.2 |
| Discovery heurístico, excepción tanda 3, dominio prohibido y cierre real | **9/9** local | [unittest](../03_Discovery/pruebas_discovery.txt); Python 3.13.16 |
| A2A IPC, política ficticia, cuotas, firma falsa, replay, errores y dos caminos E2E | **8/8** local | [TAP](../05_A2A_Demo/resultados/pruebas_demo.txt) |
| Self-service sobre HTTP, hashes de fixture, 2 procesos, bloqueo y pago ficticio | **8/8** local | [TAP](../05_A2A_Demo/resultados/pruebas_self_service.txt); sin prueba automatizada de navegador. |
| MCP de Exa anónimo | **3 búsquedas reales de investigación**, 24 resultados y 9 dominios no bloqueados únicos, 0 habilitados | [Contadores sin resultados](../03_Discovery/ultima_prueba_busqueda_real.json). Uso en outreach/conservación no autorizado por esta prueba. |
| 500 filas casi 1 MiB, parse + lotes remotos | **373/373 HTTP correctos**, cada lote igual a local; ensamblado local | [Resultado y 343 trazas faltantes](../04_Motor/results/playground_incremental.json). Lote de 5 con traza de 12 ms. |
| Muestras pausadas, 1 fila | 42/42 HTTP correctos; 36 trazas, 6 perdidas | [Muestras](../04_Motor/results/playground_muestras_1_fila.json); una fila cercana al máximo produjo 13 ms. |
| NEAR Testnet | **Solo lectura** de configuración y orden histórica, 0 transacciones | [JSON](testnet_solo_lectura_resultado.json), [script](testnet_solo_lectura.py). No demuestra pago ni trabajo FeedFix. |
| RDAP / perfiles públicos | Respuestas observadas, sin reservas | [RDAP](../08_Nombre/rdap_svarog.json), [handles](../08_Nombre/handles_svarog.json). No prueban disponibilidad jurídica. |

Playground es entorno anónimo, **no** cuenta Free ni prueba de memoria. El reloj del sandbox marca 10/11 UTC mientras la fecha local de sesión indicada es 09/11: los scripts conservan el dato y advierten; no usarlo para probar vencimientos.

## Verificar antes de ejecutar

`python 07_Pruebas/verificar_entrega.py` comprueba todos los SHA-256 y detecta archivos extra, excluyendo cachés, manifiesto y el propio ZIP. Añadir `--zip` si `Entrega_iteracion_4.zip` está dentro de la misma carpeta que el manifiesto: también comprueba entradas, CRC y hashes internos. El manifiesto no puede incluir su propio hash ni el del ZIP que lo contiene. Una ejecución nueva de la demo sobrescribe las trazas con PIDs distintos, por lo que hay que verificar la entrega **antes** de reproducirla o compararla con una copia limpia.

## Reproducir offline

```bash
cd iteracion-4
node --test 04_Motor/test/*.mjs
(cd 03_Discovery && python -m unittest -v test_discovery.py)
node --test 05_A2A_Demo/test_demo.mjs
node --test 05_A2A_Demo/test_self_service.mjs
node 05_A2A_Demo/demo.mjs
node 05_A2A_Demo/demo.mjs --bloqueado
python 03_Discovery/discovery.py --synthetic
```

Comandos online opcionales:

```bash
python 03_Discovery/discovery.py --live-research --summary-only  # API Exa, investigación
python 07_Pruebas/testnet_solo_lectura.py                        # RPC público, sin firma
# Playground requiere requests + websocket-client; muchas invocaciones:
python 04_Motor/scripts/playground_incremental.py
python 04_Motor/scripts/playground_por_invocacion.py
```

Las corridas online dependen de terceros, tasas y red; una caída debe registrarse, no reemplazarse por resultados inventados. Las salidas persistentes de las pruebas se producen/sobrescriben dentro de esta carpeta; los scripts Playground crean además temporales del sistema y los eliminan al terminar. No usar con feeds, credenciales o dinero reales.

## Aceptaciones todavía no satisfechas

1. **Funcionamiento comercial real:** dominio/remitente/domicilio, evidencia y permisos, proveedor de búsqueda/envío, supresión persistente, comercio real y entrega privada.
2. **Pagos:** link real, webhook proveedor firmado y verificado con consulta del pago, prueba de reembolso/contracargo, contabilidad fiat, retiro real.
3. **A2A marketplace:** firmantes autorizados, buyer/seller/verifier, aceptación auténtica, transacciones Testnet y receipts; archivo `NO_APTO` no habilitado para presentarse.
4. **Cloud productivo:** límite Free real, CPU en peores casos, memoria de isolate, persistencia de estado, permisos y privacidad. Los dos picos observados superan 10 ms.
5. **Capacidades:** autorización de fuente verificable, página y checkout reales, revisión de políticas Google, validación real de archivo y aceptación del servicio. Ninguna automatización crea valores desconocidos.
