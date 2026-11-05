import { useState } from 'react'
import { Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import { CheckCircle, Description, LocalShipping, Undo } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import HtmlDocDialog from '@/shared/components/HtmlDocDialog/HtmlDocDialog'
import { useAction } from '@/shared/hooks/useAction'
import api from '@/lib/axios'
import { formatCurrency, formatDateTime } from '@/shared/utils/formatters'
import { DELIVERY_STATUS, type Delivery } from '@/features/requests/types'

/** One delivery: details, waybill (HTML + PDF) and status actions (dispatcher or the assigned driver). */
export default function DeliveryCard({ d, canAct, onChanged, showRequest }: {
  d: Delivery; canAct: boolean; onChanged: (d: Delivery) => void; showRequest?: boolean
}) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const [waybill, setWaybill] = useState<{ number: string; html: string } | null>(null)
  const [dialog, setDialog] = useState<'DELIVERED' | 'RETURNED' | null>(null)
  const [text, setText] = useState('')
  const open = d.status === 'PLANNED' || d.status === 'IN_TRANSIT'

  const setStatus = (status: string, body: object = {}) =>
    run(async () => {
      const { data } = await api.post<Delivery>(`/deliveries/${d.id}/status`, { status, ...body })
      onChanged(data)
      setDialog(null)
      setText('')
    }, 'Saqlandi')

  const rows: [string, string | null | undefined][] = [
    ...(showRequest && d.request ? [['Zayavka', `${d.request.number} · ${d.request.title}`] as [string, string]] : []),
    ...(d.request ? [['Mijoz', `${d.request.customer.name} · ${d.request.customer.phone}`] as [string, string]] : []),
    ['Manzil', d.address],
    ['Haydovchi', [d.driverName, d.driverPhone].filter(Boolean).join(' · ')],
    ['Transport', d.vehicleNumber],
    ['Rejalashtirilgan sana', d.plannedAt ? formatDateTime(d.plannedAt) : null],
    ["Yo'lga chiqdi", d.departedAt ? formatDateTime(d.departedAt) : null],
    ['Yetkazildi', d.deliveredAt ? formatDateTime(d.deliveredAt) : null],
    ['Qabul qildi', d.receivedBy],
    ...(d.cost !== undefined ? [['Logistika xarajati', formatCurrency(d.cost)] as [string, string]] : []),
    ['Izoh', d.notes],
  ]

  return (
    <Card variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
        <LocalShipping fontSize="small" color="action" />
        <Typography sx={{ fontWeight: 700 }}>{d.number}</Typography>
        <Chip size="small" color={DELIVERY_STATUS[d.status].color} label={t(DELIVERY_STATUS[d.status].label)} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<Description />} disabled={busy}
          onClick={() => run(async () => setWaybill((await api.get(`/deliveries/${d.id}/waybill`)).data), "Yo'l varaqasi tayyor")}>{t("Yo'l varaqasi")}</Button>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' }, columnGap: 2, rowGap: 0.25 }}>
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <Box key={k} sx={{ display: 'contents' }}>
            <Typography variant="caption" color="text.secondary">{t(k)}</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{v}</Typography>
          </Box>
        ))}
      </Box>
      {d.items && d.items.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {d.items.map((i) => `${i.name} × ${i.qty} ${i.unit}`).join('; ')}
        </Typography>
      )}
      {canAct && open && (
        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          {d.status === 'PLANNED' && <Button size="small" variant="outlined" startIcon={<LocalShipping />} disabled={busy} onClick={() => setStatus('IN_TRANSIT')}>{t("Yo'lga chiqdi")}</Button>}
          <Button size="small" variant="contained" color="success" startIcon={<CheckCircle />} disabled={busy} onClick={() => setDialog('DELIVERED')}>{t('Yetkazildi')}</Button>
          <Button size="small" color="warning" startIcon={<Undo />} disabled={busy} onClick={() => setDialog('RETURNED')}>{t('Qaytdi')}</Button>
        </Box>
      )}
      <Dialog open={!!dialog} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{t(dialog === 'DELIVERED' ? 'Yetkazildi' : 'Qaytdi')}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth required sx={{ mt: 1 }} value={text} onChange={(e) => setText(e.target.value)}
            label={t(dialog === 'DELIVERED' ? 'Kim qabul qildi (F.I.Sh.)' : 'Qaytish sababi')} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button color="inherit" onClick={() => setDialog(null)}>{t('Yopish')}</Button>
          <Button variant="contained" disabled={busy || !text.trim()}
            onClick={() => setStatus(dialog!, dialog === 'DELIVERED' ? { receivedBy: text.trim() } : { comment: text.trim() })}>{t('Saqlash')}</Button>
        </DialogActions>
      </Dialog>
      {waybill && <HtmlDocDialog open title={`${t("Yo'l varaqasi")} ${waybill.number}`} html={waybill.html} onClose={() => setWaybill(null)}
        pdf={{ url: `/deliveries/${d.id}/waybill/pdf`, fileName: `Yol-varaqasi-${waybill.number}.pdf` }} />}
    </Card>
  )
}
