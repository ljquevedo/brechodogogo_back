import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const router = Router()

const loginSchema = z.object({
  // login do admin aceita qualquer texto (ex.: admin@brecho), sem exigir domínio .com
  email: z.string().min(1),
  senha: z.string().min(1),
})

function semSenha<T extends { senha: string }>(admin: T) {
  const { senha, ...resto } = admin
  return resto
}

// Não existe rota pública de cadastro de admin: administradores são criados
// via prisma/seed.ts. Isso é proposital, por segurança (área restrita).
router.post('/login', async (req, res) => {
  const validacao = loginSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }

  const admin = await prisma.admin.findUnique({
    where: { email: validacao.data.email },
  })
  if (!admin) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos' })
  }

  const senhaOk = await bcrypt.compare(validacao.data.senha, admin.senha)
  if (!senhaOk) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos' })
  }

  res.json(semSenha(admin))
})

export default router
