// Painel de sincronização do DRE por competência com a Enoki (item 1.6 do ROADMAP.md).
//
// Mostra o estado da última carga, dispara a sincronização (com barra de
// progresso, porque a carga histórica leva vários passos) e expõe o diagnóstico:
// o que foi descartado e quais centros de custo ficaram sem regra determinística.
// Esse diagnóstico é deliberadamente VISÍVEL — número que some sem explicação é
// o que faz um sócio perder a confiança no relatório.
import { useState } from 'react'
import { useDre } from '../context/DreContext'
import { Botao, Card, Kicker } from '../components/ui'
import { formatBRL } from '../lib/format'
import { nomeConta } from '../lib/planoContas'
import { LIMIAR_REVISAO, type RegraEnoki } from '../lib/tipos'
import type { ProgressoSync } from '../lib/enokiSync'

const ROTULO_DESCARTE: Record<string, string> = {
  receita_vem_da_nf: 'Título de receita (a receita vem da nota fiscal)',
  nf_intragrupo: 'Venda entre empresas do grupo (eliminada)',
  nf_remessa: 'Remessa/retorno de armazém — não é venda',
  nf_transferencia: 'Transferência entre estabelecimentos',
  nf_outra_operacao: 'Outra operação fiscal (fora do DRE)',
  nf_cancelada: 'Nota cancelada',
  nf_ajuste_fiscal: 'Item de ajuste de ICMS',
  patrimonial_ou_intragrupo: 'Conta patrimonial ou rateio do grupo',
  data_invalida: 'Sem data válida',
  valor_zero: 'Valor zero',
}

function dataHora(iso: string): string {
  if (!iso) return ''
  const [data, resto] = iso.split('T')
  const [a, m, d] = data.split('-')
  return `${d}/${m}/${a} ${(resto ?? '').slice(0, 5)}`
}

