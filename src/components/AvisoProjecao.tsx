// Aviso: parte deste mês é estrutura REPETIDA do mês anterior.
//
// O ERP não captura folha, depreciação nem capex. Sem repetir o último mês
// fechado, agosto/2026 sairia com R$ 37 mil de despesa administrativa em vez dos
// R$ 202 mil que a planilha registra — um resultado inflado por omissão.
//
// Repetir é a melhor estimativa disponível para custo recorrente. Mas estimativa
// que não se anuncia vira mentira, então ela aparece aqui, aberta por linha.
import { useMemo } from 'react'
import { useDre } from '../context/DreContext'
import { Card } from './ui'
import { formatBRL } from '../lib/format'
import { projetarEstrutura } from '../lib/estruturaProjetada'
import { lancamentosPlanilha, META_LINHAS } from '../lib/tipos'
import { mapaEfetivo } from '../lib/planoContas'

export function AvisoProjecao({ competencia }: { competencia: string }) {
  const { estado } = useDre()

  const resumo = useMemo(() => {
    const mapa = mapaEfetivo(estado.classificacoes)
    return projetarEstrutura(lancamentosPlanilha(estado), competencia, mapa).resumo
  }, [estado, competencia])

  if (!resumo) return null

  const rotuloMes = (c: string) => {
    const m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    return `${m[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}`
  }

  return (
    <Card className="mb-4 animate-rise border-line bg-cream-2">
      <p className="text-sm text-ink">
        📋 <strong>{formatBRL(resumo.total)} deste mês são estimativa</strong>, não realizado. A
        estrutura foi repetida de <strong>{rotuloMes(resumo.base)}</strong>, o último mês que a
        planilha fechou — o ERP não registra folha, depreciação nem capex, e sem isso o resultado
        sairia inflado por omissão.
      </p>
      <ul className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
        {resumo.linhas.map((l) => (
          <li key={l.linha} className="flex justify-between gap-4">
            <span>{META_LINHAS[l.linha].rotulo}</span>
            <span className="tabular-nums">{formatBRL(l.valor)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Some sozinho quando a planilha de {rotuloMes(resumo.alvo)} chegar — dado real sempre vence
        estimativa.
      </p>
    </Card>
  )
}
