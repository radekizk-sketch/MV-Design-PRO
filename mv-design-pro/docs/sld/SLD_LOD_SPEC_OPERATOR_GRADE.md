# SLD LOD Spec — Operator-Grade (Phase 0A)

**Status:** BINDING (Phase 0A)
**Wersja:** 1.0
**Powiązane:** `SLD_LOD_AND_LAYERS.md` (legacy reference), `SLD_SYMBOLS_CANONICAL_OPERATOR_GRADE.md`. Dawne specyfikacje mini-bloku stacji i rozdzielni GPZ opisywały skasowane renderery v2 (karta GPZ-PARYTET cz. 2, 2026-10-21); kompozycję stacji i GPZ realizuje jedyny renderer `SldCanvasV3` przez `frontend/src/ui/sld/v3/compose/station.ts` i `frontend/src/ui/sld/v3/compose/gpz.ts`.

---

## 1. Cel

Operator-grade LOD ma być stabilny w pracy zoom (brak migotania), zachowywać Acceptance Invariant nr 6 (LOD zmienia szczegół wizualny, nie elektryczne znaczenie) i nadawać każdemu typowi obiektu dokładnie zdefiniowany próg widoczności.

## 2. Poziomy LOD

| LOD | Zakres scale | Zastosowanie | Główne kindy widoczne |
|---|---|---|---|
| 0 | < 0.30 | Mapa sieci (overview) | `gpz_block` (kompakt), `mini_block_compact`, `cable_run`, `der_marker`, `alarm_marker` |
| 1 | 0.30 – 0.70 | Sieć terenowa | + `gpz_switchgear`, `section`, `bay_head`, `nop_marker`, `missing_data_marker` |
| 2 | 0.70 – 1.50 | Obiekty + bays | + `mini_block_detail`, `device`, `der_full` |
| 3 | 1.50 – 3.00 | Szczegół techniczny | + `station_internal`, `device_label`, `q_label`, `measurement`, `der_sub_tree` |
| 4 | ≥ 3.00 | CAD / edycja precyzyjna | porty, kotwice, uchwyty tras, siatka, prowadnice |
| 5 | na żądanie | Diagnostyka / wyniki / uzasadnienie | węzły obliczeniowe, ścieżki zasilania, wyniki, gotowość, raport |

Progi: stałe `LOD_ZOOM_THRESHOLDS` w `frontend/src/ui/sld/v2/lod/LodPolicy.ts`.

## 3. Histereza i debounce

Aby zapobiec migotaniu na granicy progów (np. 0.68 ↔ 0.72 dla LOD 1↔2), kontroler LOD stosuje:

- **Margines histerezy 15%**: aby przejść z LOD N do N+1, scale musi przekroczyć próg(N) × 1.15. Aby spaść z LOD N do N-1, scale musi spaść poniżej próg(N) × 0.85.
- **Debounce 250 ms**: zmiana LOD wymaga utrzymania nowego progu przez 250 ms. Wcześniejszy powrót anuluje przejście.

API: `createLodController({ initialScale, hysteresisMargin?, debounceMs?, nowProvider? })` zwraca `{ update, getLod, getScale, reset }`. Nie używa real timerów — wywołujący przekazuje `now`.

Test inwariantu: `lod/__tests__/lodHysteresis.test.ts` — 15 cases, w tym bouncing zoom 10×.

## 4. Override dla zaznaczenia

Element zaznaczony "wybija" się na minimum LOD 3 bez zmiany globalnego LOD. API: `effectiveLodForElement(globalLod, isSelected)`.

## 5. Reguła nadrzędna (Acceptance Invariant nr 6)

LOD MUSI uprościć szczegół wizualny. NIE wolno mu zmienić:
- topologii (porty, endpointy, stany aparatów),
- znaczenia elektrycznego (kolor toru wynika z `energization_state`/`switching_state`),
- liczby pól w stacji (pusta tablica `bays[]` → blocker badge, nie domyślny szablon).

### 5.1. Jedna kompozycja na każdym LOD (karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA, BINDING)

Kanwa `SldCanvasV3` rysuje na L0, L1 i L2 **tę samą kompozycję**: te same symbole w tych samych
miejscach, te same odcinki toru, te same obrysy stacji i rama strefy GPZ. Oddalenie upraszcza
szczegół, nie kształt. Poziom zdejmuje wyłącznie:

- podpisy aparatów i ról pól (od L1),
- kody funkcji zabezpieczeń, tabliczki przekładników i blok zabezpieczeń pola (szczegół adnotacji
  `protectionAnnotationDetailForLod`),
