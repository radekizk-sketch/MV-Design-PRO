# SLD CAD/SCADA QUALITY PLAN (2026-07) — plan wykonawczy dla dowolnego agenta

**Cel nadrzędny:** schemat SLD jakości CAD/SCADA (klasa ETAP/ABB/DIgSILENT/Mikronika):
inżynier projektujący sieć widzi WSZYSTKO, czego potrzebuje — poprawne technicznie
i fizycznie — bez klikania i bez nachodzących etykiet, na każdym poziomie detalu.

Ten dokument jest SAMOWYSTARCZALNY: zawiera kontekst, twarde reguły, przepis na
harness renderujący, inwentarz znanych defektów (z dowodami), kroki z kryteriami
ukończenia oraz prompt kontynuacji do wklejenia świeżemu agentowi. Wykonawca NIE
potrzebuje historii konwersacji.

---

## 0. Stan zastany (branch `claude/sld-schema-cad-scada-rqvz73`)

Zrobione i wypchnięte (commity, od najstarszego):
- `5200bbf` — §16 terminal-to-terminal na ścieżce korytarzowej (SegmentTerminalRef).
- `0dd5b67` — Step 7: safe viewport + kamera mobilna (E15/E16), `initialCameraForNetwork`.
- `9fc804d` — Step 6: usunięcie martwego klastra layoutu spine/corridor/hierarchical
  (~4850 linii), przepięcie CI determinizmu z martwego silnika na żywe testy substrate.
- `e5d078b` — Step 6b: `GpzCanonicalRenderer` AKTYWNYM rendererem GPZ (§21);
  `mapCanonicalToSwitchgearProps` usunięty; testy inwariantów strzegą żywej ścieżki.
- `a98f2e2` — §16 domknięte także na slot-fallbacku (`segmentTerminalOf` wspólny).
- `5a235ce` — czytelne etykiety kabli: jawny `fontSize`/`fontFamily` zamiast klasy
  Tailwind (16px serif → 11px sans w kontekstach bez CSS; render-weryfikowane).

Macierz akceptacji: `docs/sld/SLD_RECOVERY_ACCEPTANCE_2026-07.md` (statusy §16/20/21/24/25/26/32 = PROVEN).
Poprzedni execplan: `docs/execplans/SLD_RECOVERY_EXECPLAN.md`.

## 1. Twarde reguły (złamanie = porażka zadania)

1. **PNG to dowód.** Kryterium uznaje się za spełnione WYŁĄCZNIE po ocenie renderu
   1:1 (skala ~1.0, deviceScaleFactor≤2) + programowej sondzie kolizji (patrz §3).
   Zielone testy są warunkiem koniecznym, nie wystarczającym.
2. **Nie fałszuj zieleni.** Nie usuwaj/nie rozluźniaj asercji, nie hard-koduj do
   fixtury, nie chowaj etykiet zamiast je rozmieścić. Nowy oracle musi być
   udowodniony jako realny (pokaż, że pada bez fixa).
3. **Determinizm.** Ten sam input → identyczny output. Zmiana geometrii świata
   (rozstawy!) jest DOZWOLONA jako świadomy krok layoutu, ale musi być
   deterministyczna; testy substrate aktualizuj uczciwie (nowe wartości z nowego
   układu, nie poluzowane tolerancje). Bez `Date.now/random/UUID` w adapterze/enginie.
4. **Warstwy.** Zero fizyki poza solverami. Adapter (`enmToSldAdapter`) = projekcja
   ENM; renderery = czysty SVG z propsów. Etykiety po polsku, zero codename'ów
   (P7/P11/K30 w UI zakazane — guard `no_codenames_guard.py`).
5. **Chirurgicznie.** Każda zmieniona linia śledzi się do celu kroku. Nie refaktoruj
   obok. Styl komentarzy: polski, jak w otoczeniu.
