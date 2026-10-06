import { Router } from 'express'
import { prisma } from '../../lib/prisma'

const router = Router()

// Indicadores para o dashboard da área restrita do admin (item 10 do trabalho)
router.get('/resumo', async (req, res) => {
  const [
    totalClientes,
    totalPecas,
    totalPropostas,
    pendentes,
    aceitas,
    recusadas,
    aguardandoAprovacao,
    disponiveis,
    reservadas,
    vendidas,
    valorVendido,
  ] = await Promise.all([
    prisma.cliente.count(),
    prisma.peca.count(),
    prisma.proposta.count(),
    prisma.proposta.count({ where: { status: 'PENDENTE' } }),
    prisma.proposta.count({ where: { status: 'ACEITA' } }),
    prisma.proposta.count({ where: { status: 'RECUSADA' } }),
    prisma.peca.count({ where: { status: 'PENDENTE' } }),
    prisma.peca.count({ where: { status: 'DISPONIVEL' } }),
    prisma.peca.count({ where: { status: 'RESERVADA' } }),
    prisma.peca.count({ where: { status: 'VENDIDA' } }),
    prisma.peca.aggregate({ where: { status: 'VENDIDA' }, _sum: { precoFinal: true } }),
  ])

  const porCategoriaBruto = await prisma.peca.groupBy({
    by: ['categoriaId'],
    _count: { _all: true },
  })
  const categorias = await prisma.categoria.findMany()
  const pecasPorCategoria = porCategoriaBruto.map((linha) => ({
    categoria: categorias.find((c) => c.id === linha.categoriaId)?.nome ?? 'Outra',
    total: linha._count._all,
  }))

  const porCidadeBruto = await prisma.cliente.groupBy({
    by: ['cidade'],
    _count: { _all: true },
  })
  const clientesPorCidade = porCidadeBruto.map((linha) => ({
    cidade: linha.cidade ?? 'Não informado',
    total: linha._count._all,
  }))

  res.json({
    totalClientes,
    totalPecas,
    totalPropostas,
    propostasPorStatus: { pendentes, aceitas, recusadas },
    anunciosPorStatus: { aguardandoAprovacao, disponiveis, reservadas, vendidas },
    valorVendido: Number(valorVendido._sum.precoFinal ?? 0),
    pecasPorCategoria,
    clientesPorCidade,
  })
})

export default router
