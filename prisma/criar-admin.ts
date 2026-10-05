import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

// Uso:  npx tsx prisma/criar-admin.ts <login> <senha> [--remover-padrao]
// Cria o administrador (ou troca a senha, se o login já existir).
// Com --remover-padrao, apaga também o admin de exemplo do seed (admin123).
// A senha vem pela linha de comando e não fica salva em nenhum arquivo.
async function main() {
  const [login, senha, flag] = process.argv.slice(2)
  if (!login || !senha) {
    console.error('Uso: npx tsx prisma/criar-admin.ts <login> <senha> [--remover-padrao]')
    process.exit(1)
  }

  const hash = await bcrypt.hash(senha, 10)
  await prisma.admin.upsert({
    where: { email: login },
    update: { senha: hash },
    create: { nome: 'Administrador', email: login, senha: hash },
  })
  console.log(`Admin pronto: ${login}`)

  if (flag === '--remover-padrao' && login !== 'admin@brechorecomeco.com') {
    const r = await prisma.admin.deleteMany({ where: { email: 'admin@brechorecomeco.com' } })
    console.log(`Admin padrão removido: ${r.count}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
