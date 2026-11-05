import api from './axios'

/** Downloads a file from the API with the auth header (PDF, scans) and saves it under `fileName`. */
export async function downloadFile(url: string, fileName: string) {
  const res = await api.get<Blob>(url, { responseType: 'blob', timeout: 60000 })
  const href = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = href
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10000)
}

/** Uploads one file as multipart field "file". */
export function uploadFile<T>(url: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return api.post<T>(url, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })
}

export const SCAN_ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png'
export const SCAN_MAX_MB = 10
