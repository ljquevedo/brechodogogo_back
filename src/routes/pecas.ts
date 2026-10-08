import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { buscarDadosComGemini } from '../services/ia'
import {
  enviarEmail,
  pessoaDaCasa,
  emailModeracao,
  emailReservaParaVendedor,
  emailVendaConfirmada,
  emailReservaLiberada,
} from '../services/email'

const router = Router()

const NOME_DO_CAMPO: Record<string, string> = {
  descricao: 'Descrição',
  marca: 'Marca',
  tamanho: 'Tamanho',
  preco: 'Preço',
  foto: 'Foto',
  detalhes: 'Detalhes',
  categoriaId: 'Categoria',
  clienteId: 'Cliente',
}

// Mensagem do primeiro erro, dizendo QUAL campo falhou (ex.: "Tamanho: Too big: ...")
function mensagemDeValidacao(erro: z.ZodError): string {
  const problema = erro.issues[0]
  const campo = String(problema.path[0] ?? '')
  const nome = NOME_DO_CAMPO[campo]
  return nome ? `${nome}: ${problema.message}` : problema.message
}

const pecaSchema = z.object({
  descricao: z.string().min(2).max(60),
  marca: z.string().max(30).optional().nullable(),
  tamanho: z.string().min(1).max(10),
  preco: z.number().positive(),
  // link (http...), caminho do próprio site (/...) ou foto enviada (data:image/...)
  foto: z
    .string()
    .min(1)
    .max(600_000, 'A foto é grande demais')
    .refine((f) => /^(https?:\/\/|\/|data:image\/)/.test(f), 'Foto inválida'),
  detalhes: z.string().optional().nullable(),
  condicao: z.enum(['NOVA', 'SEMINOVA', 'USADA', 'COM_AVARIAS']).optional(),
  destaque: z.boolean().optional(),
  categoriaId: z.number().int().positive(),
  // quando vem preenchido, é um anúncio de cliente (fica PENDENTE até o admin aprovar);
  // sem clienteId é uma peça da casa cadastrada pelo admin.
  clienteId: z.string().uuid().optional(),
})

const moderarSchema = z.object({
  acao: z.enum(['APROVAR', 'REPROVAR']),
  motivo: z.string().max(200).optional(),
})

const acaoSchema = z.object({
  clienteId: z.string().uuid().optional(),
  porAdmin: z.boolean().optional(),
})

// Dados do vendedor que podem ser públicos (sem e-mail)
const vendedorPublico = { select: { id: true, nome: true, cidade: true } }
// Dados de contato: só aparecem para as duas pontas de uma venda já combinada
const contato = { select: { id: true, nome: true, email: true, cidade: true } }

const VISIVEIS = ['DISPONIVEL', 'RESERVADA'] as const

// Só o vendedor da peça (ou o admin, no caso de peças da casa) pode agir sobre ela
function ehVendedor(
  peca: { vendedorId: string | null },
  dados: { clienteId?: string; porAdmin?: boolean },
) {
  if (peca.vendedorId === null) return dados.porAdmin === true
  return dados.clienteId === peca.vendedorId
}

// GET /pecas                 -> todas (área do admin)
// GET /pecas?destaque=true   -> vitrine da home: anúncios aprovados (disponíveis ou reservados)
router.get('/', async (req, res) => {
  const vitrine = req.query.destaque === 'true'
  const pecas = await prisma.peca.findMany({
    where: vitrine ? { destaque: true, status: { in: [...VISIVEIS] } } : undefined,
    include: { categoria: true, vendedor: vendedorPublico },
    orderBy: { createdAt: 'desc' },
  })
  res.json(pecas)
})

// Pesquisa entre os anúncios da vitrine: texto busca em descrição/marca/categoria,
// número até 50 filtra por tamanho, número maior filtra por preço máximo.
router.get('/pesquisa/:termo', async (req, res) => {
  const termo = req.params.termo
  const numero = Number(termo)

  let where: any = { destaque: true, status: { in: [...VISIVEIS] } }

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
    include: { categoria: true, vendedor: vendedorPublico },
    orderBy: { createdAt: 'desc' },
  })
  res.json(pecas)
})

