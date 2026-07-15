import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Card, Kicker } from '../components/ui'
import { LogoLockup } from '../components/Logo'

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-green focus:ring-2 focus:ring-green/20'

export function Login() {
  const { precisaSetup, entrar, configurarAdmin } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      if (precisaSetup) await configurarAdmin(usuario, senha)
      else await entrar(usuario, senha)
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm animate-rise">
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <LogoLockup width={200} />
          <div>
            <Kicker>{precisaSetup ? 'Configuração inicial' : 'GPResults'}</Kicker>
            <h1 className="mt-1 font-head text-2xl font-bold text-ink">
              {precisaSetup ? (
                <>
                  Crie o <span className="text-green">administrador</span>
                </>
              ) : (
                <>
                  Entrar no <span className="text-green">app</span>
                </>
              )}
            </h1>
          </div>
          {precisaSetup && (
            <p className="text-xs text-muted">
              Nenhum usuário existe ainda. Esta primeira conta será o administrador.
            </p>
          )}
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Usuário</span>
            <input
              className={inputClass}
              value={usuario}
              autoFocus
              autoComplete="username"
              onChange={(e) => setUsuario(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Senha</span>
            <input
              type="password"
              className={inputClass}
              value={senha}
              autoComplete={precisaSetup ? 'new-password' : 'current-password'}
              onChange={(e) => setSenha(e.target.value)}
            />
            {precisaSetup && (
              <span className="mt-1 block text-[11px] text-faint">Mínimo de 6 caracteres.</span>
            )}
          </label>

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <button
            type="submit"
            disabled={enviando || !usuario || !senha}
            className="mt-1 rounded-lg bg-green px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-deep hover:shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : precisaSetup ? 'Criar administrador' : 'Entrar'}
          </button>
        </form>
      </Card>
    </div>
  )
}
