// Agente de insights: analisa o DRE da competência (realizado × orçado) e gera
// uma leitura executiva dos desvios — visão geral, pontos (positivo/atenção/
// risco) e recomendações acionáveis. Para os sócios entenderem "o que fazer".
import Anthropic from '@anthropic-ai/sdk'
import { authConfigurada, usuarioAtual, parseBody } from '../lib/auth.js'

const MODELO = 'claude-opus-4-8'

function brl(v: number): string {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function handler(req: any, res: any) {
  if (!authConfigurada()) {
    res.status(500).json({ erro: 'Autenticação não configurada.' })
    return
  }
  const atual = await usuarioAtual(req)
  if (!atual) {
    res.status(401).json({ erro: 'Não autenticado.' })
    return
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada.' })
    return
  }

  const { competencia, linhas = [], subtotais } = parseBody(req) as {
    competencia?: string
    linhas?: { rotulo: string; realizado: number; orcado: number; desvio: number; desvioPct: number | null }[]
    subtotais?: Record<string, { realizado: number; orcado: number }>
  }
  if (!Array.isArray(linhas) || linhas.length === 0) {
    res.status(400).json({ erro: 'Envie as linhas do DRE para análise.' })
    return
  }

  const tabela = linhas
    .map(
      (l) =>
        `- ${l.rotulo}: realizado ${brl(l.realizado)} | orçado ${brl(l.orcado)} | desvio ${brl(l.desvio)}${
          l.desvioPct != null ? ` (${l.desvioPct.toFixed(1)}%)` : ''
        }`,
    )
    .join('\n')
  const resumoSub = subtotais
    ? Object.entries(subtotais)
        .map(([k, v]) => `- ${k}: realizado ${brl(v.realizado)} | orçado ${brl(v.orcado)}`)
        .join('\n')
    : '(sem subtotais)'

  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 2800,
      tool_choice: { type: 'tool', name: 'analisar_dre' },
      tools: [
        {
          name: 'analisar_dre',
          description: 'Gera a análise executiva do DRE com base nos desvios realizado × orçado.',
          input_schema: {
            type: 'object',
            properties: {
              resumo: {
                type: 'string',
                description: 'Visão geral do mês em 2–3 frases, linguagem direta para sócios.',
              },
              pontos: {
                type: 'array',
                description: 'De 3 a 5 pontos (no máximo 5) sobre os principais desvios.',
                items: {
                  type: 'object',
                  properties: {
                    tipo: { type: 'string', enum: ['positivo', 'atencao', 'risco'] },
                    titulo: { type: 'string', description: 'Curto, direto.' },
                    detalhe: { type: 'string', description: '1 a 2 frases, com os números.' },
                  },
                  required: ['tipo', 'titulo', 'detalhe'],
                },
              },
              recomendacoes: {
                type: 'array',
                description: '2 a 4 ações práticas, começando com verbo.',
                items: { type: 'string' },
              },
            },
            required: ['resumo', 'pontos', 'recomendacoes'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Você é um controller experiente de um grupo do agronegócio (comércio de grãos). Analise o DRE da competência ${competencia ?? '(atual)'}, comparando o realizado com o orçamento aprovado.

Linhas do DRE:
${tabela}

Subtotais:
${resumoSub}

Diretrizes:
- Foque nos desvios MATERIAIS (maiores em valor) e no que eles significam para o resultado.
- Lembre da convenção: em receitas, realizado ACIMA do orçado é bom; em custos/despesas/impostos, realizado ACIMA do orçado é ruim (estouro).
- Seja específico e cite os números. Nada de generalidades.
- Seja CONCISO: no máximo 5 pontos, cada detalhe em 1–2 frases.
- SEMPRE termine com 2 a 4 recomendações acionáveis pelos sócios/controller.`,
        },
      ],
    })

    const bloco = resp.content.find((b) => b.type === 'tool_use') as { input?: any } | undefined
    const out = bloco?.input ?? {}
    res.status(200).json({
      resumo: typeof out.resumo === 'string' ? out.resumo : '',
      pontos: Array.isArray(out.pontos) ? out.pontos : [],
      recomendacoes: Array.isArray(out.recomendacoes) ? out.recomendacoes : [],
    })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha ao gerar análise: ${e?.message ?? String(e)}` })
  }
}
