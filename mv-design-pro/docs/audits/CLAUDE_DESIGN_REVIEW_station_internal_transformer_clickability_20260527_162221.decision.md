# Claude Design Review Decision Log - station_internal_transformer_clickability

Review: docs\audits\CLAUDE_DESIGN_REVIEW_station_internal_transformer_clickability_20260527_162221.md
Prompt: docs\audits\CLAUDE_DESIGN_REVIEW_station_internal_transformer_clickability_20260527_162221.prompt.md
Meta: docs\audits\CLAUDE_DESIGN_REVIEW_station_internal_transformer_clickability_20260527_162221.meta.json

## Accepted

- Normalizacja gramatyki interakcji: click wybiera element i otwiera konfiguracje/karte techniczna, double-click/right-click nie moze byc martwy na symbolu transformatora.
- LOD/SLD nie moze ukrywac elektrycznie istotnego symbolu transformatora: dwa okregi musza byc jednoznacznie sprzezone i podpisane jako transformator SN/nN.
- Elementy pola i porty stacji maja miec stabilne kotwice/hit-area oraz tooltip, zeby uzytkownik nie musial celowac w cienka kreske.
- Akceptacja testowa: unit test dla symbolu TR sprawdza przecinanie okregow, hit-area i wybor; browser retest sprawdza, ze klikniecie TR otwiera karte techniczna.

## Rejected

- Zmiany solverow, load-flow, zwarc i zabezpieczen: poza zakresem tej poprawki oraz niepotrzebne do naprawy symbolu i klikalnosci.
- Wprowadzanie uproszczonych, dekoracyjnych symboli: naruszaloby zasade, ze SLD pozostaje widokiem modelu ENM/topologii.
- Angielskie etykiety aktywnego UI: odrzucone, obowiazuje polski jezyk techniczny.

## Deferred

- Brak krytycznych elementow odlozonych dla tej poprawki.

## Implementation Notes

- Do not implement UI/UX, SLD, LOD, CAD, navigation, or workflow changes unless they are listed in Accepted.
- Claude review is a flow/readability checkpoint, not domain truth. ENM, catalog contracts, solvers, tests, and active V12.xx canon remain authoritative.
