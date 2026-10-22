import { useAuthContext } from './auth/AuthContext'
import { useApplyAppearance } from './preferences/appearance'
import { SignInScreen } from './components/auth/SignInScreen'
import { Spinner } from './components/ui/Button'
import { Workspace } from './components/workspace/Workspace'

export function App() {
  useApplyAppearance()
  const { state } = useAuthContext()
  if (state.status === 'restoring') {
    return (
      <div className="flex h-full items-center justify-center text-ink-2">
        <Spinner label="Restoring your session…" />
      </div>
    )
  }
  if (state.status === 'signed-out') return <SignInScreen notice={state.notice} />
  return <Workspace key={state.auth.did} />
}
