import { useState } from 'react'
import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, LinearProgress,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, Skeleton,
} from '@mui/material'
import { ArrowBack, Block, Description, Send, ErrorOutlined, ReceiptLong } from '@mui/icons-material'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AnimatedPage from '@/shared/components/AnimatedPage/AnimatedPage'
import HtmlDocDialog from '@/shared/components/HtmlDocDialog/HtmlDocDialog'
import ScanControls from '@/shared/components/ScanControls/ScanControls'
import DeliveryCard from '@/features/deliveries/DeliveryCard'
import { useCan } from '@/app/hooks'
import { useFetch } from '@/shared/hooks/useFetch'
import { useAction } from '@/shared/hooks/useAction'
import api from '@/lib/axios'
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@/shared/utils/formatters'
import StagePanel from './StagePanel'
import { RequestStatusChip } from './RequestsPage'
import { PIPELINE, REQUEST_KINDS, STATUS_INFO, type CrmRequest } from './types'

const ACTION_LABELS: Record<string, string> = {
  create: 'Yaratildi', take: 'Ishga olindi', configure: 'Konfiguratsiya saqlandi', 'submit-configuration': 'Konfiguratsiya yuborildi',
  pricing: 'Narxlar saqlandi', 'submit-pricing': 'Narx yuborildi', review: "Narx ko'rib chiqildi", 'customer-approved': 'Buyurtmachi tasdiqladi',
  'customer-rejected': 'Buyurtmachi rad etdi', 'contract-created': 'Shartnoma tayyorlandi', 'contract-signed': 'Shartnoma imzolandi',
  'advance-confirmed': 'Avans tasdiqlandi', procurement: "Ta'minot ma'lumotlari saqlandi", 'submit-procurement': "Ta'minot yuborildi",
  'procurement-approved': "Ta'minot tasdiqlandi", 'procurement-rejected': "Ta'minot qaytarildi", received: 'Omborga qabul qilindi',
  issue: 'Ombordan olindi', return: 'Omborga qaytarildi', assembled: "Yig'ish tugadi", 'act-created': 'Dalolatnoma yaratildi',
  delivered: 'Yetkazib berildi', cancel: 'Bekor qilindi', comment: 'Izoh',
  'contract-scan': 'Imzolangan shartnoma skani yuklandi', 'act-scan': 'Imzolangan akt skani yuklandi',
  'delivery-planned': 'Yetkazish rejalashtirildi', 'delivery-status': 'Yetkazish holati',
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data: req, setData, loading, error } = useFetch<CrmRequest>(`/requests/${id}`)
  const { busy, run } = useAction()
  const canCancel = useCan('requests.cancel')
  const canContract = useCan('requests.contract')
  const canAct = useCan('requests.act')
  const canDeliver = useCan('requests.deliver')
  const [doc, setDoc] = useState<{ title: string; html: string; pdf?: { url: string; fileName: string } } | null>(null)
  const [comment, setComment] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const act = (action: string, body: object = {}, ok?: string) =>
    run(async () => {
      if (action === '__delivery') {
        await api.post(`/requests/${id}/deliveries`, body)
        const { data } = await api.get<CrmRequest>(`/requests/${id}`)
        setData(data)
        return
      }
      if (action === '__payment') {
        const b = body as { amount: number; type: string }
        await api.post('/payments', { direction: 'income', type: b.type, amount: b.amount, category: 'Avans', requestId: id })
        const { data } = await api.get<CrmRequest>(`/requests/${id}`)
        setData(data)
        return
      }
      const { data } = await api.post<CrmRequest>(`/requests/${id}/${action}`, body)
      setData(data)
    }, ok ?? 'Saqlandi')

  if (loading && !req) return <AnimatedPage><Skeleton variant="rounded" height={160} sx={{ mb: 2 }} /><Skeleton variant="rounded" height={300} /></AnimatedPage>
  if (error || !req) return <AnimatedPage><Alert severity="error">{error ?? t('Zayavka topilmadi')}</Alert></AnimatedPage>

  const final = req.status === 'COMPLETED' || req.status === 'CANCELLED'
  const activeStep = req.status === 'CANCELLED' ? -1 : PIPELINE.indexOf(req.status)
  const showPrices = req.totalPrice !== undefined
  const showCost = req.totalCost !== undefined
  // "Olingan" only matters from assembly on.
  // Goods held in the warehouse for this request (until taken for assembly).
  const showReserved = req.items.some((i) => (i.reservedQty ?? 0) > 0)
  const showIssued = PIPELINE.indexOf(req.status) >= PIPELINE.indexOf('ASSEMBLY') || req.items.some((i) => i.issuedQty > 0)

  return (
    <AnimatedPage>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Button startIcon={<ArrowBack />} variant="outlined" color="inherit" size="small" onClick={() => navigate('/requests')}>{t('Zayavkalar')}</Button>
        <Box sx={{ flex: 1 }} />
        {req.contract?.body && <Button size="small" startIcon={<Description />} onClick={() => setDoc({
          title: `${t('Shartnoma')} ${req.contract!.number}`, html: req.contract!.body!,
          pdf: { url: `/contracts/${req.contract!.id}/pdf`, fileName: `Shartnoma-${req.contract!.number}.pdf` },
        })}>{t('Shartnoma')}</Button>}
        {req.contract?.body && <Button size="small" startIcon={<ReceiptLong />} disabled={busy} onClick={() => run(async () => {
          const { data } = await api.get<{ number: string; html: string }>(`/requests/${id}/invoice`)
          setDoc({ title: `${t("To'lov uchun hisob")} ${data.number}`, html: data.html, pdf: { url: `/requests/${id}/invoice/pdf`, fileName: `Hisob-${data.number}.pdf` } })
        }, 'Hisob tayyor')}>{t('Hisob')}</Button>}
        {req.act?.body && <Button size="small" startIcon={<Description />} onClick={() => setDoc({
          title: `${t('Dalolatnoma')} ${req.act!.number}`, html: req.act!.body!,
          pdf: { url: `/acts/${req.act!.id}/pdf`, fileName: `Dalolatnoma-${req.act!.number}.pdf` },
        })}>{t('Dalolatnoma')}</Button>}
        {canCancel && !final && <Button size="small" color="error" startIcon={<Block />} onClick={() => setCancelOpen(true)}>{t('Bekor qilish')}</Button>}
      </Box>

      <Card sx={{ p: { xs: 2, sm: 3 }, mb: 2, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>{req.number}</Typography>
          <RequestStatusChip status={req.status} />
          <Chip size="small" variant="outlined" label={t(REQUEST_KINDS[req.kind] ?? req.kind)} />
        </Box>
        <Typography variant="h6" sx={{ mt: 1 }}>{req.title}</Typography>
        {req.description && <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{req.description}</Typography>}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {[
            { label: 'Mijoz', value: `${req.customer.name} · ${req.customer.phone}` },
            { label: 'Muddat', value: req.deadline ? formatDate(req.deadline) : '—' },
            ...(showPrices ? [
              { label: 'Summa', value: formatCurrency(req.totalPrice ?? 0) },
              { label: "To'langan", value: formatCurrency(req.paid ?? 0) },
              { label: 'Qoldiq', value: formatCurrency(req.balance ?? 0) },
            ] : []),
            ...(showCost ? [{ label: 'Tannarx', value: formatCurrency(req.totalCost ?? 0) }] : []),
            ...(showCost && req.deliveryCost ? [{ label: 'Logistika', value: formatCurrency(req.deliveryCost) }] : []),
          ].map((x) => (
            <Grid key={x.label} size={{ xs: 6, md: 'auto' }}>
              <Typography variant="caption" color="text.secondary">{t(x.label)}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{x.value}</Typography>
            </Grid>
          ))}
        </Grid>
      </Card>

      {req.status !== 'CANCELLED' && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">{t(STATUS_INFO[req.status].short)}</Typography>
            <Typography variant="caption" color="text.secondary">{activeStep + 1} / {PIPELINE.length}</Typography>
          </Box>
          <LinearProgress variant="determinate" value={((activeStep + 1) / PIPELINE.length) * 100} sx={{ height: 6, borderRadius: 3 }} />
        </Box>
      )}

      {!final && <Box sx={{ mb: 2 }}><StagePanel key={req.status + req.updatedAt} req={req} act={act} busy={busy} /></Box>}

      {(req.contract?.body || req.act?.body) && (
        <Card sx={{ borderRadius: 3, mb: 2, p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{t('Imzolangan hujjatlar')}</Typography>
          {req.contract?.body && (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 180 }}>{t('Shartnoma')} {req.contract.number}</Typography>
              <ScanControls<CrmRequest> kind="contracts" doc={req.contract} onUploaded={setData}
                canUpload={canContract && req.status !== 'CANCELLED' && (req.contract.status === 'signed' || req.status === 'CONTRACT')} />
            </Box>
          )}
          {req.act?.body && (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ minWidth: 180 }}>{t('Dalolatnoma')} {req.act.number}</Typography>
              <ScanControls<CrmRequest> kind="acts" doc={req.act} onUploaded={setData} canUpload={canAct && req.status !== 'CANCELLED'} />
            </Box>
          )}
        </Card>
      )}

      {!!req.deliveries?.length && (
        <Card sx={{ borderRadius: 3, mb: 2, p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{t('Yetkazishlar')}</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {req.deliveries.map((d) => (
              <DeliveryCard key={d.id} d={d} canAct={canDeliver && req.status === 'DELIVERY'}
                onChanged={async () => setData((await api.get<CrmRequest>(`/requests/${id}`)).data)} />
            ))}
          </Box>
        </Card>
      )}

      <Card sx={{ borderRadius: 3, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, p: 2, pb: 0 }}>{t('Konfiguratsiya')}</Typography>
        {req.items.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2 }}>{t("Hali qismlar kiritilmagan")}</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 560 }}>
              <TableHead><TableRow>
                <TableCell>#</TableCell><TableCell>{t('Mahsulot')}</TableCell><TableCell align="right">{t('Soni')}</TableCell>
                <TableCell>{t('Manba')}</TableCell>{showReserved && <TableCell align="right">{t('Band')}</TableCell>}
                {showIssued && <TableCell align="right">{t('Olingan')}</TableCell>}
                {showCost && <TableCell align="right">{t('Tannarx (dona)')}</TableCell>}
                {showPrices && <TableCell align="right">{t('Narx (dona)')}</TableCell>}
              </TableRow></TableHead>
              <TableBody>
                {req.items.map((i, idx) => (
                  <TableRow key={i.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell sx={{ color: i.productId ? undefined : 'error.main', fontWeight: i.productId ? 400 : 700 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {!i.productId && <ErrorOutlined fontSize="small" color="error" />}{i.name}
                      </Box>
                      {i.note && <Typography variant="caption" color="text.secondary">{i.note}</Typography>}
                    </TableCell>
                    <TableCell align="right">{formatNumber(i.qty)} {i.unit}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" color={i.source === 'stock' ? 'success' : 'warning'} label={i.source === 'stock' ? t('Ombordan') : t('Xarid')} /></TableCell>
                    {showReserved && <TableCell align="right">{formatNumber(i.reservedQty ?? 0)}</TableCell>}
                    {showIssued && <TableCell align="right">{formatNumber(i.issuedQty)}</TableCell>}
                    {showCost && <TableCell align="right">{i.unitCost ? formatCurrency(i.unitCost) : '—'}</TableCell>}
                    {showPrices && <TableCell align="right">{i.salePrice ? formatCurrency(i.salePrice) : '—'}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>

      <Card sx={{ borderRadius: 3, p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{t('Tarix')}</Typography>
        {req.events.map((e) => (
          <Box key={e.id} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{t(ACTION_LABELS[e.action] ?? e.action)}</Typography>
              {e.toStatus && e.toStatus !== e.fromStatus && <RequestStatusChip status={e.toStatus} />}
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>{e.userName} · {formatDateTime(e.createdAt)}</Typography>
            </Box>
            {e.comment && <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{e.comment}</Typography>}
          </Box>
        ))}
        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          <TextField size="small" fullWidth placeholder={t('Izoh yozing...')} value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button variant="contained" disabled={!comment.trim() || busy} onClick={async () => { if (await act('comment', { comment }, 'Izoh qo\'shildi')) setComment('') }}><Send /></Button>
        </Box>
      </Card>

      {doc && <HtmlDocDialog open title={doc.title} html={doc.html} pdf={doc.pdf} onClose={() => setDoc(null)} />}
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{t('Zayavkani bekor qilish')}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth multiline minRows={2} sx={{ mt: 1 }} label={t('Sabab')} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button color="inherit" onClick={() => setCancelOpen(false)}>{t('Yopish')}</Button>
          <Button color="error" variant="contained" disabled={!cancelReason.trim() || busy}
            onClick={async () => { if (await act('cancel', { comment: cancelReason }, 'Zayavka bekor qilindi')) setCancelOpen(false) }}>{t('Bekor qilish')}</Button>
        </DialogActions>
      </Dialog>
    </AnimatedPage>
  )
}
