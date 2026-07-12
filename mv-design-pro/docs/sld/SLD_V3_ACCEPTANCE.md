# SLD V3 — skrypt akceptacyjny (F7) i render-odbiór per rola

**Status:** AKTYWNY. **Zakres:** `frontend/src/ui/sld/v3/`.
**Powiązane:** `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md` (§F7),
`docs/execplans/SLD_CAD_SCADA_QUALITY_PLAN.md` (§1 reguły, §3 harness),
`docs/sld/SLD_CAD_SPEC_V3.md` (§11 wyrocznie, §16 ciągłość elektryczna).

Ten dokument opisuje DWA niezależne artefakty dostarczone w fazie F7:

1. **Skrypt akceptacyjny** (`frontend/scripts/sld_v3_acceptance.mjs`) —
   uruchamia WSZYSTKIE wyrocznie spec §11/§9/§16 na realnej fixturze
   `sldSubstrate52s` (53 stacje SN + 1 GPZ), per LOD 0/1/2, i wypisuje raport
   PASS/FAIL. Docelowo (po cutoverze F8) podłączany do CI — dziś uruchamiany
   lokalnie.
2. **Render-odbiór per rola** (`frontend/scripts/sld_v3_render_roles.mjs`) —
   renderuje realny `SldCanvasV3` (nie atrapę) do PNG dla trzech ról
   (projektant/operator/audytor), zapisuje do `docs/sld/renders/v3/`.

---

## 1. Skrypt akceptacyjny

### Uruchomienie

```bash
cd mv-design-pro/frontend
npx vite-node scripts/sld_v3_acceptance.mjs
# lub:
npm run accept:sld-v3
```

Wymaga `vite-node` (devDependency, już w `package.json`) — skrypt jest `.mjs`,
ale importuje moduły `.ts` bezpośrednio (`scene/buildScene.ts`,
`layout/labels.ts`, `symbols/defs.ts`, `core/grid.ts`); `vite-node` transpiluje
je w locie tym samym resolverem, co Vite/Vitest. Uruchomienie przez czysty
`node` NIE zadziała (brak transpilacji TS).

### Co sprawdza

Dla KAŻDEGO z LOD 0/1/2, na scenie zbudowanej `buildSceneV3(enm, lod)`:

| Wyrocznia | Funkcja (reużyta z produkcji, nie duplikat) | Spec |
|---|---|---|
| Siatka | `allSceneGeometryOnGrid` (`scene/buildScene.ts`) | §11.2 |
| Zero nachodzeń symbol↔symbol | `noSceneSymbolOverlaps` (`scene/buildScene.ts`) | §11.1 |
| Zero nachodzeń etykieta↔etykieta / etykieta↔symbol | `overlapProbe` (`layout/labels.ts`) | §11.1 |
| Zero kolizji etykieta↔przewód | `labelWireCollisions`/`noLabelWireCollisions` (`scene/buildScene.ts`) | §11.1 (rozszerzenie D3/k6) |
| Zakaz tokenów WE/WY/ODG | `noForbiddenDirectionTokens` (`scene/buildScene.ts`) | §9 |
| Etykiety w arkuszu | `rect.x >= 0` na wszystkich etykietach | D2/k5b |
| Liczba stacji zgodna z fixturą | `scene.meta.stationCount === 53` | §10 |
| Determinizm | dwa wywołania `buildSceneV3(enm, lod)` → identyczny `JSON.stringify` | P7 |