// "Meus anúncios": o que o cliente colocou à venda (com quem comprou, se for o caso)
router.get('/vendedor/:clienteId', async (req, res) => {
  const pecas = await prisma.peca.findMany({
    where: { vendedorId: req.params.clienteId },
    include: {
      categoria: true,
      comprador: contato,
      _count: { select: { propostas: { where: { status: 'PENDENTE' } } } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(pecas)
})

// "Minhas compras": peças reservadas/vendidas para o cliente, já com o contato do vendedor
router.get('/comprador/:clienteId', async (req, res) => {
  const pecas = await prisma.peca.findMany({
    where: { compradorId: req.params.clienteId },
    include: { categoria: true, vendedor: contato },
    orderBy: { createdAt: 'desc' },
  })
  res.json(pecas)
})

router.get('/:id', async (req, res) => {
  const peca = await prisma.peca.findUnique({
    where: { id: Number(req.params.id) },
    include: { categoria: true, vendedor: vendedorPublico },
  })
  if (!peca) return res.status(404).json({ erro: 'Peça não encontrada' })
  res.json(peca)
})

// Cria um anúncio. Cliente => PENDENTE (aguarda aprovação). Sem clienteId => peça da casa.
router.post('/', async (req, res) => {
  const validacao = pecaSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: mensagemDeValidacao(validacao.error) })
  }
  const { clienteId, ...dadosPeca } = validacao.data

  if (clienteId) {
    const vendedor = await prisma.cliente.findUnique({ where: { id: clienteId } })
    if (!vendedor) return res.status(400).json({ erro: 'Cliente não encontrado' })
  }

  const peca = await prisma.peca.create({
    data: clienteId
      ? { ...dadosPeca, vendedorId: clienteId, status: 'PENDENTE', destaque: false }
      : dadosPeca,
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

// Edição geral (admin: destaque, preço, etc.)
router.put('/:id', async (req, res) => {
  const validacao = pecaSchema.omit({ clienteId: true }).partial().safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: mensagemDeValidacao(validacao.error) })
  }
  const peca = await prisma.peca.update({
    where: { id: Number(req.params.id) },
    data: validacao.data,
    include: { categoria: true },
  })
  res.json(peca)
})

// Admin: (re)gera os dados de IA de uma peça que já existe (material, cuidados, época)
router.post('/:id/gerar-ia', async (req, res) => {
  const id = Number(req.params.id)
  const peca = await prisma.peca.findUnique({ where: { id }, include: { categoria: true } })
  if (!peca) return res.status(404).json({ erro: 'Peça não encontrada' })

  const dadosIA = await buscarDadosComGemini(peca.categoria.nome, peca.marca, peca.descricao)
  if (!dadosIA) {
    return res.status(502).json({
      erro: 'A IA não respondeu. Confira a GEMINI_API_KEY e os logs do servidor ([ia]).',
    })
  }

  const atualizada = await prisma.peca.update({
    where: { id },
    data: {
      materialProvavel: dadosIA.materialProvavel,
      dicasCuidado: dadosIA.dicasCuidado,
      epocaEstimada: dadosIA.epocaEstimada,
      avaliacaoIA: new Date(),
    },
    include: { categoria: true },
  })
  res.json(atualizada)
})

// Admin aprova (publica na vitrine) ou reprova um anúncio pendente
router.put('/:id/moderar', async (req, res) => {
  const validacao = moderarSchema.safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: mensagemDeValidacao(validacao.error) })
  }
  const id = Number(req.params.id)
  const peca = await prisma.peca.findUnique({ where: { id } })
  if (!peca) return res.status(404).json({ erro: 'Anúncio não encontrado' })
  if (peca.status !== 'PENDENTE') {
    return res.status(409).json({ erro: 'Só anúncios pendentes podem ser moderados' })
  }

  const { acao, motivo } = validacao.data
  const atualizada = await prisma.peca.update({
    where: { id },
    data:
      acao === 'APROVAR'
        ? { status: 'DISPONIVEL', destaque: true, motivoReprovacao: null }
        : { status: 'REPROVADA', destaque: false, motivoReprovacao: motivo ?? 'Anúncio não aprovado' },
    include: { categoria: true, vendedor: { select: { nome: true, email: true } } },
  })
  if (atualizada.vendedor) {
    void enviarEmail(
      emailModeracao(atualizada.vendedor, atualizada, acao === 'APROVAR', atualizada.motivoReprovacao),
    )
  }
  res.json(atualizada)
})

