import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const router = Router()

const cadastroSchema = z.object({
  nome: z.string().min(2).max(60),
  email: z.string().email().max(80),
  senha: z.string().min(6),
  cidade: z.string().max(40).optional().nullable(),
})

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
})

function semSenha<T extends { senha: string }>(cliente: T) {
  const { senha, ...resto } = cliente
  return resto
}

// Cadastro de cliente (item 4/5 do trabalho: cliente com id único em UUID)
router.post('/', async (req, res) => {
  const validacao = cadastroSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }

  const jaExiste = await prisma.cliente.findUnique({
    where: { email: validacao.data.email },
  })
  if (jaExiste) {
    return res.status(400).json({ erro: 'Já existe um cliente com este e-mail' })
  }

  const senhaHash = await bcrypt.hash(validacao.data.senha, 10)
  const cliente = await prisma.cliente.create({
    data: { ...validacao.data, senha: senhaHash },
  })

  res.status(201).json(semSenha(cliente))
})

router.post('/login', async (req, res) => {
  const validacao = loginSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }

  const cliente = await prisma.cliente.findUnique({
    where: { email: validacao.data.email },
  })
  if (!cliente) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos' })
  }

  const senhaOk = await bcrypt.compare(validacao.data.senha, cliente.senha)
  if (!senhaOk) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos' })
  }

  res.json(semSenha(cliente))
})

// Listagem para a área restrita do admin (item 9)
router.get('/', async (req, res) => {
  const clientes = await prisma.cliente.findMany({ orderBy: { nome: 'asc' } })
  res.json(clientes.map(semSenha))
})

// Restaurar sessão a partir do id salvo no LocalStorage (item 6/7: Contexto + LocalStorage)
router.get('/:id', async (req, res) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: req.params.id } })
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado' })
  res.json(semSenha(cliente))
})

export default router
