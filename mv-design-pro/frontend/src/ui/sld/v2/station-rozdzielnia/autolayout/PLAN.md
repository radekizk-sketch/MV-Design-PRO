# E2 — Auto-layout (design doc)

**Cel:** MODEL → GEOMETRIA, którą renderer rysuje symbolami kanonu (E0). Determinizm twardy.
Warstwa layoutu zasila renderer; E0/E1 nietknięte. Najprostszy layouter SLD, nie biblioteka.

## Eksploracja (znaleziska)

- ~~Istnieje pipeline `ui/sld/core/layoutPipeline.ts`~~ (VisualGraphV1 → LayoutResultV1, FNV-1a hash,
  pasma/trunki, routing ortho) — ale dla systemu GPZ+stacje, na innym kontrakcie.
  **NIEAKTUALNE od 2026-08-08 (karta TYPY-POZA-BRAMKA): plik USUNIĘTY.** Okazał się
  NIEIMPORTOWALNY — sięgał po trzy nieistniejące moduły (`layoutInputGraph`,
  `layoutDetailRegistry`, `semanticGraphBuilder`) i 14 nieistniejących eksportów, a
  `sld_determinism_guards.py` już trzymał go na liście ścieżek wygaszonych. Decyzja
  poniżej („nie rusza pipeline'u GPZ") jest tym POTWIERDZONA, nie unieważniona.
- Presety kanonu G1–G9 są **samodzielne, ręcznie kodowane** (nie zasilane silnikiem).
- Brak adaptera MODEL→geometria dla kanonu (testy importują nieistniejący `convertToVisualGraph`).
- Metryki kanonu: szyna SN y=200, nN y=600 (Δ400), pitch pola ~345, szyna x 280–1520.

→ **Decyzja:** E2 = NOWA, prosta warstwa layoutu dla stacji kanonu, zasilana companionem (model
read-only), reużywająca glify E0 (`sldCanonKit`). Nie rusza pipeline'u GPZ ani presetów.

## Struktury (CO)

- **LayoutInput** = `StationModel` (`layoutModel.ts`): `buses {id,unKv}`, `transformers {hvBus,lvBus}`,
  `bays {id,busId,role(line|metering|source|transformer),sourceKind?,toBus?}`. Adapter
  `companionToStationModel` (PCC = najwyższe pasmo; źródło na niższej szynie ⇒ trafo blokowy + pole
  trafo na PCC + źródło na nN; syntetyczne pole pomiarowe).
- **LayoutResult** = `StationLayout` (`stationLayout.ts`): per bus `{band,y,x1,x2}`; per bay
  `{x,busY,anchorY,role,sourceKind}`; per trafo `{x,hvY,lvY}`; per edge polilinia ortho; `bbox`;
  `hash` (FNV-1a, render-independent).

## Fazy (JAK)

1. **PASMA** — distinct un_kv malejąco → indeks pasma → y = y0 + band·spacing. Bus→pasmo.
2. **PORZĄDEK** — pola na szynie wg (rank roli: line<metering<source/trafo, tie-break stabilnym
   ID). ZERO losowości.
3. **WSPÓŁRZĘDNE** — szyna główna spina pola pitchem; każda szyna nN = krótki bar pod swoim polem
   trafo; trafo WYRÓWNANE pionowo (x pola = x trafa = środek szyny nN).
4. **ROUTING** — wszystko H/V (bus→pole pionowo, trafo pionowo między pasmami).
5. **DETERMINIZM** — sort po ID, hash FNV-1a; ten sam model → bit-identyczny layout.

## Integracja (chirurgicznie)

- E2 = geometria. `StationAutoRenderer` (cienki) rysuje glify E0 na pozycjach. Brak fizyki w
  renderze (readouty z companiona). Brak layoutu w renderze.

## DoD (testy)

- DETERMINIZM: ten sam model → identyczny hash/współrzędne (+ stabilność na permutację wejścia).
- PASMA: bus we właściwym paśmie; pasma malejąco un_kv.
- SZYNA GŁÓWNA pozioma, spina pola; porządek line→metering→źródło/trafo.
- TRAFA pionowe, spinają pasma (G9: 2; G1: 1; G8: 0).
- ROUTING ortho (każdy segment H/V).
- NO-ORPHAN: każda szyna ma ≥1 pole.
- ODTWORZENIE: G1 (2 pasma), G8 (1), G9 (3, multi-trafo) → render czytelny ze MODELU.

## Łuk (C/B)

- C/E3: `StationLayout` z `bbox`/pasm/pól pod INKREMENT i LOD (collapse). Pitch/spacing w configu.
- B/E5: `bay.x/busY/anchorY` + `bbox` → hit-testing (bounding-boxy) pod hover/klik→White Box.
- Skala 53 stacji = rozmieszczenie stacji w paśmie (E3); rdzeń stacji UDOWODNIONY tu.
