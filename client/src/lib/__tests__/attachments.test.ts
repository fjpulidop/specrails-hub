import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api', () => ({ getApiBase: () => '/api/projects/proj-1' }))
vi.mock('../auth', () => ({ getHubToken: vi.fn(() => null) }))

import { uploadAttachment, deleteAttachment, deleteAllAttachments, listAttachments, attachmentFileUrl } from '../attachments'
import { getHubToken } from '../auth'

describe('attachments lib', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getHubToken).mockReturnValue(null)
  })

  describe('uploadAttachment', () => {
    it('POSTs to the attachments endpoint and returns attachment', async () => {
      const att = { id: 'a1', filename: 'x.txt', storedName: 'u-x.txt', mimeType: 'text/plain', size: 5, addedAt: '' }
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ attachment: att }),
      })
      const file = new File(['hello'], 'x.txt', { type: 'text/plain' })
      const result = await uploadAttachment('1', file)
      expect(result).toEqual(att)
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/proj-1/tickets/1/attachments',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('throws on non-ok response with error body', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Unsupported file type' }),
      })
      const file = new File([''], 'v.mp4', { type: 'video/mp4' })
      await expect(uploadAttachment('1', file)).rejects.toThrow('Unsupported file type')
    })

    it('throws with status code when error body parse fails', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('bad json') },
      })
      const file = new File([''], 'f.txt', { type: 'text/plain' })
      await expect(uploadAttachment('1', file)).rejects.toThrow('Upload failed (500)')
    })
  })

  describe('deleteAttachment', () => {
    it('DELETEs the attachment endpoint', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204 })
      await deleteAttachment('1', 'att-1')
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/proj-1/tickets/1/attachments/att-1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })

    it('ignores 404 responses', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 404 })
      await expect(deleteAttachment('1', 'att-1')).resolves.toBeUndefined()
    })

    it('throws for non-404 errors', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 })
      await expect(deleteAttachment('1', 'att-1')).rejects.toThrow('Delete failed (500)')
    })
  })

  describe('deleteAllAttachments', () => {
    it('DELETEs the ticket attachments collection', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204 })
      await deleteAllAttachments('1')
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/proj-1/tickets/1/attachments',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })

    it('ignores 404', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 404 })
      await expect(deleteAllAttachments('1')).resolves.toBeUndefined()
    })

    it('throws for other errors', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 })
      await expect(deleteAllAttachments('1')).rejects.toThrow('Bulk delete failed (500)')
    })
  })

  describe('listAttachments', () => {
    it('GETs the attachments list', async () => {
      const atts = [{ id: 'a1', filename: 'x.txt', storedName: 'u-x.txt', mimeType: 'text/plain', size: 5, addedAt: '' }]
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ attachments: atts }),
      })
      const result = await listAttachments('1')
      expect(result).toEqual(atts)
    })

    it('throws on error', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 })
      await expect(listAttachments('1')).rejects.toThrow('List failed (500)')
    })
  })

  describe('attachmentFileUrl', () => {
    it('returns bare URL when no token', () => {
      vi.mocked(getHubToken).mockReturnValue(null)
      const url = attachmentFileUrl('1', 'att-1')
      expect(url).toBe('/api/projects/proj-1/tickets/1/attachments/att-1')
    })

    it('appends token as query param when token present', () => {
      vi.mocked(getHubToken).mockReturnValue('my-token')
      const url = attachmentFileUrl('1', 'att-1')
      expect(url).toContain('?token=my-token')
    })

    it('encodes token in query param', () => {
      vi.mocked(getHubToken).mockReturnValue('tok en+val')
      const url = attachmentFileUrl('1', 'att-1')
      expect(url).toContain('token=tok%20en%2Bval')
    })
  })
})
