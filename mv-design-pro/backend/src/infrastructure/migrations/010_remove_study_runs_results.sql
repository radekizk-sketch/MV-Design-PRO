-- CV-3.3-B: zero konsumentów po przepięciu porównań (PF/zabezpieczeń/ogólne)
-- i biegów zabezpieczeń (analysis_type="protection_sn") na R1 (canonical_runs).
-- Usunięcie procedurą, bez migracji danych (kanon: "co przestarzałe, usuń").
-- Kolejność: study_results ma FK na study_runs.

DROP TABLE IF EXISTS study_results;
DROP TABLE IF EXISTS study_runs;
