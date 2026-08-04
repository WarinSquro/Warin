-- CreateEnum
CREATE TYPE "SmtpSecurityType" AS ENUM ('none', 'ssl', 'tls', 'starttls');

-- CreateTable
CREATE TABLE "smtp_settings" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL DEFAULT 'default',
    "host" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 587,
    "security_type" "SmtpSecurityType" NOT NULL DEFAULT 'starttls',
    "sender_name" TEXT NOT NULL DEFAULT '',
    "sender_email" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "password_encrypted" TEXT,
    "auth_required" BOOLEAN NOT NULL DEFAULT true,
    "is_configured" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "created_by" BIGINT,
    "modified_by" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "smtp_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "smtp_settings_code_key" ON "smtp_settings"("code");
