import { getApiBase } from './api'
import { getHubToken } from './auth'
import type { Attachment } from '../types'

export async function uploadAttachment(
  ticketKey: string | number,
  file: File,
  signal?: AbortSignal,
): Promise<Attachment> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${getApiBase()}/tickets/${ticketKey}/attachments`, {
    method: 'POST',
    body: form,
    signal,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Upload failed (${res.status})`)
  }
  const data = (await res.json()) as { attachment: Attachment }
  return data.attachment
}

export async function deleteAttachment(ticketKey: string | number, attachmentId: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/tickets/${ticketKey}/attachments/${attachmentId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Delete failed (${res.status})`)
  }
}

export async function deleteAllAttachments(ticketKey: string | number): Promise<void> {
  const res = await fetch(`${getApiBase()}/tickets/${ticketKey}/attachments`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Bulk delete failed (${res.status})`)
  }
}

export async function listAttachments(ticketKey: string | number): Promise<Attachment[]> {
  const res = await fetch(`${getApiBase()}/tickets/${ticketKey}/attachments`)
  if (!res.ok) throw new Error(`List failed (${res.status})`)
  const data = (await res.json()) as { attachments: Attachment[] }
  return data.attachments
}

export function attachmentFileUrl(ticketKey: string | number, attachmentId: string): string {
  const base = `${getApiBase()}/tickets/${ticketKey}/attachments/${attachmentId}`
  const token = getHubToken()
  // <a href> / <img src> navigations cannot set headers — append token as query param.
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

export const ATTACHMENT_ACCEPT_MIME =
  'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/csv,text/plain,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/sql,application/x-sql,text/sql,text/x-sql,.sql'

const SUPPORTED_ATTACHMENT_MIMES = new Set(
  ATTACHMENT_ACCEPT_MIME.split(',').filter((part) => !part.startsWith('.')),
)
const SQL_EXTENSION_RE = /\.sql$/i

export function isSupportedAttachmentFile(file: Pick<File, 'name' | 'type'>): boolean {
  return SUPPORTED_ATTACHMENT_MIMES.has(file.type) || SQL_EXTENSION_RE.test(file.name)
}
