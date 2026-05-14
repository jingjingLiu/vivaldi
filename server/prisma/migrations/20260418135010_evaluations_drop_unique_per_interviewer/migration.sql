-- CreateIndex on candidate_id first so the foreign key keeps a backing index
-- before we drop the compound unique index.
CREATE INDEX `evaluations_candidate_id_idx` ON `evaluations`(`candidate_id`);

-- RenameIndex on interviewer_id (existing implicit FK index) to match Prisma's
-- new canonical name.
ALTER TABLE `evaluations` RENAME INDEX `evaluations_interviewer_id_fkey` TO `evaluations_interviewer_id_idx`;

-- DropIndex: now safe — candidate_id has its own index backing the FK.
DROP INDEX `evaluations_candidate_id_interviewer_id_key` ON `evaluations`;
