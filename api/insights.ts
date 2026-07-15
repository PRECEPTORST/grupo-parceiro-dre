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

  const {
    competencia,
    linhas = [],
    subtotais,
    mesCorrente = false,
    diaAtual,
    diasNoMes,
  } = parseBody(req) as {
    competencia?: string
    linhas?: {
      rotulo: string
      realizado: number
      orcado: number
      desvio: number
      desvioPct: number | null
      projecaoFimMes?: number | null
    }[]
    subtotais?: Record<string, { realizado: number; orcado: number }>
    mesCorrente?: boolean
    diaAtual?: number
    diasNoMes?: number
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
        }${
          mesCorrente && l.projecaoFimMes != null
            ? ` | projeção fim do mês ${brl(l.projecaoFimMes)}`
            : ''
        }`,
    )
    .join('\n')

  const contextoParcial =
    mesCorrente && diaAtual && diasNoMes
      ? `\nATENÇÃO: o mês está EM ANDAMENTO — realizado apurado até o dia ${diaAtual} de ${diasNoMes}. A "projeção fim do mês" é a extrapolação linear do ritmo atual (realizado ÷ fração do mês decorrida). Use-a para apontar contas/linhas que devem FICAR ABAIXO do orçado (receitas) ou ESTOURAR o orçado (custos/despesas) até o fechamento.`
      : ''
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
              projecaoFechamento: {
                type: 'array',
                description:
                  'SÓ quando o mês está em andamento: linhas/contas cuja projeção de fim de mês tende a NÃO ATINGIR o orçado (receita abaixo) ou ESTOURAR (custo acima). Vazio se o mês estiver fechado ou tudo no rumo.',
                items: {
                  type: 'object',
                  properties: {
                    rotulo: { type: 'string', description: 'Nome da linha/conta.' },
                    situacao: { type: 'string', enum: ['abaixo', 'acima', 'no_alvo'] },
                    detalhe: {
                      type: 'string',
                      description: 'Curto: projeção vs. orçado e o risco. Cite os números.',
                    },
                  },
                  required: ['rotulo', 'situacao', 'detalhe'],
                },
              },
            },
            required: ['resumo', 'pontos', 'recomendacoes'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Você é um controller experiente de um grupo do agronegócio (comércio de grãos). Analise o DRE da competência ${competencia ?? '(atual)'}, comparando o realizado com o orçamento.${contextoParcial}

Linhas do DRE:
${tabela}

Subtotais:
${resumoSub}

Diretrizes:
- Foque nos desvios MATERIAIS (maiores em valor) e no que eles significam para o resultado.
- Lembre da convenção: em receitas, realizado ACIMA do orçado é bom; em custos/despesas/impostos, realizado ACIMA do orçado é ruim (estouro).
- Seja específico e cite os números. Nada de generalidades.
- Seja CONCISO: no máximo 5 pontos, cada detalhe em 1–2 frases.
- Se o mês está EM ANDAMENTO, preencha "projecaoFechamento" com as contas que devem não atingir/estourar o orçado até o fim do mês (com base na projeção). Se o mês está fechado, deixe "projecaoFechamento" vazio.
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
      projecaoFechamento: Array.isArray(out.projecaoFechamento) ? out.projecaoFechamento : [],
    })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha ao gerar análise: ${e?.message ?? String(e)}` })
  }
}
