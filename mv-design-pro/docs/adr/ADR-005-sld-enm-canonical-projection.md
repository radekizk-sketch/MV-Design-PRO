# ADR-005: SLD jako kanoniczna projekcja ENM

## Status

**Zaakceptowane** — 2026-02-07

## Kontekst

System MV-DESIGN-PRO wymaga schematu jednokreskowego (SLD) jako centralnego
narzędzia wizualizacji sieci elektroenergetycznej. Schemat musi być:

1. **Deterministyczny** — ten sam model → identyczny schemat
2. **Dwukierunkowy** — klik na SLD → nawigacja do kreatora/inspektora
3. **Spójny z ENM** — SLD jest projekcją EnergyNetworkModel, nie niezależnym bytem

Dotychczasowy system miał schemat SLD odseparowany od modelu ENM, co prowadziło
do rozbieżności między wizualizacją a danymi obliczeniowymi.

## Decyzja

### SLD jest kanoniczną projekcją ENM

SLD NIE jest niezależnym diagramem — jest **deterministyczną projekcją**
EnergyNetworkModel na przestrzeń 2D (canvas). Implikacje:

1. **Jednokierunkowy przepływ danych**: ENM → SLD (nigdy odwrotnie)
2. **Bijection**: Każdy symbol SLD ↔ dokładnie jeden element ENM
3. **Rozszerzenia topologiczne**: Substation, Bay, Junction, Corridor
   istnieją w ENM i są projektowane na overlay SLD (ramki stacji, trunk path)
4. **SelectionRef**: Klik na SLD → `SelectionRef` → nawigacja do kreatora + inspektor

### Warstwa geometrii stacyjnej

Nowa warstwa `StationGeometry` rozszerza SLD o:

- **StationBoundingBox (NO_ROUTE_RECT)**: Ramka stacji, strefa wyłączona z routingu
- **TrunkPath**: Wyróżniona ścieżka toru głównego SN
- **EntryPointMarker**: Punkt wejścia kabli do stacji

Warstwa ta jest obliczana z ENM + TopologyGraph + pozycji szyn (z pipeline layout).

### Cross-reference raport ↔ SLD

Każdy element w raporcie (PDF/DOCX) zawiera odniesienie do:
- `enm_ref_id` — identyfikator w modelu
- `sld_symbol_id` — identyfikator na schemacie
- `wizard_step_hint` — krok kreatora do nawigacji

## Konsekwencje

### Pozytywne

- Eliminacja rozbieżności SLD ↔ model
- Nawigacja zwrotna: raport → SLD → kreator
- Determinizm: regresje wykrywane automatycznie (golden tests)
- Warstwa topologiczna (stacje, magistrale) widoczna na schemacie

### Negatywne

- Wymaga rozszerzenia ENM o encje topologiczne (Substation, Bay, Junction, Corridor)
- Pipeline SLD musi obsługiwać nowe typy geometrii
- Koszty obliczeniowe: dodatkowa warstwa station geometry

### Ryzyka

- Backward compatibility: istniejące modele bez encji topologicznych działają
  bez zmian (pola `= []` w Pydantic)
- Performance: station geometry jest lekką operacją (O(n) szyn)

## Referencje

- SYSTEM_SPEC.md § 9 (SLD)
- sld_rules.md § G.1 (Inspector synchronization)
- ui_canonical_parity.md (Property grid alignment)
