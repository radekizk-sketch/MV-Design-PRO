# Przegląd materiału GPT dla przebudowy rozdzielni SN 15 kV GPZ (PR #499, #500, #502, #504)

Data: 2026-10-28. Tryb: tylko odczyt (git show/diff na refach origin). Podstawa: `mv-design-pro/docs/uiux/PRZEKAZANIE_GPZ_SN_15KV_2026-10-28.md` (origin/claude/mv-design-pro-twin-audit-u4lhy0, 79 linii, przeczytane w całości).
Refy: #499 `06e4aa7b`, #500 `56aa6774`, #502 `40f264f4`, #504 `247dad57`; gałąź UI/UX `fa129e7d` (`...-karta-uiux-przemyslowy`). Łańcuch potwierdzony `git merge-base --is-ancestor` (e973ad2c → #499 → #500 → #502; #504 osobno na e973ad2c).

## 0. Wniosek

1. Żaden PR nie dostarcza wzorca pola liniowego SN wg kolejności §4. Jedyny kod dotykający kompozycji GPZ na `SldCanvasV3` to #504 (`v3/compose/gpz.ts`); #502 buduje **drugą ścieżkę rysunku pola** (`ui/field/BayWindowSchematic.tsx`, własny SVG, własna szyna, własny układ współrzędnych) obok `SldCanvasV3` — sprzeczne z §3 ("zachować `SldCanvasV3`").
2. Symbole "QET" to tylko **7 plików .elmt nN** (wyłącznik, MCB, bezpiecznik, rozłącznik bezpiecznikowy, odłącznik, RCCB, RCBO). Brak źródeł QET dla uziemnika, CT, VT, głowicy kablowej, ogranicznika, rozłącznika SN. "73 symbole" w #500 to w większości istniejący rejestr `cadSymbolRegistry` (geometria własna z arkusza PV, nie QET — nagłówek `cadSymbolRegistry.ts:1-30`) oraz pozycje `WYMAGA_ZRODLA`/`ZLOZENIE_ENM` bez geometrii. Geometria stanu ZAMKNIĘTEGO jest "autorskim wariantem koncepcyjnym" (`qetPilotSourceGeometry.ts:7`) — nie jest oryginałem QET.
3. Licencja i pochodzenie (pkt a): zapisane poprawnie w #499 — `docs/sld/vendor/qet/ELEMENTS.LICENSE` (oryginał upstream), `README.md` (autor "The QElectroTech team", CC BY 3.0, link), `import_manifest.json` (origin, `license: CC-BY-3.0`, `sourcePath`, `upstreamBlobSha` per element). #500 przenosi atrybucję do nagłówka `qetPilotSourceGeometry.ts:1-8` i `sourcePath/sourceBlobSha` per symbol. Brak: atrybucji w renderowanym UI/eksporcie (CC BY wymaga atrybucji przy redystrybucji; eksport PDF/SVG nie był sprawdzany).
4. Pole ENM (pkt b): żaden PR nie wprowadza nowego modelu — #502 i #504 czytają istniejące `Bay.primary_devices` (`kind`, `placement`, `switch_state`, `device_ref`). Nie dublują `GPZ-H5-APARATURA` w backendzie, ale #502 tworzy **frontowy walidator kompozycji** (`bayPrimaryComposition.ts`, kody `BRAK_PORTU_ODGALEZIENIA`, `VT_NIE_ODGALEZIENIE`, `SPRZEGLO_NIEPELNE`, `DUPLIKAT_REF`) — to druga prawda gotowości obok `enm/validator.py`/`CalculationReadiness` i obok `wyposazenie_pola.py::_sprawdz_aparat` (UI/UX `wyposazenie_pola.py:227`).
5. Blokady (pkt d): #504 działa **per pole** (`interlock_rules.py:75 blokady_zamkniecia`, `:109 earthing_interlock_violation` — "TEGO SAMEGO pola"), nie na topologii wynikowej. Frontendowy `switchingSequenceValidator.ts` w #504 zamienia każde `isAllowed: true` na `isAllowed: false` (11 miejsc, linie 43–117) — to nie walidacja, tylko wyłączenie funkcji komunikatem odmowy (zaślepka wg ZASADY NR 1/3).
6. Rdzenie B-01 (pkt f): żaden PR nie dotyka plików z `scripts/rdzenie_b01.py` (lista zawiera wyłącznie `network_model/solvers/*`; `grep -c "enm\|frontend"` = 0). `interlock_rules.py` nie jest rdzeniem B-01.
7. Na czym budować wzorzec: `frontend/src/ui/sld/v3/compose/gpz.ts` + `compose/apparatusSequence.ts` na gałęzi `origin/claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy`, z danymi z `Bay.primary_devices` utrzymywanymi przez `set_bay_equipment` (`backend/src/enm/wyposazenie_pola.py:363`) i szablonem z `backend/src/network_model/catalog/bay_templates.py:103-116` (LINIA_OUT), renderowanie przez istniejący `v3/cad/CadSymbol.tsx` po zasileniu go geometrią QET. Z #504 wciągnąć selektywnie: segmenty port-port, sprzęgło dwuodcinkowe, ramkę na `SldCanvasV3`, `is_open` w backendzie.

## 1. PR #499 — import źródeł QET, atlas, bramka, reguły ENEA (19 plików, +1808)

