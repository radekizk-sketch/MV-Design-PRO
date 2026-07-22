# SCHEMAT-10 — dowód wizualny (V12K-135)

## S2 — silnik etykiet z wyrocznią zero-kolizji

`s2-l0.png` / `s2-l1.png` / `s2-l2.png` — REALNA sieć referencyjna
(`sldSubstrate52s`, 53 stacje SN + GPZ) renderowana PRODUKCYJNYM torem v3
PO declutterze (silnik etykiet, `layout/declutter.ts`) na L0/L1/L2. Skrypt
przerywa render, jeśli `labelCollisions(scene) !== 0`, więc zrzut z definicji
pokazuje DOKŁADNIE to, co waliduje wyrocznia `noLabelCollisions` — zero kolizji
tekst↔tekst i tekst↔symbol (tolerancja 0). Regeneracja (deterministyczna):

```
cd mv-design-pro/frontend
CANON_OUT=<abs-dir> npx vite-node scripts/render_schemat10_s2.tsx   # SVG per LOD (capped 2600px, viewBox świata)
CANON_OUT=<abs-dir> node scripts/rasterize.mjs                       # SVG→PNG (playwright chromium)
```

Co dowodzą (S2): zero kolizji etykiet mierzone maszynowo (`buildScene.schemat10s2.test.ts`,
`noLabelCollisions`/`noRawEnumTokensInLabels`/`allSegmentsOrthogonal` na L0/L1/L2);
brak surowych enumów w treści (D4, słownik `core/enumLabelsPl.ts`); manhattanizacja
— zero ukośnych odcinków (D5); pełne podpisy przęseł tylko na L2 (D3). Zrzut
ŻYWEJ aplikacji (przegląd właściciela) generuje orchestrator po scaleniu (D8).

## S1 — jedna gramatyka stacji i jedna kotwica LOD

Zrzuty REALNEJ sieci referencyjnej (`sldSubstrate52s`, 53 stacje SN + GPZ)
renderowanej PRODUKCYJNYM torem v3 (`buildSceneV3` → `CompositionPreview`) na
trzech poziomach szczegółu. Regeneracja (deterministyczna):

```
cd mv-design-pro/frontend
CANON_OUT=<dir> npx vite-node scripts/render_schemat10_s1.tsx   # SVG per LOD
# rasteryzacja SVG→PNG dowolnym narzędziem (np. playwright chromium)
```

| Plik | Poziom | Co pokazuje |
|------|--------|-------------|
| `s1-l0.png` | L0 „Przegląd sieci" | Magistrala (gruby tor) + stacje jako symbol zbiorczy; sylwetka kompaktowa, S-id |
| `s1-l1.png` | L1 „Widok operatorski" | Ta sama topologia i te same kotwice + aparaty główne pól, transformatory |
| `s1-l2.png` | L2 „Stacje i aparatura" | Ta sama topologia i te same kotwice + pełna aparatura pól |

## Co dowodzą (S1)

