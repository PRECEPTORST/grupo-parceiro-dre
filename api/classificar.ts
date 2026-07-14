// Agente classificador (Sprint 1): mapeia cada CONTA do Safragold para uma
// linha do DRE, com grau de confiança. É a ÚNICA parte com IA no Sprint 1.
//
// Regras que sustentam o custo baixo (~R$ 680/mês da proposta):
//   - Classifica por CONTA, não por lançamento.
//   - O front só manda contas AINDA não classificadas.
//   - Saída estruturada via tool use → nunca parseia texto livre.
//   - Confiança < 0.8 fica marcada para revisão do Controler (semente do Sprint 2).
import Anthropic from '@anthropic-ai/sdk'
import { authConfigurada, usuarioAtual, parseBody } from '../lib/auth.js'

const MODELO = 'claude-opus-4-8'

// Espelha LINHAS_DRE de src/lib/tipos.ts. Mantidos em sincronia manualmente
// (front e função serverless não compartilham bundle).
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

const GUIA = `Linhas do DRE (contexto: grupo do agronegócio / comércio de grãos):
- receita_bruta: venda de grãos e serviços (faturamento bruto).
- deducoes: ICMS, PIS, COFINS, Funrural, devoluções, abatimentos sobre vendas.
- custo_produto: CPV/CMV — aquisição de grãos/insumos/sementes, frete de compra, armazenagem.
- despesas_comerciais: comissões, frete de venda, marketing.
- despesas_administrativas: folha administrativa, aluguel, honorários, software, escritório.
- outras_receitas_operacionais: receitas operacionais fora da venda principal.
- depreciacao_amortizacao: depreciação de máquinas/veículos/benfeitorias, amortização.
- receita_financeira: juros recebidos, rendimentos de aplicação, descontos obtidos.
- despesa_financeira: juros pagos, tarifas bancárias, IOF, descontos concedidos.
- impostos_lucro: IRPJ e CSLL.`

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

  const { contas } = parseBody(req) as {
    contas?: { contaSafragold: string; exemplos?: string[] }[]
  }
  if (!Array.isArray(contas) || contas.length === 0) {
    res.status(400).json({ erro: 'Envie { contas: [{ contaSafragold, exemplos }] }.' })
    return
  }

  const lista = contas
    .map(
      (c) =>
        `- conta "${c.contaSafragold}"${c.exemplos?.length ? ` — históricos: ${c.exemplos.join(' | ')}` : ''}`,
    )
    .join('\n')

  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 2000,
      tool_choice: { type: 'tool', name: 'classificar_contas' },
      tools: [
        {
          name: 'classificar_contas',
          description: 'Classifica cada conta do Safragold em uma linha do DRE.',
          input_schema: {
            type: 'object',
            properties: {
              classificacoes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    contaSafragold: { type: 'string' },
                    linha: { type: 'string', enum: LINHAS as unknown as string[] },
                    confianca: {
                      type: 'number',
                      description: 'De 0 a 1. Use < 0.8 quando houver dúvida real.',
                    },
                    justificativa: { type: 'string' },
                  },
                  required: ['contaSafragold', 'linha', 'confianca', 'justificativa'],
                },
              },
            },
            required: ['classificacoes'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `${GUIA}\n\nClassifique as contas abaixo. Se o código/histórico não deixar claro, atribua a linha mais provável mas baixe a confiança (< 0.8).\n\n${lista}`,
        },
      ],
    })

    const bloco = resp.content.find((b) => b.type === 'tool_use') as
      | { input?: { classificacoes?: unknown[] } }
      | undefined
    const classificacoes = (bloco?.input?.classificacoes ?? []).filter(
      (c: any) => c && typeof c.contaSafragold === 'string' && LINHAS.includes(c.linha),
    )
    res.status(200).json({ classificacoes })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha na classificação: ${e?.message ?? String(e)}` })
  }
}
