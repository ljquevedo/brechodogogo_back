import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const router = Router()

const categoriaSchema = z.object({
  nome: z.string().min(2).max(30),
})

router.get('/', async (req, res) => {
  const categorias = await prisma.categoria.findMany({ orderBy: { nome: 'asc' } })
  res.json(categorias)
})

router.get('/:id', async (req, res) => {
  const categoria = await prisma.categoria.findUnique({
    where: { id: Number(req.params.id) },
  })
  if (!categoria) return res.status(404).json({ erro: 'Categoria não encontrada' })
  res.json(categoria)
})

router.post('/', async (req, res) => {
  const validacao = categoriaSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }
  const categoria = await prisma.categoria.create({ data: validacao.data })
  res.status(201).json(categoria)
})

router.put('/:id', async (req, res) => {
  const validacao = categoriaSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message })
  }
  const categoria = await prisma.categoria.update({
    where: { id: Number(req.params.id) },
    data: validacao.data,
  })
  res.json(categoria)
})

router.delete('/:id', async (req, res) => {
  await prisma.categoria.delete({ where: { id: Number(req.params.id) } })
  res.status(204).send()
})

export default router
