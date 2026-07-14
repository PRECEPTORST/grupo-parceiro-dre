// Sessão: quem sou (GET), login/setup (POST), logout (DELETE).
//   GET    -> { precisaSetup: boolean, usuario: {id,usuario,papel} | null }
//   POST   -> login {usuario,senha}; ou 1º acesso {acao:'setup',usuario,senha} cria o admin
//   DELETE -> encerra a sessão
import {
  authConfigurada,
  carregarUsuarios,
  salvarUsuarios,
  hashSenha,
  conferirSenha,
  emitirSessao,
  limparCookieSessao,
  usuarioAtual,
  usuarioPublico,
  parseBody,
  type Usuario,
} from '../lib/auth.js'

export default async function handler(req: any, res: any) {
  if (!authConfigurada()) {
    res.status(500).json({ erro: 'Autenticação não configurada (BLOB_READ_WRITE_TOKEN/AUTH_SECRET).' })
    return
  }

  try {
    if (req.method === 'GET') {
      // Revalida a sessão contra o store (revogação imediata).
      const atual = await usuarioAtual(req)
      if (atual) {
        res.status(200).json({ precisaSetup: false, usuario: atual })
        return
      }
      // Sem sessão válida: verifica se ainda precisa criar o 1º admin.
      const usuarios = await carregarUsuarios()
      res.status(200).json({ precisaSetup: usuarios.length === 0, usuario: null })
      return
    }

    if (req.method === 'POST') {
      const { usuario, senha, acao } = parseBody(req)
      const usuarios = await carregarUsuarios()

      // 1º acesso: cria o administrador inicial.
      if (usuarios.length === 0 || acao === 'setup') {
        if (usuarios.length !== 0) {
          res.status(409).json({ erro: 'A configuração inicial já foi concluída.' })
          return
        }
        if (!usuario || !senha || String(senha).length < 6) {
          res.status(400).json({ erro: 'Informe usuário e uma senha de ao menos 6 caracteres.' })
          return
        }
        const { salt, senhaHash } = hashSenha(String(senha))
        const admin: Usuario = {
          id: `u-${Date.now()}`,
          usuario: String(usuario).trim(),
          papel: 'admin',
          senhaHash,
          salt,
          criadoEm: new Date().toISOString(),
        }
        await salvarUsuarios([admin])
        emitirSessao(res, admin)
        res.status(200).json({ usuario: usuarioPublico(admin) })
        return
      }

      // Login normal.
      const achado = usuarios.find(
        (u) => u.usuario.toLowerCase() === String(usuario || '').trim().toLowerCase(),
      )
      if (!achado || !conferirSenha(String(senha || ''), achado.salt, achado.senhaHash)) {
        res.status(401).json({ erro: 'Usuário ou senha inválidos.' })
        return
      }
      emitirSessao(res, achado)
      res.status(200).json({ usuario: usuarioPublico(achado) })
      return
    }

    if (req.method === 'DELETE') {
      limparCookieSessao(res)
      res.status(200).json({ ok: true })
      return
    }

    res.status(405).json({ erro: 'Método não suportado.' })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha na autenticação: ${e?.message ?? String(e)}` })
  }
}
