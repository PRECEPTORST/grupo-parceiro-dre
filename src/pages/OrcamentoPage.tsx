import { Fragment, useMemo, useState, type ChangeEvent } from 'react'
import { useDre } from '../context/DreContext'
import { useAuth } from '../context/AuthContext'
import { podeEditarOrcamento, podeAprovarOrcamento } from '../lib/permissoes'
import { Botao, Card, Kicker, NumInput, Select, TextInput } from '../components/ui'
import { formatBRL } from '../lib/format'
import {
  META_LINHAS,
  orcamentoAprovado,
  impostosPadrao,
  type Orcamento,
  type OrigemOrcamento,
  type StatusOrcamento,
  type RegraImposto,
  type BaseImposto,
} from '../lib/tipos'
import { competenciasDisponiveis } from '../lib/dre'
import { catalogoPorLinha, mapaEfetivo, nomeConta } from '../lib/planoContas'
import { parsePlanilha, type ContaConhecida, type ResultadoImport } from '../lib/importar'
import {
  PERIODICIDADES,
  ROTULO_PERIODICIDADE,
  mesesDoPeriodo,
  periodosDoAno,
  indiceDoMes,
  distribuirSazonal,
  contasReceitaGrao,
  contaCustoDaReceita,
  contasCustoGrao,
  valorReceita,
  valorCusto,
  precoCompraSaca,
  valorImposto,
  rotuloMesCurto,
  type Periodicidade,
} from '../lib/orcamento'

type ValsPorMes = Record<string, Record<string, number>>

/** Mantém só valores diferentes de zero — base da comparação "sujo/salvo". */
function limpo(v: Record<string, number>): Record<string, number> {
  const o: Record<string, number> = {}
  for (const [k, x] of Object.entries(v)) if (x !== 0) o[k] = x
  return o
}
/** Assinatura canônica de um conjunto de valores (independe de ordem). */
function canon(v: Record<string, number>): string {
  return JSON.stringify(Object.entries(limpo(v)).sort(([a], [b]) => a.localeCompare(b)))
}

