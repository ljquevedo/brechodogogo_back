-- Venda direta entre clientes: anúncios com vendedor/comprador e status.
-- As ofertas de venda já existentes são convertidas em anúncios antes de a tabela ser removida.

-- CreateEnum
CREATE TYPE "StatusAnuncio" AS ENUM ('PENDENTE', 'DISPONIVEL', 'RESERVADA', 'VENDIDA', 'REPROVADA');

-- AlterTable
ALTER TABLE "pecas" ADD COLUMN     "compradorId" TEXT,
ADD COLUMN     "motivoReprovacao" TEXT,
ADD COLUMN     "precoFinal" DECIMAL(10,2),
ADD COLUMN     "status" "StatusAnuncio" NOT NULL DEFAULT 'DISPONIVEL',
ADD COLUMN     "vendedorId" TEXT,
ADD COLUMN     "vendidaEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "propostas" ADD COLUMN     "valorOferta" DECIMAL(10,2);

-- AddForeignKey
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_compradorId_fkey" FOREIGN KEY ("compradorId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Converte as ofertas de venda existentes em anúncios do cliente que as fez
INSERT INTO "pecas" (
  "descricao", "marca", "tamanho", "preco", "foto", "detalhes", "condicao", "destaque",
  "categoriaId", "vendedorId", "status", "motivoReprovacao", "createdAt", "updatedAt"
)
SELECT
  btrim(o."descricao"), o."marca", o."tamanho", o."precoDesejado", o."foto", o."detalhes", o."condicao",
  (o."status" = 'ACEITA'),
  COALESCE(
    (SELECT c."id" FROM "categorias" c WHERE c."nome" = 'Fantasias' LIMIT 1),
    (SELECT MIN(c."id") FROM "categorias" c)
  ),
  o."clienteId",
  (CASE o."status"
     WHEN 'ACEITA' THEN 'DISPONIVEL'
     WHEN 'RECUSADA' THEN 'REPROVADA'
     ELSE 'PENDENTE'
   END)::"StatusAnuncio",
  CASE WHEN o."status" = 'RECUSADA' THEN o."resposta" ELSE NULL END,
  o."createdAt",
  CURRENT_TIMESTAMP
FROM "ofertas_venda" o
WHERE EXISTS (SELECT 1 FROM "categorias");

-- DropForeignKey
ALTER TABLE "ofertas_venda" DROP CONSTRAINT "ofertas_venda_clienteId_fkey";

-- DropTable
DROP TABLE "ofertas_venda";
