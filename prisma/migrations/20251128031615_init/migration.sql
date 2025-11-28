-- CreateTable
CREATE TABLE "DriveFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "parents" TEXT,
    "size" INTEGER,
    "modifiedTime" TIMESTAMP(3),
    "createdTime" TIMESTAMP(3),
    "isFolder" BOOLEAN NOT NULL DEFAULT false,
    "trashed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DriveFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrivePermission" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "emailAddress" TEXT,
    "domain" TEXT,
    "allowFileDiscovery" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DrivePermission_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DrivePermission" ADD CONSTRAINT "DrivePermission_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "DriveFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
