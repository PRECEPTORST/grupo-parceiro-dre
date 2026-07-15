// Agente importador de orçamento: recebe o TEXTO de um documento (planilha
// colada, e-mail, PDF convertido em texto etc.) e as contas conhecidas, e
// extrai o valor orçado POR CONTA. O usuário confere antes de salvar — a IA só
// lê o documento e mapeia para as contas do plano. Não inventa contas novas.
import Anthropic from '@anthropic-ai/sdk'
import { authConfigurada, usuarioAtual, parseBody } from '../lib/auth.js'

const MODELO = 'claude-opus-4-8'

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

  const { texto, contas = [] } = parseBody(req) as {
    texto?: string
    contas?: { conta: string; descricao?: string; linha?: string }[]
  }
  if (!texto || !texto.trim()) {
    res.status(400).json({ erro: 'Envie o texto do documento com os valores do orçamento.' })
    return
  }
  if (!Array.isArray(contas) || contas.length === 0) {
    res.status(400).json({ erro: 'Sem contas conhecidas para mapear o orçamento.' })
    return
  }

  const catalogo = contas
    .map((c) => `- ${c.conta} [${c.linha ?? '?'}] "${c.descricao ?? ''}"`)
    .join('\n')
  const codigos = new Set(contas.map((c) => c.conta))

  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 2000,
      tool_choice: { type: 'tool', name: 'extrair_orcamento' },
      tools: [
        {
          name: 'extrair_orcamento',
          description:
            'Extrai do documento o valor orçado de cada conta, usando SOMENTE os códigos de conta conhecidos.',
          input_schema: {
            type: 'object',
            properties: {
              valores: {
                type: 'object',
                description:
                  'Mapa contaSafragold -> valor orçado em reais (positivo). Só contas que aparecem no documento.',
                additionalProperties: { type: 'number' },
              },
              observacoes: {
                type: 'string',
                description: 'Itens do documento que não deram para mapear numa conta conhecida.',
              },
            },
            required: ['valores'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Você é um controller do agronegócio. Abaixo está o TEXTO de um documento de orçamento (pode ser planilha colada, e-mail ou relatório) e o catálogo de contas conhecidas. Extraia o valor orçado de cada conta.

Contas conhecidas (use EXATAMENTE estes códigos como chave):
${catalogo}

Documento:
"""
${texto.slice(0, 12000)}
"""

Diretrizes:
- Só use códigos de conta que estão no catálogo. Nunca invente conta.
- Case uma linha do documento a uma conta pelo código OU pela descrição (ex.: "Folha administrativa" → a conta administrativa correspondente).
- Valores em reais, positivos (magnitude). Interprete números no padrão brasileiro (1.240.000,00 = 1240000).
- Se um item do documento não casar com nenhuma conta, liste em observacoes; não force.`,
        },
      ],
    })

    const bloco = resp.content.find((b) => b.type === 'tool_use') as
      | { input?: { valores?: Record<string, number>; observacoes?: string } }
      | undefined
    const brutos = bloco?.input?.valores ?? {}
    const valores: Record<string, number> = {}
    for (const [c, v] of Object.entries(brutos)) {
      if (codigos.has(c) && typeof v === 'number' && Number.isFinite(v)) valores[c] = Math.abs(v)
    }
    res.status(200).json({ valores, observacoes: bloco?.input?.observacoes ?? '' })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha ao importar orçamento: ${e?.message ?? String(e)}` })
  }
}
