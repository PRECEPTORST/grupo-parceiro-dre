// Entrada do VOLUME COMPRADO por grão/mês + estoque de abertura (item 3.2).
//
// A API entrega o valor das compras, mas não a quantidade: os títulos de
// "COMPRA {GRÃO}" não têm sacas e o endpoint de Contratos devolve só contratos
// de venda. Sem o volume não existe custo médio, então ele é declarado aqui.
// Se a API de produção passar a expor contratos de compra, esta tela vira só um
// ajuste manual sobre o que vier automático.
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDre } from '../context/DreContext'
import { Botao, NumInput } from './ui'
import { formatBRL, formatNum } from '../lib/format'
import { competenciasDisponiveis } from '../lib/dre'
import { GRAOS, ROTULO_GRAO, type Grao } from '../lib/tipos'

function rotuloCompetencia(c: string): string {
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${meses[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}`
}

export function EstoqueModal({ aoFechar }: { aoFechar: () => void }) {
  const { estado, lancamentos, salvarEstoque } = useDre()
  const competencias = useMemo(() => competenciasDisponiveis(lancamentos), [lancamentos])

  const [compradas, setCompradas] = useState<Record<string, Partial<Record<Grao, number>>>>(
    () => JSON.parse(JSON.stringify(estado.sacasCompradas ?? {})),
  )
  const [abertura, setAbertura] = useState<Partial<Record<Grao, { sacas: number; valor: number }>>>(
    () => JSON.parse(JSON.stringify(estado.estoqueAbertura ?? {})),
  )

  const setCompra = (competencia: string, grao: Grao, v: number) =>
    setCompradas((s) => ({ ...s, [competencia]: { ...s[competencia], [grao]: v } }))

  const setAberturaCampo = (grao: Grao, campo: 'sacas' | 'valor', v: number) =>
    setAbertura((s) => ({
      ...s,
      [grao]: { sacas: s[grao]?.sacas ?? 0, valor: s[grao]?.valor ?? 0, [campo]: v },
    }))

  const totalGrao = (grao: Grao) =>
    competencias.reduce((s, c) => s + (compradas[c]?.[grao] ?? 0), 0)

  const salvar = () => {
    salvarEstoque({ sacasCompradas: compradas, estoqueAbertura: abertura })
    aoFechar()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm"
      onClick={aoFechar}
    >
      <div
        className="my-8 w-full max-w-4xl rounded-xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ink">Volume comprado e estoque de abertura</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          A Enoki informa <strong className="text-ink">quanto</strong> foi pago pelas compras, mas
          não <strong className="text-ink">quantas sacas</strong> entraram. Informe o volume para o
          CPV passar a medir o custo do que foi vendido, e não o do que foi comprado.
        </p>

        <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-faint">
          Estoque de abertura
        </h3>
        <p className="mt-1 text-xs text-muted">
          O que já estava em estoque antes da primeira competência carregada (grão comprado no ano
          anterior e vendido agora).
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="py-2 pr-3 font-semibold">Grão</th>
                <th className="py-2 px-3 text-right font-semibold">Sacas</th>
                <th className="py-2 px-3 text-right font-semibold">Valor (R$)</th>
                <th className="py-2 pl-3 text-right font-semibold">R$/saca</th>
              </tr>
            </thead>
            <tbody>
              {GRAOS.map((g) => {
                const a = abertura[g]
                const media = a?.sacas ? (a.valor ?? 0) / a.sacas : 0
                return (
                  <tr key={g} className="border-b border-line/50">
                    <td className="py-1.5 pr-3 text-ink">{ROTULO_GRAO[g]}</td>
                    <td className="py-1.5 px-3">
                      <NumInput
                        value={a?.sacas ?? 0}
                        onChange={(v) => setAberturaCampo(g, 'sacas', v ?? 0)}
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <NumInput
                        value={a?.valor ?? 0}
                        onChange={(v) => setAberturaCampo(g, 'valor', v ?? 0)}
                      />
                    </td>
                    <td className="py-1.5 pl-3 text-right text-xs tabular-nums text-muted">
                      {media ? formatBRL(media) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-faint">
          Sacas compradas por mês
        </h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="py-2 pr-3 font-semibold">Competência</th>
                {GRAOS.map((g) => (
                  <th key={g} className="py-2 px-2 text-right font-semibold">
                    {ROTULO_GRAO[g]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {competencias.map((c) => (
                <tr key={c} className="border-b border-line/50">
                  <td className="py-1.5 pr-3 text-ink">{rotuloCompetencia(c)}</td>
                  {GRAOS.map((g) => (
                    <td key={g} className="px-1 py-1">
                      <NumInput
                        value={compradas[c]?.[g] ?? 0}
                        onChange={(v) => setCompra(c, g, v ?? 0)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-line">
                <td className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-faint">
                  Total
                </td>
                {GRAOS.map((g) => (
                  <td key={g} className="px-2 py-2 text-right text-xs font-bold tabular-nums text-ink">
                    {formatNum(totalGrao(g))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={salvar}>Salvar</Botao>
        </div>
      </div>
    </div>,
    document.body,
  )
}