| Jednostka | plik:linia | Klasyfikacja | Uzasadnienie wobec przekazania |
|---|---|---|---|
| 7 oryginalnych .elmt nN | `mv-design-pro/docs/sld/vendor/qet/10_electric/11_singlepole/200_fuses_protective_gears/**` | ZATWIERDZIĆ (jako wzorzec potoku), niewystarczające | §1 "oryginalna stylistyka QET": pliki niezmienione, z SHA blobu. Zakres nN; dla pola SN brakuje źródeł uziemnika, CT, VT, głowicy, ogranicznika, rozłącznika SN — trzeba dociągnąć tym samym potokiem. |
| Licencja + README + manifest | `docs/sld/vendor/qet/ELEMENTS.LICENSE`, `README.md:1-20`, `import_manifest.json:1-25` | ZATWIERDZIĆ | Atrybucja CC BY 3.0, autor, źródło, SHA — pkt (a) spełniony na poziomie repo. Uzupełnić atrybucję w UI/eksporcie. |
| Importer .elmt → JSON kandydatów | `mv-design-pro/scripts/import_qet_nn.py` (238 l.) | POPRAWIĆ | Cel zgodny (geometria QET → prymitywy). Wada: nazwa i zakres "nn", wynik do /tmp, nie generuje wpisów `cadSymbolRegistry`; trzeba uogólnić na SN i zasilać `CadSymbol`. |
| Generator atlasu HTML/SVG | `mv-design-pro/scripts/build_qet_nn_atlas.py` (151 l.) | POPRAWIĆ | Dowód przeglądowy poza aplikacją; dopuszczalny jako narzędzie odbioru symboli, nie jako widok produktu. |
| Test importera | `mv-design-pro/tests/unit/test_import_qet_nn.py` | POPRAWIĆ | Katalog `mv-design-pro/tests/unit` poza `backend/tests` — nie biegnie w `python-tests.yml`, tylko w nowym workflow (`nn-qet-symbol-library.yml:25`, `unittest`). Przenieść pod pytest/CI główne. |
| Nowy workflow CI | `.github/workflows/nn-qet-symbol-library.yml` | POPRAWIĆ | Dziesiąty workflow poza listą 9 z CLAUDE.md; wpiąć krok w istniejący `python-tests.yml`/`sld-determinism.yml`. |
| Bramka dopuszczenia kandydata QET | `frontend/src/ui/sld/v3/cad/imported/qetAdmissionGate.ts:80` (+test) | ZATWIERDZIĆ z poprawką | Zgodne z §1 (tylko źródłowe symbole, status DRAFT). Do sprawdzenia przy wciąganiu: czy nie powiela `verificationStatus` rejestru CAD (nie zweryfikowano szczegółowo). |
| Kontrakt złożeń RGnN ENEA | `frontend/src/ui/sld/v3/cad/imported/eneaCompositeContract.ts:1-40` (+test) | ODRZUCIĆ dla GPZ (poza zakresem SN) | Dotyczy rozdzielnicy nN stacji SN/nN (ENEA SN/nn zeszyt 1/2 2025), nie GPZ 15 kV Z.2/Z.7/Z.10–Z.12/Z.17. Dla GPZ nie używać; ewentualnie osobna ocena w wątku nN. Stałe fizyczne (185 mm, szyny Cu) w module UI. |
| Dokument źródło→atlas | `docs/sld/NN_CAD_QET_ENEA_SOURCE_TO_ATLAS_2026-10-24.md` | materiał dowodowy | Nie kanon. |

## 2. PR #500 — ramka SCADA, "73 symbole", atlas, odbiór z checkboxami (23 pliki, +3119/−11)

| Jednostka | plik:linia | Klasyfikacja | Uzasadnienie |
|---|---|---|---|
| `CadPrimitiveLayer` — wspólny renderer prymitywów | `frontend/src/ui/sld/v3/cad/CadSymbol.tsx:194-231` | ZATWIERDZIĆ | Rozszerza istniejący renderer CAD (§3 "istniejący renderer CAD/QET"), bez nowych prymitywów. |
| Geometria 7 symboli QET (otwarte z .elmt, zamknięte autorskie) | `cad/scada-frame/qetPilotSourceGeometry.ts:1-23, 131, 827` | POPRAWIĆ | Otwarte — zgodne z §1. Zamknięte — "autorski wariant KONCEPCYJNY" (l. 7) = własny piktogram; zamiast tego: wariant zamknięty wyprowadzony regułą z geometrii QET (obrót noża wokół przegubu z .elmt) albo element QET wariantu zamkniętego. Plik ręcznie wklejonego JSON (831 l.) zamiast artefaktu generowanego z importera — ryzyko rozjazdu ze źródłem. |
| Ocena stanu ramki | `cad/scada-frame/scadaFrameState.ts:15-22, 72, 152` | POPRAWIĆ | Dwa kolory ramek zgodne z §1. Wada: model pomocniczy z 7 typami (StanEksploatacyjny, JakoscDanych, ZrodloStanu, StanZasilenia, StanWkladki…) i `zweryfikujPolozeniaDoObliczen` (l. 152) — ocena poprawności dla topologii/obliczeń w UI, druga prawda obok backendu (§3, ENM jedyny). Zostawić wyłącznie mapowanie `actual_state` → OTWARTY/ZAMKNIĘTY/brak ramki. |
| Komponent ramki | `cad/scada-frame/QetScadaFrame.tsx:32, 53` | POPRAWIĆ | (1) Prostokąt z wypełnieniem `fillOpacity 0.085` — przekazanie mówi o ramce, wypełnienie = dodatkowy nośnik; (2) obwiednia "korpusu bez przewodów" (l. 18) vs §1 "ramka obejmuje cały symbol"; (3) l. 32: przy niepoprawnym stanie łącznik **znika ze schematu** (`children` nierenderowane) — aparat z ENM nie może zniknąć z topologii; ma zostać narysowany bez ramki. |
| Glif kanwy z ramką | `cad/scada-frame/QetScadaCanvasGlyph.tsx` | POPRAWIĆ | Ten sam mechanizm co wyżej; dziś wpięty tylko w `LvDomainView`, nie w `SldCanvasV3`. |
| Wpięcie w `LvDomainView` za flagą `qetScadaFrames=false` | `frontend/src/ui/sld/v3/lv-domain/LvDomainView.tsx` (diff) | ODRZUCIĆ dla GPZ | Flaga domyślnie wyłączona = funkcja niewpięta w ścieżkę użytkownika (ZASADA NR 1); do tego domena nN, nie GPZ. |
| Adapter projekcji → ramka | `cad/scada-frame/qetScadaProjectionAdapter.ts` (+test) | POPRAWIĆ | Dotyczy `LvDomainProjectionV1` (nN). Dla GPZ odpowiednik musi czytać `primary_devices[].switch_state`. |
| Obwiednie symboli QET | `cad/scada-frame/qetSymbolBounds.ts` (+test) | ZATWIERDZIĆ | Potrzebne do "ramka bez kolizji" (§1); wciągnąć do warstwy geometrii QET. |
| Katalog biblioteki nN/SN ("73") | `cad/scada-frame/sldSymbolLibraryCatalog.ts:35-60, 80-112` | ODRZUCIĆ | Miesza 7 QET z rejestrem CAD (geometria własna, nie QET) i ~25 pozycjami `ZLOZENIE` ("Pole liniowe SN", "Pole transformatorowe SN" — jako wpisy katalogu symboli, a §4 każe wyprowadzać pole z typu i sekwencji). Druga lista symboli obok `cadSymbolRegistry` i `symbols/defs.ts`. |
| Rejestr odbioru z checkboxami (localStorage) | `cad/scada-frame/symbolApprovalLedger.ts:1-50` | ODRZUCIĆ | Decyzje właściciela w localStorage przeglądarki (`KLUCZ_ODBIORU_SYMBOLI`) — nietrwałe, poza repo/ENM; odbiór symboli prowadzi się w dokumencie/ rejestrze repo (B-02 przez właściciela). |
| Strona przeglądu + e2e | `frontend/qet-scada-frame-review.html`, `src/qet-scada-frame-review-main.tsx`, `e2e/qet-scada-frame-review.spec.ts`, `e2e/qet-scada-lv-domain-projection.spec.ts` | POPRAWIĆ (tylko jako narzędzie odbioru) | Osobny punkt wejścia Vite = druga aplikacja; dopuszczalne jako harness odbioru symboli, nie jako produkt. E2E ćwiczy harness, nie realną ścieżkę `SldCanvasV3`. |
| `SldSymbolLibraryAtlas.tsx` | `cad/scada-frame/SldSymbolLibraryAtlas.tsx` (302 l.) | POPRAWIĆ | j.w. — narzędzie przeglądu. |
| Dokumenty odbioru | `docs/.../QET_SCADA_FRAME_V1_OWNER_ACCEPTANCE_20261024.md`, `..._CATALOG_SOURCE_REVIEW_2026-10-24.md` | materiał | "Koncepcja dwóch ramek zaakceptowana" — zgodne z §1. |

