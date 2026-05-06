-- Migration: station_audit2_configs (Punkt 3 + Phase 8 backend integration)
--
-- Tworzy tabele persystencji audit2 + dodaje JSONB kolumny per-element.
-- Dla SQLite (default): JSONB jako TEXT (DeterministicJSON serializuje).
-- Dla PostgreSQL: native JSONB.
--
-- USAGE:
--   PostgreSQL:
--     psql $DATABASE_URL -f migrations/audit2_station_configs.sql
--   SQLite:
--     sqlite3 mv_design_pro.db < migrations/audit2_station_configs.sql

-- ============================================================================
-- 1. Create station_audit2_configs table
-- ============================================================================

CREATE TABLE IF NOT EXISTS station_audit2_configs (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL,
    station_id VARCHAR(255) NOT NULL,
    mv_neutral_grounding_ref VARCHAR(64),
    tap_changer_refs TEXT NOT NULL DEFAULT '[]',
    der_specs TEXT NOT NULL DEFAULT '[]',
    -- Phase 8: per-element JSONB mappings.
    transformer_tap_changers TEXT NOT NULL DEFAULT '{}',
    bay_hv_fuses TEXT NOT NULL DEFAULT '{}',
    bay_vts TEXT NOT NULL DEFAULT '{}',
    bay_device_withstand TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit2_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ============================================================================
-- 2. Unique index on (project_id, station_id) — UPSERT pattern
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ix_audit2_project_station
    ON station_audit2_configs (project_id, station_id);

-- ============================================================================
-- 3. ALTER existing table (idempotent — for upgrade scenarios)
-- ============================================================================

-- PostgreSQL: ADD COLUMN IF NOT EXISTS (PG 9.6+).
-- SQLite: rzuca error jesli kolumna istnieje, dlatego uzywamy try/catch w aplikacji.

-- Idempotent ALTER patterns (PG-only):
-- ALTER TABLE station_audit2_configs ADD COLUMN IF NOT EXISTS transformer_tap_changers TEXT NOT NULL DEFAULT '{}';
-- ALTER TABLE station_audit2_configs ADD COLUMN IF NOT EXISTS bay_hv_fuses TEXT NOT NULL DEFAULT '{}';
-- ALTER TABLE station_audit2_configs ADD COLUMN IF NOT EXISTS bay_vts TEXT NOT NULL DEFAULT '{}';
-- ALTER TABLE station_audit2_configs ADD COLUMN IF NOT EXISTS bay_device_withstand TEXT NOT NULL DEFAULT '{}';

-- W przypadku PostgreSQL native JSONB:
-- ALTER TABLE station_audit2_configs
--     ALTER COLUMN tap_changer_refs TYPE JSONB USING tap_changer_refs::JSONB,
--     ALTER COLUMN der_specs TYPE JSONB USING der_specs::JSONB,
--     ALTER COLUMN transformer_tap_changers TYPE JSONB USING transformer_tap_changers::JSONB,
--     ALTER COLUMN bay_hv_fuses TYPE JSONB USING bay_hv_fuses::JSONB,
--     ALTER COLUMN bay_vts TYPE JSONB USING bay_vts::JSONB,
--     ALTER COLUMN bay_device_withstand TYPE JSONB USING bay_device_withstand::JSONB;
