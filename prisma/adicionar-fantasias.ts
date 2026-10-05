import 'dotenv/config'
import { prisma } from '../lib/prisma'

// Cria a categoria "Fantasias" e duas peças nela. Pode rodar mais de uma vez:
// não duplica a categoria nem as peças.
// As fotos abaixo são provisórias: troque pelas fotos reais pelo painel admin.
const pecas = [
  {
    descricao: 'Fantasia de palhaço',
    tamanho: 'G',
    preco: 89.9,
    foto: 'https://placehold.co/400x500?text=Fantasia+de+Palhaco',
    condicao: 'USADA' as const,
  },
  {
    descricao: 'Banana de pijama',
    tamanho: 'Único',
    preco: 119.9,
    foto: 'https://placehold.co/400x500?text=Banana+de+Pijama',
    condicao: 'SEMINOVA' as const,
  },
]

async function main() {
  const categoria = await prisma.categoria.upsert({
    where: { nome: 'Fantasias' },
    update: {},
    create: { nome: 'Fantasias' },
  })

  for (const p of pecas) {
    const jaExiste = await prisma.peca.findFirst({ where: { descricao: p.descricao } })
    if (jaExiste) {
      console.log(`Já existe: ${p.descricao}`)
      continue
    }
    await prisma.peca.create({
      data: { ...p, marca: null, destaque: true, categoriaId: categoria.id },
    })
    console.log(`Criada: ${p.descricao}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
