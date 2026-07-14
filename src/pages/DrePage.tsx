import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { Card, Kicker, Select } from '../components/ui'
import { formatBRL, formatPct } from '../lib/format'
import {
  montarDre,
  compararComOrcamento,
  mapaDeClassificacoes,
  competenciasDisponiveis,
} from '../lib/dre'

function rotuloCompetencia(comp: string): string {
  const [ano, mes] = comp.split('-')
  const meses = [
    'jan',
    'fev',
    'mar',
    'abr',
    'mai',
    'jun',
    'jul',
    'ago',
    'set',
    'out',
    'nov',
    'dez',
  ]
  return `${meses[Number(mes) - 1] ?? mes}/${ano}`
}

/** Cor do desvio: bom quando receita sobe ou custo/despesa cai. */
function corDesvio(sinal: 1 | -1, desvio: number): string {
  if (desvio === 0) return 'text-slateblue'
  const bom = sinal === 1 ? desvio > 0 : desvio < 0
  return bom ? 'text-ok' : 'text-danger'
}

export function DrePage() {
  const { estado } = useDre()
  const competencias = useMemo(
    () => competenciasDisponiveis(estado.lancamentos),
    [estado.lancamentos],
  )
  const [comp, setComp] = useState<string>(() => competencias[0] ?? new Date().toISOString().slice(0, 7))
  const competencia = competencias.includes(comp) ? comp : (competencias[0] ?? comp)

  const mapa = useMemo(() => mapaDeClassificacoes(estado.classificacoes), [estado.classificacoes])
  const dre = useMemo(
    () => montarDre(competencia, estado.lancamentos, mapa),
    [competencia, estado.lancamentos, mapa],
  )
  const orcamento = estado.orcamentos.find((o) => o.competencia === competencia) ?? null
  const desvios = useMemo(() => compararComOrcamento(dre, orcamento), [dre, orcamento])
  const desviosPorLinha = useMemo(
    () => Object.fromEntries(desvios.map((d) => [d.linha, d])),
    [desvios],
  )

  const semDados = estado.lancamentos.length === 0

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker>DRE em tempo real</Kicker>
          <h1 className="mt-1 text-3xl font-extrabold">
            Resultado do <span className="text-cyan">exercício.</span>
          </h1>
        </div>
        {competencias.length > 0 && (
          <div className="w-44">
            <span className="mb-1 block text-xs font-medium text-slateblue">Competência</span>
            <Select
              value={competencia}
              onChange={setComp}
              options={competencias.map((c) => ({ value: c, label: rotuloCompetencia(c) }))}
            />
          </div>
        )}
      </div>

      {semDados ? (
        <Card>
          <p className="text-slateblue">
            Nenhum lançamento ainda. Vá em <strong className="text-white">Lançamentos</strong> e
            sincronize com o Safragold para gerar o DRE.
          </p>
        </Card>
      ) : (
        <>
          {dre.naoClassificado > 0 && (
            <Card className="mb-4 border-warn/40">
              <p className="text-sm text-warn">
                {formatBRL(dre.naoClassificado)} em lançamentos de{' '}
                {dre.contasNaoClassificadas.length} conta(s) ainda não classificada(s) — não entram
                no DRE. Classifique em <strong>Lançamentos</strong>.
              </p>
            </Card>
          )}

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cyan/15 text-left text-xs uppercase tracking-wider text-slateblue">
                  <th className="py-2 pr-4 font-semibold">Linha</th>
                  <th className="py-2 px-4 text-right font-semibold">Realizado</th>
                  <th className="py-2 px-4 text-right font-semibold">Orçado</th>
                  <th className="py-2 pl-4 text-right font-semibold">Desvio</th>
                </tr>
              </thead>
              <tbody>
                {dre.linhas.map((l) => {
                  const d = desviosPorLinha[l.linha]
                  return (
                    <tr key={l.linha} className="border-b border-white/5">
                      <td className="py-2 pr-4 text-slateblue">{l.rotulo}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-white">
                        {formatBRL(l.valor)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slateblue">
                        {d && d.orcado ? formatBRL(d.orcado) : '—'}
                      </td>
                      <td
                        className={`py-2 pl-4 text-right tabular-nums ${corDesvio(l.sinal, d?.desvio ?? 0)}`}
                      >
                        {d && d.orcado ? (
                          <>
                            {formatBRL(d.desvio)}
                            {d.desvioPct != null && (
                              <span className="ml-1 text-xs opacity-70">
                                ({formatPct(d.desvioPct)})
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <LinhaSubtotal rotulo="= Receita líquida" valor={dre.receitaLiquida} />
                <LinhaSubtotal rotulo="= Lucro bruto" valor={dre.lucroBruto} />
                <LinhaSubtotal rotulo="= Resultado operacional (EBIT)" valor={dre.resultadoOperacional} />
                <LinhaSubtotal rotulo="= EBITDA" valor={dre.ebitda} />
                <LinhaSubtotal rotulo="= Resultado líquido" valor={dre.resultadoLiquido} destaque />
              </tfoot>
            </table>
          </Card>

          {!orcamento && (
            <p className="mt-3 text-xs text-faint">
              Sem orçamento para {rotuloCompetencia(competencia)}. Monte um em{' '}
              <strong className="text-slateblue">Orçamento</strong> para ver os desvios.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function LinhaSubtotal({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string
  valor: number
  destaque?: boolean
}) {
  return (
    <tr className={destaque ? 'border-t-2 border-cyan/40' : 'border-t border-cyan/15'}>
      <td className={`py-2 pr-4 font-bold ${destaque ? 'text-cyan' : 'text-white'}`}>{rotulo}</td>
      <td
        className={`py-2 px-4 text-right font-bold tabular-nums ${destaque ? 'text-cyan' : 'text-white'}`}
      >
        {formatBRL(valor)}
      </td>
      <td />
      <td />
    </tr>
  )
}
