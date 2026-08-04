import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { Botao, NumInput } from './ui'
import { formatNum } from '../lib/format'
import { GRAOS, ROTULO_GRAO, type Grao } from '../lib/tipos'
import { competenciasDisponiveis } from '../lib/dre'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function rotuloComp(comp: string): string {
  const [ano, mes] = comp.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano}`
}

type Grade = Record<string, Partial<Record<Grao, number>>>

/**
 * Rotina para o usuário LANÇAR as sacas comercializadas de cada cereal, mês a mês,
 * numa grade única (competências × grãos). Substitui ter que ir mês por mês no DRE.
 */
export function SacasModal({ onClose }: { onClose: () => void }) {
  const { estado, salvarSacasLote } = useDre()

  const competencias = useMemo(
    () => competenciasDisponiveis(estado.lancamentos).slice().sort(),
    [estado.lancamentos],
  )

  // Estado local da grade — só grava na nuvem ao clicar em Salvar.
  const [grade, setGrade] = useState<Grade>(() => {
    const g: Grade = {}
    for (const c of competencias) g[c] = { ...(estado.sacas?.[c] ?? {}) }
    return g
  })

  const setCel = (comp: string, grao: Grao, v: number) =>
    setGrade((s) => ({ ...s, [comp]: { ...s[comp], [grao]: v } }))

  const totalGrao = (g: Grao) => competencias.reduce((s, c) => s + (grade[c]?.[g] ?? 0), 0)
  const totalMes = (c: string) => GRAOS.reduce((s, g) => s + (grade[c]?.[g] ?? 0), 0)
  const totalGeral = competencias.reduce((s, c) => s + totalMes(c), 0)

  const salvar = () => {
    salvarSacasLote(grade)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-3xl animate-rise rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="font-head text-lg font-bold text-ink">Sacas comercializadas por cereal</h2>
            <p className="text-xs text-muted">
              Informe a quantidade de sacas vendidas de cada grão, mês a mês. Alimenta o R$/saca do DRE.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl text-muted hover:bg-cream hover:text-ink">
            ×
          </button>
        </div>

        <div className="px-6 py-5">
          {competencias.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Ainda não há lançamentos com competência. Importe/sincronize o DRE primeiro.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-cream/50 text-left text-[11px] uppercase tracking-wider text-faint">
                    <th className="py-2 pl-4 pr-3 font-semibold">Mês</th>
                    {GRAOS.map((g) => (
                      <th key={g} className="py-2 px-3 text-right font-semibold">
                        {ROTULO_GRAO[g]}
                      </th>
                    ))}
                    <th className="py-2 pr-4 pl-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {competencias.map((c) => (
                    <tr key={c} className="border-b border-line/50">
                      <td className="py-1.5 pl-4 pr-3 font-medium text-ink">{rotuloComp(c)}</td>
                      {GRAOS.map((g) => (
                        <td key={g} className="py-1.5 px-3">
                          <NumInput
                            value={grade[c]?.[g] ?? 0}
                            onChange={(v) => setCel(c, g, v ?? 0)}
                            min={0}
                          />
                        </td>
                      ))}
                      <td className="py-1.5 pr-4 pl-3 text-right tabular-nums text-muted">
                        {totalMes(c) > 0 ? formatNum(totalMes(c)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-green/30 bg-green/8 font-semibold text-ink">
                    <td className="py-2 pl-4 pr-3 font-head uppercase tracking-wide">Total</td>
                    {GRAOS.map((g) => (
                      <td key={g} className="py-2 px-3 text-right tabular-nums">
                        {totalGrao(g) > 0 ? formatNum(totalGrao(g)) : '—'}
                      </td>
                    ))}
                    <td className="py-2 pr-4 pl-3 text-right tabular-nums text-green">
                      {totalGeral > 0 ? formatNum(totalGeral) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Botao variante="fantasma" onClick={onClose}>
              Cancelar
            </Botao>
            <Botao onClick={salvar} disabled={competencias.length === 0}>
              Salvar sacas
            </Botao>
          </div>
        </div>
      </div>
    </div>
  )
}
