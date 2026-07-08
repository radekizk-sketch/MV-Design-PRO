# SLD CAD REBUILD PLAN V3 — plan wdrożenia specyfikacji SLD_CAD_SPEC_V3

**Nadrzędny dokument:** `docs/sld/SLD_CAD_SPEC_V3.md` (BINDING — czytaj NAJPIERW).
**Zastępuje:** kroki K4-K6 z `SLD_CAD_SCADA_QUALITY_PLAN.md` (K1-K3 wykonane,
commit `c088ef4`; tamten plan pozostaje źródłem: harness §3, sonda kolizji,
reguły §1, prompt bazowy §6 — tu tylko rozszerzenia).
**Branch:** `claude/sld-schema-cad-scada-rqvz73`. Zasady commit/push/bramek —
QUALITY_PLAN §1 (bez zmian).

## Strategia: równoległa budowa `sld/v3/` + jawny cutover + usunięcie starego

Historia repo dowodzi, że przebudowa „w miejscu" destabilizuje (2400+ testów na
v2). Budujemy **`frontend/src/ui/sld/v3/`** obok, z bramką cutover i
OBOWIĄZKOWĄM krokiem usunięcia ścieżki renderu v2 na końcu (żeby nie powstała
trwała „druga prawda" — lekcja z §20/§21 recovery). Elektryka (adapter v2,
§8 spec) jest WSPÓŁDZIELONA, nie kopiowana.

Definicja ukończenia całości = wszystkie wyrocznie spec §9 zielone na fixturze
`sldSubstrate52s` ORAZ na min. 2 syntetykach (mała sieć 5 stacji; sieć z ringiem
i NO), render-odbiór per rola zaliczony, ścieżka v2 renderu usunięta.

---

### F1. Fundament: siatka + biblioteka symboli
- `v3/core/grid.ts` (GRID=8, snap, typy Rect/Port), `v3/core/text.ts`
  (pomiar szerokości: measureText z fallbackiem deterministycznym — fallback
  MUSI być użyty w testach node'owych).
- `v3/symbols/*.tsx` — komplet z tabeli spec §3; każdy symbol eksportuje
  `SYMBOL_DEF` (bbox/ports/labelSlots) + komponent SVG.
- Testy: bbox wielokrotność GRID; porty na siatce; snapshot struktury SVG
  (data-symbol-canon), stany łączników (otwarty/zamknięty geometrią).
- DoD: `grid_probe` na samych symbolach = 100%; vitest zielone; commit.

### F2. Layout core: measure → bands → columns (czysta funkcja, bez DOM)
- `v3/layout/measure.ts`, `v3/layout/bands.ts`, `v3/layout/columns.ts` wg spec
  §5.1–5.3. Wejście: scena elektryczna (typ z adaptera v2 — NIE nowy model
  danych!). Wyjście: pozycje symboli + zarezerwowane sloty etykiet.
- Testy jednostkowe na syntetykach: kolumna szersza gdy dłuższa etykieta
  segmentu; pasma nie nachodzą (asercje arytmetyczne, bez renderu); prefix-sum
  determinizm.
- DoD: testy + property-test „żadne dwa sloty się nie przecinają"; commit.

### F3. Routing: kanały + węzły + §16
- `v3/layout/route.ts` wg spec §5.4. Trasy niosą `fromTerminal/toTerminal`
  (przejęte z segmentPaths adaptera — §16 NIE wolno zgubić).
- Testy: T-węzeł=kropka, skrzyżowanie bez kropki, tory równoległe co GRID,
  zero przecięć trasa↔bbox (property-test na syntetykach).
- DoD: `port_probe`+`wire_probe` na syntetykach = 100%/0; commit.

### F4. Label resolver + arkusz
- `v3/layout/labels.ts` (spec §4/§5.5, leader-line przy slocie ≥2),
  `v3/sheet/Frame.tsx` (ramka, strefy, skala, legenda; title block reuse).
- DoD: `overlap_probe` (rozszerzony o bbox symboli) na syntetykach = 0; commit.

### F5. Kompozycja stacji i GPZ z prymitywów
- `v3/compose/station.ts` (spec §3 „Stacja SN/nN": szyna + kolumny pól z
  `defaultSnBayRoles`, TR2W, szyna nN, odpływy), `v3/compose/gpz.ts` — GPZ
  kanoniczny przemapowany na prymitywy v3 (inwarianty noDirectTie /
  busbarTopology / parity PRZENIEŚĆ jako testy v3 — te same asercje data-*).
- DoD: testy inwariantów GPZ zielone na v3; render pojedynczej stacji i GPZ
  (harness) oceniony wizualnie; commit.

### F6. SldCanvasV3 + LOD + nakładki stanu
- `v3/canvas/SldCanvasV3.tsx`: kamera/safe-viewport/LOD reuse z v2 (import, nie
  kopia). Nakładka energizacji/kierunków (spec §6) czyta solver companion jak
  dziś (jedna prawda). Trzy LOD-y wg spec §7, każdy z własną rezerwacją.
- DoD: wyrocznie §9.1–9.5 na `sldSubstrate52s` dla L0/L1/L2 = zielone; commit.

### F7. Render-odbiór + CI
- Harness QUALITY_PLAN §3 rozszerzony: `overlap+grid+port+wire+determinism`
  jako jeden skrypt `scripts/sld_v3_acceptance.mjs` (uruchamialny lokalnie;
  do CI po cutoverze). PNG per rola (projektant: dane kabli/TR/NO; operator:
  stany łączników/energizacja; audytor: zgodność IEC/ramka).
- DoD: wszystkie wyrocznie zielone + PNG zaakceptowane; commit.

### F8. Cutover + usunięcie v2 renderu
- Feature-flag → domyślnie v3; migracja testów integracyjnych kanwy; po zielonym
  pełnym suicie USUŃ: mini-RMU card path, geometrię slotową (PITCH), declutter
  po fakcie (globalny pass z c088ef4 staje się zbędny — usuń), stary
  CableRunRenderer rysunek etykiet. Adapter elektryczny ZOSTAJE.
- Zaktualizuj: sld_determinism_guards (lista testów v3), MACIERZ_TESTOW,
  SLD_RECOVERY_ACCEPTANCE (§ nowa sekcja V3), INDEX dokumentów.
- DoD: jedna ścieżka renderu; pełny suite zielony; guardy zielone; push.

---

## Prompt kontynuacji (wklej świeżemu agentowi)

```
Pracujesz w /home/user/MV-Design-PRO, branch claude/sld-schema-cad-scada-rqvz73.
Przeczytaj W TEJ KOLEJNOŚCI: docs/sld/SLD_CAD_SPEC_V3.md (wiążąca),
docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md (fazy F1-F8; sprawdź git log który
etap ukończono — commity prefiksowane "feat(sld-v3): F<n>"),
docs/execplans/SLD_CAD_SCADA_QUALITY_PLAN.md §1 i §3 (reguły + harness + sonda).
Wykonuj fazy PO KOLEI, każda: implementacja → testy → wyrocznie spec §9 dla
zakresu fazy → render 1:1 (harness) → commit ze stopką (QUALITY_PLAN §1.7) →
push. PNG + sonda to dowód; testy to warunek konieczny. Nie fałszuj zieleni,
nie łam determinizmu, nie duplikuj elektryki adaptera v2 (współdziel). Gdy faza
okaże się większa niż opis lub sprzeczna ze spec — STOP i spisz znalezisko w
planie zamiast hackować. Nie pytaj o pozwolenie na fazy z planu.
```