export function SincronizarEnoki() {
  const { estado, sincronizarEnoki, salvarRegrasEnoki } = useDre()
  const [rodando, setRodando] = useState(false)
  const [classificando, setClassificando] = useState(false)
  const [progresso, setProgresso] = useState<ProgressoSync | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [detalhes, setDetalhes] = useState(false)

  const sync = estado.enokiSync
  const hoje = new Date().toISOString().slice(0, 10)
  const inicioAno = `${hoje.slice(0, 4)}-01-01`

  const rodar = async () => {
    setRodando(true)
    setErro(null)
    setAviso(null)
    setProgresso(null)
    try {
      const r = await sincronizarEnoki({
        de: inicioAno,
        ate: hoje,
        aoProgredir: (p) => setProgresso(p),
      })
      if (!r.configurado) {
        setErro(
          'A Enoki não está configurada neste ambiente. Faltam as variáveis ENOKI_BASE_URL, ENOKI_API_KEY e ENOKI_EMPRESAS.',
        )
      } else if (!r.completo) {
        setAviso(
          `${r.lancamentos} lançamento(s) importados, mas a carga não terminou. Clique de novo para continuar de onde parou.`,
        )
      } else {
        setAviso(`${r.lancamentos} lançamento(s) importados da Enoki (${inicioAno} a ${hoje}).`)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setRodando(false)
      setProgresso(null)
    }
  }

  // Manda o resíduo para a IA, grava as regras e RE-SINCRONIZA na sequência —
  // as regras só entram no DRE quando os títulos são normalizados de novo.
  const classificar = async () => {
    const pendencias = sync?.residuos ?? []
    if (!pendencias.length) return
    setClassificando(true)
    setErro(null)
    setAviso(null)
    try {
      const resp = await fetch('/api/classificar-enoki', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pendencias }),
      })
      const d = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(d?.erro || `Erro ${resp.status}`)

      const novas: RegraEnoki[] = (d.regras ?? []).map((r: any) => ({
        chave: String(r.chave),
        conta: String(r.conta),
        confianca: Number(r.confianca) || 0,
        justificativa: String(r.justificativa ?? ''),
        origem: 'ia' as const,
      }))
      if (!novas.length) {
        setAviso('A IA não conseguiu classificar nenhuma pendência.')
        return
      }
      salvarRegrasEnoki(novas)

      const mescladas = [...(estado.regrasEnoki ?? [])]
      for (const n of novas) {
        const i = mescladas.findIndex((x) => x.chave === n.chave)
        if (i >= 0 && mescladas[i].origem === 'manual') continue
        if (i >= 0) mescladas[i] = n
        else mescladas.push(n)
      }
      const r = await sincronizarEnoki({ de: inicioAno, ate: hoje, regras: mescladas, aoProgredir: setProgresso })
      const revisar = novas.filter((n) => n.confianca < LIMIAR_REVISAO).length
      setAviso(
        `${novas.length} parceiro(s) classificado(s) e reaplicados: ${r.lancamentos} lançamentos, ${r.residuos} pendência(s) restante(s).` +
          (revisar ? ` ⚠ ${revisar} com confiança baixa — confira abaixo.` : ''),
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setClassificando(false)
      setProgresso(null)
    }
  }

  const residuoTotal = (sync?.residuos ?? []).reduce((s, r) => s + r.valor, 0)
  const regras = estado.regrasEnoki ?? []
  const aRevisar = regras.filter((r) => r.origem === 'ia' && r.confianca < LIMIAR_REVISAO)

  return (
    <Card className="animate-rise">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Kicker>DRE automático</Kicker>
          <h2 className="mt-1 text-lg font-bold text-ink">Sincronizar com a Enoki</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Monta o DRE por <strong className="text-ink">competência</strong> a partir das notas
            fiscais de saída e dos títulos financeiros — data do fato gerador, não a do pagamento.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!!sync?.residuos.length && (
            <Botao variante="fantasma" onClick={classificar} disabled={rodando || classificando}>
              {classificando
                ? 'Classificando…'
                : `✨ Classificar ${sync.residuos.length} pendência(s)`}
            </Botao>
          )}
          <Botao onClick={rodar} disabled={rodando || classificando}>
            {rodando ? 'Sincronizando…' : '↻ Sincronizar Enoki'}
          </Botao>
        </div>
      </div>

      {(rodando || classificando) && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-green transition-all duration-300"
              style={{ width: `${progresso?.progresso ?? 3}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted tabular-nums">
            {progresso
              ? `${progresso.progresso}% · ${progresso.tarefasFeitas}/${progresso.tarefas} consultas · ${progresso.registros} registros`
              : 'Conectando…'}
          </p>
        </div>
      )}

      {erro && (
        <div className="mt-4 rounded-lg border border-danger/40 bg-danger/5 p-3">
          <p className="text-sm text-danger">{erro}</p>
        </div>
      )}
      {aviso && (
        <div className="mt-4 rounded-lg border border-green/40 bg-green/5 p-3">
          <p className="text-sm text-green-deep">{aviso}</p>
        </div>
      )}

      {sync && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2 font-semibold text-green-deep">
              <span className="h-2 w-2 rounded-full bg-green" />
              {sync.lancamentos.toLocaleString('pt-BR')} lançamentos
            </span>
            <span className="text-muted">
              {sync.de} a {sync.ate}
            </span>
            <span className="text-muted">atualizado {dataHora(sync.atualizadoEm)}</span>
            {sync.homologacao && (
              <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-xs font-semibold text-gold-deep">
                homologação
              </span>
            )}
            {!sync.completo && (
              <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-xs font-semibold text-gold-deep">
                carga incompleta
              </span>
            )}
          </div>

          {!!sync.residuos.length && (
            <p className="mt-3 text-sm text-muted">
              <strong className="text-ink">{formatBRL(residuoTotal)}</strong> em títulos sem centro
              de custo definido ainda não entraram no DRE — é a fila da classificação por IA.
            </p>
          )}

          {!!regras.length && (
            <p className="mt-2 text-sm text-muted">
              <strong className="text-ink">{regras.length}</strong> regra(s) aprendida(s) para
              parceiros sem centro de custo
              {aRevisar.length ? (
                <span className="text-gold-deep">
                  {' '}
                  · {aRevisar.length} com confiança baixa, revisar
                </span>
              ) : null}
              .
            </p>
          )}

          <button
            className="mt-3 text-xs font-semibold text-green underline-offset-2 hover:underline"
            onClick={() => setDetalhes((v) => !v)}
          >
            {detalhes ? 'Ocultar diagnóstico' : 'Ver diagnóstico da carga'}
          </button>

          {detalhes && (
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                  O que não virou lançamento
                </p>
                <ul className="space-y-1 text-xs text-muted">
                  {sync.descartes.map((d) => (
                    <li key={d.motivo} className="flex justify-between gap-3">
                      <span>{ROTULO_DESCARTE[d.motivo] ?? d.motivo}</span>
                      <span className="whitespace-nowrap tabular-nums">
                        {d.quantidade.toLocaleString('pt-BR')} · {formatBRL(d.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                  Sem regra determinística (fila da IA)
                </p>
                {sync.residuos.length ? (
                  <ul className="space-y-1 text-xs text-muted">
                    {sync.residuos.map((r) => (
                      <li key={`${r.chave}|${r.fluxo}`} className="flex justify-between gap-3">
                        <span>
                          {r.chave}{' '}
                          <span className="text-faint">
                            ({r.fluxo === 'saida' ? 'pagamento' : 'recebimento'}
                            {r.centroCusto && r.centroCusto !== 'SEM CC' ? ` · ${r.centroCusto}` : ''})
                          </span>
                        </span>
                        <span className="whitespace-nowrap tabular-nums">
                          {r.quantidade.toLocaleString('pt-BR')} · {formatBRL(r.valor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">Nenhum — todo centro de custo foi reconhecido.</p>
                )}
              </div>
              {!!regras.length && (
                <div className="md:col-span-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                    Regras aprendidas (parceiro → conta)
                  </p>
                  <ul className="space-y-1 text-xs text-muted">
                    {regras.map((r) => (
                      <li key={r.chave} className="flex flex-wrap justify-between gap-x-3">
                        <span>
                          {r.chave} → <span className="font-mono">{r.conta}</span>{' '}
                          {nomeConta(r.conta)}
                        </span>
                        <span
                          className={
                            r.confianca < LIMIAR_REVISAO ? 'text-gold-deep' : 'text-faint'
                          }
                        >
                          {r.origem === 'manual' ? 'confirmada' : `IA ${Math.round(r.confianca * 100)}%`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
