import { useMemo, useState, useEffect, useRef } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useDre } from '../context/DreContext'
import { Card, Kicker, Select } from '../components/ui'
import { formatBRL, formatBRLCompact, formatPct, formatDataBR } from '../lib/format'
import {
  montarDre,
  competenciasDisponiveis,
  projecaoFechamento,
  type DreMensal,
} from '../lib/dre'
import { mapaEfetivo } from '../lib/planoContas'
import { orcamentoAprovado } from '../lib/tipos'
import { serieMargemContribuicao } from '../lib/margemContribuicao'
import { PainelMargemContribuicao } from '../components/PainelMargemContribuicao'

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function diasNoMesComp(comp: string): number {
  const [y, m] = comp.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

const CORES = { verde: '#0f7a49', verdeClaro: '#3fa06e', dourado: '#cd8d05', tinta: '#23281f' }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloCompetencia(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`
}
function margem(parte: number, base: number): number | null {
  return base > 0 ? (parte / base) * 100 : null
}

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #ece1c8',
  fontSize: 12,
  padding: '8px 12px',
  boxShadow: '0 12px 32px -12px rgba(35,40,31,0.28)',
}

export function DashboardPage() {
  const { estado } = useDre()
  const competencias = useMemo(
    () => competenciasDisponiveis(estado.lancamentos),
    [estado.lancamentos],
  )
  const [comp, setComp] = useState<string>(() => competencias[0] ?? new Date().toISOString().slice(0, 7))
  const competencia = competencias.includes(comp) ? comp : (competencias[0] ?? comp)

  const mapa = useMemo(() => mapaEfetivo(estado.classificacoes), [estado.classificacoes])
  const orcamentoAtual = estado.orcamentos.find((o) => o.competencia === competencia) ?? null
  const temOrcamento = !!orcamentoAtual
  const orcPendente = !!orcamentoAtual && !orcamentoAprovado(orcamentoAtual)

  // DRE parcial até hoje quando o mês selecionado é o corrente.
  const hoje = hojeISO()
  const ehMesCorrente = competencia === hoje.slice(0, 7)
  const ateData = ehMesCorrente ? hoje : undefined

  const dre = useMemo(
    () => montarDre(competencia, estado.lancamentos, mapa, orcamentoAtual, ateData),
    [competencia, estado.lancamentos, mapa, orcamentoAtual, ateData],
  )

  const serie = useMemo(
    () =>
      [...competencias].reverse().map((c) => {
        const orc = estado.orcamentos.find((o) => o.competencia === c) ?? null
        const d = montarDre(c, estado.lancamentos, mapa, orc)
        return {
          rotulo: rotuloCompetencia(c),
          receitaLiquida: d.realizado.receitaLiquida,
          resultadoLiquido: d.realizado.resultadoLiquido,
        }
      }),
    [competencias, estado.lancamentos, estado.orcamentos, mapa],
  )

  const serieMC = useMemo(
    () => serieMargemContribuicao(competencias, estado.lancamentos, mapa, estado.mcIncluirComerciais ?? false),
    [competencias, estado.lancamentos, mapa, estado.mcIncluirComerciais],
  )

  const comparativo = [
    { nome: 'Receita líq.', realizado: dre.realizado.receitaLiquida, orcado: dre.orcado.receitaLiquida },
    { nome: 'Lucro bruto', realizado: dre.realizado.lucroBruto, orcado: dre.orcado.lucroBruto },
    { nome: 'EBITDA', realizado: dre.realizado.ebitda, orcado: dre.orcado.ebitda },
    { nome: 'Result. líq.', realizado: dre.realizado.resultadoLiquido, orcado: dre.orcado.resultadoLiquido },
  ]

  const desvios = useMemo(
    () =>
      dre.linhas
        .filter((l) => l.orcado !== 0 || l.realizado !== 0)
        .map((l) => ({
          rotulo: l.rotulo,
          sinal: l.sinal,
          desvio: l.realizado - l.orcado,
          pct: l.orcado !== 0 ? ((l.realizado - l.orcado) / l.orcado) * 100 : null,
        }))
        .filter((d) => Math.abs(d.desvio) >= 0.005)
        .sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio))
        .slice(0, 5),
    [dre],
  )

  if (estado.lancamentos.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-8">
        <Cabecalho competencias={[]} competencia={competencia} setComp={setComp} />
        <Card className="animate-rise">
          <p className="text-muted">
            Ainda não há dados. Vá em <strong className="text-ink">Lançamentos</strong> e sincronize
            o Safragold para o dashboard ganhar vida.
          </p>
        </Card>
      </div>
    )
  }

  const rl = dre.realizado.resultadoLiquido
  const mLiquida = margem(rl, dre.realizado.receitaLiquida)
  const desvioRl = rl - dre.orcado.resultadoLiquido

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <Cabecalho competencias={competencias} competencia={competencia} setComp={setComp} />

      {/* HERO — Resultado líquido */}
      <div className="mb-4 animate-rise overflow-hidden rounded-2xl border border-green/20 bg-gradient-to-br from-green/[0.07] via-surface to-surface shadow-[0_1px_2px_rgba(35,40,31,0.04),0_16px_40px_-24px_rgba(15,122,73,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-6 p-6">
          <div>
            <div className="font-head text-xs font-semibold uppercase tracking-[0.22em] text-green">
              Resultado líquido · {rotuloCompetencia(competencia)}
              {ehMesCorrente && (
                <span className="ml-2 normal-case tracking-normal text-faint">
                  (até {formatDataBR(hoje)})
                </span>
              )}
            </div>
            <div className="mt-1 font-head text-5xl font-bold tracking-tight text-green">
              {formatBRL(rl)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {mLiquida != null && (
                <span className="text-muted">
                  Margem líquida <strong className="text-ink">{formatPct(mLiquida)}</strong>
                </span>
              )}
              {temOrcamento && dre.orcado.resultadoLiquido !== 0 && (
                <span className={desvioRl >= 0 ? 'text-green' : 'text-danger'}>
                  {desvioRl >= 0 ? '▲' : '▼'} {formatBRL(Math.abs(desvioRl))} vs. orçado
                </span>
              )}
            </div>
          </div>
          {serie.length >= 2 && (
            <div className="h-20 w-full max-w-[280px] flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serie} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sparkResult" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CORES.verde} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CORES.verde} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} labelFormatter={() => 'Resultado líquido'} contentStyle={tooltipStyle} />
                  <Area
                    dataKey="resultadoLiquido"
                    stroke={CORES.verde}
                    strokeWidth={2.5}
                    fill="url(#sparkResult)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* KPIs secundários */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi i={0} rotulo="Receita líquida" valor={dre.realizado.receitaLiquida} orcado={dre.orcado.receitaLiquida} temOrcamento={temOrcamento} />
        <Kpi i={1} rotulo="Lucro bruto" valor={dre.realizado.lucroBruto} orcado={dre.orcado.lucroBruto} margemBase={dre.realizado.receitaLiquida} temOrcamento={temOrcamento} />
        <Kpi i={2} rotulo="EBITDA" valor={dre.realizado.ebitda} orcado={dre.orcado.ebitda} margemBase={dre.realizado.receitaLiquida} temOrcamento={temOrcamento} />
      </div>

      <div className="mb-5">
        <PainelMargemContribuicao serie={serieMC} competencia={competencia} />
      </div>

      {dre.naoClassificado > 0 && (
        <Card className="mb-4 animate-rise border-warn/40 bg-warn/5">
          <p className="text-sm text-gold-deep">
            <strong>{formatBRL(dre.naoClassificado)}</strong> em {dre.naoClassificadas.length}{' '}
            conta(s) sem classificação — ainda fora do DRE. Resolva em <strong>Lançamentos</strong>.
          </p>
        </Card>
      )}

      {orcPendente && (
        <Card className="mb-4 animate-rise border-warn/40 bg-warn/5">
          <p className="text-sm text-gold-deep">
            ⏳ O orçamento de <strong>{rotuloCompetencia(competencia)}</strong> está{' '}
            <strong>pendente de aprovação do sócio</strong> — exibido como prévia até ser aprovado.
          </p>
        </Card>
      )}

      {temOrcamento && (
        <InsightsIA
          dre={dre}
          competencia={competencia}
          diaAtual={ehMesCorrente ? Number(hoje.slice(8, 10)) : diasNoMesComp(competencia)}
          diasNoMes={diasNoMesComp(competencia)}
          ehMesCorrente={ehMesCorrente}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="animate-rise">
          <h2 className="mb-4 font-head text-sm font-semibold uppercase tracking-wider text-muted">
            Evolução — receita e resultado
          </h2>
          {serie.length < 2 ? (
            <p className="py-10 text-center text-sm text-faint">
              A evolução aparece com dados de 2+ competências.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={serie} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CORES.verde} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={CORES.verde} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#efe6d1" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} width={62} />
                <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} contentStyle={tooltipStyle} />
                <Area dataKey="receitaLiquida" name="Receita líquida" stroke={CORES.verde} strokeWidth={2.5} fill="url(#areaReceita)" isAnimationActive={false} />
                <Line dataKey="resultadoLiquido" name="Resultado líquido" stroke={CORES.dourado} strokeWidth={2.5} dot={{ r: 3, fill: CORES.dourado }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          {serie.length >= 2 && (
            <div className="mt-2 flex items-center gap-4 text-[11px] text-muted">
              <Legenda cor={CORES.verde}>Receita líquida</Legenda>
              <Legenda cor={CORES.dourado}>Resultado líquido</Legenda>
            </div>
          )}
        </Card>

        <Card className="animate-rise">
          <h2 className="mb-4 font-head text-sm font-semibold uppercase tracking-wider text-muted">
            Realizado × Orçado
          </h2>
          {!temOrcamento ? (
            <p className="py-10 text-center text-sm text-faint">
              Monte o orçamento em <strong className="text-muted">Orçamento</strong> para comparar.
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={comparativo} margin={{ top: 6, right: 8, left: 8, bottom: 0 }} barGap={2}>
                  <CartesianGrid stroke="#efe6d1" vertical={false} />
                  <XAxis dataKey="nome" tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} width={62} />
                  <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} cursor={{ fill: 'rgba(15,122,73,0.05)' }} contentStyle={tooltipStyle} />
                  <Bar dataKey="realizado" name="Realizado" fill={CORES.verde} radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="orcado" name="Orçado" fill={CORES.dourado} radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex items-center gap-4 text-[11px] text-muted">
                <Legenda cor={CORES.verde}>Realizado</Legenda>
                <Legenda cor={CORES.dourado}>Orçado</Legenda>
              </div>
            </>
          )}
        </Card>
      </div>

      {temOrcamento && desvios.length > 0 && (
        <Card className="mt-4 animate-rise">
          <h2 className="mb-3 font-head text-sm font-semibold uppercase tracking-wider text-muted">
            Maiores desvios do mês
          </h2>
          <div className="flex flex-col">
            {desvios.map((d) => {
              const bom = d.sinal === 1 ? d.desvio > 0 : d.desvio < 0
              return (
                <div
                  key={d.rotulo}
                  className="flex items-center justify-between gap-3 border-b border-line/60 py-2.5 last:border-0"
                >
                  <span className="flex items-center gap-2 text-sm text-ink">
                    <span className={`h-1.5 w-1.5 rounded-full ${bom ? 'bg-green' : 'bg-danger'}`} />
                    {d.rotulo}
                  </span>
                  <span className={`font-head text-sm font-semibold tabular-nums ${bom ? 'text-green' : 'text-danger'}`}>
                    {formatBRL(d.desvio)}
                    {d.pct != null && <span className="ml-1 text-xs font-normal opacity-70">({formatPct(d.pct)})</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

interface Ponto {
  tipo: 'positivo' | 'atencao' | 'risco'
  titulo: string
  detalhe: string
}
interface AlertaFechamento {
  rotulo: string
  situacao: 'abaixo' | 'acima' | 'no_alvo'
  detalhe: string
}
interface Analise {
  resumo: string
  pontos: Ponto[]
  recomendacoes: string[]
  projecaoFechamento?: AlertaFechamento[]
}
const ESTILO_PONTO: Record<Ponto['tipo'], { rotulo: string; cls: string; dot: string }> = {
  positivo: { rotulo: 'Positivo', cls: 'text-green', dot: 'bg-green' },
  atencao: { rotulo: 'Atenção', cls: 'text-gold-deep', dot: 'bg-gold' },
  risco: { rotulo: 'Risco', cls: 'text-danger', dot: 'bg-danger' },
}

function InsightsIA({
  dre,
  competencia,
  diaAtual,
  diasNoMes,
  ehMesCorrente,
}: {
  dre: DreMensal
  competencia: string
  diaAtual: number
  diasNoMes: number
  ehMesCorrente: boolean
}) {
  const [analise, setAnalise] = useState<Analise | null>(null)
  // Já entra carregando: a análise é gerada automaticamente ao abrir (ver effect).
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  // Competência cuja análise já foi disparada — evita refetch duplicado (StrictMode)
  // e regeração a cada re-render que não troca de mês.
  const autoGerado = useRef<string | null>(null)

  const gerar = async () => {
    setCarregando(true)
    setErro(null)
    try {
      const fech = ehMesCorrente ? projecaoFechamento(dre, diaAtual, diasNoMes) : []
      const projPorLinha = new Map(fech.map((f) => [f.rotulo, f]))
      const linhas = dre.linhas
        .filter((l) => l.realizado !== 0 || l.orcado !== 0)
        .map((l) => ({
          rotulo: l.rotulo,
          realizado: l.realizado,
          orcado: l.orcado,
          desvio: l.realizado - l.orcado,
          desvioPct: l.orcado !== 0 ? ((l.realizado - l.orcado) / l.orcado) * 100 : null,
          projecaoFimMes: projPorLinha.get(l.rotulo)?.projecao ?? null,
        }))
      const subtotais = {
        'Receita líquida': { realizado: dre.realizado.receitaLiquida, orcado: dre.orcado.receitaLiquida },
        'Lucro bruto': { realizado: dre.realizado.lucroBruto, orcado: dre.orcado.lucroBruto },
        EBITDA: { realizado: dre.realizado.ebitda, orcado: dre.orcado.ebitda },
        'Resultado líquido': { realizado: dre.realizado.resultadoLiquido, orcado: dre.orcado.resultadoLiquido },
      }
      const resp = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          competencia,
          linhas,
          subtotais,
          mesCorrente: ehMesCorrente,
          diaAtual,
          diasNoMes,
        }),
      })
      const d = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(d?.erro || `Erro ${resp.status}`)
      setAnalise({
        resumo: d.resumo ?? '',
        pontos: d.pontos ?? [],
        recomendacoes: d.recomendacoes ?? [],
        projecaoFechamento: d.projecaoFechamento ?? [],
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }

  // Gera a análise automaticamente ao abrir o dashboard e ao trocar de
  // competência — o sócio não precisa clicar em "Gerar análise". O botão vira
  // apenas "Atualizar análise" (regeração manual). Uma chamada por competência.
  useEffect(() => {
    if (autoGerado.current === competencia) return
    autoGerado.current = competencia
    setAnalise(null)
    setErro(null)
    setCarregando(true)
    void gerar()
    // gerar lê o DRE da competência atual pelo closure deste render.
  }, [competencia]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="mb-4 animate-rise border-green/20 bg-gradient-to-br from-green/[0.05] to-surface">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-head text-sm font-semibold uppercase tracking-wider text-green">
          <span>✦</span> Insights
        </h2>
        <button
          onClick={gerar}
          disabled={carregando}
          className="rounded-lg bg-green px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-green-deep hover:shadow-md active:scale-[0.97] disabled:opacity-50"
        >
          {carregando ? 'Analisando…' : analise ? 'Atualizar análise' : 'Gerar análise'}
        </button>
      </div>

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

      {!analise && !carregando && !erro && (
        <p className="mt-3 text-sm text-muted">
          Peça uma leitura executiva dos desvios do mês — o que foi bem, o que estourou o orçamento
          e o que fazer a respeito.
        </p>
      )}

      {carregando && <p className="mt-3 text-sm text-muted">Lendo o DRE e os desvios do mês…</p>}

      {analise && (
        <div className="mt-4 flex flex-col gap-4">
          {analise.resumo && <p className="text-sm leading-relaxed text-ink">{analise.resumo}</p>}

          {analise.pontos.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {analise.pontos.map((p, i) => {
                const e = ESTILO_PONTO[p.tipo] ?? ESTILO_PONTO.atencao
                return (
                  <div key={i} className="flex gap-2.5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.dot}`} />
                    <div>
                      <div className="text-sm font-semibold text-ink">
                        {p.titulo}{' '}
                        <span className={`text-[11px] font-medium uppercase tracking-wide ${e.cls}`}>
                          · {e.rotulo}
                        </span>
                      </div>
                      <div className="text-sm text-muted">{p.detalhe}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {analise.projecaoFechamento && analise.projecaoFechamento.length > 0 && (
            <div className="rounded-lg border border-warn/40 bg-warn/5 p-3.5">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gold-deep">
                Projeção de fechamento do mês
              </div>
              <ul className="flex flex-col gap-1.5">
                {analise.projecaoFechamento.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink">
                    <span className={a.situacao === 'abaixo' || a.situacao === 'acima' ? 'text-danger' : 'text-green'}>
                      {a.situacao === 'abaixo' ? '↓' : a.situacao === 'acima' ? '↑' : '✓'}
                    </span>
                    <span>
                      <strong>{a.rotulo}</strong> — {a.detalhe}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analise.recomendacoes.length > 0 && (
            <div className="rounded-lg border border-line bg-cream/50 p-3.5">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
                Recomendações
              </div>
              <ul className="flex flex-col gap-1.5">
                {analise.recomendacoes.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink">
                    <span className="text-gold">→</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-faint">
            Gerada por IA (Claude) a partir do realizado × orçado. Revise antes de decidir.
          </p>
        </div>
      )}
    </Card>
  )
}

function Legenda({ cor, children }: { cor: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
      {children}
    </span>
  )
}

function Cabecalho({
  competencias,
  competencia,
  setComp,
}: {
  competencias: string[]
  competencia: string
  setComp: (c: string) => void
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div>
        <Kicker>Visão geral</Kicker>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
          Dashboard <span className="text-green">financeiro</span>
        </h1>
      </div>
      {competencias.length > 0 && (
        <div className="w-44">
          <span className="mb-1 block text-xs font-medium text-muted">Competência</span>
          <Select
            value={competencia}
            onChange={setComp}
            options={competencias.map((c) => ({ value: c, label: rotuloCompetencia(c) }))}
          />
        </div>
      )}
    </div>
  )
}

function Kpi({
  rotulo,
  valor,
  orcado,
  margemBase,
  temOrcamento,
  i,
}: {
  rotulo: string
  valor: number
  orcado: number
  margemBase?: number
  temOrcamento: boolean
  i: number
}) {
  const desvio = valor - orcado
  const m = margemBase != null ? margem(valor, margemBase) : null
  return (
    <div
      className="animate-rise rounded-xl border border-line bg-surface p-4 transition-shadow hover:shadow-[0_8px_24px_-16px_rgba(35,40,31,0.4)]"
      style={{ animationDelay: `${i * 60}ms` }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">{rotulo}</div>
      <div className="mt-1 font-head text-2xl font-semibold tabular-nums text-ink">{formatBRL(valor)}</div>
      <div className="mt-1 flex items-center gap-2 text-[11px]">
        {m != null && <span className="text-muted">margem {formatPct(m)}</span>}
        {temOrcamento && orcado !== 0 && (
          <span className={desvio >= 0 ? 'text-green' : 'text-danger'}>
            {desvio >= 0 ? '▲' : '▼'} {formatBRL(Math.abs(desvio))}
          </span>
        )}
      </div>
    </div>
  )
}
