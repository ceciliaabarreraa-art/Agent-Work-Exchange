# Discovery dinámico — investigación, no envío

## Qué funciona

`discovery.py` consulta el MCP oficial de Exa con tres búsquedas distintas en cada ejecución, extrae URL/título y señales léxicas, descarta dominios de redes/comunidades y otros bloqueados, deduplica por hostname y ordena por tanda hipotética y puntuación 0/1/2. No descarga listas de emails ni usa una IA para decidir a quién contactar. El resultado es una **hipótesis por dominio**, no una entidad empresarial confirmada. La tercera tanda **no requiere IA**.

- `score = señal de feed/problema + señal de IA`: 0, 1 o 2. Las señales dependen de texto encontrado y pueden tener falsos positivos, hablar de otra empresa, un caso anónimo o un error ya arreglado.
- Tanda 1 de investigación: posible startup + señal de tienda + IA; tanda 2: posible agencia + IA; tanda 3: el resto. Esto **no** habilita envío: la clasificación de comercio/agencia, el problema propio, su actualidad, el país y el contacto siguen sin verificarse.
- En modo real `eligible_to_send` siempre es `false`. No hay email sender ni enlace entre salida de búsqueda y ventas. `reasons` enumera los bloqueos. La lista de dominios prohibidos es conservadora y no garantiza una evaluación completa de términos de todos los sitios; una subpágina de una plataforma o un dominio propio puede requerir análisis adicional.
- El modo sintético usa solo `.invalid` y banderas ficticias; `would_pass_synthetic_gate` demuestra la lógica, no la verdad de las banderas. **Incluso allí `eligible_to_send=false`**. En particular, regla 3 sin IA está probada.
- La salida detallada imprime URL y señales en la consola del usuario; no escribe resultados, snippets, emails ni bases de datos. `--summary-only` imprime únicamente contadores. El archivo de prueba agregado `ultima_prueba_busqueda_real.json` no incluye resultados del proveedor. Conservar y usar resultados Exa en prospección comercial requiere aclaración contractual previa: no pasar por alto los términos.

## Reproducir

Requiere Python 3, biblioteca estándar e Internet solo para `--live-research`. Exa tiene cuota keyless variable y puede dar error o cambiar interfaz; el programa falla cerrado. No requiere credenciales ni modelo local.

```bash
cd iteracion-4
python 03_Discovery/discovery.py --synthetic
python 03_Discovery/discovery.py --live-research --summary-only
cd 03_Discovery && python -m unittest -v test_discovery.py
```

Prueba real de esta entrega: 3 consultas; 24 resultados antes de filtro; 9 dominios únicos no bloqueados; score 0/1/2 = 0/4/5; 0 elegibles. Son contadores de una corrida, no un objetivo ni una promesa de reproducción. Las búsquedas y anuncios de proveedores pueden cambiar; se recibieron datos de la API pero no se efectuó contacto.

## Lo que aún falta para operar sin humano en ejecución

Verificar titulares de dominios y país de forma confiable; comprobar un problema de feed **actual** en fuente y condiciones permitidas; probar el alcance y recencia; comprobar email publicado en propio sitio y términos de uso; resolver el permiso de búsqueda + proveedor para outreach; almacenar con retención y base jurídica apropiadas, supresión y evidencia; desplegar envío con límites atómicos y baja automática. Con política preaprobada puede saltar candidatos sin detenerse a preguntar, pero eso es **diseño**, no código demostrado.

El texto recibido de un sitio es dato no confiable. Aquí se evalúa con expresiones regulares, nunca se ejecuta como código o instrucción. Evitar comparar solo señales SEO contra supuestas alertas privadas de Google.
