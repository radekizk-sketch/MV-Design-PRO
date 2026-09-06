# ADR-016: Scenariusz jako typowana delta; warianty jako gałęzie rewizji

**Status:** PROPOSED (program Digital Twin 2026-09; do decyzji właściciela)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §11, §20; `../twin/MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md` §2

## Kontekst
Sześć równoległych modeli przypadku/scenariusza, 7 fantomowych operacji STUDY_CASE, what-if jako destrukcyjna edycja jedynego modelu, brak wariantów (A2-02/04/14/15); `StudyCaseConfig` przechowuje wyłącznie parametry solvera.

## Decyzja
`Scenario{scenario_id, base_revision, deltas[]}` z zamkniętym rejestrem 23 rodzajów delt (stan łącznika, skalowanie odbiorów, profil czasowy, tryb źródła, kontyngencja, zwarcie, rebind katalogu, override nastaw, grupa nastaw, pozycja zaczepu…); scenariusz **nigdy** nie mutuje bazy. Warianty projektowe (A/B/C) to `VariantBranch` w grafie rewizji (delta na rewizji bazowej), z operacją „zastosuj" (merge z rewizją i `DesignDecision`). Case = wybór scenariusza + opcje solverów.

## Konsekwencje
- Jeden model scenariusza dla N-1, what-if, wariantów nastaw, QSTS, hosting capacity, porównań.
- Test klasy: izolacja scenariusza od bazy (każdy rodzaj delty × każda kolekcja modelu).
- Kasacja `study_scenario`, kopii migawek ad hoc i fantomowych operacji z rejestru kanonicznego.

## Alternatywy odrzucone
- Wiele modeli na projekt (kopie): łamie Single Model Rule i mnoży prawdy.
