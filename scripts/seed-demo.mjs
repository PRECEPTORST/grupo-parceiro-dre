// Semeia o estado da nuvem (Blob) com um cenário de demonstração completo:
// lançamentos + classificações + orçamento. Mesmo formato de lib/blobdoc.ts.
// Uso: node scripts/seed-demo.mjs   (lê BLOB_READ_WRITE_TOKEN do .env.local)
import { readFileSync } from 'node:fs'
import { put, list, del } from '@vercel/blob'

// carrega o token do .env.local
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const token = env.match(/BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?/)?.[1]
if (!token) throw new Error('BLOB_READ_WRITE_TOKEN não encontrado no .env.local')

const cls = (contaSafragold, linha, justificativa = '') => ({
  contaSafragold,
  linha,
  confianca: 1,
  justificativa,
})
const L = (id, data, contaSafragold, valor, historico) => ({ id, data, contaSafragold, valor, historico })

const estado = {
  lancamentos: [
    L('sim-1', '2026-06-05', '3.1.01', 1_240_000, 'Venda de soja - contrato 4471'),
    L('sim-2', '2026-06-08', '3.1.01', 610_000, 'Venda de milho - contrato 4478'),
    L('sim-3', '2026-06-10', '3.2.01', 205_000, 'ICMS sobre vendas'),
    L('sim-4', '2026-06-10', '3.2.02', 34_000, 'Funrural'),
    L('sim-5', '2026-06-12', '4.1.01', 980_000, 'Aquisição de grãos p/ revenda'),
    L('sim-6', '2026-06-15', '4.1.05', 72_000, 'Frete sobre compras'),
    L('sim-7', '2026-06-18', '4.2.10', 41_000, 'Comissão de vendas'),
    L('sim-8', '2026-06-20', '4.3.01', 88_000, 'Folha administrativa'),
    L('sim-9', '2026-06-22', '4.3.08', 15_000, 'Aluguel do escritório'),
    L('sim-10', '2026-06-25', '4.4.01', 27_500, 'Juros de empréstimo Banco X'),
    L('sim-11', '2026-06-28', '3.5.01', 9_800, 'Rendimento de aplicação CDB'),
    // Mês anterior (para o gráfico de evolução):
    L('sim-12', '2026-05-06', '3.1.01', 1_050_000, 'Venda de soja - contrato 4460'),
    L('sim-13', '2026-05-10', '3.2.01', 172_000, 'ICMS sobre vendas'),
    L('sim-14', '2026-05-13', '4.1.01', 690_000, 'Aquisição de grãos p/ revenda'),
    L('sim-15', '2026-05-21', '4.3.01', 86_000, 'Folha administrativa'),
  ],
  classificacoes: [
    cls('3.1.01', 'receita_bruta', 'Venda de grãos — faturamento bruto.'),
    cls('3.2.01', 'deducoes', 'ICMS sobre vendas.'),
    cls('3.2.02', 'deducoes', 'Funrural incidente sobre a comercialização.'),
    cls('4.1.01', 'custo_produto', 'Aquisição de grãos para revenda (CMV).'),
    cls('4.1.05', 'custo_produto', 'Frete sobre compras compõe o custo.'),
    cls('4.2.10', 'despesas_comerciais', 'Comissão sobre vendas.'),
    cls('4.3.01', 'despesas_administrativas', 'Folha administrativa.'),
    cls('4.3.08', 'despesas_administrativas', 'Aluguel do escritório.'),
    cls('4.4.01', 'despesa_financeira', 'Juros de empréstimo.'),
    cls('3.5.01', 'receita_financeira', 'Rendimento de aplicação financeira.'),
  ],
  orcamentos: [
    {
      competencia: '2026-06',
      origem: 'sugerido',
      atualizadoEm: '2026-06-01T12:00:00.000Z',
      valores: {
        '3.1.01': 1_700_000,
        '3.2.01': 210_000,
        '3.2.02': 30_000,
        '4.1.01': 1_000_000,
        '4.1.05': 60_000,
        '4.2.10': 35_000,
        '4.3.01': 85_000,
        '4.3.08': 15_000,
        '4.4.01': 20_000,
        '3.5.01': 8_000,
      },
    },
  ],
}

const criado = await put('estado/v.json', JSON.stringify(estado), {
  access: 'private',
  addRandomSuffix: true,
  contentType: 'application/json',
  token,
})
// remove versões antigas (best-effort), como o app faz
try {
  const { blobs } = await list({ prefix: 'estado/', token })
  const antigas = blobs.filter((b) => b.url !== criado.url).map((b) => b.url)
  if (antigas.length) await del(antigas, { token })
} catch {}

console.log('OK — estado semeado.')
console.log('lançamentos:', estado.lancamentos.length, '| contas classificadas:', estado.classificacoes.length, '| orçamento: 2026-06')
