# Ciclo feliz — NEAR testnet (evidencia verificada)

Fecha: 2026-11-05/06
Contrato: escrow.mi-tiendita-madre.testnet
Explorador: https://explorer.testnet.near.org

## Cuentas creadas
- Madre/dueña/tesorería: mi-tiendita-madre.testnet (tx: Be67FzNLd6U5prHU9svK3J4SUaConHh5qWrV5FoV4mJ2)
- Comprador: buyer.mi-tiendita-madre.testnet (tx: 9tr757yuanwfchmkuM5fhgjbnnBQyhPtF6sMkq9S6VZY)
- Vendedor: seller.mi-tiendita-madre.testnet (tx: 2LtX7UBQZmHdEo2ws61QpB5mNtXpLwBT6BAEro7EQTJq)
- Verificador: verifier.mi-tiendita-madre.testnet (tx: FwYTuKpn3pu8QSr4wPNKRUkYUVpLpxcLThD693N2doH)
- Contrato: escrow.mi-tiendita-madre.testnet (fondeo: tx AcRFHbrtMFvEcGm6Rpv27EHi6hwMU19sVXJ5aUKm7mMS)

## Despliegue e inicialización
- Deploy + init `new(owner, treasury, verifier)`: tx 4tL94ZU7XCnPY3N56W6ZyZWfZawZotjDrGpWJtZkcdLF

## Ciclo de la orden #0
1. Depósito (buyer, 0.05 NEAR): tx 5mr9V35FwP9GVMtyPqHUwWFuwdnLzdH6TdrTNYHMgKAk
2. Crear orden (0.02 NEAR, seller+verifier asignados): tx 44vhCJAQErzgzk67nguTqtKuhsyyceUfHmgfZX288u1j
3. Entrega (seller, hash SHA-256 del artefacto): tx 8peCspLSzvoZAcBbuw3YxjKNTnDdjs49shLV5NHxsCL6
4. Aprobación y liberación (verifier, NO buyer ni seller): tx FowVc25wFB7WjNJYi8o3LT4kk19aPL86iCaLfuqvHLgH
5. Retiro real a la cuenta del vendedor: tx 6etzCsCKLTwHLM9vJAZWTtwp55mZVnfvgmjhPpuWgiXH

## Resultado verificado
- fee_amount: 400000000000000000000 yocto (2%)
- seller_amount: 19600000000000000000000 yocto (98%)
- Balance real de seller ANTES: 0.1 NEAR
- Balance real de seller DESPUÉS del retiro: 0.1189281860348891 NEAR
- Estado final de la orden: Released

## Reglas de seguridad probadas
- buyer != seller (forzado en el contrato)
- verifier != buyer, verifier != seller (forzado en el contrato)
- Solo el verifier puede llamar approve_and_release/refund (test unitario: seller_cannot_approve_own_order)
