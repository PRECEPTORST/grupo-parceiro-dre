// Agente sugestor de orçamento: propõe um orçamento por linha do DRE a partir
// do histórico de lançamentos classificados + premissas do mercado de grãos.
// O sócio/Controler ajusta o resultado — a IA dá o ponto de partida.
import Anthropic from '@anthropic-ai/sdk'
import { authConfigurada, usuarioAtual, parseBody } from '../lib/auth.js'

const MODELO = 'claude-opus-4-8'

const LINHAS = [
  'receita_bruta',
  'deducoes',
  'custo_produto',
  'despesas_comerciais',
  'despesas_administrativas',
  'outras_receitas_operacionais',
  'depreciacao_amortizacao',
  'receita_financeira',
  'despesa_financeira',
  'impostos_lucro',
] as const

/** Agrega o histórico já classificado por competência × linha (em reais). */
function resumirHistorico(lancamentos: any[], classificacoes: any[]): string {
  const mapa: Record<string, string> = {}
  for (const c of classificacoes) mapa[c.contaSafragold] = c.linha
  const porCompLinha: Record<string, Record<string, number>> = {}
  for (const l of lancamentos) {
    const linha = mapa[l.contaSafragold]
    if (!linha) continue
    const comp = String(l.data).slice(0, 7)
    porCompLinha[comp] ??= {}
    porCompLinha[comp][linha] = (porCompLinha[comp][linha] ?? 0) + Number(l.valor || 0)
  }
  const comps = Object.keys(porCompLinha).sort()
  if (!comps.length) return '(sem histórico classificado ainda)'
  return comps
    .map((comp) => {
      const linhas = Object.entries(porCompLinha[comp])
        .map(([k, v]) => `${k}=${Math.round(v)}`)
        .join(', ')
      return `${comp}: ${linhas}`
    })
    .join('\n')
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
  const resumo = resumirHistorico(historicoLancamentos, classificacoes)

  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1500,
      tool_choice: { type: 'tool', name: 'propor_orcamento' },
      tools: [
        {
          name: 'propor_orcamento',
          description: 'Propõe o orçamento da competência, valor em reais por linha do DRE.',
          input_schema: {
            type: 'object',
            properties: {
              valores: {
                type: 'object',
                properties: Object.fromEntries(
                  LINHAS.map((l) => [l, { type: 'number' }]),
                ),
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
          content: `Você é um controller do agronegócio (comércio de grãos). Proponha o orçamento da competência ${competencia ?? '(próxima)'} para um grupo do setor de grãos.

Considere:
- Histórico realizado por competência × linha do DRE (valores em reais):
${resumo}
- Sazonalidade de safra e entressafra de soja/milho no Brasil, e a volatilidade de preços de grãos.
- Se não houver histórico, parta de premissas de mercado conservadoras e deixe isso claro nas premissas.

Devolva um valor por linha (magnitude positiva, mesmo padrão do realizado).`,
        },
      ],
    })

    const bloco = resp.content.find((b) => b.type === 'tool_use') as
      | { input?: { valores?: Record<string, number>; premissas?: string } }
      | undefined
    const brutos = bloco?.input?.valores ?? {}
    const valores: Record<string, number> = {}
    for (const l of LINHAS) if (typeof brutos[l] === 'number') valores[l] = Math.max(0, brutos[l])
    res.status(200).json({ valores, premissas: bloco?.input?.premissas ?? '' })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha ao sugerir orçamento: ${e?.message ?? String(e)}` })
  }
}
