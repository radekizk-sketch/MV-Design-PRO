# Testy NC RfG / PTPiREE — kanon wykonawczy (stan docelowy AB-1a)

Status: **AKTUALNY — stan DOCELOWY po odbiorze AB-1a.**
Data: 2026-09-23.
Ważność opisu: stan docelowy wg karty wykonawczej Pakietu C (`scratchpad/karta_pakiet_C_solver_ocena.md`,
zarządca, 2026-09-23) i karty repozytorium `docs/plan/KARTA_AB_1A_WERDYKT_I_PROFIL_2026-09.md` (§0
pkt 5–7, 9–11); opis sprawdzony wobec HEAD `022ef670` z niezacommitowaną pracą Pakietów B i C w drzewie
roboczym `r10` (loader profilu warstwowego, solver PTPiREE kontraktu V2, `ocena_wymagan.py`).
**Odbiór w commicie integracyjnym AB-1a** — do tego commitu ścieżka użytkownika na gałęzi głównej
działa jeszcze na kontrakcie V1 (opis V1 w historii tego pliku, `b2ad882e`).
Zakres: zakładka analityczna „Testy NC RfG", macierz zgodności OZE, certyfikat zgodności i wniosek
do OSD — backend, API, ślad WHITE BOX, dokumenty formalne.
Kontrakty nadrzędne: `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md` (rekordy `OcenaKryterium` i
`WynikWymagania`), `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` (decyzje O-1…O-48, bramka danych §12).
Źródło zewnętrzne: PTPiREE, `https://ptpiree.pl/kodeksy-sieci/procedura-testowania/` (Procedura
testowania wer. 3.0) oraz `https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/` (WiPWC 1.3).

## 1. Cel

Tor „Testy NC RfG" odpowiada na pytanie: **które wymagania przyłączeniowe dotyczą tego modułu
wytwarzania energii typu A albo B, czym każde z nich można wykazać i co z tego wynika na danych
modułu — z wyjaśnieniem, podstawą i jakością dowodu.** Wynik jest PER WYMAGANIE (rekord
`WynikWymagania`) z ocenami składowymi PER KRYTERIUM (rekord `OcenaKryterium`); nie ma wyniku
zbiorczego modułu.

Tor nie zastępuje certyfikacji ani badań obiektowych i nie orzeka zgodności z samej deklaracji:
porównanie wartości zadeklarowanych z profilem wykazuje wyłącznie konfigurację zadeklarowaną;
zachowanie dynamiczne (FRT, odbudowa mocy, prąd bierny w zakłóceniu) wymaga biegu dynamiki
(przyrost AB-1c) albo certyfikatu/raportu z badania. Brak danych, brak symulacji i brak
certyfikatu nigdy nie dają stanu `SPELNIA`.

## 2. Profil regulacyjny — warstwy i stan źródła

Kryteria, progi, tolerancje i obwiednie pochodzą WYŁĄCZNIE z profilu regulacyjnego
`backend/src/catalog/profiles/nc_rfg/` (zero liczb kryterium w solverze). Profil efektywny
operatora składa warstwy w kolejności: **NC RfG** (rozporządzenie 2016/631 — istnienie i
stosowalność wymagań, granice dopuszczalne) → **WOS** (wartości krajowe; dziś progi klas modułów
wg decyzji Prezesa URE, decyzja O-1) → **procedura PTPiREE** (kryteria akceptacji testów, program
badań) → **WiPWC** (reguła pokrycia wymagań certyfikatem urządzenia, wersje wykazu, wskazanie
rejestru) → **OSD** (dokument ruchowy operatora, nadpisania, Bank Nastaw, wykonanie prawa
operatora do określenia wymagań) → **magazyny** (wymagania krajowe dla magazynów energii) →
**wartości zastane** (parametry o nieustalonym pochodzeniu, jedna kopia dawnych pięciu profili).

