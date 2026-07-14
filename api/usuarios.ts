// Gestão de usuários — SOMENTE administradores.
//   GET    -> { usuarios: [{id,usuario,papel,criadoEm}] }
//   POST   -> cria {usuario,senha,papel}
//   PUT    -> atualiza {id, papel?, senha?}
//   DELETE -> remove {id}
import {
  authConfigurada,
  usuarioAtual,
  carregarUsuarios,
  salvarUsuarios,
  hashSenha,
  usuarioPublico,
  parseBody,
  type Papel,
  type Usuario,
} from '../lib/auth.js'

const PAPEIS: Papel[] = ['admin', 'comercial']

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
  if (atual.papel !== 'admin') {
    res.status(403).json({ erro: 'Apenas administradores podem gerenciar usuários.' })
    return
  }

  try {
    const usuarios = await carregarUsuarios()

    if (req.method === 'GET') {
      res.status(200).json({ usuarios: usuarios.map(usuarioPublico) })
      return
    }

    if (req.method === 'POST') {
      const { usuario, senha, papel } = parseBody(req)
      const nome = String(usuario || '').trim()
      if (!nome || !senha || String(senha).length < 6 || !PAPEIS.includes(papel)) {
        res.status(400).json({ erro: 'Informe usuário, senha (mín. 6) e papel válido.' })
        return
      }
      if (usuarios.some((u) => u.usuario.toLowerCase() === nome.toLowerCase())) {
        res.status(409).json({ erro: 'Já existe um usuário com esse nome.' })
        return
      }
      const { salt, senhaHash } = hashSenha(String(senha))
      const novo: Usuario = {
        id: `u-${Date.now()}`,
        usuario: nome,
        papel,
        senhaHash,
        salt,
        criadoEm: new Date().toISOString(),
      }
      await salvarUsuarios([...usuarios, novo])
      res.status(200).json({ usuario: usuarioPublico(novo) })
      return
    }

    if (req.method === 'PUT') {
      const { id, papel, senha } = parseBody(req)
      const alvo = usuarios.find((u) => u.id === id)
      if (!alvo) {
        res.status(404).json({ erro: 'Usuário não encontrado.' })
        return
      }
      if (papel && PAPEIS.includes(papel)) alvo.papel = papel
      if (senha) {
        if (String(senha).length < 6) {
          res.status(400).json({ erro: 'A senha deve ter ao menos 6 caracteres.' })
          return
        }
        const { salt, senhaHash } = hashSenha(String(senha))
        alvo.salt = salt
        alvo.senhaHash = senhaHash
      }
      if (!usuarios.some((u) => u.papel === 'admin')) {
        res.status(400).json({ erro: 'É preciso manter ao menos um administrador.' })
        return
      }
      await salvarUsuarios(usuarios)
      res.status(200).json({ usuario: usuarioPublico(alvo) })
      return
    }

    if (req.method === 'DELETE') {
      const id = parseBody(req).id || req.query?.id
      if (id === atual.id) {
        res.status(400).json({ erro: 'Você não pode excluir a si mesmo.' })
        return
      }
      const restantes = usuarios.filter((u) => u.id !== id)
      if (restantes.length === usuarios.length) {
        res.status(404).json({ erro: 'Usuário não encontrado.' })
        return
      }
      if (!restantes.some((u) => u.papel === 'admin')) {
        res.status(400).json({ erro: 'É preciso manter ao menos um administrador.' })
        return
      }
      await salvarUsuarios(restantes)
      res.status(200).json({ ok: true })
      return
    }

    res.status(405).json({ erro: 'Método não suportado.' })
  } catch (e: any) {
    res.status(502).json({ erro: `Falha ao gerenciar usuários: ${e?.message ?? String(e)}` })
  }
}
