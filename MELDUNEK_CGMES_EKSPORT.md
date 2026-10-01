# MELDUNEK — karta KASACJA-SCL-I-CIM-KLIENT (jeden eksport modelu sieci: CGMES z backendu, decyzja K-14/D-41)

Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-cgmes-eksport`. Baza: `d6c26c3f`.
Commity karty: `290ba028` (zmiana), `613f8060` (kontrakt OpenAPI końcówki), ten meldunek osobno.
Czubek kodu przed meldunkiem: `613f8060`.

## 1. Wynik i dowody

Eksport modelu sieci ma jedną ścieżkę. Klientowe eksportery SCL/SCD i CIM są skasowane. Pozycja
menu „CGMES — model sieci (IEC 61970 EQ+TP)” pobiera archiwum zbudowane przez backend z nowej
końcówki `GET /api/cases/{case_id}/enm/eksport-cgmes`. Menu ma teraz pozycje: svg, pdf, dxf,
cgmes.

| Kryterium karty | Dowód | RC |
|---|---|---|
| grep `61850\|exportCim` we `frontend/src` = 0 | `grep -rnE "61850\|exportCim" frontend/src --include=*.ts --include=*.tsx` → 0 trafień. Bez filtra typów jedyne trafienia to dwie liczby `0.618501109` w danych `harness-fixtures/generated/dynamika_scena_przebiegi.json` (przebieg czasowy, nie odwołanie) | — |
| determinizm CGMES: SHA-256 dwóch biegów na sieci złotej | `tests/api/test_enm_eksport_cgmes.py::test_dwa_biegi_na_sieci_zlotej_maja_ten_sam_sha256`; bajty końcówki równe `export_cgmes(enm)`; e2e porównuje SHA-256 pliku pobranego przez przeglądarkę z dwoma wywołaniami API | 0 |
| test końcówki: kontrakt + nazwana odmowa (nie 500) | ten sam plik: 200 `application/zip`, człony EQ/TP/refmap/manifest, integralność, nagłówki rewizji i odcisku, model niezmieniony; 422 dla modelu pustego i zacisku do szyny spoza modelu z treścią po polsku; 404 dla przypadku spoza projektu | 0 |
| guardy `dialog_completeness`, `dead_click`, `forbidden_ui_terms`, `api_lifecycle`, `router_mount_guard` | wszystkie `[zielony]` w `guardy_z_ci.py` | 0 |
| e2e natywnym klikiem na realnym backendzie | `node scripts/playwright-run.mjs e2e/eksport-cgmes.spec.ts`: 2 passed (menu → CGMES → pobrany ZIP; projekt bez sieci → nazwana odmowa w powiadomieniu, żaden plik) | 0 |
| zrzut menu przed/po | `mv-design-pro/docs/audit/visual/KASACJA-SCL-I-CIM-KLIENT/menu-eksportu-{przed,po}.png` + README z warunkami zrzutu. Werdykt wizualny należy do właściciela (B-02) | — |

Bramki wspólne (kody wyjścia łapane bezpośrednio, wyniki zapisane do plików):

| Bramka | Wynik | RC |
|---|---|---|
| Backend `pytest -m "not pandapower and not andes"` (drzewo `290ba028`) | 27 058 passed, 11 failed, 6 errors. Wszystkie oprócz jednego to czerwień bazy z listy wykluczeń (niżej). Jedyna nowa czerwień: `tests/api/test_openapi_snapshot.py` (migawka OpenAPI bez nowej trasy) — naprawiona w `613f8060` | 1 |
| Backend po `613f8060`: `tests/api` + `tests/cgmes` | 1783 passed | 0 |
| Frontend pełny vitest `--no-file-parallelism` | 883 plików, 12 936 passed, 14 todo | 0 |
| `npm run type-check` | czysto | 0 |
| `npm run lint` | czysto | 0 |
| `python ../scripts/guardy_z_ci.py` z `backend/` | komplet zielony (114 guardów, testy własne guardów 3363 passed, black/ruff jak CI) | 0 |
| e2e `eksport-cgmes.spec.ts` (realny backend) | 2 passed | 0 |

Czerwień bazy zmierzona na `d6c26c3f` tym samym poleceniem: 10 failed + 6 errors, wyłącznie
pozycje wykluczone kartą (partia 6, naprawiana równolegle):
- `tests/enm/migrations/test_nn_field_specs_promocja_aparat.py` (8),
- `tests/domain/test_rejestr_kodow_bram_katalogowych.py` (1),
- `tests/enm/test_nazwy_jedno_zrodlo.py` (1),
- `tests/test_protection_settings_w3c2_identity.py` (6 błędów),
- `tsconfig_gate_guard` (81 > 80).

Na tym drzewie `tsconfig_gate_guard` pokazuje 80/80 (zielony). To skutek uboczny kasacji, nie
naprawa: jeden z 81 błędów siedział w skasowanym `v2/export/__tests__/downloadSldExport.test.ts`.
Nowych błędów typu nie dodano (porównanie list `tsc` baza ↔ karta). Pozostałe 80 zostaje dla
karty równoległej.

Inna czerwień bazy, napotkana i naprawiona u źródła: `ui/sld/v3/canvas/__tests__/menuBudowyNaKanwie.test.tsx`
(2 testy, czerwone na `d6c26c3f`, `615f3b24` i `1c7cadc4`). Przyczyna: po partii 6 model
odczytu backendu sieci referencyjnej meldował każde pole OUT/FEEDER stacji jako zajęte. Pomiar:
53 pola OUT, z tego 33 z odcinkiem do następnej stacji i 20 z odcinkiem do końca ciągu. Według
kanonu POLE-ZAJĘTE „Kontynuuj ciąg” ze stacji musi być wtedy zablokowane. Produkt był poprawny,
a test pochodził sprzed kanonu. Test przepisano z zachowaniem intencji (opis w komentarzu):
- zajęte pola → pozycja zablokowana z powodem i sparowana z resolverem kreatora;
- stacja z wolnym polem (scena z generatora backendu `punkt_startu_stacja_na_odcinku_wolne_jedno`)
  → natywny klik otwiera `continue_trunk_segment_sn` z tym polem;
- pokrycie łańcucha liczone po odcinkach: co najmniej 15 z aktywnym „Wstaw stację”.

## 2. Co zrobiono

Backend:
- Trasa `GET /api/cases/{case_id}/enm/eksport-cgmes` w zamontowanym routerze ENM (`api/enm.py`).
  - Wejście: ENM tylko do odczytu.
  - Wyjście: ZIP z `application/cgmes/service.py::export_cgmes`.
  - Nagłówki `X-Model-Rewizja`/`X-Model-Odcisk`: nazwa pliku niesie wersję, którą plik zawiera.
  - OpenAPI deklaruje 200 `application/zip` i 422 z opisem.
  - Wiersz w `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md`.
- `application/cgmes/kompletnosc.py`: bramka czytająca WYPRODUKOWANE drzewa EQ/TP. Warunek
  odmowy pochodzi z tego samego wyniku eksportera (predykaty parami). Kody odmowy:
  - `cgmes.model_pusty`;
  - `cgmes.szyna_bez_napiecia` (≤ 0 kV);
  - `cgmes.zacisk_bez_szyny` (zacisk wskazuje węzeł nieobecny w pliku);
  - `cgmes.stacja_z_szyna_spoza_modelu` — eksporter pomijał taki poziom napięcia po cichu.
  - Wynik: 422 z nazwanymi brakami po polsku.
- Usunięto `export_eq_tp_bytes`. Po wpięciu bramki była to druga, niebramkowana droga do bajtów
  CGMES, bez konsumenta.

Frontend:
- `formats.ts`: 4 pozycje, pole `source` (rysunek albo model) decyduje, czy budować rysunek.
- `sldExport.ts`: wszystkie formaty asynchroniczne, CGMES przez `eksportCgmesApi.ts`.
  Odmowa serwera trafia do powiadomienia słowo w słowo.
- Menu i przycisk „↓ SVG” melduje brak rysunku (dotąd martwy klik).

Testy przepisane z intencją w komentarzach:
- `formatyEksportu`: iloczyn {format rysunku × LOD × motyw} i {CGMES × LOD × odpowiedź serwera};
  formaty rysunku nie wołają serwera.
- `eksportDokumentu`: {format × źródło × dane × serwer}.
- `SldExportFormatMenu`: stan pracy, blokada drugiego eksportu, odmowa.
- `workspacePanels`, `resultLabelR4`: przejście na ścieżkę asynchroniczną.
- `transformatoryStacji.konsumenci`: konsument CIM zniknął.

Bramka wskrzeszenia: `legacy_public_path_guard.py::check_kasacja_scl_cim_klient_resurrection`.
- Zakazane ścieżki: 8 plików.
- Zakazane definicje TS: 15 nazw, w dowolnym pliku `frontend/src`, komentarze pomijane.
- Formaty `iec61850`/`cim`/`scd` nie mogą wrócić do rejestru menu.
- `export_eq_tp_bytes` nie może wrócić w backendzie.
- Testy własne guarda (iniekcje) zielone. Na drzewie bazy guard zgłasza 27 naruszeń.

Pin `solver_input_substitute_guard`: 561 → 562 plików (application 245 → 246). Dług bez zmian:
30 plików, suma 91.

## 3. Inwentarz klasy (klientowe ścieżki eksportu modelu i schematu — pomiar grepem)

| # | Miejsce | Konsumenci produkcyjni | Decyzja |
|---|---|---|---|
| 1 | `ui/sld/v2/export/exportIec61850.ts` (szkielet SCL/SCD) | menu | skasowane (decyzja) |
| 2 | `ui/sld/v2/export/exportCim.ts` + `ui/sld/v3/export/exportModelData.ts` | menu | skasowane (decyzja); zastąpione CGMES z backendu |
| 3 | `ui/sld/v2/export/{SldExportButton.tsx, downloadSldExport.ts, exportSvg.ts}` | 0 | skasowane — druga, martwa ścieżka eksportu SVG obok `v3/export/sldExport.ts` |
| 4 | `ui/sld/v2/export/exportPdf.ts` (jawny szkielet „NIE generuje bajtów”) | 0 | skasowane — zaślepka |
| 5 | `ui/reports/osdOperatorPresets.ts` (jedyna deklaracja „Plik SCD … dla SCADA” jako załącznika) | 0 | skasowane |
| 6 | `ui/shared/fileNamingConvention.ts` — `NAMING_PRESETS.sld_export('scd'\|'cim')`, `buildFilename` (data z zegara), `isValidFilename` | 0 | skasowane — druga, niedeterministyczna konwencja nazw; zostaje `sanitizeFilenamePart` (konsument: `exportNames.ts`) |
| 7 | `backend …/cgmes_exporter.py::export_eq_tp_bytes` | 0 (po zmianie) | skasowane — niebramkowana droga do bajtów |
| 8 | `ui/sld/v2/export/exportDxf.ts` | `v3/export/exportDxfV3.ts` | zostaje — żywy generator DXF |
| 9 | `ui/sld/export/exportTheme.ts` | 0 | ZOSTAJE świadomie: przypięty strażnikiem kanonu `v12xx_canon_guard.py::check_dark_scada_screen_theme` jako deklaracja inwariantu motywu eksportu; nie jest eksporterem modelu; kasacja wymaga zmiany kanonu |
| 10 | komentarz `ui/sld/v2/canvas/enmToSldAdapter.ts` („nazwy per IEC 61850”) | — | poprawiony — twierdzenie było nieprawdziwe (nazewnictwo OSD, nie norma) |

## 4. Zmiany dokumentów

- `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md`:
  - 12 #21 → „BRAK — świadomie, D-41”;
  - 8 #10 → rysunek + CGMES;
  - 8 #13 i K2 → eksport ISTNIEJE, import BEZ-KONSUMENTA;
  - K1, wiersz domeny 8.
- `docs/twin/OWNER_REVIEW_PACKAGE.md`: K-14 i D-41 (część SCL) jako rozstrzygnięte; poz. 41 ze
  stanem.
- `docs/v12xx/REJESTR_KONFLIKTOW.md`: dopisek do S9-6 i nowy wpis `KASACJA-SCL-CIM` (inwentarz,
  decyzja, różnica merytoryczna).
- `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md`: nowy wiersz eksportu schematu i modelu sieci.
- `docs/plan/SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md`: trzy wpisy 61850/CGMES.
- `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md`: nowa trasa.

## 5. Czego nie zrobiono i dlaczego

- **Kontenery pól (`Bay`) w CGMES EQ.**
  - Klientowy CIM emitował `Bay` z przynależnością aparatów.
  - Backendowy CGMES EQ+TP przenosi pola wyłącznie w side-car (`refmap.LOSSY_BOUNDARY`,
    wypisane w manifeście archiwum). Odbiorca trzeciej strony ich więc nie dostaje.
  - Przynależności transformatora do stacji EQ też nie zapisuje.
  - Rozszerzenie eksportera o `Bay`/`EquipmentContainer` to zmiana eksportera poza zakresem
    ostatecznej decyzji K-14/D-41, która przepina menu na istniejący eksporter. Różnica jest
    zmierzona i zapisana w rejestrze konfliktów (wpis `KASACJA-SCL-CIM`). Do rozstrzygnięcia
    przez doradcę albo właściciela.
- **Import CGMES (trasa + ekran) — poza zakresem karty.** `import_cgmes` nadal nie ma trasy;
  mapa domknięcia przypisuje go do W12 (wiersze 8 #13 i K2 zaktualizowane uczciwie: eksport
  istnieje, import bez konsumenta).
- **Moduł SCL (IEC 61850) — nazwana odmowa budowy bez konsumenta.** Powstanie wyłącznie po
  danych właściciela D1–D8, jako adapter backendowy. Bramka wskrzeszenia blokuje powrót do
  klienta.
- **Pozostałe 80 błędów `tsconfig_gate_guard`** — należą do karty równoległej (zakaz duplikatu
  napraw). Karta nie dodała żadnego błędu typu.
- **Odnotowane, nie w klasie tej karty:** `route_prefix_guard` raportuje `frontend/src/ui/topology/api.ts`
  jako klienta tras świadomie wyłączonych, bez importerów. Pozycja stoi na jego jawnej liście z
  uzasadnieniem; guard jest zielony.
