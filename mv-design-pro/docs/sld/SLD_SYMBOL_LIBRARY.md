# Biblioteka symboli SLD — kontrakt kanoniczny

**Status:** kanon BINDING
**Wersja:** v1.0
**Powiązane:** [`SLD_CAD_SCADA_REBUILD.md`](SLD_CAD_SCADA_REBUILD.md), [`SLD_LAYOUT_ENGINE.md`](SLD_LAYOUT_ENGINE.md)

---

## 1. Lokalizacja w repo

- Pliki SVG: `mv-design-pro/frontend/src/ui/sld/canonical_symbols/*.svg`
- Definicje portów: `mv-design-pro/frontend/src/ui/sld/canonical_symbols/ports.json`
- Renderer: `mv-design-pro/frontend/src/ui/sld/CanonicalSymbolRenderer.tsx`
- Resolver: `mv-design-pro/frontend/src/ui/sld/SymbolResolver.ts`
- Stałe geometryczne: `mv-design-pro/frontend/src/ui/sld/IndustrialAesthetics.ts`

---

## 2. Lista symboli (binding)

| ID | Plik / źródło | Rola | Status PR-0 |
|---|---|---|---|
| `busbar` | `busbar.svg` | szyna SN/nN — pozioma linia z grubością `BUSBAR_STROKE_WIDTH=3` | OK |
| `node` | wbudowane | węzeł połączeniowy (kropka) | OK |
| `circuit_breaker` | `circuit_breaker.svg` | wyłącznik (CB) | OK |
| `disconnector` | `disconnector.svg` | odłącznik (DS) | OK |
| `load_switch` | brak — TODO | rozłącznik | doprojektować w PR-13 |
| `earthing_switch` | `earthing_switch.svg` | uziemnik (ES, boczny tor, zakończony symbolem ziemi) | OK |
| `fuse` | `fuse.svg` | bezpiecznik | OK |
| `current_transformer` | `ct.svg` | przekładnik prądowy (w osi toru) | OK |
| `voltage_transformer` | `vt.svg` | przekładnik napięciowy (boczny tor pomiarowy) | OK |
| `cable_head` | wbudowane (trójkąt 18-22 px) — TODO jawny SVG | głowica kablowa (NIE kropka) | doprojektować w PR-13 |
| `transformer_2w` | `transformer_2w.svg` | transformator 2-uzwojeniowy (dwa okręgi) | OK |
| `transformer_3w` | `transformer_3w.svg` | transformator 3-uzwojeniowy | OK |
| `coupler` | wbudowane | sprzęgło sekcyjne (struktura dwustronna) | OK |
| `protection_unit` | wbudowane | zabezpieczenie (logiczne, przy polu) | OK |
| `surge_arrester` | `surge_arrester.svg` | ogranicznik przepięć | OK |
| `source` (utility feeder) | `utility_feeder.svg` | źródło zasilania zewnętrzne | OK |
| `load` | `load.svg` | obciążenie | OK |
| `mv_station` | wbudowane (block) | stacja SN/nN — blok zewnętrzny | OK |
| `metering_cubicle` | `metering_cubicle.svg` | pole pomiarowe | OK |
| `pole` | wbudowane (linia + kropka) — TODO jawny SVG | słup linii napowietrznej | doprojektować w PR-13 |
| `branch_point` | wbudowane | punkt rozgałęźny | OK |
| `pv_source` | `pv.svg` | źródło fotowoltaiczne | OK |
| `bess` | `bess.svg` | magazyn energii | OK |
| `fw` | `fw.svg` | farma wiatrowa / turbina | OK |
| `cable_section` | `line_cable.svg` | kabel SN — styl odróżnialny od linii napowietrznej | OK |
| `overhead_line_section` | `line_overhead.svg` | linia napowietrzna SN | OK |
| `ground` | `ground.svg` | symbol ziemi (zakończenie uziemnika) | OK |
| `nop` | brak — TODO | punkt normalnie otwarty (logiczny stan) | doprojektować w PR-13 |
| `alarm_marker` | brak — TODO | znacznik alarmu (czerwona obwódka + ikon) | doprojektować w PR-13 |
| `missing_data_marker` | brak — TODO | znacznik braku danych (żółta obwódka + `—`) | doprojektować w PR-13 |
| `zksn` | brak — TODO | złącze kablowe SN | doprojektować w PR-13 |
| `capacitor` | `capacitor.svg` | bateria kondensatorów (poza scope SN, info) | OK |
| `reactor` | `reactor.svg` | dławik (poza scope SN, info) | OK |
| `motor` | `motor.svg` | silnik (poza scope SN, info) | OK |
| `generator` | `generator.svg` | generator | OK |

PR-13 doprojektuje `load_switch`, `cable_head` (jawny trójkąt), `pole`, `nop`, `alarm_marker`, `missing_data_marker`, `zksn`.

---

## 3. Kontrakt symbol → stan → styl (BINDING)

Stan aparatu wpływa wyłącznie na **styl** (`fill`, `stroke`, klasa CSS), **nigdy** na geometrię, viewBox ani anchor.

### 3.1 Stany (5 + warianty)

