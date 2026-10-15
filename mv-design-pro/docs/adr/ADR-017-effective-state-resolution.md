# ADR-017: Rozwiązywanie stanu efektywnego (11 warstw, jedna funkcja)

**Status:** ACCEPTED (2026-09-30, decyzja doradcy z delegacją właściciela O-59 — rejestr O-63 w `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3; z korektą: jeden resolver = istniejące `apply_scenario -> EffectiveNetworkSnapshot` z precedencją SCENARIO > NORMAL > DESIGN dla warstw z nośnikiem, proweniencją per atrybut i stanem UNKNOWN z kodem gotowości; „assembler dostaje EffectiveState”, nie solvery; golden test koperty v2 jako warunek WEJŚCIA karty W5-C; koperta v3 wyłącznie z podniesieniem wersji głównej, regeneracją fikstur narzędziami repo i wpisem w REJESTR)
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
