"""Warstwa raportowa/eksportowa modelu sieci.

W1 (2026-09-09): eksportery wyników bez konsumenta produkcyjnego skasowane razem
z legacy persystencją sieci — `short_circuit_report_{docx,pdf}`,
`power_flow_report_{docx,pdf}`, `analysis_run_report_{docx,pdf}`,
`export_{docx,pdf,jsonl,manifest}`, `power_flow_export`, `short_circuit_export`
(0 importerów w `src`; jedynymi czytelnikami były własne testy). Żywy raport biegu
buduje `api/analysis_run_exports.py`; zostają moduły z konsumentami:
`czcionki`, `missing_value`, `docx_determinism`, `protection_report_{docx,pdf}`,
`protection_tcc_presentation`. Bramka wskrzeszenia:
`scripts/legacy_public_path_guard.py::check_w1_legacy_persistence_resurrection`.
"""