export function OrcamentoPage() {
  const { estado, salvarOrcamento, salvarImpostos } = useDre()
  const { usuario } = useAuth()
  const podeEditar = podeEditarOrcamento(usuario?.papel)
  const podeAprovar = podeAprovarOrcamento(usuario?.papel)

  const competenciaComDados = useMemo(() => {
    const comDados = [
      ...competenciasDisponiveis(estado.lancamentos),
      ...estado.orcamentos.map((o) => o.competencia),
    ].sort()
    return comDados.length ? comDados[comDados.length - 1] : new Date().toISOString().slice(0, 7)
  }, [estado.lancamentos, estado.orcamentos])

  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal')
  const [ano, setAno] = useState(() => Number(competenciaComDados.slice(0, 4)))
  const [indice, setIndice] = useState(() => Number(competenciaComDados.slice(5, 7)) - 1)

  const meses = useMemo(() => mesesDoPeriodo(periodicidade, ano, indice), [periodicidade, ano, indice])
  const multi = periodicidade !== 'mensal'

  const anos = useMemo(() => {
    const set = new Set<number>()
    const atual = new Date().getFullYear()
    set.add(atual)
    set.add(atual + 1)
    set.add(Number(competenciaComDados.slice(0, 4)))
    for (const o of estado.orcamentos) set.add(Number(o.competencia.slice(0, 4)))
    for (const c of competenciasDisponiveis(estado.lancamentos)) set.add(Number(c.slice(0, 4)))
    return [...set].sort((a, b) => b - a)
  }, [estado.orcamentos, estado.lancamentos, competenciaComDados])

  const opcoesPeriodo = useMemo(() => periodosDoAno(periodicidade, ano), [periodicidade, ano])

  const mapa = useMemo(() => mapaEfetivo(estado.classificacoes), [estado.classificacoes])
  const grupos = useMemo(() => catalogoPorLinha(estado.lancamentos, mapa), [estado.lancamentos, mapa])

  // Receita de grão é orçada por sacas × preço, e o CUSTO (aquisição) é derivado
  // pela margem/saca (preço de compra = venda − margem). Ambas as contas — receita
  // (3.1.0x) e custo (4.1.0x) — saem do editor de valor para não haver dupla entrada.
  const contasGrao = useMemo(() => contasReceitaGrao(mapa), [mapa])
  const custoDeReceita = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of contasGrao) {
      const cc = contaCustoDaReceita(c, mapa)
      if (cc) m[c] = cc
    }
    return m
  }, [contasGrao, mapa])
  const contasGraoSet = useMemo(
    () => new Set<string>([...contasGrao, ...contasCustoGrao(mapa)]),
    [contasGrao, mapa],
  )
  const contasGraoInfo = useMemo(
    () => contasGrao.map((c) => ({ conta: c, descricao: nomeConta(c) })),
    [contasGrao],
  )

  // Tributos automáticos: cálculo de REFERÊNCIA no Orçamento (% de venda/compra).
  // NÃO entra no orçamento salvo nem no DRE — os tributos do DRE vêm do Enoki.
  // As contas de regra ATIVA aparecem só na seção de estimativa (fora do editor
  // manual, sem dupla entrada) e não são persistidas.
  const regras = useMemo(() => estado.impostos ?? impostosPadrao(), [estado.impostos])
  const regrasAtivas = useMemo(() => regras.filter((r) => r.ativo), [regras])
  const contasImpostoAtivas = useMemo(() => new Set(regrasAtivas.map((r) => r.conta)), [regrasAtivas])

  // Contas fora do editor manual: grão (seção própria) + impostos ativos (estimativa).
  const contasForaDoEditor = useMemo(
    () => new Set<string>([...contasGraoSet, ...contasImpostoAtivas]),
    [contasGraoSet, contasImpostoAtivas],
  )

  const gruposValor = grupos
    .map((g) => ({ ...g, contas: g.contas.filter((c) => !contasForaDoEditor.has(c.conta)) }))
    .filter((g) => g.contas.length > 0)
  const semContas = gruposValor.length === 0 && contasGrao.length === 0

  const contasConhecidas = useMemo<ContaConhecida[]>(
    () =>
      grupos.flatMap((g) => g.contas.map((c) => ({ conta: c.conta, descricao: c.descricao }))),
    [grupos],
  )
  const [importarAberto, setImportarAberto] = useState(false)
  const [impostosAberto, setImpostosAberto] = useState(false)

  const salvoDoMes = (m: string) => estado.orcamentos.find((o) => o.competencia === m) ?? null
  const carregar = (ms: string[]) => {
    const vals: ValsPorMes = {}
    const sacas: ValsPorMes = {}
    const precos: ValsPorMes = {}
    const margens: ValsPorMes = {}
    for (const m of ms) {
      const o = salvoDoMes(m)
      // vals guarda TODAS as contas (inclusive o valor legado das contas de grão,
      // p/ não perder orçamentos antigos que gravavam a receita/custo de grão só por valor).
      vals[m] = { ...(o?.valores ?? {}) }
      sacas[m] = { ...(o?.sacas ?? {}) }
      precos[m] = { ...(o?.precoSaca ?? {}) }
      margens[m] = { ...(o?.margemSaca ?? {}) }
    }
    return { vals, sacas, precos, margens }
  }

  const inicial = useMemo(() => carregar(meses), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [vals, setVals] = useState<ValsPorMes>(inicial.vals)
  const [sacas, setSacas] = useState<ValsPorMes>(inicial.sacas)
  const [precos, setPrecos] = useState<ValsPorMes>(inicial.precos)
  const [margens, setMargens] = useState<ValsPorMes>(inicial.margens)
  const [origem, setOrigem] = useState<OrigemOrcamento>(() => salvoDoMes(meses[0])?.origem ?? 'manual')
  const [sugerindo, setSugerindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Recarrega ao trocar de período (periodicidade/ano/índice).
  const chave = `${periodicidade}|${ano}|${indice}`
  const [ultimaChave, setUltimaChave] = useState(chave)
  if (ultimaChave !== chave) {
    setUltimaChave(chave)
    const c = carregar(meses)
    setVals(c.vals)
    setSacas(c.sacas)
    setPrecos(c.precos)
    setMargens(c.margens)
    setOrigem(meses.map(salvoDoMes).find(Boolean)?.origem ?? 'manual')
  }

  // Acessores de valor (contas não-grão).
  const getV = (m: string, conta: string) => vals[m]?.[conta] ?? 0
  const setV = (m: string, conta: string, n: number) =>
    setVals((a) => ({ ...a, [m]: { ...a[m], [conta]: n } }))
  const totalConta = (conta: string) => meses.reduce((s, m) => s + getV(m, conta), 0)
  const setTotalConta = (conta: string, total: number) => {
    const dist = distribuirSazonal(total, meses, estado.lancamentos, conta)
    setVals((a) => {
      const next = { ...a }
      for (const m of meses) next[m] = { ...next[m], [conta]: dist[m] }
      return next
    })
  }

  // Acessores de receita de grão (sacas × preço → valor; margem → preço de compra → custo).
  const getSaca = (m: string, conta: string) => sacas[m]?.[conta] ?? 0
  const getPreco = (m: string, conta: string) => precos[m]?.[conta] ?? 0
  const getMargem = (m: string, conta: string) => margens[m]?.[conta] ?? 0
  const setSaca = (m: string, conta: string, n: number) =>
    setSacas((a) => ({ ...a, [m]: { ...a[m], [conta]: n } }))
  const setPreco = (m: string, conta: string, n: number) =>
    setPrecos((a) => ({ ...a, [m]: { ...a[m], [conta]: n } }))
  const setMargem = (m: string, conta: string, n: number) =>
    setMargens((a) => ({ ...a, [m]: { ...a[m], [conta]: n } }))
  // "Grão ativo" no mês = há sacas, preço OU margem informados → usa o modelo
  // volume × preço. Senão cai no valor LEGADO (orçamento antigo só por valor).
  const graoAtivo = (m: string, conta: string) =>
    !!(getSaca(m, conta) || getPreco(m, conta) || getMargem(m, conta))
  const precoCompra = (m: string, conta: string) =>
    precoCompraSaca(getPreco(m, conta), getMargem(m, conta))
  // Receita da conta de grão (3.1.0x).
  const valorGrao = (m: string, conta: string) =>
    graoAtivo(m, conta)
      ? valorReceita(getSaca(m, conta), getPreco(m, conta))
      : (vals[m]?.[conta] ?? 0)
  // Custo de aquisição (conta de custo 4.1.0x) = sacas × preço de compra.
  const custoGrao = (m: string, conta: string) => {
    const cc = custoDeReceita[conta]
    return graoAtivo(m, conta)
      ? valorCusto(getSaca(m, conta), getPreco(m, conta), getMargem(m, conta))
      : (cc ? (vals[m]?.[cc] ?? 0) : 0)
  }
  const totalSacas = (conta: string) => meses.reduce((s, m) => s + getSaca(m, conta), 0)
  const totalValorGrao = (conta: string) => meses.reduce((s, m) => s + valorGrao(m, conta), 0)
  const totalCustoGrao = (conta: string) => meses.reduce((s, m) => s + custoGrao(m, conta), 0)
  const setTotalSacas = (conta: string, total: number) => {
    const dist = distribuirSazonal(total, meses, estado.lancamentos, conta)
    setSacas((a) => {
      const next = { ...a }
      for (const m of meses) next[m] = { ...next[m], [conta]: dist[m] }
      return next
    })
  }

  const trocarPeriodicidade = (p: Periodicidade) => {
    const primeiroMesAtual = Number(meses[0].slice(5, 7))
    setPeriodicidade(p)
    setIndice(indiceDoMes(p, primeiroMesAtual))
  }

  // Bases dos tributos por mês (só p/ o cálculo de REFERÊNCIA dos impostos —
  // não é persistido). Venda = TODA a receita orçada EXCETO financeira (receita de
  // grão + demais contas de receita_bruta/outras_receitas_operacionais);
  // compra = aquisição de grão; margem = venda − compra.
  const vendaBase = (m: string): number => {
    let base = contasGrao.reduce((s, c) => s + valorGrao(m, c), 0)
    for (const conta of Object.keys(vals[m] ?? {})) {
      if (contasGraoSet.has(conta)) continue
      const linha = mapa[conta]
      if (linha === 'receita_bruta' || linha === 'outras_receitas_operacionais') base += getV(m, conta)
    }
    return base
  }
  const compraBase = (m: string): number => contasGrao.reduce((s, c) => s + custoGrao(m, c), 0)
  const basesDoMes = (m: string): Record<BaseImposto, number> => {
    const venda = vendaBase(m)
    const compra = compraBase(m)
    return { venda, compra, margem: venda - compra }
  }

  // Valores efetivos de um mês: contas de valor + receita de grão (3.1.0x) e
  // custo de aquisição (4.1.0x) derivados de sacas/preço/margem. Os impostos
  // automáticos NÃO entram aqui (são só referência no Orçamento, não no DRE).
  const valoresDoMes = (m: string): Record<string, number> => {
    const out = { ...limpo(vals[m] ?? {}) }
    const set = (conta: string, v: number) => {
      if (v !== 0) out[conta] = v
      else delete out[conta]
    }
    for (const c of contasGrao) {
      set(c, valorGrao(m, c))
      const cc = custoDeReceita[c]
      if (cc) set(cc, custoGrao(m, c))
    }
    // Contas de imposto ativas não são persistidas (só estimativa) — inclui limpar
    // valor legado que orçamentos antigos tenham gravado nessas contas.
    for (const c of contasImpostoAtivas) delete out[c]
    return out
  }
  // Remove as contas de imposto ativas de um mapa (p/ comparar salvo × atual na
  // mesma base — elas não fazem parte do orçamento persistido).
  const semImpostos = (v: Record<string, number>): Record<string, number> => {
    const o = { ...v }
    for (const c of contasImpostoAtivas) delete o[c]
    return o
  }

  // Situação agregada do período.
  const salvosDoPeriodo = meses.map(salvoDoMes).filter(Boolean) as Orcamento[]
  const temAlgum = salvosDoPeriodo.length > 0
  const alterado = meses.some(
    (m) =>
      canon(valoresDoMes(m)) !== canon(semImpostos(salvoDoMes(m)?.valores ?? {})) ||
      canon(sacas[m] ?? {}) !== canon(salvoDoMes(m)?.sacas ?? {}) ||
      canon(precos[m] ?? {}) !== canon(salvoDoMes(m)?.precoSaca ?? {}) ||
      canon(margens[m] ?? {}) !== canon(salvoDoMes(m)?.margemSaca ?? {}),
  )
  const todosAprovados = temAlgum && salvosDoPeriodo.every((o) => orcamentoAprovado(o))
  const aprovado = todosAprovados && !alterado

  const persistir = (status: StatusOrcamento) => {
    const agora = new Date().toISOString()
    for (const m of meses) {
      const valores = valoresDoMes(m)
      const sc = limpo(sacas[m] ?? {})
      const pr = limpo(precos[m] ?? {})
      const mg = limpo(margens[m] ?? {})
      const vazio =
        !Object.keys(valores).length &&
        !Object.keys(sc).length &&
        !Object.keys(pr).length &&
        !Object.keys(mg).length
      if (vazio && !salvoDoMes(m)) continue
      salvarOrcamento({
        competencia: m,
        valores,
        sacas: sc,
        precoSaca: pr,
        margemSaca: mg,
        origem,
        atualizadoEm: agora,
        status,
        ...(status === 'aprovado'
          ? { aprovadoPor: usuario?.usuario, aprovadoEm: agora }
          : { aprovadoPor: undefined, aprovadoEm: undefined }),
      })
    }
  }
  const salvar = () => persistir('rascunho')
  const aprovar = () => persistir('aprovado')

  // Sugestão da IA: valor MENSAL por conta, aplicado a cada mês. Só contas de
  // valor — a receita de grão é planejada por volume × preço na seção própria.
  const sugerir = async () => {
    setSugerindo(true)
    setErro(null)
    try {
      const resp = await fetch('/api/sugerir-orcamento', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          competencia: meses[0],
          historicoLancamentos: estado.lancamentos,
          classificacoes: estado.classificacoes,
        }),
      })
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}))
        throw new Error(d?.erro || `Erro ${resp.status}`)
      }
      const d = await resp.json()
      const sugeridos = (d.valores ?? {}) as Record<string, number>
      setVals((a) => {
        const next = { ...a }
        for (const m of meses) {
          next[m] = { ...next[m] }
          for (const [conta, v] of Object.entries(sugeridos)) {
            if (!contasForaDoEditor.has(conta)) next[m][conta] = v
          }
        }
        return next
      })
      setOrigem('sugerido')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSugerindo(false)
    }
  }

  // Import: totais do período por conta, distribuídos pela sazonalidade. Só
  // contas de valor (receita de grão fica na seção volume × preço).
  const aplicarImportacao = (importados: Record<string, number>, origemImport: OrigemOrcamento) => {
    setVals((a) => {
      const next = { ...a }
      for (const m of meses) next[m] = { ...next[m] }
      for (const [conta, total] of Object.entries(importados)) {
        if (contasForaDoEditor.has(conta)) continue
        const dist = distribuirSazonal(total, meses, estado.lancamentos, conta)
        for (const m of meses) next[m][conta] = dist[m]
      }
      return next
    })
    setOrigem(origemImport)
    setImportarAberto(false)
  }

  const totalPeriodo =
    gruposValor.reduce((s, g) => s + g.contas.reduce((sc, c) => sc + totalConta(c.conta), 0), 0) +
    contasGrao.reduce((s, c) => s + totalValorGrao(c) + totalCustoGrao(c), 0)

  return (
    <div className={`mx-auto px-6 py-8 ${multi ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <Kicker>Planejamento orçamentário</Kicker>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
            Orçamento por <span className="text-green">conta</span>
          </h1>
          <div className="mt-2">
            <BadgeStatus
              temAlgum={temAlgum}
              alterado={alterado}
              aprovado={todosAprovados}
              aprovadoPor={salvosDoPeriodo[0]?.aprovadoPor}
              aprovadoEm={salvosDoPeriodo[0]?.aprovadoEm}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <span className="mb-1 block text-xs font-medium text-muted">Periodicidade</span>
            <Select
              value={periodicidade}
              onChange={(v) => trocarPeriodicidade(v as Periodicidade)}
              options={PERIODICIDADES.map((p) => ({ value: p, label: ROTULO_PERIODICIDADE[p] }))}
            />
          </div>
          <div className="w-24">
            <span className="mb-1 block text-xs font-medium text-muted">Ano</span>
            <Select
              value={String(ano)}
              onChange={(v) => setAno(Number(v))}
              options={anos.map((a) => ({ value: String(a), label: String(a) }))}
            />
          </div>
          {periodicidade !== 'anual' && (
            <div className="w-44">
              <span className="mb-1 block text-xs font-medium text-muted">
                {periodicidade === 'mensal' ? 'Mês' : 'Período'}
              </span>
              <Select
                value={String(indice)}
                onChange={(v) => setIndice(Number(v))}
                options={opcoesPeriodo.map((p) => ({ value: String(p.indice), label: p.rotulo }))}
              />
            </div>
          )}
        </div>
      </div>

      <Card className="mb-4 animate-rise">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm text-muted">
            {podeEditar
              ? 'Grãos: sacas × preço/saca = receita; a margem bruta/saca define o preço de compra (venda − margem) e o custo de aquisição. As demais contas, por valor.'
              : 'Você tem acesso somente de consulta — o orçamento é exibido, mas não pode ser alterado.'}
          </p>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <Botao variante="fantasma" onClick={() => setImpostosAberto(true)}>
                ⚙ Alíquotas
              </Botao>
              <Botao variante="fantasma" onClick={() => setImportarAberto(true)} disabled={semContas}>
                ⬆ Importar
              </Botao>
              <Botao variante="fantasma" onClick={sugerir} disabled={sugerindo || semContas}>
                {sugerindo ? 'Sugerindo…' : '✨ Sugerir com IA'}
              </Botao>
            </div>
          )}
        </div>

        {erro && <p className="mb-3 text-sm text-danger">{erro}</p>}

        {semContas ? (
          <p className="text-sm text-muted">
            Nenhuma conta classificada ainda. Sincronize e classifique os lançamentos em{' '}
            <strong className="text-ink">Lançamentos</strong> para orçar conta a conta.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {contasGrao.length > 0 && (
              <ReceitaPorGrao
                contas={contasGraoInfo}
                meses={meses}
                getSaca={getSaca}
                setSaca={setSaca}
                getPreco={getPreco}
                setPreco={setPreco}
                getMargem={getMargem}
                setMargem={setMargem}
                precoCompra={precoCompra}
                valorGrao={valorGrao}
                custoGrao={custoGrao}
                totalSacas={totalSacas}
                setTotalSacas={setTotalSacas}
                totalValorGrao={totalValorGrao}
                totalCustoGrao={totalCustoGrao}
                podeEditar={podeEditar}
              />
            )}

            {regrasAtivas.length > 0 && (
              <ImpostosAutomaticos regras={regrasAtivas} meses={meses} basesDoMes={basesDoMes} />
            )}

            {gruposValor.length > 0 &&
              (multi ? (
                <GradeMeses
                  grupos={gruposValor}
                  meses={meses}
                  getV={getV}
                  setV={setV}
                  totalConta={totalConta}
                  setTotalConta={setTotalConta}
                  podeEditar={podeEditar}
                />
              ) : (
                <div className="flex flex-col gap-5">
                  {gruposValor.map((g) => {
                    const total = g.contas.reduce((s, c) => s + getV(meses[0], c.conta), 0)
                    return (
                      <div key={g.linha}>
                        <div className="mb-1.5 flex items-center justify-between border-b border-line pb-1">
                          <span className="font-head text-xs font-semibold uppercase tracking-wider text-green">
                            {META_LINHAS[g.linha].rotulo}
                          </span>
                          <span className="text-xs font-semibold tabular-nums text-ink">{formatBRL(total)}</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {g.contas.map((c) => (
                            <div key={c.conta} className="grid grid-cols-[1fr_160px] items-center gap-3">
                              <span className="truncate text-sm text-muted">
                                <span className="font-mono text-xs text-faint">{c.conta}</span>
                                {c.descricao && ` · ${c.descricao}`}
                              </span>
                              <NumInput
                                value={getV(meses[0], c.conta)}
                                onChange={(v) => setV(meses[0], c.conta, v ?? 0)}
                                min={0}
                                disabled={!podeEditar}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
          </div>
        )}

        {podeEditar && !semContas && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Botao onClick={salvar} disabled={!alterado && temAlgum}>
              Salvar rascunho
            </Botao>
            {podeAprovar && (
              <Botao variante="fantasma" onClick={aprovar} disabled={aprovado}>
                {aprovado ? '✓ Aprovado' : '✓ Aprovar orçamento'}
              </Botao>
            )}
            <span className="ml-auto text-xs font-semibold tabular-nums text-ink">
              Total do período: {formatBRL(totalPeriodo)}
            </span>
          </div>
        )}
        {podeEditar && !semContas && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 text-[11px] text-faint">
            <span>Origem: {origem}</span>
            {temAlgum && (
              <span>
                · salvo em{' '}
                {new Date(
                  salvosDoPeriodo.reduce((a, o) => (o.atualizadoEm > a ? o.atualizadoEm : a), ''),
                ).toLocaleDateString('pt-BR')}
              </span>
            )}
            {!podeAprovar && (
              <span>· só passa a valer como oficial após a aprovação de um <strong>sócio</strong>.</span>
            )}
          </div>
        )}
      </Card>

      <p className="text-xs text-faint">
        Valores em reais, magnitude positiva. O orçamento é sempre guardado mês a mês — a periodicidade
        é só a lente de edição. Grãos: sacas × preço = receita e sacas × (preço − margem) = custo de
        aquisição — ambos entram no DRE (receita − custo = margem bruta orçada).
      </p>

      {importarAberto && (
        <ModalImportar
          contas={contasConhecidas}
          multi={multi}
          onAplicar={aplicarImportacao}
          onFechar={() => setImportarAberto(false)}
        />
      )}

      {impostosAberto && (
        <ModalImpostos
          regras={regras}
          onSalvar={(rs) => {
            salvarImpostos(rs)
            setImpostosAberto(false)
          }}
          onFechar={() => setImpostosAberto(false)}
        />
      )}
    </div>
  )
}

interface GrupoLinha {
  linha: keyof typeof META_LINHAS
  contas: { conta: string; descricao: string }[]
}

function ReceitaPorGrao({
  contas,
  meses,
  getSaca,
  setSaca,
  getPreco,
  setPreco,
  getMargem,
  setMargem,
  precoCompra,
  valorGrao,
  custoGrao,
  totalSacas,
  setTotalSacas,
  totalValorGrao,
  totalCustoGrao,
  podeEditar,
}: {
  contas: { conta: string; descricao: string }[]
  meses: string[]
  getSaca: (m: string, conta: string) => number
  setSaca: (m: string, conta: string, n: number) => void
  getPreco: (m: string, conta: string) => number
  setPreco: (m: string, conta: string, n: number) => void
  getMargem: (m: string, conta: string) => number
  setMargem: (m: string, conta: string, n: number) => void
  precoCompra: (m: string, conta: string) => number
  valorGrao: (m: string, conta: string) => number
  custoGrao: (m: string, conta: string) => number
  totalSacas: (conta: string) => number
  setTotalSacas: (conta: string, total: number) => void
  totalValorGrao: (conta: string) => number
  totalCustoGrao: (conta: string) => number
  podeEditar: boolean
}) {
  const totalGeral = contas.reduce((s, c) => s + totalValorGrao(c.conta), 0)
  const brlSaca = (v: number) => (v > 0 ? `~${formatBRL(v)}` : '—')
  return (
    <div>
      <div className="mb-2 flex items-center justify-between border-b border-line pb-1">
        <span className="font-head text-xs font-semibold uppercase tracking-wider text-green">
          Receita e custo por grão · sacas × preço × margem
        </span>
        <span className="text-xs font-semibold tabular-nums text-ink">{formatBRL(totalGeral)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-faint">
              <th className="sticky left-0 z-10 bg-surface py-2 pr-3 text-left font-semibold">Grão</th>
              {meses.map((m) => (
                <th key={m} className="min-w-[92px] px-1.5 py-2 text-right font-semibold">
                  {rotuloMesCurto(m)}
                </th>
              ))}
              <th className="min-w-[110px] px-1.5 py-2 text-right font-semibold text-green">Total</th>
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => {
              const tSacas = totalSacas(c.conta)
              const tValor = totalValorGrao(c.conta)
              const tCusto = totalCustoGrao(c.conta)
              const tMargem = tValor - tCusto
              const precoVendaMedio = tSacas > 0 ? tValor / tSacas : 0
              const margemMedia = tSacas > 0 ? tMargem / tSacas : 0
              const precoCompraMedio = tSacas > 0 ? tCusto / tSacas : 0
              return (
                <Fragment key={c.conta}>
                  <tr>
                    <td
                      colSpan={meses.length + 2}
                      className="sticky left-0 bg-cream/40 py-1.5 pl-0.5 pr-2 font-head text-xs font-semibold text-ink"
                    >
                      <span className="font-mono text-faint">{c.conta}</span>
                      {c.descricao && ` · ${c.descricao}`}
                    </td>
                  </tr>
                  <tr className="hover:bg-cream/30">
                    <td className="sticky left-0 z-10 bg-surface py-1 pl-3 pr-3 text-muted">Sacas</td>
                    {meses.map((m) => (
                      <td key={m} className="px-1 py-1">
                        <NumInput value={getSaca(m, c.conta)} onChange={(v) => setSaca(m, c.conta, v ?? 0)} min={0} disabled={!podeEditar} />
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      <NumInput value={tSacas} onChange={(v) => setTotalSacas(c.conta, v ?? 0)} min={0} disabled={!podeEditar} />
                    </td>
                  </tr>
                  <tr className="hover:bg-cream/30">
                    <td className="sticky left-0 z-10 bg-surface py-1 pl-3 pr-3 text-muted">Preço venda R$/saca</td>
                    {meses.map((m) => (
                      <td key={m} className="px-1 py-1">
                        <NumInput value={getPreco(m, c.conta)} onChange={(v) => setPreco(m, c.conta, v ?? 0)} min={0} disabled={!podeEditar} />
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-right text-xs tabular-nums text-muted" title="Preço de venda médio ponderado">
                      {brlSaca(precoVendaMedio)}
                    </td>
                  </tr>
                  <tr className="hover:bg-cream/30">
                    <td className="sticky left-0 z-10 bg-surface py-1 pl-3 pr-3 text-muted">Margem bruta R$/saca</td>
                    {meses.map((m) => (
                      <td key={m} className="px-1 py-1">
                        <NumInput value={getMargem(m, c.conta)} onChange={(v) => setMargem(m, c.conta, v ?? 0)} disabled={!podeEditar} />
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-right text-xs tabular-nums text-muted" title="Margem média ponderada">
                      {tSacas > 0 ? `~${formatBRL(margemMedia)}` : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 bg-surface py-1 pl-3 pr-3 text-[11px] uppercase tracking-wide text-faint">
                      Preço compra R$/saca
                    </td>
                    {meses.map((m) => (
                      <td key={m} className="px-1.5 py-1 text-right text-xs tabular-nums text-muted">
                        {getSaca(m, c.conta) || getPreco(m, c.conta) || getMargem(m, c.conta)
                          ? formatBRL(precoCompra(m, c.conta))
                          : '—'}
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-right text-xs tabular-nums text-muted">
                      {brlSaca(precoCompraMedio)}
                    </td>
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 bg-surface py-1 pl-3 pr-3 text-[11px] font-semibold uppercase tracking-wide text-green">
                      = Receita
                    </td>
                    {meses.map((m) => (
                      <td key={m} className="px-1.5 py-1 text-right text-xs font-semibold tabular-nums text-ink">
                        {formatBRL(valorGrao(m, c.conta))}
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-right text-xs font-semibold tabular-nums text-green">
                      {formatBRL(tValor)}
                    </td>
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 bg-surface py-1 pl-3 pr-3 text-[11px] uppercase tracking-wide text-faint">
                      (−) Custo aquisição
                    </td>
                    {meses.map((m) => (
                      <td key={m} className="px-1.5 py-1 text-right text-xs tabular-nums text-muted">
                        {formatBRL(custoGrao(m, c.conta))}
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-right text-xs tabular-nums text-muted">{formatBRL(tCusto)}</td>
                  </tr>
                  <tr className="border-b border-line/60">
                    <td className="sticky left-0 z-10 bg-surface py-1 pl-3 pr-3 text-[11px] font-semibold uppercase tracking-wide text-green">
                      = Margem bruta
                    </td>
                    {meses.map((m) => (
                      <td key={m} className="px-1.5 py-1 text-right text-xs font-semibold tabular-nums text-ink">
                        {formatBRL(valorGrao(m, c.conta) - custoGrao(m, c.conta))}
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-right text-xs font-semibold tabular-nums text-green">
                      {formatBRL(tMargem)}
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GradeMeses({
  grupos,
  meses,
  getV,
  setV,
  totalConta,
  setTotalConta,
  podeEditar,
}: {
  grupos: GrupoLinha[]
  meses: string[]
  getV: (m: string, conta: string) => number
  setV: (m: string, conta: string, n: number) => void
  totalConta: (conta: string) => number
  setTotalConta: (conta: string, total: number) => void
  podeEditar: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-faint">
            <th className="sticky left-0 z-10 bg-surface py-2 pr-3 text-left font-semibold">Conta</th>
            {meses.map((m) => (
              <th key={m} className="min-w-[92px] px-1.5 py-2 text-right font-semibold">
                {rotuloMesCurto(m)}
              </th>
            ))}
            <th className="min-w-[110px] px-1.5 py-2 text-right font-semibold text-green">
              Total período
            </th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const totalLinha = g.contas.reduce((s, c) => s + totalConta(c.conta), 0)
            return (
              <Fragment key={g.linha}>
                <tr>
                  <td
                    colSpan={meses.length + 1}
                    className="sticky left-0 bg-cream/40 py-1.5 pl-0.5 pr-2 font-head text-xs font-semibold uppercase tracking-wider text-green"
                  >
                    {META_LINHAS[g.linha].rotulo}
                  </td>
                  <td className="bg-cream/40 px-1.5 py-1.5 text-right text-xs font-semibold tabular-nums text-ink">
                    {formatBRL(totalLinha)}
                  </td>
                </tr>
                {g.contas.map((c) => (
                  <tr key={c.conta} className="hover:bg-cream/30">
                    <td className="sticky left-0 z-10 max-w-[220px] truncate bg-surface py-1 pr-3 text-muted">
                      <span className="font-mono text-xs text-faint">{c.conta}</span>
                      {c.descricao && ` · ${c.descricao}`}
                    </td>
                    {meses.map((m) => (
                      <td key={m} className="px-1 py-1">
                        <NumInput
                          value={getV(m, c.conta)}
                          onChange={(v) => setV(m, c.conta, v ?? 0)}
                          min={0}
                          disabled={!podeEditar}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      <NumInput
                        value={totalConta(c.conta)}
                        onChange={(v) => setTotalConta(c.conta, v ?? 0)}
                        min={0}
                        disabled={!podeEditar}
                      />
                    </td>
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const ROTULO_BASE: Record<BaseImposto, string> = { venda: 'venda', compra: 'compra', margem: 'margem' }

function ImpostosAutomaticos({
  regras,
  meses,
  basesDoMes,
}: {
  regras: RegraImposto[]
  meses: string[]
  basesDoMes: (m: string) => Record<BaseImposto, number>
}) {
  const valorRegra = (r: RegraImposto, m: string) => valorImposto(basesDoMes(m)[r.base], r.aliquota)
  const totalRegra = (r: RegraImposto) => meses.reduce((s, m) => s + valorRegra(r, m), 0)
  const totalGeral = regras.reduce((s, r) => s + totalRegra(r), 0)
  return (
    <div>
      <div className="mb-2 flex items-center justify-between border-b border-line pb-1">
        <span className="font-head text-xs font-semibold uppercase tracking-wider text-green">
          Impostos automáticos · % sobre venda / compra
        </span>
        <span className="text-xs font-semibold tabular-nums text-ink">{formatBRL(totalGeral)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-faint">
              <th className="sticky left-0 z-10 bg-surface py-2 pr-3 text-left font-semibold">Tributo</th>
              {meses.map((m) => (
                <th key={m} className="min-w-[92px] px-1.5 py-2 text-right font-semibold">
                  {rotuloMesCurto(m)}
                </th>
              ))}
              <th className="min-w-[110px] px-1.5 py-2 text-right font-semibold text-green">Total</th>
            </tr>
          </thead>
          <tbody>
            {regras.map((r) => (
              <tr key={r.id} className="border-b border-line/50 hover:bg-cream/30">
                <td className="sticky left-0 z-10 bg-surface py-1.5 pr-3">
                  <span className="text-ink">{r.nome}</span>
                  <span className="ml-1 text-[11px] text-faint">
                    · {r.aliquota}% da {ROTULO_BASE[r.base]} · {r.conta}
                  </span>
                </td>
                {meses.map((m) => (
                  <td key={m} className="px-1.5 py-1.5 text-right text-xs tabular-nums text-ink">
                    {formatBRL(valorRegra(r, m))}
                  </td>
                ))}
                <td className="px-1.5 py-1.5 text-right text-xs font-semibold tabular-nums text-green">
                  {formatBRL(totalRegra(r))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-faint">
        Estimativa de referência a partir do orçamento — <strong>não entra no orçamento salvo nem no
        DRE</strong> (os tributos realizados vêm do Enoki). Ajuste as alíquotas em “⚙ Alíquotas”.
      </p>
    </div>
  )
}

function ModalImpostos({
  regras,
  onSalvar,
  onFechar,
}: {
  regras: RegraImposto[]
  onSalvar: (regras: RegraImposto[]) => void
  onFechar: () => void
}) {
  const [rs, setRs] = useState<RegraImposto[]>(() => regras.map((r) => ({ ...r })))
  const set = (i: number, patch: Partial<RegraImposto>) =>
    setRs((a) => a.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const remover = (i: number) => setRs((a) => a.filter((_, j) => j !== i))
  const adicionar = () =>
    setRs((a) => [
      ...a,
      { id: crypto.randomUUID(), nome: 'Novo tributo', conta: '', base: 'venda', aliquota: 0, ativo: true },
    ])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 animate-fade" onClick={onFechar}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="font-head text-xs font-semibold uppercase tracking-[0.2em] text-green">Impostos automáticos</div>
            <h3 className="mt-0.5 text-lg font-bold text-ink">Alíquotas dos tributos</h3>
          </div>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-cream hover:text-ink" title="Fechar">
            ✕
          </button>
        </div>

        <p className="mb-4 rounded-lg border border-warn/40 bg-warn/5 p-2.5 text-xs text-gold-deep">
          ⚠️ As alíquotas são um <strong>ponto de partida</strong> típico p/ comércio de grãos — confirme
          com o contador. Variam por regime (Real/Presumido), UF e tipo de operação (diferimento de ICMS,
          suspensão de PIS/COFINS em grão in natura, Funrural na compra de produtor PF).
        </p>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[auto_1fr_70px_110px_78px_auto] items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
            <span>Ativo</span>
            <span>Tributo</span>
            <span>Conta</span>
            <span>Base</span>
            <span className="text-right">Alíquota %</span>
            <span />
          </div>
          {rs.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[auto_1fr_70px_110px_78px_auto] items-center gap-2">
              <input
                type="checkbox"
                checked={r.ativo}
                onChange={(e) => set(i, { ativo: e.target.checked })}
                className="h-4 w-4 accent-green"
              />
              <TextInput value={r.nome} onChange={(v) => set(i, { nome: v })} placeholder="Nome do tributo" />
              <TextInput value={r.conta} onChange={(v) => set(i, { conta: v })} placeholder="3.2.02" />
              <Select
                value={r.base}
                onChange={(v) => set(i, { base: v as BaseImposto })}
                options={[
                  { value: 'venda', label: '% da venda' },
                  { value: 'compra', label: '% da compra' },
                  { value: 'margem', label: '% da margem' },
                ]}
              />
              <NumInput value={r.aliquota} onChange={(v) => set(i, { aliquota: v ?? 0 })} min={0} step={0.01} />
              <button
                onClick={() => remover(i)}
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                title="Remover"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={adicionar}
          className="mt-3 rounded-lg border border-green/40 px-3 py-1.5 text-xs font-semibold text-green transition-colors hover:bg-green/10"
        >
          + Adicionar tributo
        </button>

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-4">
          <button onClick={onFechar} className="text-sm font-medium text-muted hover:text-ink">
            Cancelar
          </button>
          <Botao onClick={() => onSalvar(rs.filter((r) => r.conta.trim()))}>Salvar alíquotas</Botao>
        </div>
      </div>
    </div>
  )
}

function BadgeStatus({
  temAlgum,
  alterado,
  aprovado,
  aprovadoPor,
  aprovadoEm,
}: {
  temAlgum: boolean
  alterado: boolean
  aprovado: boolean
  aprovadoPor?: string
  aprovadoEm?: string
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold'
  if (!temAlgum) return <span className={`${base} bg-cream text-faint`}>Sem orçamento no período</span>
  if (alterado)
    return <span className={`${base} bg-warn/10 text-gold-deep`}>● Rascunho com alterações não salvas</span>
  if (aprovado)
    return (
      <span className={`${base} bg-green/10 text-green`}>
        ✓ Aprovado{aprovadoPor ? ` por ${aprovadoPor}` : ''}
        {aprovadoEm ? ` · ${new Date(aprovadoEm).toLocaleDateString('pt-BR')}` : ''}
      </span>
    )
  return <span className={`${base} bg-warn/10 text-gold-deep`}>⏳ Pendente de aprovação do sócio</span>
}

function ModalImportar({
  contas,
  multi,
  onAplicar,
  onFechar,
}: {
  contas: ContaConhecida[]
  multi: boolean
  onAplicar: (valores: Record<string, number>, origem: OrigemOrcamento) => void
  onFechar: () => void
}) {
  const [modo, setModo] = useState<'planilha' | 'documento'>('planilha')
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState<ResultadoImport | null>(null)
  const [obs, setObs] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const descDe = (conta: string) => contas.find((c) => c.conta === conta)?.descricao ?? ''

  const trocarModo = (m: 'planilha' | 'documento') => {
    setModo(m)
    setPrevia(null)
    setErro(null)
    setObs('')
  }

  const lerArquivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      setTexto(await f.text())
      setPrevia(null)
    } catch {
      setErro('Não consegui ler o arquivo. Use CSV/TXT ou cole as células.')
    }
  }

  const analisarPlanilha = () => {
    setErro(null)
    setObs('')
    const r = parsePlanilha(texto, contas)
    setPrevia(r)
    if (!r.reconhecidas)
      setErro('Nenhuma conta reconhecida. Cada linha precisa ter o código (ou a descrição) da conta e o valor.')
  }

  const extrairDocumento = async () => {
    setCarregando(true)
    setErro(null)
    setObs('')
    setPrevia(null)
    try {
      const resp = await fetch('/api/importar-orcamento', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto, contas }),
      })
      const d = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(d?.erro || `Erro ${resp.status}`)
      const valores = (d.valores ?? {}) as Record<string, number>
      setPrevia({ valores, reconhecidas: Object.keys(valores).length, ignoradas: [] })
      setObs(d.observacoes ?? '')
      if (!Object.keys(valores).length) setErro('A IA não encontrou valores mapeáveis para as contas conhecidas.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }

  const podeAplicar = !!previa && previa.reconhecidas > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 animate-fade" onClick={onFechar}>
      <div
        className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="font-head text-xs font-semibold uppercase tracking-[0.2em] text-green">Importar orçamento</div>
            <h3 className="mt-0.5 text-lg font-bold text-ink">Dar entrada por planilha ou documento</h3>
          </div>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-cream hover:text-ink" title="Fechar">
            ✕
          </button>
        </div>

        <p className="mb-3 rounded-lg border border-green/30 bg-green/5 p-2.5 text-xs text-green-deep">
          Importa <strong>contas de valor</strong>{multi ? ' (tratadas como totais do período, distribuídas pela sazonalidade)' : ''}. A
          receita de grão é planejada por sacas × preço na grade acima.
        </p>

        <div className="mb-4 flex gap-1.5">
          {(['planilha', 'documento'] as const).map((m) => (
            <button
              key={m}
              onClick={() => trocarModo(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                modo === m ? 'bg-green text-white' : 'border border-line text-muted hover:bg-green/10 hover:text-green'
              }`}
            >
              {m === 'planilha' ? 'Planilha / colar' : 'Documento (IA)'}
            </button>
          ))}
        </div>

        {modo === 'planilha' ? (
          <>
            <p className="mb-2 text-sm text-muted">
              Cole as células do Excel (código ou descrição da conta + valor) ou envie um arquivo CSV/TXT.
            </p>
            <label className="mb-2 inline-block cursor-pointer rounded-lg border border-green/40 px-3 py-1.5 text-xs font-semibold text-green transition-colors hover:bg-green/10">
              Escolher arquivo (CSV/TXT)
              <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={lerArquivo} />
            </label>
          </>
        ) : (
          <p className="mb-2 text-sm text-muted">
            Cole o texto do documento (e-mail, PDF, relatório). A IA extrai os valores e mapeia para as
            contas conhecidas — você confere antes de aplicar.
          </p>
        )}

        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setPrevia(null)
          }}
          rows={6}
          placeholder={
            modo === 'planilha'
              ? '3.1.01\t1.500.000\n4.3.01\t90.000\nFolha administrativa\t88.000'
              : 'Ex.: O orçamento de vendas para agosto é de 1,5 milhão; folha administrativa 90 mil…'
          }
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-ink outline-none transition focus:border-green focus:ring-2 focus:ring-green/20"
        />

        <div className="mt-3 flex items-center gap-3">
          {modo === 'planilha' ? (
            <Botao variante="fantasma" onClick={analisarPlanilha} disabled={!texto.trim()}>
              Analisar
            </Botao>
          ) : (
            <Botao variante="fantasma" onClick={extrairDocumento} disabled={!texto.trim() || carregando}>
              {carregando ? 'Extraindo…' : '✨ Extrair com IA'}
            </Botao>
          )}
          {previa && <span className="text-xs text-muted">{previa.reconhecidas} conta(s) reconhecida(s)</span>}
        </div>

        {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

        {previa && previa.reconhecidas > 0 && (
          <div className="mt-4 rounded-lg border border-line bg-cream/40 p-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Prévia</div>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {Object.entries(previa.valores).map(([conta, v]) => (
                <div key={conta} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-ink">
                    <span className="font-mono text-xs text-faint">{conta}</span>
                    {descDe(conta) && ` · ${descDe(conta)}`}
                  </span>
                  <span className="shrink-0 font-head font-semibold tabular-nums text-ink">{formatBRL(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(obs || (previa && previa.ignoradas.length > 0)) && (
          <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 p-3 text-xs text-gold-deep">
            {obs && <p>{obs}</p>}
            {previa && previa.ignoradas.length > 0 && (
              <p>
                {previa.ignoradas.length} linha(s) não reconhecida(s):{' '}
                <span className="text-muted">{previa.ignoradas.slice(0, 3).join(' · ')}{previa.ignoradas.length > 3 ? '…' : ''}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-4">
          <button onClick={onFechar} className="text-sm font-medium text-muted hover:text-ink">
            Cancelar
          </button>
          <Botao onClick={() => podeAplicar && onAplicar(previa!.valores, modo === 'planilha' ? 'planilha' : 'documento')} disabled={!podeAplicar}>
            Aplicar ao orçamento
          </Botao>
        </div>
      </div>
    </div>
  )
}
