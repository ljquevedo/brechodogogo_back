import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const router = Router()

const ofertaSchema = z.object({
  descricao: z.string().min(2).max(60),
  marca: z.string().max(30).optional().nullable(),
  tamanho: z.string().min(1).max(5),
  precoDesejado: z.number().positive(),
  foto: z.string().min(1),
  detalhes: z.string().optional().nullable(),
  condicao: z.enum(['NOVA', 'SEMINOVA', 'USADA', 'COM_AVARIAS']).optional(),
  clienteId: z.string().uuid(),
})

const respostaSchema = z.object({
  resposta: z.string().min(1),
  status: z.enum(['ACEITA', 'RECUSADA']),
})

// Cliente oferece uma peça para o brechó ("Quero vender")
router.post('/', async (req, res) => {
  const validacao = ofertaSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }
  const oferta = await prisma.ofertaVenda.create({ data: validacao.data })
  res.status(201).json(oferta)
})

// Listagem geral para a área restrita do admin
router.get('/', async (req, res) => {
  const ofertas = await prisma.ofertaVenda.findMany({
    include: { cliente: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json(
    ofertas.map(({ cliente, ...oferta }) => {
      const { senha, ...clienteSemSenha } = cliente
      return { ...oferta, cliente: clienteSemSenha }
    }),
  )
})

// Ofertas de um cliente específico
router.get('/cliente/:clienteId', async (req, res) => {
  const ofertas = await prisma.ofertaVenda.findMany({
    where: { clienteId: req.params.clienteId },
    orderBy: { createdAt: 'desc' },
  })
  res.json(ofertas)
})

// Admin aceita ou recusa, com uma resposta em texto
router.put('/:id', async (req, res) => {
  const validacao = respostaSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }
  const oferta = await prisma.ofertaVenda.update({
    where: { id: Number(req.params.id) },
    data: {
      resposta: validacao.data.resposta,
      status: validacao.data.status,
      respondidoEm: new Date(),
    },
  })
  res.json(oferta)
})

router.delete('/:id', async (req, res) => {
  await prisma.ofertaVenda.delete({ where: { id: Number(req.params.id) } })
  res.status(204).send()
})

export default router
