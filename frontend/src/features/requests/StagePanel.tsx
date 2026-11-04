import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Autocomplete, Box, Button, Card, Chip, IconButton, MenuItem, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
} from '@mui/material'
import { Add, Delete, Send, CheckCircle, Cancel, Save, Inventory2, Undo, Description, LocalShipping, Payments } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector, useCan } from '@/app/hooks'
import { fetchProducts } from '@/features/catalogs/products/store/productsSlice'
import { fetchWarehouses } from '@/features/catalogs/warehouses/store/warehousesSlice'
import { fetchSuppliers } from '@/features/catalogs/suppliers/store/suppliersSlice'
import { useFetch } from '@/shared/hooks/useFetch'
import { formatCurrency, formatNumber } from '@/shared/utils/formatters'
import api from '@/lib/axios'
import { notify } from '@/app/uiSlice'
import { STATUS_INFO, unitCost, type CrmRequest, type RequestItem } from './types'
import type { Permission } from '@/app/permissions'

export type Act = (action: string, body?: object, ok?: string) => Promise<boolean>

interface Props { req: CrmRequest; act: Act; busy: boolean }

const scroll = { overflowX: 'auto' } as const
const numField = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))
const toNum = (s: string) => (s === '' ? undefined : Number(s))
const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

function CommentField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  return <TextField size="small" fullWidth multiline minRows={1} label={t('Izoh (ixtiyoriy)')} value={value} onChange={(e) => onChange(e.target.value)} />
}

// ───────────── Engineer: configuration ─────────────

interface ConfigRow { productId: string | null; name: string; qty: number; note: string }

function ConfigurationStage({ req, act, busy }: Props) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const products = useAppSelector((s) => s.products.items)
  const warehouses = useAppSelector((s) => s.warehouses.items)
  const [warehouseId, setWarehouseId] = useState(req.warehouseId ?? '')
  const [rows, setRows] = useState<ConfigRow[]>(() =>
    req.items.length ? req.items.map((i) => ({ productId: i.productId, name: i.name, qty: i.qty, note: i.note ?? '' })) : [{ productId: null, name: '', qty: 1, note: '' }])
  const [comment, setComment] = useState('')

  useEffect(() => { dispatch(fetchProducts()); dispatch(fetchWarehouses()) }, [dispatch])

  const set = (i: number, patch: Partial<ConfigRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const valid = rows.length > 0 && rows.every((r) => (r.productId || r.name.trim()) && r.qty > 0)
  const save = () => act('configuration', { warehouseId: warehouseId || null, items: rows.map((r) => ({ productId: r.productId, name: r.name, qty: r.qty, note: r.note || null })) }, 'Saqlandi')

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {t("Kerakli qismlarni kiriting. Katalogda yo'q tovarni nomi bilan yozing — u qizil bilan belgilanadi va deklarant narxlaydi.")}
      </Typography>
      <TextField select size="small" label={t('Ombor')} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} sx={{ maxWidth: 320 }}>
        {warehouses.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
      </TextField>
      {rows.map((row, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
          <Autocomplete
            freeSolo size="small" sx={{ flex: 3, minWidth: 220 }}
            options={products}
            getOptionLabel={(o) => (typeof o === 'string' ? o : `${o.code} · ${o.name}`)}
            value={row.productId ? products.find((p) => p.id === row.productId) ?? row.name : row.name}
            onChange={(_, v) => (typeof v === 'string' || v === null ? set(i, { productId: null, name: v ?? '' }) : set(i, { productId: v.id, name: v.name }))}
            onInputChange={(_, v, reason) => { if (reason === 'input') set(i, { productId: null, name: v }) }}
            renderInput={(p) => (
              <TextField {...p} label={t('Mahsulot')} error={!row.productId && !!row.name}
                helperText={!row.productId && row.name ? t("Katalogda yo'q") : undefined} />
            )}
          />
          <TextField size="small" type="number" label={t('Soni')} value={row.qty} sx={{ width: 90 }}
            onChange={(e) => set(i, { qty: Math.max(0, Number(e.target.value)) })} />
          <TextField size="small" label={t('Izoh')} value={row.note} sx={{ flex: 2, minWidth: 140 }} onChange={(e) => set(i, { note: e.target.value })} />
          <IconButton color="error" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} aria-label={t("O'chirish")}><Delete /></IconButton>
        </Box>
      ))}
      <Box><Button startIcon={<Add />} onClick={() => setRows((r) => [...r, { productId: null, name: '', qty: 1, note: '' }])}>{t("Qator qo'shish")}</Button></Box>
      <CommentField value={comment} onChange={setComment} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" startIcon={<Save />} disabled={!valid || busy} onClick={save}>{t('Saqlash')}</Button>
        <Button variant="contained" startIcon={<Send />} disabled={!valid || busy}
          onClick={async () => { if (await save()) await act('submit-configuration', { comment: comment || null }, 'Yuborildi') }}>
          {t('Saqlash va yuborish')}
        </Button>
      </Box>
    </Box>
  )
}