Każda wartość niesie podstawę `PodstawaWymagania` (rodzaj, dokument, wydanie, jednostka
redakcyjna, stan źródła `ZWERYFIKOWANE` / `WSKAZANE` / `NIEUSTALONE`, uwagi). Stan `WSKAZANE` i
`ZWERYFIKOWANE` wymagają wydania i jednostki redakcyjnej — przeetykietowanie nie podnosi stanu.
Werdykt wobec limitu o stanie `NIEUSTALONE` nie jest wydawany (`BRAK_PODSTAWY`, decyzja O-2′);
wynik obliczeniowy wobec przyjętej wartości jest pokazywany informacyjnie. Pełna, GENEROWANA z
profilu lista podstaw `NIEUSTALONE` — z dokumentem, którego brakuje, i z wymaganiami/testami,
które odblokowuje — to tabela bramki danych właściciela w planie A/B §12.1
(`scripts/bramka_danych_profilu.py`, strażnik porównuje tabelę z profilem).

Klasa modułu wynika z JEDNEJ klasyfikacji krajowej `klasyfikacja_modulu(p_max_kw, napiecie_kv)`
(progi WOS: A 0,8 kW ≤ P < 200 kW; B 200 kW ≤ P < 10 MW; C 10 MW ≤ P < 75 MW; D P ≥ 75 MW albo
napięcie przyłączenia ≥ 110 kV włącznie) z podstawą progów i powodem; moduł poniżej progu
istotności (art. 5 ust. 2 lit. a) ma klasę `None` — wymagania rozporządzenia go nie obejmują.
Interfejs użytkownika nie klasyfikuje (klasyfikacja kliencka skasowana, O-1, karta §0 pkt 10);
końcówka `GET /api/ncrfg-tests/modul?p_max_kw=&napiecie_kv=` przyjmuje moc w kW.

## 3. Identyfikatory T01–T20 — numeracja REPOZYTORIUM

**Identyfikatory `T01…T20` są numeracją tego repozytorium, nie numeracją procedury PTPiREE.**
Tabela 1 Procedury testowania wer. 3.0 nie numeruje testów; jedyną kanoniczną przestrzenią
numeracji jest `network_model/solvers/ncrfg_ptpiree/engine.py::TEST_CATALOG` (dawna druga
przestrzeń `T1…T18` silnika `application/ncrfg_compliance/checker.py` skasowana bez mapowania,
karta S-3; martwe pole `compliance_tests` profili skasowane, decyzja OD-26 w AB-1a). W
dokumentach dla operatora test jest nazywany zdolnością procedury (kolumna „Zdolność"), a
identyfikator repozytorium służy wyłącznie do śledzenia.

| Id repo | Zdolność (procedura PTPiREE wer. 3.0) | Rodzaj twierdzenia | Zakres procedury (typy) | Wymagany bez certyfikatu (typy) | Wymaganie profilu wykazywane testem |
|---------|---------------------------------------|--------------------|-------------------------|----------------------------------|--------------------------------------|
| T01 | LFSM-O — ograniczanie mocy przy nadczęstotliwości | konfiguracja zadeklarowana | C, D | — (A i B: przez wymaganie RFG_13_2, gdy certyfikat nie obejmuje typu) | RFG_13_2 (art. 13 ust. 2) |
| T02 | LFSM-U — zwiększanie mocy przy podczęstotliwości | konfiguracja zadeklarowana | C, D | — | — |
| T03 | FSM — regulacja częstotliwości w paśmie normalnym | konfiguracja zadeklarowana | C, D | — | — |
| T04 | regulacja odbudowy częstotliwości | konfiguracja zadeklarowana | C, D | — | — |
| T05 | możliwość regulacji mocy czynnej | konfiguracja zadeklarowana | B, C, D | — | RFG_14_2 (art. 14 ust. 2) |
| T06 | tryb regulacji napięcia | konfiguracja zadeklarowana | C, D | — | — |
| T07 | tryb regulacji mocy biernej Q | konfiguracja zadeklarowana | C, D | — | — |
| T08 | tryb regulacji współczynnika mocy cosφ | konfiguracja zadeklarowana | C, D | — | — |
| T09 | zdolność do generacji mocy biernej | konfiguracja zadeklarowana | B, C, D | — | RFG_17_2 (SPGM, art. 17 ust. 2), RFG_20_2A (PPM, art. 20 ust. 2 lit. a) |
| T10 | potwierdzenie mocy maksymalnej PMAX | konfiguracja zadeklarowana | B, C, D | — | — |
| T11 | potwierdzenie mocy minimalnej PMIN | konfiguracja zadeklarowana | B, C, D | — | — |
| T12 | zaprzestanie generacji mocy czynnej (interfejs logiczny) | konfiguracja zadeklarowana | — | A, B | RFG_13_6 (art. 13 ust. 6, typ A) |
| T13 | zmniejszenie generacji mocy czynnej | konfiguracja zadeklarowana | — | B | RFG_14_2 (art. 14 ust. 2) |
| T14 | LVRT — pozostanie w pracy przy zapadzie napięcia | zachowanie dynamiczne | B, C, D | — | RFG_14_3 (art. 14 ust. 3) |
| T15 | HVRT — pozostanie w pracy przy wzroście napięcia | zachowanie dynamiczne | B, C, D | — | ZASTANE_HVRT (wyłącznie profil zastany) |
| T16 | odbudowa mocy czynnej po zakłóceniu | zachowanie dynamiczne | B, C, D | — | RFG_17_3 (SPGM), RFG_20_3 (PPM) |
| T17 | prąd bierny podczas zakłócenia (szybki prąd zwarciowy) | zachowanie dynamiczne | C, D | — (B: przez RFG_20_2B, tylko PPM) | RFG_20_2B (art. 20 ust. 2 lit. b) |
| T18 | praca wyspowa, rozruch autonomiczny, tłumienie oscylacji | zachowanie dynamiczne | — (gdy program szczegółowy wskazuje zdolność) | — | — |
| T19 | rejestracja zakłóceń i komunikacja z operatorem | konfiguracja zadeklarowana | C, D | — | — |
| T20 | jakość energii — THD_U źródła (kontrola uzupełniająca) | konfiguracja zadeklarowana | — (wyłącznie z zakresu programu szczegółowego) | — | — (nie jest wymaganiem NC RfG; emisja w punkcie przyłączenia wobec limitów OSD — przyrost AB-H1, O-40) |

Kolumna „Wymaganie profilu" jest wyprowadzana z katalogu wymagań profilu (`testy` wymagania,
`NcRfgProfile.wymagania_testu`), nie z tej tabeli. Rodzaj twierdzenia i identyfikator zdolności
niesie `TEST_CATALOG` (`rodzaj_twierdzenia`, `zdolnosc_id`); poziom dowodowy zdolności —
rejestr `solver_input.provenance.classify_dynamic_capability`. Dawna mapa
`solver_input/dowod_ncrfg.py::TEST_ZDOLNOSC` i „ocena dowodowa biegu" są skasowane (Pakiet C) —
ich rolę pełni kompletność dowodu każdego rekordu.