- etykiety, których przy danej skali nie da się narysować czytelnie: tożsamość ponad sufitem
  proporcji klasy albo pełna nazwa stacji/GPZ szersza od rezerwacji w piśmie podłogi czytelności.
  Takie etykiety znikają jawnie (wskaźnik „Ukryto N opisów"). Etykieta obecna na L0 jest tą samą
  etykietą co na L1 (właściciel, treść, kotwica). Nie zmienia tożsamości i nie przeskakuje na inny
  obiekt.

Zakazane są: zwinięty blok stacji (dawny `stationCollapsed`, „mini-RMU 48 px"), zwinięty blok
GPZ (dawny `gpzCollapsed`), skracanie nazwy wielokropkiem i wybór poziomu progiem zoomu
niezależnym od rozmiaru aparatu. Progi poziomu liczy `canvas/camera.ts`
`lodThresholdsForMinApparatus` z gabarytu najmniejszego aparatu ciągłości sceny. Uchwytem stacji
jest obrys jej strefy, klikalny na każdym LOD (`canvas/hitAreas.ts` `stacjeSceny`). Dla GPZ to rama
strefy, dla stacji SN obwiednia jej rysunku (`meta.stationOutlines`) z obrysem po najechaniu.

Dowody:

- `scene/__tests__/przegladKompozycja.test.ts`: wyrocznie (a)–(e) i (g) × fikstura × LOD, z iniekcjami.
- `canvas/__tests__/tozsamoscEtykiet.contract.test.ts`: L0 ⊂ L1 oraz zniknięcie tożsamości
  wyłącznie z przyczyn czytelności.
- `canvas/__tests__/trafienieKanwy.contract.test.tsx`: obrys stacji jako uchwyt, kanwa
  800×600 × LOD.
- `sheet/__tests__/legendaStanow.contract.test.tsx`: legenda stanów zgodna z UX-04 na każdym LOD.
- e2e `przeglad-sieci-zrzuty-screenshot`: wyrocznia (h), czyli obrys treści po „Dopasuj widok"
  rozłączny z chromem kanwy dla 1280×800 i 1920×1080.

## 6. Hierarchia etykiet (per LOD)

| LOD | Etykiety widoczne |
|---|---|
| 0 | nazwy GPZ, krótkie kody RMU (`RMU·P`/`RMU·O`/...), badge DER, badge missing-data |
| 1 | + nazwy stacji, nazwy sekcji GPZ, oznaczenia odpływów liczbowo |
| 2 | + nazwy pól (`Q1`, `T1`), liczba odpływów nN |
| 3 | + Q-numery aparatów, ratingi katalogowe, pomiary (jeśli warstwa Pomiary aktywna) |
| 4 | + wszystkie warstwy diagnostyczne |

Decyzja właściciela 2026-11-04 (odbiór B-02 pola liniowego, pkt 6) — wyjątek od tabeli dla
przekładników w polach GPZ: oznaczenia przekładników prądowych, napięciowych i Ferrantiego
(`T1`, `T2`, `T3`) są widoczne od LOD1 (filtr `odLod: 1` etykiet aparatów,
`compose/gpz.ts::RODZAJE_PRZEKLADNIKOW_OD_LOD1`); przekładnia skrócona (`200–400/5`,
`15/√3 / 0,1/√3 kV`) — od LOD2; LOD0 — same symbole. Pełne dane tabliczki — wyłącznie inspektor
pola. Pin: `v3/scene/__tests__/tabliczkiPrzekladnikow.test.ts` („opis przekładnika wg LOD”).

Locked labels (CAD lock, Phase 2) NIE są ukrywane przez declutter.

## 7. Element kinds (kanon)

```ts
type LodElementKind =
  | 'gpz_block' | 'gpz_switchgear'
  | 'section' | 'bay_head' | 'device' | 'device_label'
  | 'cable_run'
  | 'station_block' | 'station_internal'
  | 'mini_block_compact' | 'mini_block_detail'
  | 'der_marker' | 'der_full' | 'der_sub_tree'
  | 'measurement' | 'q_label'
  | 'missing_data_marker' | 'alarm_marker' | 'nop_marker';
```

Phase 0A dodaje 4 nowe kindy: `mini_block_compact`, `mini_block_detail`, `gpz_switchgear`, `der_sub_tree`.

Aktywny `SldCanvasV2` przekazuje aktualny LOD do renderera stacji, aby stacja mogła przełączyć się między mini-blokiem RMU i pełniejszym widokiem bez utraty portów ani wyboru.

## 8. Hash invariants

Zmiana LOD MUSI:
- pozostawić `topology_hash` niezmieniony,
- pozostawić `layout_hash` niezmieniony,
- zmienić `view_hash`.

Egzekwowane przez `core/__tests__/hashes.test.ts` (3 cases pod tytułem "LOD switch zmienia tylko view_hash").

## 9. Pre-flight Phase 0A → kolejne fazy

- Histereza 15% + debounce 250 ms domyślnie aktywna.
- Histereza testowana 10× bouncing zoom — brak migotania.
- 4 nowe element kindy podłączone do `isVisibleAtLod`.
- Hash triad rozdzielony, invariant testowany.
