// Agente sugestor de orçamento: propõe um valor orçado POR CONTA a partir do
// histórico de lançamentos classificados + premissas do mercado de grãos.
// O sócio/Controler ajusta o resultado — a IA dá o ponto de partida.
import Anthropic from '@anthropic-ai/sdk'
import { authConfigurada, usuarioAtual, parseBody } from '../lib/auth.js'

const MODELO = 'claude-opus-4-8'

/** Resume, por conta, o realizado por competência (para o modelo ver a série). */
function resumirPorConta(lancamentos: any[], classificacoes: any[]) {
  const linhaDe: Record<string, string> = {}
  for (const c of classificacoes) linhaDe[c.contaSafragold] = c.linha
  const porConta: Record<string, { linha: string; descricao: string; meses: Record<string, number> }> = {}
  for (const l of lancamentos) {
    const c = String(l.contaSafragold)
    const comp = String(l.data).slice(0, 7)
    porConta[c] ??= { linha: linhaDe[c] ?? 'nao_classificada', descricao: '', meses: {} }
    porConta[c].meses[comp] = (porConta[c].meses[comp] ?? 0) + Number(l.valor || 0)
    if (!porConta[c].descricao && l.historico) porConta[c].descricao = String(l.historico)
  }
  return porConta
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

  const { competencia, historicoLancamentos = [], classificacoes = [] } = parseBody(req) as {
    competencia?: string
    historicoLancamentos?: any[]
    classificacoes?: any[]
  }
  const porConta = resumirPorConta(historicoLancamentos, classificacoes)
  const contas = Object.keys(porConta)
  if (!contas.length) {
    res.status(400).json({ erro: 'Sem contas classificadas para sugerir orçamento.' })
    return
  }

  const resumo = contas
    .map((c) => {
      const { linha, descricao, meses } = porConta[c]
      const serie = Object.entries(meses)
        .map(([m, v]) => `${m}=${Math.round(v)}`)
        .join(' ')
      return `- conta ${c} [${linha}] "${descricao}": ${serie || 'sem histórico'}`
    })
    .join('\n')

  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 2000,
      tool_choice: { type: 'tool', name: 'propor_orcamento' },
      tools: [
        {
          name: 'propor_orcamento',
          description: 'Propõe o valor orçado de CADA conta para a competência (reais, positivo).',
          input_schema: {
            type: 'object',
            properties: {
              valores: {
                type: 'object',
                description: 'Mapa contaSafragold -> valor orçado em reais.',
                additionalProperties: { type: 'number' },
              },
              premissas: {
                type: 'string',
                description: 'Breve explicação das premissas de mercado de grãos usadas.',
              },
            },
            required: ['valores'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Você é um controller do agronegócio (comércio de grãos). Proponha o orçamento da competência ${competencia ?? '(próxima)'} para um grupo do setor, conta a conta.

Histórico realizado por conta (valores em reais, por competência AAAA-MM):
${resumo}

Diretrizes:
- Proponha um valor para CADA conta listada, usando exatamente o mesmo código de conta como chave.
- Baseie-se na média/tendência do histórico e na sazonalidade de safra/entressafra de soja e milho no Brasil.
- Se uma conta tem histórico irregular, seja conservador.
- Valores positivos (magnitude), no mesmo padrão do realizado.`,
        },
      ],
    })

    const bloco = resp.content.find((b) => b.type === 'tool_use') as
      | { input?: { valores?: Record<string, number>; premissas?: string } }
      | undefined
    const brutos = bloco?.input?.valores ?? {}
    const valores: Record<string, number> = {}
    for (const c of contas) if (typeof brutos[c] === 'number') valores[c] = Math.max(0, brutos[c])
    res.status(200).json({ valores, premissas: bloco?.input?.premissas ?? '' })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha ao sugerir orçamento: ${e?.message ?? String(e)}` })
  }
}
