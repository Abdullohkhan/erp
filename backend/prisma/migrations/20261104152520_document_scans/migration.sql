-- AlterTable
ALTER TABLE "Act" ADD COLUMN     "scanFile" TEXT,
ADD COLUMN     "scanMime" TEXT,
ADD COLUMN     "scanName" TEXT,
ADD COLUMN     "scanSize" INTEGER,
ADD COLUMN     "scanUploadedAt" TIMESTAMP(3),
ADD COLUMN     "scanUploadedById" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft';

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "scanFile" TEXT,
ADD COLUMN     "scanMime" TEXT,
ADD COLUMN     "scanName" TEXT,
ADD COLUMN     "scanSize" INTEGER,
ADD COLUMN     "scanUploadedAt" TIMESTAMP(3),
ADD COLUMN     "scanUploadedById" TEXT;
