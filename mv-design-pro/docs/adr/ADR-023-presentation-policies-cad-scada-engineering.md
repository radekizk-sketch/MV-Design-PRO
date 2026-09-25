# ADR-023: Warstwy prezentacji, scena semantyczna z backendu i polityki CAD / SCADA / ENGINEERING

**Status:** PROPOSED (program Digital Twin 2026-09; werdykt wizualny B-02 należy do właściciela)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md`; `../twin/SLD_SYMBOL_SYSTEM_PLAN.md`

## Kontekst
Projekcja SN żyje w 100 % w kliencie (35,3 tys. LOC rekonstruuje topologię), dwie rodziny symboli, trzy sceny per LOD, brak trybów prezentacji, edycja layoutu nieobecna, ~54 tys. LOC martwego kodu SLD, martwy potok SLD v1 w backendzie (A7-01…11).

## Decyzja
Sześć warstw: L1 scena semantyczna z backendu (`SceneSemanticsV1` — jedna dla SN i nN, wzorzec projekcji nN 3.0.0) → L2 layout (auto + `LayoutDocument` nadpisań per widok, zachowywany) → L3 symbole (jeden `ElectricalCadSymbolRegistry`, pakiet R3 zatwierdzany przez właściciela przed migracją renderera) → L4 render z `PresentationPolicy` (CAD: dokument, norma, tabliczka; SCADA: stany as-operated, alarmy, pomiary; ENGINEERING: wyniki, przekroczenia, trace) → L5 interakcja (nawigacja, akcje obiektowe) → L6 dokument (`SheetDocument`: arkusze, rewizje, DXF/PDF z backendu). Jedna geometria; LOD jako filtr widoczności.

## Konsekwencje
- Klient nie liczy topologii ani energizacji; równość krawędzi sceny z `TopologyView` testowana na rejestrze sieci.
- Kasacja v2 JSX bez montażu, `engine/sld-layout`, harnessów, martwej biblioteki SVG, drugiego rejestru symboli, backendu SLD v1.
- Granica SCADA: stany as-operated w warstwie OPERATIONAL/MEASUREMENT, bez `pending_command` w modelu projektowym; brak sterowania.

## Alternatywy odrzucone
- Dokończenie projekcji SN w kliencie: utrwala §185 FAIL („klient rekonstruuje").
