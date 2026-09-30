# ADR-024: Projekcje SN i nN z jednego modelu (bez shadow modeli)

**Status:** ACCEPTED (2026-09-30, decyzja doradcy z delegacją właściciela O-59 — rejestr O-63 w `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3; O-64/O-71: projekcje SN i nN z JEDNEJ migawki ENM i jednego grafu `TopologyView`; wariant zapasowy „przeniesienie grafu terminalowego z frontend/v3/electrical do backendu” nie istnieje w tym ADR i jest skasowany — graf frontu kasowany, nie przenoszony; ADR-005 (SLD jako projekcja ENM) SUPERSEDED; testy kontraktowe sceny ze `sld-determinism.yml` przepisywane atomowo z workflowem i listą w `CLAUDE.md`; werdykt wyglądu nowych scen = B-02 właściciela)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md` §2.1; `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §19

## Kontekst
nN ma projekcję z backendu (3.0.0: energizacja, wyspy, SWZ), SN jest rekonstruowane w kliencie inną gramatyką i inną tożsamością elementów sceny; dwa języki symboli na jednym ekranie; `sldNetwork53` i ręczne `*.enm.json` jako równoległe reprezentacje w testach (A7-02, A1-20, A10-06).

## Decyzja
Jeden model, dwie (lub więcej) projekcje prezentacyjne liczone w backendzie z tej samej migawki i `TopologyView`: `SnDomainProjectionV1` i `LvDomainProjection` (3.0.0 zachowana jako wzorzec i rozszerzona), obie produkujące `SceneSemanticsV1` z tą samą tożsamością (`ref_id`, terminale) i tym samym rejestrem symboli; przejście SN↔nN przez portal na terminalu TR. Fixtury sceny generowane z rejestru sieci (backend → JSON → frontend z testem parytetu, jak 18 scenariuszy nN).

## Konsekwencje
- Kasacja projekcji SN w kliencie i równoległych reprezentacji testowych.
- Test klasy: dla każdej sieci rejestru scena SN + scena nN pokrywają wszystkie urządzenia dokładnie raz, krawędzie = graf.

## Alternatywy odrzucone
- Dwie projekcje w dwóch technologiach (dzisiejszy stan).
