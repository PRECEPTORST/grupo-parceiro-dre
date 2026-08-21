// Estoque e custo médio móvel por grão (item 3.2 do ROADMAP.md).
//
// Mostra, para a competência escolhida, o que o CPV do DRE seria se medisse o
// custo do que foi VENDIDO em vez do que foi COMPRADO — e a diferença entre os
// dois, que é exatamente o efeito da formação/consumo de estoque no mês.
//
// Só aparece quando o volume comprado foi informado: sem ele não há custo médio,
// e um número inventado aqui contaminaria o resultado do mês.
import { useMemo, useState } from 'react'
import { useDre } from '../context/DreContext'
import { Botao, Card, Kicker } from './ui'
import { formatBRL, formatNum } from '../lib/format'
import { custoMedioMovel, montarMovimentosEstoque, ajusteEstoque } from '../lib/custoMedio'
import { EstoqueModal } from './EstoqueModal'
import { competenciasDisponiveis } from '../lib/dre'

export function PainelCustoMedio({
  competencia,
  podeEditar,
}: {
  competencia: string
  podeEditar: boolean
}) {
  const { estado, lancamentos, sacas } = useDre()
  const [editando, setEditando] = useState(false)

  const competencias = useMemo(() => competenciasDisponiveis(lancamentos), [lancamentos])
  const sacasCompradas = useMemo(() => estado.sacasCompradas ?? {}, [estado.sacasCompradas])

  const rel = useMemo(() => {
    const movimentos = montarMovimentosEstoque(competencias, lancamentos, sacas, sacasCompradas)
    return custoMedioMovel(competencias, movimentos, estado.estoqueAbertura ?? {})
  }, [competencias, lancamentos, sacas, sacasCompradas, estado.estoqueAbertura])

  const posicoes = rel.posicoes.filter((p) => p.competencia === competencia)
  const temVolumeComprado = posicoes.some((p) => p.sacasCompradas > 0 || p.sacasIniciais > 0)
  const ajuste = ajusteEstoque(rel, competencia)
  const alerta = rel.competenciasComAlerta.includes(competencia)

  return (
    <Card className="animate-rise">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Kicker>Estoque</Kicker>
          <h2 className="mt-1 text-lg font-bold text-ink">Custo médio móvel por grão</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            O CPV do DRE hoje é o que foi <strong className="text-ink">comprado</strong> no mês.
            Aqui está o custo do que foi <strong className="text-ink">vendido</strong> — a diferença
            é o estoque formado ou consumido.
          </p>
        </div>
        {podeEditar && (
          <Botao variante="fantasma" onClick={() => setEditando(true)}>
            ⊞ Volume comprado e estoque
          </Botao>
        )}
      </div>

      {!temVolumeComprado ? (
        <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-gold-deep">
          <strong>Falta o volume comprado.</strong> A API da Enoki informa o valor das compras, mas
          não a quantidade — os títulos de “COMPRA {'{'}GRÃO{'}'}” não têm sacas e o endpoint de
          contratos devolve só contratos de venda. Informe as sacas compradas por mês
          {podeEditar ? ' no botão acima' : ' (peça a um administrador)'} para o custo médio ser
          calculado.
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-cream-2 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                CPV pelo custo médio
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-ink">
                {formatBRL(rel.cpvPorCompetencia[competencia] ?? 0)}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-cream-2 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                Compras do mês (o que o DRE usa)
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-muted">
                {formatBRL(rel.compraPorCompetencia[competencia] ?? 0)}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-cream-2 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                Efeito do estoque
              </div>
              <div
                className={`mt-1 text-lg font-bold tabular-nums ${
                  ajuste === 0 ? 'text-green-deep' : 'text-gold-deep'
                }`}
              >
                {ajuste >= 0 ? '+' : ''}
                {formatBRL(ajuste)}
              </div>
              <div className="mt-0.5 text-[11px] text-faint">
                {ajuste < 0 ? 'formou estoque' : ajuste > 0 ? 'consumiu estoque' : 'sem efeito'}
              </div>
            </div>
          </div>

          {alerta && (
            <div className="mt-3 space-y-2">
              {posicoes.some((p) => p.estoqueNegativo) && (
                <p className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
                  Algum grão vendeu mais do que o estoque disponível neste mês. Falta informar compra
                  ou estoque de abertura — o custo médio sai subavaliado até corrigir.
                </p>
              )}
              {posicoes.some((p) => p.volumeSemValor) && (
                <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-gold-deep">
                  Há volume comprado <strong>sem valor de compra</strong> neste mês:{' '}
                  {posicoes.filter((p) => p.volumeSemValor).map((p) => p.rotulo).join(', ')}. O custo
                  médio fica artificialmente baixo e barateia o estoque daqui para a frente.
                  Normalmente o volume foi informado num mês e o título de compra caiu em outro.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="py-2 pr-3 font-semibold">Grão</th>
                  <th className="py-2 px-3 text-right font-semibold">Estoque inicial</th>
                  <th className="py-2 px-3 text-right font-semibold">Comprado</th>
                  <th className="py-2 px-3 text-right font-semibold">R$/saca médio</th>
                  <th className="py-2 px-3 text-right font-semibold">Vendido</th>
                  <th className="py-2 px-3 text-right font-semibold">CPV</th>
                  <th className="py-2 pl-3 text-right font-semibold">Estoque final</th>
                </tr>
              </thead>
              <tbody>
                {posicoes.map((p) => (
                  <tr
                    key={p.grao}
                    className={`border-b border-line/50 ${
                      p.estoqueNegativo ? 'bg-danger/5' : p.volumeSemValor ? 'bg-warn/5' : ''
                    }`}
                  >
                    <td className="py-2 pr-3 font-medium text-ink">{p.rotulo}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted">
                      {formatNum(p.sacasIniciais)} sc
                      <div className="text-[11px] text-faint">{formatBRL(p.valorInicial)}</div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted">
                      {formatNum(p.sacasCompradas)} sc
                      <div className="text-[11px] text-faint">{formatBRL(p.valorComprado)}</div>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold tabular-nums text-ink">
                      {p.custoMedio ? formatBRL(p.custoMedio) : '—'}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted">
                      {formatNum(p.sacasVendidas)} sc
                    </td>
                    <td className="py-2 px-3 text-right font-semibold tabular-nums text-ink">
                      {formatBRL(p.cpv)}
                    </td>
                    <td
                      className={`py-2 pl-3 text-right tabular-nums ${
                        p.estoqueNegativo ? 'font-semibold text-danger' : 'text-muted'
                      }`}
                    >
                      {formatNum(p.sacasFinais)} sc
                      <div className="text-[11px] opacity-70">{formatBRL(p.valorFinal)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editando && <EstoqueModal aoFechar={() => setEditando(false)} />}
    </Card>
  )
}