### 3.1. Klasyfikacja testów wobec Procedury testowania PTPiREE wer. 3.0

| Zakres | Testy (numeracja repozytorium) | Podstawa w Procedurze wer. 3.0 |
|---|---|---|
| Testy zgodności PTPiREE (Tabela 1) | T01–T13 | LFSM-O/LFSM-U, FSM, regulacja odbudowy częstotliwości, regulacja mocy czynnej, tryby regulacji U / Q / cosφ, zdolność do generacji mocy biernej, potwierdzenie PMAX/PMIN, zaprzestanie i zmniejszenie generacji mocy czynnej |
| Symulacje zgodności / certyfikat NC RfG | T14–T18 | LVRT/HVRT, odbudowa P po zwarciu, prąd bierny podczas zwarcia, sprawdzenia dodatkowe dla pracy wyspowej / rozruchu autonomicznego / tłumienia oscylacji — „gdy zdolność jest wymagana" przez właściwego operatora |
| Wymagania konfiguracyjne / pomiarowe | T19–T20 | telemechanika, komunikacja SCADA i rejestrator zakłóceń; jakość energii (THD_U) jako kontrola uzupełniająca |

## 4. Stosowalność — jedna funkcja, nigdy od obecności danych

Stosowalność wymagania i testu wyznaczają DWIE funkcje jednego modułu
`network_model/solvers/ncrfg_ptpiree/stosowalnosc.py`, czytane zarówno przez solver, jak i przez
ocenę wymagań (reguła predykatów parami, decyzje O-31, O-34):

