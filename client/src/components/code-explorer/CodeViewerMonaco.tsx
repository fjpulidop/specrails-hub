import { lazy, Suspense, useEffect, useRef } from 'react'
import { useActiveTheme } from '../../context/ThemeContext'
import { ensureMonacoEnvironment, defineMonacoThemeFor } from '../../lib/monaco-setup'

interface InnerProps {
  content: string
  language: string
}

function InnerEditor({ content, language }: InnerProps) {
  const theme = useActiveTheme()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<unknown>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)

  useEffect(() => {
    let disposed = false
    ensureMonacoEnvironment()
    import('monaco-editor').then((monaco) => {
      if (disposed || !hostRef.current) return
      monacoRef.current = monaco
      const monacoTheme = defineMonacoThemeFor(monaco, theme)
      const editor = monaco.editor.create(hostRef.current, {
        value: content,
        language,
        readOnly: true,
        theme: monacoTheme,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 13,
      })
      editorRef.current = editor
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
    const editor = editorRef.current as { setValue?: (v: string) => void } | null
    editor?.setValue?.(content)
  }, [content])

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

  return <div ref={hostRef} className="w-full h-full" data-testid="monaco-host" />
}

const LazyInner = lazy(async () => ({ default: InnerEditor }))

export interface CodeViewerMonacoProps {
  content: string
  language: string
}

export function CodeViewerMonaco({ content, language }: CodeViewerMonacoProps) {
  return (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground animate-pulse">
          Loading editor…
        </div>
      }
    >
      <LazyInner content={content} language={language} />
    </Suspense>
  )
}

export default CodeViewerMonaco