## 3. PR #502 — "pola ENM GPZ SN, CT/VT/ES, CadSymbol" (4 pliki, +479/−139)

Uwaga faktograficzna: PR **nie zawiera zmian ENM ani backendu** (`git diff --stat #500 #502` = 4 pliki frontu + 1 doc). "Bramki bezpieczeństwa" to wyłącznie kody problemów prezentacji.

| Jednostka | plik:linia | Klasyfikacja | Uzasadnienie |
|---|---|---|---|
| Rozdział tor pierwotny / odgałęzienia (CT w torze, VT i ES poza) | `frontend/src/ui/field/bayPrimaryComposition.ts:90-171` | POPRAWIĆ (przenieść regułę) | Reguła CT/VT/ES zgodna z §2. Wada: (1) osobny moduł w `ui/field/` zamiast `v3/compose/apparatusSequence.ts`, który już rozdziela `mainSpecs`/`lateralSpecs` wg `placement`; (2) własny walidator gotowości w UI (druga prawda wobec `enm/validator.py`/`wyposazenie_pola.py`); (3) własne współrzędne x/y — ręczne rozmieszczanie (§4). |
| Kierunek pola transformatorowego (`DO_SZYN`) | `bayPrimaryComposition.ts:44, 167` | POPRAWIĆ | Zgodne z §2 (T1/T2 nad szynami), ale w złym miejscu — reguła należy do `compose/gpz.ts`. |
| Zakaz fikcyjnej głowicy (brak CAD → problem) | test `bayPrimaryComposition.test.ts` "nie rysuje fikcyjnej głowicy" | POPRAWIĆ | Słuszne "nie wymyślać", ale skutek to brak głowicy kablowej w polu liniowym — §2 wymaga zakończeń kablowych; trzeba dostarczyć symbol QET, nie pomijać. |
| Schemat pola — nowy SVG | `frontend/src/ui/field/BayWindowSchematic.tsx:1-175` (szyna `line x1={45}` l. 136, ramka z wypełnieniem l. 54) | ODRZUCIĆ | Druga kanwa/ścieżka rysunku obok `SldCanvasV3` (§3); ręczne współrzędne; symbole `cad.uziemnik/przekladnik*` z rejestru własnego, nie QET (§1); ramka wypełniona i tylko korpus. |
| Testy | `frontend/src/ui/field/__tests__/bayPrimaryComposition.test.ts` (10 przypadków) | POPRAWIĆ | Czyste funkcje, `as unknown as BayBaseModel` — fikstura omija typy ENM; nie ćwiczy realnej ścieżki (brak renderu, brak `SldCanvasV3`, brak danych z `set_bay_equipment`). Intencje przypadków (VT szeregowo = błąd, sprzęgło bez dwóch stron, duplikat ref, stan nieznany ≠ ramka) warto przenieść do testów `compose/gpz`. |
| Dokument R6 | `docs/sld/GPZ_SN_R6_KONTRAKT_POL_ENM_MINISCADA_20261025.md` §4 | materiał (cenny) | §4 pkt 2 "`linked_ref` nie zastępuje `port_id`" — trafne: ENM nie niesie portów odgałęzień VT/ES ani węzłów sprzęgła A/B. To realny brak kontraktu do karty POLE-LINIOWE-WZORZEC. Prototyp HTML "19/19 PASS" poza repo — niezweryfikowalny. |

## 4. PR #504 — stany łączników z rekordu ENM, tor prądu, audyt bramek (19 plików, +632/−29, na main)

