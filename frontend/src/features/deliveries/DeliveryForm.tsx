import { useState } from 'react'
import { Box, Button, MenuItem, TextField } from '@mui/material'
import { LocalShipping } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import { useFetch } from '@/shared/hooks/useFetch'
import type { CrmRequest } from '@/features/requests/types'

interface Driver { id: string; fullName: string; phone: string | null }

/** Plans a delivery for a request in the DELIVERY stage: driver (user or name/phone), vehicle, address, date, cost. */
export default function DeliveryForm({ req, busy, onSubmit }: { req: CrmRequest; busy: boolean; onSubmit: (body: object) => Promise<boolean> }) {
  const { t } = useTranslation()
  const { data: drivers } = useFetch<Driver[]>('/drivers')
  const [f, setF] = useState({ driverId: '', driverName: '', driverPhone: '', vehicleNumber: '', address: req.customer.address ?? '', plannedAt: '', cost: '', notes: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const valid = f.address.trim() && (f.driverId || f.driverName.trim())

  const submit = async () => {
    const ok = await onSubmit({
      driverId: f.driverId || null, driverName: f.driverName || null, driverPhone: f.driverPhone || null,
      vehicleNumber: f.vehicleNumber || null, address: f.address, plannedAt: f.plannedAt ? new Date(f.plannedAt).toISOString() : null,
      cost: f.cost ? Math.round(Number(f.cost)) : 0, notes: f.notes || null,
    })
    if (ok) setF((x) => ({ ...x, notes: '' }))
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
      <TextField select size="small" label={t('Haydovchi (xodim)')} value={f.driverId} onChange={set('driverId')}>
        <MenuItem value="">{t("— Tashqi haydovchi (ism bilan) —")}</MenuItem>
        {(drivers ?? []).map((d) => <MenuItem key={d.id} value={d.id}>{d.fullName}{d.phone ? ` · ${d.phone}` : ''}</MenuItem>)}
      </TextField>
      <TextField size="small" label={t('Haydovchi ismi')} value={f.driverName} onChange={set('driverName')} required={!f.driverId} />
      <TextField size="small" label={t('Haydovchi telefoni')} value={f.driverPhone} onChange={set('driverPhone')} />
      <TextField size="small" label={t('Transport raqami')} value={f.vehicleNumber} onChange={set('vehicleNumber')} placeholder="01 A 123 BC" />
      <TextField size="small" label={t('Manzil')} value={f.address} onChange={set('address')} required sx={{ gridColumn: { sm: '1 / -1' } }} />
      <TextField size="small" type="datetime-local" label={t('Rejalashtirilgan sana')} value={f.plannedAt} onChange={set('plannedAt')} slotProps={{ inputLabel: { shrink: true } }} />
      <TextField size="small" type="number" label={t("Logistika xarajati (so'm)")} value={f.cost} onChange={set('cost')} />
      <TextField size="small" label={t('Izoh (ixtiyoriy)')} value={f.notes} onChange={set('notes')} sx={{ gridColumn: { sm: '1 / -1' } }} />
      <Box><Button variant="contained" startIcon={<LocalShipping />} disabled={busy || !valid} onClick={submit}>{t('Yetkazishni rejalashtirish')}</Button></Box>
    </Box>
  )
}