// Compra direta pelo preço anunciado: a peça fica RESERVADA para o comprador
router.post('/:id/comprar', async (req, res) => {
  const validacao = z.object({ clienteId: z.string().uuid() }).safeParse(req.body)
  if (!validacao.success) {
    return res.status(400).json({ erro: 'Faça login para comprar' })
  }
  const { clienteId } = validacao.data
  const id = Number(req.params.id)

  const peca = await prisma.peca.findUnique({
    where: { id },
    include: { vendedor: { select: { nome: true, email: true } } },
  })
  if (!peca) return res.status(404).json({ erro: 'Peça não encontrada' })
  if (peca.vendedorId === clienteId) {
    return res.status(400).json({ erro: 'Você não pode comprar o seu próprio anúncio' })
  }

  // updateMany com o status na condição evita que duas pessoas reservem a mesma peça
  const reservou = await prisma.peca.updateMany({
    where: { id, status: 'DISPONIVEL' },
    data: { status: 'RESERVADA', compradorId: clienteId, precoFinal: peca.preco },
  })
  if (reservou.count === 0) {
    return res.status(409).json({ erro: 'Esta peça não está mais disponível' })
  }

  await prisma.proposta.updateMany({
    where: { pecaId: id, status: 'PENDENTE' },
    data: {
      status: 'RECUSADA',
      resposta: 'Peça reservada para outro comprador',
      respondidoEm: new Date(),
    },
  })

  const atualizada = await prisma.peca.findUnique({
    where: { id },
    include: { categoria: true, vendedor: contato },
  })

  // aviso por e-mail ao vendedor (não bloqueia a resposta)
  const destino = peca.vendedor ?? pessoaDaCasa()
  const comprador = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { nome: true, email: true, cidade: true },
  })
  if (destino && comprador) {
    void enviarEmail(emailReservaParaVendedor(destino, comprador, peca, peca.preco))
  }
  res.json(atualizada)
})

// Vendedor confirma que a venda aconteceu (RESERVADA -> VENDIDA)
router.put('/:id/confirmar-venda', async (req, res) => {
  const dados = acaoSchema.safeParse(req.body)
  if (!dados.success) return res.status(400).json({ erro: 'Dados inválidos' })
  const id = Number(req.params.id)

  const peca = await prisma.peca.findUnique({ where: { id } })
  if (!peca) return res.status(404).json({ erro: 'Peça não encontrada' })
  if (!ehVendedor(peca, dados.data)) {
    return res.status(403).json({ erro: 'Só o vendedor pode confirmar a venda' })
  }
  if (peca.status !== 'RESERVADA') {
    return res.status(409).json({ erro: 'A peça precisa estar reservada para confirmar a venda' })
  }

  const atualizada = await prisma.peca.update({
    where: { id },
    data: { status: 'VENDIDA', vendidaEm: new Date(), destaque: false },
    include: { categoria: true, comprador: { select: { nome: true, email: true } } },
  })
  if (atualizada.comprador) {
    void enviarEmail(emailVendaConfirmada(atualizada.comprador, atualizada, atualizada.precoFinal ?? atualizada.preco))
  }
  res.json(atualizada)
})

// Desfaz a reserva (vendedor ou comprador): a peça volta a ficar DISPONIVEL
router.put('/:id/liberar', async (req, res) => {
  const dados = acaoSchema.safeParse(req.body)
  if (!dados.success) return res.status(400).json({ erro: 'Dados inválidos' })
  const id = Number(req.params.id)

  const peca = await prisma.peca.findUnique({
    where: { id },
    include: {
      vendedor: { select: { nome: true, email: true } },
      comprador: { select: { nome: true, email: true } },
    },
  })
  if (!peca) return res.status(404).json({ erro: 'Peça não encontrada' })
  const ehComprador = dados.data.clienteId !== undefined && dados.data.clienteId === peca.compradorId
  if (!ehVendedor(peca, dados.data) && !ehComprador) {
    return res.status(403).json({ erro: 'Sem permissão para liberar esta reserva' })
  }
  if (peca.status !== 'RESERVADA') {
    return res.status(409).json({ erro: 'A peça não está reservada' })
  }

  const atualizada = await prisma.peca.update({
    where: { id },
    data: { status: 'DISPONIVEL', compradorId: null, precoFinal: null },
    include: { categoria: true },
  })
  // avisa a outra parte
  if (ehComprador) {
    const destino = peca.vendedor ?? pessoaDaCasa()
    if (destino) void enviarEmail(emailReservaLiberada(destino, peca, 'comprador'))
  } else if (peca.comprador) {
    void enviarEmail(emailReservaLiberada(peca.comprador, peca, 'vendedor'))
  }
  res.json(atualizada)
})

// Exclui um anúncio. O dono só pode excluir se não houver venda em andamento/concluída.
// Sem clienteId (chamada do painel admin) exclui qualquer peça sem histórico de venda.
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const clienteId = typeof req.query.clienteId === 'string' ? req.query.clienteId : undefined

  const peca = await prisma.peca.findUnique({ where: { id } })
  if (!peca) return res.status(404).json({ erro: 'Peça não encontrada' })
  if (clienteId && peca.vendedorId !== clienteId) {
    return res.status(403).json({ erro: 'Este anúncio não é seu' })
  }
  if (peca.status === 'RESERVADA' || peca.status === 'VENDIDA') {
    return res.status(409).json({ erro: 'Não é possível excluir uma peça reservada ou vendida' })
  }

  await prisma.proposta.deleteMany({ where: { pecaId: id } })
  await prisma.peca.delete({ where: { id } })
  res.status(204).send()
})

export default router
