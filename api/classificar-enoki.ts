// Classificador do RESÍDUO da Enoki — item 1.4 do ROADMAP.md.
//
// A esmagadora maioria dos títulos é classificada por regra DETERMINÍSTICA a
// partir do centro de custo (`src/lib/centroCusto.ts`). Sobra um resíduo pequeno:
// títulos marcados "SEM CC" no ERP. Na validação de jan–jul/2026 isso era
// R$ 2,5M de R$ 437M movimentados — menos de 1%.
//
// Este agente olha o PARCEIRO e os históricos desses títulos e sugere a CONTA do
// plano. Ele não calcula nada: devolve uma sugestão com confiança, o app grava
// como regra aprendida e o usuário pode corrigir — a correção manual sempre
// vence. Uma vez aprendida, a chave nunca mais volta para o modelo.
import Anthropic from '@anthropic-ai/sdk'
import { authConfigurada, usuarioAtual, parseBody } from '../lib/auth.js'

export const config = { maxDuration: 120 }

const MODELO = 'claude-opus-4-8'

/** Contas do plano que o agente pode escolher (espelha `src/lib/planoContas.ts`). */
const CONTAS: [string, string][] = [
  ['3.1.09', 'Receita de armazenagem'],
  ['3.1.12', 'Receita de frete e logística'],
  ['3.1.13', 'Corretagem e intermediação'],
  ['3.2.01', 'ICMS sobre vendas'],
  ['3.2.05', 'ISS sobre serviços'],
  ['3.2.06', 'Devoluções de vendas'],
  ['3.4.02', 'Venda de sucata e resíduos'],
  ['3.4.03', 'Subvenções e incentivos fiscais'],
  ['3.4.04', 'Recuperação de despesas'],
  ['3.5.01', 'Rendimentos de aplicações financeiras'],
  ['3.5.02', 'Juros ativos recebidos'],
  ['3.5.03', 'Descontos obtidos'],
  ['4.1.10', 'Frete sobre compras'],
  ['4.1.11', 'Armazenagem de terceiros'],
  ['4.1.12', 'Secagem e limpeza (custo)'],
  ['4.1.13', 'Classificação e análise de grãos'],
  ['4.2.01', 'Comissões de vendas'],
  ['4.2.03', 'Frete sobre vendas'],
  ['4.2.04', 'Marketing e publicidade'],
  ['4.2.05', 'Viagens e representação comercial'],
  ['4.3.01', 'Salários e ordenados (administrativo)'],
  ['4.3.02', 'Encargos sociais (INSS/FGTS)'],
  ['4.3.03', 'Pró-labore'],
  ['4.3.04', 'Benefícios (VT/VR/plano de saúde)'],
  ['4.3.05', 'Honorários contábeis'],
  ['4.3.06', 'Honorários advocatícios e consultoria'],
  ['4.3.07', 'Aluguel e condomínio'],
  ['4.3.08', 'Energia elétrica'],
  ['4.3.09', 'Água e saneamento'],
  ['4.3.10', 'Telefonia e internet'],
  ['4.3.11', 'Software e licenças (ERP, sistemas)'],
  ['4.3.12', 'Material de escritório'],
  ['4.3.13', 'Manutenção e conservação'],
  ['4.3.14', 'Combustíveis e manutenção de veículos'],
  ['4.3.15', 'Seguros administrativos'],
  ['4.3.16', 'Viagens e estadias (administrativo)'],
  ['4.3.17', 'Taxas e contribuições (associações, sindicatos)'],
  ['4.3.19', 'Segurança e vigilância'],
  ['4.3.20', 'Outras despesas administrativas'],
  ['4.4.01', 'Juros sobre empréstimos e financiamentos'],
  ['4.4.02', 'Juros de capital de giro'],
  ['4.4.03', 'Tarifas bancárias'],
  ['4.4.04', 'IOF'],
  ['4.4.05', 'Descontos concedidos'],
  ['4.6.01', 'IRPJ'],
  ['4.6.02', 'CSLL'],
  ['5.1.01', 'Imobilizado e equipamentos'],
  ['5.1.02', 'Veículos'],
  ['5.1.04', 'Obras e benfeitorias'],
  ['5.1.05', 'Móveis e utensílios'],
  ['5.1.06', 'Terrenos'],
]

const CODIGOS = CONTAS.map(([c]) => c)

