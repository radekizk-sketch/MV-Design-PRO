# SLD nN — RAPORT R2: JĘZYK CAD I SYMBOLIKA NORMATYWNA (2026-09-02)

**Kontekst:** odrzucenie B-02 R2 przez właściciela (ocena 5/10: topologia 8,5 · architektura
9 · symbolika 3,5 · język CAD 3 · czytelność gęsta 4 · polska praktyka SLD 4). Mandat:
zachować architekturę ENM → LvDomainProjectionV1 → renderer, energizację, wyspy,
pochodzenie; ODRZUCIĆ warstwę graficzną i przebudować SYSTEM SYMBOLI, geometrię CAD,
gramatykę pól, typografię, układ gęsty i jakość druku (§1, §26). „Najpierw zaprojektuj i
zatwierdź pełny CAD SYMBOL REFERENCE PACK. Dopiero potem migruj renderer" (§27).

**Uczciwość (zasada nadrzędna):** ten raport NIE wystawia werdyktu B-02 i NIE deklaruje
„Gate E = PASS". Testy, kadry i iteracje są dowodem wykonania, nie jakości wizualnej —
werdykt wizualny należy do właściciela. Samoocena bramek §25 poniżej jest opinią
wykonawcy, podana osobno dla każdej bramki, bez uśredniania.

