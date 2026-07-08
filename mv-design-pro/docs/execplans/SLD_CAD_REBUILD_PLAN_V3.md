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

Definicja ukończenia całości = wszystkie wyrocznie spec §11 zielone na fixturze
`sldSubstrate52s` ORAZ na min. 2 syntetykach (mała sieć 5 stacji; sieć z ringiem
i NO), render-odbiór per rola zaliczony, ścieżka v2 renderu usunięta.

---

### F1. [DONE] Fundament: siatka + biblioteka symboli
- ZROBIONE: `v3/core/grid.ts` (GRID=8, snap, V3Rect, SymbolPort),
  `v3/core/text.ts` (4 klasy t1-t4; pomiar WYŁĄCZNIE deterministyczną formułą
  `len × 0.62 × fontSize` — decyzja: DOM-measure ZREZYGNOWANY całkowicie, jedna
  prawda geometrii wszędzie, determinizm), `v3/symbols/defs.ts` (15 symboli:
  CB/DS/ES/rozłącznik-bezp./TR2W/głowica/mufa/NO/węzeł/CT/VT/SA/PV/BESS/G +
  fabryka szyny `makeBusbarDef`), `v3/symbols/glyphs.tsx` (glify IEC, stany
  łączników GEOMETRIĄ, rysunek bazowy mono + `stroke` override na nakładki).
- Odstępstwo od spec §3 (udokumentowane w defs.ts): DER 32×32 (nie 24×24) —
  port centralny musi leżeć na siatce; wyrocznia siatki nadrzędna.
- `labelSlots` per symbol PRZENIESIONE do F4 (resolver etykiet jest ich
  jedynym konsumentem — definicje razem z konsumentem, bez martwych danych).
- Testy: `v3/symbols/__tests__/symbols.test.tsx` — 52 zielone (grid_probe
  statyczny 100%: bbox %8, porty na siatce i krawędzi; kompletność rejestru;
  stany CB/DS geometrią; NO z jawną przerwą; determinizm pomiaru tekstu).
- Bramki: tsc, eslint, no_codenames (uwaga: „P7" w stringu testu wpada pod
  guard — używaj pełnych słów w opisach), forbidden_ui_terms, sld_determinism.

### F2. [DONE] Layout core: measure → bands → columns (czysta funkcja, bez DOM)
- WYKONANE (implementacja: agent Sonnet; recenzja: agent Opus —
  **APPROVE-WITH-FIXES**, wszystkie poprawki wdrożone; nadzór + bramki: sesja
  nadrzędna). Commity: `2948ed3` (rdzeń) + follow-up (poprawki recenzji).
- Dostarczone: `measure.ts` (szerokości z treści + snapUp; typ wejścia przez
  `Pick<StationOnRunRendererProps,…>` — zero cienia modelu; sidecar oznacznika
  aparatu `bay.designation` t3 + wejście `bayDirectionCaptions` na podpisy
  kierunków §9 od F5; formatter mocy TR importowany z v2 — jedna prawda),
  `bands.ts` (B1..B6, styk bez nachodzenia, półotwarta geometria), `columns.ts`
  (prefix-sum; `''`/whitespace segmentu = brak slotu), `snapUp` w `core/grid.ts`.
- Testy: 56 w layout.test.ts (w tym property 36 przypadków parowego
  nieprzecinania rezerwacji); łącznie 585/585 zielonych (v3 + renderer v2).
- ZAPISANE DŁUGI/RYZYKA dla F3-F5 (z recenzji Opusa + raportu poprawek):
  (r1) B2 stała wysokość 32px — podpisy portów `kier. Sxx` muszą się zmieścić
       albo B2 liczyć z treści (F3);
  (r2) alternacja 2-wierszowa B1 (spec §5.2) wymaga sprzężenia po columns —
       policzyć stagger PO prefix-sumach i ewentualnie przeliczyć B1 (F3/F4);
  (r3) scalić DWA wejścia segmentu (wysokość B1 w bands vs teksty w columns)
       w jedno wejście „segmenty" (F3) — dziś `''` daje wysokość w bands,
       a nie daje slotu w columns (spójne z decyzją, ale do scalenia);
  (r4) TRZECIA kopia formatera mocy TR w `MiniBlockRmuRenderer.tsx:164`
       (lokalna) — ujednolicić przy F5/F8 (cutover);
  (r5) brak truncacji długich nazw (>22 zn.) — hak w F4/F6 (LOD);
  (r6) DER liczony w bloku stacji (B4) vs pasmo B3 — decyzja kompozycji w F5.

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
- DoD: wyrocznie §11.1–11.5 na `sldSubstrate52s` dla L0/L1/L2 = zielone; commit.

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
Wykonuj fazy PO KOLEI, każda: implementacja → testy → wyrocznie spec §11 dla
zakresu fazy → render 1:1 (harness) → commit ze stopką (QUALITY_PLAN §1.7) →
push. PNG + sonda to dowód; testy to warunek konieczny. Nie fałszuj zieleni,
nie łam determinizmu, nie duplikuj elektryki adaptera v2 (współdziel). Gdy faza
okaże się większa niż opis lub sprzeczna ze spec — STOP i spisz znalezisko w
planie zamiast hackować. Nie pytaj o pozwolenie na fazy z planu.
```
