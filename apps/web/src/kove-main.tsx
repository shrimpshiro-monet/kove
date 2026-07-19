import { createRoot } from 'react-dom/client'
import { useRouterStore } from './stores/router-store'
import { KoveApp } from './components/KoveApp'
import { SimpleEditorPage } from './components/editor/simple-editor/SimpleEditorPage'
import { VibeEditor } from './components/editor/VibeEditor'

function Root() {
  const route = useRouterStore((s) => s.route)

  switch (route) {
    case "/simple-editor":
      return <SimpleEditorPage />
    case "/editor":
      return <VibeEditor />
    default:
      return <KoveApp />
  }
}

createRoot(document.getElementById('root')!).render(<Root />)
