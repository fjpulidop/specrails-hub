import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useActiveTheme } from '../../context/ThemeContext'
import { ensureMonacoEnvironment, defineMonacoThemeFor } from '../../lib/monaco-setup'

interface InnerProps {
  content: string
  language: string
  readOnly: boolean
  onChange?: (value: string) => void
}

function InnerEditor({ content, language, readOnly, onChange }: InnerProps) {
  const { t } = useTranslation('code')
  const theme = useActiveTheme()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<unknown>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const [loadError, setLoadError] = useState(false)

  // The create effect runs once but monaco-editor loads ASYNC. Read the latest
  // content/language/theme/readOnly/onChange from refs at create time so a file
  // switched (or theme/mode changed) before the chunk resolved is not rendered
  // with stale initial values — the update effects below no-op while editorRef
  // is still null.
  const contentRef = useRef(content)
  const languageRef = useRef(language)
  const themeRef = useRef(theme)
  const readOnlyRef = useRef(readOnly)
  const onChangeRef = useRef(onChange)
  useEffect(() => { contentRef.current = content }, [content])
  useEffect(() => { languageRef.current = language }, [language])
  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { readOnlyRef.current = readOnly }, [readOnly])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    let disposed = false
    ensureMonacoEnvironment()
    import('monaco-editor').then((monaco) => {
      if (disposed || !hostRef.current) return
      monacoRef.current = monaco
      const monacoTheme = defineMonacoThemeFor(monaco, themeRef.current)
      const editor = monaco.editor.create(hostRef.current, {
        value: contentRef.current,
        language: languageRef.current,
        readOnly: readOnlyRef.current,
        theme: monacoTheme,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 13,
      })
      // Emit edits back to the owner (edit mode). Reading via getValue keeps the
      // editor uncontrolled, so the parent's echo of the same draft never resets
      // the cursor (the setValue effect below is guarded on inequality).
      editor.onDidChangeModelContent(() => {
        onChangeRef.current?.(editor.getValue())
      })
      editorRef.current = editor
    }).catch(() => {
      // Stale chunk after a deploy / network blip / worker failure: surface an
      // error + reload affordance instead of a permanently blank pane plus an
      // unhandled promise rejection.
      if (!disposed) setLoadError(true)
    })
    return () => {
      disposed = true
      const editor = editorRef.current as { dispose?: () => void } | null
      editor?.dispose?.()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const editor = editorRef.current as { setValue?: (v: string) => void; getValue?: () => string } | null
    // Only overwrite when the incoming content genuinely differs (a fresh file
    // load), NOT when it is the editor echoing the user's own keystrokes back.
    if (editor && editor.getValue?.() !== content) editor.setValue?.(content)
  }, [content])

  useEffect(() => {
    const editor = editorRef.current as { updateOptions?: (o: { readOnly: boolean }) => void } | null
    editor?.updateOptions?.({ readOnly })
  }, [readOnly])

  useEffect(() => {
    const monaco = monacoRef.current
    const editor = editorRef.current as { getModel?: () => unknown } | null
    if (!monaco || !editor) return
    const model = editor.getModel?.() as { uri?: unknown } | null
    if (model) monaco.editor.setModelLanguage(model as never, language)
  }, [language])

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    const monacoTheme = defineMonacoThemeFor(monaco, theme)
    monaco.editor.setTheme(monacoTheme)
  }, [theme])

  if (loadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground" data-testid="monaco-load-error">
        <span>{t('monaco.loadFailed')}</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-accent-primary/15 px-3 py-1 text-xs text-accent-primary hover:bg-accent-primary/25"
        >
          {t('monaco.reload')}
        </button>
      </div>
    )
  }
  return <div ref={hostRef} className="w-full h-full" data-testid="monaco-host" />
}

const LazyInner = lazy(async () => ({ default: InnerEditor }))

export interface CodeViewerMonacoProps {
  content: string
  language: string
  /** Read-only by default; pass false to enable in-app editing. */
  readOnly?: boolean
  /** Called with the full editor value on every edit (edit mode only). */
  onChange?: (value: string) => void
}

export function CodeViewerMonaco({ content, language, readOnly = true, onChange }: CodeViewerMonacoProps) {
  const { t } = useTranslation('code')
  return (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground animate-pulse">
          {t('monaco.loadingEditor')}
        </div>
      }
    >
      <LazyInner content={content} language={language} readOnly={readOnly} onChange={onChange} />
    </Suspense>
  )
}

export default CodeViewerMonaco
