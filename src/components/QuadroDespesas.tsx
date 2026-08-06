import { Card } from './ui'
import { formatBRL } from '../lib/format'
import type { DreMensal } from '../lib/dre'
import type { LinhaDRE } from '../lib/tipos'

// Quadro "Total de despesas" (definição do cliente): adm + comercial + despesa
// financeira − receita financeira + IRPJ/CSLL. Não inclui depreciação/CPV/deduções.
// Reutilizado no DRE e no painel inicial.
export function QuadroDespesas({ dre, temOrcamento }: { dre: DreMensal; temOrcamento: boolean }) {
  const real = (l: LinhaDRE) => dre.linhas.find((x) => x.linha === l)?.realizado ?? 0
  const orc = (l: LinhaDRE) => dre.linhas.find((x) => x.linha === l)?.orcado ?? 0
  const linhas: { rotulo: string; real: number; orc: number }[] = [
    { rotulo: 'Despesas administrativas', real: real('despesas_administrativas'), orc: orc('despesas_administrativas') },
    { rotulo: 'Despesas comerciais', real: real('despesas_comerciais'), orc: orc('despesas_comerciais') },
    { rotulo: '(+) Despesa financeira', real: real('despesa_financeira'), orc: orc('despesa_financeira') },
    { rotulo: '(−) Receita financeira', real: -real('receita_financeira'), orc: -orc('receita_financeira') },
    { rotulo: 'IRPJ + CSLL', real: real('impostos_lucro'), orc: orc('impostos_lucro') },
  ]
  const totalOrc =
    orc('despesas_administrativas') +
    orc('despesas_comerciais') +
    orc('despesa_financeira') -
    orc('receita_financeira') +
    orc('impostos_lucro')
  return (
    <Card className="mt-4 animate-rise overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <span className="font-head text-sm font-semibold uppercase tracking-wider text-muted">
          Total de despesas
        </span>
        <span className="text-[11px] text-faint">adm + comercial + desp. financeira − rec. financeira + IRPJ/CSLL</span>
      </div>
      <table className="w-full text-sm">
        {temOrcamento && (
          <thead>
            <tr className="border-b border-line/60 text-[11px] uppercase tracking-wider text-faint">
              <th className="pl-5" />
              <th className="px-4 py-1.5 text-right font-semibold">Realizado</th>
              <th className="pr-5 py-1.5 text-right font-semibold">Orçado</th>
            </tr>
          </thead>
        )}
        <tbody>
          {linhas.map((l) => (
            <tr key={l.rotulo} className="border-b border-line/50">
              <td className="py-2 pl-5 pr-4 text-muted">{l.rotulo}</td>
              <td className="py-2 px-4 text-right tabular-nums text-ink">{formatBRL(l.real)}</td>
              {temOrcamento && <td className="py-2 pr-5 pl-4 text-right tabular-nums text-faint">{l.orc ? formatBRL(l.orc) : '—'}</td>}
            </tr>
          ))}
          <tr className="bg-cream/70 border-t-2 border-line font-semibold">
            <td className="py-2.5 pl-5 pr-4 font-head uppercase tracking-wide text-ink">= Total de despesas</td>
            <td className="py-2.5 px-4 text-right font-head tabular-nums text-ink">{formatBRL(dre.realizado.totalDespesas)}</td>
            {temOrcamento && <td className="py-2.5 pr-5 pl-4 text-right font-head tabular-nums text-muted">{totalOrc ? formatBRL(totalOrc) : '—'}</td>}
          </tr>
        </tbody>
      </table>
    </Card>
  )
}
