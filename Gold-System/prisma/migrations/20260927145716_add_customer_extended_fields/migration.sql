-- CreateEnum
CREATE TYPE "CustomerGender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "CustomerLevel" AS ENUM ('NORMAL', 'VIP', 'PREMIUM');

-- CreateEnum
CREATE TYPE "ReferenceSource" AS ENUM ('FRIEND_REFERRAL', 'INTERNET_SEARCH', 'SOCIAL_MEDIA', 'IN_PERSON', 'ADVERTISEMENT', 'OTHER');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "company_economic_id" TEXT,
ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "company_national_id" TEXT,
ADD COLUMN     "contact_name" TEXT,
ADD COLUMN     "contact_title" TEXT,
ADD COLUMN     "gender" "CustomerGender",
ADD COLUMN     "level" "CustomerLevel" DEFAULT 'NORMAL',
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "reference_source" "ReferenceSource";
