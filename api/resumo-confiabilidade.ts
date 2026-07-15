// Resumo executivo da CONFIABILIDADE do mês. Recebe os achados JÁ DETECTADOS
// pelo motor determinístico (o cliente calcula) e devolve uma leitura curta para
// o sócio: o que priorizar e o risco de confiar no DRE. A IA NÃO detecta nada —
// só narra o que o motor apontou (regra de ouro do projeto).
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

  const { competencia, indiceConfianca, valorEmRevisao, totalMovimento, achados = [] } = parseBody(
    req,
  ) as {
    competencia?: string
    indiceConfianca?: number
    valorEmRevisao?: number
    totalMovimento?: number
    achados?: { tipo: string; severidade: string; titulo: string; valor: number; detalhe: string }[]
  }

  if (!Array.isArray(achados) || achados.length === 0) {
    res.status(200).json({ resumo: 'Nenhum achado material neste mês — o DRE está confiável.', prioridades: [] })
    return
  }

  const lista = achados
    .slice(0, 20)
    .map((a) => `- [${a.severidade}] ${a.titulo} (${brl(a.valor)}): ${a.detalhe}`)
    .join('\n')

  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1500,
      tool_choice: { type: 'tool', name: 'resumir_confiabilidade' },
      tools: [
        {
          name: 'resumir_confiabilidade',
          description: 'Resume os achados de confiabilidade do mês para o sócio decidir o que revisar.',
          input_schema: {
            type: 'object',
            properties: {
              resumo: {
                type: 'string',
                description: 'Leitura em 2–3 frases: dá para confiar no DRE do mês? O que mais pesa?',
              },
              prioridades: {
                type: 'array',
                description: 'De 2 a 4 ações de revisão, em ordem de prioridade, começando com verbo.',
                items: { type: 'string' },
              },
            },
            required: ['resumo', 'prioridades'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Você é um controller do agronegócio (comércio de grãos). Abaixo estão os achados de confiabilidade do DRE da competência ${competencia ?? '(atual)'}, já detectados por regras determinísticas. Índice de confiança do mês: ${indiceConfianca ?? '?'}% (${brl(valorEmRevisao ?? 0)} em revisão de ${brl(totalMovimento ?? 0)} movimentados).

Achados (severidade entre colchetes):
${lista}

Diretrizes:
- Diga objetivamente se dá para confiar no DRE do mês e o que mais compromete a confiança.
- Priorize pelo VALOR e pela severidade. Cite os números.
- Seja CONCISO. Nada de generalidades. As prioridades devem ser ações concretas de revisão.`,
        },
      ],
    })

    const bloco = resp.content.find((b) => b.type === 'tool_use') as { input?: any } | undefined
    const out = bloco?.input ?? {}
    res.status(200).json({
      resumo: typeof out.resumo === 'string' ? out.resumo : '',
      prioridades: Array.isArray(out.prioridades) ? out.prioridades : [],
    })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha ao gerar o resumo: ${e?.message ?? String(e)}` })
  }
}
