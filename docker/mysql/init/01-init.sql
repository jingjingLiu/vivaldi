-- Runs once on first container start (empty data volume).
-- The database `vivaldi` and user are already created by MYSQL_* env vars.
-- This file is reserved for future bootstrap needs (extra databases, grants, etc.).

-- Ensure the app user has full privileges on the vivaldi schema (covers edge cases).
GRANT ALL PRIVILEGES ON `vivaldi`.* TO 'vivaldi'@'%';
FLUSH PRIVILEGES;