| Stan | Kolor wypełnienia | Kolor obwódki | Klasa CSS | Token Tailwind |
|---|---|---|---|---|
| zamknięty (closed) | `#07983A` | `#13C45A` | `state-closed` | `bg-status-ok` |
| otwarty (open) | tło panelu | `#FF333D` | `state-open` | obwódka `border-status-error` |
| nieznany (unknown) | `#3A4148` | `#6E737A` | `state-unknown` | `bg-scada-grid border-scada-muted` |
| awaria (fault) | `#FF2B2B` | `#FF333D` (pulsująca) | `state-fault` | `bg-status-error` z animacją |
| zaznaczony (selected) | wartość bazowa | `#35C7FF` (cyjanowa) | `state-selected` | `outline-canvas-selection` |

### 3.2 Inwarianty geometrii (testy chronią)

Per symbol, dla każdego z 5 stanów:
- `viewBox` jest stały;
- współrzędne `anchors` (porty SVG z `ports.json`) są stałe;
- ścieżki SVG (`<path d="...">`) elementów konstrukcyjnych są stałe;
- zmienia się wyłącznie `fill`, `stroke`, `class`.

Test: `src/ui/sld/__tests__/symbol-state-invariant.test.ts` (PR-13).

### 3.3 Inwarianty szczególne

- **Głowica kablowa (`cable_head`)** jest **trójkątem 18–22 px**, NIE kropką, NIE symbolem ziemi.
- **Uziemnik (`earthing_switch`)** jest na **bocznym torze**, ma własne oznaczenie `Q`, kończy się symbolem ziemi.
- **Przekładnik prądowy (`current_transformer`)** jest **w osi toru** prądowego.
- **Przekładnik napięciowy (`voltage_transformer`)** jest na **bocznym torze pomiarowym**.
- **Transformator (`transformer_2w`, `transformer_3w`)** ma **dwa/trzy okręgi**.
- **Sprzęgło sekcyjne (`coupler`)** **NIE jest** pojedynczym, samotnym aparatem — to struktura dwustronna między sekcjami.

---

## 4. Wymiary (px)

Z `IndustrialAesthetics.ts` + uzupełnienia briefu:

| Element | Wymiar |
|---|---|
| Siatka bazowa | `GRID_BASE = 20` |
| Y magistrali głównej | `Y_MAIN = 400` |
| Y ringa | `Y_RING = 320` |
| Y odgałęzień | `Y_BRANCH = 480` |
| Odstęp stacji centrum-centrum | `GRID_SPACING_MAIN = 280` |
| X start | `X_START = 40` |
| Pionowy odstęp pól | `OFFSET_POLE = 60` |
| Grubość szyny | `BUSBAR_STROKE_WIDTH = 3` |
| Grubość gałęzi | `BRANCH_STROKE_WIDTH = 2` |
| Blok aparatu mały | 38 × 54 |
| Blok aparatu standard | 46 × 64 |
| Odstęp aparatów w polu | 2–4 |
| Odstęp pól | 110–140 |
| Głowica kablowa (trójkąt) | 18–22 |
| Przekładnik prądowy | 28–36 |
| Przekładnik napięciowy | 32–40 |
| Transformator | 42–56 |
| Panel pomiarowy pola | 120–160 |

---

## 5. Typografia

| Zastosowanie | Czcionka | Rozmiar |
|---|---|---|
| Oznaczenia pól | Inter (sans-eng) | 16–20 |
| Oznaczenia aparatów Q | Inter | 15–18 |
| Pomiary pod polem | JetBrains Mono (mono-eng) | 15–18 |
| Parametry rozdzielni | Inter | 18–22 |
| Panele techniczne | Inter | 12–14 |
| Wartości liczbowe | JetBrains Mono | 12–16 |
| Statusy raportowe | Inter | 12 |

---

## 6. Paleta (z `tailwind.config.js`)

| Token | Hex | Rola |
|---|---|---|
| `scada-bg` | `#0B1014` | tło aplikacji |
| `scada-surface` | `#0E1620` | powierzchnia paneli |
| `scada-panel` | `#111B26` | panel kontekstu |
| `scada-border` | `#1E2D3D` | obrys paneli |
| `scada-grid` | `#152028` | siatka SLD |
| `scada-sn` | `#FFD400` | magistrala SN |
| `scada-nn` | `#3FA9F5` | magistrala nN |
| `scada-wn` | `#C084FC` | magistrala WN 110+ kV |
| `scada-energized` | `#00E5A8` | pod napięciem |
| `scada-dead` | `#5C6470` | bez napięcia |
| `scada-grounded` | `#FF8A00` | uziemione |
| `scada-alarm` | `#FF3B3B` | alarm |
| `scada-text` | `#E2EBF3` | tekst główny |
| `scada-muted` | `#7E8A99` | tekst pomocniczy |
| `canvas-selection` | `#3b82f6` | zaznaczenie |
| `status-ok` | `#059669` | zamknięty / OK |
| `status-warn` | `#d97706` | ostrzeżenie / outdated |
| `status-error` | `#dc2626` | otwarty / awaria |
| `status-fresh` | `#059669` | wynik aktualny |
| `status-outdated` | `#d97706` | wynik nieaktualny |
| `status-none` | `#6b7280` | brak wyników |

---

**Koniec dokumentu.**
