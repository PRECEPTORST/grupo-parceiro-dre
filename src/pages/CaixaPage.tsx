import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { useDre } from '../context/DreContext'
import { useAuth } from '../context/AuthContext'
import { podeEditarOrcamento } from '../lib/permissoes'
import { Botao, Card, Kicker, NumInput, Select, Field } from '../components/ui'
import { formatBRL, formatBRLCompact } from '../lib/format'
import { mapaEfetivo } from '../lib/planoContas'
import {
  projetarCaixa,
  projetarCaixaDiario,
  addMeses,
  type DiaFluxo,
  type EventoCaixa,
  type ProjecaoDiaria,
} from '../lib/caixa'
import { premissasCaixaPadrao, type PremissasCaixa, type MetodoProjecaoCaixa, type MovimentoCaixa } from '../lib/tipos'

const CORES = { verde: '#0f7a49', dourado: '#cd8d05', vermelho: '#c0492f' }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloCompetencia(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`
}

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #ece1c8',
  fontSize: 12,
  padding: '8px 12px',
  boxShadow: '0 12px 32px -12px rgba(35,40,31,0.28)',
}

const METODOS: { value: MetodoProjecaoCaixa; label: string }[] = [
  { value: 'orcamento_historico', label: 'Orçamento + histórico' },
  { value: 'orcamento', label: 'Somente orçamento' },
  { value: 'historico', label: 'Tendência do histórico' },
]

function iguais(a: PremissasCaixa, b: PremissasCaixa): boolean {
  return (
    a.saldoInicial === b.saldoInicial &&
    a.competenciaSaldo === b.competenciaSaldo &&
    a.horizonteMeses === b.horizonteMeses &&
    a.prazoRecebimentoDias === b.prazoRecebimentoDias &&
    a.prazoPagamentoDias === b.prazoPagamentoDias &&
    a.prazoImpostosDias === b.prazoImpostosDias &&
    a.metodoProjecao === b.metodoProjecao &&
    a.mesesBaseHistorico === b.mesesBaseHistorico
  )
}

export function CaixaPage() {
  const { estado, salvarPremissasCaixa } = useDre()
  const { usuario } = useAuth()
  const podeEditar = podeEditarOrcamento(usuario?.papel)

  const salvas = estado.premissasCaixa
  const [premissas, setPremissas] = useState<PremissasCaixa>(() => salvas ?? premissasCaixaPadrao())

  const mapa = useMemo(() => mapaEfetivo(estado.classificacoes), [estado.classificacoes])

  // Movimentos REAIS da Enoki (contas a pagar/receber). Quando disponíveis,
  // substituem a estimativa por prazo no motor de caixa (seam `movimentosReais`).
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[] | null>(null)
  const [metaEnoki, setMetaEnoki] = useState<{ empresas: string[]; entradas: number; saidas: number; homologacao: boolean } | null>(null)
  const [statusEnoki, setStatusEnoki] = useState<'carregando' | 'reais' | 'nao_configurado' | 'erro' | 'vazio'>('carregando')
  const [erroEnoki, setErroEnoki] = useState<string | null>(null)

  const janela = useMemo(() => {
    const de = `${premissas.competenciaSaldo}-01`
    const ate = `${addMeses(premissas.competenciaSaldo, Math.max(1, premissas.horizonteMeses))}-28`
    return { de, ate }
  }, [premissas.competenciaSaldo, premissas.horizonteMeses])

  const buscarEnoki = useCallback(async () => {
    setStatusEnoki('carregando')
    setErroEnoki(null)
    try {
      const r = await fetch(`/api/enoki-caixa?de=${janela.de}&ate=${janela.ate}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.erro || `Erro ${r.status}`)
      if (!d.configurado) {
        setMovimentos(null)
        setMetaEnoki(null)
        setStatusEnoki('nao_configurado')
        return
      }
      const movs = (d.movimentos ?? []) as MovimentoCaixa[]
      setMovimentos(movs)
      setMetaEnoki(d.meta ?? null)
      setStatusEnoki(movs.length ? 'reais' : 'vazio')
    } catch (e) {
      setMovimentos(null)
      setStatusEnoki('erro')
      setErroEnoki(e instanceof Error ? e.message : String(e))
    }
  }, [janela])

  useEffect(() => {
    void buscarEnoki()
  }, [buscarEnoki])

  const movReais = movimentos && movimentos.length ? movimentos : undefined

  const projecao = useMemo(
    () => projetarCaixa(estado.lancamentos, mapa, estado.orcamentos, premissas, movReais),
    [estado.lancamentos, mapa, estado.orcamentos, premissas, movReais],
  )

  // Detalhe diário de um mês do horizonte.
  const mesesHorizonte = projecao.meses.map((m) => m.competencia)
  const [mesDetalhe, setMesDetalhe] = useState(premissas.competenciaSaldo)
  const mesAtivo = mesesHorizonte.includes(mesDetalhe)
    ? mesDetalhe
    : (mesesHorizonte[0] ?? premissas.competenciaSaldo)
  const diario = useMemo(
    () => projetarCaixaDiario(mesAtivo, estado.lancamentos, mapa, estado.orcamentos, premissas, movReais),
    [mesAtivo, estado.lancamentos, mapa, estado.orcamentos, premissas, movReais],
  )

  const set = <K extends keyof PremissasCaixa>(chave: K, valor: PremissasCaixa[K]) =>
    setPremissas((p) => ({ ...p, [chave]: valor }))

  const salvar = () =>
    salvarPremissasCaixa({ ...premissas, atualizadoEm: new Date().toISOString() })

  const alterado = !salvas || !iguais(premissas, salvas)

  // Opções de "competência do saldo": 3 meses atrás até 12 à frente.
  const opcoesSaldo = useMemo(() => {
    const inicio = addMeses(premissas.competenciaSaldo, -3)
    return Array.from({ length: 16 }, (_, i) => {
      const c = addMeses(inicio, i)
      return { value: c, label: rotuloCompetencia(c) }
    })
  }, [premissas.competenciaSaldo])

  const dados = projecao.meses.map((m) => ({
    rotulo: rotuloCompetencia(m.competencia),
    entradas: m.entradas,
    saidas: m.saidas,
    saldo: m.saldoFinal,
  }))

  const totalEntradas = projecao.meses.reduce((s, m) => s + m.entradas, 0)
  const totalSaidas = projecao.meses.reduce((s, m) => s + m.saidas, 0)

  if (estado.lancamentos.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-8">
        <Cabecalho />
        <Card className="animate-rise">
          <p className="text-muted">
            Ainda não há dados. Sincronize o Safragold em{' '}
            <strong className="text-ink">Lançamentos</strong> para o motor projetar o caixa.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <Cabecalho />

      {/* Fonte dos dados: Enoki (real) × estimativa por prazo */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {statusEnoki === 'carregando' && (
          <span className="rounded-full bg-cream px-3 py-1 text-muted">⏳ Buscando contas a pagar/receber na Enoki…</span>
        )}
        {statusEnoki === 'reais' && metaEnoki && (
          <span className="rounded-full bg-green/10 px-3 py-1 font-medium text-green-deep">
            ● Fluxo com dados REAIS da Enoki — {metaEnoki.entradas} a receber / {metaEnoki.saidas} a pagar
            {metaEnoki.homologacao && ' · homologação'}
          </span>
        )}
        {statusEnoki === 'vazio' && (
          <span className="rounded-full bg-cream px-3 py-1 text-muted">
            Enoki conectada, mas sem títulos na janela — usando estimativa por prazo.
          </span>
        )}
        {statusEnoki === 'nao_configurado' && (
          <span className="rounded-full bg-cream px-3 py-1 text-muted">
            Estimativa por prazo (Enoki não configurada). Projeção derivada do DRE.
          </span>
        )}
        {statusEnoki === 'erro' && (
          <span className="rounded-full bg-danger/10 px-3 py-1 text-danger">⚠ Enoki indisponível: {erroEnoki} — usando estimativa.</span>
        )}
        {statusEnoki !== 'carregando' && (
          <button onClick={() => void buscarEnoki()} className="rounded-full border border-line px-3 py-1 font-medium text-muted hover:bg-cream hover:text-ink">
            ↻ Atualizar
          </button>
        )}
      </div>

      {/* HERO — saldo projetado ao fim do horizonte */}
      <div className="mb-4 animate-rise overflow-hidden rounded-2xl border border-green/20 bg-gradient-to-br from-green/[0.07] via-surface to-surface shadow-[0_1px_2px_rgba(35,40,31,0.04),0_16px_40px_-24px_rgba(15,122,73,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-6 p-6">
          <div>
            <div className="font-head text-xs font-semibold uppercase tracking-[0.22em] text-green">
              Saldo projetado · {rotuloCompetencia(addMeses(premissas.competenciaSaldo, premissas.horizonteMeses - 1))}
            </div>
            <div
              className={`mt-1 font-head text-5xl font-bold tracking-tight ${
                projecao.saldoFinalHorizonte < 0 ? 'text-danger' : 'text-green'
              }`}
            >
              {formatBRL(projecao.saldoFinalHorizonte)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span>
                Saldo inicial <strong className="text-ink">{formatBRL(premissas.saldoInicial)}</strong>
              </span>
              {projecao.menorSaldo && (
                <span className={projecao.menorSaldo.saldo < 0 ? 'text-danger' : ''}>
                  Menor saldo{' '}
                  <strong className={projecao.menorSaldo.saldo < 0 ? '' : 'text-ink'}>
                    {formatBRL(projecao.menorSaldo.saldo)}
                  </strong>{' '}
                  em {rotuloCompetencia(projecao.menorSaldo.competencia)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {projecao.primeiroMesNegativo && (
        <Card className="mb-4 animate-rise border-danger/40 bg-danger/5">
          <p className="text-sm text-danger">
            <strong>Alerta de liquidez.</strong> Pela projeção atual, o caixa fica{' '}
            <strong>negativo em {rotuloCompetencia(projecao.primeiroMesNegativo)}</strong>. Antecipe
            recebimentos, alongue pagamentos ou reforce capital de giro.
          </p>
        </Card>
      )}

      {/* Premissas */}
      <Card className="mb-4 animate-rise">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-head text-sm font-semibold uppercase tracking-wider text-muted">
            Premissas da projeção
          </h2>
          {!podeEditar && (
            <span className="text-xs text-faint">Somente consulta — premissas fixas.</span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Saldo inicial de caixa (R$)">
            <NumInput
              value={premissas.saldoInicial}
              onChange={(v) => set('saldoInicial', v ?? 0)}
              disabled={!podeEditar}
            />
          </Field>
          <Field label="Competência do saldo">
            <Select
              value={premissas.competenciaSaldo}
              onChange={(v) => podeEditar && set('competenciaSaldo', v)}
              options={opcoesSaldo}
            />
          </Field>
          <Field label="Horizonte (meses)">
            <Select
              value={String(premissas.horizonteMeses)}
              onChange={(v) => podeEditar && set('horizonteMeses', Number(v))}
              options={[3, 6, 12].map((n) => ({ value: String(n), label: `${n} meses` }))}
            />
          </Field>
          <Field label="Prazo de recebimento (dias)" hint="Receitas: competência → caixa.">
            <NumInput
              value={premissas.prazoRecebimentoDias}
              onChange={(v) => set('prazoRecebimentoDias', v ?? 0)}
              min={0}
              disabled={!podeEditar}
            />
          </Field>
          <Field label="Prazo de pagamento (dias)" hint="Custos e despesas.">
            <NumInput
              value={premissas.prazoPagamentoDias}
              onChange={(v) => set('prazoPagamentoDias', v ?? 0)}
              min={0}
              disabled={!podeEditar}
            />
          </Field>
          <Field label="Prazo de impostos (dias)" hint="Deduções e IR/CSLL.">
            <NumInput
              value={premissas.prazoImpostosDias}
              onChange={(v) => set('prazoImpostosDias', v ?? 0)}
              min={0}
              disabled={!podeEditar}
            />
          </Field>
          <Field label="Projeção dos meses futuros">
            <Select
              value={premissas.metodoProjecao}
              onChange={(v) => podeEditar && set('metodoProjecao', v as MetodoProjecaoCaixa)}
              options={METODOS}
            />
          </Field>
          {premissas.metodoProjecao !== 'orcamento' && (
            <Field label="Meses de base do histórico" hint="Média usada onde falta orçamento.">
              <NumInput
                value={premissas.mesesBaseHistorico}
                onChange={(v) => set('mesesBaseHistorico', Math.max(1, v ?? 1))}
                min={1}
                disabled={!podeEditar}
              />
            </Field>
          )}
        </div>

        {podeEditar && (
          <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
            <Botao onClick={salvar} disabled={!alterado}>
              Salvar premissas
            </Botao>
            <span className="text-xs text-faint">
              {alterado
                ? 'Alterações não salvas — a projeção acima já reflete os novos valores.'
                : salvas
                  ? `Salvo em ${new Date(salvas.atualizadoEm).toLocaleDateString('pt-BR')}`
                  : ''}
            </span>
          </div>
        )}
      </Card>

      {/* Gráfico */}
      <Card className="mb-4 animate-rise">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-head text-sm font-semibold uppercase tracking-wider text-muted">
            Entradas, saídas e saldo acumulado
          </h2>
          <div className="flex items-center gap-4 text-[11px] text-muted">
            <Legenda cor={CORES.verde}>Entradas</Legenda>
            <Legenda cor={CORES.vermelho}>Saídas</Legenda>
            <Legenda cor={CORES.dourado}>Saldo</Legenda>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={dados} margin={{ top: 6, right: 8, left: 8, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke="#efe6d1" vertical={false} />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} width={62} />
            <Tooltip formatter={(v: unknown) => formatBRL(Number(v))} cursor={{ fill: 'rgba(15,122,73,0.05)' }} contentStyle={tooltipStyle} />
            <ReferenceLine y={0} stroke="#d9ccae" />
            <Bar dataKey="entradas" name="Entradas" fill={CORES.verde} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
            <Bar dataKey="saidas" name="Saídas" fill={CORES.vermelho} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
            <Line dataKey="saldo" name="Saldo" stroke={CORES.dourado} strokeWidth={2.5} dot={{ r: 3, fill: CORES.dourado }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* Tabela mês a mês */}
      <Card className="animate-rise">
        <h2 className="mb-3 font-head text-sm font-semibold uppercase tracking-wider text-muted">
          Detalhe mês a mês
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-faint">
                <th className="py-2 pr-3 font-semibold">Mês</th>
                <th className="py-2 px-3 text-right font-semibold">Entradas</th>
                <th className="py-2 px-3 text-right font-semibold">Saídas</th>
                <th className="py-2 px-3 text-right font-semibold">Líquido</th>
                <th className="py-2 pl-3 text-right font-semibold">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {projecao.meses.map((m) => (
                <tr key={m.competencia} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5 pr-3 text-ink">{rotuloCompetencia(m.competencia)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-green">
                    {m.entradas ? formatBRL(m.entradas) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-danger">
                    {m.saidas ? formatBRL(m.saidas) : '—'}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${m.liquido >= 0 ? 'text-ink' : 'text-danger'}`}>
                    {formatBRL(m.liquido)}
                  </td>
                  <td className={`py-2.5 pl-3 text-right font-head font-semibold tabular-nums ${m.negativo ? 'text-danger' : 'text-ink'}`}>
                    {formatBRL(m.saldoFinal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-[13px] font-semibold">
                <td className="py-2.5 pr-3 text-muted">Total do período</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-green">{formatBRL(totalEntradas)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-danger">{formatBRL(totalSaidas)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-ink">{formatBRL(totalEntradas - totalSaidas)}</td>
                <td className="py-2.5 pl-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <DetalheDiario
        diario={diario}
        meses={mesesHorizonte}
        mesAtivo={mesAtivo}
        onSelecionar={setMesDetalhe}
      />

      <p className="mt-4 text-xs text-faint">
        Projeção determinística: converte o DRE (competência) em caixa pelos prazos acima e projeta
        os meses futuros por {METODOS.find((m) => m.value === premissas.metodoProjecao)?.label.toLowerCase()}.
        Depreciação/amortização não entra (não movimenta caixa). Quando a integração com o Enoki
        trouxer as contas a pagar/receber com vencimento real, a projeção passa a usá-las no lugar da
        estimativa por prazo.
      </p>
    </div>
  )
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function DetalheDiario({
  diario,
  meses,
  mesAtivo,
  onSelecionar,
}: {
  diario: ProjecaoDiaria
  meses: string[]
  mesAtivo: string
  onSelecionar: (mes: string) => void
}) {
  const [diaAberto, setDiaAberto] = useState<DiaFluxo | null>(null)
  const dadosDia = diario.dias.map((d) => ({
    rotulo: String(d.dia),
    entradas: d.entradas,
    saidas: d.saidas,
    saldo: d.saldoFinal,
  }))

  // Grade do calendário: começa no dia da semana do dia 1º.
  const [ano, mes] = diario.mes.split('-').map(Number)
  const offset = new Date(ano, mes - 1, 1).getDay()
  const celulas: (DiaFluxo | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...diario.dias,
  ]

  return (
    <>
    <Card className="mt-4 animate-rise">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-head text-sm font-semibold uppercase tracking-wider text-muted">
          Detalhe diário — {rotuloCompetencia(diario.mes)}
          <span className="ml-2 text-[11px] font-normal normal-case tracking-normal text-faint">
            clique num dia para ver os lançamentos
          </span>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {meses.map((m) => (
            <button
              key={m}
              onClick={() => onSelecionar(m)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                m === mesAtivo
                  ? 'bg-green text-white'
                  : 'border border-line text-muted hover:bg-green/10 hover:text-green'
              }`}
            >
              {rotuloCompetencia(m)}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs do mês */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniKpi rotulo="Abertura" valor={diario.saldoAbertura} />
        <MiniKpi rotulo="Fechamento" valor={diario.saldoFechamento} destaque />
        <MiniKpi
          rotulo="Menor saldo"
          valor={diario.menorSaldo?.saldo ?? 0}
          sub={diario.menorSaldo ? `dia ${Number(diario.menorSaldo.data.slice(8, 10))}` : undefined}
          alerta={(diario.menorSaldo?.saldo ?? 0) < 0}
        />
        <MiniKpi
          rotulo="Dias negativos"
          texto={String(diario.diasNegativos)}
          alerta={diario.diasNegativos > 0}
        />
      </div>

      {/* Curva diária */}
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={dadosDia} margin={{ top: 6, right: 8, left: 8, bottom: 0 }} barGap={1}>
          <CartesianGrid stroke="#efe6d1" vertical={false} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: '#8a8472' }} axisLine={false} tickLine={false} interval={2} />
          <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: '#8a8472' }} axisLine={false} tickLine={false} width={62} />
          <Tooltip
            formatter={(v: unknown) => formatBRL(Number(v))}
            labelFormatter={(l) => `Dia ${l}`}
            cursor={{ fill: 'rgba(15,122,73,0.05)' }}
            contentStyle={tooltipStyle}
          />
          <ReferenceLine y={0} stroke="#d9ccae" />
          <Bar dataKey="entradas" name="Entradas" fill={CORES.verde} radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
          <Bar dataKey="saidas" name="Saídas" fill={CORES.vermelho} radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
          <Line dataKey="saldo" name="Saldo" stroke={CORES.dourado} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Calendário do mês */}
      <div className="mt-5">
        <div className="mb-1 grid grid-cols-7 gap-1.5">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-faint">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {celulas.map((c, i) =>
            c === null ? (
              <div key={`v${i}`} />
            ) : (
              <CelulaDia
                key={c.data}
                dia={c}
                menor={diario.menorSaldo?.data === c.data}
                onAbrir={setDiaAberto}
              />
            ),
          )}
        </div>
      </div>

    </Card>
    {diaAberto && <ModalDia dia={diaAberto} onFechar={() => setDiaAberto(null)} />}
    </>
  )
}

function CelulaDia({
  dia,
  menor,
  onAbrir,
}: {
  dia: DiaFluxo
  menor: boolean
  onAbrir: (d: DiaFluxo) => void
}) {
  const temMov = dia.entradas !== 0 || dia.saidas !== 0
  return (
    <button
      type="button"
      onClick={() => temMov && onAbrir(dia)}
      title={temMov ? 'Ver lançamentos do dia' : 'Sem movimento'}
      className={`flex min-h-[68px] flex-col rounded-lg border p-1.5 text-left transition-shadow ${
        dia.negativo
          ? 'border-danger/40 bg-danger/5'
          : temMov
            ? 'border-line bg-cream/40'
            : 'border-line/60'
      } ${menor ? 'ring-2 ring-gold' : ''} ${
        temMov ? 'cursor-pointer hover:shadow-[0_6px_16px_-10px_rgba(35,40,31,0.5)]' : 'cursor-default'
      }`}
    >
      <span className="text-[10px] font-semibold text-faint">{dia.dia}</span>
      {temMov && (
        <span className="mt-0.5 flex flex-col gap-px text-[9px] leading-tight tabular-nums">
          <span className={dia.entradas > 0 ? 'text-green' : 'text-faint'} title="Entra (a receber)">
            ▲ {formatBRLCompact(dia.entradas)}
          </span>
          <span className={dia.saidas > 0 ? 'text-danger' : 'text-faint'} title="Sai (a pagar)">
            ▼ {formatBRLCompact(dia.saidas)}
          </span>
        </span>
      )}
      <span
        className={`mt-auto text-right text-[10px] font-head font-semibold tabular-nums ${
          dia.negativo ? 'text-danger' : 'text-ink'
        }`}
      >
        {formatBRLCompact(dia.saldoFinal)}
      </span>
    </button>
  )
}

const DATA_LONGA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
function rotuloDataLonga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return DATA_LONGA.format(new Date(y, m - 1, d))
}
function rotuloDataCurta(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function ModalDia({ dia, onFechar }: { dia: DiaFluxo; onFechar: () => void }) {
  const receber = dia.eventos.filter((e) => e.tipo === 'entrada')
  const pagar = dia.eventos.filter((e) => e.tipo === 'saida')
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 animate-fade"
      onClick={onFechar}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="font-head text-xs font-semibold uppercase tracking-[0.2em] text-green">
              Lançamentos do dia
            </div>
            <h3 className="mt-0.5 text-lg font-bold text-ink">{rotuloDataLonga(dia.data)}</h3>
          </div>
          <button
            onClick={onFechar}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-cream hover:text-ink"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-line bg-cream/40 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">A receber</div>
            <div className="font-head text-sm font-semibold tabular-nums text-green">{formatBRL(dia.entradas)}</div>
          </div>
          <div className="rounded-lg border border-line bg-cream/40 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">A pagar</div>
            <div className="font-head text-sm font-semibold tabular-nums text-danger">{formatBRL(dia.saidas)}</div>
          </div>
          <div className={`rounded-lg border p-2 ${dia.negativo ? 'border-danger/40 bg-danger/5' : 'border-line bg-cream/40'}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Saldo no fim</div>
            <div className={`font-head text-sm font-semibold tabular-nums ${dia.negativo ? 'text-danger' : 'text-ink'}`}>
              {formatBRL(dia.saldoFinal)}
            </div>
          </div>
        </div>

        {dia.eventos.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">Sem movimento neste dia.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <ListaEventos titulo="A receber" cor="text-green" itens={receber} />
            <ListaEventos titulo="A pagar" cor="text-danger" itens={pagar} />
          </div>
        )}

        <p className="mt-4 text-[11px] text-faint">
          Itens marcados como <em>projeção</em> vêm da estimativa por prazo/histórico. Quando a
          integração com o Enoki trouxer os títulos reais, aparecem aqui com o vencimento efetivo.
        </p>
      </div>
    </div>
  )
}

function ListaEventos({ titulo, cor, itens }: { titulo: string; cor: string; itens: EventoCaixa[] }) {
  if (itens.length === 0) return null
  return (
    <div>
      <div className={`mb-1.5 flex items-center justify-between border-b border-line pb-1 text-xs font-semibold uppercase tracking-wider ${cor}`}>
        <span>{titulo}</span>
        <span className="tabular-nums">{formatBRL(itens.reduce((s, e) => s + e.valor, 0))}</span>
      </div>
      <div className="flex flex-col">
        {itens.map((e, i) => (
          <div key={i} className="flex items-start justify-between gap-3 border-b border-line/50 py-2 last:border-0">
            <div className="min-w-0">
              <div className="truncate text-sm text-ink">
                {e.origem.conta && <span className="font-mono text-xs text-faint">{e.origem.conta} · </span>}
                {e.origem.descricao || e.origem.rotulo}
              </div>
              <div className="text-[11px] text-muted">
                {e.origem.rotulo}
                {' · '}
                {e.origem.projetado ? (
                  <span className="text-gold-deep">projeção (ref. {rotuloDataCurta(e.origem.dataOrigem)})</span>
                ) : (
                  <>ref. {rotuloDataCurta(e.origem.dataOrigem)}</>
                )}
              </div>
            </div>
            <div className={`shrink-0 font-head text-sm font-semibold tabular-nums ${cor}`}>
              {formatBRL(e.valor)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniKpi({
  rotulo,
  valor,
  texto,
  sub,
  destaque,
  alerta,
}: {
  rotulo: string
  valor?: number
  texto?: string
  sub?: string
  destaque?: boolean
  alerta?: boolean
}) {
  const cor = alerta ? 'text-danger' : destaque ? 'text-green' : 'text-ink'
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{rotulo}</div>
      <div className={`mt-0.5 font-head text-lg font-semibold tabular-nums ${cor}`}>
        {texto ?? formatBRL(valor ?? 0)}
      </div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
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

function Cabecalho() {
  return (
    <div className="mb-6 animate-rise">
      <Kicker>Planejamento</Kicker>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
        Fluxo de caixa <span className="text-green">projetado</span>
      </h1>
    </div>
  )
}