const GUIA = `Você classifica títulos financeiros de um ERP de COMÉRCIO DE GRÃOS (soja, milho, sorgo, café) na conta contábil correta.

Cada item é um PARCEIRO (fornecedor ou cliente) com uma amostra dos históricos dos títulos dele que ficaram sem centro de custo no ERP. Você recebe também o FLUXO:
- "saida" = a empresa PAGA esse parceiro → quase sempre custo, despesa ou investimento.
- "entrada" = a empresa RECEBE desse parceiro → receita.

Regras de bom senso:
- Banco/cooperativa (SICOOB, BRADESCO, ITAÚ…) pagando → tarifas (4.4.03), juros (4.4.01) ou IOF (4.4.04), conforme o histórico.
- Prefeitura, Receita Federal, secretarias → tributos; sobre o lucro use 4.6.01/4.6.02, sobre vendas 3.2.01/3.2.05.
- Transportadora → 4.1.10 se for frete de COMPRA/logística de mercadoria, 4.2.03 se for frete de VENDA.
- Pessoa física sem outra pista, com pagamentos recorrentes → folha (4.3.01) ou pró-labore (4.3.03).
- Concessionária de energia/água/telefone → 4.3.08 / 4.3.09 / 4.3.10.
- Compra de veículo, terreno, obra, máquina → investimento (5.1.x), não despesa.
- Na dúvida real, escolha a conta mais genérica plausível e devolva confianca < 0.8 para o item ir para revisão humana. NUNCA invente um código fora da lista.`

export default async function handler(req: any, res: any) {
  if (!authConfigurada()) {
    res.status(500).json({ erro: 'Autenticação não configurada.' })
    return
  }
  if (!(await usuarioAtual(req))) {
    res.status(401).json({ erro: 'Não autenticado.' })
    return
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada.' })
    return
  }

  const { pendencias } = parseBody(req) as {
    pendencias?: { chave?: string; fluxo?: string; valor?: number; amostras?: string[] }[]
  }
  if (!Array.isArray(pendencias) || pendencias.length === 0) {
    res.status(400).json({ erro: 'Envie { pendencias: [{ chave, fluxo, amostras }] }.' })
    return
  }

  // Prioriza as pendências MATERIAIS: classificar 200 centavos não muda o DRE.
  const limpa = pendencias
    .filter((p) => p && typeof p.chave === 'string' && p.chave.trim())
    .sort((a, b) => Number(b.valor ?? 0) - Number(a.valor ?? 0))
    .slice(0, 120)

  const lista = limpa
    .map((p) => {
      const amostras = (p.amostras ?? []).slice(0, 3).join(' | ') || '(sem histórico)'
      return `- chave: "${p.chave}" · fluxo: ${p.fluxo === 'entrada' ? 'entrada' : 'saida'} · históricos: ${amostras}`
    })
    .join('\n')

  const catalogo = CONTAS.map(([c, d]) => `${c} = ${d}`).join('\n')

  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 4000,
      tool_choice: { type: 'tool', name: 'classificar_parceiros' },
      tools: [
        {
          name: 'classificar_parceiros',
          description: 'Classifica cada parceiro pendente numa conta do plano de contas.',
          input_schema: {
            type: 'object',
            properties: {
              regras: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    chave: { type: 'string', description: 'A chave EXATA recebida.' },
                    conta: { type: 'string', enum: CODIGOS },
                    confianca: { type: 'number', description: 'De 0 a 1. Use < 0.8 na dúvida real.' },
                    justificativa: { type: 'string', description: 'Uma frase curta.' },
                  },
                  required: ['chave', 'conta', 'confianca', 'justificativa'],
                },
              },
            },
            required: ['regras'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `${GUIA}\n\nCONTAS DISPONÍVEIS:\n${catalogo}\n\nClassifique cada parceiro abaixo. Devolva a MESMA chave recebida em cada item.\n\n${lista}`,
        },
      ],
    })

    const bloco = resp.content.find((b) => b.type === 'tool_use') as
      | { input?: { regras?: unknown[] } }
      | undefined
    const regras = (bloco?.input?.regras ?? []).filter(
      (r: any) => r && typeof r.chave === 'string' && CODIGOS.includes(r.conta),
    )
    res.status(200).json({ regras })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha na classificação: ${e?.message ?? String(e)}` })
  }
}