- `stosowalnosc_wymagania` — **typ × technologia × moduł istniejący (art. 4) × prawo operatora**:
  klasa `None` → nie dotyczy (powód klasyfikacji); technologia `MAGAZYN` wobec wymagania z
  rozporządzenia → nie dotyczy (art. 3 ust. 2 lit. d, O-28); typ lub technologia poza zakresem
  wymagania → nie dotyczy; `modul_istniejacy = True` → nie dotyczy (art. 4 ust. 1);
  `operator_skorzystal_z_prawa = False` → nie dotyczy z podstawą wykonania prawa; `None` →
  wymaganie obowiązuje, a jego podstawa jest podmieniona na nieustalone wykonanie prawa (stan
  `NIEUSTALONE` → `BRAK_PODSTAWY` z nazwanym dokumentem OSD).
- `stosowalnosc_testu` — wymuszenie w programie szczegółowym → dotyczy; klasa `None`, magazyn,
  moduł istniejący → nie dotyczy; test wykazuje stosowalne wymaganie, którego nie pokrywa
  certyfikat → dotyczy; zakres procedury (`default_for_modules`) → dotyczy; „wymagany bez
  certyfikatu" (`required_without_certificate_for`) → dotyczy; zdolność dodatkowa wskazana w
  programie (T18) → dotyczy; w pozostałych przypadkach nie dotyczy z powodem nazywającym każdą
  sprawdzoną regułę.

**Stosowalność nigdy nie zależy od obecności danych** — brak danej przy teście wymaganym to
ocena niewykonana (`NIE_OCENIONO`) z nazwanym brakiem, nie „test niewymagany" (dawny T20 „gdy
podano THD" skasowany). Data umowy przyłączeniowej (`data_umowy_przylaczeniowej`) wybiera wersję
każdej warstwy (`NcRfgProfile.wersja_warstwy`); dziś profil niesie jedną wersję na warstwę, a
data wcześniejsza niż obowiązywanie tej wersji obniża stan podstawy do `NIEUSTALONE` z uwagą.

**Magazyn energii** (technologia `MAGAZYN`: samodzielny BESS, `der_kind = "BESS"` w rodzinie
PPM) → każde wymaganie warstw NC RfG, WOS, procedury i zastanej `NIE_DOTYCZY` z powodem „art. 3
ust. 2 lit. d rozporządzenia 2016/631 wyłącza urządzenia magazynujące"; wymagania krajowe dla
magazynów należą do warstwy magazynów (dziś pusty katalog, stan `NIEUSTALONE`). Instalacja
hybrydowa PV + BESS za jednym punktem przyłączenia jest modułem parku energii o mocy części
wytwórczej. Rodzina `Morski_PPM` jest usunięta z wejścia (moduł morski przyłącza się do sieci
przesyłowej — poza narzędziem SN/nN; żądanie z tą rodziną → 422).

## 5. Wynik per test — kontrakt V2 (`NcRfgPtpireeTestResultV2`)

Kontrakt wyniku: `NCRFG_PTPIREE_CONTRACT = "NcRfgPtpireeTestResultV2"`, wersja solvera
`ncrfg-ptpiree-whitebox-2.0`.

- **`NcRfgPtpireeTestResult.ocena: OcenaKryterium`** — obowiązkowa dla KAŻDEGO z 20 testów (test
  niestosowalny = rekord ze `stosowalnosc.dotyczy = False` i statusem `NIE_DOTYCZY`). Rekord niesie
  przedmiot (moduł, typ, technologia, P_max, napięcie przyłączenia), kryterium z `warunek_latex`
  (renderowane przez `MathRenderer`) i relacją, wynik z jednostką i metodą, limit z podstawą z
  profilu i wersją profilu, margines ze skalą (tolerancja z `kryteria_akceptacji`), niepewność,
  status, kompletność dowodu, etykietę i wyjaśnienie z JEDYNEGO generatora (`werdykt/wyjasnienie.py`),
  dowód (metoda, poziom, rodzaj twierdzenia, status modelu, status danych), zakres ważności i ślad.
- **Jeden test = jeden rekord K** (kryterium główne procedury — np. T01–T03 statyzm w tolerancji,
  T04 rampa odbudowy); pozostałe warunki tego samego testu trafiają do śladu WHITE BOX
  informacyjnie i są nazwane w zakresie ważności. Koniunkcja kilku warunków w jednym „ok" jest
  zakazana.