Gałąź: `codex/b02-lv-domain-projection-v1` (commity lokalne, bez push — zgodnie z
zasadą „nie wykonuj push bez wyraźnej zgody").

---

## 1. Co zbudowano (mapa § mandatu → artefakt)

| § | Wymaganie | Artefakt / dowód |
|---|---|---|
| §2 | rejestr normatywny z polami i statusami weryfikacji | `docs/sld/SLD_SYMBOL_NORMATIVE_REGISTRY.md` — 18 symboli, pola domain_type / symbol_role / IEC_reference / polish_name / project_designation / graphic_variant / open_variant / closed_variant / notes / verification_status; **0 × NORMATIVE_VERIFIED, 16 × ENGINEERING_REVIEWED, 2 × DRAFT** (uziemnik, zabezpieczenie) |
| §3 | zero ikon aplikacji w L2 | `cad/cadSymbolRegistry.ts`: prymitywy WYŁĄCZNIE line / circle / arc / path / pivot (+ litera G maszyny); test: brak `<image>`, `<foreignObject>`, `<use>` w każdym symbolu |
| §4 | wyłącznik od zera, stan z geometrii | `cad.wylacznik`: styk + nóż na przegubie + „×" na końcówce noża; OPEN +30°, UNKNOWN +15° + kreska przerywana; test: liczba wypełnień identyczna w każdym stanie |
| §5 | rozróżnienie wyłącznik / rozłącznik / odłącznik / rozłącznik bezpiecznikowy / uziemnik | pięć symboli z kwalifikatorami IEC (×, poprzeczka, poprzeczka + okrąg, wkładka jako nóż, uziemienie); kadr `13_loads_via_fields` pokazuje pięć rodzin obok siebie |
| §6 | sprzęgło z realnej konfiguracji ENM | `bus_coupler × device_kind` → symbol realnego aparatu w orientacji poziomej (02: wyłącznik OTWARTY, 03: rozłącznik ZAMKNIĘTY); bez klasy → łącznik ogólny + **NN-AUD-18** (06); nic nie jest dorysowywane |
| §7 | wkładka ≠ rozłącznik bezpiecznikowy | `cad.bezpiecznik` (S00362) vs `cad.rozlacznikBezpiecznikowy` (S00370: wkładka jako nóż); scenariusz 13 QS-05 = `switch + ROZLACZNIK_BEZPIECZNIKOWY` |
| §8 | transformator: dwa uzwojenia, cienka kreska, hv/lv, tabliczka tekstem | `cad.transformator2u` 16×28 u; tabliczka Sn / przekładnia / grupa / uk tekstem obok; rozmiar stały (nie koduje mocy) |
| §9 | CT ≠ VT, dane tekstem | `cad.przekladnikPradowy` (okrąg NA torze, 2 zaciski) vs `cad.przekladnikNapieciowy` (odgałęzienie, 1 zacisk); kontrakt: `accuracy_class`, `burden_va`, `ct_cores`, `ct_arrangement` → tabliczka obok (wiersz pomijany, gdy model nie niesie) |
| §10/§11 | PV = technologia, INV = element; BESS = bateria + PCS | złożenia `cad.zrodloPvZPrzeksztaltnikiem` (S00908 + S00896) i `cad.magazynZPrzeksztaltnikiem` (S01342 + S00897) jednego elementu ENM; opis: nazwa · moc · technologia · zdolność; tor aparat → kabel → CT → źródło z realnych elementów (12) |
| §12 | odbiór | `cad.odplywOdbior` (S00104); Load ENM nie ma typu odbiornika — zarejestrowane |
| §13 | hierarchia grubości | BUS 3,0 / PRIMARY 1,6 / symbol 1,4 / SECONDARY 1,0 / HIGHLIGHT 6 px, kreska nieskalowana (`vector-effect`), test hierarchii |
| §14 | zakaz wypełnienia jako stanu | test rejestru: liczba `fill: ink` identyczna dla closed/open/unknown; e2e: zero `fill` w symbolu sprzęgła |
| §15 | gramatyka pól z ENM | bez zmian architektury: BUS → aparat → CT → kabel → odbiór / źródło z `graph.devices[]`; incomer: SN → TR → zacisk → CT → QF → BUS |
| §16 | siatka CAD, kotwice | każdy symbol: `anchors.{top,bottom,left,right,center}`, `terminals` na krawędzi gabarytu na siatce 1 u (test) |
| §17 | typografia | `zawinNazwe` bez łamania wyrazów (≤ 2 wiersze + „…", pełna nazwa w podpowiedzi i panelu); `MIN_FIELD_WIDTH_PX = {LOD2: 96, LOD1: 72, LOD0: 40}`; scena poza kadrem → przewijanie (`data-scroll`), zakaz pomniejszania; etykiety aparatów zawsze poziome, tryb pionowy usunięty |
| §18 | terminologia polska | nazwy z rejestru CAD (WYŁĄCZNIK, ROZŁĄCZNIK, ODŁĄCZNIK, BEZPIECZNIK, ŁĄCZNIK SZYN, PRZEKŁADNIK PRĄDOWY/NAPIĘCIOWY, TRANSFORMATOR, FALOWNIK, MAGAZYN ENERGII, ODBIÓR) w podpowiedziach, panelu odpływu („Aparat pola") i trybie audytu; QF/QS/FU/QBC/CT/VT = identyfikatory |
| §19 | ElectricalCadSymbolRegistry | `symbolId, domainType, functionalClass, standardReference, verificationStatus, nominalWidth/Height, terminals, anchors, body/states, minimumSizePx, lodPolicy` |
| §20 | symbol CAD ≠ piktogram | L2 renderuje wyłącznie `CadSymbol`; biblioteka `symbols/glyphs.tsx` nie jest już importowana przez `lv-domain/` |
| §21 | reference pack 18 symboli | `docs/sld/SLD_CAD_SYMBOL_REFERENCE_PACK_R2.md` + `docs/audit/visual/cad/pakiet_{dark,light,mono}.png` (obecny → proponowany, stany) |
| §22 | test rozpoznawalności bez etykiet | `docs/audit/visual/cad/rozpoznanie_mono.png` (24 pozycje, klucz w pakiecie §6) |
| §23 | test mono | `pakiet_mono.png`, `20_print_a3.png`; renderer symbolu nie ma ścieżki „kolor stanu" |
| §24 | polska stacja 15/0,4 kV na A3 poziomo | `20_print_a3.png` (stacja dwutransformatorowa ze sprzęgłem, 1587×1123, mono) |
| §26 | zachowane | ENM, `LvDomainProjectionV1` (pola addytywne, wersja 3.0.0), energizacja, wyspy, wspólna kotwica SN, świeżość, pochodzenie, nakładki — nietknięte (backend: 179 testów projekcji zielone) |

## 2. Zmiany w kontrakcie (addytywne, `exclude_none`, wersja bez zmiany)

- `graph.branches[].device_kind`, `graph.devices[].device_kind` — klasa funkcjonalna wyrobu
  z `materialized_params.device_kind` (`None` = katalog nie klasyfikuje).
- `graph.measurements[].{accuracy_class, burden_va, ct_cores, ct_arrangement}`.
- `NN-AUD-18` (INFO): sprzęgło bez klasy funkcjonalnej aparatu. `AUDIT_CODES` = 01…18.
- Scenariusze: sprzęgło 02 = WYLACZNIK, 03 = ROZLACZNIK, 06 = brak klasy; 13 dostaje
  QS-05 (rozłącznik bezpiecznikowy = `switch` + `ROZLACZNIK_BEZPIECZNIKOWY`, jak w
  operacjach ENM). Fixtury JSON zregenerowane z backendu (`model_hash`/`projection_hash`
  zmienione tam, gdzie zmienił się model — 02/03/06/13; pozostałe tylko pola addytywne).

## 3. Weryfikacja (stan na zamknięcie raportu)

| Warstwa | Zakres | Wynik |
|---|---|---|
| backend | `tests/application/analyses/lv_domain` + API projekcji | 179 passed |
| backend | pełna regresja `pytest -q` (kod wyjścia łapany bezpośrednio) | 10 513 passed, 11 skipped, 0 failed (7 min 26 s) |
| frontend | `lv-domain` + `cad` + portal (11 plików) | 272 passed |
| frontend | pełna regresja `vitest run --no-file-parallelism` (kod wyjścia łapany bezpośrednio) | 887 plików passed; 11 969 passed, 1 skipped, 14 todo, 0 failed |
| frontend | `tsc --noEmit`, `eslint` (zmienione pliki) | 0 błędów |
| e2e | `lv-domain-screenshot.spec.ts` (20 kadrów) + `sld-symbol-pack-screenshot.spec.ts` (4 kadry) | 22 passed |
| guardy | 22 skrypty (`no_codenames`, `forbidden_ui_terms`, `ui_terminology`, `dead_click`, `dialog_completeness`, `local_truth`, `docs`, `arch`, `repo_hygiene`, `ui_no_physics`, `overlay_no_physics`, `sld_determinism`, `trace_ui_leak`, `utf8_mojibake`, `physics_label`, `test_no_codenames`, `docs_archive`, `catalog_binding`, `canonical_ops`, `readiness_codes`, `audit_contract`, `solver_boundary`) | wszystkie EXIT 0 |

## 4. Samoocena bramek §25 (osobno, bez uśredniania; opinia wykonawcy — nie werdykt)

| Bramka | Samoocena | Uzasadnienie i co jeszcze brakuje |
|---|---|---|
| CAD LANGUAGE | 8/10 | symbole z linii/łuków/okręgów, kreska nieskalowana, hierarchia grubości, siatka kotwic; brakuje: potwierdzenia geometrii z bazą IEC, wyrównania numeracji odpływów na szynie (kolejność `ref_id`) |
| NORMATIVE SYMBOL DISCIPLINE | 7/10 | identyfikatory S00xxx z oficjalnego wykazu, uczciwe statusy; **żaden symbol nie jest NORMATIVE_VERIFIED** — bramka nie może być ≥ 9 bez porównania z bazą IEC 60617 (działanie właściciela/licencja) |
| POLISH ENGINEERING PRACTICE | 7/10 | nazwy polskie, QF/QS/FU jako identyfikatory, znaki I>/I0>/df/dt w prostokącie zabezpieczenia, sprzęgło z realnego aparatu; brakuje: potwierdzenia konwencji przez właściciela (pytania §9 pakietu), odbiorników jawnych (ENM Load bez typu) |
| SYMBOL RECOGNITION | 8/10 | tablica §22: wyłącznik / odłącznik / rozłącznik / wkładka / rozłącznik bezpiecznikowy / CT / VT / TR / uziemnik rozróżnialne; słabość: zamknięty łącznik ogólny = kreska (uczciwy obraz braku danych, §5 pkt 4 pakietu) |
| DENSE READABILITY | 8/10 | 12 odpływów przy 96 px na pole, etykiety poziome jednowierszowe, nazwy ≤ 2 wiersze bez łamania, przewijanie zamiast ściskania; brakuje: minimapy/nawigacji przewijania w portalu (poza zakresem R2) |
| MONOCHROME | 9/10 | stan tylko z geometrii; jeden tusz na tablicy i A3; kolor jest wyłącznie drugim kanałem |
| PRINT A3 | 7/10 | kadr A3 mono z symbolami CAD; brakuje: ramki rysunkowej/tabliczki rysunkowej i legendy symboli na arkuszu (nie było w mandacie R2, ale należy do dokumentacji A3) |

Żadna bramka nie jest deklarowana jako PASS. Werdykt wystawia właściciel po oględzinach
pakietu (`docs/audit/visual/cad/`) i kadrów (`docs/audit/visual/nn/`).

## 5. Pytania do właściciela (bramka zatwierdzenia pakietu — z pakietu §9)

a. strona odchylenia noża (w prawo — przyjęte); b. „×" na końcówce noża (przyjęte, IEC);
c. zamknięty łącznik ogólny jako kreska + NN-AUD-18 INFO, czy wymusić klasę sprzęgła w
modelu (BLOCKER); d. znaki IEC w prostokącie zabezpieczenia (przyjęte) czy tylko tekst
obok; e. VT z otwartym wyprowadzeniem wtórnym; f. złożenia PV/BESS jednego elementu ENM.

## 6. Ograniczenia zarejestrowane (nie ukryte)

1. **0 × NORMATIVE_VERIFIED** — geometria wg konwencji IEC z przeglądu inżynierskiego;
   porównanie z grafiką bazy IEC 60617 wymaga dostępu licencyjnego. Do tego czasu zakaz
   sformułowań „zgodny z PN-EN/IEC" w UI i eksportach (rejestr §2).
2. Uziemnik i zabezpieczenie = DRAFT (brak elementu ENM / brak glifu IEC w wykazie).
3. Kolejność odpływów na szynie wynika z `ref_id` (FU-04 przed QF-01) — z modelu, nie z
   numeracji; zmiana wymaga decyzji o kluczu porządkowania (numer w oznaczeniu?).
4. Load ENM bez typu odbiornika — jeden symbol odpływu (S00104); jawne odbiorniki po
   rozszerzeniu ENM.
5. Katalog `mv_auxiliary_catalog.py` nie ma rodzaju „sprzęgło" — realne sprzęgła niosą
   klasę z pozycji aparatu (WYLACZNIK_*/ROZLACZNIK); scenariusz 06 świadomie bez klasy.

## 7. Pliki

Nowe: `frontend/src/ui/sld/v3/cad/{cadSymbolRegistry.ts, CadSymbol.tsx,
__tests__/cadSymbolRegistry.test.tsx (+snapshot)}`, `frontend/sld-symbol-pack-harness.html`,
`frontend/src/sld-symbol-pack-harness-main.tsx`, `frontend/e2e/sld-symbol-pack-screenshot.spec.ts`,
`docs/sld/SLD_SYMBOL_NORMATIVE_REGISTRY.md`, `docs/sld/SLD_CAD_SYMBOL_REFERENCE_PACK_R2.md`,
`docs/audit/visual/cad/*.png`, ten raport.
Zmienione: `lv-domain/{symbolRegistry.ts, visualGrammar.ts, composeLvDomainScene.ts,
LvDomainView.tsx, types.ts}` + testy `lv-domain/__tests__/*`, fixtury `fixtures/generated/*.json`,
`e2e/lv-domain-screenshot.spec.ts`, backend `lv_domain/{graph_view.py, audit.py}` +
`tests/application/analyses/lv_domain/{scenariusze_nn.py, test_audit.py}`,
`docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`, `docs/INDEX.md`, `docs/audit/visual/nn/*.png`.

---

## 8. Addendum R2.1 — symbole ze schematu referencyjnego właściciela (2026-09-02)

Polecenie właściciela: „Przyjmij symbole ze schematu z załącznika" (`Schemat nn.pdf` —
schemat ideowy zasilania instalacji PV 149,5 kWp, A2, notacja IEC 60617 / IEC 81346).
Wykonanie: schemat odczytany WEKTOROWO (dump ścieżek strony PDF; strona nie ma bitmap ani
tekstu do ekstrakcji), pomiary w pakiecie §12, rejestr CAD przepisany do tych proporcji.

### 8.1 Co zmieniono w geometrii (rejestr 1.0 → 1.1)

| Symbol | Rejestr 1.0 (R2) | Rejestr 1.1 (R2.1, pierwowzór) |
|---|---|---|
| nóż każdego łącznika | 10 u, otwarty +30° w PRAWO | 11,5 u, otwarty −30° w GÓRĘ-LEWO, końcówka na wysokości styku stałego |
| wyłącznik mocy | „×" na końcówce noża, obracany | „×" 4 u NIERUCHOMY na końcu przewodu styku stałego, w osi |
| wyłącznik instalacyjny | brak (jeden symbol dla każdego breakera) | NOWY `cad.wylacznikInstalacyjny`: nóż bez „×" + wyzwalacz termiczny („hak") i elektromagnetyczny (strzałka) obracane z nożem |
| rozłącznik | poprzeczka + okrąg NA PRZEGUBIE | poprzeczka + okrąg r = 1,4 u ZAWIESZONY POD poprzeczką styku stałego |
| rozłącznik bezpiecznikowy | wkładka jako cały nóż od przegubu w połowie, +30° | przegub u dołu (8, 20), nóż 17 u, wkładka 4,4×9 u na dolnej części noża, poprzeczka + okrąg u góry, −20° |
| przekształtnik | DC u góry, AC u dołu | AC u GÓRY („3~"), DC u dołu („="), przekątna lewy-dół → prawy-góra |
| PV / magazyn | źródło NAD przekształtnikiem (kabel z góry trafiał w ogniwo) | przekształtnik NAD ramką pola z modułem PV (szewron) / baterią — jak w pierwowzorze |
| przekładnik prądowy | okrąg r = 5,5 u na przewodzie ciągłym | okrąg r = 7 u z przewodem UKRYTYM wewnątrz (wypełnienie papierem) |
| uziemienie | trzy kreski 10/7/4 u | 12 : 9 : 6 u (pierwowzór 11,3 : 8,4 : 5,7 pt) |
| węzeł | r = 1,8 u | r = 2,2 u (∅ ≈ 7× kreski) |
| orientacja pozioma | obrót −90° (zacisk a po lewej) | obrót +90° (a po prawej, otwarty nóż W GÓRĘ od osi szyny) |

### 8.2 Łańcuch danych (nie tylko rysunek)

- Kontrakt 3.0.0 (addytywnie, `exclude_none`): `devices[].catalog_namespace` — lustro
  `branches[].catalog_namespace`, żeby obiekt urządzenia był JEDYNYM źródłem prawdy dla
  wyboru symbolu (kompozytor: 4 miejsca wpięcia; panel odpływu: 1 — wszystkie przez
  `wpisAparatu(typ, device_kind, catalog_namespace)`).
- Odwzorowanie: funkcja wyłącznika (breaker albo sprzęgło z klasą WYLACZNIK_*) realizowana
  wyrobem z `APARAT_NN_MCB` → wyłącznik instalacyjny; inna przestrzeń → wyłącznik mocy.
  Reguła dotyczy KAŻDEJ roli (KLASA, nie instancja) — pin: `symbolRegistry.test.tsx`,
  iloczyn typ × device_kind × przestrzeń (14 × 10).
- Scenariusze danych: `wylacznik()` ≤ 125 A = `APARAT_NN_MCB` z charakterystyką (odpływy),
  > 125 A = `APARAT_NN` + `device_kind` WYLACZNIK_GLOWNY (zasilanie z TR, `rola="glowny"`) /
  WYLACZNIK_ODPLYWOWY + `i_n_a` (kontrakt SWZ tej przestrzeni). Fixtury 01–18 zregenerowane
  z backendu; test `test_scenariusze_nn.py` pina JSON w repo.
- Pakiet: 19 wierszy (02 = wyłącznik instalacyjny), tablica rozpoznawalności 26 pozycji
  (25/26 = MCB zamknięty/otwarty), klucz w pakiecie §6.

### 8.3 Weryfikacja R2.1

- `cad/__tests__/cadSymbolRegistry.test.tsx`: 17 testów, w tym 3 nowe testy KLASOWE
  pierwowzoru (końcówka otwartego noża w lewo i na wysokości styku stałego dla każdego
  łącznika; kwalifikatory poza grupą przegubu, wyzwalacze/wkładka w niej; AC u góry i
  źródło pod przekształtnikiem; orientacja +90° → nóż w górę); snapshot prymitywów
  odświeżony świadomie.
- lv-domain vitest: 10 plików / 269 testów zielone (symbolRegistry z przestrzenią
  katalogu, compose [13] sześć rodzin + incomer WYLACZNIK_GLOWNY, lod [15] 12 MCB + 1
  wyłącznik mocy, energizacja, LvDomainView).
- backend `tests/application/analyses/lv_domain`: 162 passed (fixtury JSON ↔ backend).
- e2e: 22 kadry (20 sceny + pakiet ×3 + rozpoznawalność), pin [13] sześciu rodzin
  (`QF-T1` → `cad.wylacznik`, `QF-01` → `cad.wylacznikInstalacyjny`).
- tsc, eslint czyste. Pełna regresja (vitest, pytest, guardy) — wynik w §8.5.

### 8.4 Samoocena R2.1 (opinia wykonawcy, nie werdykt)

- Zgodność z pierwowzorem: proporcje noża, kwalifikatorów, wkładki, wyzwalaczy, falownika,
  modułu PV, baterii, uziemienia i kropki przeniesione z pomiarów (§12 pakietu); różnice
  świadome: siatka 1 u zaokrągla wymiary (np. nóż 14,8 pt → 11,5 u przy skali 0,78 u/pt),
  „hak" bimetalu uproszczony do trzech kresek (pierwowzór: cztery krótkie odcinki).
- Bez odpowiednika w ENM (nie rysowane, pytanie §9 g pakietu): SPD, licznik Wh, gniazdo
  1/N/PE, analizator, symbol sieci zasilającej.
- Werdykt wizualny B-02 należy do właściciela.

### 8.5 Pełna regresja po R2.1 (kody wyjścia łapane bezpośrednio)

| Warstwa | Wynik |
|---|---|
| backend `pytest -q` (pełny) | 10514 passed / 10 skipped / 0 failed (717 s) |
| frontend `vitest run --no-file-parallelism` (pełny) | 887 plików / 11973 passed / 1 skipped / 14 todo / 0 failed (2138 s) |
| `tsc --noEmit`, `eslint` (cad, lv-domain, harness, e2e) | czyste |
| e2e Playwright (`lv-domain-screenshot`, `sld-symbol-pack-screenshot`) | 22 passed (20 kadrów sceny + 3 tablice pakietu + rozpoznawalność) |
| guardy (34: pcc_zero, domain_no_guessing, arch, solver_boundary, canonical_ops, no_codenames, forbidden_ui_terms, ui_terminology, dialog_completeness, dead_click, catalog_binding/enforcement/gate/metadata, overlay_no_physics, load_flow/protection_no_heuristics, trace_ui_leak, sld_determinism, trace_determinism, fault_scenarios_determinism, resultset_v1_schema, readiness_codes, audit_contract, api_lifecycle, severity_contract, reference_networks, docs, local_truth, docs_archive, repo_hygiene, import_graph, ui_no_physics, physics_label) | 34 × EXIT 0 (no_codenames początkowo czerwony przez oznaczenia zacisków CT w opisie normatywnym — naprawione u źródła, ponownie zielony) |

Nie pushowano (zasada właściciela: push wyłącznie za wyraźną zgodą). Werdykt B-02
należy do właściciela.
