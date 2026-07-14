import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { EVENTO_SESSAO_EXPIRADA } from '../lib/nuvem'

export type Papel = 'admin' | 'orcamento' | 'consulta'
export interface UsuarioLogado {
  id: string
  usuario: string
  papel: Papel
}

interface AuthValue {
  usuario: UsuarioLogado | null
  precisaSetup: boolean
  carregando: boolean
  entrar: (usuario: string, senha: string) => Promise<void>
  configurarAdmin: (usuario: string, senha: string) => Promise<void>
  sair: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

async function lerErro(resp: Response): Promise<string> {
  try {
    const d = await resp.json()
    return d?.erro || `Erro ${resp.status}`
  } catch {
    return `Erro ${resp.status}`
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null)
  const [precisaSetup, setPrecisaSetup] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async () => {
    try {
      const resp = await fetch('/api/sessao', { headers: { accept: 'application/json' } })
      if (!resp.ok) throw new Error(await lerErro(resp))
      const d = await resp.json()
      // Revogação real chega como 200 {usuario:null} e é tratada aqui.
      setUsuario(d.usuario ?? null)
      setPrecisaSetup(!!d.precisaSetup)
    } catch {
      // Erro de transporte (rede/dev sem função): NÃO desloga uma sessão ativa
      // por blip; no load inicial o usuário já é null, então cai no login.
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  // Revogação imediata:
  // - 401 numa chamada de dados → volta ao login.
  // - ao focar a aba → revalida (mudança de papel/exclusão reflete sem polling).
  useEffect(() => {
    const aoExpirar = () => {
      setUsuario(null)
      recarregar()
    }
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
    window.addEventListener('focus', recarregar)
    return () => {
      window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
      window.removeEventListener('focus', recarregar)
    }
  }, [recarregar])

  const postSessao = useCallback(async (corpo: object) => {
    const resp = await fetch('/api/sessao', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    if (!resp.ok) throw new Error(await lerErro(resp))
    const d = await resp.json()
    setUsuario(d.usuario ?? null)
    setPrecisaSetup(false)
  }, [])

  const entrar = useCallback(
    (u: string, s: string) => postSessao({ usuario: u, senha: s }),
    [postSessao],
  )
  const configurarAdmin = useCallback(
    (u: string, s: string) => postSessao({ acao: 'setup', usuario: u, senha: s }),
    [postSessao],
  )

  const sair = useCallback(async () => {
    try {
      await fetch('/api/sessao', { method: 'DELETE' })
    } finally {
      setUsuario(null)
      await recarregar()
    }
  }, [recarregar])

  return (
    <AuthContext.Provider
      value={{ usuario, precisaSetup, carregando, entrar, configurarAdmin, sair }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