// ───────────── Declarant: pricing ─────────────

const PRICE_FIELDS: { key: keyof RequestItem; label: string; width?: number }[] = [
  { key: 'purchasePrice', label: 'Xarid narxi', width: 120 },
  { key: 'customsDutyPct', label: 'Boj %', width: 70 },
  { key: 'vatPct', label: 'QQS %', width: 70 },
  { key: 'excisePct', label: 'Aksiz %', width: 70 },
  { key: 'customsFee', label: "Bojxona yig'imi", width: 110 },
  { key: 'certificateCost', label: 'Sertifikat', width: 100 },
  { key: 'labCost', label: 'Laboratoriya', width: 100 },
  { key: 'serviceFee', label: 'Xizmat haqi', width: 100 },
  { key: 'logisticsCost', label: 'Logistika', width: 100 },
]

function PricingStage({ req, act, busy }: Props) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const products = useAppSelector((s) => s.products.items)
  const canCreateProduct = useCan('products.manage')
  const lines = req.items.filter((i) => i.source === 'purchase')
  const [rows, setRows] = useState<RequestItem[]>(() => lines.map((i) => ({ ...i })))
  const [comment, setComment] = useState('')
  const [newFor, setNewFor] = useState<RequestItem | null>(null)
  const [np, setNp] = useState({ code: '', name: '', category: 'electronics', unit: 'dona' })

  useEffect(() => { dispatch(fetchProducts()) }, [dispatch])
  const set = (id: string, patch: Partial<RequestItem>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  /** Links a product to a line and to every other unlinked line typed with the same name (duplicates). */
  const link = (row: RequestItem, p: { id: string; name: string; tnvedCode?: string | null } | null) => setRows((rs) => rs.map((x) => {
    const twin = x.id === row.id || (!!p && !x.productId && sameName(x.name, row.name))
    return twin ? { ...x, productId: p?.id ?? null, name: p?.name ?? x.name, tnvedCode: x.tnvedCode || p?.tnvedCode || null } : x
  }))
  const payload = () => ({ items: rows.map((r) => ({
    id: r.id, productId: r.productId, tnvedCode: r.tnvedCode || null,
    ...Object.fromEntries(PRICE_FIELDS.map((f) => [f.key, r[f.key] ?? undefined])),
  })) })
  const ready = rows.every((r) => r.productId && (r.purchasePrice ?? 0) > 0)

  const createProduct = async () => {
    if (!newFor) return
    try {
      const { data } = await api.post('/products', { ...np, price: 0, costPrice: 0 })
      await dispatch(fetchProducts())
      link(newFor, data)
      setNewFor(null)
    } catch (e) {
      dispatch(notify({ message: e instanceof Error ? e.message : String(e), severity: 'error' }))
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {t("Sotib olinadigan qismlar uchun TN VED, bojxona va xarajatlarni kiriting. Summalar qator bo'yicha jami, foizlar xarid narxidan.")}
      </Typography>
      <Box sx={scroll}>
        <Table size="small" sx={{ minWidth: 1250 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 220 }}>{t('Mahsulot')}</TableCell>
              <TableCell>{t('Soni')}</TableCell>
              <TableCell>TN VED</TableCell>
              {PRICE_FIELDS.map((f) => <TableCell key={f.key}>{t(f.label)}</TableCell>)}
              <TableCell align="right">{t('Tannarx (dona)')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Autocomplete size="small" options={products} value={products.find((p) => p.id === r.productId) ?? null}
                    getOptionLabel={(o) => `${o.code} · ${o.name}`}
                    onChange={(_, v) => link(r, v)}
                    renderInput={(p) => <TextField {...p} placeholder={r.name} error={!r.productId} helperText={!r.productId ? r.name : undefined} />} />
                  {!r.productId && canCreateProduct && (
                    <Button size="small" onClick={() => { setNp({ code: '', name: r.name, category: 'electronics', unit: r.unit }); setNewFor(r) }}>
                      + {t('Katalogga qo\'shish')}
                    </Button>
                  )}
                </TableCell>
                <TableCell>{formatNumber(r.qty)} {r.unit}</TableCell>
                <TableCell><TextField size="small" value={r.tnvedCode ?? ''} onChange={(e) => set(r.id, { tnvedCode: e.target.value })} sx={{ width: 120 }} /></TableCell>
                {PRICE_FIELDS.map((f) => (
                  <TableCell key={f.key}>
                    <TextField size="small" type="number" value={numField(r[f.key] as number | null)} sx={{ width: f.width }}
                      onChange={(e) => set(r.id, { [f.key]: toNum(e.target.value) } as Partial<RequestItem>)} />
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {(() => { const c = unitCost(r); return c === null ? '—' : formatCurrency(c) })()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <CommentField value={comment} onChange={setComment} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" startIcon={<Save />} disabled={busy} onClick={() => act('pricing', payload(), 'Saqlandi')}>{t('Saqlash')}</Button>
        <Button variant="contained" startIcon={<Send />} disabled={busy || !ready}
          onClick={async () => { if (await act('pricing', payload())) await act('submit-pricing', { comment: comment || null }, 'Yuborildi') }}>
          {t('Saqlash va yuborish')}
        </Button>
      </Box>

      <Dialog open={!!newFor} onClose={() => setNewFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{t('Yangi mahsulot')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField size="small" label={t('Kod')} value={np.code} onChange={(e) => setNp({ ...np, code: e.target.value })} />
          <TextField size="small" label={t('Nomi')} value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
          <TextField size="small" label={t("O'lchov")} value={np.unit} onChange={(e) => setNp({ ...np, unit: e.target.value })} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setNewFor(null)} color="inherit">{t('Bekor')}</Button>
          <Button variant="contained" disabled={!np.code.trim() || !np.name.trim()} onClick={createProduct}>{t('Saqlash')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ───────────── Review: markup ─────────────

function ReviewStage({ req, act, busy }: Props) {
  const { t } = useTranslation()
  const [markup, setMarkup] = useState(String(req.markupPct ?? 20))
  const [manual, setManual] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const m = Number(markup) || 0
  const price = (i: RequestItem) => (manual[i.id] !== undefined && manual[i.id] !== '' ? Number(manual[i.id]) : Math.round((i.unitCost ?? 0) * (1 + m / 100) * 100) / 100)
  const totalCost = req.items.reduce((s, i) => s + (i.unitCost ?? 0) * i.qty, 0)
  const totalPrice = req.items.reduce((s, i) => s + price(i) * i.qty, 0)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField size="small" type="number" label={t('Ustama %')} value={markup} onChange={(e) => setMarkup(e.target.value)} sx={{ maxWidth: 160 }} />
      <Box sx={scroll}>
        <Table size="small" sx={{ minWidth: 560 }}>
          <TableHead><TableRow>
            <TableCell>{t('Mahsulot')}</TableCell><TableCell align="right">{t('Soni')}</TableCell>
            <TableCell align="right">{t('Tannarx (dona)')}</TableCell><TableCell align="right">{t('Sotuv narxi (dona)')}</TableCell><TableCell align="right">{t('Jami')}</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {req.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.name}</TableCell>
                <TableCell align="right">{formatNumber(i.qty)}</TableCell>
                <TableCell align="right">{formatCurrency(i.unitCost ?? 0)}</TableCell>
                <TableCell align="right">
                  <TextField size="small" type="number" sx={{ width: 140 }} placeholder={String(price(i))}
                    value={manual[i.id] ?? ''} onChange={(e) => setManual({ ...manual, [i.id]: e.target.value })} />
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(price(i) * i.qty)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        <Typography>{t('Tannarx')}: <b>{formatCurrency(totalCost)}</b></Typography>
        <Typography>{t('Sotuv')}: <b>{formatCurrency(totalPrice)}</b></Typography>
        <Typography color="success.main">{t('Foyda')}: <b>{formatCurrency(totalPrice - totalCost)}</b></Typography>
      </Box>
      <CommentField value={comment} onChange={setComment} />
      <Box>
        <Button variant="contained" startIcon={<Send />} disabled={busy}
          onClick={() => act('review', {
            markupPct: m, comment: comment || null,
            prices: Object.entries(manual).filter(([, v]) => v !== '').map(([id, v]) => ({ id, salePrice: Number(v) })),
          }, 'Buyurtmachiga yuborildi')}>
          {t('Narxni tasdiqlash va buyurtmachiga yuborish')}
        </Button>
      </Box>
    </Box>
  )
}

// ───────────── Approve / reject (customer, procurement) ─────────────

function DecisionStage({ act, busy, action, approveLabel, rejectLabel }: Props & { action: string; approveLabel: string; rejectLabel: string }) {
  const { t } = useTranslation()
  const [comment, setComment] = useState('')
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <CommentField value={comment} onChange={setComment} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" color="success" startIcon={<CheckCircle />} disabled={busy}
          onClick={() => act(action, { approved: true, comment: comment || null }, 'Tasdiqlandi')}>{t(approveLabel)}</Button>
        <Button variant="outlined" color="error" startIcon={<Cancel />} disabled={busy}
          onClick={() => act(action, { approved: false, comment: comment || null }, 'Qaytarildi')}>{t(rejectLabel)}</Button>
      </Box>
    </Box>
  )
}

// ───────────── Contract ─────────────

function ContractStage({ req, act, busy }: Props) {
  const { t } = useTranslation()
  const { data: templates } = useFetch<{ id: string; name: string; isDefault: boolean }[]>('/contract-templates')
  const [templateId, setTemplateId] = useState('')
  const [deadlineDays, setDeadlineDays] = useState(String(req.contract?.deadlineDays ?? 90))
  const [advancePct, setAdvancePct] = useState(String(req.advancePct ?? 30))
  const effectiveTemplate = templateId || templates?.find((x) => x.isDefault)?.id || ''
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField select size="small" label={t('Shablon')} value={effectiveTemplate} onChange={(e) => setTemplateId(e.target.value)} sx={{ minWidth: 220 }}>
          {(templates ?? []).map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
        </TextField>
        <TextField size="small" type="number" label={t('Muddat (kun)')} value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value)} sx={{ width: 140 }} />
        <TextField size="small" type="number" label={t('Avans %')} value={advancePct} onChange={(e) => setAdvancePct(e.target.value)} sx={{ width: 120 }} />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" startIcon={<Description />} disabled={busy}
          onClick={() => act('contract', { templateId: effectiveTemplate || null, deadlineDays: Number(deadlineDays), advancePct: Number(advancePct) }, 'Shartnoma tayyorlandi')}>
          {req.contract ? t('Shartnomani qayta yaratish') : t('Shartnoma yaratish')}
        </Button>
        <Button variant="contained" startIcon={<CheckCircle />} disabled={busy || !req.contract}
          onClick={() => act('sign-contract', {}, 'Shartnoma imzolandi')}>{t('Shartnoma imzolandi')}</Button>
      </Box>
    </Box>
  )
}

// ───────────── Advance payment ─────────────

function AdvanceStage({ req, act, busy }: Props) {
  const { t } = useTranslation()
  const canPay = useCan('payments.create')
  const canConfirm = useCan('requests.advance')
  const need = req.advanceAmount ?? 0
  const paid = req.paid ?? 0
  const [amount, setAmount] = useState(String(Math.max(0, need - paid)))
  const [type, setType] = useState('transfer')
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Alert severity={paid >= need ? 'success' : 'warning'}>
        {t("Avans: {{need}} · To'langan: {{paid}}", { need: formatCurrency(need), paid: formatCurrency(paid) })}
        {paid < need && <> — {t("avans kelmaguncha ish boshlanmaydi")}</>}
      </Alert>
      {canPay && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" type="number" label={t('Summa')} value={amount} onChange={(e) => setAmount(e.target.value)} sx={{ width: 180 }} />
          <TextField select size="small" label={t('Turi')} value={type} onChange={(e) => setType(e.target.value)} sx={{ width: 140 }}>
            <MenuItem value="cash">{t('Naqd')}</MenuItem><MenuItem value="card">{t('Karta')}</MenuItem><MenuItem value="transfer">{t("O'tkazma")}</MenuItem>
          </TextField>
          <Button variant="outlined" startIcon={<Payments />} disabled={busy || !(Number(amount) > 0)}
            onClick={() => act('__payment', { type, amount: Number(amount) }, "To'lov saqlandi")}>{t("To'lovni kiritish")}</Button>
        </Box>
      )}
      {canConfirm && (
        <Box><Button variant="contained" startIcon={<CheckCircle />} disabled={busy || paid < need}
          onClick={() => act('confirm-advance', {}, 'Avans tasdiqlandi')}>{t('Avansni tasdiqlash')}</Button></Box>
      )}
    </Box>
  )
}

// ───────────── Procurement ─────────────

function ProcurementStage({ req, act, busy }: Props) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const suppliers = useAppSelector((s) => s.suppliers.items)
  const [rows, setRows] = useState(() => req.items.filter((i) => i.source === 'purchase').map((i) => ({ ...i })))
  const [comment, setComment] = useState('')
  useEffect(() => { dispatch(fetchSuppliers()) }, [dispatch])
  const set = (id: string, patch: Partial<RequestItem>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const payload = () => ({ items: rows.map((r) => ({ id: r.id, supplierId: r.supplierId || null, actualPrice: r.actualPrice ?? undefined, actualLogistics: r.actualLogistics ?? 0, otherCosts: r.otherCosts ?? 0 })) })
  const ready = rows.every((r) => r.supplierId && (r.actualPrice ?? 0) > 0)
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">{t("Ta'minotchi qayerdan olib kelishini, logistika va boshqa xarajatlarni kiriting (summalar qator bo'yicha jami).")}</Typography>
      <Box sx={scroll}>
        <Table size="small" sx={{ minWidth: 820 }}>
          <TableHead><TableRow>
            <TableCell>{t('Mahsulot')}</TableCell><TableCell>{t('Soni')}</TableCell><TableCell>{t('Yetkazuvchi')}</TableCell>
            <TableCell>{t('Haqiqiy narx (dona)')}</TableCell><TableCell>{t('Logistika')}</TableCell><TableCell>{t('Boshqa xarajat')}</TableCell>
            <TableCell align="right">{t('Reja tannarx')}</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell>{formatNumber(r.qty)}</TableCell>
                <TableCell>
                  <TextField select size="small" value={r.supplierId ?? ''} onChange={(e) => set(r.id, { supplierId: e.target.value })} sx={{ minWidth: 180 }}>
                    {suppliers.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                  </TextField>
                </TableCell>
                <TableCell><TextField size="small" type="number" value={numField(r.actualPrice)} onChange={(e) => set(r.id, { actualPrice: toNum(e.target.value) ?? null })} sx={{ width: 130 }} /></TableCell>
                <TableCell><TextField size="small" type="number" value={numField(r.actualLogistics)} onChange={(e) => set(r.id, { actualLogistics: toNum(e.target.value) ?? 0 })} sx={{ width: 110 }} /></TableCell>
                <TableCell><TextField size="small" type="number" value={numField(r.otherCosts)} onChange={(e) => set(r.id, { otherCosts: toNum(e.target.value) ?? 0 })} sx={{ width: 110 }} /></TableCell>
                <TableCell align="right">{formatCurrency(r.unitCost ?? 0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <CommentField value={comment} onChange={setComment} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" startIcon={<Save />} disabled={busy} onClick={() => act('procurement', payload(), 'Saqlandi')}>{t('Saqlash')}</Button>
        <Button variant="contained" startIcon={<Send />} disabled={busy || !ready}
          onClick={async () => { if (await act('procurement', payload())) await act('submit-procurement', { comment: comment || null }, 'Buxgalterga yuborildi') }}>
          {t('Buxgalterga yuborish')}
        </Button>
      </Box>
    </Box>
  )
}

// ───────────── Assembly ─────────────

function AssemblyStage({ req, act, busy }: Props) {
  const { t } = useTranslation()
  const [comment, setComment] = useState('')
  const allIssued = req.items.every((i) => i.issuedQty >= i.qty)
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={scroll}>
        <Table size="small" sx={{ minWidth: 420 }}>
          <TableBody>
            {req.items.map((i) => {
              const done = i.issuedQty >= i.qty
              return (
                <TableRow key={i.id}>
                  <TableCell>{i.name}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Chip size="small" color={done ? 'success' : 'default'} label={`${formatNumber(i.issuedQty)} / ${formatNumber(i.qty)} ${i.unit}`} />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', width: 1 }}>
                    <Tooltip title={t('Ombordan olish')}><span>
                      <IconButton size="small" color="primary" aria-label={t('Ombordan olish')} disabled={busy || done}
                        onClick={() => act('issue', { itemId: i.id, qty: i.qty - i.issuedQty }, 'Ombordan olindi')}><Inventory2 fontSize="small" /></IconButton>
                    </span></Tooltip>
                    <Tooltip title={t('Qaytarish')}><span>
                      <IconButton size="small" aria-label={t('Qaytarish')} disabled={busy || i.issuedQty <= 0}
                        onClick={() => act('return', { itemId: i.id, qty: Math.min(1, i.issuedQty) }, 'Omborga qaytarildi')}><Undo fontSize="small" /></IconButton>
                    </span></Tooltip>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Box>
      <CommentField value={comment} onChange={setComment} />
      <Box><Button variant="contained" startIcon={<CheckCircle />} disabled={busy || !allIssued}
        onClick={() => act('finish-assembly', { comment: comment || null }, "Yig'ish tugadi")}>{t("Yig'ish tugadi")}</Button></Box>
    </Box>
  )
}

// ───────────── Simple one-button stages ─────────────

function OneButton({ act, busy, action, label, ok, icon, hint, commentLabel }: Props & { action: string; label: string; ok: string; icon: React.ReactNode; hint?: string; commentLabel?: string }) {
  const { t } = useTranslation()
  const [comment, setComment] = useState('')
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {hint && <Typography variant="body2" color="text.secondary">{t(hint)}</Typography>}
      {commentLabel
        ? <TextField size="small" fullWidth required label={t(commentLabel)} value={comment} onChange={(e) => setComment(e.target.value)} />
        : <CommentField value={comment} onChange={setComment} />}
      <Box><Button variant="contained" startIcon={icon} disabled={busy || (!!commentLabel && !comment.trim())}
        onClick={() => act(action, { comment: comment.trim() || null }, ok)}>{t(label)}</Button></Box>
    </Box>
  )
}

/** The action area for the current stage; shown only to users who are responsible for it. */
export default function StagePanel(props: Props) {
  const { t } = useTranslation()
  const me = useAppSelector((s) => s.auth.user)
  const info = STATUS_INFO[props.req.status]
  const allowed = useMemo(() => {
    if (!me || !info.perm) return false
    if (props.req.status === 'ADVANCE_PAYMENT') return me.permissions.includes('requests.advance') || me.permissions.includes('payments.create')
    return me.permissions.includes(info.perm as Permission)
  }, [me, info.perm, props.req.status])

  if (!info.perm) return null
  const body = (() => {
    switch (props.req.status) {
      case 'NEW': return <OneButton {...props} action="take" label="Ishga olish" ok="Ishga olindi" icon={<CheckCircle />} />
      case 'CONFIGURATION': return <ConfigurationStage {...props} />
      case 'PRICING': return <PricingStage {...props} />
      case 'REVIEW': return <ReviewStage {...props} />
      case 'CUSTOMER_APPROVAL': return <DecisionStage {...props} action="customer-decision" approveLabel="Buyurtmachi tasdiqladi" rejectLabel="Narxni qayta ko'rish" />
      case 'CONTRACT': return <ContractStage {...props} />
      case 'ADVANCE_PAYMENT': return <AdvanceStage {...props} />
      case 'PROCUREMENT': return <ProcurementStage {...props} />
      case 'PROCUREMENT_APPROVAL': return <DecisionStage {...props} action="procurement-decision" approveLabel="Xarajatlarni tasdiqlash" rejectLabel="Qaytarish" />
      case 'RECEIVING': return <OneButton {...props} action="receive" label="Omborga qabul qilish" ok="Omborga qabul qilindi" icon={<Inventory2 />} hint="Tovar kelganda omborga kirim qiling: qoldiq, yetkazuvchi qarzi va faktura avtomatik yoziladi." />
      case 'ASSEMBLY': return <AssemblyStage {...props} />
      case 'ACT': return <OneButton {...props} action="act" label="Dalolatnoma yaratish" ok="Dalolatnoma yaratildi" icon={<Description />} />
      case 'DELIVERY': return <OneButton {...props} action="deliver" label="Yetkazib berildi" ok="Zayavka yakunlandi" icon={<LocalShipping />} commentLabel="Kim qabul qildi (F.I.Sh., manzil)" />
      default: return null
    }
  })()

  return (
    <Card variant="outlined" sx={{ p: 2, borderRadius: 3, borderColor: allowed ? 'primary.main' : 'divider', borderWidth: allowed ? 2 : 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{t('Hozirgi bosqich')}: {t(info.label)}</Typography>
      {allowed ? body : (
        <Typography variant="body2" color="text.secondary">{t('Bu bosqichni boshqa xodim bajaradi. Siz faqat kuzatasiz.')}</Typography>
      )}
    </Card>
  )
}