- **`verdict`** (`pass` / `fail` / `no_data` / `not_required`) jest ENUMEM WEWNĘTRZNYM wyprowadzanym
  JEDNĄ funkcją całkowitą `werdykt_maszynowy(ocena)`: `SPELNIA` → `pass`, `NIE_SPELNIA` → `fail`,
  `NIE_DOTYCZY` → `not_required`, `NIEJEDNOZNACZNY` / `NIE_OCENIONO` / `BRAK_PODSTAWY` /
  `BRAK_DOWODU` → `no_data`. Nigdy nie jest liczony drugim predykatem ani pokazywany
  użytkownikowi jako wynik; `summary_pl = ocena.wyjasnienie.zdanie_pl`, `required =
  ocena.stosowalnosc.dotyczy`, `required_reason_pl = ocena.stosowalnosc.powod_pl` (walidatory).
- **Metody w AB-1a:** testy konfiguracji zadeklarowanej (T01–T13, T19, T20) — `DEKLARACJA` z
  niepewnością „nie dotyczy (porównanie wartości zadeklarowanych)"; testy zachowania
  dynamicznego (T14–T18) bez biegu dynamiki — `NIE_OCENIONO` z „czego brakuje: bieg dynamiki RMS
  modułu w scenariuszu zakłócenia (przyrost AB-1c)"; porównanie flag `has_lvrt_curve` /
  `has_dynamic_model` nie jest wynikiem (dawna tautologia T14/T15 skasowana).
