# ADR-017: Rozwiązywanie stanu efektywnego (11 warstw, jedna funkcja)

**Status:** PROPOSED (program Digital Twin 2026-09; do decyzji właściciela)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §3, §10

## Kontekst
Stan łącznika w 8–9 reprezentacjach, rozsiane operatory `??` z domyślnymi, brak modelu BASE + AS-BUILT + OPERATIONAL + SCENARIO, `switching_snapshot_hash` pokrywa tylko część stanów (A2-03/06, A1-07).

## Decyzja
Warstwy stanu (ASSET, CATALOG, DESIGN, AS-BUILT, NORMAL, OPERATIONAL, SCENARIO, MEASUREMENT, RESULT, PRESENTATION, DOCUMENT) są przestrzeniami atrybutów na wspólnych identyfikatorach, nie kopiami modelu. Jedna deterministyczna funkcja `EffectiveStateResolver.resolve(revision, scenario, at) → EffectiveState` z jawną precedencją (SCENARIO > OPERATIONAL > NORMAL > DESIGN; AS-BUILT jako jawny tryb) i pełnym provenance każdej wartości (która warstwa zdecydowała). Brak wartości w każdej warstwie = stan `UNKNOWN` (nie domyślny), z kodem gotowości.

## Konsekwencje
- Solvery i projekcje dostają `EffectiveState`, nie surowe pola modelu.
- `switching_snapshot_hash` liczony z pełnego stanu efektywnego łączników (w tym aparaty pola, BranchPoint, baterie).
- Kasacja 9 reprezentacji i `??`-domyślnych po teście precedencji (warstwa × atrybut).

## Alternatywy odrzucone
- „Effective" liczone w każdym konsumencie z własną precedencją: dzisiejszy stan.
