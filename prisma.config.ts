// Este arquivo foi baseado no padrão gerado pelo Prisma (prisma init), e
// pressupõe que "prisma" e "dotenv" estejam instalados como dependências.
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
})
