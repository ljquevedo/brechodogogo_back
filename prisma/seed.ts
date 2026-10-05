import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

async function main() {
  const nomesCategorias = ['Camisas', 'Calças', 'Vestidos', 'Calçados', 'Acessórios']
  const categorias: Record<string, { id: number }> = {}

  for (const nome of nomesCategorias) {
    categorias[nome] = await prisma.categoria.upsert({
      where: { nome },
      update: {},
      create: { nome },
    })
  }

  const senhaAdmin = await bcrypt.hash('admin123', 10)
  await prisma.admin.upsert({
    where: { email: 'admin@brechorecomeco.com' },
    update: {},
    create: {
      nome: 'Administrador',
      email: 'admin@brechorecomeco.com',
      senha: senhaAdmin,
    },
  })

  const totalPecas = await prisma.peca.count()
  if (totalPecas === 0) {
    await prisma.peca.createMany({
      data: [
        {
          descricao: 'Camisa jeans oversized',
          marca: 'Zara',
          tamanho: 'M',
          preco: 79.9,
          foto: 'https://picsum.photos/seed/camisa1/400/500',
          condicao: 'SEMINOVA',
          destaque: true,
          categoriaId: categorias['Camisas'].id,
        },
        {
          descricao: 'Calça cargo verde militar',
          marca: 'Renner',
          tamanho: '40',
          preco: 99.9,
          foto: 'https://picsum.photos/seed/calca1/400/500',
          condicao: 'USADA',
          destaque: true,
          categoriaId: categorias['Calças'].id,
        },
        {
          descricao: 'Vestido floral midi',
          marca: null,
          tamanho: 'P',
          preco: 65.0,
          foto: 'https://picsum.photos/seed/vestido1/400/500',
          condicao: 'NOVA',
          destaque: true,
          categoriaId: categorias['Vestidos'].id,
        },
        {
          descricao: 'Tênis casual branco',
          marca: 'Vans',
          tamanho: '38',
          preco: 149.9,
          foto: 'https://picsum.photos/seed/tenis1/400/500',
          condicao: 'SEMINOVA',
          destaque: true,
          categoriaId: categorias['Calçados'].id,
        },
        {
          descricao: 'Bolsa transversal de couro',
          marca: null,
          tamanho: 'Único',
          preco: 55.0,
          foto: 'https://picsum.photos/seed/bolsa1/400/500',
          condicao: 'USADA',
          destaque: false,
          categoriaId: categorias['Acessórios'].id,
        },
      ],
    })
  }

  console.log('Seed concluído com sucesso.')
}

main()
  .catch((erro) => {
    console.error(erro)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
