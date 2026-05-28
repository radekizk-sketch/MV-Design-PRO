Przeczytałem cztery z sześciu plików (testy nie są kluczowe dla werdyktu — można im uwierzyć po fakcie). Oto bezlitosny review.

---

## 1) Największe błędy w obecnym kodzie

### A. Symbol TR w `StationInternalView.tsx` — geometrycznie OK, wizualnie odłączony

- `TRANSFORMER_SYMBOL_RADIUS = 18`, `TRANSFORMER_SYMBOL_CENTER_GAP = 14` → odległość środków = 14, średnica = 36, overlap = **22 px**. Okręgi *matematycznie* się przecinają. Atrybut `data-transformer-circles-intersect="true"` jest prawdziwy.
- **ALE** wizualnie wygląda źle, bo overlap 22 px przy r=18 daje grubą soczewkę „blob". IEC kanon to overlap ≈ r (~18 px przy r=18) — czyli `gap` powinien wynosić **~r, nie r·0.78**. Należy zwiększyć `TRANSFORMER_SYMBOL_CENTER_GAP` z 14 → **18** (overlap = 18 px, klasyczny lemniskat IEC 60617-6).
- **Brak linii zasilającej z szyny SN do górnego terminala TR.** Busbar SN: `y=150`. Górny stub TR symbolu (w układzie wewnętrznym `translate(x, 375)`): od `y=-48` do `y=-25`, czyli absolutnie 327 → 350. **Pomiędzy y=150 a y=327 NIE MA żadnego przewodu.** Transformator wisi w powietrzu — to jest najbardziej rażący defekt wizualny. (`station.internal.transformer.to.nn` istnieje, `station.internal.busbar.to.transformer` brak.)
- Linia do nN startuje przy `y1={TRANSFORMER_Y + 28}` = `y=403`. Bottom-terminal-stub symbolu kończy się na `y=423`. Linia łączeniowa wchodzi w obrys symbolu od dołu. Powinno być `y1 = TRANSFORMER_Y + 48` (= absolutny koniec dolnego stuba).

### B. Multi-transformer routing

```ts
const tX = transformerBay >= 0
  ? transformerX + (transformers.length > 1 ? (i - 0.5) * 60 : 0)
  : ...
```
- Dla 2 trafo offsety = `-30, +30` → trafa rozsunięte poziomo, **ale linia łącząca z polem TR i nN jest tylko JEDNA** pionowa, `x = transformerX`. Trafo o ofsecie ±30 wiszą bez przewodu do busbar SN i do nN.
- Brak `transformerBay >= 0` (gdy nie znaleziono TR): używa fallback X `BAY_START_X + 280`, podczas gdy `FallbackTransformer` rysuje się przy `transformerX` (też +280). Tu akurat zgadza się, ale logika jest niejasna.

### C. Mini TR w `GpzApparatusSymbols.ApparatusTransformerSymbol` — zbyt ciasny

- `r = 5`, `gap = 4` → distance = 4, overlap = **6 px na średnicy 10** = 60% pokrycia. Przy zoom-out wygląda jak jedna kropka. Powinno być `gap = r = 5` (overlap = 5, lemniskat).

### D. `DeviceRenderer.TRANSFORMER_DEVICE` — overlap 19 px przy r=15

- Centers `±5.5`, distance = 11, overlap = `30 - 11 = 19 px`. Ratio 19/15 = 1.27 — okręgi prawie złączone. Powinno być distance ≈ r = 15, czyli `cy = ±7.5`.

### E. Mertwy kod w `DeviceRenderer.renderDeviceShape`

```ts
switch (kind as DeviceKindV2) {
  case 'CB': case 'DS_BUS': case 'DS_LINE': case 'FUSE': { … }
```
- To są te same `kind`-y co w `if`-ach powyżej (linie 103–170), które już `return`-ują. **Cały blok jest unreachable** — ESLint `no-fallthrough` go nie złapie, bo wcześniejsze `if`-y robią `return`. Wprowadza w błąd przy code review i `vulture_guard`. Usunąć.

### F. Klikalność per element jest niespójna

