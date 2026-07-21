# Guía de prueba — entorno demo

Recorrido guiado por la plataforma con datos de prueba ya cargados. Cada paso
apunta a una funcionalidad concreta y dice qué tenés que ver en pantalla.

**Tiempo estimado:** 15–20 minutos.

---

## Acceso

| | |
|---|---|
| **Usuario** | `socio.demo@brainlab.test` |
| **Contraseña** | `BrainLab2026!` |
| **Rol** | `socio` — ve todos los expedientes del estudio y puede asignar casos |

Es una cuenta de demostración con datos ficticios. La contraseña es temporal y
la cuenta está pensada para vivir solo en el entorno de desarrollo.

---

## 1. Login

Entrá por `/login` con las credenciales de arriba. Deberías caer en el panel
(`/dashboard`) y ver el saludo con el nombre **Martín**.

## 2. Segundo factor (MFA)

> **Ojo:** el MFA es **opcional** en esta versión. El login **no** te va a
> obligar a configurarlo. Lo vas a ver como un aviso en el encabezado.

Para probarlo, andá a **Sistema → Seguridad** (`/settings/security`):

1. Iniciá el enrolamiento y escaneá el QR con Google Authenticator, 1Password,
   Authy o similar.
2. Confirmá con el código de 6 dígitos.
3. Cerrá sesión y volvé a entrar: ahora sí te pide el código en `/mfa-verify`.

## 3. Panel

En `/dashboard`, la stat card **"Vencimientos Pendientes"** debería mostrar
**2**. La tarjeta cuenta los plazos pendientes que vencen dentro de los
próximos 10 días: el vencido de `25.432/2025` y el urgente de `18.901/2026`.
El plazo de caducidad de `31.209/2025` queda afuera porque vence recién dentro
de ~45 días — lo vas a ver igual en el panel de Vencimientos (paso 10).

El número se resuelve en vivo contra el gateway, así que puede tardar un
instante más que el resto de la tarjeta. Si el backend no está levantado,
aparece un "—".

## 4. Expediente con plazo vencido — `25.432/2025`

*García, María c/ Seguros Rivadavia S.A. s/ accidente de trabajo*

Abrilo desde **Expedientes**. Qué mirar:

- **Banner rojo** arriba de la ficha: hay un plazo pendiente cuyo vencimiento ya
  pasó (T-0).
- Pestaña **Plazos**: la fila *"Contestar traslado de demanda"* aparece en rojo,
  con el ícono de alerta y la fecha de vencimiento **2 días atrás**.
- El botón **Cumplido** de esa fila marca el plazo como cumplido. Si lo tocás,
  el banner rojo desaparece al recargar. (El seed se puede volver a correr para
  restaurar el estado original — ver el final de esta guía.)
- Estado del expediente: **En traslado**.

## 5. Expediente urgente — `18.901/2026`

*López, Juan C. c/ Provincia ART S.A. s/ ley de riesgos*

- Pestaña **Plazos**: **banner ámbar** de "plazos próximos a vencer".
- La fila *"Ofrecer prueba"* muestra el vencimiento **en 3 días**, en ámbar.
- Estado: **Período de prueba**.

## 6. Expediente al día — `12.744/2026`

*Rodríguez, Ana P. c/ Galeno ART S.A. s/ indemnización*

- Sin banners: no hay nada pendiente.
- Pestaña **Plazos**: el traslado de demanda figura como **Cumplido**, atenuado
  y sin botón de acción. Es el mismo estado en el que queda un plazo después de
  tocar "Cumplido" en el paso 4.
- Estado: **Contestado**.

## 7. Expediente en ejecución — `8.312/2024`

*Fernández, Roberto c/ Mapfre Argentina ART S.A. s/ accidente in itinere*

Es el expediente más completo de la demo.

