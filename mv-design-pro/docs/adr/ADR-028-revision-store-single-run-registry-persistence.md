# ADR-028: Magazyn rewizji, jeden rejestr biegów, persystencja docelowa i aktor komend

**Status:** PROPOSED (program Digital Twin 2026-09; do decyzji właściciela — zależy od topologii wdrożenia W-D1)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md` §2, §6, §10; `../twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md` §2.1

## Kontekst
Tylko bieżąca rewizja ENM w pliku + dziennik ≤ 500 + pełna kopia ENM per bieg; cztery rejestry biegów; 7 magazynów in-memory; SQLite bez FK; `create_all` bez migracji; dwa silniki; zero tożsamości użytkownika; import XLSX do legacy SQL (A9-01/02/03/06/07/08/14).

## Decyzja
`RevisionStore` (delty komend + migawki co k rewizji; `GET /model/revisions`, checkout, diff; `VariantBranch`), jeden rejestr `Run` (rodzaj analizy jako pole; V12.6 i zabezpieczenia jako rodzaje), zero magazynów in-memory (każdy zasób z identyfikatorem jest trwały i objęty archiwum), Postgres jako baza docelowa (SQLite dev/test) z Alembic, jednym `Engine`, FK, indeksami; optymistyczna kontrola wersji (`If-Match: revision` → 409); `actor` w każdej komendzie, biegu i dokumencie (nawet w trybie jednostanowiskowym — jako „lokalny użytkownik"), tak aby włączenie ról nie wymagało zmiany kontraktów. Archiwum ZIP 2.0 z migracją formatu.

## Konsekwencje
- Kasacja legacy SQL modelu i rejestrów biegów, `snapshot_json` per bieg (retencja/GC wg polityki), 9 plików SQL, cache silnika.
- Testy: „N operacji → N rewizji → checkout k = hash_k"; „restart procesu → zasób czytelny"; FK na Postgresie w CI.

## Alternatywy odrzucone
- Pełne migawki per rewizja bez delt: prosto, ale liniowy wzrost 0,78 MB/rewizję.
- Pozostanie przy SQLite w produkcji: brak FK i współbieżności międzyprocesowej.