6. **Bramki przed pushem** (z `mv-design-pro/frontend` i `mv-design-pro/`):
   - `npm run type-check` (tsc czysty)
   - `npx vitest run --no-file-parallelism src/ui/sld/v2 src/engine` (wszystko zielone; raportuj liczby)
   - `npx eslint <zmienione pliki>`
   - `python scripts/sld_determinism_guards.py`, `python scripts/no_codenames_guard.py`,
     `python scripts/forbidden_ui_terms_guard.py`, `python scripts/docs_guard.py`
   - render 1:1 + sonda kolizji (§3) — PRZED uznaniem kroku za DONE.
7. **Commit/push.** Branch `claude/sld-schema-cad-scada-rqvz73`, push
   `git push -u origin claude/sld-schema-cad-scada-rqvz73` (retry 2s/4s/8s/16s).
   Stopka commita:
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` +
   `Claude-Session: https://claude.ai/code/session_01DThSt8R3hacawkiEgYKHoi`.
   Bez PR, chyba że użytkownik poprosi.

## 2. Mapa kodu (gdzie co jest)

- **Adapter ENM→SLD:** `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts`
  - stałe rozstawu: `STATION_PITCH`, `RUN_PITCH`, `Y_RUN_BASE`,
    `POST_STATION_SEGMENT_PITCH`, `STATION_RUN_TRUNK_OFFSET_Y` (=80; oś magistrali
    nad stacją).
  - `buildCorridorRunGeometry` (tor korytarzowy, kotwice = stacje) i
    `buildRunSegmentPaths` (slot-fallback); OBA ustawiają `fromTerminal/toTerminal`
    przez `segmentTerminalOf` (§16 — nie zepsuć!).
  - etykiety odcinków: `segmentLabels` (tekst typ·przekrój·długość) budowane w
    `buildCorridorRunGeometry` / `buildRunSegmentLabels`.
- **Renderer ciągów:** `frontend/src/ui/sld/v2/renderer/CableRunRenderer.tsx`
  - `declutterSegmentLabels` (~:1200): lane'y co ±20px w pionie, szacunek szerokości
    `estimateLabelWidth = clamp(52, len*7.2, 220)`, wysokość wiersza 18px.
  - `declutterSegmentTypeBadges`, keep-clear boxy stacji trafiają do declutteru.
  - etykiety widoczne od `lod ≥ 2` (linia ~180).
- **Renderer stacji:** `frontend/src/ui/sld/v2/renderer/StationOnRunRenderer.tsx`
  (nazwa stacji, kod S01…, kVA, WE/WY/ODG, szyna SN na osi magistrali).
- **Renderer GPZ (AKTYWNY):** `frontend/src/ui/sld/v2/renderer/GpzCanonicalRenderer.tsx`
  (testy inwariantów: noDirectTie / busbarTopology / visualParityChecklist strzegą TERAZ żywej ścieżki).
- **Silnik layoutu (żywy):** `frontend/src/engine/sld-layout/layoutEngine.ts`
  (`DEFAULT_FRAME` 1600×900, `positionStations` fishbone-down) + geometria portów
  `frontend/src/ui/sld/v2/geometry/` (testy substrate = oracle determinizmu).
- **Oracles recovery:** `frontend/src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.recovery.test.ts`
  (E01/E02/E03/E07/E08/E11/§16 — NIE mogą zzielenieć fałszywie po zmianie rozstawu;
  E02 czyta oś magistrali z `station.y - STATION_RUN_TRUNK_OFFSET_Y`, więc zmiana
  PIONOWYCH ofsetów wymaga aktualizacji obu stron uczciwie).
- **Fixtura referencyjna:** `frontend/src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json`
  (52 stacje; GPZ ref: `gpz/1021aa18ea28ab398f1166359a58215a/substation`).

## 3. Harness renderujący + sonda kolizji (przepis odtwarzalny)

Katalog tymczasowy `frontend/__render/` (NIE commitować; usuń po sesji).

`__render/index.html`:
```html
<!doctype html><html><head><meta charset="utf-8"/><title>SLD</title>
<style>html,body{margin:0;padding:0;background:#0b0f14;}#root{display:block;}</style>
</head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>
```

