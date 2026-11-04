import { Button, Chip } from '@mui/material'
import { Add, CheckCircle, Cancel } from '@mui/icons-material'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import AnimatedPage from '@/shared/components/AnimatedPage/AnimatedPage'
import PageHeader from '@/shared/components/PageHeader/PageHeader'
import DataTable from '@/shared/components/DataTable/DataTable'
import ConfirmDialog from '@/shared/components/ConfirmDialog/ConfirmDialog'
import CrudDialog, { type FieldDef } from '@/shared/components/CrudDialog/CrudDialog'
import RowActions from '@/shared/components/RowActions/RowActions'
import { useAppDispatch, useAppSelector, useCan } from '@/app/hooks'
import { fetchProducts, createProduct, updateProduct, deleteProduct } from './store/productsSlice'
import type { Product, ProductCategory, UnitOfMeasure } from '@/shared/types/catalog.types'
import { formatCurrency, generateId } from '@/shared/utils/formatters'
import { reqStr, money, optStr } from '@/shared/utils/validation'
import type { TableColumn } from '@/shared/types/common.types'
import { useCatalog } from '../useCatalog'
import { CATEGORIES, UNITS, CAT_LABELS } from '@/shared/constants'

const schema = z.object({
  code: reqStr(),
  name: reqStr(2),
  unit: z.enum(UNITS as [UnitOfMeasure, ...UnitOfMeasure[]]),
  category: z.enum(CATEGORIES as [ProductCategory, ...ProductCategory[]]),
  price: money,
  costPrice: money,
  barcode: optStr,
  description: optStr,
  isActive: z.boolean(),
})

const FIELDS: FieldDef[] = [
  { name: 'code', label: 'Kod', xs: 4 },
  { name: 'name', label: 'Nomi', xs: 8 },
  { name: 'price', label: 'Narxi (UZS)', xs: 6, type: 'number' },
  { name: 'costPrice', label: 'Tannarxi (UZS)', xs: 6, type: 'number' },
  { name: 'barcode', label: 'Shtrix-kod', xs: 6 },
  { name: 'description', label: 'Izoh', xs: 6 },
  { name: 'unit', label: "O'lchov birligi", xs: 6, type: 'select', options: UNITS.map((u) => ({ value: u, label: u })) },
  { name: 'category', label: 'Kategoriya', xs: 6, type: 'select', options: CATEGORIES.map((c) => ({ value: c, label: CAT_LABELS[c] })) },
  { name: 'isActive', label: 'Faol', type: 'switch' },
]

const EMPTY = { code: '', name: '', unit: 'dona', category: 'other', price: 0, costPrice: 0, barcode: '', description: '', isActive: true }

export default function ProductsPage() {
  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  const { items: products, loading } = useAppSelector((s) => s.products)
  const canWrite = useCan('products.manage')
  const showCost = useCan('costs.view')
  // The server omits prices for users who may not see them (engineer).
  const showPrice = products.some((p) => p.price !== undefined)

  useEffect(() => { dispatch(fetchProducts()) }, [dispatch])

  const cat = useCatalog<Product>({
    create: (d) => { const now = new Date().toISOString(); return dispatch(createProduct({ id: generateId(), ...d, createdAt: now, updatedAt: now } as Product)).unwrap() },
    update: (id, d) => dispatch(updateProduct({ id, data: { ...d, updatedAt: new Date().toISOString() } })).unwrap(),
    remove: (id) => dispatch(deleteProduct(id)).unwrap(),
  })

  const columns = useMemo<TableColumn<Product>[]>(() => [
    { id: 'code', label: 'Kod', minWidth: 80 },
    { id: 'name', label: 'Nomi', minWidth: 180 },
    { id: 'category', label: 'Kategoriya', minWidth: 110,
      format: (v) => <Chip label={t(CAT_LABELS[v as ProductCategory] ?? String(v))} size="small" sx={{ borderRadius: 1 }} />,
      exportValue: (r) => t(CAT_LABELS[r.category] ?? r.category) },
    { id: 'unit', label: "O'lchov", minWidth: 70 },
    ...(showPrice ? [{ id: 'price', label: 'Narxi', minWidth: 120, align: 'right' as const, format: (v: unknown) => formatCurrency(v as number) }] : []),
    ...(showCost ? [{ id: 'costPrice', label: 'Tannarxi', minWidth: 120, align: 'right' as const, format: (v: unknown) => formatCurrency(v as number) }] : []),
    { id: 'isActive', label: 'Holat', minWidth: 80, align: 'center',
      format: (v) => v ? <CheckCircle color="success" fontSize="small" /> : <Cancel color="error" fontSize="small" />,
      exportValue: (r) => (r.isActive ? t('Faol') : t('Nofaol')) },
  ], [t, showPrice, showCost])

  const defaults = useMemo(() => (cat.editing ?? EMPTY) as unknown as Record<string, unknown>, [cat.editing])

  return (
    <AnimatedPage>
      <PageHeader
        title="Mahsulotlar"
        subtitle={t('Jami: {{count}} ta mahsulot', { count: products.length })}
        breadcrumbs={[{ label: 'Kataloglar' }, { label: 'Mahsulotlar' }]}
        actions={canWrite && <Button variant="contained" startIcon={<Add />} onClick={cat.openCreate}>{t("Qo'shish")}</Button>}
      />
      <DataTable
        columns={columns} rows={products} loading={loading} searchable exportName="mahsulotlar"
        searchPlaceholder="Mahsulot qidirish..."
        rowActions={canWrite ? (row) => <RowActions onEdit={() => cat.openEdit(row)} onDelete={() => cat.setDeleting(row)} /> : undefined}
      />
      <CrudDialog open={cat.open} title={cat.editing ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'} fields={FIELDS}
        schema={schema} defaultValues={defaults} onClose={cat.close} onSubmit={cat.submit} />
      <ConfirmDialog open={!!cat.deleting} message={t('"{{name}}" mahsulotini o\'chirasizmi?', { name: cat.deleting?.name })}
        onConfirm={cat.confirmDelete} onClose={() => cat.setDeleting(null)} />
    </AnimatedPage>
  )
}
