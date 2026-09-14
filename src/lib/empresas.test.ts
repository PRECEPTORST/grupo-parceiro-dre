import { describe, it, expect } from 'vitest'
import { noDre, EMPRESA_CAFE, EMPRESAS_DO_DRE } from './empresas'

describe('escopo do DRE', () => {
  it('a matriz (operação de café) fica de fora', () => {
    // 97,1% do que a empresa 2 movimenta é café: é outro negócio, outro CNPJ.
    expect(noDre(EMPRESA_CAFE)).toBe(false)
  })

  it('as filiais de cereais entram', () => {
    expect(noDre(1)).toBe(true)
    expect(noDre(3)).toBe(true)
  })

  it('empresa desconhecida não entra por omissão', () => {
    // AGRO BUSINESS e TOMAZ & PAULA são CNPJs distintos; nem por engano.
    expect(noDre(4)).toBe(false)
    expect(noDre(undefined)).toBe(false)
    expect(noDre('1')).toBe(true) // a API às vezes manda string
  })

  it('a empresa de café não está no conjunto do DRE', () => {
    expect(EMPRESAS_DO_DRE.has(EMPRESA_CAFE)).toBe(false)
  })
})
