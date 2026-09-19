# ADR-019: Pozycja katalogu vs zainstalowany asset; przypięta rewizja katalogu; provenance parametru

**Status:** PROPOSED (program Digital Twin 2026-09; do decyzji właściciela)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §15; `../twin/MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md` §3–§4

## Kontekst
Katalog nie ma rewizji pozycji (wersja literałowa „2024.1"), materializacja ignoruje wersję i jest cicha/automatyczna przy odczycie, trzy kopie tej samej danej, override w dwóch semantykach, `materialized_params`/`parameter_source` zapisywalne przez klienta, ciche fallbacki na wejściu solvera (A6-01…07, A6-12).

## Decyzja
`CatalogRevision` (niezmienna, wersjonowana, z provenance źródła danych) i `CatalogBinding{item_id, revision}` na assecie — dobór powtórzony po roku daje ten sam typ. Wartość parametru na assecie istnieje w **jednej** kopii z `ParameterProvenance{source: CATALOG|OVERRIDE|ASSUMPTION|MEASUREMENT|DERIVED, old, new, actor, reason, impact}`; override to komenda z old/new/autorem; rematerializacja tylko jawną komendą „podnieś rewizję katalogu" z podglądem skutków. Klient nie może pisać pól provenance (brama w komendzie). Brak danych = brak (kod gotowości), nigdy fallback; guard podstawień z pustą allowlistą.

## Konsekwencje
- Kasacja `materialized_params` jako kopii (materializacja = widok), 12 słowników jakości → 1.
- Dobór z kandydatami (FAZA D cz. 2) działa na rewizji przypiętej do projektu.

## Alternatywy odrzucone
- Katalog „zawsze bieżący" z drift detection: dzisiejszy stan, drift detection martwe i błędne (A6-02).
