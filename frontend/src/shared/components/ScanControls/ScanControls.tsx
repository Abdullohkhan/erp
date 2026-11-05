import { useRef } from 'react'
import { Box, Button, Chip, Tooltip } from '@mui/material'
import { CloudUpload, Download, Verified } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import { useAction } from '@/shared/hooks/useAction'
import { downloadFile, SCAN_ACCEPT, SCAN_MAX_MB, uploadFile } from '@/lib/download'

interface Doc { id: string; number: string; status?: string; scanName?: string | null }

/**
 * Signed scan of a contract / act: "signed" chip, upload (PDF/JPG/PNG, size checked here and on the server)
 * and download. `onUploaded` receives the server response (the updated request).
 */
export default function ScanControls<T>({ kind, doc, canUpload, onUploaded, size = 'small' }: {
  kind: 'contracts' | 'acts'; doc: Doc; canUpload: boolean; onUploaded?: (data: T) => void; size?: 'small' | 'medium'
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const { busy, run } = useAction()
  const signed = doc.status === 'signed'

  const pick = (file: File | undefined) => {
    if (!file) return
    run(async () => {
      if (!/\.(pdf|jpe?g|png)$/i.test(file.name) && !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
        throw new Error(t('Faqat PDF, JPG yoki PNG fayl yuklash mumkin'))
      }
      if (file.size > SCAN_MAX_MB * 1024 * 1024) throw new Error(t('Fayl hajmi juda katta (maksimal {{mb}} MB)', { mb: SCAN_MAX_MB }))
      const { data } = await uploadFile<T>(`/${kind}/${doc.id}/scan`, file)
      onUploaded?.(data)
    }, 'Imzolangan skan yuklandi').finally(() => { if (input.current) input.current.value = '' })
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <Chip size="small" icon={signed ? <Verified /> : undefined} color={signed ? 'success' : 'default'} label={t(signed ? 'Imzolangan' : 'Imzolanmagan')} />
      {doc.scanName && (
        <Tooltip title={doc.scanName}>
          <Button size={size} startIcon={<Download />} disabled={busy}
            onClick={() => run(() => downloadFile(`/${kind}/${doc.id}/scan`, doc.scanName!), 'Yuklab olindi')}>{t('Skan')}</Button>
        </Tooltip>
      )}
      {canUpload && (
        <>
          <input ref={input} type="file" hidden accept={SCAN_ACCEPT} onChange={(e) => pick(e.target.files?.[0])} />
          <Button size={size} startIcon={<CloudUpload />} disabled={busy} onClick={() => input.current?.click()}>
            {t(doc.scanName ? 'Skanni almashtirish' : 'Imzolangan skanni yuklash')}
          </Button>
        </>
      )}
    </Box>
  )
}
