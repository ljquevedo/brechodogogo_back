import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const router = Router()

const propostaSchema = z.object({
  mensagem: z.string().min(3),
  pecaId: z.number().int().positive(),
  clienteId: z.string().uuid(),
})

const respostaSchema = z.object({
  resposta: z.string().min(1),
  status: z.enum(['ACEITA', 'RECUSADA']),
})

// Cliente envia uma proposta para uma peça (item 5 do trabalho)
router.post('/', async (req, res) => {
  const validacao = propostaSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }
  const proposta = await prisma.proposta.create({
    data: validacao.data,
    include: { peca: true },
  })
  res.status(201).json(proposta)
})

// Listagem geral para a área restrita do admin (item 9)
router.get('/', async (req, res) => {
  const propostas = await prisma.proposta.findMany({
    include: { peca: true, cliente: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json(propostas)
})

// Propostas de um cliente específico ("Minhas Propostas")
router.get('/cliente/:clienteId', async (req, res) => {
  const propostas = await prisma.proposta.findMany({
    where: { clienteId: req.params.clienteId },
    include: { peca: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json(propostas)
})

// Admin aceita ou recusa, com uma resposta em texto
router.put('/:id', async (req, res) => {
  const validacao = respostaSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }
  const proposta = await prisma.proposta.update({
    where: { id: Number(req.params.id) },
    data: {
      resposta: validacao.data.resposta,
      status: validacao.data.status,
      respondidoEm: new Date(),
    },
    include: { peca: true, cliente: true },
  })
  res.json(proposta)
})

router.delete('/:id', async (req, res) => {
  await prisma.proposta.delete({ where: { id: Number(req.params.id) } })
  res.status(204).send()
})

export default router
