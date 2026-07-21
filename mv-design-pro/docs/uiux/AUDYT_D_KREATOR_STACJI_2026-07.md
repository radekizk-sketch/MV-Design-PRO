# AUDYT D — migracja kreatora stacji SN/nN do ui2 (InsertStationForm → KreatorStacji)

**Status:** BINDING (dyrektywa właściciela 2026-07-20 „Leć"; Audyt D z kolejki programu).
**Zakres:** `frontend/src/ui/network-build/forms/InsertStationForm.tsx` (1884 w., god-file) →
`frontend/src/ui2/kreatory/stacja/**` (nowy kreator na wzorcu `rama`).
**Reguła #5 (właściciel):** przed przebudową od zera — audyt wielosoczewkowy (ten dokument),
potem wdrożenie fazowe. Legacy działa do fazy cutover (D5) — budujemy RÓWNOLEGLE, nie łamiąc
przepływu budowy sieci (magistrala → koniec/podział → stacja).

## 1. Audyt wielosoczewkowy (rekonesans kodu)

### Powierzchnia legacy (co MUSI przetrwać migrację — opcja MAX)
- **Typ stacji:** `branch` / `inline` / `sectional` (wyklucza `gpz`). Sekcyjna → pole sprzęgła.
- **Konfiguracja nN:** `LOAD_NN` (stacja odbiorcza) / `PV_INVERTER` (PV za transformatorem).
- **Transformator:** katalog `TRAFO_SN_NN`, dobór rekomendowany po napięciu nN; dla PV dobór po
  LV falownika (bez zgadywania — blokada, gdy brak zgodnego transformatora katalogowego).
- **Rozdzielnica SN:** producent (ZPUE/Elektrometal/Siemens/ABB) → rodzina → **kompletne szablony
  pól** per rola (`LINIA_IN`/`LINIA_OUT`/`TRANSFORMATOROWE`/`SPRZEGLO`); filtr niekompletnych
  szablonów (repo_verified only); podgląd SVG pól rozdzielnicy.
- **Umiejscowienie:** `append_station_on_endpoint` (koniec odcinka, `ENDPOINT_APPEND`) vs
  `insert_station_on_segment_sn` (świadomy podział, `insert_at: RATIO`). OBA poprawne (patrz
  `ZASADY_WIAZANIA_KREATOROW_2026-07.md` §1 — stacja zawsze na węźle).
- **Blok nN:** liczba odpływów, napięcie odbiornika nN (+ custom), intencja zabezpieczenia źródła
  (`sourceProtectionIntent`), lista odpływów z rolami/zabezpieczeniami.
- **Szybka ścieżka „stacja rekomendowana"** (`handleSubmitRecommendedStation`).
- **Wiązanie:** po sukcesie `selectElement` + `centerSldOnElement` + `openRouteSurface('E-13')`.

### Mocne strony (do reużycia, nie duplikować)
- Backend `insert_station_on_segment_sn` / `append_station_on_endpoint` — kompletne, audytowane
  (Phase 0A/0C), heavy-tested. **NIE ruszamy semantyki podziału.**
- Helpery: `buildStationSnFieldsHelper`, `stationSelectionFromMaterialization`, katalogi
  (`fetchTransformerTypes/ConverterTypes/Manufacturers/SwitchgearFamilies/CompleteBayTemplates`).
- `rama` ui2 (KreatorRama/PoleKatalogu/PoleWyboru/PoleLiczbowe/PanelTeorii/`useSelekcjaPoOperacji`).

### Braki/dług legacy (do zamknięcia przy migracji)
- **God-file 1884 w.** (god-file containment, program 10x F-god-file).
- **Brak PanelTeorii** (must-have V12K-054/066) — teoria stacji SN/nN, dobór transformatora, ŚOI.
- **Kontrakt ekranu prowadzącego (FLOW §0.3)** niepełny (cel jednym zdaniem / stany zerowe /
  następny krok / język inżynierski po co-z czego-co daje).
- Wiązanie V12K-073 obecne (selectElement/center), ale bez wspólnego `useSelekcjaPoOperacji`.

## 2. Kontrakt docelowy ui2 (KreatorStacji)

Katalog `ui2/kreatory/stacja/`: `stacjaModel.ts` (typy/walidacja/payload — bez fizyki),
`strings.ts` (PL), `KreatorStacjiSnNn.tsx` (rama), `index.ts`, `__tests__/`. Kroki (FLOW E-6):
1. **Rodzaj i umiejscowienie** — typ stacji (odbiorcza/przelotowa/sekcyjna) + koniec odcinka vs
   świadomy podział (jawnie, z podglądem skutku topologicznego). PanelTeorii: rola stacji SN/nN.
2. **Transformator** — katalog TRAFO_SN_NN + dobór; PanelTeorii: dobór mocy/przekładni, prądy I₁/I₂.
3. **Rozdzielnica SN** — producent/rodzina/szablony pól + podgląd SVG. PanelTeorii: pola i role.
4. **Blok nN** — konfiguracja (odbiorcza/PV), napięcia, odpływy, zabezpieczenie źródła.
5. **Gotowość + zapis** — `KreatorGotowosc` + `useSelekcjaPoOperacji` (wiązanie ze schematem).

## 3. Fazy (opcja MAX, równolegle do legacy)

- **D1 — audyt + kontrakt (ten dokument).** ✅
- **D2 — rdzeń KreatorStacji:** rama + krok 1 (typ + umiejscowienie endpoint/split) + krok 2
  (transformator katalog + dobór) + krok 5 (gotowość + zapis realną operacją + wiązanie V12K-073).
  NN=LOAD_NN domyślnie, minimalny blok nN. Rejestracja w `operationFormRegistry` pod flagą/wariantem
  NIE zastępując jeszcze legacy. Testy modelu + realnej ścieżki. PanelTeorii kroków 1–2.
- **D3 — rozdzielnica SN:** producent/rodzina/kompletne szablony pól + podgląd SVG + filtr
  niekompletnych. PanelTeorii pól. Testy.
- **D4 — blok nN + PV:** konfiguracja PV_INVERTER (dobór falownika/transformatora LV bez zgadywania),
  odpływy, napięcia, zabezpieczenie źródła, szybka ścieżka „stacja rekomendowana". Testy.
- **D5 — cutover:** przełączenie `operationFormRegistry`/`operationSurfaceRegistry` na KreatorStacji,
  retire `InsertStationForm`, migracja intencji testów legacy do ui2, zrzuty obu motywów.

## 4. Kryteria odbioru (całość)
1. Pełna parytetowość funkcji z legacy (typy/nN/transformator/rozdzielnica/umiejscowienie/odpływy) —
   ZERO regresji przepływu budowy (magistrala → stacja na końcu/przez podział).
2. PanelTeorii must-have w każdym kroku konfiguracji.
3. Wiązanie V12K-073 (`useSelekcjaPoOperacji`) po zapisie.
4. ZERO fizyki w UI (wartości z katalogu/backendu), FROZEN API i semantyka podziału nietknięte,
   determinizm zachowany.
5. Testy: model + realna ścieżka (natywne interakcje, nie syntetyczne) per faza; pełna regresja
   frontendu zielona; guardy (ui_no_physics/ui_terminology/forbidden/dialog_completeness/dead_click).
6. Legacy retire po D5 (bez martwej równoległej ścieżki).

## 5. Reguły spójne z kanonem
FLOW projektanta (kontrakt ekranu prowadzącego), reużycie helperów/katalogów/`rama`, brak
codename'ów, polski. Renderowanie glifu stacji na SLD = wątek SLD (bez edycji `ui/sld/**` tutaj).
