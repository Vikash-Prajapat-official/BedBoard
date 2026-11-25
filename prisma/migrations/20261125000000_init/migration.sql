-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'NURSE', 'DESK', 'DOCTOR', 'HOUSEKEEPING', 'VIEWER');

-- CreateEnum
CREATE TYPE "WardGender" AS ENUM ('MALE', 'FEMALE', 'ANY');

-- CreateEnum
CREATE TYPE "BedType" AS ENUM ('GENERAL', 'OXYGEN', 'VENTILATOR', 'ICU', 'COT', 'ISOLATION');

-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('FREE', 'RESERVED', 'OCCUPIED', 'DISCHARGE_PLANNED', 'CLEANING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('DISCHARGED', 'LAMA', 'REFERRED', 'DIED');

-- CreateTable
CREATE TABLE "hospital" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hfr_id" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "public_page_enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "pin_hash" TEXT,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_ward" (
    "user_id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,

    CONSTRAINT "user_ward_pkey" PRIMARY KEY ("user_id","ward_id")
);

-- CreateTable
CREATE TABLE "ward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "WardGender" NOT NULL DEFAULT 'ANY',
    "floor" INTEGER NOT NULL DEFAULT 0,
    "specialty" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bed_type" "BedType" NOT NULL DEFAULT 'GENERAL',
    "status" "BedStatus" NOT NULL DEFAULT 'FREE',
    "status_reason" TEXT,
    "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reserved_until" TIMESTAMP(3),
    "reserved_by" TEXT,
    "current_admission_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient" (
    "id" TEXT NOT NULL,
    "uhid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "sex" "Sex" NOT NULL,
    "phone" TEXT,
    "abha_number" TEXT,
    "anonymised" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "bed_id" TEXT NOT NULL,
    "admitting_doctor" TEXT NOT NULL,
    "admitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discharge_planned_for" TIMESTAMP(3),
    "discharge_order_at" TIMESTAMP(3),
    "summary_ready_at" TIMESTAMP(3),
    "bill_cleared_at" TIMESTAMP(3),
    "meds_given_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),
    "outcome" "Outcome",

    CONSTRAINT "admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed_transfer" (
    "id" TEXT NOT NULL,
    "admission_id" TEXT NOT NULL,
    "from_bed_id" TEXT NOT NULL,
    "to_bed_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by_user_id" TEXT NOT NULL,

    CONSTRAINT "bed_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed_event" (
    "id" TEXT NOT NULL,
    "bed_id" TEXT NOT NULL,
    "from_status" "BedStatus" NOT NULL,
    "to_status" "BedStatus" NOT NULL,
    "actor_user_id" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "bed_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "census_snapshot" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "ward_id" TEXT NOT NULL,
    "bed_type" "BedType" NOT NULL,
    "total" INTEGER NOT NULL,
    "occupied" INTEGER NOT NULL,
    "free" INTEGER NOT NULL,
    "blocked" INTEGER NOT NULL,

    CONSTRAINT "census_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "bed_current_admission_id_key" ON "bed"("current_admission_id");

-- CreateIndex
CREATE INDEX "bed_status_idx" ON "bed"("status");

-- CreateIndex
CREATE INDEX "bed_ward_id_bed_type_status_idx" ON "bed"("ward_id", "bed_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bed_ward_id_label_key" ON "bed"("ward_id", "label");

-- CreateIndex
CREATE INDEX "patient_uhid_idx" ON "patient"("uhid");

-- CreateIndex
CREATE INDEX "admission_bed_id_idx" ON "admission"("bed_id");

-- CreateIndex
CREATE INDEX "admission_left_at_idx" ON "admission"("left_at");

-- CreateIndex
CREATE INDEX "bed_event_bed_id_at_idx" ON "bed_event"("bed_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "census_snapshot_date_ward_id_bed_type_key" ON "census_snapshot"("date", "ward_id", "bed_type");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "user_ward" ADD CONSTRAINT "user_ward_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ward" ADD CONSTRAINT "user_ward_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed" ADD CONSTRAINT "bed_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed" ADD CONSTRAINT "bed_current_admission_id_fkey" FOREIGN KEY ("current_admission_id") REFERENCES "admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission" ADD CONSTRAINT "admission_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission" ADD CONSTRAINT "admission_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfer" ADD CONSTRAINT "bed_transfer_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfer" ADD CONSTRAINT "bed_transfer_from_bed_id_fkey" FOREIGN KEY ("from_bed_id") REFERENCES "bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfer" ADD CONSTRAINT "bed_transfer_to_bed_id_fkey" FOREIGN KEY ("to_bed_id") REFERENCES "bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_transfer" ADD CONSTRAINT "bed_transfer_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_event" ADD CONSTRAINT "bed_event_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_event" ADD CONSTRAINT "bed_event_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "census_snapshot" ADD CONSTRAINT "census_snapshot_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