- **Skasowane w kontrakcie V2 (bez aliasów):** `overall_status`, `pass_count`, `fail_count`,
  `no_data_count`, `not_required_count`, `required_count` modułu (zakaz agregatu „zgodny",
  decyzja O-13 — dawny agregat orzekał „zgodny" także przy zerze wymaganych testów),
  `PtpireeModuleOverall`, `certificate_status` wejścia i wyniku, `criterion_source` /
  `NcRfgZrodloKryterium` (podstawa limitu = `ocena.limit.podstawa`), osobne `fix_actions` (jedno
  źródło: `ocena.wyjasnienie.czego_brakuje`), `procedure_version` i `deterministic_seed` żądania.
- **Wynik modułu** (`NcRfgPtpireeModuleResult`) niesie `klasyfikacja` (z podstawą i powodem;
  `module_type == klasyfikacja.modul`), `technologia`, `modul_istniejacy`,
  `data_umowy_przylaczeniowej`, `wersja_procedury` (dokument warstwy z profilu),
  `dowod_certyfikatu` (rekord wykazu albo `None`), `zrodlo_danych` (`ZATWIERDZONY_MODEL` /
  `ZADANIE_KLIENTA`) i listę testów — bez żadnego licznika.

## 6. Wynik per wymaganie (`WynikWymagania`)

`application/ncrfg_compliance/ocena_wymagan.py` buduje dla KAŻDEGO wymagania profilu (wszystkie
warstwy, kolejność profilu) rekord `WynikWymagania` przez `werdykt.decyzja.zagreguj_wymaganie`
(status, kompletność, etykietę i wyjaśnienie liczy wyłącznie `werdykt`):

- sposób wykazania z predykatu profilu `WymaganieRegulacyjne.sposob_wykazania`:
  `TEST` → `DOWOD_LACZONY` (składowe = rekordy K testów wymagania + kryteria koordynacji nastaw,
  §9); `CERTYFIKAT` → `CERTYFIKAT` (składowa „certyfikat z wykazu obejmuje typ modułu"; podstawa
  reguły sposobu wykazania = reguła pokrycia WiPWC); `BRAK_METODY` → `BRAK_DOWODU` z nazwaną metodą
  właściwą (certyfikat urządzenia albo raport z badania typu); wymaganie niestosowalne →
  `NIE_DOTYCZY` z powodem;
- reguły agregacji W kontraktu §2.3: wszystkie naruszone składowe nazwane; `SPELNIA` wyłącznie z
  dowodem `PELNY`; stosowalne wymaganie o samych składowych `NIE_DOTYCZY` → `NIE_OCENIONO`;
- **pokrycie programu badań (O-30):** wymaganie wykazywane składową o zachowaniu dynamicznym ma
  `pokrycie_programu = CZESCIOWE` z opisem programu badań profilu (dziś pusty zbiór scenariuszy,
  stan `NIEUSTALONE`) — `SPELNIA` nieosiągalne, jeden scenariusz nie wykazuje wymagania;
  wymagania wykazywane porównaniem konfiguracji, certyfikatem albo bez metody → `NIE_DOTYCZY`;
- **dane klienta (O-27):** bieg „co-jeśli" `POST /api/ncrfg-tests/run` znakuje każdą wartość z
  żądania jako `UNVALIDATED_INPUT` (`dane_przyjete` z wartością i powodem) → kompletność
  `NIEPELNY`; `der_kind`, `module_family`, `operator_id` są WYMAGANE (bez wartości domyślnych), a
  ciało żądania ma `extra = "forbid"` (nieznane pole, np. dawny status certyfikatu → 422);
- odpowiedź biegu `NcRfgPtpireeRunResponse` = wynik solvera + `ocena_wymagan:
  list[OcenaWymaganModulu]` (obowiązkowa, moduły w tej samej kolejności co wynik solvera);
  zgodność przypadku: `GET /api/ncrfg-tests/cases/{case_id}/compliance` (wejście z mostu
  `model_bridge` z zatwierdzonego modelu, `zrodlo_danych = ZATWIERDZONY_MODEL`).

**Certyfikat zgodności i wniosek do OSD** (`/api/oze-analysis/compliance-certificate[.docx|.pdf]`,
`/api/oze-analysis/osd-application[.docx|.pdf]`) powstają WYŁĄCZNIE z zatwierdzonego modelu
(`case_id` wymagany, klucz magazynu z przypadku, wejście solvera z mostu) i czytają WYŁĄCZNIE
rekordy `WynikWymagania`: lista braków = pełne rekordy (nie jednozdaniowe komunikaty), dokument
DOCX/PDF renderuje bloki `werdykt.dokument.blok_wymagania` — to samo `zdanie_pl` w API, w DOCX i w
PDF (kontrakt, test T13). Zero liczników „spełnia / nie spełnia / zgodny" w dokumentach i w
interfejsie (macierz OZE, zakładka testów, sekcja przekrojowa pokazują karty werdyktu z etykietą z
rekordu).

## 7. Cztery wymagania FRT — „FRT" jest grupą prezentacyjną, nie wymaganiem

Sześć kryteriów zachowania w zakłóceniu nie tworzy jednego wymagania (decyzje O-13, O-29). Należą
do CZTERECH rekordów `WynikWymagania`, każdy z własnymi składowymi:

| Wymaganie | Artykuł rozporządzenia 2016/631 | Dotyczy | Kryteria składowe (stan docelowy) | Stan w AB-1a |
|-----------|--------------------------------|---------|-----------------------------------|--------------|
| pozostanie w pracy podczas zwarcia (RFG_14_3) | art. 14 ust. 3 | PPM i SPGM typu B | kryterium LOGICZNE „moduł nie został odłączony" z WARUNKIEM WSTĘPNYM U_PCC(t) ≥ obwiednia LVRT profilu (obwiednia nie jest marginesem — tautologia dawnego toru); osobne kryterium liczbowe zapasu zabezpieczenia U< modułu; stan końcowy; koordynacja nastawy U< z obwiednią (§9) | T14 `NIE_OCENIONO` (bieg dynamiki — AB-1c), obwiednia LVRT o stanie `NIEUSTALONE` w zastrzeżeniach; koordynacja nastaw oceniana statycznie (§9) |
| szybki prąd zwarciowy (RFG_20_2B) | art. 20 ust. 2 lit. b i c (profil wskazuje dziś „art. 20 ust. 2 lit. b") | wyłącznie PPM typu B; operator ma prawo określenia wymagania | aktywacja prądu biernego (czas od przekroczenia strefy martwej ΔU), wielkość ΔI_q wobec ΔU od U_pre, ogranicznik prądu \|I\| ≤ i_max | T17 `NIE_OCENIONO`; SPGM → `NIE_DOTYCZY` (wymaganie dotyczy modułów parku energii); wykonanie prawa operatora nieustalone → `BRAK_PODSTAWY` z dokumentem OSD |
| odbudowa mocy czynnej po zwarciu — PPM (RFG_20_3) | art. 20 ust. 3 lit. a (profil wskazuje dziś „art. 20 ust. 3") | PPM typu B | start, gradient, czas do k·P_pre, przeregulowanie, stan końcowy, ograniczenie dostępnością P | T16 `NIE_OCENIONO`; czas i tempo odbudowy z warstwy zastanej (`NIEUSTALONE`) |
| odbudowa mocy czynnej po zwarciu — SPGM (RFG_17_3) | art. 17 ust. 3 (jednostka redakcyjna do potwierdzenia z tekstem rozporządzenia — stan `NIEUSTALONE`) | SPGM typu B | jak wyżej + utrata synchronizmu podczas zwarcia jako kryterium (O-42) | T16 `NIE_OCENIONO`; podstawa wymagania `NIEUSTALONE` |

HVRT (`ZASTANE_HVRT`, T15) istnieje wyłącznie w profilu zastanym (rozporządzenie nie określa
wymagania HVRT dla typu B — wskazanie do weryfikacji dokumentem) — `NIE_OCENIONO` do AB-1c, podstawa
`NIEUSTALONE`. Wszystkie kryteria dynamiczne czterech wymagań dostają producenta w AB-1c (bieg
kanonicznego silnika dynamiki, dwa tryby: stanowisko ze źródłem testowym U/f/θ i sieć z
zakłóceniem fizycznym — O-18) na modelu z wyrocznią AB-1d_min; do AB-1d kompletność dowodu tych
wyników jest `NIEPELNY` z powodem „druga niezależna droga w toku" (O-33).

## 8. Dowód certyfikatu — tabliczka × rejestr, per rekord wykazu (O-17, O-27)

- Rejestr certyfikowanych urządzeń jest JEDEN: `network_model/catalog/ptpiree_wykaz_snapshot.json`
  (wykaz WiPWC 1.2/1.3, `mv_ptpiree_catalog.py`, końcówki `/api/catalog/ptpiree/*`); warstwa WiPWC
  profilu go WSKAZUJE (kopia rekordów w YAML zabroniona, frontowa kopia `.generated.ts` skasowana).
- Dowód `DowodCertyfikatu` (identyfikator rekordu, producent, model, numer dokumentu, data
  akceptacji, wersja WiPWC i WOS, zakres typów modułu, warunek ważności, adres źródła, podstawa)
  buduje WYŁĄCZNIE serwer w `application/ncrfg_compliance/model_bridge.py` z tabliczki generatora
  zatwierdzonego modelu dopasowanej do rekordu wykazu; rozjazd tabliczki z rejestrem = brak dowodu
  z powodem. Klient nie może przysłać statusu certyfikatu (pole nie istnieje, 422).
- Certyfikat obejmuje wymaganie, gdy zakres typów rekordu obejmuje typ modułu i reguła pokrycia
  WiPWC (`pokrycie_zrodlo` wymagania) pokrywa ten typ; certyfikat jednostki wytwórczej nie wykazuje
  wymagań poziomu modułu typu B w punkcie przyłączenia, jeśli zakres rekordu go nie obejmuje.
- **Dziś reguła pokrycia ma stan `NIEUSTALONE`** (przeniesiona z dawnego pola bez wskazania punktu
  WiPWC per wymaganie) — sam certyfikat daje więc `BRAK_DOWODU` z wyjaśnieniem „reguła pokrycia
  wymagania certyfikatem bez wskazanej jednostki redakcyjnej WiPWC", nigdy `SPELNIA`. Stan podnosi
  dokument (tabela bramki danych, plan §12.1), nie zmiana kodu.

## 9. Kryteria koordynacji nastaw — sprawdzenie statyczne bez symulacji (O-32)

Nastawy zabezpieczeń modułu pochodzą z modelu (`Generator.nastawy_zabezpieczen`, przenoszone
mostem do `nastawy_zabezpieczen_modulu` wejścia solvera; słownik pozycji zgodny z Bankiem Nastaw
profilu); brak nastawy → `NIE_OCENIONO` z nazwanym polem.

- `frt.koordynacja_nastaw_u_min` — składowa RFG_14_3 (typ B): punkt (czas, napięcie) nastawy
  zabezpieczenia podnapięciowego U< modułu nie może leżeć powyżej obwiedni LVRT profilu (relacja
  `OBWIEDNIA_GORNA`, warunek `U_< ≤ U_LVRT(t_<)`), bo inaczej zabezpieczenie zadziała przy napięciu,
  przy którym moduł ma obowiązek pozostać w pracy; obwiednia o stanie `NIEUSTALONE` → `BRAK_PODSTAWY`
  z wynikiem informacyjnym.
- `rocof.koordynacja_nastaw_lom` — składowa RFG_13_1B (typy A i B): nastawa RoCoF (LoM) modułu nie
  niższa niż wymagana wytrzymałość RoCoF z art. 13 ust. 1 lit. b; profil nie niesie dziś wartości
  wytrzymałości (brak parametru, nie tylko stan) — limit nie istnieje → `BRAK_PODSTAWY` z brakiem
  nazwanym: wartość krajowa WOS albo IRiESD i Bank Nastaw operatora (dziś pusty, `NIEUSTALONE`).

Bank Nastaw (`operatorzy/<id>.yaml: bank_nastaw`, O-17) przyjmuje WYŁĄCZNIE wartości z podstawą —
zero wartości „typowych"; pętla czasowa zabezpieczeń na tych nastawach należy do AB-5.

## 10. Kontrakt backendu i API

- Solver: `backend/src/network_model/solvers/ncrfg_ptpiree/engine.py` (rdzeń za bramką B-01,
  edycja z delegacji O-5), kontrakty `contracts.py`, stosowalność `stosowalnosc.py`.
- Ocena wymagań i bieg: `backend/src/application/ncrfg_compliance/ocena_wymagan.py`, `bieg.py`,
  most z modelu `model_bridge.py`.
- API (`backend/src/api/ncrfg_ptpiree_tests.py`): `GET /api/ncrfg-tests/catalog` (katalog testów z
  `zdolnosc_id` i `rodzaj_twierdzenia`, wersja procedury z profilu, klasy modułów z
  `klasyfikacja_zrodlo`), `GET /api/ncrfg-tests/modul` (klasyfikacja w kW, NaN/∞/ujemne → 422),
  `GET /api/ncrfg-tests/cases/{case_id}/compliance`, `POST /api/ncrfg-tests/run` (bieg „co-jeśli",
  dane klienta `UNVALIDATED_INPUT`).
- Wynik zawiera `input_hash` i `deterministic_hash` (dwa biegi tej samej prośby → te same skróty i te
  same odciski rekordów `ocena.odcisk()`), `white_box_trace` (formuła, dane, podstawienie, wynik,
  kontrola jednostek; krok śladu niesie odcisk rekordu) i raport PL bez liczników.

## 11. Zasady architektoniczne

- Interfejs nie liczy zgodności, nie klasyfikuje modułu i nie tłumaczy statusów: pokazuje rekord
  (etykieta z rekordu, mapa wyłącznie `semantyka` → kolor w karcie werdyktu).
- Solver nie modyfikuje ENM, nie ma własnej logiki statusu ani tekstu werdyktu, nie ma liczb
  kryterium; brak danych jest stanem rekordu z nazwanym brakiem, nie milczącym założeniem.
- Certyfikat PTPiREE może wykazać wymaganie wyłącznie przez regułę pokrycia WiPWC z podstawą; nie
  ukrywa braków profili technicznych wymaganych do symulacji.
- Raport i dokumenty formalne korzystają z zamrożonego wyniku i rekordów, bez ponownego liczenia.

## 12. Definicja ukończenia (stan docelowy AB-1a)

- Każdy z 20 testów ma rekord `OcenaKryterium`; `verdict` wyłącznie z `werdykt_maszynowy`.
- Każde wymaganie profilu ma rekord `WynikWymagania`; certyfikat i wniosek do OSD czytają wyłącznie
  te rekordy i powstają wyłącznie z zatwierdzonego modelu.
- Sondy karty repozytorium §4 (moduł A bez certyfikatu, A z certyfikatem, B, SPGM B, BESS
  samodzielny, `POST /run` ze statusem certyfikatu w ciele, certyfikat bez `case_id`,
  `/modul` w kW) dają opisane wyżej stany z wyjaśnieniem.
- Testy backendu solvera, oceny wymagań, API, certyfikatu i wniosku zielone; migawka OpenAPI i
  harness regenerowane skryptem; strażniki `werdykt_wyjasnialny_guard`, `plan_ab_zaleznosci_guard`,
  `bramka_danych_profilu` zielone.
- Werdykt wizualny karty werdyktu i ekranów (oba motywy) wystawia właściciel (bramka B-02).