- W `StationInternalView` `defaultDevicesForBay` przekazuje `onClick: onSelectBay` do `DeviceRenderer`. `DeviceRenderer` wywołuje `onClick(id)` z `id = "${bay.bayId}/switch-disconnector"`.
- Problem: prop nazywa się **`onSelectBay`** i kontekstowo w `StationInternalView` jest też wywoływany z czystym `b.bayId` (linia 236) lub z `breakerId` przy nN. **Sygnatura wycieka** — handler dostaje raz `bayId`, raz „elementId". Konsument nie wie czego się spodziewać. Naprawić: zmienić nazwę na `onSelectElement: (elementId: string) => void` i jednolicie propagować pełne id elementu.
- Aparaty CT, VT, ES, CABLE_HEAD, SURGE_ARRESTER w `DeviceRenderer` mają wspólne `<g onClick>` na wierzchu — ale **hit-area rect 58×36** (linia 71–80) jest tylko gdy `onClick` istnieje, i pokrywa tylko CB-sized obszar. ES rysowany jest od x=20 do y=length+8 (poza hit-area). Klik w ikonę ziemi nie trafia. Hit-area musi obejmować pełen bounding-box symbolu.

### G. Akcesibility/keyboard

- `StationTransformerSymbol`: `role=button`, `tabIndex=0`, `onKeyDown` — OK.
- `DeviceRenderer`: **brak** `role`, `tabIndex`, `aria-label`, `onKeyDown`. Każdy aparat ma być klikalny i konfigurowalny → ma być fokusowalny z klawiatury.
- Pola nN breaker (`<g onClick>` w pętli `feedersCount`): brak `role`, `tabIndex`, `aria-label`, `title`, `onKeyDown`.
- PV nN breaker / protection / inverter: też brak ARIA + keyboard.

---

## 2) Patch / rekomendacje

### `StationInternalView.tsx`

```ts
// 1. Naprawić geometrię TR
const TRANSFORMER_SYMBOL_RADIUS = 18;
const TRANSFORMER_SYMBOL_CENTER_GAP = 18; // było 14 → IEC lemniskat (overlap == r)

// 2. Dorysować przewód busbar SN → górny terminal TR (PER transformator)
// W bloku `transformers.map(...)` PRZED <StationTransformerSymbol> dodać:
<line
  x1={tX} y1={SN_BUSBAR_Y}
  x2={tX} y2={TRANSFORMER_Y - 48}
  stroke={COLOR_LINE_PRIMARY} strokeWidth={1.8}
  data-parity-key="station.internal.busbar.sn.to.transformer"
/>

// 3. Per-transformator przewód do nN (zamiast jednej globalnej linii)
<line
  x1={tX} y1={TRANSFORMER_Y + 48}        // koniec dolnego stuba, nie +28
  x2={tX} y2={NN_BUSBAR_Y}
  stroke={COLOR_LINE_PRIMARY} strokeWidth={1.8}
  data-parity-key="station.internal.transformer.to.nn"
/>

// 4. USUNĄĆ globalną linię `station.internal.transformer.to.nn` z lini 330-338
```

### `GpzApparatusSymbols.tsx::ApparatusTransformerSymbol`

```ts
const r = 5;
const gap = r; // było 4 → 5: distance==r, overlap==r (kanon IEC)
```

### `DeviceRenderer.tsx::TRANSFORMER_DEVICE`

```ts
// było cy=±5.5 → distance=11, overlap=19 (zbyt ciasno)
<circle cx={0} cy={-7.5} r={15} ... />
<circle cx={0} cy={ 7.5} r={15} ... />
// data-transformer-circle-overlap-px={15}
```

### `DeviceRenderer.tsx` — usunąć martwy switch / dodać a11y + hit-area

```ts
// Usunąć cały `switch (kind as DeviceKindV2) { case 'CB': ... case 'FUSE': ... }`
// — te kindy zwracają już wcześniej.

// Rozszerzyć hit-area do bounding-box per kind (ES, VT, CABLE_HEAD wykraczają poza 58×36).
// Dodać:
role={onClick ? 'button' : undefined}
tabIndex={onClick ? 0 : undefined}
aria-label={`${kind} ${designationQ}`}
onKeyDown={onClick ? (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(id); }
} : undefined}
```

### Ujednolicić handler `onSelectBay` → `onSelectElement`

`StationInternalView.tsx` — prop `onSelectBay` zmienić na `onSelectElement: (elementId: string) => void`. Handler dostaje pełen ID elementu (bayId, breakerId, deviceId, transformerId, pccId). Konsument robi routing do właściwej karty konfiguracji per `data-element-kind` na ścieżce id.