| Jednostka | plik:linia | Klasyfikacja | Uzasadnienie |
|---|---|---|---|
| `is_open` + brak zgody przy stanie nieznanym/awaryjnym | `backend/src/enm/interlock_rules.py:56-62, 91-96` | ZATWIERDZIĆ | Zero domysłu; poprawia klasę (awaria ≠ otwarty). Na gałęzi UI/UX brak `is_open` (`git grep` = 0) — do wciągnięcia. |
| Test nieustalonego położenia | `backend/tests/.../test_gpz_blokady_nieustalonego_polozenia.py` (78 l.), `test_stan_ruchowy_pola_bez_fabrykacji.py` (+7) | ZATWIERDZIĆ | Backendowe, na realnym `Bay`. |
| Zakres blokad | `interlock_rules.py:75, 109` | POPRAWIĆ (brak) | Tylko w obrębie pola. §3 wymaga oceny całej topologii wynikowej: odłącznik pod obciążeniem (prąd z toru/rozpływu), załączenie na uziemiony odcinek (ES innego pola / sprzęgła / strony kabla), równoległa praca T1/T2 przez sprzęgło, zasilanie zwrotne (PV/BESS), wyspy, nieaktualne wyniki. Nic z tego nie istnieje w #504. |
| Front: wszystko `isAllowed:false` | `frontend/src/ui/network-build/forms/switchingSequenceValidator.ts:43-117` (+test) | ODRZUCIĆ | Zamiana walidatora na stałą odmowę = zaślepka (ZASADA NR 1/3); dodatkowo walidacja łączeniowa w UI w ogóle nie powinna istnieć — ma być wywołanie backendu na topologii wynikowej. Właściwa naprawa: usunąć lokalny walidator i wpiąć operację backendową. |
| Sprzęgło: CB z tego samego aparatu, dwa odcinki A→port, port→B, `lineBreaker` | `frontend/src/ui/sld/v2/canvas/enmToCanonicalGpzAdapter.ts:617-640`; `v3/compose/gpz.ts:1485-1520` | ZATWIERDZIĆ z poprawką | Zgodne z §2 (jeden ciągły tor przez aparat, otwarty przerywa). UI/UX ma już `symbolSprzegla` (`gpz.ts:864` na UI/UX) — scalić, nie dublować. §2 wymaga sprzęgła dwucelkowego (łącznik szyn + wznios) — tu nadal jeden CB. |
| Kolejność aparatów wyłącznie z ENM, bez dokładania z szablonu | `v3/compose/gpz.ts:364-376` | POPRAWIĆ | Zgodne co do celu. Wady: parityKeys przez łańcuch warunków (VT, LOAD_SWITCH, SA → `[]`); brak gwarancji, że VT idzie do odgałęzienia, gdy `placement` błędny (#502 to łapał — połączyć). Stary tryb "konwencji" dla pól bez `primary_devices` zostaje (`gpz.ts:1150`) = rysunek z szablonu bez danych. |
| Jawne przewody port S → port N | `v3/compose/gpz.ts:594-610, 941-952` | ZATWIERDZIĆ | Zgodne z §4 ("porty → połączenia"); brak portu → `missingData` zamiast fikcyjnego mostka. |
| Ramka SCADA na `SldCanvasV3` | `frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx:462-489, 553-567` | POPRAWIĆ | Właściwe miejsce (§3) i kolory. Wady: rozpoznanie po `parityKeys` z prefiksów; `loadBreakSwitch`/`fuseSwitch` w zbiorze, ale `parityKeys` z #504 dla nich = `[]` → ramka nigdy się nie pojawi (defekt klasy); glif łącznika **ukrywany** przy stanie nieustalonym (l. 567) — aparat znika; glify z `symbols/glyphs.tsx` nie są QET. |
| `FUSE` → `fuse` | `v3/compose/apparatusSequence.ts:138` | ZATWIERDZIĆ | Nie dopowiada aparatu łączeniowego; symbol `fuse` istnieje (`symbols/defs.ts:137`). |
| Port `top` transformatora | `symbols/defs.ts:154`, `glyphs.tsx:437` | ZATWIERDZIĆ (do weryfikacji wizualnej B-02) | Brakujący port N. |
| Notatki stopu sceny | `v3/scene/buildScene.ts:3501-3517` | ZATWIERDZIĆ | Jawne braki danych zamiast milczenia. |
| Testy front | `compose/__tests__/gpzModelDrivenBay.test.ts`, `gpzCouplerTerminals.test.ts`, `canvas/__tests__/gpzQetStateFrame.test.ts`, `enmToCanonicalGpzAdapter.test.ts` | POPRAWIĆ | Realna funkcja `composeGpz`, ale z ręcznie zbudowaną `CanonicalGpzBay` (omija ENM→adapter); brak testu iloczynu (każdy rodzaj łącznika × ramka; VT z błędnym placement × kompozycja). Brak e2e na żywej kanwie. |
| Dokumenty | `docs/audit/GPZ_SN_ENEA_GAP_2026-10-25.md`, `GPZ_SN_PR504_RAPORT_WYKONANIA_2026-10-25.md` | materiał | |

## 5. Sekwencja aparatów pola liniowego SN (pkt c) — stan zmierzony

- Szablon UI/UX `bay_templates.py:103-116` (LINIA_OUT): Q1 `DS_BUS` UPSTREAM → Q0 `CB` MIDSTREAM → T1 `CT` MIDSTREAM → Q2 `DS_LINE` DOWNSTREAM → Q9 `ES` GROUND_BRANCH → GK `CABLE_HEAD` DOWNSTREAM. Brak VT/wskaźnika napięcia, brak portów odgałęzienia ES (do którego węzła — za Q2 po stronie kabla? między CB a Q2?), brak rozróżnienia konstrukcji (odłącznik trójpołożeniowy DS_ES w rozdzielnicy gazowej vs osobny uziemnik). `DS_ES` istnieje tylko w dokumencie `KOORDYNACJA_WATKOW_2026-10.md:458` (nie zweryfikowałem w `bay_templates`).
- #502 nie narzuca kolejności (bierze listę ENM), #504 też; żaden nie wiąże sekwencji z rysunkiem ENEA. `git grep "Z\.1[0-7]\|Z\.2\b\|Z\.4"` w `backend/src` i `GPZ_H5_LANCUCH_APARATURY.md` na UI/UX = 0 trafień — twierdzenie "szablony gniazd SN wg ENEA Z.2, Z.4–Z.17" **nie jest potwierdzone w kodzie** (może dotyczyć innego pliku; nie znalazłem).
- `ELEMENT_POLA_SN` występuje na UI/UX tylko w dokumencie koordynacji (`KOORDYNACJA_WATKOW_2026-10.md:458,482`), nie w `backend/src` (`git grep` = 0) — przypuszczenie: przestrzeń katalogu nazwana inaczej w kodzie albo jeszcze nie wdrożona.

## 6. Duplikaty wobec gałęzi UI/UX

- `ui/field/BayWindowSchematic.tsx` istnieje na UI/UX (wersja z main); #502 ją zastępuje własnym SVG → kolizja z kartą UI/UX (`EdytorWyposazeniaPola.tsx`, `wyposazeniePola.ts` na UI/UX).
- `cad/CadSymbol.tsx` + `cadSymbolRegistry.ts` — wspólne; #500 dokłada `CadPrimitiveLayer` (dobre) i drugi katalog symboli (zły).
- `v3/compose/gpz.ts` sprzęgło: UI/UX ma `symbolSprzegla` (`lineBreaker`/`lineSwitch`, l. 863-865) vs #504 sztywne `lineBreaker` — scalić na wersji UI/UX.
- Walidacja gotowości pola: `wyposazenie_pola.py::_sprawdz_aparat` (UI/UX) vs `bayPrimaryComposition.ts` (#502) vs `scadaFrameState.zweryfikujPolozeniaDoObliczen` (#500) — trzy miejsca, jedno właściwe (backend).

## 7. Do wciągnięcia — karta UX-04/POLE-LINIOWE-WZORZEC

1. #499: `docs/sld/vendor/qet/` (licencja, README, manifest, 7 .elmt) + `scripts/import_qet_nn.py` uogólniony na SN; dociągnąć .elmt dla ES, CT, VT, głowicy kablowej, ogranicznika, rozłącznika SN z zapisem SHA.
2. #500: `CadPrimitiveLayer` (`CadSymbol.tsx:194-231`), `qetSymbolBounds.ts`; geometria otwarta z `qetPilotSourceGeometry.ts` — ale generowana z importera, nie wklejana.
3. #504: segmenty port→port (`gpz.ts:594-610`), `missingData` braków portów, notatki stopu (`buildScene.ts:3501`), `FUSE→fuse`, port `top` transformatora.
4. #504 ramka na `SldCanvasV3` po poprawkach: obejmuje cały symbol, bez wypełnienia, łącznik nie znika przy stanie nieustalonym, zbiór rodzajów z jednego źródła (`symbolIdForPrimaryDeviceKind`), nie z prefiksów `parityKeys`.
5. #502: intencje testów (VT szeregowo = błąd, ES poza odgałęzieniem = błąd, duplikat ref, stan nieznany bez ramki) — przeniesione do `compose/__tests__` i walidatora backendu; dokument R6 §4 pkt 2 jako wymaganie kontraktu: porty odgałęzień ES/VT w ENM (`port_id`), nie `linked_ref`.

## 8. Do wciągnięcia — UX-04/POLA-TR-POMIAR-SPRZEGLO

1. #504 sprzęgło: CB z tego samego aparatu (`enmToCanonicalGpzAdapter.ts:617`), dwa odcinki przez porty W/E (`gpz.ts:1485-1520`) — scalone z `symbolSprzegla` UI/UX; rozbudować do dwóch celek (łącznik szyn + wznios), czego żaden PR nie ma.
2. #502 reguła kierunku pola transformatorowego (T nad szynami) — jako reguła `compose/gpz.ts`, nie `ui/field`.
3. #502 wymóg jawnych stron LEFT/RIGHT sprzęgła (`SPRZEGLO_NIEPELNE`) — do walidatora ENM (porty `sn_coupler` left/right już są w `bay_templates.py:270-271`).
4. Pomiar Z.17 (po jednym na sekcję, VT na odgałęzieniu): szablon pomiarowy `bay_templates.py:251-253` (DS_BUS, VT OFF_PATH, ES) — żaden PR tego nie rozwija; granica 110 kV — żaden PR.

## 9. Do wciągnięcia — UX-04/LOGIKA-LACZENIOWA

1. #504 `is_open` i odmowa przy stanie nieznanym/awaryjnym (`interlock_rules.py:56-96`) + test `test_gpz_blokady_nieustalonego_polozenia.py`.
2. Nic więcej z materiału — walidacja na topologii wynikowej (odłącznik pod prądem, uziemiony odcinek z sąsiednich pól/sprzęgła/strony kabla, równoległa praca T1/T2, zasilanie zwrotne, wyspy, nieaktualność K-S2) nie istnieje w żadnym PR i musi powstać w backendzie (`enm/`), z frontem wywołującym operację. Zasada "kliknięcie = wybór, przełączenie osobno" — żaden PR jej nie implementuje (#502 inspektor tylko do odczytu).

## 10. Raport rozbieżności — do odrzucenia

| Element | plik:linia | Powód (§ przekazania) |
|---|---|---|
| Nowy schemat pola w `ui/field` | #502 `BayWindowSchematic.tsx:1-175` | Druga ścieżka rysunku obok `SldCanvasV3` (§3); ręczne współrzędne (§4); symbole spoza QET (§1). |
| Walidator gotowości pola w UI | #502 `bayPrimaryComposition.ts:90-171` (jako walidator) | Druga prawda obok ENM/validatora (§3). Reguły przenieść, moduł usunąć. |
| Stała odmowa w walidatorze sekwencji | #504 `switchingSequenceValidator.ts:43-117` | Zaślepka; walidacja w UI zamiast na topologii wynikowej w backendzie (§3). |
| Katalog "73 symboli" | #500 `sldSymbolLibraryCatalog.ts` | Mieszanie QET z geometrią własną i wpisami-złożeniami pól (§1, §4). |
| Rejestr odbioru w localStorage | #500 `symbolApprovalLedger.ts` | Odbiór poza repo i poza B-02. |
| Zamknięte warianty autorskie | #500 `qetPilotSourceGeometry.ts:7` | Własny piktogram (§1). |
| Model stanu z 7 typami i oceną dla obliczeń | #500 `scadaFrameState.ts:15-22,152` | Fizyka/ocena w UI, druga prawda (§3); SCADA ma mieć tylko dwie ramki (§1). |
| Wypełnienie ramki, ramka tylko korpusu, znikanie symbolu | #500 `QetScadaFrame.tsx:18,32,53`; #502 `BayWindowSchematic.tsx:54`; #504 `SldCanvasV3.tsx:567` | §1: ramka obejmuje cały symbol, dwie ramki — bez dodatkowych nośników; aparat ENM nie może zniknąć. |
| Wpięcie za flagą domyślnie wyłączoną | #500 `LvDomainView.tsx` | Funkcja niewpięta (ZASADA NR 1); domena nN. |
| Kontrakt RGnN ENEA | #499 `eneaCompositeContract.ts` | Nie dotyczy GPZ SN 15 kV. |
| Prototyp HTML R6 "19/19 PASS" | #502 doc §3 | Poza repo, niezweryfikowalny; nie jest dowodem. |

## 11. Na czym budować wzorzec pola liniowego

Gałąź `origin/claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy` (`fa129e7d`):
- dane: `Bay.primary_devices` przez `backend/src/enm/wyposazenie_pola.py::set_bay_equipment` (l. 363) i szablon `backend/src/network_model/catalog/bay_templates.py` (LINIA_OUT l. 103-116) — rozszerzone o porty odgałęzień ES/VT (`port_id`) i odwzorowanie konstrukcji uziemnika; typ pola i sekwencja tu, nie w UI;
- kompozycja: `frontend/src/ui/sld/v3/compose/apparatusSequence.ts` (sekwencja + `placement` → tor/odgałęzienie) i `frontend/src/ui/sld/v3/compose/gpz.ts` (`buildFieldStack`) z wciągniętymi z #504 segmentami port→port;
- geometria: `frontend/src/ui/sld/v3/cad/CadSymbol.tsx` + `cadSymbolRegistry.ts` zasilane geometrią z importera QET (#499) i `CadPrimitiveLayer` (#500) — obecne glify `v3/symbols/glyphs.tsx` i rejestr CAD nie są QET;
- render i ramka: `frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx`;
- blokady: `backend/src/enm/interlock_rules.py` rozszerzony do oceny topologii wynikowej.

## 12. Czego nie sprawdziłem

- Nie uruchamiałem testów (vitest/pytest) żadnego PR — zielone/czerwone nieznane.
- Nie porównałem geometrii QET z .elmt 1:1 (tylko nagłówki i ścieżki).
- Nie czytałem w całości `qetAdmissionGate.ts`, `SldSymbolLibraryAtlas.tsx`, `qet-scada-frame-review-main.tsx`, e2e specs #500, `build_qet_nn_atlas.py`.
- Nie sprawdziłem PR #493/#486 (rysunki ENEA Z.x) ani czy Z.2/Z.7/Z.10–Z.12/Z.17 są w repo.
- Nie sprawdziłem eksportu PDF/SVG pod kątem atrybucji CC BY.
- Nie potwierdziłem lokalizacji `ELEMENT_POLA_SN` i szablonów "Z.2, Z.4–Z.17" w kodzie UI/UX (grep = 0 w `backend/src`).
- Konflikty scalenia #504 z gałęzią UI/UX nie były mierzone (`git merge-tree` nie uruchomiony).

## Rozbieżności stanu repozytorium z rysunkami ENEA (sesja główna, 2026-10-28)

Podstawa: `docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`.

| # | Miejsce w repo | Stan | ENEA | Decyzja architekta |
|---|---|---|---|---|
| E-1 | `backend/src/network_model/catalog/bay_templates.py:103-116` (gałąź UI/UX), szablon pola liniowego | Q1 odłącznik szynowy → Q0 wyłącznik → T1 CT → Q2 odłącznik liniowy → Q9 uziemnik (GROUND_BRANCH) → głowica | Z.10 (s.89): łącznik trójpołożeniowy szynowy (zamknięty / odłączony / uziemiony, uziemia stronę wyłącznika) → wyłącznik z napędem M → CT 1 rdzeń 200-400/5 5P20 → pojemnościowy wskaźnik napięcia → głowica → przekładnik Ferrantiego 1/100 na kablu; brak odłącznika liniowego i osobnego uziemnika od strony kabla; kabel uziemia się przez zamknięty wyłącznik (§13, druk s.25) | wariant podstawowy szablonu = Z.10 (rozdzielnica w izolacji SF6, §13); wariant AIS (§13: „w uzasadnionych przypadkach”, wyłącznik wysuwny albo stały z odłącznikiem szynowym, uziemniki stałe na wyprowadzeniach) jako jawny wariant z odesłaniem do §13 |
| E-2 | sprzęgło (`gpz.ts:864` `symbolSprzegla`, #504 sztywne `lineBreaker`) | jeden symbol wyłącznika między sekcjami | Z.12 (s.92): łącznik trójpołożeniowy A → wyłącznik M → CT 1000/5/5 (2 rdzenie) → łącznik trójpołożeniowy B, ze wskaźnikami napięcia po obu stronach; Z.2: pola 1 i 2 w jednej ramce | dwie celki (łącznik szyn + wznios) wg przekazania §2 i §13, jeden ciągły tor A/B |
| E-3 | pole pomiaru napięcia | VT jako gniazdo / wskaźnik w polu (stan sprzed przekazania) | Z.17 (s.97): łącznik trójpołożeniowy → wskaźnik → VT wprost przez głowicę, bez wyłącznika, bezpieczniki tylko po stronie wtórnej; jedno pole na sekcję (§13) | osobne pole Z.17 na sekcję (karta POLA-TR-POMIAR-SPRZEGLO) |
| E-4 | pole TR strona SN | — | Z.7 (s.86): wyłącznik → węzeł odgałęzienia VT (odłącznik z uziemieniem) → CT 4 rdzenie → wskaźnik → głowica → kabel; ogranicznik przy zaciskach transformatora, poza celką | karta POLA-TR-POMIAR-SPRZEGLO |

## 13. Wykonanie karty UX-04/POLE-LINIOWE-WZORZEC (2026-10-28) — co wciągnięto, co odrzucono

Kod materiału GPT nie był scalany ani kopiowany: każdy wciągnięty element powstał na gałęzi
karty od nowa, z testem iloczynu cech i wstrzykniętą regresją. Dokument karty:
`docs/uiux/UX04_POLE_LINIOWE_WZORZEC.md` (macierze Z.10 / Z.11.1 / Z.11 → ENM → QET → zrzut).

| Element materiału | Decyzja | Realizacja w karcie |
|---|---|---|
| #499 potok vendor QET (licencja, README, manifest z SHA bloba) | WCIĄGNIĘTE jako wzorzec | `docs/sld/vendor/qet/` z 12 elementami EN 60617 / 450_high_voltage pola SN (w tym przekładnik napięciowy `en_60617_06_13_01A` z jawnie zadeklarowanym zaciskiem wtórnym poza torem) (commit `14a4727f…`), importer `scripts/import_qet_pole_sn.py` (deterministyczny, fail-closed na DTD, nieznany element, tekst bez decyzji, ścieżkę poza katalogiem, styl kreski, port poza rastrem), test w głównym pytest (`backend/tests/ci/test_qet_pole_sn_import.py`) — bez nowego workflow CI; 7 plików nN z #499 nie są potrzebne polu SN i nie weszły |
| #499 atrybucja tylko w repo | POPRAWIONE | atrybucja CC BY 3.0 w legendzie (panel i eksport), w tabliczce rysunkowej eksportu (wiersz „Symbole") i w oknie pola — jeden tekst `sheet/projectLegend.ts::ATRYBUCJA_SYMBOLI_QET_PL` |
| #500 `CadPrimitiveLayer` | WCIĄGNIĘTE | `frontend/src/ui/sld/v3/cad/CadSymbol.tsx` — ten sam rysunek prymitywów co `CadSymbol` |
| #500 warianty zamknięte autorskie | ODRZUCONE | położenie noża wyprowadzone REGUŁĄ z geometrii `.elmt` (obrót noża na styk stały; łącznik trójpołożeniowy: zamknięty i uziemiony w przeciwnych kierunkach), test `test_noz_zamyka_na_styk_staly_a_trojpolozeniowy_ma_polozenie_uziemione` |
| #500 ramka z wypełnieniem, tylko korpus, znikanie symbolu | ODRZUCONE | ramka = obrys całego symbolu (`fill="none"`), stan nieznany — bez ramki, symbol zostaje, podpis „stan nieznany" (`symbols/__tests__/qetRamkaScada.test.tsx`, iloczyn symbol × stan × motyw) |
| #500 `scadaFrameState` (7 typów), katalog „73", rejestr odbioru w localStorage | ODRZUCONE | jedno mapowanie położenia rekordu ENM → ramka; jeden rejestr symboli (`symbols/defs.ts`); odbiór wyłącznie B-02 |
| #502 reguła CT w torze, VT/ES poza torem; R6 §4 pkt 2 (porty zamiast `linked_ref`) | WCIĄGNIĘTE do modelu | jawne porty aparatu w ENM (`BayPrimaryDevice.ports`, węzły pola), kolejność toru z obchodu portów (`apparatusSequence.ts::torPolaZPortow`), brak portu = `gpz.bay.port.missing` i brak przewodu |
| #502 `BayWindowSchematic` (wersja GPT) | ODRZUCONE | ponadto skasowano wersję z gałęzi głównej (ta sama klasa: druga ścieżka rysunku pola, kolor stanu odwrotny do SCADA, stan nieznany jak zamknięty); okno pola pokazuje wycinek sceny kanwy (`ui/field/SchematPolaSn.tsx`, `sld/v3/scene/kadrPola.ts`) |
| #502 walidator kompozycji we froncie (`bayPrimaryComposition.ts`) | ODRZUCONE | braki przyłączy liczy kompozycja z portów modelu; walidacja wyposażenia — backend (`wyposazenie_pola.py::_sprawdz_aparat`) |
| #504 przewody port → port, `missingData` braków portów, notatki stopu | WCIĄGNIĘTE | `compose/gpz.ts::buildFieldStack` (`przewodyZPortow`) i `scene/buildScene.ts` |
| #504 ramka na `SldCanvasV3` rozpoznawana z prefiksów `parityKeys` | POPRAWIONE | predykat „łącznik pola" z lustra backendu (`compose/rodzajeAparatuPola.ts::czyLacznikPola` ⇔ `RODZAJE_LACZNIKOW_POLA`), każdy rodzaj łącznika dostaje ramkę (parytet `backend/tests/ci/test_parytet_rodzajow_aparatu_pola.py`) |
| #504 `switchingSequenceValidator` (stała odmowa) | ODRZUCONE | klik = wybór, przełączenie osobną akcją menu (`open_switch` / `close_switch`); walidacja na topologii wynikowej — karta UX-04/LOGIKA-LACZENIOWA |

Rozbieżność E-1 (§ „Rozbieżności stanu repozytorium z rysunkami ENEA") — zamknięta kodem
i skorygowana rozszerzeniami karty: pola liniowe GPZ tworzone z GPZ i przydziałem odejścia
dostają szablon Z.10 z PIERWSZYM wykonaniem łączników dopuszczonym w izolacji rodziny
rozdzielnicy (łącznik trójpołożeniowy; w izolacji powietrznej — wyłącznik stały z odłącznikiem
szynowym), BEZ gazów fluorowanych. Dawny wariant „SF6 domyślny" i „AIS jawny" (zapis tej sekcji
sprzed rozszerzenia 3) jest nieaktualny: wykonanie łączników jest osią szablonu, a izolacja
i medium — wyłącznie cechą rodziny rozdzielnicy. Szablon RMU `bay_template_line_out` zostaje dla
stacji SN/nN (standard Z.10 ich nie obejmuje).

### 13.1. Rozbieżności i decyzje rozszerzeń karty

| # | Miejsce | Stan przed | Podstawa | Decyzja i realizacja |
|---|---|---|---|---|
| E-5 | `backend/src/network_model/catalog/bay_templates.py` (szablon pola liniowego GPZ), `Bay.protection_codes` | dotychczasowy wzorzec nie rozróżniał klas pola: jeden zestaw funkcji EAZ z rysunku Z.10 dla każdego pola liniowego, bez względu na to, czy za polem jest generacja | IRiESD ENEA Operator (wersja 2.3) II.4.5.4.2.1–2.3, II.4.5.4.7.1 | `Bay.klasa_pola` (ODBIORCZE / MIESZANE / DEDYKOWANE_WYTWORCY), wymagania funkcji wg klasy (`WYMAGANIA_EAZ_KLASY_POLA`), klasa z generacją wyłącznie w Z.11.1 / Z.11 (`W052`), ocena pola z kontraktem werdyktu (`enm/pole_liniowe_gpz.py`, `W053`–`W057`); tabela klas: `GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md` |
| E-6 | rysunek Z.10 (s.89) a IRiESD | Z.10 nie wymienia zabezpieczenia podczęstotliwościowego | IRiESD II.4.5.4.2.1 pkt 5: pole odbiorcze — podczęstotliwościowe z blokadą zależną od kierunku przepływu mocy | klasa odbiorcza dopisuje 81U za 67N (`_KODY_DOPISYWANE_KLASY`); rysunek pozostaje odczytany bez zmian |
| E-7 | Zeszyt 1 §26.9.3 i rysunki Z.11 / Z.11.1 a IRiESD | rysunki wymieniają SCO w polach z przekładnikiem napięciowym od strony linii | IRiESD II.4.5.4.7.1 pkt 1: SCO nie uruchamia się w liniach z jednostkami wytwórczymi | IRiESD ma pierwszeństwo (warunki przyłączenia OSD); klasy MIESZANE i DEDYKOWANE usuwają SCO i SPZ/SCO z zestawu (`ZAKAZANA`), obecność → `NIE_SPELNIA`, walidator `W055`; klasa ODBIORCZE w Z.11.1 / Z.11 zachowuje SCO z rysunku |
| E-8 | pole dedykowane wytwórcy | IRiESD II.4.5.4.2.3 nie wymienia SPZ ani blokady kierunkowej | lista funkcji II.4.5.4.2.3 | rozstrzygnięcie sesji głównej (rozszerzenie 2): SPZ i SPZE w polu dedykowanym są niezgodnością (`ZAKAZANA`, `W056`), blokada kierunkowa 67 pomijana |
| E-9 | funkcje „na żądanie OSD" | — | IRiESD II.4.5.4.2.2 pkt 5–8, II.4.5.4.2.3 pkt 4–6 | nigdy `SPELNIA`: obecna → `BRAK_DOWODU`, nieobecna → `NIEJEDNOZNACZNY` (model nie niesie warunków przyłączenia) |
| E-10 | tryb pracy pola | rozszerzenie 2 opisuje osobno klasę pola i tryb „linia SN z generacją" | katalog sygnałów ENEA, sekcja „Linia SN z generacją" | jeden atrybut: tryb z generacją = klasa MIESZANE albo DEDYKOWANE_WYTWORCY (dwa atrybuty o tej samej treści byłyby dwiema prawdami); wykonanie pola wyprowadzone z szablonu (`BayTemplate.wykonanie_pola`), nie osobne pole modelu |
| E-11 | rodziny rozdzielnic i katalog aparatów | izolacja i medium łączników mieszane w jednym słowniku (`InsulationType` z wartością `vacuum`, `GIS_SF6`), `gaz_fluorowany` deklarowany ręcznie | rozporządzenie (UE) 2024/573 art. 13 ust. 9; ENEA Zeszyt 1 §13 | dwie osie: izolacja rodziny (`InsulationType`: air, ssis, gaz_bez_f, sf6, unknown) i medium łączników rodziny (`MediumLacznikowRodziny`: SF6, PROZNIA, POWIETRZE, KATALOG_APARATOW — medium sprawdzane przy aparacie); `SwitchgearFamily.gaz_fluorowany` WYLICZANE; medium aparatu w `MVApparatusType.medium` |
| E-12 | silnik referencyjny pola (`reference_engine/compliance.py`) | kontrola profilu `line_breaker` liczyła kolejność i grupy na WSZYSTKICH aparatach pola (odgałęzienie przekładnika napięciowego Z.11 / Z.11.1 łamało kolejność) i nie znała wyłącznika wysuwnego (brak łącznika szynowego = brak odłączenia) | ENEA Zeszyt 1 §13 (odłączenie przez wysunięcie wyłącznika) | tor główny z predykatu `aparaty_poza_torem_glownym` (ten sam co ocena kolejności), zakazane na wszystkich aparatach; grupa odłączenia spełniona wysunięciem przy szablonie wysuwnym (`grupy_spelniane_wysunieciem`); iniekcje: wyłączenie wysunięcia → 5 czerwonych, tor = wszystkie aparaty → 13 czerwonych |
| E-13 | wyrocznia frontowa profili (`frontend/src/ui/sld/reference/referenceProfiles.ts::profileViolationsForKinds`) | ocenia listę rodzajów bez szablonu i bez portów; konsumenci wyłącznie testowi | — | świadomie bez wysunięcia i bez odgałęzienia: funkcja nie zna szablonu pola, a ocena pola w produkcie idzie z backendu; lustro niesie pole profilu (parytet paczek bajtowy) |
| E-14 | kompozycja odgałęzień (`frontend/src/ui/sld/v3/compose/apparatusSequence.ts`, `ulozPasyBoczne`) | odczep pasa bocznego mógł przeciąć pas postawiony wcześniej na niższym węźle | czytelność rysunku (V12K-335) | odczep stawianego pasa nie przecina pasów już postawionych — pas sięgający wysokości odczepu odsuwa się w prawo; iniekcja → 2 czerwone |
| E-15 | pole GPZ bez szablonu i bez aparatu (`add_grid_source_sn`) | pole dostawało funkcje EAZ roli, choć nie ma czym wyłączyć | — | funkcje EAZ wyłącznie w polu z aparatem albo szablonem; iloczyn {z aparatem, bez} × sekcje {1, 2}, iniekcja → 2 czerwone; fikstura `sldSubstrate52s` z generatora |
| E-16 | przekładnik napięciowy odgałęzienia na kanwie | rysowany symbolem kanonicznym (biblioteka QET pola nie miała przekładnika napięciowego) | EN 60617-06-13-01 | element QET `en_60617_06_13_01A` (blob `a883a2e6…`), symbol `qetVoltageTransformer`, zacisk wtórny jawnie poza torem z powodem (`zaciskiPozaTorem`); importer odrzuca zacisk bez przypisania, wpis bez powodu i zacisk spoza źródła (3 iniekcje) |
| E-17 | menu kontekstowe obiektu na kanwie (`frontend/src/ui/sld/v3/canvas/SldCanvasV3Workspace.tsx::handleContextMenuAction`) | prawy klik otwierał menu bez zaznaczenia: akcja „Otwórz kartę pola” wykonana z menu kabla zostawiała w inspektorze poprzednio zaznaczony obiekt (zrzut roboczy pokazywał kabel zamiast pola) — defekt produktu, nie specyfikacji | jedna prawda zaznaczenia (klik zaznacza, inspektor pokazuje zaznaczony obiekt) | akcja menu obiektu zaznacza obiekt tą samą drogą co lewy klik (`handleElementClick`, przez referencję z klasy obiektu menu), menu tła nie zaznacza; inwentarz klasy: menu obiektów kanwy v3 — naprawione; portal nN (`LvDomainPortal`) ma własne zaznaczenie widoku, nie inspektor powłoki — bez zmiany; drzewo kontekstu i listy przypadków nie są obiektami kanwy; test iloczynu `menuObiektuZaznacza.test.tsx` (obiekt {kabel, stacja} × akcja {nawigacja, budowa} × menu {obiektu, tła} × tryb {zwykły, paleta źródeł}) |
| E-18 | katalog aparatów SN: rozłączniki NAL — `sw-ls-abb-nal-{12,24}kv-{400,630}a` (4 rekordy, ZWERYFIKOWANY, źródło ABB 1VCL100001) i `sw-ls-zpue-nal-{12,24}kv-630a` (2 rekordy, NIEWERYFIKOWANY) | rekordy mają medium `SF6`, a literatura producenta opisuje NAL jako rozłącznik powietrzny | karta katalogowa producenta | ROZBIEŻNOŚĆ DANYCH — nie zmieniono rekordu bez karty źródłowej (zmiana medium zmienia dopuszczenie do nowych pól); skutek dziś: pozycja jest wykluczona z kandydatów doboru aparatu pola SN (`kandydaci_aparatow_pola_sn`, zakaz gazów fluorowanych w nowych polach). Do weryfikacji z kartą 1VCL100001 przez właściciela danych katalogu |
| E-19 | kandydaci doboru aparatu pola źródłowego SN (`backend/src/application/analyses/dobor_toru_der_sn.py::kandydaci_aparatow_pola_sn`) | dobór proponował łączniki z SF₆ dla pola, które powstaje jako projektowane | rozporządzenie (UE) 2024/573, art. 13 ust. 9 | ten sam predykat co pickery i strażnik operacji (`czy_medium_z_gazem_fluorowanym`), test na całym zbiorze kandydatów (żaden kandydat nie niesie gazu fluorowanego) |
| E-20 | ocena funkcji EAZ pola (`backend/src/enm/pole_liniowe_gpz.py::OcenaFunkcjiPola`) i karta pola (`frontend/src/ui/field/OcenaPolaLiniowegoGpz.tsx`) | rekord niósł status i przyczynę w polach płaskich, a karta tłumaczyła status własną mapą „status → tekst” | kontrakt werdyktu wyjaśnialnego §5 i §9 (`werdykt_wyjasnialny_guard`) | rekord niesie `WyjasnienieWerdyktu` (zdanie, przyczyna, czego brakuje, zastrzeżenie niepełnego dowodu) i `Etykieta` ze słownika §9 poziomu kryterium (`werdykt.etykiety.etykieta`); karta wyświetla etykietę i semantykę z rekordu, mapa frontu usunięta |

### 13.2. Inwentarz gazów fluorowanych (pomiar 2026-10-28 na drzewie karty)

- **Rodziny rozdzielnic z gazem fluorowanym (8 z 21):** `ABB__SAFEPLUS`, `ABB__SAFERING`,
  `ABB__UNISEC`, `SCHNEIDER__RM6`, `SCHNEIDER__SM6_24`, `SIEMENS__8DJH`,
  `ZPUE_WLOSZCZOWA__ROTOBLOK`, `ZPUE_WLOSZCZOWA__TPM` — zostają w katalogu dla obiektów
  istniejących (art. 13 ust. 7 i 10); dla obiektu projektowanego są niewybieralne z powodem
  (pickery z pól backendu). Bez gazu fluorowanego: 13 rodzin, w tym nowe rodziny ogólne OSD
  dla GPZ `TYP_OGOLNY_OSD__GPZ_AIS`, `TYP_OGOLNY_OSD__GPZ_SSIS`, `TYP_OGOLNY_OSD__GPZ_GAZ_BEZ_F`.
- **Katalog aparatów SN (52 pozycje, z czego 13 z gazem fluorowanym):** wyłączniki SF6 4,
  próżniowe 16, bez medium 1; rozłączniki SF6 9, próżniowe 2; reklozery próżniowe 4; odłączniki
  powietrzne 6, bez medium 1; rozłączniki bezpiecznikowe 7 i uziemniki 2 bez medium. Katalog
  łączników gałęzi niesie te same pozycje (52, 13 z gazem fluorowanym).
- **Repozytorium:** wzmianki SF6 w kodzie produkcyjnym backendu (15 plików: `network_model` 9,
  `enm` 3, `application` 2, `domain` 1) i frontendu (8 plików: `ui` 6, `ui2` 2) to opis medium
  katalogu, reguła zakazu i jej komunikaty — żaden tor tworzenia nie wybiera już rodziny ani
  aparatu z SF6 domyślnie. Specy e2e budujące nowe stacje przeszły na wykonania bez gazów
  fluorowanych (Rotoblok Air, Schneider RM AirSeT); cztery z nich niosą przy wyborze rodziny
  komentarz z powodem migracji. Szablon pola nie niesie medium (oś łączników), więc żaden z 9 szablonów GPZ nie
  zawiera SF6.
