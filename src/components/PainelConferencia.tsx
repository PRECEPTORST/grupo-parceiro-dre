// Conferência lado a lado com a planilha do cliente, linha a linha.
//
// POR QUE TRÊS COLUNAS E NÃO DUAS
// -------------------------------
// "O DRE está diferente da planilha" é verdade e é inútil sozinho, porque
// mistura duas coisas de naturezas opostas:
//
//   • ESCOLHA DE MÉTODO — apropriamos estoque; a planilha não. E mostramos a
//     devolução de venda em linha própria; a planilha a abate dentro da receita
//     bruta (a linha DEVOLUÇÃO dela é zero por isso, não por não deduzir — li
//     errado na primeira vez). Isso é apresentação, e é reversível.
//   • DADO QUE NÃO EXISTE — comissão, quebras e o bloco administrativo e
//     financeiro não estão no ERP. Isso não é decisão, e nenhum cálculo cria.
//
// A coluna do meio ("modo planilha") copia as convenções do cliente. Com ela, o
// que sobra de diferença para a terceira coluna já não é método: é dado. É essa
// separação que a tela existe para mostrar.
//
// E o ACUMULADO importa tanto quanto o mês: uma nota lançada no mês errado some
// no acumulado, uma nota que falta não some nunca. Nos 8 meses de 2026 a receita
// fecha em -0,6% e a compra em -0,7%, enquanto janeiro isolado fica em -32%.
// Sem as duas visões, a mesma tela sugere "está tudo errado" ou "está tudo
// certo", conforme a que você olhar.
import { useMemo } from 'react'
import { useDre } from '../context/DreContext'
import { Card, Kicker } from './ui'
import { formatBRL } from '../lib/format'
import {
  PLANILHA_CLIENTE,
  LINHAS_CONFERENCIA,
  custoTotal,
  receitaLiquida,
  type LinhaPlanilha,
} from '../lib/planilhaCliente'
import type { LancamentoCanonico } from '../lib/tipos'

/** Histórico com que os lançamentos de apropriação de estoque são gravados. */
const MARCA_APROPRIACAO = /^Apropriação de estoque:/

const vazia = (): LinhaPlanilha => ({
  receitaBruta: 0, impostos: 0, devolucao: 0, compra: 0, armazenagem: 0,
  frete: 0, comissao: 0, classificacao: 0, quebras: 0, despesaTotal: 0,
})

function somar(lancs: LancamentoCanonico[]): LinhaPlanilha {
  const out = vazia()
  for (const l of LINHAS_CONFERENCIA) {
    out[l.chave] = lancs
      .filter((x) => l.conta(x.contaSafragold))
      .reduce((s, x) => s + x.valor, 0)
  }
  return out
}

function Delta({ a, b }: { a: number; b: number }) {
  if (b === 0) return <span className="text-muted">—</span>
  const d = (a / b - 1) * 100
  const forte = Math.abs(d) > 10
  return (
    <span className={forte ? 'text-warn' : Math.abs(d) < 2 ? 'text-green' : 'text-muted'}>
      {d > 0 ? '+' : ''}{d.toFixed(1)}%
    </span>
  )
}