### nN breaker + PV nN — dodać a11y

Każdy `<g onClick>` w pętli `feedersCount` i w `PvAfterNnInternalView` musi mieć: `role="button"`, `tabIndex={0}`, `aria-label`, `<title>`, `onKeyDown` z Enter/Space.

---

## 3) Testy, które muszą przejść

W `__tests__/StationInternalView.test.tsx`:

1. **TR-circles-intersect (matematycznie):**
   ```ts
   const r = 18, gap = 18;
   expect(2 * r).toBeGreaterThan(gap);                // przecinają się
   expect(Math.abs(2 * r - gap)).toBeGreaterThan(10); // overlap > 10 px
   expect(Math.abs(2 * r - gap)).toBeLessThan(2 * r); // nie pokrywają
   ```
2. **TR-circles-intersect (DOM):** dwa `<circle data-transformer-winding>` o `r=18`, `cy` różniących się o 18, `data-transformer-circle-overlap-px="18"`.
3. **Busbar→TR-wire exists:** `[data-parity-key="station.internal.busbar.sn.to.transformer"]` jest renderowany, `x1==x2==tX`, `y1==SN_BUSBAR_Y`, `y2==TRANSFORMER_Y-48`.
4. **TR→nN-wire alignment:** `x1==x2==tX`, `y1==TRANSFORMER_Y+48`, `y2==NN_BUSBAR_Y`.
5. **Multi-TR routing:** dla 2 trafo każdy ma własną linię busbar→TR i TR→nN (2× `busbar.sn.to.transformer`, 2× `transformer.to.nn`).
6. **Klikalność per element:** click na `[data-element-kind="device"][data-element-id$="/switch-disconnector"]` → handler dostaje pełen elementId, nie bayId; click na CB nN → breaker id; click na port WE → port id.
7. **Keyboard nav:** każdy klikalny element ma `tabIndex=0`, Enter/Space wywołuje handler.

W `__tests__/renderers.test.tsx`:

8. `TRANSFORMER_DEVICE`: `cy1=-7.5`, `cy2=7.5`, `r=15`, `data-transformer-circle-overlap-px=15`.
9. `ApparatusTransformerSymbol`: `gap == r`.
10. Dead-code guard: `DeviceRenderer.renderDeviceShape` nie zawiera unreachable `switch` po `if` zwracających dla `CB|DS_BUS|DS_LINE|FUSE`.

---

## 4) Acceptance criteria

| # | Kryterium | Weryfikacja |
|---|-----------|-------------|
| AC-1 | Symbol TR w widoku stacji ma wyraźną soczewkę przecięcia — overlap ≈ r (18 px), nie blob | snapshot SVG + test geometryczny |
| AC-2 | Każdy transformator jest spięty z szyną SN (góra) i szyną nN (dół) widoczną pionową linią — bez wiszących trafo | DOM query `data-parity-key="…busbar.sn.to.transformer"` i `…transformer.to.nn` |
| AC-3 | Każde pole, port WE/WY, każdy aparat w polu, każdy TR, każdy CB nN, każdy element PV nN jest klikalny i wywołuje `onSelectElement(elementId)` z **unikalnym** id elementu | e2e Playwright: klik → bus do storeu z prawidłowym id |
| AC-4 | Każdy klikalny element posiada `role="button"`, `tabIndex=0`, `aria-label`, działa Enter i Space | RTL: `getByRole('button', { name: … })` + `fireEvent.keyDown(…, { key: 'Enter' })` |
| AC-5 | `DeviceRenderer` nie zawiera martwego kodu (unreachable switch) | ESLint `no-unreachable` / `vulture_guard.py` (Python guard nie sprawdza TS, ale code review CI) |
| AC-6 | Mini TR (`ApparatusTransformerSymbol`) i `TRANSFORMER_DEVICE` mają overlap ≈ r | testy 8–9 |
| AC-7 | Hit-area aparatu obejmuje cały bounding box symbolu (ES nie ma „dead clicku" przy ikonie ziemi) | RTL: klik w `(x=20, y=length+8)` na ES wywołuje handler |
| AC-8 | Determinizm SLD: snapshot SVG niezmieniony między uruchomieniami (sld-determinism CI) | `sld_determinism_guards.py` zielony |

Czy chcesz, żebym wdrożył ten patch w plikach (z testami), czy zostawiam jako spec do akceptu?