- Pestaña **Ciclo de vida / Historial**: **10 transiciones** encadenadas a lo
  largo de dos años, desde *Iniciado* hasta *Ejecución*. Las primeras nueve son
  automáticas (disparadas por el pipeline al procesar documentos); la última es
  **manual** y lleva la justificación escrita por el abogado — fijate en la
  diferencia de íconos entre una y otra.
- Ficha completa: actor, accidente, cuadro médico, ART, empleador y monto
  reclamado (**$12.500.000**).
- Sin plazos pendientes.

## 8. Expediente en riesgo de caducidad — `31.209/2025`

*Martínez, Carlos D. c/ Consolidar ART S.A. s/ diferencia de indemnización*

Este demuestra el **timer pasivo de caducidad**: el sistema detecta la ausencia
de impulso procesal, algo que ningún documento reporta porque justamente lo que
pasó es que no pasó nada.

- Pestaña **Plazos**: aparece *"Caducidad de instancia — impulsar el
  procedimiento (art. 310 CPCCN)"*, con 90 días hábiles de cómputo.
- Última actividad: hace **85 días**.

> **Sobre el color:** el vencimiento cae a unos 45 días vista, así que la fila
> se ve **normal**, no ámbar. Es correcto — la alerta visual se enciende a 14
> días del vencimiento. Lo que este caso demuestra es que el plazo **existe y
> se generó solo**, sin ningún documento que lo disparara.

## 9. Expediente cerrado — `5.678/2024`

*Gómez, Lucía V. c/ Prevención ART S.A. s/ acción de amparo*

- Estado **Acuerdo/Conciliación**, que es **terminal**: en la pestaña de ciclo
  de vida no hay ninguna transición disponible.
- El historial (5 transiciones) muestra la **bifurcación**: el expediente pasa
  de *En traslado* directo a *Acuerdo*, sin período de prueba ni sentencia.

## 10. Panel global de vencimientos — `/deadlines`

Desde **Trabajo → Vencimientos**.

- Con el filtro en **"Esta semana"** deberían aparecer **2** plazos: el vencido
  de `25.432/2025` (en rojo) y el urgente de `18.901/2026` (en ámbar).
- Con **"Todos"** se suman los 3, incluida la caducidad de `31.209/2025`.
- Cada fila enlaza a la ficha del expediente correspondiente.

## 11. Adjuntar un documento

Abrí cualquier expediente activo (por ejemplo `12.744/2026`) y subí un PDF desde
la ficha. El archivo entra al pipeline de procesamiento; podés seguir su avance
en **Trabajo → Procesamiento**.

---

## Restaurar los datos de prueba

Después de tocar plazos o estados, volvés al punto de partida corriendo:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed_demo_socio.sql
```

(Si la cuenta todavía no existe en el entorno, corré antes
`supabase/seed_demo_socio_user.sql`.)

Es idempotente: reescribe plazos, transiciones y datos de las partes con fechas
recalculadas contra el día de hoy, sin duplicar expedientes ni tocar documentos
que hayas subido a mano.

Para borrar todo lo de la demo:

```sql
delete from public.case_files
 where created_by = (select id from public.users
                      where email = 'socio.demo@brainlab.test');
```

---

## Los 6 expedientes de un vistazo

| Nº | Carátula | Estado | Qué demuestra |
|---|---|---|---|
| `25.432/2025` | García c/ Seguros Rivadavia | En traslado | Plazo vencido → banner rojo T-0 |
| `18.901/2026` | López c/ Provincia ART | Período de prueba | Plazo próximo → banner ámbar |
| `12.744/2026` | Rodríguez c/ Galeno ART | Contestado | Plazo cumplido, sin pendientes |
| `8.312/2024` | Fernández c/ Mapfre ART | Ejecución | Historial completo de 10 transiciones |
| `31.209/2025` | Martínez c/ Consolidar ART | Período de prueba | Caducidad detectada por el timer pasivo |
| `5.678/2024` | Gómez c/ Prevención ART | Acuerdo/Conciliación | Estado terminal, bifurcación del flujo |