function Tabela({
  titulo,
  apurado,
  modoPlanilha,
  planilha,
}: {
  titulo: string
  apurado: LinhaPlanilha
  modoPlanilha: LinhaPlanilha
  planilha: LinhaPlanilha
}) {
  const linha = (rotulo: string, a: number, m: number, p: number, forte = false) => (
    <tr key={rotulo} className={forte ? 'border-t border-line font-semibold' : ''}>
      <td className="py-1.5 pr-3 text-ink">{rotulo}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-muted">{formatBRL(a)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-ink">{formatBRL(m)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums text-muted">{formatBRL(p)}</td>
      <td className="py-1.5 text-right tabular-nums text-xs"><Delta a={m} b={p} /></td>
    </tr>
  )

  return (
    <div className="mb-5 overflow-x-auto">
      <p className="mb-2 text-sm font-semibold text-ink">{titulo}</p>
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="pb-1 text-left font-medium">Linha</th>
            <th className="pb-1 pr-3 text-right font-medium">Apurado</th>
            <th className="pb-1 pr-3 text-right font-medium">Modo planilha</th>
            <th className="pb-1 pr-3 text-right font-medium">Planilha</th>
            <th className="pb-1 text-right font-medium">Δ</th>
          </tr>
        </thead>
        <tbody>
          {LINHAS_CONFERENCIA.map((l) =>
            linha(l.rotulo, apurado[l.chave], modoPlanilha[l.chave], planilha[l.chave]),
          )}
          {linha('Receita líquida', receitaLiquida(apurado), receitaLiquida(modoPlanilha), receitaLiquida(planilha), true)}
          {linha('Custo total', custoTotal(apurado), custoTotal(modoPlanilha), custoTotal(planilha), true)}
          {linha(
            'Lucro bruto',
            receitaLiquida(apurado) - custoTotal(apurado),
            receitaLiquida(modoPlanilha) - custoTotal(modoPlanilha),
            receitaLiquida(planilha) - custoTotal(planilha),
            true,
          )}
        </tbody>
      </table>
    </div>
  )
}

export function PainelConferencia({ competencia }: { competencia: string }) {
  const { lancamentos } = useDre()

  const dados = useMemo(() => {
    const meses = Object.keys(PLANILHA_CLIENTE).sort()
    const doMes = (mes: string) => lancamentos.filter((l) => l.data.slice(0, 7) === mes)

    // MODO PLANILHA: sem apropriação de estoque (a compra volta a ser a do mês) e
    // com a devolução de venda ABATIDA DENTRO da receita bruta, em vez de linha
    // própria. São exatamente as convenções do cliente — o resto já não é método.
    const semConvencoesNossas = (ls: LancamentoCanonico[]) =>
      ls
        .filter((l) => !MARCA_APROPRIACAO.test(l.historico ?? ''))
        .map((l) =>
          l.contaSafragold === '3.2.06' || l.contaSafragold === '3.2.07'
            ? { ...l, contaSafragold: '3.1.98', valor: -l.valor }
            : l,
        )

    const acumular = (f: (m: string) => LinhaPlanilha) =>
      meses.reduce((acc, m) => {
        const x = f(m)
        for (const k of Object.keys(acc) as (keyof LinhaPlanilha)[]) acc[k] += x[k]
        return acc
      }, vazia())

    return {
      meses,
      mes: {
        apurado: somar(doMes(competencia)),
        modoPlanilha: somar(semConvencoesNossas(doMes(competencia))),
        planilha: PLANILHA_CLIENTE[competencia] ?? vazia(),
      },
      acumulado: {
        apurado: acumular((m) => somar(doMes(m))),
        modoPlanilha: acumular((m) => somar(semConvencoesNossas(doMes(m)))),
        planilha: acumular((m) => PLANILHA_CLIENTE[m]),
      },
    }
  }, [lancamentos, competencia])

  if (!PLANILHA_CLIENTE[competencia]) return null

  const faltante =
    dados.acumulado.planilha.despesaTotal - dados.acumulado.modoPlanilha.despesaTotal +
    dados.acumulado.planilha.comissao - dados.acumulado.modoPlanilha.comissao +
    dados.acumulado.planilha.quebras - dados.acumulado.modoPlanilha.quebras

  return (
    <Card className="mb-5 animate-rise">
      <Kicker>Conferência com a planilha</Kicker>
      <p className="mb-4 mt-1 text-sm text-muted">
        A coluna <strong>apurado</strong> é o que este DRE calcula. A do meio copia as
        convenções do cliente — sem apropriação de estoque, e com a devolução de venda abatida
        dentro da receita bruta em vez de em linha própria — para que a diferença que sobra não
        seja de método. Escopo: filial MG, com a transferência para a filial SP contada como venda,
        que é como o fechamento do cliente a registra.
      </p>

      <Tabela
        titulo={`${competencia}`}
        apurado={dados.mes.apurado}
        modoPlanilha={dados.mes.modoPlanilha}
        planilha={dados.mes.planilha}
      />

      <Tabela
        titulo={`Acumulado ${dados.meses[0]} a ${dados.meses[dados.meses.length - 1]}`}
        apurado={dados.acumulado.apurado}
        modoPlanilha={dados.acumulado.modoPlanilha}
        planilha={dados.acumulado.planilha}
      />

      <div className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm text-gold-deep">
        <p className="mb-1 font-semibold">
          {formatBRL(faltante)} de despesa que não existe no ERP
        </p>
        <p>
          Comissão, quebras e o bloco administrativo e financeiro (folha, pró-labore, aluguel,
          contabilidade, juros, IOF) não têm um único título na carga da API, em nenhum mês.
          Enquanto não forem lançados no Enoki, o <strong>lucro bruto</strong> é comparável e o{' '}
          <strong>resultado final não é</strong> — ele sai otimista por construção.
        </p>
      </div>

      <p className="mt-3 text-xs text-muted">
        Em onze meses (out/2025 a ago/2026) a receita reconstruída fica a 4 pontos da planilha em
        média, e a compra a 6; o acumulado de 2026 fecha em +1% e −1%. O que resta mês a mês é
        data: aqui vale a emissão de cada nota, lá o controle de carregamento. Uma nota no mês
        errado some no acumulado; uma que falta, não.
      </p>
    </Card>
  )
}
