import { useCallback, useEffect, useState } from 'react'
import { useAuth, type Papel } from '../context/AuthContext'
import { Botao, Card, Kicker, Select } from '../components/ui'

interface UsuarioAdmin {
  id: string
  usuario: string
  papel: Papel
  criadoEm: string
}

const inputClass =
  'w-full rounded-lg border border-cyan/20 bg-navy-2 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan/60'

const rotuloPapel: Record<Papel, string> = { admin: 'Administrador', comercial: 'Comercial' }

async function lerErro(resp: Response): Promise<string> {
  try {
    return (await resp.json())?.erro || `Erro ${resp.status}`
  } catch {
    return `Erro ${resp.status}`
  }
}

export function Usuarios() {
  const { usuario: eu } = useAuth()
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const [novoUsuario, setNovoUsuario] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novoPapel, setNovoPapel] = useState<Papel>('comercial')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const resp = await fetch('/api/usuarios', { headers: { accept: 'application/json' } })
      if (!resp.ok) throw new Error(await lerErro(resp))
      setUsuarios((await resp.json()).usuarios ?? [])
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const acao = async (metodo: string, corpo: object) => {
    setErro(null)
    try {
      const resp = await fetch('/api/usuarios', {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      if (!resp.ok) throw new Error(await lerErro(resp))
      await carregar()
      return true
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  const criar = async () => {
    const ok = await acao('POST', { usuario: novoUsuario, senha: novaSenha, papel: novoPapel })
    if (ok) {
      setNovoUsuario('')
      setNovaSenha('')
      setNovoPapel('comercial')
    }
  }

  const trocarSenha = async (u: UsuarioAdmin) => {
    const senha = prompt(`Nova senha para "${u.usuario}" (mín. 6 caracteres):`)
    if (senha == null) return
    await acao('PUT', { id: u.id, senha })
  }

  const excluir = async (u: UsuarioAdmin) => {
    if (confirm(`Excluir o usuário "${u.usuario}"?`)) await acao('DELETE', { id: u.id })
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Kicker>Usuários</Kicker>
        <h1 className="mt-1 text-3xl font-extrabold">
          Controle de <span className="text-cyan">acessos.</span>
        </h1>
      </div>

      {erro && (
        <Card className="mb-4 border-danger/40">
          <p className="text-sm text-danger">{erro}</p>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-white">Adicionar usuário</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_180px_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slateblue">Usuário</span>
            <input
              className={inputClass}
              value={novoUsuario}
              autoComplete="off"
              onChange={(e) => setNovoUsuario(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slateblue">Senha</span>
            <input
              type="password"
              className={inputClass}
              value={novaSenha}
              autoComplete="new-password"
              onChange={(e) => setNovaSenha(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slateblue">Papel</span>
            <Select
              value={novoPapel}
              onChange={(v) => setNovoPapel(v as Papel)}
              options={[
                { value: 'comercial', label: 'Comercial' },
                { value: 'admin', label: 'Administrador' },
              ]}
            />
          </label>
          <Botao onClick={criar} disabled={!novoUsuario || novaSenha.length < 6}>
            + Adicionar
          </Botao>
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Comercial cria e edita propostas, mas não acessa Configurações nem esta tela.
        </p>
      </Card>

      {carregando ? (
        <p className="text-slateblue">Carregando…</p>
      ) : (
        <div className="grid gap-3">
          {usuarios.map((u) => (
            <Card key={u.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-base font-bold text-white">
                  {u.usuario}
                  {u.id === eu?.id && <span className="ml-2 text-xs text-faint">(você)</span>}
                </div>
                <div className="text-xs text-slateblue">{rotuloPapel[u.papel]}</div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={u.papel}
                  onChange={(v) => acao('PUT', { id: u.id, papel: v })}
                  options={[
                    { value: 'comercial', label: 'Comercial' },
                    { value: 'admin', label: 'Administrador' },
                  ]}
                />
                <Botao variante="fantasma" onClick={() => trocarSenha(u)}>
                  Trocar senha
                </Botao>
                {u.id !== eu?.id && (
                  <Botao variante="perigo" onClick={() => excluir(u)}>
                    Excluir
                  </Botao>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
