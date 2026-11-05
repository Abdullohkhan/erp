import { useMemo, useState } from 'react'
import { IconButton, Tooltip } from '@mui/material'
import { Description, OpenInNew } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AnimatedPage from '@/shared/components/AnimatedPage/AnimatedPage'
import PageHeader from '@/shared/components/PageHeader/PageHeader'
import DataTable from '@/shared/components/DataTable/DataTable'
import StatusChip from '@/shared/components/StatusChip/StatusChip'
import HtmlDocDialog from '@/shared/components/HtmlDocDialog/HtmlDocDialog'
import ScanControls from '@/shared/components/ScanControls/ScanControls'
import { useCan } from '@/app/hooks'
import { useFetch } from '@/shared/hooks/useFetch'
import { formatCurrency, formatDate } from '@/shared/utils/formatters'
import type { TableColumn } from '@/shared/types/common.types'

interface Doc {
  id: string; number: string; body: string; createdAt: string; status?: string; amount?: number; advancePct?: number
  scanName?: string | null
  request: { id: string; number: string; status?: string; paid?: number; customer: { name: string } }
}

/** Contracts or acts list; `kind` picks the endpoint. */
export default function DocumentsPage({ kind }: { kind: 'contracts' | 'acts' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, loading, reload } = useFetch<Doc[]>(`/${kind}`)
  const canUpload = useCan(kind === 'contracts' ? 'requests.contract' : 'requests.act')
  const [open, setOpen] = useState<Doc | null>(null)
  const title = kind === 'contracts' ? 'Shartnomalar' : 'Dalolatnomalar'

  const columns = useMemo<TableColumn<Doc>[]>(() => [
    { id: 'number', label: 'Raqam', minWidth: 120 },
    { id: 'createdAt', label: 'Sana', minWidth: 100, format: (v) => formatDate(v as string), exportValue: (r) => formatDate(r.createdAt) },
    { id: 'request', label: 'Mijoz', minWidth: 180, format: (_v, r) => r.request.customer.name, exportValue: (r) => r.request.customer.name },
    { id: 'requestNumber', label: 'Zayavka', minWidth: 110, format: (_v, r) => r.request.number, exportValue: (r) => r.request.number },
    ...(kind === 'contracts' ? [
      { id: 'amount', label: 'Summa', minWidth: 130, align: 'right' as const, format: (v: unknown) => formatCurrency(v as number) },
      { id: 'paid', label: "To'langan", minWidth: 130, align: 'right' as const, format: (_v: unknown, r: Doc) => formatCurrency(r.request.paid ?? 0), exportValue: (r: Doc) => r.request.paid ?? 0 },
    ] : []),
    { id: 'status', label: 'Holat', minWidth: 110, format: (v: unknown) => <StatusChip status={v === 'signed' ? 'confirmed' : 'draft'} /> },
    {
      id: 'scanName', label: 'Imzolangan skan', minWidth: 220, exportValue: (r: Doc) => r.scanName ?? '',
      format: (_v: unknown, r: Doc) => (
        <span onClick={(e) => e.stopPropagation()}>
          <ScanControls kind={kind} doc={r} onUploaded={reload}
            canUpload={canUpload && r.request.status !== 'CANCELLED' && (kind === 'acts' || r.status === 'signed' || r.request.status === 'CONTRACT')} />
        </span>
      ),
    },
  ], [kind, canUpload, reload])

  return (
    <AnimatedPage>
      <PageHeader title={title} subtitle={t('Jami: {{count}}', { count: data?.length ?? 0 })} breadcrumbs={[{ label: 'CRM' }, { label: title }]} />
      <DataTable columns={columns} rows={data ?? []} loading={loading} searchable exportName={kind} onRowClick={setOpen}
        rowActions={(r) => (
          <>
            <Tooltip title={t("Ko'rish")}><IconButton size="small" onClick={() => setOpen(r)}><Description fontSize="small" /></IconButton></Tooltip>
            <Tooltip title={t('Zayavka')}><IconButton size="small" onClick={() => navigate(`/requests/${r.request.id}`)}><OpenInNew fontSize="small" /></IconButton></Tooltip>
          </>
        )} />
      {open && <HtmlDocDialog open title={`${t(title)} ${open.number}`} html={open.body} onClose={() => setOpen(null)}
        pdf={{ url: `/${kind}/${open.id}/pdf`, fileName: `${kind === 'contracts' ? 'Shartnoma' : 'Dalolatnoma'}-${open.number}.pdf` }} />}
    </AnimatedPage>
  )
}
