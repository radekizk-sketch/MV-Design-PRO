-- CV-3.3-C: serie biegow (E4) na trwaly rejestr `run_batches` (R2), zamiast
-- trzech slownikow w pamieci (`_batches`/`_case_batches`/`_pinned_hashes`).
-- Pozycja serii NIE ma wlasnego wyniku — wynik = `canonical_runs.id` po
-- `canonical_run_id` niesionym w `items_json`.

CREATE TABLE run_batches (
    id UUID PRIMARY KEY,
    project_id VARCHAR(255),
    case_id VARCHAR(255) NOT NULL,
    analysis_type VARCHAR(32) NOT NULL,
    name VARCHAR(255),
    status VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    envelope_json JSONB,
    items_json JSONB NOT NULL,
    batch_input_hash VARCHAR(128) NOT NULL
);

CREATE INDEX ix_run_batches_case_id_created_at ON run_batches (case_id, created_at);
CREATE INDEX ix_run_batches_project_id_created_at ON run_batches (project_id, created_at);