`__render/main.tsx` (renderuje realny SldCanvasV2 z fixtury + kanoniczny GPZ jak
w produkcji — `buildCanonicalGpzProps`):
```tsx
import { createRoot } from 'react-dom/client';
import { SldCanvasV2 } from '../src/ui/sld/v2/canvas/SldCanvasV2';
import { buildSldDataFromSnapshot } from '../src/ui/sld/v2/canvas/enmToSldAdapter';
import { buildCanonicalGpzProps } from '../src/ui/sld/v2/canvas/enmToCanonicalGpzAdapter';
import type { GpzCanonicalRendererProps } from '../src/ui/sld/v2/renderer/GpzCanonicalRenderer';
import fixture from '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json';
const enm = (fixture as { enm: unknown }).enm as never;
const sld = buildSldDataFromSnapshot(enm, null);
const canonicalGpzs: GpzCanonicalRendererProps[] = [];
for (const g of sld.gpzs) { try { canonicalGpzs.push(buildCanonicalGpzProps(enm, g.id, { x: g.x, y: g.y }, null as never)); } catch { /* not gpz */ } }
const p = new URLSearchParams(location.search);
const W = Number(p.get('w') ?? 1600), H = Number(p.get('h') ?? 1000);
const lodParam = p.get('lod');
const rootEl = document.getElementById('root')!;
rootEl.style.width = `${W}px`; rootEl.style.height = `${H}px`;
createRoot(rootEl).render(
  <SldCanvasV2 width={W} height={H} gpzs={sld.gpzs} canonicalGpzs={canonicalGpzs}
    sections={sld.sections} cableRuns={sld.cableRuns} stations={sld.stations}
    branchPoints={sld.branchPoints} ders={sld.ders}
    lodOverride={lodParam !== null ? (Number(lodParam) as never) : undefined} />,
);
setTimeout(() => { (window as unknown as { __sldReady?: boolean }).__sldReady = true; }, 700);
```

Start: `cd mv-design-pro/frontend && npx vite --port 5200 --host 127.0.0.1`
(czekaj na "Local:"; po edycji źródeł RESTARTUJ vite z `--force` — HMR bywa zawodny).

Chromium: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, args `['--no-sandbox']`.

**Skala 1:1:** viewport = w=h kanwy ≥ szerokość świata (~2400×1500 dla substratu),
`deviceScaleFactor: 1`, `?lod=2`. Wtedy auto-fit ≈ 1.0 i fonty mają prawdziwy rozmiar.

`__render/probe-overlaps.mjs` — SONDA KOLIZJI (oracle, nie ocena na oko):
```js
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 2400, height: 1500 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:5200/__render/index.html?w=2400&h=1500&lod=2', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__sldReady === true, { timeout: 20000 }).catch(()=>{});
await page.waitForTimeout(700);
const report = await page.evaluate(() => {
  const texts = [...document.querySelectorAll('svg text')]
    .filter(t => (t.textContent ?? '').trim().length > 1)
    .map(t => ({ text: (t.textContent ?? '').slice(0, 36), testid: t.getAttribute('data-testid') ?? t.getAttribute('class') ?? '', r: t.getBoundingClientRect() }))
    .filter(e => e.r.width > 0 && e.r.height > 0);
  const overlaps = [];
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i].r, b = texts[j].r;
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 2 && oy > 2) overlaps.push({ a: texts[i].text, b: texts[j].text, ox: Math.round(ox), oy: Math.round(oy), ta: texts[i].testid, tb: texts[j].testid });
  }
  return { textCount: texts.length, overlapCount: overlaps.length, worst: overlaps.sort((x,y)=>y.ox*y.oy-x.ox*x.oy).slice(0, 25) };
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
```
**Definition of Done kroków layoutowych: `overlapCount === 0`** przy lod=2 w skali 1:1
(dopuszczalny wyjątek: pary tego samego elementu logicznego, np. tekst+jego halo —
jeśli występują, odfiltruj po testid i UZASADNIJ w raporcie).

