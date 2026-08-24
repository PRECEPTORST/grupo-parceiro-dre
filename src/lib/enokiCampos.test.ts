// Contrato entre o TRANSPORTE (api/enoki-dre.ts, via lib/enokiCampos.ts) e a
// REGRA (src/lib/enokiDre.ts).
//
// Este teste existe por causa de um bug real de produção: o endpoint enxugava as
// notas com uma ALLOWLIST escrita antes da classificação por CFOP existir. O
// campo `cfop` deixou de trafegar, o normalizador classificou 99 de 101 notas
// como "outra operação" e a RECEITA INTEIRA sumiu do DRE — sem erro, sem alerta.
// Os testes de unidade passavam porque exercitam o normalizador direto, com
// fixtures completas. Faltava justamente o teste da fronteira.
import { describe, it, expect } from 'vitest'
import {
  enxugarNf,
  enxugarTitulo,
  CAMPOS_NF_USADOS,
  CAMPOS_ITEM_USADOS,
  CAMPOS_TITULO_USADOS,
} from '../../lib/enokiCampos'
import { normalizarEnokiDre } from './enokiDre'
import { montarDre } from './dre'
import { mapaEfetivo } from './planoContas'

/** Nota fiscal CRUA, com todos os campos que a API devolve de verdade. */
const NF_CRUA = {
  idNf: 14621,
  numeroNf: 12285,
  serie: '2',
  modelo: '55',
  chaveNfe: '31260630798330000216550020000122851000122861',
  dataEmissao: '2026-06-01T00:00:00-03:00',
  status: 'Finalizada',
  statusNfe: 'Enviada',
  cfop: '6502',
  tipoOperacao: 'SAÍDA',
  finalidade: 'Normal',
  idEmpresa: 1,
  valorTotalProdutos: '88533.3332',
  valorTotalNf: '88533.3332',
  idDestinatario: 1073,
  destinatarioNome: 'CARGILL AGRICOLA S A',
  destinatarioCpfCnpj: '60498706000904',
  contratosVinculados: [{ idContrato: 1898, numeroContrato: '1008809565' }],
  chavesNfReferenciadas: ['31260600001690616806559200000442251452005675'],
  itens: [
    {
      idItem: 14791,
      idProduto: 2,
      produto: 'SOJA EM GRÃOS',
      quantidade: '40000.0000',
      valorUnitario: '2.2133333300',
      valorDesconto: '0.0000',
      valorTotal: '88533.33320000000000',
    },
  ],
}

/** Título CRU, com todos os campos que a API devolve de verdade. */
const TITULO_CRU = {
  idItemLancamento: 65578,
  idLancamento: 58632,
  seq: 1,
  qtdParcelas: 1,
  tipo: '1',
  idParceiro: 4185,
  parceiroNome: 'JOÃO EMILIO ROCHETO',
  parceiroCpfCnpj: '01690616806',
  dataLancamento: '2026-06-01T00:00:00-03:00',
  dataVencimento: '2026-06-01T00:00:00-03:00',
  valor: '24487.9459',
  documento: '44225',
  descricao: 'Fat. NFe entrada | Cont: 094/26M',
  idContrato: 1824,
  quitado: true,
  dataQuitacao: '2026-06-01T00:00:00-03:00',
  valorPago: '24487.9459',
  formaPagamento: 'TRANSFERÊNCIA PIX',
  idCentroCusto: 11,
  centroCusto: 'COMPRA MILHO',
  idContaBancaria: 2,
  contaBancaria: 'SICOOB - 756 ',
  idEmpresa: 1,
  boletosNossoNumero: [],
}

describe('o enxugamento preserva TUDO que a normalização lê', () => {
  it('nota fiscal: nenhum campo usado se perde', () => {
    const enxuta = enxugarNf(NF_CRUA)
    for (const campo of CAMPOS_NF_USADOS) {
      expect(enxuta[campo], `campo "${campo}" sumiu no enxugamento`).toBeDefined()
    }
  })

  it('item da nota: nenhum campo usado se perde', () => {
    const item = enxugarNf(NF_CRUA).itens[0]
    for (const campo of CAMPOS_ITEM_USADOS) {
      expect(item[campo], `campo de item "${campo}" sumiu`).toBeDefined()
    }
  })

  it('título: nenhum campo usado se perde', () => {
    const enxuto = enxugarTitulo(TITULO_CRU)
    for (const campo of CAMPOS_TITULO_USADOS) {
      expect(enxuto[campo], `campo "${campo}" sumiu no enxugamento`).toBeDefined()
    }
  })

  it('o CFOP sobrevive — foi exatamente ele que sumiu em produção', () => {
    expect(enxugarNf(NF_CRUA).cfop).toBe('6502')
  })
})

describe('nota enxugada produz o MESMO DRE que a nota crua', () => {
  it('a receita aparece depois de passar pelo transporte', () => {
    const cruo = normalizarEnokiDre({ nfs: [NF_CRUA], pagar: [TITULO_CRU] })
    const enxuto = normalizarEnokiDre({
      nfs: [enxugarNf(NF_CRUA)],
      pagar: [enxugarTitulo(TITULO_CRU)],
    })

    const receita = (r: typeof cruo) =>
      montarDre('2026-06', r.lancamentos, mapaEfetivo([])).linhas.find(
        (l) => l.linha === 'receita_bruta',
      )!.realizado

    // O ponto do teste: a receita NÃO pode ser zero depois do transporte.
    expect(receita(cruo)).toBeCloseTo(88533.33, 2)
    expect(receita(enxuto)).toBeCloseTo(receita(cruo), 2)
    expect(enxuto.lancamentos).toHaveLength(cruo.lancamentos.length)
    expect(enxuto.sacas).toEqual(cruo.sacas)
  })

  it('e as sacas também sobrevivem (dependem do valorUnitario)', () => {
    const r = normalizarEnokiDre({ nfs: [enxugarNf(NF_CRUA)] })
    expect(r.sacas['2026-06'].soja).toBeCloseTo(40000 / 60, 2)
  })
})

describe('o enxugamento ainda enxuga', () => {
  it('descarta os campos pesados e inúteis', () => {
    const enxuta = enxugarNf(NF_CRUA)
    expect(enxuta.chaveNfe).toBeUndefined()
    expect(enxuta.chavesNfReferenciadas).toBeUndefined()
    expect(enxugarTitulo(TITULO_CRU).boletosNossoNumero).toBeUndefined()
  })

  it('e reduz mesmo o tamanho do payload', () => {
    const antes = JSON.stringify(NF_CRUA).length
    const depois = JSON.stringify(enxugarNf(NF_CRUA)).length
    expect(depois).toBeLessThan(antes)
  })

  it('aguenta registro vazio ou malformado sem quebrar', () => {
    expect(enxugarNf({}).itens).toEqual([])
    expect(enxugarNf(null).itens).toEqual([])
    expect(enxugarTitulo(null)).toEqual({})
  })
})
