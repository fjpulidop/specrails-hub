import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { secureDir, secureDbFile } from './secure-fs'

describe('secure-fs (H-13 permissions)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chmodSpy: any
  const realPlatform = process.platform

  beforeEach(() => {
    chmodSpy = vi.spyOn(fs, 'chmodSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    chmodSpy.mockRestore()
    Object.defineProperty(process, 'platform', { value: realPlatform })
  })

  function setPlatform(p: string) {
    Object.defineProperty(process, 'platform', { value: p })
  }

  describe('on POSIX', () => {
    beforeEach(() => setPlatform('darwin'))

    it('secureDir chmods the directory to 0700', () => {
      secureDir('/some/dir')
      expect(chmodSpy).toHaveBeenCalledWith('/some/dir', 0o700)
    })

    it('secureDbFile chmods the db and both WAL sidecars to 0600', () => {
      secureDbFile('/some/jobs.sqlite')
      expect(chmodSpy).toHaveBeenCalledWith('/some/jobs.sqlite', 0o600)
      expect(chmodSpy).toHaveBeenCalledWith('/some/jobs.sqlite-wal', 0o600)
      expect(chmodSpy).toHaveBeenCalledWith('/some/jobs.sqlite-shm', 0o600)
    })

    it('secureDbFile skips :memory:', () => {
      secureDbFile(':memory:')
      expect(chmodSpy).not.toHaveBeenCalled()
    })

    it('never throws when chmod fails (best-effort)', () => {
      chmodSpy.mockImplementation(() => { throw new Error('EPERM') })
      expect(() => secureDir('/x')).not.toThrow()
      expect(() => secureDbFile('/x.sqlite')).not.toThrow()
    })

    it('actually restricts a real temp dir and file end-to-end', () => {
      chmodSpy.mockRestore() // use the real chmod for this one
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'securefs-'))
      const file = path.join(dir, 'jobs.sqlite')
      fs.writeFileSync(file, 'x')
      secureDir(dir)
      secureDbFile(file)
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700)
      expect(fs.statSync(file).mode & 0o777).toBe(0o600)
      fs.rmSync(dir, { recursive: true, force: true })
    })
  })

  describe('on Windows', () => {
    beforeEach(() => setPlatform('win32'))

    it('secureDir is a no-op', () => {
      secureDir('C:\\some\\dir')
      expect(chmodSpy).not.toHaveBeenCalled()
    })

    it('secureDbFile is a no-op', () => {
      secureDbFile('C:\\some\\jobs.sqlite')
      expect(chmodSpy).not.toHaveBeenCalled()
    })
  })
})
