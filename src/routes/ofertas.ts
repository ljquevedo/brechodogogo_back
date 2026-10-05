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
  // usados quando a oferta é aceita: a peça já entra na loja (home)
  categoriaId: z.number().int().positive().optional(),
  precoVenda: z.number().positive().optional(),
})

const publicarSchema = z.object({
  categoriaId: z.number().int().positive(),
  precoVenda: z.number().positive().optional(),
})

// Transforma uma oferta aceita em peça do catálogo (aparece na home, pois destaque = true).
// Não duplica: se já existe peça com a mesma foto e descrição, devolve a existente.
async function publicarOferta(
  oferta: {
    descricao: string
    marca: string | null
    tamanho: string
    precoDesejado: unknown
    foto: string
    detalhes: string | null
    condicao: 'NOVA' | 'SEMINOVA' | 'USADA' | 'COM_AVARIAS'
  },
  categoriaId: number,
  precoVenda?: number,
) {
  const existente = await prisma.peca.findFirst({
    where: { foto: oferta.foto, descricao: oferta.descricao },
  })
  if (existente) return existente

  return prisma.peca.create({
    data: {
      descricao: oferta.descricao,
      marca: oferta.marca,
      tamanho: oferta.tamanho,
      preco: precoVenda ?? Number(oferta.precoDesejado),
      foto: oferta.foto,
      detalhes: oferta.detalhes,
      condicao: oferta.condicao,
      destaque: true,
      categoriaId,
    },
  })
}

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
  // marca quais ofertas já viraram peça no catálogo (mesma foto + descrição)
  const pecas = await prisma.peca.findMany({
    where: { foto: { in: ofertas.map((o) => o.foto) } },
    select: { foto: true, descricao: true },
  })
  const publicadas = new Set(pecas.map((p) => `${p.foto}|${p.descricao}`))

  res.json(
    ofertas.map(({ cliente, ...oferta }) => {
      const { senha, ...clienteSemSenha } = cliente
      return {
        ...oferta,
        cliente: clienteSemSenha,
        publicada: publicadas.has(`${oferta.foto}|${oferta.descricao}`),
      }
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
  const { resposta, status, categoriaId, precoVenda } = validacao.data

  if (status === 'ACEITA' && !categoriaId) {
    return res.status(400).json({ erro: 'Escolha a categoria para publicar a peça na loja' })
  }

  const oferta = await prisma.ofertaVenda.update({
    where: { id: Number(req.params.id) },
    data: { resposta, status, respondidoEm: new Date() },
  })

  // Oferta aceita => a peça entra no catálogo e aparece na página inicial
  if (status === 'ACEITA' && categoriaId) {
    const peca = await publicarOferta(oferta, categoriaId, precoVenda)
    return res.json({ ...oferta, pecaId: peca.id, publicada: true })
  }

  res.json(oferta)
})

// Publica na loja uma oferta que já tinha sido aceita (antes de existir a publicação automática)
router.post('/:id/publicar', async (req, res) => {
  const validacao = publicarSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }
  const oferta = await prisma.ofertaVenda.findUnique({ where: { id: Number(req.params.id) } })
  if (!oferta) return res.status(404).json({ erro: 'Oferta não encontrada' })
  if (oferta.status !== 'ACEITA') {
    return res.status(400).json({ erro: 'Só ofertas aceitas podem ser publicadas' })
  }
  const peca = await publicarOferta(oferta, validacao.data.categoriaId, validacao.data.precoVenda)
  res.status(201).json(peca)
})

router.delete('/:id', async (req, res) => {
  await prisma.ofertaVenda.delete({ where: { id: Number(req.params.id) } })
  res.status(204).send()
})

export default router
