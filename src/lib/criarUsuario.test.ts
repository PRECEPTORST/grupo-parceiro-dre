/// <reference types="node" />
// Guarda o contrato entre `scripts/criar-usuario.mjs` e o login do app.
//
// O script grava o hash da senha direto no Blob; o app confere no login. Se os
// dois algoritmos divergirem, o usuário é criado com sucesso e MESMO ASSIM não
// consegue entrar — falha silenciosa e difícil de diagnosticar. Este teste
// impede a divergência.
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { conferirSenha } from '../../lib/auth'

/** Cópia EXATA do algoritmo usado em scripts/criar-usuario.mjs. */
function hashDoScript(texto: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const senhaHash = crypto.scryptSync(texto, salt, 64).toString('hex')
  return { salt, senhaHash }
}

describe('scripts/criar-usuario.mjs produz hash que o app aceita', () => {
  it('a senha criada pelo script passa no conferirSenha do app', () => {
    const { salt, senhaHash } = hashDoScript('admin123')
    expect(conferirSenha('admin123', salt, senhaHash)).toBe(true)
  })

  it('senha errada é rejeitada', () => {
    const { salt, senhaHash } = hashDoScript('admin123')
    expect(conferirSenha('admin124', salt, senhaHash)).toBe(false)
  })

  it('vale para senha com acento e símbolo', () => {
    const senha = 'Grão#2026!parceiro'
    const { salt, senhaHash } = hashDoScript(senha)
    expect(conferirSenha(senha, salt, senhaHash)).toBe(true)
  })
})