Zrzut do oceny okiem: `page.screenshot({ clip: {...} })` na regionie magistrali
(pas y toru ±200px) i regionie stacji.

## 4. Inwentarz defektów (render-proven, 2026-07, lod2 @ 1:1)

D1. **Pasmo magistrali zatłoczone**: etykiety odcinków („YAKXS 3×120/16 · 90 m",
    „Linia napowietrzna Al 120 mm² · 80 m") układają się w 3-4 wiersze NAD torem,
    nachodząc na WE/WY/ODG, chipy DER (PV/B 500 kW) i na siebie. Przyczyna:
    `declutterSegmentLabels` działa PER RUN (bez wiedzy o innych ciągach i o
    etykietach stacji), lane'y ±20px za ciasne przy `STATION_PITCH` zbliżonym do
    szerokości etykiety (~158px przy len=22 → len*7.2).
D2. **Nazwa stacji / kVA nachodzi na sąsiednią kolumnę**: „Stacja T1"/„630 kVA"
    (StationOnRunRenderer) koliduje z WY/WE sąsiedniej kolumny bays. Etykiety stacji
    NIE uczestniczą w żadnym declutterze.
D3. **„OVERHEAD Al" w chipie typu**: `Kabel SN · OVERHEAD Al` — token OVERHEAD to
    surowy enum w UI (guard E08 łapie tylko sklejkę „Kabel…OVERHEAD" w labelach
    ciągów, nie w badge'ach typu). Poprawna etykieta: „Linia nap. SN · Al" /
    „napowietrzna". Sprawdź `segmentTypeBadgeText` + `inferCableVariant`
    (insulation 'OVERHEAD' → po polsku).
D4. (obserwacja) 2-3 etykiety długości mogą lądować na samej linii toru — dopuszczalne
    w CAD tylko, gdy tekst ma halo i NIE przecina symboli aparatów.

## 5. Kroki (każdy: cel → zmiana → dowód → commit)

### K1. Sonda + baseline (bez zmian kodu)
- Odtwórz harness (§3), uruchom `probe-overlaps.mjs`, zapisz JSON baseline
  (liczba kolizji + top 25) do raportu w opisie commita następnego kroku.
- DoD: baseline znany, top-kolizje sklasyfikowane per D1/D2/D3.

### K2. D3 — polskie etykiety wariantu (małe, izolowane)
- `segmentTypeBadgeText`/ścieżka badge w `CableRunRenderer.tsx`: 'OVERHEAD' →
  „napowietrzna" (lub pomiń insulation dla linii napowietrznej — informacja jest już
  w „Linia nap. SN"); test jednostkowy na mapowanie; guard E08 rozszerz o badge'e
  (asercja: żaden tekst UI nie zawiera surowego „OVERHEAD").
- DoD: test + render (chip czytelny, po polsku), bramki §1.6, commit.

### K3. D1 — declutter GLOBALNY pasma magistrali
- Problem: declutter per-run. Rozwiązanie preferowane (mniejsze ryzyko niż zmiana
  rozstawów świata): jeden przebieg declutteru NAD wszystkimi etykietami odcinków
  ciągu magistralowego + keep-clear boxy: (a) osi toru ±8px, (b) kolumn bays stacji
  (już są zbierane), (c) chipów DER. Lane'y w pionie ODDZIELNIE nad i pod torem,
  z leader-line gdy etykieta odsunięta > 24px (styl CAD).
- Alternatywa jeśli za ciasno fizycznie: zwiększ `STATION_PITCH` (adapter) o ~30-40%
  — to zmiana geometrii świata: dozwolona, deterministyczna; zaktualizuj uczciwie
  substrate testy i re-render. NIE zmieniaj `STATION_RUN_TRUNK_OFFSET_Y` bez
  aktualizacji oracle E02.
- DoD: `overlapCount` w paśmie magistrali = 0 (sonda), render 1:1 czytelny, wszystkie
  oracles recovery zielone BEZ rozluźnień, bramki §1.6, commit.

### K4. D2 — etykiety stacji w declutterze
- Wystaw bbox etykiet stacji (nazwa, kod, kVA) jako uczestników/keep-clear w
  declutterze ciągów LUB przenieś nazwę+kVA do sloty pod stacją z gwarantowanym
  odstępem (kolumna tekstu pod szyną nN, wyrównana do osi stacji), jak w ETAP.
- DoD: zero kolizji tekst-stacja↔tekst-kabel i stacja↔stacja (sonda), render, bramki, commit.

### K5. Weryfikacja końcowa jakości CAD/SCADA (kryteria odbioru)
Render 1:1 lod2 + sonda; WSZYSTKIE poniższe muszą być widoczne i bezkolizyjne:
- [ ] typ/przekrój/długość każdego odcinka SN (np. „YAKXS 3×120/16 · 90 m")
- [ ] rozróżnienie kabel vs linia napowietrzna (styl linii + polska etykieta)
- [ ] WE/WY/ODG przy każdej stacji; punkty NO oznaczone
- [ ] TR: moc kVA + grupa (Dyn11); szyna nN + odpływy nN
- [ ] DER: rodzaj (PV/BESS/FW) + moc, po stronie SN/nN zgodnie z ENM
- [ ] napięcia (15 kV / 110 kV) przy szynach
- [ ] GPZ kanoniczny: system→szyna WN→pole WN→TR→pole TR→sekcja SN→pola liniowe
- [ ] `overlapCount === 0` (sonda §3)
- [ ] determinizm: dwa kolejne rendery → identyczne PNG (porównaj hash pliku)
Zaktualizuj `SLD_RECOVERY_ACCEPTANCE_2026-07.md` §28 → PROVEN z dowodami; usuń
`__render/`; commit + push.

### K6 (opcjonalnie, po K5). Pozostałe P1
- §22 canonical-only: usuń fallback `GpzRenderer` w SldCanvasV2 po dodaniu inwariantu
  „canonical props zawsze dostępne dla station_type=gpz" + jawnej ścieżki błędu
  (badge „brak danych GPZ" zamiast cichego placeholdera). Testy integracyjne mix →
  aktualizacja.
- DER: jawny marker PCC; disambiguacja nazw pól; „RMU·P/RMU·O" → pełne polskie opisy.

## 6. PROMPT KONTYNUACJI (wklej świeżemu agentowi w tym repo)

```
Pracujesz w /home/user/MV-Design-PRO na branchu claude/sld-schema-cad-scada-rqvz73
(git checkout, NIE twórz nowego brancha). Wykonaj plan
mv-design-pro/docs/execplans/SLD_CAD_SCADA_QUALITY_PLAN.md od pierwszego
nieukończonego kroku (sprawdź git log — kroki są commitowane pojedynczo z
prefiksami K1..K6 lub opisem z §5).

Zasady BEZWZGLĘDNE: §1 planu (PNG to dowód — render 1:1 + sonda kolizji z §3 przed
uznaniem kroku; nie fałszuj zieleni; determinizm; warstwy; chirurgicznie; bramki
przed pushem; commit ze stopką z §1.7). Harness renderujący odtwórz z §3 (katalog
frontend/__render/, vite :5200, chromium /opt/pw-browsers/chromium-1194/...).
Po każdym kroku: commit + push + krótki raport (co zmienione, dowód: liczby z
sondy przed/po, ścieżki PNG). Jeśli krok okaże się większy niż opisano lub
sprzeczny z oracle'ami — STOP, spisz znalezisko w raporcie zamiast hackować.
Nie pytaj o pozwolenie na kroki z planu; pytaj tylko przy realnej zmianie zakresu.
```

---
*Living document — wykonawca aktualizuje statusy kroków (DONE + commit hash) po każdym pushu.*