Dodatkowo, WYŁĄCZNIE na LOD 2 (jak w teście źródłowym
`scene/__tests__/buildScene.test.ts`, sekcja „ciągłość elektryczna ciągu
głównego"), skrypt powtarza asercje §16:
- każda stacja ciągu głównego ma symbole w scenie,
- stacje narysowane w kolejności `topologyRuns[].stationRefs` (rosnące X),
- między każdą parą kolejnych stacji istnieje odcinek mostkujący przerwę,
- GPZ jest połączony z pierwszą stacją ciągu głównego,
- istnieją węzły routingu (junctions/crossings).

Te asercje NIE duplikują logikę testów — wołają TE SAME wyrocznie
eksportowane z `scene/buildScene.ts` i `layout/labels.ts`, które chronią
`scene/__tests__/buildScene.test.ts`. Skrypt jest więc równoległym
konsumentem tych samych oracle'i, nie nową implementacją reguł.

### Jak czytać raport

Przykład (skrócony):

```
=== LOD 2 ===
  liczby: symbole=409 segmenty=390 etykiety=543 stacje=53
  [PASS] grid_probe (§11.2): 100% originów symboli i wierzchołków tras na siatce
  [PASS] noSceneSymbolOverlaps: zero nachodzeń symbol↔symbol
  [PASS] overlapProbe (§11.1): zero kolizji etykieta↔etykieta i etykieta↔symbol — overlapCount=0
  [PASS] noLabelWireCollisions (D3/k6): zero kolizji etykieta↔przewód — kolizje=0
  ...
=== WYNIK: ALL PASS ===
```

- Każda linia `[PASS]`/`[FAIL]` to JEDNA wyrocznia dla JEDNEGO LOD.
- Linia `liczby:` to surowe metryki sceny (symbole/segmenty/etykiety/stacje) —
  do porównania między biegami przy audycie regresji (np. „etykiety=543"
  nagle spada do 0 → podejrzenie o urwaną kompozycję).
- `exit code`: `0` gdy WSZYSTKO PASS na WSZYSTKICH LOD; `1` gdy jakikolwiek
  FAIL (w tym: `buildSceneV3` rzucił wyjątek — łapane per LOD, raport
  pozostałych LOD i tak się wypisuje, żeby jeden padający LOD nie ukrył stanu
  innych).
- Raport jest deterministyczny bajt-po-bajcie między uruchomieniami (zero
  `Date.now()`/`Math.random()`/UUID w treści) — dwa biegi na tym samym
  kodzie i fixturze dają identyczny `stdout` (zweryfikowane `diff` przy
  dostawie F7).

### Co skrypt NIE robi

- Nie renderuje PNG (to `sld_v3_render_roles.mjs`, sekcja 2).
- **AKTYWNY w CI** (F8b-2, `SLD_CAD_REBUILD_PLAN_V3.md` §F8b-2): krok
  „Run SLD v3 render-odbiór acceptance (F7/F8b-2)" w job `sld-contract-tests`
  (`.github/workflows/sld-determinism.yml`) uruchamia `npm run accept:sld-v3`
  po istniejących krokach vitest (job już ma `npm ci` wcześniej). Exit≠0 na
  jakimkolwiek FAIL blokuje CI, tak samo jak `sld_determinism_guards.py`
  w job `sld-guards`.
- Nie naprawia znalezionych defektów — jeśli wyrocznia FAIL-uje, to dowód
  realnego defektu w kodzie v3 (scena/layout), nie w skrypcie. Skrypt STOP-uje
  z niezerowym exit code; naprawa jest zadaniem osobnym.

---

## 2. Render-odbiór per rola (PNG)

### Uruchomienie

```bash
cd mv-design-pro/frontend
npx vite-node scripts/sld_v3_render_roles.mjs
```

Generuje 5 plików PNG w `mv-design-pro/docs/sld/renders/v3/`:

| Plik | Rola | LOD | Treść |
|---|---|---|---|
| `projektant_L2_full.png` | Projektant | 2 | Cała sieć, pełny szczegół (fit-to-view). |
| `projektant_L2_zoom_gpz.png` | Projektant | 2 | Zoom na GPZ (pole liniowe + pole transformatorowe + szyna WN). |
| `projektant_L2_zoom_stacja.png` | Projektant | 2 | Zoom na stację ciągu głównego — typ/przekrój/długość kabla, oznaczniki Q/TR, moc transformatora, nazwa/kod stacji. |
| `operator_L1_overlay.png` | Operator | 1 | Pełne symbole (bez etykiet segmentów/kierunku), z nakładką energizacji `SldV3Overlay` — część symboli zielona (pod napięciem), część wygaszona. |
| `audytor_L0_plan.png` | Audytor | 0 | Pełny plan sieci — stacje jako symbol zbiorczy + kod, ramka arkusza + legenda IEC. |

### Mechanizm (żeby zrozumieć liczby w skrypcie)

Skrypt renderuje REALNY `SldCanvasV3` przez `renderToStaticMarkup` (jak
wzorzec nadzorcy z `SLD_CAD_SCADA_QUALITY_PLAN.md` §3), zapisuje statyczny
HTML (pośredni artefakt — w scratchpadzie, NIE w repo), a następnie
rasteryzuje Playwrightem (`chromium`, `executablePath: '/opt/pw-browsers/chromium'`).

Zoomy (`clip`) są liczone przez REUŻYCIE tej samej matematyki kamery, którą
`SldCanvasV3` wykonuje wewnętrznie (`canvas/camera.ts`
`computeInitialCameraState` + `boundingBoxOfRect`, zero duplikacji) —
świat→ekran przez `worldToScreen` (`v2/viewport/ViewportController.ts`).
Region zoomu (świat) to bbox symboli/etykiet GPZ (`testId` zawierające
`gpz`) lub stacji wybranej (`testId`/`ownerRef` zawierające hash stacji z
`meta.mainTrunkStationIds[4]`).

**Ważne, k4 (patrz `SLD_CAD_REBUILD_PLAN_V3.md` F6b-2 i STOP-notatka niżej):**
kamera `SldCanvasV3` fituje ZAWSZE do bboxa sceny LOD 2, niezależnie od
`lodOverride` przekazanego do komponentu. Dla `operator_L1_overlay` i
`audytor_L0_plan` (LOD 1/0, bboxy MNIEJSZE niż LOD 2) to oznacza, że bez
korekty treść wychodzi mała, w rogu płótna 1920×1080. Skrypt KOMPENSUJE to
na poziomie harnessu (kadr do WŁASNEGO bboxa danego LOD + supersampling
`deviceScaleFactor`) — **nie zmienia produkcyjnej kamery** (poza zakresem
F7; zmiana kamery to decyzja cutoveru F8, patrz notatka k4 w planie).

Treść jest wektorowa (SVG) — `deviceScaleFactor` (Playwright) dobierany
dynamicznie per zoom (`dsfFor`, cel: krótszy wymiar clipu × dsf ≥ ~900px),
więc supersampling nie degradaje jakości tekstu/linii (brak utraty ostrości
jak przy rastrze).

### Gdzie żyją rendery (decyzja)

`mv-design-pro/docs/sld/renders/v3/` — katalog NIE jest dotąd w `.gitignore`
(sprawdzone: `.gitignore` ignoruje tylko `mv-design-pro/artifacts/`, cel CI
`sld_render_artifacts.ts`, oraz `mv-design-pro/qa-*.png`/
`mv-design-ui-implementation-*.png` — żadny wzorzec nie łapie
`docs/sld/renders/`). Istnieje PRECEDENS commitowania PNG w
`docs/audit/visual_iteration_K30_*/` (ok. 22 MB już w repo). Ten agent
(implementacyjny, bez uprawnień do commitowania — patrz zasady sesji) NIE
commituje plików — leżą w working tree jako `untracked`. **Decyzja
pozostawiona recenzentowi (Opus)/nadzorcy:** czy dodać je do repo (`git add`)
czy pozostawić jako lokalny artefakt weryfikacyjny nieśledzony przez git
(w takim razie warto dodać wpis do `.gitignore`, którego dziś nie ma).

---

## 3. Znane ograniczenia (dziedziczone, nie do naprawy w tej fazie)

- **k1** (`canvas/overlay.ts`): nakładka energizacji koloruje WYŁĄCZNIE
  symbole i odcinki GPZ (mają `meta.testId`) — odcinki magistrali/stacji
  (poza GPZ) nie niosą `testId`, więc `operator_L1_overlay.png` nie pokazuje
  koloru na przewodach spoza GPZ. Widoczne na renderze: kolor tylko na
  aparatach (kwadraty/kółka), nie na liniach.
- **k4** (`canvas/SldCanvasV3.tsx`): patrz sekcja 2 wyżej — kamera fituje
  zawsze do LOD 2; przy realnym użyciu `lodOverride` (Results Browser itp.)
  bez korekty na poziomie wołającego, LOD 0/1 renderują się małe. Skrypt
  render-odbioru kompensuje to WYŁĄCZNIE na poziomie harnessu (crop),
  dokumentując defekt, nie naprawiając go.
- Fixtura `sldSubstrate52s` nie ma punktów NO (`isNop`) — żaden z wymaganych
  PNG nie może zademonstrować wizualnie badge'a „NO" na tej fixturze
  (symbol `noPoint` istnieje w kodzie i jest pokryty testami jednostkowymi
  poza tą fixturą — patrz `symbols/__tests__/symbols.test.tsx`).
