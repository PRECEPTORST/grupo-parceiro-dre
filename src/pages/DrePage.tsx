import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { useAuth } from '../context/AuthContext'
import { podeAdministrar } from '../lib/permissoes'
import { Card, Kicker, Select, NumInput } from '../components/ui'
import { SacasModal } from '../components/SacasModal'
import { PainelMargemContribuicao } from '../components/PainelMargemContribuicao'
import { QuadroDespesas } from '../components/QuadroDespesas'
import { serieMargemContribuicao } from '../lib/margemContribuicao'
import { formatBRL, formatPct, formatDataBR, formatNum } from '../lib/format'
import {
  montarDre,
  competenciasDisponiveis,
  type LinhaResultado,
  type Subtotais,
} from '../lib/dre'
import { mapaEfetivo, nomeConta, GRAO_DE_CONTA } from '../lib/planoContas'
import { SeletorFonteDre } from '../components/SeletorFonteDre'
import { PainelCustoMedio } from '../components/PainelCustoMedio'
import { PrimeirosPassos } from '../components/PrimeirosPassos'
import { resumoGraos, type ResumoGraos } from '../lib/graos'
import { orcamentoAprovado, GRAOS, ROTULO_GRAO, type LinhaDRE, type Grao } from '../lib/tipos'

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloCompetencia(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`
}

// Subtotais inseridos DEPOIS de cada linha-chave, na ordem do DRE.
const SUBTOTAIS_APOS: Partial<Record<LinhaDRE, { chave: keyof Subtotais; rotulo: string; forte?: boolean }[]>> =
  {
    deducoes: [{ chave: 'receitaLiquida', rotulo: 'Receita líquida' }],
    custo_produto: [{ chave: 'lucroBruto', rotulo: 'Lucro bruto' }],
    depreciacao_amortizacao: [
      { chave: 'resultadoOperacional', rotulo: 'Resultado operacional (EBIT)' },
      { chave: 'ebitda', rotulo: 'EBITDA' },
    ],
    despesa_financeira: [{ chave: 'resultadoAntesIr', rotulo: 'Resultado antes do IR' }],
    impostos_lucro: [{ chave: 'resultadoLiquido', rotulo: 'Resultado líquido', forte: true }],
    investimentos: [
      { chave: 'resultadoAposInvestimentos', rotulo: 'Resultado após investimentos', forte: true },
    ],
  }

function corDesvio(sinal: 1 | -1, desvio: number): string {
  if (Math.abs(desvio) < 0.005) return 'text-muted'
  const bom = sinal === 1 ? desvio > 0 : desvio < 0
  return bom ? 'text-green' : 'text-danger'
}

export function DrePage() {
  const { estado, salvarSacas, lancamentos, sacas, fusao } = useDre()
  const { usuario } = useAuth()
  const podeEditar = podeAdministrar(usuario?.papel)
  const [lancarSacas, setLancarSacas] = useState(false)
  const competencias = useMemo(
    () => competenciasDisponiveis(lancamentos),
    [lancamentos],
  )
  const [comp, setComp] = useState<string>(() => competencias[0] ?? new Date().toISOString().slice(0, 7))
  const competencia = competencias.includes(comp) ? comp : (competencias[0] ?? comp)

  const mapa = useMemo(() => mapaEfetivo(estado.classificacoes), [estado.classificacoes])
  const orcamento = estado.orcamentos.find((o) => o.competencia === competencia) ?? null

  // DRE até a data de hoje quando o mês selecionado é o mês corrente (parcial).
  const hoje = hojeISO()
  const ehMesCorrente = competencia === hoje.slice(0, 7)
  const ateData = ehMesCorrente ? hoje : undefined

  const dre = useMemo(
    () => montarDre(competencia, lancamentos, mapa, orcamento, ateData),
    [competencia, lancamentos, mapa, orcamento, ateData],
  )

  // Resultado líquido ACUMULADO no ano (YTD): soma o resultado de todos os meses
  // do mesmo ano até o selecionado (o mês corrente entra parcial, até hoje). Mede
  // também a diferença contra o total INFORMADO na origem (resultadoDeclarado) —
  // quando a planilha do cliente tem ajuste manual nos subtotais, os dois divergem.
  const acumuladoAno = useMemo(() => {
    const ano = competencia.slice(0, 4)
    const meses = competencias.filter((c) => c.slice(0, 4) === ano && c <= competencia)
    let total = 0
    let difDeclarado = 0
    const mesesComDif: string[] = []
    for (const c of meses) {
      const ate = c === hoje.slice(0, 7) ? hoje : undefined
      const rl = montarDre(c, lancamentos, mapa, undefined, ate).realizado.resultadoLiquido
      total += rl
      const decl = estado.resultadoDeclarado?.[c]
      if (decl != null && Math.abs(rl - decl) > 1) {
        difDeclarado += rl - decl
        mesesComDif.push(c)
      }
    }
    return { total, ano, nMeses: meses.length, difDeclarado, mesesComDif }
  }, [competencias, competencia, lancamentos, estado.resultadoDeclarado, mapa, hoje])

  const serieMC = useMemo(
    () => serieMargemContribuicao(competencias, lancamentos, mapa, estado.mcIncluirComerciais ?? false),
    [competencias, lancamentos, mapa, estado.mcIncluirComerciais],
  )

  const temOrcamento = !!orcamento
  const orcPendente = !!orcamento && !orcamentoAprovado(orcamento)

  const sacasDoMes = useMemo(() => sacas[competencia] ?? {}, [sacas, competencia])
  const resumo = useMemo(
    () => resumoGraos(competencia, lancamentos, mapa, sacasDoMes),
    [competencia, lancamentos, mapa, sacasDoMes],
  )

  // Meta (orçado) × realizado por grão: volume (sacas), preço de VENDA/saca e
  // MARGEM bruta/saca. Orçado vem da conta de receita do grão. A margem realizada
  // é o spread venda − compra = (receita bruta − aquisição direta) ÷ sacas — sem
  // deduções nem custos rateados, p/ casar com a definição do orçamento.
  const metasGrao = useMemo(() => {
    if (!orcamento) return []
    return GRAOS.map((g) => {
      const conta = Object.keys(GRAO_DE_CONTA).find(
        (c) => GRAO_DE_CONTA[c] === g && mapa[c] === 'receita_bruta',
      )
      const sacasOrc = conta ? (orcamento.sacas?.[conta] ?? 0) : 0
      const precoOrc = conta ? (orcamento.precoSaca?.[conta] ?? 0) : 0
      const margemOrc = conta ? (orcamento.margemSaca?.[conta] ?? 0) : 0
      const rg = resumo.graos.find((x) => x.grao === g)
      const sacasReal = rg?.sacas ?? 0
      const precoReal = sacasReal > 0 ? (rg?.receitaBruta ?? 0) / sacasReal : 0
      const margemReal = sacasReal > 0 ? ((rg?.receitaBruta ?? 0) - (rg?.aquisicao ?? 0)) / sacasReal : 0
      return { grao: g, rotulo: ROTULO_GRAO[g], sacasOrc, precoOrc, margemOrc, sacasReal, precoReal, margemReal }
    }).filter((m) => m.sacasOrc > 0 || m.precoOrc > 0 || m.margemOrc > 0)
  }, [orcamento, mapa, resumo])

  const [recolhidas, setRecolhidas] = useState<Set<LinhaDRE>>(new Set())
  const toggle = (l: LinhaDRE) =>
    setRecolhidas((s) => {
      const n = new Set(s)
      if (n.has(l)) n.delete(l)
      else n.add(l)
      return n
    })
  const todasRecolhidas = recolhidas.size === dre.linhas.filter((l) => l.contas.length).length
  const alternarTodas = () =>
    setRecolhidas(todasRecolhidas ? new Set() : new Set(dre.linhas.map((l) => l.linha)))

  // Faturamento = receita bruta realizada — base da análise vertical (% em cada linha).
  const faturamento = dre.linhas.find((l) => l.linha === 'receita_bruta')?.realizado ?? 0

  const semDados = lancamentos.length === 0

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <Kicker>DRE em tempo real</Kicker>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
            Demonstração do <span className="text-green">Resultado</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SeletorFonteDre />
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
      </div>

      {semDados ? (
        <PrimeirosPassos />
      ) : (
        <>
          {/* KPIs */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard i={0} rotulo="Receita líquida" valor={dre.realizado.receitaLiquida} porSaca={resumo.receitaLiquidaPorSaca} />
            <StatCard i={1} rotulo="Lucro bruto" valor={dre.realizado.lucroBruto} porSaca={resumo.lucroBrutoPorSaca} />
            <StatCard i={2} rotulo="Sacas negociadas" texto={resumo.sacasTotal > 0 ? formatNum(resumo.sacasTotal) : '—'} />
            <StatCard
              i={3}
              rotulo="Resultado líquido"
              valor={dre.realizado.resultadoLiquido}
              porSaca={resumo.lucroLiquidoPorSaca}
              destaque
            />
            <StatCard
              i={4}
              rotulo={`Acum. no ano (${acumuladoAno.ano})`}
              valor={acumuladoAno.total}
              sub={`até ${rotuloCompetencia(competencia)}`}
              destaque
            />
          </div>

          {acumuladoAno.mesesComDif.length > 0 && (
            <Card className="mb-4 animate-rise border-gold/30 bg-gold/5">
              <p className="text-sm text-gold-deep">
                ℹ️ Este resultado pode divergir da sua planilha em{' '}
                <strong>{formatBRL(Math.abs(acumuladoAno.difDeclarado))}</strong> no acumulado (
                {acumuladoAno.mesesComDif.map(rotuloCompetencia).join(', ')}). É proposital: aqui o
                total é a <strong>soma das contas</strong>, enquanto na planilha de origem os subtotais
                têm ajustes manuais que não fecham com elas. A aba{' '}
                <strong>Confiabilidade</strong> detalha essa diferença nos achados de auditoria.
              </p>
            </Card>
          )}

          <div className="mb-5">
            <PainelMargemContribuicao serie={serieMC} competencia={competencia} />
          </div>

          {dre.naoClassificado > 0 && (
            <Card className="mb-4 animate-rise border-warn/40 bg-warn/5">
              <p className="text-sm text-gold-deep">
                <strong>{formatBRL(dre.naoClassificado)}</strong> em{' '}
                {dre.naoClassificadas.length} conta(s) sem classificação — ainda não entram no DRE.
                Classifique em <strong>Lançamentos</strong>.
              </p>
            </Card>
          )}

          {orcPendente && (
            <Card className="mb-4 animate-rise border-warn/40 bg-warn/5">
              <p className="text-sm text-gold-deep">
                ⏳ O orçamento de <strong>{rotuloCompetencia(competencia)}</strong> está{' '}
                <strong>pendente de aprovação do sócio</strong>. Os desvios abaixo usam esse
                orçamento como prévia, mas ele ainda não é o plano oficial.
              </p>
            </Card>
          )}

          <Card className="animate-rise overflow-hidden p-0" >
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <span className="font-head text-sm font-semibold uppercase tracking-wider text-muted">
                {rotuloCompetencia(competencia)}
                {ehMesCorrente && (
                  <span className="ml-2 normal-case tracking-normal text-[11px] font-normal text-faint">
                    realizado até {formatDataBR(hoje)}
                  </span>
                )}
              </span>
              <button
                onClick={alternarTodas}
                className="text-xs font-semibold text-green transition hover:text-green-deep"
              >
                {todasRecolhidas ? 'Expandir tudo' : 'Recolher tudo'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                    <th className="py-2 pl-5 pr-4 font-semibold">Conta</th>
                    <th className="py-2 px-4 text-right font-semibold">Realizado</th>
                    <th className="py-2 px-3 text-right font-semibold">% Fat.</th>
                    {temOrcamento && <th className="py-2 px-4 text-right font-semibold">Orçado</th>}
                    {temOrcamento && (
                      <th className="py-2 pr-5 pl-4 text-right font-semibold">Desvio</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dre.linhas.map((l) => (
                    <LinhaGrupo
                      key={l.linha}
                      linha={l}
                      temOrcamento={temOrcamento}
                      faturamento={faturamento}
                      recolhida={recolhidas.has(l.linha)}
                      onToggle={() => toggle(l.linha)}
                      subtotais={SUBTOTAIS_APOS[l.linha]}
                      dreRealizado={dre.realizado}
                      dreOrcado={dre.orcado}
                      fonteLinha={fusao?.porLinha.find((p) => p.linha === l.linha)?.fonte}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="mt-5">
            <PainelCustoMedio competencia={competencia} podeEditar={podeEditar} />
          </div>

          <QuadroDespesas dre={dre} temOrcamento={temOrcamento} />

          <ResumoCereais
            resumo={resumo}
            podeEditar={podeEditar}
            sacas={sacasDoMes}
            onSalvar={(s) => salvarSacas(competencia, s)}
            onLancarTodos={() => setLancarSacas(true)}
          />

          {metasGrao.length > 0 && <MetaCereais metas={metasGrao} />}

          {!temOrcamento && (
            <p className="mt-3 text-xs text-faint">
              Sem orçamento para {rotuloCompetencia(competencia)}. Monte um em{' '}
              <strong className="text-muted">Orçamento</strong> para comparar e ver os desvios.
            </p>
          )}
        </>
      )}

      {lancarSacas && <SacasModal onClose={() => setLancarSacas(false)} />}
    </div>
  )
}

function ResumoCereais({
  resumo,
  podeEditar,
  sacas,
  onSalvar,
  onLancarTodos,
}: {
  resumo: ResumoGraos
  podeEditar: boolean
  sacas: Partial<Record<Grao, number>>
  onSalvar: (sacas: Partial<Record<Grao, number>>) => void
  onLancarTodos: () => void
}) {
  const tot = resumo.graos.reduce(
    (a, g) => ({
      receitaBruta: a.receitaBruta + g.receitaBruta,
      deducoes: a.deducoes + g.deducoes,
      custo: a.custo + g.custo,
      lucroBruto: a.lucroBruto + g.lucroBruto,
    }),
    { receitaBruta: 0, deducoes: 0, custo: 0, lucroBruto: 0 },
  )
  const brl = (v: number) => formatBRL(v)
  const porSaca = (v: number | null) => (v == null ? '—' : formatBRL(v))

  return (
    <Card className="mt-4 animate-rise overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <span className="font-head text-sm font-semibold uppercase tracking-wider text-muted">
          Resultado por cereal
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-faint">
            {resumo.sacasTotal > 0 ? `${formatNum(resumo.sacasTotal)} sacas no mês` : 'informe as sacas para ver o R$/saca'}
          </span>
          {podeEditar && (
            <button
              onClick={onLancarTodos}
              className="rounded-lg border border-green/40 px-2.5 py-1 text-xs font-semibold text-green transition-colors hover:bg-green/10"
            >
              ⊞ Lançar sacas (todos os meses)
            </button>
          )}
        </div>
      </div>

      {podeEditar && (
        <div className="grid grid-cols-2 gap-3 border-b border-line bg-cream/40 px-5 py-3 sm:grid-cols-4">
          {GRAOS.map((g) => (
            <label key={g} className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">Sacas de {ROTULO_GRAO[g]}</span>
              <NumInput
                value={sacas[g] ?? 0}
                onChange={(v) => onSalvar({ ...sacas, [g]: v ?? 0 })}
                min={0}
              />
            </label>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
              <th className="py-2 pl-5 pr-3 font-semibold">Cereal</th>
              <th className="py-2 px-3 text-right font-semibold">Sacas</th>
              <th className="py-2 px-3 text-right font-semibold">Receita bruta</th>
              <th className="py-2 px-3 text-right font-semibold">(−) Deduções</th>
              <th className="py-2 px-3 text-right font-semibold">(−) Custo</th>
              <th className="py-2 px-3 text-right font-semibold">(=) Lucro bruto</th>
              <th className="py-2 pr-5 pl-3 text-right font-semibold">Lucro / saca</th>
            </tr>
          </thead>
          <tbody>
            {resumo.graos.map((g) => (
              <tr key={g.grao} className="border-b border-line/50">
                <td className="py-2.5 pl-5 pr-3 font-medium text-ink">{g.rotulo}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-muted">
                  {g.sacas > 0 ? formatNum(g.sacas) : '—'}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-ink">{g.receitaBruta ? brl(g.receitaBruta) : '—'}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-muted">{g.deducoes ? brl(g.deducoes) : '—'}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-muted">{g.custo ? brl(g.custo) : '—'}</td>
                <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-ink">{g.receitaBruta ? brl(g.lucroBruto) : '—'}</td>
                <td className="py-2.5 pr-5 pl-3 text-right font-head font-semibold tabular-nums text-green">
                  {porSaca(g.lucroBrutoPorSaca)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-cream/60 text-[13px] font-semibold">
              <td className="py-2.5 pl-5 pr-3 text-muted">Total</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-ink">{resumo.sacasTotal ? formatNum(resumo.sacasTotal) : '—'}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-ink">{brl(tot.receitaBruta)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-muted">{brl(tot.deducoes)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-muted">{brl(tot.custo)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-ink">{brl(tot.lucroBruto)}</td>
              <td className="py-2.5 pr-5 pl-3 text-right font-head tabular-nums text-green">{porSaca(resumo.lucroBrutoPorSaca)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="px-5 py-3 text-[11px] text-faint">
        Deduções rateadas pela receita de cada grão; custos compartilhados do CPV (frete, armazenagem,
        secagem, quebra) rateados pelo volume de sacas. Sacas informadas manualmente.
      </p>
    </Card>
  )
}

interface MetaGrao {
  grao: Grao
  rotulo: string
  sacasOrc: number
  precoOrc: number
  margemOrc: number
  sacasReal: number
  precoReal: number
  margemReal: number
}

function MetaCereais({ metas }: { metas: MetaGrao[] }) {
  const variacao = (real: number, orc: number) => (orc > 0 ? ((real - orc) / orc) * 100 : null)
  const Badge = ({ pct }: { pct: number | null }) => {
    if (pct == null) return <span className="text-faint">—</span>
    const bom = pct >= 0
    return (
      <span className={`text-[11px] font-semibold tabular-nums ${bom ? 'text-green' : 'text-danger'}`}>
        {bom ? '▲' : '▼'} {formatPct(Math.abs(pct))}
      </span>
    )
  }

  return (
    <Card className="mt-4 animate-rise overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <span className="font-head text-sm font-semibold uppercase tracking-wider text-muted">
          Meta × realizado por grão
        </span>
        <span className="text-xs text-faint">volume, preço e margem/saca — orçado × realizado</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
              <th className="py-2 pl-5 pr-3 font-semibold">Cereal</th>
              <th className="py-2 px-3 text-right font-semibold">Sacas real</th>
              <th className="py-2 px-3 text-right font-semibold">Sacas meta</th>
              <th className="py-2 px-3 text-right font-semibold">Volume</th>
              <th className="py-2 px-3 text-right font-semibold">Preço/saca real</th>
              <th className="py-2 px-3 text-right font-semibold">Preço/saca meta</th>
              <th className="py-2 px-3 text-right font-semibold">Preço</th>
              <th className="py-2 px-3 text-right font-semibold">Margem/saca real</th>
              <th className="py-2 px-3 text-right font-semibold">Margem/saca meta</th>
              <th className="py-2 pr-5 pl-3 text-right font-semibold">Margem</th>
            </tr>
          </thead>
          <tbody>
            {metas.map((m) => (
              <tr key={m.grao} className="border-b border-line/50">
                <td className="py-2.5 pl-5 pr-3 font-medium text-ink">{m.rotulo}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-ink">
                  {m.sacasReal > 0 ? formatNum(m.sacasReal) : '—'}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-muted">
                  {m.sacasOrc > 0 ? formatNum(m.sacasOrc) : '—'}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <Badge pct={variacao(m.sacasReal, m.sacasOrc)} />
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-ink">
                  {m.precoReal > 0 ? formatBRL(m.precoReal) : '—'}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-muted">
                  {m.precoOrc > 0 ? formatBRL(m.precoOrc) : '—'}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <Badge pct={variacao(m.precoReal, m.precoOrc)} />
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-ink">
                  {m.sacasReal > 0 ? formatBRL(m.margemReal) : '—'}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-muted">
                  {m.margemOrc > 0 ? formatBRL(m.margemOrc) : '—'}
                </td>
                <td className="py-2.5 pr-5 pl-3 text-right">
                  <Badge pct={variacao(m.margemReal, m.margemOrc)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-[11px] text-faint">
        Meta vem do orçamento de receita por grão (sacas × preço, margem/saca). Realizado: preço/saca =
        receita bruta ÷ sacas; margem/saca = (receita bruta − aquisição direta) ÷ sacas — spread
        venda − compra, sem deduções nem custos rateados, para casar com a definição do orçamento.
      </p>
    </Card>
  )
}

function StatCard({
  rotulo,
  valor,
  texto,
  porSaca,
  sub,
  destaque = false,
  i,
}: {
  rotulo: string
  valor?: number
  texto?: string
  porSaca?: number | null
  sub?: string
  destaque?: boolean
  i: number
}) {
  return (
    <div
      className={`animate-rise rounded-xl border p-4 ${
        destaque ? 'border-green/30 bg-green/5' : 'border-line bg-surface'
      }`}
      style={{ animationDelay: `${i * 60}ms` }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">{rotulo}</div>
      <div
        className={`mt-1 font-head text-xl font-semibold tabular-nums ${
          destaque ? 'text-green' : 'text-ink'
        }`}
      >
        {texto ?? formatBRL(valor ?? 0)}
      </div>
      {porSaca != null && (
        <div className="mt-0.5 text-[11px] tabular-nums text-muted">
          {formatBRL(porSaca)} <span className="text-faint">/ saca</span>
        </div>
      )}
      {sub && <div className="mt-0.5 text-[11px] text-faint">{sub}</div>}
    </div>
  )
}

function LinhaGrupo({
  linha,
  temOrcamento,
  faturamento,
  recolhida,
  onToggle,
  subtotais,
  dreRealizado,
  dreOrcado,
  fonteLinha,
}: {
  linha: LinhaResultado
  temOrcamento: boolean
  faturamento: number
  recolhida: boolean
  onToggle: () => void
  subtotais?: { chave: keyof Subtotais; rotulo: string; forte?: boolean }[]
  dreRealizado: Subtotais
  dreOrcado: Subtotais
  /** No modo fundido, de qual fonte esta linha veio (item 2.1). */
  fonteLinha?: 'enoki' | 'planilha'
}) {
  const temContas = linha.contas.length > 0
  const desvio = linha.realizado - linha.orcado
  const pct = linha.orcado !== 0 ? (desvio / linha.orcado) * 100 : null
  const pctFat = (v: number) => (faturamento > 0 ? formatPct((v / faturamento) * 100) : '—')

  return (
    <>
      {/* Cabeçalho da linha do DRE */}
      <tr
        className={`border-b border-line/70 ${temContas ? 'cursor-pointer hover:bg-cream/60' : ''}`}
        onClick={temContas ? onToggle : undefined}
      >
        <td className="py-2.5 pl-5 pr-4">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            {temContas && (
              <span
                className={`inline-block text-faint transition-transform ${recolhida ? '' : 'rotate-90'}`}
              >
                ▸
              </span>
            )}
            {linha.rotulo}
            {temContas && (
              <span className="text-[11px] font-normal text-faint">({linha.contas.length})</span>
            )}
            {fonteLinha && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  fonteLinha === 'enoki'
                    ? 'bg-green/10 text-green-deep'
                    : 'bg-cream-2 text-muted'
                }`}
                title={
                  fonteLinha === 'enoki'
                    ? 'Esta linha vem da API da Enoki'
                    : 'Esta linha vem da planilha da DRE gerencial'
                }
              >
                {fonteLinha}
              </span>
            )}
          </span>
        </td>
        <td className="py-2.5 px-4 text-right font-medium tabular-nums text-ink">
          {formatBRL(linha.realizado)}
        </td>
        <td className="py-2.5 px-3 text-right tabular-nums text-faint">{pctFat(linha.realizado)}</td>
        {temOrcamento && (
          <td className="py-2.5 px-4 text-right tabular-nums text-muted">
            {linha.orcado ? formatBRL(linha.orcado) : '—'}
          </td>
        )}
        {temOrcamento && (
          <td className={`py-2.5 pr-5 pl-4 text-right tabular-nums ${corDesvio(linha.sinal, desvio)}`}>
            {linha.orcado ? (
              <>
                {formatBRL(desvio)}
                {pct != null && <span className="ml-1 text-[11px] opacity-70">({formatPct(pct)})</span>}
              </>
            ) : (
              '—'
            )}
          </td>
        )}
      </tr>

      {/* Contas da linha */}
      {!recolhida &&
        linha.contas.map((c) => {
          const d = c.realizado - c.orcado
          return (
            <tr key={c.conta} className="animate-fade border-b border-line/40 bg-cream/30">
              <td className="py-1.5 pl-11 pr-4">
                <span className="font-mono text-xs text-muted">{c.conta}</span>
                {nomeConta(c.conta, c.descricao) && (
                  <span className="ml-2 text-xs text-faint">{nomeConta(c.conta, c.descricao)}</span>
                )}
              </td>
              <td className="py-1.5 px-4 text-right text-xs tabular-nums text-muted">
                {formatBRL(c.realizado)}
              </td>
              <td className="py-1.5 px-3 text-right text-xs tabular-nums text-faint">{pctFat(c.realizado)}</td>
              {temOrcamento && (
                <td className="py-1.5 px-4 text-right text-xs tabular-nums text-faint">
                  {c.orcado ? formatBRL(c.orcado) : '—'}
                </td>
              )}
              {temOrcamento && (
                <td className={`py-1.5 pr-5 pl-4 text-right text-xs tabular-nums ${corDesvio(linha.sinal, d)}`}>
                  {c.orcado ? formatBRL(d) : '—'}
                </td>
              )}
            </tr>
          )
        })}

      {/* Subtotais após esta linha */}
      {subtotais?.map((s) => {
        const r = dreRealizado[s.chave]
        const o = dreOrcado[s.chave]
        return (
          <tr
            key={s.chave}
            className={s.forte ? 'bg-green/8 border-y-2 border-green/30' : 'bg-cream/70 border-b border-line'}
          >
            <td
              className={`py-2 pl-5 pr-4 font-head font-semibold uppercase tracking-wide ${
                s.forte ? 'text-green' : 'text-ink'
              }`}
            >
              = {s.rotulo}
            </td>
            <td
              className={`py-2 px-4 text-right font-semibold tabular-nums ${s.forte ? 'text-green' : 'text-ink'}`}
            >
              {formatBRL(r)}
            </td>
            <td className={`py-2 px-3 text-right tabular-nums ${s.forte ? 'text-green/80' : 'text-faint'}`}>
              {pctFat(r)}
            </td>
            {temOrcamento && (
              <td className="py-2 px-4 text-right font-medium tabular-nums text-muted">
                {formatBRL(o)}
              </td>
            )}
            {temOrcamento && (
              <td className="py-2 pr-5 pl-4 text-right font-medium tabular-nums text-muted">
                {formatBRL(r - o)}
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
}
