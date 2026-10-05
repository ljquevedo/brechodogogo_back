import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { buscarDadosComGemini } from '../services/ia'

const router = Router()

const pecaSchema = z.object({
  descricao: z.string().min(2).max(60),
  marca: z.string().max(30).optional().nullable(),
  tamanho: z.string().min(1).max(5),
  preco: z.number().positive(),
  foto: z.string().min(1),
  detalhes: z.string().optional().nullable(),
  condicao: z.enum(['NOVA', 'SEMINOVA', 'USADA', 'COM_AVARIAS']).optional(),
  destaque: z.boolean().optional(),
  categoriaId: z.number().int().positive(),
})

// GET /pecas            -> todas
// GET /pecas?destaque=true -> só as peças em destaque (usado na home)
router.get('/', async (req, res) => {
  const somenteDestaque = req.query.destaque === 'true'
  const pecas = await prisma.peca.findMany({
    where: somenteDestaque ? { destaque: true } : undefined,
    include: { categoria: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json(pecas)
})

// Pesquisa entre as peças em destaque: texto busca em descrição/marca/categoria,
// número até 50 filtra por tamanho, número maior filtra por preço máximo.
router.get('/pesquisa/:termo', async (req, res) => {
  const termo = req.params.termo
  const numero = Number(termo)

  let where: any = { destaque: true }

  if (!Number.isNaN(numero) && termo.trim() !== '') {
    if (numero <= 50) {
      where = { ...where, tamanho: { equals: String(numero) } }
    } else {
      where = { ...where, preco: { lte: numero } }
    }
  } else {
    where = {
      ...where,
      OR: [
        { descricao: { contains: termo, mode: 'insensitive' } },
        { marca: { contains: termo, mode: 'insensitive' } },
        { categoria: { nome: { contains: termo, mode: 'insensitive' } } },
      ],
    }
  }

  const pecas = await prisma.peca.findMany({
    where,
    include: { categoria: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json(pecas)
})

router.get('/:id', async (req, res) => {
  const peca = await prisma.peca.findUnique({
    where: { id: Number(req.params.id) },
    include: { categoria: true },
  })
  if (!peca) return res.status(404).json({ erro: 'Peça não encontrada' })
  res.json(peca)
})

router.post('/', async (req, res) => {
  const validacao = pecaSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }

  const peca = await prisma.peca.create({
    data: validacao.data,
    include: { categoria: true },
  })

  // Enriquecimento por IA é "melhor esforço": se falhar, a peça já foi
  // criada normalmente e a resposta segue com 201 do mesmo jeito.
  try {
    const dadosIA = await buscarDadosComGemini(
      peca.categoria.nome,
      peca.marca,
      peca.descricao,
    )
    if (dadosIA) {
      const pecaAtualizada = await prisma.peca.update({
        where: { id: peca.id },
        data: {
          materialProvavel: dadosIA.materialProvavel,
          dicasCuidado: dadosIA.dicasCuidado,
          epocaEstimada: dadosIA.epocaEstimada,
          avaliacaoIA: new Date(),
        },
        include: { categoria: true },
      })
      return res.status(201).json(pecaAtualizada)
    }
  } catch (erro) {
    console.error('Erro no enriquecimento por IA:', erro)
  }

  res.status(201).json(peca)
})

router.put('/:id', async (req, res) => {
  const validacao = pecaSchema.partial().safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }
  const peca = await prisma.peca.update({
    where: { id: Number(req.params.id) },
    data: validacao.data,
    include: { categoria: true },
  })
  res.json(peca)
})

router.delete('/:id', async (req, res) => {
  await prisma.peca.delete({ where: { id: Number(req.params.id) } })
  res.status(204).send()
})

export default router
