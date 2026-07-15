import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { useAuth } from '../context/AuthContext'
import { podeAdministrar } from '../lib/permissoes'
import { Botao, Card, Kicker } from '../components/ui'
import { formatBRL } from '../lib/format'
import { mapaDeClassificacoes } from '../lib/dre'
import { META_LINHAS, LIMIAR_REVISAO, type LancamentoCanonico } from '../lib/tipos'

export function LancamentosPage() {
  const { estado, mesclarLancamentos, salvarClassificacoes } = useDre()
  const { usuario } = useAuth()
  const admin = podeAdministrar(usuario?.papel)
  const [sincronizando, setSincronizando] = useState(false)
  const [classificando, setClassificando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const mapa = useMemo(() => mapaDeClassificacoes(estado.classificacoes), [estado.classificacoes])
  const classificacaoPorConta = useMemo(
    () => Object.fromEntries(estado.classificacoes.map((c) => [c.contaSafragold, c])),
    [estado.classificacoes],
  )

  const contasNaoClassificadas = useMemo(() => {
    const set = new Set<string>()
    for (const l of estado.lancamentos) if (!mapa[l.contaSafragold]) set.add(l.contaSafragold)
    return [...set].sort()
  }, [estado.lancamentos, mapa])

  const sincronizar = async () => {
    setSincronizando(true)
    setErro(null)
    setAviso(null)
    try {
      const resp = await fetch('/api/safragold-sync', { headers: { accept: 'application/json' } })
      const d = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(d?.erro || `Erro ${resp.status}`)
      const lancamentos = (d.lancamentos ?? []) as LancamentoCanonico[]
      mesclarLancamentos(lancamentos)
      setAviso(
        `${lancamentos.length} lançamento(s) importados.${d.simulado ? ' (dados SIMULADOS — Safragold ainda não conectado)' : ''}`,
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSincronizando(false)
    }
  }

  const classificar = async () => {
    if (!contasNaoClassificadas.length) return
    setClassificando(true)
    setErro(null)
    setAviso(null)
    try {
      const amostras = contasNaoClassificadas.map((conta) => ({
        contaSafragold: conta,
        exemplos: estado.lancamentos
          .filter((l) => l.contaSafragold === conta)
          .slice(0, 3)
          .map((l) => l.historico),
      }))
      const resp = await fetch('/api/classificar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contas: amostras }),
      })
      const d = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(d?.erro || `Erro ${resp.status}`)
      salvarClassificacoes(d.classificacoes ?? [])
      setAviso(`${(d.classificacoes ?? []).length} conta(s) classificada(s).`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setClassificando(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <Kicker>Lançamentos conciliados</Kicker>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
            Fonte do <span className="text-green">DRE</span>
          </h1>
        </div>
        {admin && (
          <div className="flex gap-2">
            <Botao onClick={sincronizar} disabled={sincronizando}>
              {sincronizando ? 'Sincronizando…' : '↻ Sincronizar Safragold'}
            </Botao>
            {contasNaoClassificadas.length > 0 && (
              <Botao variante="fantasma" onClick={classificar} disabled={classificando}>
                {classificando
                  ? 'Classificando…'
                  : `✨ Classificar ${contasNaoClassificadas.length} conta(s)`}
              </Botao>
            )}
          </div>
        )}
      </div>

      {erro && (
        <Card className="mb-4 animate-rise border-danger/40 bg-danger/5">
          <p className="text-sm text-danger">{erro}</p>
        </Card>
      )}
      {aviso && (
        <Card className="mb-4 animate-rise border-green/40 bg-green/5">
          <p className="text-sm text-green-deep">{aviso}</p>
        </Card>
      )}

      {estado.lancamentos.length === 0 ? (
        <Card className="animate-rise">
          <p className="text-muted">
            {admin ? (
              <>
                Nenhum lançamento importado. Clique em{' '}
                <strong className="text-ink">Sincronizar Safragold</strong> para puxar os
                lançamentos conciliados.
              </>
            ) : (
              'Nenhum lançamento importado ainda. Um administrador precisa sincronizar o Safragold.'
            )}
          </p>
        </Card>
      ) : (
        <Card className="animate-rise overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="py-2.5 pl-5 pr-4 font-semibold">Data</th>
                  <th className="py-2.5 px-4 font-semibold">Conta</th>
                  <th className="py-2.5 px-4 font-semibold">Histórico</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Valor</th>
                  <th className="py-2.5 pr-5 pl-4 font-semibold">Linha do DRE</th>
                </tr>
              </thead>
              <tbody>
                {estado.lancamentos
                  .slice()
                  .sort((a, b) => b.data.localeCompare(a.data))
                  .map((l) => {
                    const c = classificacaoPorConta[l.contaSafragold]
                    return (
                      <tr key={l.id} className="border-b border-line/50 hover:bg-cream/50">
                        <td className="py-2 pl-5 pr-4 tabular-nums text-muted">{l.data}</td>
                        <td className="py-2 px-4 font-mono text-xs text-ink">{l.contaSafragold}</td>
                        <td className="py-2 px-4 text-muted">{l.historico}</td>
                        <td className="py-2 px-4 text-right tabular-nums text-ink">
                          {formatBRL(l.valor)}
                        </td>
                        <td className="py-2 pr-5 pl-4">
                          {c ? (
                            <span
                              className={
                                c.confianca < LIMIAR_REVISAO
                                  ? 'font-medium text-gold-deep'
                                  : 'text-muted'
                              }
                              title={c.justificativa}
                            >
                              {META_LINHAS[c.linha].rotulo}
                              {c.confianca < LIMIAR_REVISAO && ' ⚠ revisar'}
                            </span>
                          ) : (
                            <span className="text-faint">não classificada</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
