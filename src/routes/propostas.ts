import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const router = Router()

const propostaSchema = z.object({
  mensagem: z.string().min(3),
  valorOferta: z.number().positive().optional(),
  pecaId: z.number().int().positive(),
  clienteId: z.string().uuid(),
})

const respostaSchema = z.object({
  resposta: z.string().min(1),
  status: z.enum(['ACEITA', 'RECUSADA']),
  // quem responde: o vendedor da peça (clienteId) ou o admin, nas peças da casa
  clienteId: z.string().uuid().optional(),
  porAdmin: z.boolean().optional(),
})

const vendedorPublico = { select: { id: true, nome: true, cidade: true } }
const contato = { select: { id: true, nome: true, email: true, cidade: true } }

// Comprador envia uma proposta (mensagem + valor opcional) para um anúncio disponível
router.post('/', async (req, res) => {
  const validacao = propostaSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }

  const peca = await prisma.peca.findUnique({ where: { id: validacao.data.pecaId } })
  if (!peca) return res.status(404).json({ erro: 'Peça não encontrada' })
  if (peca.status !== 'DISPONIVEL') {
    return res.status(409).json({ erro: 'Esta peça não está disponível para propostas' })
  }
  if (peca.vendedorId === validacao.data.clienteId) {
    return res.status(400).json({ erro: 'Você não pode fazer proposta no seu próprio anúncio' })
  }

  const proposta = await prisma.proposta.create({
    data: validacao.data,
    include: { peca: true },
  })
  res.status(201).json(proposta)
})

// Listagem geral para a área restrita do admin (acompanhamento)
router.get('/', async (req, res) => {
  const propostas = await prisma.proposta.findMany({
    include: { peca: { include: { vendedor: vendedorPublico } }, cliente: vendedorPublico },
    orderBy: { createdAt: 'desc' },
  })
  res.json(propostas)
})

// "Minhas propostas": o que o cliente enviou como comprador
router.get('/cliente/:clienteId', async (req, res) => {
  const propostas = await prisma.proposta.findMany({
    where: { clienteId: req.params.clienteId },
    include: { peca: { include: { vendedor: vendedorPublico } } },
    orderBy: { createdAt: 'desc' },
  })
  res.json(propostas)
})

// "Propostas recebidas": propostas feitas nos anúncios do cliente (vendedor)
router.get('/recebidas/:clienteId', async (req, res) => {
  const propostas = await prisma.proposta.findMany({
    where: { peca: { vendedorId: req.params.clienteId } },
    include: { peca: true, cliente: vendedorPublico },
    orderBy: { createdAt: 'desc' },
  })
  res.json(propostas)
})

// Vendedor (ou admin, em peça da casa) aceita ou recusa.
// Aceitar reserva a peça para o autor da proposta e recusa as demais propostas pendentes.
router.put('/:id', async (req, res) => {
  const validacao = respostaSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }
  const { resposta, status, clienteId, porAdmin } = validacao.data
  const id = Number(req.params.id)

  const proposta = await prisma.proposta.findUnique({ where: { id }, include: { peca: true } })
  if (!proposta) return res.status(404).json({ erro: 'Proposta não encontrada' })

  const { peca } = proposta
  const autorizado =
    peca.vendedorId === null ? porAdmin === true : clienteId === peca.vendedorId
  if (!autorizado) {
    return res.status(403).json({ erro: 'Só o vendedor pode responder esta proposta' })
  }
  if (proposta.status !== 'PENDENTE') {
    return res.status(409).json({ erro: 'Esta proposta já foi respondida' })
  }

  if (status === 'RECUSADA') {
    const recusada = await prisma.proposta.update({
      where: { id },
      data: { resposta, status, respondidoEm: new Date() },
      include: { peca: true, cliente: vendedorPublico },
    })
    return res.json(recusada)
  }

  // ACEITA: reserva a peça de forma atômica (só se ainda estiver disponível)
  const reservou = await prisma.peca.updateMany({
    where: { id: peca.id, status: 'DISPONIVEL' },
    data: {
      status: 'RESERVADA',
      compradorId: proposta.clienteId,
      precoFinal: proposta.valorOferta ?? peca.preco,
    },
  })
  if (reservou.count === 0) {
    return res.status(409).json({ erro: 'A peça não está mais disponível' })
  }

  const agora = new Date()
  await prisma.proposta.updateMany({
    where: { pecaId: peca.id, status: 'PENDENTE', NOT: { id } },
    data: { status: 'RECUSADA', resposta: 'Peça reservada para outro comprador', respondidoEm: agora },
  })
  const aceita = await prisma.proposta.update({
    where: { id },
    data: { resposta, status, respondidoEm: agora },
    include: { peca: true, cliente: contato },
  })
  res.json(aceita)
})

router.delete('/:id', async (req, res) => {
  await prisma.proposta.delete({ where: { id: Number(req.params.id) } })
  res.status(204).send()
})

export default router
