# Runbook — Foto de factura en emisiones por tarjeta

Aplica a tarjetas pagadas en caja (`bfactura=1`, flujo `?flujo=tarjeta`). **No aplica a autopago (Farmatodo/Payall)**: ahí la caja registra la factura y no se pide foto.

## Cómo viaja la factura

1. **OCR:** el cliente sube la foto. Queda en `uploads/<empresa>/<cédula>/pendiente/factura.*`, o en `uploads/<empresa>/_inbox/` si todavía no se leyó la cédula. El link queda en `metadataCanal.xfoto_factura`.
2. **Emisión:** antes de emitir valida que exista la foto. Si no está, responde `422 TARJETA_FACTURA_FOTO` y no emite.
3. **Emisión → OCR:** después de emitir, archiva el expediente en `uploads/<empresa>/<cédula>/<recibo-aa-mes-póliza>/`, con `factura.*` y `documentos.json`.
4. **Emisión → La Mundial:** llama a `cards/activate` con `xfoto_factura` = link absoluto de la factura archivada. La Mundial lo guarda en `tafactura.xarchivo_factura`.

Requisitos en el `.env` del OCR (`server/.env`):
- `EXPEDIENTE_PUBLIC_BASE`, por ejemplo `https://nexusqa.exelixitech.com/ocr`. Sin esta variable, el link queda relativo y no se envía.
- `EXPEDIENTES_ROOT`, opcional. Si no está, se usa `server/uploads`.

## Señales de falla

| Dónde | Señal |
|---|---|
| Log de `emision-api` | `[tarjeta-factura] ALERTA sin factura archivada cnpoliza=...` |
| Log de `emision-api` | `[tarjeta-factura] emisión bloqueada: sin foto de factura` (bloqueo esperado; el cliente debe volver a subir la foto) |
| Log de `emision-api` | `[tarjeta-activate] falló` / `omitido` |
| Log de `ocr-api` | `[modulo-ocr/expediente] .../... saved=0` en una tarjeta |
| Script | `verificar` sale con código 1 |
| Sis2000 | Tarjeta activada con `tafactura.xarchivo_factura` vacío (consulta abajo) |

## Verificación (después de cada deploy de OCR/Emisión, y a diario mientras haya tarjetas)

En el servidor, desde `~/exelixi/ocr-documentos-modulo/server`:

```bash
node scripts/facturas-tarjeta.js verificar --dias 7
pm2 logs emision-api --lines 3000 --nostream | grep -E "\[tarjeta-factura\]|tarjeta-activate\] (falló|omitido)" | tail -20
```

El script es de solo lectura y lista:
- **Pólizas con factura obligatoria y sin foto archivada.** `requerida=sí` es una falla real. `requerida=revisar` corresponde a expedientes anteriores al 27-oct, que pueden ser de autopago.
- **Fotos sueltas** en `pendiente/` o `_inbox/` y la póliza probable de cada una.

Para confirmar contra La Mundial (solo lectura; en producción, cambiar `Sis2000_QA` por `Sis2000`):

```sql
SELECT t.ctarjeta, t.xcodigo_unico, t.cnpoliza, t.factivacion, t.xfactura, f.nfactura, f.xarchivo_factura
FROM Sis2000_QA.dbo.tatarjeta t WITH (NOLOCK)
LEFT JOIN Sis2000_QA.dbo.tafactura_d d WITH (NOLOCK) ON d.ctarjeta = t.ctarjeta
LEFT JOIN Sis2000_QA.dbo.tafactura  f WITH (NOLOCK) ON f.cfactura = d.cfactura
WHERE t.factivacion >= DATEADD(DAY, -7, GETDATE())
  AND (f.xarchivo_factura IS NULL OR f.xarchivo_factura NOT LIKE 'http%')
ORDER BY t.factivacion DESC;
```

## Emergencia: una póliza quedó sin factura

1. **Identificar:** correr `verificar`. Anotar la póliza, la cédula, el expediente y la foto candidata.
2. **Confirmar la foto:** abrir `<EXPEDIENTE_PUBLIC_BASE>/files/<ruta de la foto>` y verificar que el número de factura coincida. Las candidatas "por hora" de `_inbox` **siempre** se revisan a mano.
3. **Asociar** (copia sin borrar el original y registra el origen en `documentos.json`):
   ```bash
   node scripts/facturas-tarjeta.js asociar uploads/<foto> uploads/<expediente>
   ```
   Imprime el link definitivo. Si el expediente ya tiene `factura.*`, no hace nada.
4. **Avisar a La Mundial:** la tarjeta ya está activada y nosotros no escribimos en sus tablas. Enviar a Gabriel la tabla `ctarjeta | xcodigo_unico | póliza | nfactura | link` para que cargue el link en `tafactura.xarchivo_factura`.
5. **Si la foto no existe en el servidor:** pedirle al cliente o al canal la foto de la factura, subirla al expediente con el nombre `factura.<ext>` y seguir desde el paso 4.
6. **Registrar el incidente** en `.antigravity/PENDIENTES.md`: fecha, pólizas y causa.

## Antes de pasar tarjetas a producción

- [ ] Commits en `main` (OCR y Emisión): empresa-id al archivar, link absoluto de factura en activate, `xfoto_factura` en metadata, validación previa y alerta (`tarjetaFacturaGuard`).
- [ ] `EXPEDIENTE_PUBLIC_BASE` configurada en el OCR de GCIA.
- [ ] Desplegar **primero el OCR y después Emisión**. Emisión exige `xfoto_factura`, y sin el OCR nuevo bloquearía todas las tarjetas.
- [ ] Prueba completa en producción con una tarjeta real: el log debe mostrar `saved>0` y la consulta SQL debe traer `xarchivo_factura` con link http.
- [ ] Confirmar con Gabriel que `validate_bill` de producción rechaza una factura ya usada, salvo que traiga varios productos. En QA la acepta varias veces.
- [ ] Confirmar con Gabriel qué columna lee "Ver factura": `tafactura.xarchivo_factura` o `tatarjeta.xfoto_factura`.
- [ ] Programar `verificar` a diario con aviso por correo si sale con código 1.
