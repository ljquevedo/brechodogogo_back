import 'dotenv/config'
import { prisma } from '../lib/prisma'

// Troca só o campo "foto" das peças de exemplo. Não apaga nem duplica nada.
// Se alguma foto não combinar, deixe o valor como null (a peça fica como está)
// ou troque a URL por outra e rode de novo.
const q = '?w=400&h=500&fit=crop'
const fotos: Record<string, string | null> = {
  'Camisa jeans oversized': `https://images.unsplash.com/photo-1715532485872-204a452f2ff6${q}`,
  'Calça cargo verde militar': null, // não achei foto confiável de cargo: trocar pelo painel admin
  'Vestido floral midi': `https://images.unsplash.com/photo-1669194792519-710af63a67f9${q}`,
  'Tênis casual branco': `https://images.unsplash.com/photo-1676379827610-c380c52db0c6${q}`,
  'Bolsa transversal de couro': `https://images.unsplash.com/photo-1517612228538-cefdbc2c01e7${q}`,
}

async function main() {
  for (const [descricao, foto] of Object.entries(fotos)) {
    if (!foto) {
      console.log(`Pulando (sem foto definida): ${descricao}`)
      continue
    }
    const r = await prisma.peca.updateMany({ where: { descricao }, data: { foto } })
    console.log(`${descricao}: ${r.count} peça(s) atualizada(s)`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
