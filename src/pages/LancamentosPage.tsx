import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { useAuth } from '../context/AuthContext'
import { podeAdministrar } from '../lib/permissoes'
import { Botao, Card, Kicker } from '../components/ui'
import { ImportarDreModal } from '../components/ImportarDreModal'
import { SincronizarEnoki } from '../components/SincronizarEnoki'
import { LancamentosManuaisModal } from '../components/LancamentosManuaisModal'
import { SeletorFonteDre } from '../components/SeletorFonteDre'
import { formatBRL } from '../lib/format'
import { mapaEfetivo, nomeConta } from '../lib/planoContas'
import { META_LINHAS, LIMIAR_REVISAO, origemDe, ROTULO_ORIGEM } from '../lib/tipos'

export function LancamentosPage() {
  const { estado, salvarClassificacoes, lancamentos } = useDre()
  const { usuario } = useAuth()
  const admin = podeAdministrar(usuario?.papel)
  const [classificando, setClassificando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [lancandoManual, setLancandoManual] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const mapa = useMemo(() => mapaEfetivo(estado.classificacoes), [estado.classificacoes])
  const classificacaoPorConta = useMemo(
    () => Object.fromEntries(estado.classificacoes.map((c) => [c.contaSafragold, c])),
    [estado.classificacoes],
  )

  const contasNaoClassificadas = useMemo(() => {
    const set = new Set<string>()
    for (const l of lancamentos) if (!mapa[l.contaSafragold]) set.add(l.contaSafragold)
    return [...set].sort()
  }, [lancamentos, mapa])

  const classificar = async () => {
    if (!contasNaoClassificadas.length) return
    setClassificando(true)
    setErro(null)
    setAviso(null)
    try {
      const amostras = contasNaoClassificadas.map((conta) => ({
        contaSafragold: conta,
        exemplos: lancamentos
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
        <div className="flex flex-wrap items-end gap-3">
          <SeletorFonteDre />
          {admin && (
            <div className="flex flex-wrap gap-2">
              <Botao variante="fantasma" onClick={() => setImportando(true)}>
                ⬆ Importar planilha
              </Botao>
              <Botao variante="fantasma" onClick={() => setLancandoManual(true)}>
                ⊞ Lançar estrutura
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
      </div>

      {admin && (
        <div className="mb-6">
          <SincronizarEnoki />
        </div>
      )}

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

      {lancamentos.length === 0 ? (
        <Card className="animate-rise">
          <p className="text-muted">
            {admin
              ? 'Nenhum lançamento nesta fonte ainda. Use o painel acima para carregar os dados da Enoki.'
              : 'Nenhum lançamento ainda. Um administrador precisa carregar os dados da Enoki.'}
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
                  <th className="py-2.5 px-4 font-semibold">Linha do DRE</th>
                  <th className="py-2.5 pr-5 pl-4 font-semibold">Origem</th>
                </tr>
              </thead>
              <tbody>
                {lancamentos
                  .slice()
                  .sort((a, b) => b.data.localeCompare(a.data))
                  .map((l) => {
                    const c = classificacaoPorConta[l.contaSafragold]
                    const linha = mapa[l.contaSafragold]
                    const baixa = c && c.confianca < LIMIAR_REVISAO
                    const nome = nomeConta(l.contaSafragold)
                    return (
                      <tr key={l.id} className="border-b border-line/50 hover:bg-cream/50">
                        <td className="py-2 pl-5 pr-4 tabular-nums text-muted">{l.data}</td>
                        <td className="py-2 px-4">
                          <div className="font-mono text-xs text-ink">{l.contaSafragold}</div>
                          {nome && <div className="text-[11px] text-faint">{nome}</div>}
                        </td>
                        <td className="py-2 px-4 text-muted">{l.historico}</td>
                        <td className="py-2 px-4 text-right tabular-nums text-ink">
                          {formatBRL(l.valor)}
                        </td>
                        <td className="py-2 px-4">
                          {linha ? (
                            <span
                              className={baixa ? 'font-medium text-gold-deep' : 'text-muted'}
                              title={c?.justificativa}
                            >
                              {META_LINHAS[linha].rotulo}
                              {baixa && ' ⚠ revisar'}
                            </span>
                          ) : (
                            <span className="text-faint">não classificada</span>
                          )}
                        </td>
                        <td className="py-2 pr-5 pl-4">
                          <span
                            className={
                              origemDe(l) === 'enoki'
                                ? 'rounded-full border border-green/30 bg-green/10 px-2 py-0.5 text-[11px] font-semibold text-green-deep'
                                : 'rounded-full border border-line bg-cream px-2 py-0.5 text-[11px] font-semibold text-muted'
                            }
                          >
                            {ROTULO_ORIGEM[origemDe(l)]}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {admin && importando && <ImportarDreModal onClose={() => setImportando(false)} />}
      {admin && lancandoManual && (
        <LancamentosManuaisModal aoFechar={() => setLancandoManual(false)} />
      )}
    </div>
  )
}