- **Jedna kotwica LOD:** środek glifu KAŻDEJ stacji (X i Y) oraz oś magistrali są
  w TYCH SAMYCH współrzędnych świata na L0/L1/L2 — zoom zmienia WYŁĄCZNIE szczegół
  rysowany, nie układ. Szerokość świata sceny jest identyczna na wszystkich LOD
  (koniec D1 „trzy światy"). Maszynowy dowód: test „JEDNA KOTWICA"
  (`buildScene.test.ts`) i `layoutEngine.substrate.test.ts`.
- **Jeden słownik LOD:** pasek statusu („Widok: …") mówi nazwami z macierzy prawdy
  LOD §3 — L0 „Przegląd sieci", L1 „Widok operatorski", L2 „Stacje i aparatura".
- **Tor elektryczny nie znika:** sonda `lod_path_probe` zielona na L0/L1/L2
  (`npm run accept:sld-v3`).

## GAP-y (poza zakresem S1 — patrz raport)

- Jednolity korytarz międzystacyjny na L0 (obecnie `busAxisY` — pełne ujednolicenie
  na `trunkCorridorYOf` wymaga głowic w symbolu zbiorczym L0).
- Wspólny OBRYS sylwetki (RMU) rysowany jawnie na L1/L2 (dziś sylwetkę niesie
  szyna wewnętrzna + aparaty; jawny obrys = kolejna faza).

---

# SCHEMAT-10 S3 — dowód wizualny (V12K-135)

Zrzuty TEJ SAMEJ sieci referencyjnej renderowanej PRODUKCYJNĄ kanwą v3
(`SldCanvasV3`, nie `CompositionPreview` — harness debug zostaje „mono base",
patrz `theme/colorTokens.ts`) na L0/L1/L2, z jednym SYNTETYCZNYM punktem NOP
(fixtura bazowa nie niesie żadnego NOP — GAP osobny, patrz raport karty S3).
Regeneracja (deterministyczna):

```
cd mv-design-pro/frontend
CANON_OUT=<dir> npx vite-node scripts/render_schemat10_s3.tsx    # SVG per LOD
CANON_OUT=<dir> node scripts/rasterize_s3_host.mjs               # SVG→PNG (host HTML — patrz nagłówek pliku)
```

| Plik | Poziom | Co pokazuje |
|------|--------|-------------|
| `s3-l0.png` | L0 „Przegląd sieci" | Magistrala zielona (SN), GPZ w tej samej palecie (WN biały/SN zielony), rama arkusza + legenda w tokenach kanwy |
| `s3-l1.png` | L1 „Widok operatorski" | Ta sama topologia/kotwice + aparaty główne, kolor napięcia identyczny jak L0/L2 |
| `s3-l2.png` | L2 „Stacje i aparatura" | Pełna aparatura; znacznik NOP (różowy `#FF006E`) widoczny NA torze SN (zielony), wyraźnie odróżnialny |

## Co dowodzą (S3)

- **Tokeny koloru:** WSZYSTKIE tory/szyny/glify czytają z `theme/colorTokens.ts`
  (JEDNO źródło prawdy) — napięcie: 110 kV/WN biały (`VOLTAGE_COLOR.hv`), SN
  zielony (`VOLTAGE_COLOR.sn`, `#13C45A`), nN niebieski (`VOLTAGE_COLOR.nn`,
  `#0099CC`); identyczna tabela na L0/L1/L2 (funkcja czysta z meta sceny, zero
  zależności od `lod`). Widoczne w zrzutach: magistrala/pola SN spójnie
  zielone na wszystkich trzech poziomach.
- **GPZ w gramatyce stacji:** szyna WN GPZ (`#hv-bus`) czyta `VOLTAGE_COLOR.hv`
  (ta sama wartość co reszta kanwy), szyna sekcji SN GPZ czyta `VOLTAGE_COLOR.sn`
  — koniec „białej ramki innego świata" (D6): GPZ nie ma już odrębnej palety.
- **NOP wyróżniony:** znacznik NO dostaje `STATE_COLOR.nop` (`#FF006E`,
  neon róż z `DARK_SCADA_NEON_THEME_SPEC.md`), wyraźnie odróżnialny od bazy/
  napięcia na KAŻDYM LOD (widoczne w `s3-l2.png`, przybliżenie wokół pierwszej
  stacji ciągu głównego).
- **Sekcje/NOP kotwiczone:** pozycja (x,y) znacznika NOP identyczna na L0/L1/L2
  (dowód maszynowy: `buildScene.test.ts` „znacznik NOP KOTWICZONY…").

## GAP-y (poza zakresem S3 — raport karty)

- Fixtura referencyjna `sldSubstrate52s` nie niesie żadnego realnego NOP
  (`line_runs[].nop_station_ref` zawsze `null`, `corridors[].no_point_ref`
  wskazuje ref ŁĄCZNIKA, nie stacji) — rozjazd semantyki `no_point_ref`
  (switch-ref) vs `nop_station_ref` (station-ref) w adapterze v2
  (`enmToSldAdapter.ts`) to defekt osobny, poza zakresem S3.
- Klasyfikacja napięcia SYMBOLI (aparatura pól) jest pełna tylko dla
  `gridSource`/`loadArrow`/`noPoint` (deterministyczne po `symbolId`) —
  pozostała aparatura (breaker/disconnector/…) nie niesie dziś w `ownerRef`
  znacznika napięcia pola i spada na fallback SN; pełne rozróżnienie wymaga
  przeniesienia `voltage_kv` przez `compose/station.ts`/`compose/gpz.ts` do
  `PreviewElementMeta` (zmiana kontraktu kompozycji, S4/S5).
- Nakładka selekcji (`HIGHLIGHT_COLOR.selection`) jest tokenem rezerwowym —
  `SldCanvasV3` nie ma dziś własnej nakładki stroke dla zaznaczenia na kanwie
  (żyje w warstwie wyższej, `useSelectionStore`); podłączenie do kanwy to S4/S5.
- Pełny LOD-owy „collapse" GPZ (sekcje A/B jako zwarty glif na L0, per matrix
  §3) wymaga zmian geometrii `compose/gpz.ts` (dziś GPZ renderuje pełny
  szczegół na WSZYSTKICH LOD) — poza zakresem S3 (minimum: tokeny+typografia+
  paleta, zrealizowane), GAP do S5.
