# ADR-015: Model fazowy (PhaseCode) i układy uziemienia jako encje

**Status:** PROPOSED (program Digital Twin 2026-09; do decyzji właściciela)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §7, §16

## Kontekst
`Bus.phase_system` dopuszcza tylko `3ph`; brak L1/L2/L3/N/PE/PEN, żyły powrotnej nierozróżnione (PE vs PEN), układ sieci nN jako string w meta z cichym domyślnym TN-C-S, uziemienie w 6 reprezentacjach, dwie fizyki Ik1 nN na dwóch zbiorach danych (A1-04, A11-02…05).

## Decyzja
`PhaseCode` (CIM-like: ABC, ABCN, AN, BN, CN, N, PE, PEN…) na terminalach, żyłach i odbiorach; `EarthingSystem` jako encja (TN-S/TN-C/TN-C-S/TT/IT, punkt rozdziału PEN, szyna PE/N, uziom z rezystancją) przypięta do stacji/rozdzielnicy; dane składowych zerowych (r0/x0) wyłącznie z katalogu — brak = brak (blokada Ik1), nigdy fallback. Jedna fizyka Ik1 nN (IEC 60909 składowe) z pętlą zwarcia jako widokiem (`SequenceView`).

## Konsekwencje
- Rozpływ nN 4-przewodowy staje się możliwy (ADR-021); SWZ liczone per odcinek z realnymi żyłami.
- Migracja danych: dzisiejsze `return_conductor_*` mapowane na żyły PE/PEN z jawnym typem; brak informacji = stan „nieokreślony" wymagający uzupełnienia (kod gotowości), nie domyślny TN-C-S.

## Alternatywy odrzucone
- Pozostawienie nN jako 3-fazowej równoważnej: uniemożliwia asymetrię, prąd w N, prosumentów 1-fazowych (mandat §23).
