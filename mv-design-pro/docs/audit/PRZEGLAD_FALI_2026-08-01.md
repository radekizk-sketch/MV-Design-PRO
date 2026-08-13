# PRZEGLĄD KODU FALI AUDYTU — 2026-08-01 (WIĄŻĄCY)
Zakres: `05138f2d..6307dfb3` (dziewięć kart, rejestr V12K-306…314).
Metoda: sześć niezależnych soczewek przeglądu + adwersaryjna weryfikacja każdego poważnego znaleziska (sceptyk z zadaniem OBALENIA, potwierdzenie wyłącznie z wykonanym dowodem).

**Wynik: 12 znalezisk potwierdzonych, 0 obalonych, 4 niezweryfikowanych (poza limitem sceptyków — ocenione w syntezie).**

---

## 1. Synteza recenzenta prowadzącego

## RAPORT RECENZENTA PROWADZĄCEGO — fala naprawcza 05138f2d..6307dfb3

Stan drzewa przy przeglądzie: HEAD 6307dfb3, `git status --porcelain` **pusty** (sondy poprzednich sesji sprzątnięte — zgłoszenia o `test_sonda_*.py` i `_sonda_sceptyka.py` są nieaktualne).

---

### 1. Odsiew duplikatów — 12 zgłoszeń → 8 defektów

| # | Defekt (klaster) | Zgłoszenia scalone | Przyczyna źródłowa (jedna) | Waga |
|---|---|---|---|---|
| **A1** | ZIP freq-only gubi całą generację | 4 zgłoszenia (`power_flow_zip.py` :141/:154/:178/:186) | **Rozjazd predykatów**: rozdziela `if zip_base_p_mw is not None` (:138-158), doklejа `for idx in zip_table` (:178-188), a `build_zip_table` wyklucza `is_constant_power()` (:102) | **krytyczny** |
| **A2** | `validate_zip_coeffs` w `aggregate_zip` wywraca czystą funkcję mapowania | 1 (niezweryfikowane) | Walidacja rozpływowa przeniesiona do wspólnego mapowania (:301) — ten sam plik, ta sama karta C | **wysoki** |
| **B** | Kształtowanie falownika czyta i nadpisuje spec szyny | 1 | `power_flow_inverter.py:179-181` (`p_inj = abs(p_spec[idx])`, `q_spec[idx] = …` przez PRZYPISANIE) + `canonical_analysis.py:1550-1580` łamie własny kontrakt „mutually exclusive" | wysoki (**zastany**) |
| **C** | Wyścig apply ↔ domain-ops / DER, utrata pracy przy HTTP 200 | 1 | Blokada całego cyklu tylko w `apply.py:71`; `api/enm.py:858→915`, `api/generators.py:444→476` i `:514→532` bez niej | **krytyczny** |
| **D** | Wycofanie nieudanego zapisu jest niepełne | 2 (`store.py:206` alias + `store.py:237` dziennik) | `_wycofaj_nieudany_zapis` przywraca **tylko model**, a i to fałszywie przy `enm is existing` | wysoki |
| **E** | OLTC: brak danej udaje werdykt | 2 (backend `:332`/`:403` + front `EkranBadanOltc.tsx:277`) | Podstawianie `(deadband_kv or 0.0)` i dwustanowy render pola opcjonalnego | wysoki (**zastany**) |
| **F** | Brama katalogowa stacji: nn_source i aparat pola SN poza inwentarzem | 2 (`domain_operations.py:4447` + `:7760`) | `extract_catalog_binding` dla operacji stacyjnych czyta **wyłącznie ref transformatora** (`domain_ops_policy.py:177-196`) | wysoki |
| **G** | `materialized_params` z payloadu wygrywa z katalogiem | 1 | `domain_operations_v2.py:2110` (wczesny zwrot) + `api/enm.py:873` wyrzuca wynik materializacji polityki | wysoki (**zastany**) |
| **H** | Bramka zwarciowa ślepa (forma pośrednia + wykluczenie per PLIK) | 2 (`no_direct_fault_params_guard.py:192` + `:109`) | `root_name()` zwraca `""` dla `Subscript`/`Call`; `check_file` wraca przed parsowaniem | średni |

**Korekty do zgłoszeń (wiążące dla kart):**
- **Zgłoszenie #9 zaniża wagę A1 do „średni"** argumentem „brak produkcyjnego pisarza k_pf" — to **nieprawda**. Zweryfikowałem sam: `domain_operations.py:6793` obejmuje listą dozwolonych pól tylko `{branches, transformers, branch_points, generators, substations}`; kolekcja `loads` idzie prosto do `new_enm[coll][idx][key] = value` (:6892-6895), więc `POST /enm/domain-ops` + `update_element_parameters` **wpisuje `materialized_params` z `k_pf` dosłownie**. Waga **krytyczny** stoi.
- **Zgłoszenie #2 ma złą diagnozę i złą kotwicę.** Rozdzielenie ZIP nie jest przyczyną (defekt odtwarza się przy odbiorze stałomocowym, gdy `split_…` zwraca `None`), a liczby „poprawne" w opisie to wynik sprzed fali. Karta ma iść w `power_flow_inverter.py`, nie w `power_flow_newton.py:147`.
- **Zgłoszenie #8 ma zły przykład narracyjny** (`analysis_run/service.py` jest na liście `LEGACY_DIRECT_SOLVER_CALLERS`, więc guard go nie ogląda). Rdzeń stoi.

---

### 2. Naprawa TERAZ vs osobna karta

**TERAZ — blokują jakość scalonej fali** (każdy z nich łamie inwariant, który ta sama fala zadeklarowała jako zamknięty):

- **A1 + A2** — regresja wniesiona commitem 2095a758 (potwierdzone biegiem na bazie: przed falą przypadek liczył się poprawnie). Karta C deklaruje „generacja to stała moc PQ", a kod ją **zeruje**.
- **C** — karta G stawia doktrynę „blokada założona dopiero na zapisie nie pomaga" (`apply.py:63`) i realizuje ją w jednym z czterech miejsc. Utrata 16 elementów kreatora przy `HTTP 200` i sfabrykowanych `created_element_refs`.
- **D** — docstring `store.py:189-193` obiecuje „rewizja i jej wpis powstają razem albo wcale"; kod tego nie robi w dwóch niezależnych miejscach.
- **E** — karta D zakazała zaszytego progu w **tym samym pliku**, w którym profil roczny nadal drukuje inżynierowi `> 0.000 kV`. Dodatkowo to samo podstawienie w `power_flow_oltc.py:193` **zawyża `total_switch_count`** (7 → 9), więc naprawa samego znacznika dałaby wynik wewnętrznie sprzeczny.
- **F** — karta A ogłosiła „bramę katalogową stacji"; źródło nN jest w **tej samej funkcji** i deklaruje `source_mode: KATALOG` przy tabliczce z payloadu, a jego `p_mw` wchodzi do rozpływu (`mapping.py:562`).

**OSOBNA KARTA — dług zastany, kolejka natychmiastowa (nie blokuje scalenia fali):**

- **B** — zastane (odtworzone na a4be1a4e), ale odwrócony znak Q na produkcyjnej ścieżce `nn_side`. Priorytet 1 po fali.
- **G** — `add_converter_source` nietknięte tą falą, ale ta sama klasa co D2. Priorytet 2.
- **H** — bez dzisiejszego skutku liczbowego; **albo** naprawa detekcji, **albo** sprostowanie zdania w V12K-306 („lista ZAMKNIĘTA") — obietnica jest warta tyle, ile detekcja. Priorytet 3, tanie.

---

### 3. Kolejność i równoległość

**Tor równoległy 1 (rozłączne pliki, mogą iść jednocześnie):**

| Tor | Pliki | Zawartość |
|---|---|---|
| **T1** | `solvers/power_flow_zip.py`, `application/reference_networks/sld_substrate_power_flow.py` | A1 + A2 |
| **T2** | `api/enm.py`, `api/generators.py` | C (potem G w tym samym torze — kolizja na `api/enm.py`) |
| **T3** | `enm/store.py`, `enm/dziennik_zmian.py` | D |
| **T4** | `solvers/power_flow_oltc_studies.py`, `solvers/power_flow_oltc.py`, `ui2/wyniki/oltc/**` | E |
| **T5** | `enm/domain_operations.py`, `api/domain_ops_policy.py` | F |
| **T6** | `scripts/no_direct_fault_params_guard.py` + test | H |

**Zależności szeregowe (nie łamać):**
- **A1 → B**: naprawa falownika musi wiedzieć, czym jest `p_spec` po rozdzieleniu. B budowane przed A1 stanie na ruchomym gruncie.
- **C → G**: oba w `api/enm.py`, w tej samej funkcji `domain_ops` (:858-915 vs :873).
- **T5 → G**: F ustala inwentarz bramy, G ustala, że wynik bramy nie jest wyrzucany. Kolejność F przed G upraszcza obie.
- **T1 vs T4**: rozłączne pliki, ale wspólna regresja `pytest tests/network_model/solvers` — scalać po kolei, nie równolegle w jednym worktree.

**Bramki, których dziś brakuje i które muszą wejść z kartami** (każde potwierdzone znalezisko leży dokładnie w nieprzetestowanym iloczynie cech):
- A1: `k_pf ≠ 0` **×** generacja na szynie (dziś wszystkie testy ZIP stoją na `a_p=1`, `grep k_pf` w `test_zip_generation_split.py` = 0).
- A2: odbiór pojemnościowy (Q < 0) **×** odbiór ZIP na jednej szynie **×** bieg **zwarciowy**.
- B: odbiór **×** źródło z regulacją cosφ na jednej szynie.
- C: `apply` **×** `domain-ops` (dziś 5/5 testów bada wyłącznie apply-vs-apply).
- D: `set_enm` z **tym samym obiektem** (dziś wszystkie podają `model_copy(deep=True)`) **×** awaria w `dziennik_zmian._zapisz` (dziś iniekcja tylko w `_persist_enm`).
- E: OLTC bez `deadband_kv` i bez `voltage_setpoint_kv` — profil roczny.
- F/G: zły ref i fałszywa tabliczka w operacjach **stacyjnych** (dziś bramkowane tylko atomowe).
- H: trzy formy pośrednie wywołania + drugie wywołanie w pliku z zapadki.

---

### 4. Ocena całości

**Zrobione dobrze:**
- Rdzeń karty C (część napięciowa) jest poprawny i spójny w trzech solverach: jakobian różniczkuje bazę odbiorową, człon stały ma pochodną 0, sieci bez generacji na szynie ZIP zachowują **tożsamość bitową** (potwierdzone niezależnie).
- Higiena FROZEN/determinizmu wzorowa: odciski solverów przeliczone dla dokładnie 4 realnie zmienionych plików, złote sieci nietknięte, serializacja addytywna (`to_dict` pomija `None`), zapadka mypy **zacieśniona** 24/15 → 22/14.
- Karta D wprowadziła właściwy wzorzec: kryterium jako **dana wyniku** (`FeasibilityCriterion` z wartością i źródłem) + kod gotowości z realnym emiterem i konsumentem, zamiast literału `0.05 * target_kv`. Odporna na sabotaż (iniekcja mnożnika zapala 2 testy).
- Karta H: regex → AST, bramka realnie skanuje 762 pliki, fail-closed na pustym skanie.
- Karta I: `werdykt_zbiorczy` FAIL > NIEDOSTĘPNY > PASS z przeglądem inwentarza konsumentów.

**Gdzie jakość jest cienka — jeden błąd metodyczny, cztery razy:**

> **Naprawiono INSTANCJĘ nazwaną w audycie, nie KLASĘ.** W każdej z czterech kart zbiór, na którym działa nowy mechanizm, jest inny niż zbiór, na którym powinien: rozdziela się szersze niż dokleja (C), bramkuje się transformator, ale nie źródło nN i aparat (A), blokuje się jeden z czterech cykli zapisu (G), wycofuje się model, ale nie dziennik (G).

Wtórne słabości, wprost z powyższego:
1. **Testy pisane pod przykład z karty, nie pod iloczyn cech.** Każde potwierdzone znalezisko siedzi w luce, którą widać gołym okiem po greppie (`k_pf` × generacja, alias × `model_copy`, apply × domain-ops).
2. **Deklaracje mocniejsze niż kod.** „Operacja meldująca błąd nie zostawia ŻADNEGO skutku" i „lista ZAMKNIĘTA: KAŻDE nowe miejsce = naruszenie" są w docstringach i rejestrze, ale nie mają przypiętego testu — to fałszywa pewność na przyszłość, groźniejsza niż sam defekt.
3. **Uczciwość fizyczna niedomknięta w obrębie jednego pliku**: karta D zakazała zmyślonego progu w §17 i zostawiła `0.000 kV` w §8 tego samego modułu.
4. **Parytet między torem atomowym a stacyjnym** jest łamany systematycznie (ten sam zły ref: 422 w `add_sn_bay`, 200 w `append_station_on_endpoint`) — to sygnał, że brama API jest budowana per-operacja zamiast per-element wiązany katalogiem.

---

### 5. Surowa ocena znalezisk bez własnego dowodu

Cztery zgłoszenia trafiły do mnie bez adwersaryjnej weryfikacji. **Sam sprawdziłem ich mechanizmy w kodzie — żadne nie jest czystą hipotezą, ale żadne nie ma potwierdzonego e2e:**

- **A2 (`validate_zip_coeffs`)** — mechanizm **potwierdzony moją sondą**: `aggregate_zip([(3.0, 1.5, CONST_Z), (1.0, -1.0, None)])` → `ValueError: ZIP a_Q must be in [0, 1], got 3.0`, rzucone z `enm/mapping.py:578`, czyli ze środka `map_enm_to_network_graph`, którego konsumentami są m.in. `canonical_analysis.py:1034` (zwarcie) i `wytrzymalosc_cieplna_przewodow.py:497`. **Do odtworzenia przed zamknięciem karty**: że odbiór pojemnościowy powstaje ścieżką produkcyjną i że bieg SC realnie kończy się `FAILED`. Do czasu odtworzenia — teza „regresja fali" jest wiarygodna, ale nieudowodniona.
- **H/wykluczenie per plik** — **potwierdzone lekturą**: `is_whitelisted` (:109) zwraca po nazwie pliku, `check_file` (:168-169) wraca **przed** parsowaniem. Wniosek („piąte wywołanie w pliku z zapadki przejdzie") wynika wprost z kodu. Traktuję jako potwierdzone, waga średni.
- **E/front (`EkranBadanOltc.tsx:277`)** — **potwierdzone lekturą obu stron**: backend wstawia klucz warunkowo (`if tc.voltage_setpoint_kv is not None`, :331), front renderuje `k.within_deadband[branchId] ? T.tak : T.nie`, a kontrakt `oltcBadaniaModel.ts:43` deklaruje `Record<string, boolean>` bez opcjonalności — typ obiecuje komplet, którego backend nie gwarantuje. Sam scenariusz (MANUAL bez nastawy → „0 poza pasmem" nad tabelą trzech „nie") opiera się na cudzej sondzie — **do odtworzenia**.
- **F/aparat (`domain_operations.py:7760`)** — **potwierdzone lekturą**: `catalog_ref` zapisywany surowo, `materialized_params: null`, a w `meta.catalog_message` zdanie o „jawnie wskazanej pozycji katalogu" **bez sprawdzenia, czy pozycja istnieje** (fabrykacja wobec phantom rule). Pomiar HTTP nieodtworzony — **do potwierdzenia**, ale skutek liczbowy dziś zerowy (`r_ohm = x_ohm = 0`), więc waga średni stoi i tak.

**Zasada na kolejną falę:** karty A1, C, D, E, F ruszają dopiero z testem, który **przed** naprawą jest czerwony na HEAD. Trzy z ośmiu defektów przeżyły odbiór wyłącznie dlatego, że bramka karty testowała ten sam przykład, na którym ją pisano.

---

## 2. Znaleziska potwierdzone (pełny materiał dowodowy)

### P1. [KRYTYCZNY] Odbior ZIP zalezny TYLKO od czestotliwosci: rozdzielenie zabiera generacje z szyny i nigdy jej nie oddaje

**Miejsce:** `mv-design-pro/backend/src/network_model/solvers/power_flow_zip.py:178`

**Opis:** Zbior szyn ROZDZIELANYCH i zbior szyn PRZELICZANYCH sa rozne. `split_zip_constant_part` (w. 118-160) rozdziela KAZDA szyne, ktora deklaruje `zip_base_p_mw`/`zip_base_q_mvar`, natomiast `zip_effective_spec` (w. 178-189) dodaje czesc stala WYLACZNIE dla indeksow obecnych w `zip_table`: `if not zip_table: return p_spec, q_spec` oraz `for idx, c in zip_table.items(): ... p_eff[idx] += zip_const[0][idx]`. Tabele buduje `build_zip_table`, ktore w w. 102 pomija wspolczynniki bez zaleznosci NAPIECIOWEJ: `if c is None or c.is_constant_power(): continue`. Tymczasem `aggregate_zip` zwraca NIE-None takze dla odbioru o trywialnym wielomianie napieciowym (a=b=0, c=1), ale z niezerowa czuloscia czestotliwosciowa k_pf/k_qf (`has_frequency_dependence()`), a `enm/mapping.py:583` ustawia `zip_load_active_power` na podstawie samego warunku `bus_zip is not None`. Skutek: dla takiej szyny p_spec zostaje przestawione na baze ODBIOROWA, czesc stala (generacja) laduje w `zip_const` i NIGDY nie wraca do rownania. Generacja znika z modelu. Identycznie w NR, GS i FD (kazdy wola ten sam `zip_effective_spec`), wiec parytet miedzysolverowy tego nie wykrywa — trzy solvery zgadzaja sie na tej samej blednej wartosci. Slad WHITE BOX `zip_loads` nie zawiera takiej szyny (buduje sie tylko z `zip_table`), wiec audytor liczb tez tego nie zobaczy. Uwaga: defekt strzela juz przy f = f0 = 50 Hz — odchylka czestotliwosci NIE jest potrzebna, wystarczy typ katalogowy LoadType z k_pf != 0 (pole kontraktu materializacji OBCIAZENIE, catalog/types.py:3223-3237).

**Scenariusz awarii:** Szyna SN 15 kV: odbior 3,0 MW / 1,5 Mvar z typu katalogowego o wspolczynnikach a_p=b_p=0, c_p=1, k_pf=2,0, k_qf=1,0 (wielomian napieciowy trywialny, czulosc czestotliwosciowa niezerowa) ORAZ generator 2,0 MW na TEJ SAMEJ szynie; zasilanie GPZ linia 12 km 0,4+j0,8 om/km, S_b = 10 MVA, f = 50 Hz. Fizyka: P_szyny = -3,0 + 2,0 = -1,0 MW. Lancuch produkcyjny raportuje p_injected_mw = -3,0 MW (pobor 3,0 MW zamiast 1,0 MW), q_injected_mvar = -1,5 Mvar, GPZ pobiera 3,3391 MW zamiast ok. 1,05 MW, przeplyw galezi p_to = -3,0 MW. Generator 2,0 MW jest w wyniku NIEOBECNY — blad 2,0 MW, czyli 200 % mocy netto szyny. Dla sieci z przewaga generacji (P_gen > P_odb) znak mocy na przylaczu jest odwrocony — dokladnie ta klasa bledu, ktora karta C miala usunac.

**Dowód przeglądu:** (1) Sonda solverowa (numpy, PowerFlowInput budowany wprost): PQSpec(p_mw=1,0, q_mvar=1,0, zip_base_p_mw=3,0, zip_base_q_mvar=1,0, zip_coeffs=ZipCoeffs(0,0,1,0,0,1,k_pf=2,0,k_qf=1,0)) — NR/GS/FD zgodnie zwracaja p_inj = -0,3 pu i U_B = 0,979370 pu; wariant referencyjny bez rozdzielenia (zip_base=None) daje -0,1 pu i U_B = 0,987844 pu. Ten sam model ze wspolczynnikami stalej impedancji (a=1) dziala poprawnie (-0,09303 pu), co izoluje przyczyne do wykluczenia w build_zip_table. (2) Sonda mapowania: map_enm_to_network_graph dla ENM z tym odbiorem i generatorem 2,0 MW zwraca zip_coeffs.is_constant_power() = True, active_power = -1,0, zip_load_active_power = -3,0 — czyli rozdzielenie JEST deklarowane dla szyny, ktora nigdy nie trafi do zip_table. (3) Sonda end-to-end na sciezce produkcyjnej (create_run/execute_run, analysis_type='PF', fixture z tests/enm/test_zip_generation_split.py, zmieniony wylacznie blok materialized_params): run FINISHED, bus_results b2 p_injected_mw = -3.0, q_injected_mvar = -1.5, b1 p_injected_mw = 3.3390628873736405, branch p_to_mw = -2.99999999973815. Pliki sond usuniete, git status --porcelain pusty.

**Werdykt sceptyka:** NIE OBALONE. NIE UDALO SIE OBALIC — znalezisko broni sie w calosci, z odtworzonym biegiem.

Probowalem obalic czterema drogami i kazda odpadla:
1. „Sciezka nieosiagalna w produkcji" — odpada. Wspolczynnik k_pf jest polem kontraktu materializacji katalogu OBCIAZENIE (catalog/types.py:3230-3236) ORAZ przechodzi publicznym PUT /api/cases/{case_id}/enm przez `loads[].materialized_params`. Sonda przeszla pelnym lancuchem create_run/execute_run, nie na samej funkcji.
2. „Zabezpieczenie wyzej albo nizej" — nie ma zadnego. Sprawdzilem calosc drogi: aggregate_zip -> Node.zip_load_* -> PQSpec.zip_base_* -> split_zip_constant_part -> build_zip_table -> zip_effective_spec. Rozjazd jest dokladnie tam, gdzie wskazuje znalezisko: zbior ROZDZIELANY (kryterium: obecnosc zip_base) jest szerszy niz zbior PRZELICZANY (kryterium: is_constant_power == False), a nadmiarowa reszta nigdy nie wraca do rownania.
3. „Zachowanie zamierzone/udokumentowane" — odpada. Przeczytalem wiersze V12K-305..314. V12K-313 stawia warunek twardy „wielomian napieciowy dotyczy WYLACZNIE czesci odbiorowej; generacja to stala moc PQ" — sonda pokazuje pogwalcenie tego wlasnego warunku (generacja nie jest stala, tylko ZEROWANA). W „DLUGI NAZWANE" V12K-313 sa trzy pozycje (akumulacja w build_power_spec_v2, martwa instrukcja w FD, GN_03) — tej luki wsrod nich NIE MA. Nie jest tez nazwana w V12K-312 ani V12K-314.
4. „Scenariusz nie odtwarza sie w rzeczywistym biegu" — odtwarza sie co do cyfry: b2 p_injected -3,0000 MW zamiast -1,0000 MW, b1 GPZ 3,33906 MW zamiast 1,08452 MW, p_to galezi -3,0 MW, generacja 2,0 MW nieobecna. Zgodne z liczbami podanymi w znalezisku (3,3391 MW).

Kontrola poprawnosci samego dowodu (zeby nie potwierdzic artefaktu sondy): oba biegi roznia sie WYLACZNIE dwoma wspolczynnikami czestotliwosciowymi, ktore przy f = f0 = 50 Hz daja mnoznik dokladnie 1,0 (`frequency_factor` = 1 + k*(f-f0)/f0), a wielomian napieciowy jest trywialny (a=b=0, c=1) — fizycznie oba modele sa TYM SAMYM ukladem. Roznica 2,0 MW nie ma wiec zadnego uprawnionego zrodla. Dodatkowo bieg na commicie bazowym fali (05138f2d) daje w obu wariantach -1,0000 MW, co dowodzi, ze to regresja wniesiona w recenzowanym zakresie przez karte C, a nie zastany dlug.

Luka w pokryciu, ktora to przepuscila: tests/test_power_flow_zip.py testuje czestotliwosc na szynie BEZ generacji (test_frequency_at_nominal_is_noop, w. 231-235 — brak zip_base), a rozdzielenie generacji testuje wylacznie ze wspolczynnikami NAPIECIOWYMI (_solve_with_generation, w. 363-389, wolane z CONST_Z). Przeciecie obu cech nie jest przypiete nigdzie, takze w tests/enm/test_zip_generation_split.py (a_p = a_q = 1 we wszystkich wariantach).

Waga potwierdzona jako krytyczna: zle liczby inzynierskie na produkcyjnej sciezce PF (200 % bledu mocy netto szyny, U zanizone o 6,4 pp), trzy solvery zgodne na blednej wartosci (parytet tego nie lapie), a szyna jest nieobecna w sladzie WHITE BOX `zip_loads` (power_flow_newton_internal.py:209), wiec audyt liczb tez tego nie wykryje. Dla sieci z przewaga generacji znak mocy na przylaczu bywa odwrocony — dokladnie ta klasa bledu, ktora karta C miala usunac.

Uwaga uboczna (poza znaleziskiem): w drzewie roboczym lezy nieusunieta sonda z wczesniejszej sesji mv-design-pro/backend/tests/api/test_sonda_zrodlo_nn.py (nietrackowana, nie moja) — do sprzatniecia.

**Dowód sceptyka:** SONDA NA SCIEZCE PRODUKCYJNEJ (create_run/execute_run + PUT /api/cases/{id}/enm jako realne wejscie), plik tymczasowy tests/enm/test_probe_zip_freq_only.py — usuniety po biegu; `git diff --stat HEAD` pusty, HEAD 6307dfb3.

Uklad wg scenariusza znaleziska: b1 GPZ (slack, Sk3 500 MVA) — linia 12 km 0,4+j0,8 om/km — b2 15 kV; odbior 3,0 MW / 1,5 Mvar, generator 2,0 MW na TEJ SAMEJ szynie b2; S_b = 10 MVA, f = 50 Hz. Dwa biegi roznia sie WYLACZNIE materialized_params odbioru:
  A (odniesienie, stala moc): a=b=0, c=1, bez k
  B (sonda): a=b=0, c=1, k_pf=2,0, k_qf=1,0, f0=50 Hz

WYNIK NA SZCZYCIE (6307dfb3):
  A: b2 p_injected = -1,0000 MW, q = -1,5000 Mvar, U = 0,905714 pu; b1 = +1,08452 MW
  B: b2 p_injected = -3,0000 MW, q = -1,5000 Mvar, U = 0,841328 pu; b1 = +3,33906 MW
  galaz p_to = -3,0000 MW; GS: -3,0 MW; FD: -3,0 MW (parytet na blednej wartosci)

Przy f = f0 mnoznik `frequency_factor` wynosi DOKLADNIE 1,0 i wielomian napieciowy jest trywialny, wiec oba biegi MUSZA dac identyczny wynik. Nie daja: generacja 2,0 MW znika, blad 200 % mocy netto szyny, U zanizone o 6,4 punktu procentowego (0,9057 -> 0,8413), GPZ 3,339 MW zamiast 1,085 MW. Liczby zgadzaja sie co do cyfry z opisem znaleziska.

BIEG KONTROLNY NA BAZIE FALI (worktree 05138f2d, ta sama sonda, to samo srodowisko):
  A: b2 = -1,0000 MW; B: b2 = -1,0000 MW; GS/FD: -1,0 MW
Czyli przed fala scenariusz byl POPRAWNY — to REGRESJA wniesiona karta C (V12K-313). `git show 05138f2d:...power_flow_zip.py | grep -c split_zip_constant_part` = 0.

MECHANIZM (potwierdzony w kodzie):
 - power_flow_zip.py:139-158 `split_zip_constant_part` rozdziela KAZDA szyne z `zip_base_p_mw`, ustawia `p_spec[idx] = p_base_pu` i chowa generacje w `p_const[idx]`.
 - power_flow_zip.py:101-103 `build_zip_table`: `if c is None or c.is_constant_power(): continue` — szyna freq-only NIE trafia do tabeli (is_constant_power patrzy tylko na a/b, w. 58-64).
 - power_flow_zip.py:180-181 `zip_effective_spec`: `if not zip_table: return p_spec, q_spec` oraz petla `for idx, c in zip_table.items()` — czesc stala dodawana jest WYLACZNIE dla indeksow z tabeli, wiec generacja nie wraca.
 - Wywolanie z tym samym zestawem argumentow w NR (power_flow_newton.py:147-150), GS (:229-236) i FD (:251-258) — stad zgodnosc trzech solverow na blednej liczbie.
 - Slad WHITE BOX: power_flow_newton_internal.py:209 `for z_idx in sorted(zip_table)` — szyna freq-only jest w sladzie `zip_loads` NIEOBECNA, wiec audytor liczb tego nie zobaczy. Potwierdzone w sondzie.

OSIAGALNOSC: `zip_coeffs_from_materialized_params` (power_flow_zip.py:243-246) zwraca NIE-None gdy `has_frequency_dependence()`; `aggregate_zip` (:302-304) tak samo; enm/mapping.py:583-584 ustawia `zip_load_active_power` na samym warunku `bus_zip is not None`; enm/canonical_analysis.py:1572-1579 przepisuje to na `zip_base_p_mw`. Zrodlo danych: kontrakt materializacji OBCIAZENIE zawiera `k_pf`/`k_qf`/`f0_hz` (catalog/types.py:3230-3236) plus pola LoadType (:1988-1990); niezaleznie od katalogu wejsciem jest publiczne `PUT /api/cases/{case_id}/enm` (api/enm.py:143), ktore przyjmuje `loads[].materialized_params` (enm/models.py:351).

### P2. [KRYTYCZNY] Rozdzielenie ZIP wykonywane PRZED ksztaltowaniem falownika: moc bierna generatora liczona z mocy czynnej ODBIORU, baza Q odbioru kasowana

**Miejsce:** `mv-design-pro/backend/src/network_model/solvers/power_flow_newton.py:147`

**Opis:** W kazdym z trzech solverow kolejnosc jest: `split_zip_constant_part` (NR w. 147, GS w. 229, FD w. 251) -> `apply_zip_frequency` -> `apply_inverter_setpoint` (NR w. 153, GS w. 241, FD w. 263). Po rozdzieleniu `p_spec[idx]` NIE jest juz moca wypadkowa szyny, tylko baza ODBIOROWA. `apply_inverter_setpoint` (power_flow_inverter.py:178-185) tego nie wie i liczy: `p_spec[idx] *= lfsm_factor(...)` (statyzm P(f) skaluje ODBIOR zamiast generacji), `p_inj = abs(p_spec[idx])` (moc czynna ODBIORU zamiast wstrzyku falownika), `q_spec[idx] = c.q_over_p * p_inj` — przypisanie NADPISUJE baze Q odbioru, wiec zapotrzebowanie bierne odbioru znika z modelu, a nastepnie `zip_effective_spec` mnozy ten nastaw falownika przez wielomian napieciowy ODBIORU. Komentarz kontraktu (power_flow_types.py:48-50: 'Mutually exclusive with zip_coeffs on a given bus') zaklada rozlacznosc, ale `enm/canonical_analysis.py:1549-1580` buduje JEDEN PQSpec na szyne i ustawia jednoczesnie `inverter_control=converter_control_by_node.get(node_id)` oraz `zip_coeffs`/`zip_base_*` — szyna prosumencka (odbior + zrodlo z regulacja cos fi lub Q(U)) laduje w obu zbiorach. Przed fala baza dla p_inj byla moca WYPADKOWA szyny; rozdzielenie zmienilo ja na moc ODBIORU, wiec jest to zmiana WARTOSCI wprowadzona w tej fali, nieopisana w ADR-011 par. 4a ani w V12K-313.

**Scenariusz awarii:** Szyna SN 15 kV: odbior 3,0 MW / 1,5 Mvar o charakterystyce stalej impedancji (a_p=a_q=1) ORAZ generator 2,0 MW na tej samej szynie z meta.control_mode='STALY_COS_PHI', cos fi = 0,95 (kanoniczna sciezka _build_converter_control_by_node, V12K-051). Fizyka: Q_szyny(V) = -1,5*(V/V0)^2 + tan(arccos 0,95)*2,0 = -0,8951 Mvar (szyna POBIERA moc bierna). Lancuch raportuje q_injected_mvar = +1,0205 Mvar, czyli szyna ODDAJE moc bierna — ZNAK ODWROCONY, roznica 1,92 Mvar. Rownolegle p_injected_mw = -1,1049 MW zamiast -0,983 MW i v_pu = 1,01733 zamiast 0,99154 (+2,6 %, tj. +387 V na 15 kV). Kazdy raport spadku napiecia, bilansu mocy biernej i oceny warunkow przylaczeniowych dla takiej szyny idzie z bledna liczba.

**Dowód przeglądu:** Sonda end-to-end (create_run/execute_run, PF, fixture tests/enm/test_zip_generation_split.py z dolozonym meta.control_mode/cos_phi na generatorze): HEAD zwraca p_inj = -1.1049063298755848 MW, q_inj = 1.0205333586993446 Mvar, v_pu = 1.0173341519015249. Tozsamosc liczbowa udowodniona co do ostatniej cyfry: tan(arccos 0,95) * 3,0 MW * v_pu^2 = 1.0205333586993448 — a wiec raportowana moc bierna to nastaw falownika policzony z 3,0 MW ODBIORU i przemnozony przez wielomian napieciowy odbioru; skladnik -1,5*V^2 odbioru zniknal calkowicie. Kontrola stanu sprzed fali (podmiana split_zip_constant_part na funkcje zwracajaca None we wszystkich trzech modulach solverow): q_inj = 0.3231452827239489 = tan(arccos 0,95) * 1,0 MW (moc WYPADKOWA) * v_pu^2 — rowniez co do ostatniej cyfry, co potwierdza, ze to rozdzielenie zmienilo baze. Fizyka referencyjna -1,5*v_pu^2 + tan(arccos 0,95)*2,0 = -0.8950849545800658 Mvar. Plik sondy usuniety, git status --porcelain pusty.

**Werdykt sceptyka:** NIE OBALONE. Znalezisko BRONI SIE co do skutku, ale jego DIAGNOZA i przypisanie do fali sa bledne — obie rzeczy udowodnilem biegiem.

CO SIE POTWIERDZILO (nie moge tego obalic):
- Kolejnosc z opisu jest faktem: power_flow_newton.py:147 `split_zip_constant_part(...)` -> 150 `apply_zip_frequency` -> 153 `apply_inverter_setpoint` (tak samo GS 229/241, FD 251/263).
- power_flow_inverter.py:179-181 `p_inj = abs(p_spec[idx])` / `q_spec[idx] = c.q_over_p * p_inj` naprawde bierze moc SZYNY jako moc falownika i PRZYPISANIEM kasuje baze Q odbioru.
- enm/canonical_analysis.py:1550-1580 buduje JEDEN PQSpec z jednoczesnym `inverter_control` i `zip_coeffs`/`zip_base_*`, lamiac komentarz kontraktu power_flow_types.py:52-54 („Mutually exclusive with zip_coeffs on a given bus"). Nic tego nie waliduje ani nie zglasza.
- Scenariusz awarii odtwarza sie CO DO CYFRY: v_pu=1,01733415, p=-1,104906 MW, q=+1,020533 Mvar przy fizyce 0,95223814 / -0,720272 / -0,702768. Znak mocy biernej odwrocony, napiecie +6,8 %. To sa zle liczby inzynierskie w raporcie spadku napiecia i bilansu Q.
Zaden warunek obalenia nie zachodzi: kod ma te wade, sciezka jest osiagalna (patrz nizej), nie ma zabezpieczenia wyzej ani nizej, zachowanie nie jest udokumentowane jako zamierzone (kanon mowi cos przeciwnego), a bieg odtwarza awarie.

CO OBALILEM I CO TRZEBA SPROSTOWAC W KARCIE NAPRAWCZEJ:
1. ROZDZIELENIE ZIP NIE JEST PRZYCZYNA. Przy odbiorze stalej mocy `split_zip_constant_part` zwraca None (wiersz 147 nic nie robi), a mimo to lancuch daje q=+0,328684 Mvar zamiast -0,842632 Mvar — ten sam odwrocony znak. Przyczyna lezy wylacznie w power_flow_inverter.py:178-185 (baza = moc WYPADKOWA szyny + PRZYPISANIE kasujace Q odbioru), nie w kolejnosci wprowadzonej karta C. Kotwica pliku/wiersza w znalezisku (power_flow_newton.py:147) wskazuje niewinny wiersz.
2. TO NIE JEST DEFEKT WPROWADZONY W TEJ FALI. Na kodzie sprzed karty C (a4be1a4e) ten sam uklad daje v_pu=0,99153845 przy fizyce 0,95223814 — juz bylo zle. Fala zmienila WIELKOSC bledu (blad napiecia z +4,1 % na +6,8 %), a nie jego istnienie. Defekt jest zastany, z linii V12K-051 (most jezyka OZE -> InverterControl), i nie zostal nazwany w V12K-305..314.
3. LICZBY ODNIESIENIA W ZNALEZISKU SA BLEDNE. Znalezisko podaje jako „poprawne" v_pu=0,99154 i q=-0,8951 Mvar. 0,99154 to dokladnie wynik lancucha SPRZED fali (rowniez bledny), a -0,8951 powstaje z podstawienia bledngo napiecia 1,0173 do wzoru fizyki. Prawdziwa fizyka: v=0,95224, p=-0,720272 MW, q=-0,702768 Mvar. Podana „roznica 1,92 Mvar / +387 V" jest liczona wzgledem zlej bazy (realnie 1,723 Mvar i +6,8 %).
4. OSIAGALNOSC INNA NIZ OPISANA. Scenariusz z karty (falownik OZE na szynie SN 15 kV) jest ODRZUCANY przez ENMValidator (E028 — falownik to element nN, wymagany transformator nn/SN), a zaden katalogowy typ odbioru nie niesie niedomyslnego ZIP, wiec wariant „ZIP + regulacja" wymaga recznie zredagowanej migawki. NATOMIAST wariant bez ZIP jest w pelni produkcyjny: add_converter_source/nn_side wpina falownik z cos fi pod szyne nN stacji (domain_operations_v2.py:3409), na ktorej mieszkaja domyslne odbiory nN materializowane katalogiem — i tam bledny, odwrocony znak Q wychodzi dzis.

WNIOSEK: znalezisko zostawiam POTWIERDZONE (obalony=false), ale karta naprawcza ma isc w power_flow_inverter.apply_inverter_setpoint + wiazanie w canonical_analysis (falownik musi wnosic WLASNA moc czynna i DODAWAC swoja Q do bazy odbioru, zamiast czytac i nadpisywac spec szyny), a nie w kolejnosc wywolan przy power_flow_newton.py:147. Waga: wysoki (bledne zachowanie w realnej sciezce nn_side), a nie „krytyczny — regresja tej fali", bo defekt jest zastany i niezalezny od ZIP.

**Dowód sceptyka:** SONDA NA PRODUKCYJNEJ SCIEZCE (create_run/execute_run, HEAD 6307dfb3), plik tymczasowy mv-design-pro/backend/tests/enm/test_sonda_prosument_zip_falownik.py (po biegu usuniety; `git status` pusty, zaden plik sledzony nie byl dotkniety). Uklad jak w tescie karty C: GPZ 15 kV -> linia 12 km 0,4+j0,8 om/km -> szyna b2; na b2 odbior 3,0 MW / 1,5 Mvar o stalej impedancji (a_p=a_q=1) ORAZ generator 2,0 MW; sedzia = niezalezny Newton w czystym numpy (P(V)=-3V^2+2, Q(V)=-1,5V^2+tan(arccos0,95)*2 = -1,5V^2+0,657368).

(1) HEAD, generator z meta.control_mode=STALY_COS_PHI, cos fi=0,95:
    LANCUCH: v_pu=1,01733415  p=-1,104906 MW  q=+1,020533 Mvar
    FIZYKA : v_pu=0,95223814  p=-0,720272 MW  q=-0,702768 Mvar
    Liczby lancucha zgadzaja sie CO DO CYFRY z tymi, ktore podaje znalezisko (1,01733 / -1,1049 / +1,0205). Znak Q odwrocony, roznica 1,723 Mvar, napiecie o 6,8 % za wysokie.
(2) TEN SAM model bez regulacji (meta puste): LANCUCH v_pu=0,92731088 p=-0,579716 q=-1,289858 == FIZYKA co do 1e-8. Blad pochodzi wiec WYLACZNIE z ksztaltowania falownika.
(3) TEN SAM uklad z odbiorem STALEJ MOCY (model "pq", a_p=0/c_p=1 ⇒ zip_coeffs=None ⇒ split_zip_constant_part zwraca None, wiersz 147 jest bezczynny):
    LANCUCH: v_pu=0,99137055  q=+0,328684 Mvar
    FIZYKA : v_pu=0,93862236  q=-0,842632 Mvar
    Ten sam odwrocony znak Q BEZ ZADNEGO rozdzielenia ZIP.
(4) KOD SPRZED FALI — worktree na a4be1a4e (rodzic 2095a758, czyli commitu karty C), ta sama sonda, uruchomiona interpreterem venva backendu:
    LANCUCH z regulacja: v_pu=0,99153845 (fizyka 0,95223814) — juz wtedy blednie.
(5) POMIARY OSIAGALNOSCI: (a) ENMValidator ODRZUCA falownik wpiety wprost w szyne SN (E028: „Kazdy falownik energoelektroniczny jest elementem nN — wymagany transformator nn/SN"), wiec scenariusz ZIP musialem zbudowac na gen_type=synchronous z recznie wpisanym meta.control_mode; (b) zaden katalogowy LoadType nie ma niedomyslnego ZIP (get_default_mv_catalog(): load_mieszk_15kw / load_przem_75kw / load_uslugi_30kw wszystkie a_p=0, c_p=1), wiec ZIP wchodzi tylko z recznie zredagowanej / zaimportowanej migawki ENM; (c) ale produkcyjna operacja add_converter_source w wariancie nn_side wpina falownik z meta {control_mode, cos_phi} pod `"bus_ref": bus_nn_ref` (domain_operations_v2.py:3409), czyli pod te sama szyne nN stacji, na ktorej catalog_completion.complete_station_loads_from_nn_feeders materializuje domyslne odbiory nN — wiec konfiguracja „odbior + zrodlo z regulacja na jednej szynie" JEST produkcyjna, w wariancie z punktu (3).

### P3. [KRYTYCZNY] Podzial ZIP gubi CALA generacje na szynie, gdy odbior jest wrazliwy na czestotliwosc, a nie na napiecie

**Miejsce:** `mv-design-pro/backend/src/network_model/solvers/power_flow_zip.py:141`

**Opis:** Nowy `split_zip_constant_part` przebazowuje `p_spec`/`q_spec` na czesc ODBIOROWA i zwraca reszte (generacje) jako czlon staly. Warunek wejscia do podzialu to SAMA OBECNOSC pol `zip_base_*` (w. 138-141: `base_p = getattr(spec, "zip_base_p_mw", None) ... if base_p is None and base_q is None: continue`). Natomiast czlon staly jest DODAWANY z powrotem wylacznie dla szyn obecnych w `zip_table` (w. 183: `for idx, c in zip_table.items():` + w. 186 `if zip_const is not None:`), a `build_zip_table` POMIJA szyny stalomocowe napieciowo (w. 102: `if c is None or c.is_constant_power(): continue` — komentarz w. 96-97 mowi wprost „Frequency-only loads are excluded here"). Predykaty sie rozjezdzaja. Rownolegle `enm/mapping.py` w. 581-582 ustawia `zip_load_active_power` dla KAZDEJ szyny, ktorej `aggregate_zip` zwrocil cokolwiek — a zwraca takze wielomian stalomocowy napieciowo z niezerowym `k_pf`/`k_qf` (`aggregate_zip` konczy `if agg.is_constant_power() and not agg.has_frequency_dependence(): return None`, wiec sam `k_pf` wystarczy). Skutek: dla szyny z odbiorem o zadeklarowanej wrazliwosci czestotliwosciowej (a=b=0, c=1, k_pf!=0) i z generacja solver liczy z SAMYM odbiorem, a moc generatora znika z bilansu. Dotyczy jednakowo NR, GS i FD (kazdy wola `split_zip_constant_part`, a dodanie czlonu stalego siedzi w galezi `idx in zip_table`). Wejsciem jest kontrakt katalogowy `LoadType.k_pf/k_qf` (catalog/types.py w. 1989-1990, w `solver_fields` namespace OBCIAZENIE) oraz import ENM przez PUT /api/.../enm — ta sama brama, na ktorej audyt oparl D1.

**Scenariusz awarii:** Sciezka produkcyjna create_run/execute_run, siec: GPZ 15 kV (Sk3 500 MVA) — linia 12 km 0,4+j0,8 om/km — szyna b2 z odbiorem 3,0 MW / 1,5 Mvar i agregatem 3,0 MW na TEJ SAMEJ szynie; f = f0 = 50 Hz, wiec mnoznik czestotliwosciowy = 1,0 i fizycznie NIC sie nie zmienia. Wariant A (odbior stalomocowy, materialized_params bez k_pf): U_b2 = 0,9306387 pu, P wstrzyknieta na b2 = 0,0 MW — zgodne co do 1e-7 z niezaleznym Newtonem liczonym w czystym numpy. Wariant B (TEN SAM odbior, ale materialized_params z k_pf=2,0 / k_qf=1,0 / f0_hz=50): U_b2 = 0,8413283 pu, P wstrzyknieta = -3,0 MW — generator 3 MW zniknal z rachunku. Blad napiecia 0,0893 pu = 1340 V na szynie 15 kV; projektant dostaje spadek napiecia i prad w linii policzone dla szyny bez zrodla. To REGRESJA fali: identyczna sonda uruchomiona na kodzie sprzed zakresu (worktree 05138f2d) zwraca dla obu wariantow 0,9306387 pu i P = 0,0 MW.

**Dowód przeglądu:** 1) `build_zip_table([PQSpec(..., zip_coeffs=ZipCoeffs(0,0,1,0,0,1,k_pf=2.0,...))], {"B":0})` zwraca `{}` przy `is_constant_power()=True, has_frequency_dependence()=True`. 2) `map_enm_to_network_graph` dla ENM {Load 3 MW/1 Mvar z materialized_params {k_pf:2.0,k_qf:1.0,f0_hz:50}, Generator 2 MW/0,5 Mvar na tej samej szynie} zwraca `zip_coeffs=ZipCoeffs(a_p=0.0,b_p=0.0,c_p=1.0,...,k_pf=2.0)`, `active_power=-1.0`, `zip_load_active_power=-3.0` — czyli pole podzialu USTAWIONE, a szyna poza `zip_table`. 3) Sonda solverowa (dwie szyny, base 10 MVA): bez `zip_base` U_B=0,991917; z `zip_base` U_B=0,979370 — NR, GS i FD daja te sama zla wartosc (0,979370 dla wszystkich trzech). 4) Sonda na sciezce produkcyjnej (create_run/execute_run + set_enm) — liczby jak w scenariuszu; sedzia: wlasny Newton w numpy (bez uzycia badanego solvera) daje 0,9306387 pu i pobor +0,055422 MW. 5) Ta sama sonda na worktree 05138f2d (kod sprzed fali) → 0,9306387 pu w OBU wariantach; worktree usuniety, `git status` pusty. 6) Brak pokrycia: w tests/test_power_flow_zip.py, tests/enm/test_zip_wiring.py i tests/enm/test_zip_generation_split.py zaden test nie laczy `k_pf` z generacja na szynie (grep).

**Werdykt sceptyka:** NIE OBALONE. NIE OBALONE — proba obalenia nie powiodla sie na zadnej z czterech osi (kod, sciezka produkcyjna, zabezpieczenie wyzej/nizej, kanon). Znalezisko potwierdzam z jedna korekta faktograficzna (patrz pkt 6).

CO SPRAWDZILEM

1) Rozjazd predykatow w kodzie — POTWIERDZONY.
`power_flow_zip.py:138-141` wchodzi w podzial na SAMA obecnosc pol: `base_p = getattr(spec, "zip_base_p_mw", None) ... if base_p is None and base_q is None: continue`, po czym `w.154-157` przestawia `p_spec[idx]` na baze ODBIOROWA, a reszte (generacje) odklada do `p_const`. Czlon staly wraca WYLACZNIE w petli po `zip_table` — `w.183 for idx, c in zip_table.items():` + `w.186 if zip_const is not None:`. A `build_zip_table` w `w.102` robi `if c is None or c.is_constant_power(): continue`, gdzie `is_constant_power()` (`w.57-61`) bada TYLKO a/b napieciowe; komentarz `w.96-97` mowi wprost „Frequency-only loads are excluded here". Wielomian stalomocowy napieciowo z `k_pf != 0` przechodzi wiec podzial, ale nigdy nie odzyskuje czlonu stalego. Dotyczy NR (`power_flow_newton.py:147`; `power_flow_newton_internal.py:648 if zip_table or inv_table:` i `:653 if zip_table:` — czlon staly siedzi w srodku), GS (`power_flow_gauss_seidel.py:229`, `:601 if idx in zip_table`) i FD (`power_flow_fast_decoupled.py:251`).

2) Lancuch wejsciowy — POTWIERDZONY. `enm/mapping.py:583-584` ustawia `zip_load_active/reactive_power` dla KAZDEJ szyny, dla ktorej `aggregate_zip` zwrocil cokolwiek, a `aggregate_zip` konczy `w.302-303` warunkiem `is_constant_power() and not has_frequency_dependence()`, wiec sam `k_pf` wystarcza do zwrotu agregatu. `canonical_analysis.py:1572-1579` przepisuje to na `PQSpec.zip_base_p_mw/zip_base_q_mvar`.

3) SONDA na kanonicznej sciezce `create_run`/`execute_run` (siec z opisu: GPZ 15 kV Sk3 500 MVA — linia 12 km 0,4+j0,8 — b2: odbior 3,0 MW/1,5 Mvar + agregat 3,0 MW, f = f0 = 50 Hz, S_b = 10 MVA), odniesienie z NIEZALEZNEGO Newtona w czystym numpy:
  ODNIESIENIE  U = 0,9306387 pu, P_b2 = 0,000000 MW
  WARIANT A (materialized_params bez k_pf)            U = 0,9306387 pu, P = 0,000000 MW
  WARIANT B (te same dane + k_pf=2,0/k_qf=1,0/f0=50)  U = 0,8413283 pu, P = -3,000000 MW
  WARIANT B gauss-seidel                              U = 0,8413283 pu, P = -3,000000 MW
  WARIANT B fast-decoupled                            U = 0,8413283 pu, P = -3,000000 MW
Generator 3 MW znika z bilansu; blad 0,0893 pu = 1340 V na szynie 15 kV. Liczby z opisu znaleziska odtworzone co do 7. cyfry, parytet trzech metod potwierdzony.

4) REGRESJA FALI — POTWIERDZONA. Ta sama sonda w worktree na `05138f2d` (przed zakresem): oba warianty U = 0,9306387 pu, P = 0,000000 MW, test ZIELONY. Przed komitem `2095a758` nie bylo ani `PQSpec.zip_base_*`, ani `split_zip_constant_part`, wiec nie bylo czego zgubic. Zla liczba pojawia sie wylacznie po fali.

5) Zabezpieczenia wyzej/nizej — BRAK. Walidator ENM przepuszcza model (status != FAIL), `zip_coeffs_from_materialized_params` zwraca wspolczynniki (`w.243-244`), `validate_zip_coeffs` na wielomianie (0,0,1) przechodzi, a `newton_raphson_solve_v2` przy pustym `zip_table` i pustym `inv_table` w ogole nie wchodzi w blok efektywny (`:648`) — `p_spec` zostaje przestawiony na sama czesc odbiorowa. Nic tego nie lapie.

6) KOREKTA WOBEC OPISU (jedyna): brama wskazana w znalezisku jest bledna. `PUT /api/cases/{case_id}/enm` jest WYLACZONY w routerze produkcyjnym (`api/enm.py:933-938`, `_PRODUCTION_DISABLED_ROUTE_KEYS`), wiec „import ENM przez PUT" nie jest sciezka produkcyjna. To jednak NIE ratuje kodu — sprawdzilem droge alternatywna i jest ona zywa: `POST /api/cases/{id}/enm/domain-ops` z operacja `update_element_parameters` zapisuje `materialized_params` na odbiorze DOSLOWNIE, bo kolekcja `loads` nie nalezy do zbioru objetego lista dozwolonych pol (`domain_operations.py:6793: if coll in {"branches","transformers","branch_points","generators","substations"}`), a `w.6892-6895` wprost merguje kazdy klucz. Sonda HTTP przez TestClient na realnej aplikacji (`api.main:app`): domain-ops zwraca 200 i w migawce `loads[0].materialized_params.k_pf == 2.0`, a nastepny `POST /api/cases/{id}/runs/power-flow` zwraca U_b2 = 0,8413283 pu wobec 0,9306387 pu dla wariantu bez `k_pf`. Dodatkowo kontrakt katalogowy materializuje `k_pf`/`k_qf` do `Load.materialized_params` (`catalog/types.py`, MaterializationContract dla `OBCIAZENIE`, `solver_fields` zawiera `k_pf`, `k_qf`, `f0_hz`), a `LoadType` ma te pola jako ustawialne (`:1989-1990`) — wystarczy typ odbioru z czuloscia czestotliwosciowa bez udzialow ZIP (klasyczny model silnikowy: a=b=0, c=1, k_pf=2). W dzis dostarczanym katalogu (`mv_auxiliary_catalog.get_all_load_types`) sa trzy typy czysto PQ z k_pf=0 — to jedyna okolicznosc lagodzaca, ale nie zamyka drogi przez domain-ops.

7) Rejestr — NIE JEST TO NAZWANY DLUG. `REJESTR_KONFLIKTOW.md` wiersz V12K-313 (karta C, defekt D1) wymienia w „DLUGI NAZWANE" trzy pozycje: (1) `build_power_spec_v2` przypisuje zamiast akumulowac, (2) martwa instrukcja w FD, (3) GN_03 odrzucany dla PF. Przypadku czestotliwosciowego nie ma. Co wiecej, wpis stawia warunek twardy „generacja to stala moc PQ" — a tu generacja znika calkowicie, wiec zachowanie lamie wlasny kanon karty, nie realizuje go.

WERDYKT: znalezisko broni sie w rzeczywistym kodzie i w rzeczywistym biegu. Waga „krytyczny" uzasadniona (zla liczba w wyniku inzynierskim: napiecie, spadek i prad linii liczone dla szyny bez zrodla). Do naprawy: warunek wejscia w `split_zip_constant_part` i warunek dodania czlonu stalego musza byc TYM SAMYM predykatem — albo czlon staly nalezy dodawac niezaleznie od `zip_table` (np. wstrzykujac go do `p_spec` z powrotem, gdy szyna nie trafia do tabeli napieciowej). Ten sam ksztalt ma blizniaczy builder `application/reference_networks/sld_substrate_power_flow.py:103-106`.

HIGIENA: obie sondy usuniete, worktree `05138f2d` usuniety, `git status` czysty — zaden plik sledzony nie byl modyfikowany (dodalem wylacznie dwa nowe pliki testowe i je skasowalem).

**Dowód sceptyka:** 1) SONDA KANONICZNA (create_run/execute_run, tests/enm, usunieta po biegu), siec: GPZ 15 kV Sk3=500 MVA, linia 12 km 0,4+j0,8 om/km, b2 = odbior 3,0 MW/1,5 Mvar + generator synchroniczny 3,0 MW, S_b = 10 MVA, f = f0 = 50 Hz. Odniesienie: niezalezny Newton w czystym numpy (bez badanego solvera).
   ODNIESIENIE                 U=0.9306387 pu  P=0.000000 MW
   WARIANT A (bez k_pf)        U=0.9306387 pu  P=0.000000 MW
   WARIANT B (k_pf=2,0 k_qf=1,0 f0=50)  U=0.8413283 pu  P=-3.000000 MW
   WARIANT B gauss-seidel      U=0.8413283 pu  P=-3.000000 MW
   WARIANT B fast-decoupled    U=0.8413283 pu  P=-3.000000 MW
   -> generator 3 MW zniknal z bilansu; blad 0,0893 pu = 1340 V na 15 kV; NR/GS/FD identycznie zle.

2) DOWOD REGRESJI: ta sama sonda w `git worktree` na 05138f2d (przed zakresem 05138f2d..6307dfb3):
   ODNIESIENIE U=0.9306387 / WARIANT A U=0.9306387 / WARIANT B U=0.9306387 (GS i FD tak samo) -> "1 passed".
   Zla liczba pojawia sie dopiero po komicie 2095a758 (D1), ktory wprowadzil PQSpec.zip_base_* i split_zip_constant_part.

3) SONDA HTTP NA ROUTERZE PRODUKCYJNYM (fastapi TestClient na api.main:app), z pominieciem wylaczonego PUT /enm:
   POST /api/cases/{id}/enm/domain-ops {operation: update_element_parameters, payload: {element_ref: "load-1", parameters: {materialized_params: {...k_pf: 2.0...}}}} -> 200, w zwroconej migawce loads[0].materialized_params.k_pf == 2.0 (asercja przeszla);
   POST /api/cases/{id}/runs/power-flow ->
     HTTP A (stala moc)       U=0.9306387 pu
     HTTP B (k_pf=2,0, f=f0)  U=0.8413283 pu
   -> defekt osiagalny wylacznie zywymi endpointami produkcyjnymi, bez PUT /enm i bez wlasnego katalogu.

4) LEKTURA KODU potwierdzajaca mechanizm: power_flow_zip.py:96-102 (build_zip_table pomija is_constant_power, komentarz "Frequency-only loads are excluded here"), :138-159 (wejscie w podzial na sama obecnosc zip_base_*), :183-188 (czlon staly tylko dla idx w zip_table); power_flow_newton_internal.py:648,653 (blok efektywny pod `if zip_table or inv_table:`); power_flow_gauss_seidel.py:601; power_flow_fast_decoupled.py:251; enm/mapping.py:583-584; enm/canonical_analysis.py:1572-1579; api/enm.py:933-938 (PUT /enm wylaczony w produkcji); enm/domain_operations.py:6793,6892-6895 (kolekcja loads bez listy dozwolonych pol -> materialized_params merguje sie doslownie); catalog/types.py MaterializationContract OBCIAZENIE solver_fields z k_pf/k_qf oraz LoadType.k_pf:1989.

5) REJESTR: REJESTR_KONFLIKTOW.md wiersz V12K-313, sekcja "DLUGI NAZWANE" — trzy pozycje (build_power_spec_v2, martwa instrukcja w FD, GN_03); przypadku czestotliwosciowego brak, wiec to nie jest dlug juz nazwany.

6) HIGIENA: oba pliki sond usuniete, worktree usuniety, `git status --short` pusty; zaden plik sledzony nie byl edytowany.

### P4. [SREDNI] Wycofanie nieudanego zapisu ENM nie cofa rewizji, gdy set_enm dostaje TEN SAM obiekt, ktory lezy w magazynie (sciezka automigracji)

**Miejsce:** `mv-design-pro/backend/src/enm/store.py:266`

**Opis:** `_wycofaj_nieudany_zapis` przywraca stan przez `_enm_store[case_id] = poprzedni` (w. 266) i `_persist_enm(case_id, poprzedni)` (w. 267), gdzie `poprzedni = _enm_store.get(case_id)` pobrane w `_set_enm_pod_blokada` (w. 206). Jesli przekazany model jest TYM SAMYM obiektem, ktory juz lezy w magazynie, to `enm is existing`, a `enm.header.revision = old_rev + 1` (w. 215) mutuje wlasnie ten obiekt — „poprzedni" stan juz nie istnieje. Wycofanie wpisuje wtedy do pamieci i NA DYSK rewizje, ktorej zapis zglosil blad, a dziennik zmian nie dostaje wpisu (bo `dopisz_do_dziennika` nie wykonal sie). Alias jest osiagalny produkcyjnie: `_get_enm_pod_blokada` (w. 162-168) po automigracji klucza punktu przylaczenia robi `_enm_store[case_id] = zmigrowany`, a nastepnie — gdy `complete_catalog_defaults` nic nie zmienia — wola `set_enm(case_id, completed)` z `completed is _enm_store[case_id]`. To dokladnie ten objaw, ktory karta G deklaruje jako zamkniety: docstring w. 245-248 mowi „uzytkownik dostawal «blad zapisu», a zywy model byl juz o rewizje do przodu … dziennik zas nie mial wpisu dla tej rewizji" i „Operacja, ktora melduje blad, ma nie zostawiac po sobie ZADNEGO skutku". Testy tej karty (tests/enm/test_store_concurrency.py w. 306, 350) podaja do `set_enm` wylacznie `model_copy(deep=True)`, wiec galezi aliasu nie dotykaja.

**Scenariusz awarii:** Projekt zapisany starszym kodem (rekord wytworcy z zastanym kluczem `pcc_ref` w `meta`) po restarcie procesu; pierwszy odczyt uruchamia automigracje V12K-268 i probuje zapisac nowa rewizje. Nosnik odmawia zapisu (dysk pelny / montaz tylko do odczytu / brak uprawnien) — `get_enm` zglasza blad, a mimo to: rewizja w pamieci 2 -> 3, rewizja W PLIKU 2 -> 3, dziennik zmian dalej ma tylko wpis dla rewizji 2. Projektant dostaje komunikat bledu, a model po cichu awansowal — wszystkie zapisane wyniki sa uniewaznione rewizja, ktorej nie ma w dzienniku, wiec pytanie „ktora zmiana uniewaznila moj wynik" (V12K-264) zostaje bez odpowiedzi.

**Dowód przeglądu:** Sonda (ENM_STORE_DIR w katalogu tymczasowym): (1) przypadek z generatorem niosacym `meta {"pcc_ref": "b1"}` zapisany przez set_enm -> rewizja 2, dziennik [2]; (2) `reset_enm_store(remove_persisted=False)` (stan po restarcie procesu), plik na dysku nadal ma `{'pcc_ref': 'b1'}`, revision 2; (3) `store._persist_enm` podmieniony na wersje zglaszajaca OSError przy pierwszym wywolaniu; (4) `get_enm(case)` zglasza OSError('nosnik odmowil zapisu'), po czym: rewizja w pamieci = 3 (przed: 2), rewizja w PLIKU = 3 (przed: 2), dziennik = [2] — brak wpisu dla rewizji 3. Kontrola przeciwna: ta sama sonda z `model_copy(deep=True)` (wzorzec z testow karty) konczy sie poprawnym wycofaniem. Podmiana `_persist_enm` przywrocona w bloku finally, `git status` pusty.

**Werdykt sceptyka:** NIE OBALONE. NIE OBALONE — probowalem obalic na piec sposobow, kazdy zawiodl; defekt odtworzyl sie na produkcyjnym wejsciu `store.get_enm` i na zlotej sieci referencyjnej.

CO SPRAWDZILEM (proby obalenia):

1. „Alias nie powstaje, bo cos po drodze kopiuje model" — NIE. Lancuch zmierzony: `migruj` (punkt_przylaczenia_der.py:113) zwraca gleboka kopie, ktora `_get_enm_pod_blokada` wklada do magazynu (store.py:165), a `complete_catalog_defaults` przy braku zmian zwraca TEN SAM obiekt w kazdym z czterech czlonow (catalog_completion.py:194, 264, 306, 439, 484). Pomiar na ZLOTEJ SIECI (48 szyn, 31 galezi, 20 stacji, 2 wytworcow): `complete_catalog_defaults -> changed=False`, `comp is zm == True`. Wiec `set_enm(case_id, completed)` (store.py:169) dostaje obiekt lezacy w magazynie, a w `_set_enm_pod_blokada` ponowne `complete_catalog_defaults` (w. 205) znowu zwraca ten sam obiekt → `enm is existing`.

2. „Wczesniejszy zwrot na rownosci hasza (w. 210-212) to przechwyci" — NIE. `compute_enm_hash` (hash.py:275-291) liczy z pelnego zrzutu modelu, wiec obejmuje `meta`; migracja zmienia `meta`, a `existing.header.hash_sha256` to hash SPRZED migracji → warunek falszywy, kod idzie do w. 215.

3. „Sciezka jest nieosiagalna produkcyjnie" — NIE. Sonda wolala `store.get_enm` (ta sama funkcja, co `_get_enm` w api/enm.py) na zlotej sieci z zastanym kluczem `pcc_ref` w `generators[0].meta`, po symulowanym restarcie procesu. Pozostale wolania `set_enm` w src/ przechodza przez `EnergyNetworkModel.model_validate(...)` (nowy obiekt), wiec alias ma dokladnie jedno zrodlo — i to jest wlasnie automigracja.

4. „To juz nazwany dlug V12K-308" — NIE. Rejestr nazywa dlug (4) TYLKO dla galezi `poprzedni is None` („przypadek na dysku ale nie w pamieci") i opatruje go mitygacja „sciezka praktycznie martwa — wolajacy przechodza przez get_enm". Moje odtworzenie idzie WLASNIE przez `get_enm`, przypadek JEST w pamieci (`existing is not None`), i skutek zostaje — czyli deklarowana mitygacja nie obejmuje tego przypadku. Awans rewizji w PAMIECI nie jest nazwany nigdzie. Audyt (AUDYT_SZCZYTU_2026-08-01.md) nie zawiera ani jednego wystapienia tego watku.

5. „Testy karty to pokrywaja" — NIE. `tests/enm/test_store_concurrency.py` w obu testach awarii zapisu podaje `model_copy(deep=True)` (w. ~306 `zmieniony = get_enm(case_key).model_copy(deep=True)`, w. ~350 `nowy = zapisany_model.model_copy(deep=True)`), wiec galezi aliasu nie dotyka. Na HEAD: `pytest tests/enm/test_store_concurrency.py test_enm_store.py test_dziennik_zmian.py migrations` → 34 passed.

DOWOD PRZYCZYNOWOSCI (iniekcja + przywrocenie bajtowe): po dodaniu za store.py:206 `if enm is existing: enm = enm.model_copy(deep=True)` skutek ZNIKA w calosci (rewizja zostaje 1, `aktualny=True`, dziennik [1,2] bez dziury). Plik przywrocony bajtowo: sha256 18dbeb3a8f54cba649ea38c4bb73a17ac18383120fb4f27c8689c06ef2d4f4dd przed == po, `git status --porcelain` pusty.

KOREKTA DO ZGLOSZENIA (nie zmienia istoty). Scenariusz zglaszajacego mowi „rewizja W PLIKU 2 -> 3". Przy dysku pelnym/montazu RO plik NIE awansuje: wycofanie wola `_persist_enm(case_id, poprzedni)` (w. 267), ktore pada tak samo, wiec na dysku zostaje stara rewizja. Awans PLIKU wystepuje w podwariancie „snapshot zapisany, pada wpis do dziennika" (zmierzone: plik 1→2 z juz zmigrowanym kluczem, dziennik dalej [1]). Istota — „operacja meldujaca blad ma nie zostawiac ZADNEGO skutku" (docstring w. 250) — jest zlamana w obu wariantach.

**Dowód sceptyka:** SONDA 1 (tozsamosc obiektow, model syntetyczny): `migruj -> zmieniona=True, nowy obiekt=True`; `complete_catalog_defaults -> changed=False, TEN SAM obiekt=True`.

SONDA 2 (ZLOTA SIEC referencyjna, produkcyjne `store.get_enm`, ENM_STORE_DIR=tmp):
- projekt zapisany starszym kodem: rewizja pliku = 1, `generators[0].meta` zawiera `pcc_ref`;
- restart procesu (`reset_enm_store(remove_persisted=False)`), `_persist_enm` podmieniony na OSError(28) „No space left on device";
- `store.get_enm(CASE)` → OSError zgloszony inzynierowi;
- PO AWARII: rewizja W PAMIECI = 2, rewizja W PLIKU = 1; `meta` w pamieci = {'bus_przylaczenia_ref': 'bus_gpz_110'}, w pliku = {'pcc_ref': 'bus_gpz_110'};
- dziennik = [1] (brak wpisu dla rewizji 2);
- koncowka /enm/dziennik?od_rewizji=1 → `aktualny=False`, `wpisy=[]` — wynik uniewazniony rewizja, ktorej dziennik nie zna (dokladnie pytanie V12K-264 bez odpowiedzi);
- po kolejnej UDANEJ edycji: rewizja 3, dziennik [1, 3] — trwala dziura na rewizji 2.

SONDA 3 (wariant „snapshot OK, pada dziennik"): plik 1→2 z juz zmigrowanym kluczem, pamiec 2, dziennik [1] — nieudana operacja zostawia UTRWALONY skutek.

KONTROLA (bez aliasu, `set_enm` z gleboka kopia): wycofanie dziala — rewizja w pamieci wraca do 1, `meta` wraca do `pcc_ref`.

INIEKCJA PRZYCZYNOWA: `if enm is existing: enm = enm.model_copy(deep=True)` po store.py:206 → rewizja 1, `aktualny=True`, dziennik [1,2] bez dziury. Przywrocenie bajtowe potwierdzone sha256 (18dbeb3a… przed == po), `git status` czysty.

REGRESJA NA HEAD: `poetry run pytest -q tests/enm/test_store_concurrency.py tests/enm/test_enm_store.py tests/enm/test_dziennik_zmian.py tests/enm/migrations` → 34 passed (istniejace testy nie dotykaja galezi aliasu).

### P5. [KRYTYCZNY] Blokada obejmuje caly cykl TYLKO w apply.py — domain-ops i dwie koncowki DER nadal gubia operacje przy HTTP 200

**Miejsce:** `mv-design-pro/backend/src/api/enm.py:858`

**Opis:** Karta G postawila doktryne wprost (apply.py:63): „blokada zalozona dopiero na zapisie nie pomaga, bo stary model zostal odczytany wczesniej". Blokada calego cyklu zostala jednak zalozona wylacznie w `application/station_templates/apply.py:71` (`with blokada_przypadku(case_key):`). INWENTARZ wywolan `_set_enm`/`set_enm` w src/ i ich zasiegu blokady:

(1) `api/enm.py:858` `enm = _get_enm(case_id)` → `api/enm.py:887` `execute_domain_operation(...)` → `api/enm.py:915` `saved = _set_enm(case_id, new_enm, zrodlo_zmiany=zrodlo)` — POZA blokada calego cyklu. Koncowka `POST /api/cases/{case_id}/enm/domain-ops`, AKTYWNA w routerze produkcyjnym.
(2) `api/generators.py:444` → `:460` → `:476` (`POST /{project_id}/cases/{case_id}/generators`) — POZA blokada, aktywna produkcyjnie.
(3) `api/generators.py:514` → `:532` (`set_der_bindings`) — POZA blokada, aktywna produkcyjnie.
(4) `api/enm.py:145` (PUT /enm), `:516→522` (/enm/ops), `:571→616` (/enm/ops/batch), `:758→765` (/wizard/apply-step) — rowniez poza blokada, ale wylaczone przez `_PRODUCTION_DISABLED_ROUTE_KEYS` (`api/enm.py:933`).
(5) `application/station_templates/apply.py:96→324` — POD blokada (naprawione karta).
(6) `enm/store.py:169` (`set_enm` z `_get_enm_pod_blokada`) — pod blokada.

`get_enm` bierze blokade i ZWALNIA ja przed liczeniem, wiec sekwencja odczyt→przeliczenie→zapis w (1)–(3) nie jest serializowana wzgledem apply, ktore w tym czasie biegnie w PULI WATKOW Starlette (koncowka `def`, `api/station_templates.py:183`). Kto odczytal pierwszy i zapisal jako ostatni — wygrywa; praca drugiego znika, obie koncowki melduja sukces. To dokladnie sygnatura D4, tylko dla innej pary koncowek.

Optimistic concurrency w `api/enm.py:863` (`if req.snapshot_base_hash and req.snapshot_base_hash != current_hash`) NIE jest tu obrona: hash porownywany jest z modelem odczytanym w wierszu 858, czyli w chwili ODCZYTU, a nie przy zapisie — nie jest to compare-and-swap. Do tego `frontend/src/ui2/kreatory/stacja/stacjaPodglad.ts:82` wysyla `snapshot_base_hash: ''`, wiec warunek jest pomijany. Koncowki DER (2)(3) nie maja go w ogole.

Dlug nazwany w V12K-308 pkt 1 dotyczy blokady MIEDZYPROCESOWEJ i zmiany kontraktu API (`snapshot_base_hash`/409 dla szablonow) — to znalezisko jest czyms innym: wyscig zachodzi WEWNATRZ jednego procesu i domyka sie tym samym `blokada_przypadku`, bez zadnej zmiany kontraktu.

**Scenariusz awarii:** Dwie karty przegladarki na tym samym przypadku (albo dwaj projektanci). Karta 2 wysyla `POST /api/cases/{id}/enm/domain-ops` (np. continue_trunk_segment_sn) — handler `async def`, wykonuje `_get_enm` (rewizja 2), zwalnia blokade i liczy operacje. W tym oknie karta 1 wysyla `POST /api/station-templates/tpl_sn_nn_630kva/apply` — handler `def`, wiec pula watkow: bierze blokade, czyta rewizje 2, wstawia stacje z 16 elementami, zapisuje rewizje 3, oddaje HTTP 200 z `station_ref`. Karta 2 konczy liczenie i wykonuje `_set_enm` na modelu zbudowanym z rewizji 2 → rewizja 4 bez stacji. WYNIK ZMIERZONY sonda: apply zwrocil `station_ref=stn/ecfc610e.../station` i 16 utworzonych elementow, domain-ops zwrocil `error=None`, model koncowy ma rewizje 4 i 1 stacje (bez zmian), `station_ref in model.substations == False`. Cala praca kreatora stacji przepadla, a API zameldowalo sukces obu operacji.

**Dowód przeglądu:** Sonda /tmp/.../sonda_wyscig.py uruchomiona `poetry run python` na HEAD: dwa watki wolaja PRODUKCYJNE funkcje — `asyncio.run(domain_ops(case, envelope))` (rzeczywista korutyna koncowki z api/enm.py) i `apply_template_to_case(...)` (rzeczywista funkcja aplikacyjna). Okno miedzy odczytem a zapisem w domain-ops zostalo uczynione deterministycznym opakowaniem `enm.domain_operations.execute_domain_operation` w harnessie (opakowanie wola oryginal, sygnalizuje zdarzenie i czeka) — kolejnosc krokow koncowki nie jest zmieniana, to ta sama technika co `threading.Barrier` w bramce karty G. Wynik: `stacja zgloszona przez apply obecna w modelu: False`, rewizja 4, 1 stacja. Zaden z 5 testow `tests/enm/test_store_concurrency.py` tego nie lapie (wszystkie badaja wylacznie apply-vs-apply i set_enm-vs-set_enm). Bramka karty G nadal 5 passed; git status czysty, sha256 store.py/dziennik_zmian.py przed=po.

**Werdykt sceptyka:** NIE OBALONE. PROBOWALEM OBALIC — NIE DA SIE. Znalezisko potwierdzone dowodem wykonanym na realnym `api.main:app`.

CO SPRAWDZILEM (proby obalenia, po kolei):

1. „Sciezka wylaczona w produkcji" — NIE. `mv-design-pro/backend/src/api/enm.py:933` `_PRODUCTION_DISABLED_ROUTE_KEYS` wylacza tylko PUT /enm, /enm/ops, /enm/ops/batch, /wizard/apply-step. `POST /api/cases/{case_id}/enm/domain-ops` (enm.py:841-842, `async def domain_ops`) NIE jest na tej liscie, wiec `_build_production_router` (enm.py:941-950) przepuszcza ja do `production_router`, wlaczanego w `main.py:150`. Koncowka `POST /api/station-templates/{id}/apply` (`station_templates.py:172-174`, `def apply_station_template`) idzie do routera bez filtra (`main.py:147`). Obie zywe.

2. „Jest zabezpieczenie wyzej — bramka 409" — NIE. `enm.py:863` porownuje `req.snapshot_base_hash` z hashem modelu odczytanego wiersz wyzej (`enm.py:858`), czyli w chwili ODCZYTU, nie przy zapisie (`enm.py:915`) — to nie jest compare-and-swap. Do tego jest opcjonalna (`if req.snapshot_base_hash`), a ZADEN produkcyjny wolajacy nie podaje hasha: `frontend/src/ui/topology/domainApi.ts:232` ma domyslne `snapshotBaseHash = ''`, jedyni wolajacy nie przekazuja argumentu, a `ui2/kreatory/stacja/stacjaPodglad.ts:82` wysyla `snapshot_base_hash: ''` wprost. Koncowki DER (`generators.py:444→476` oraz `:514→532`) nie maja bramki w ogole — sprawdzilem obie: czysty cykl `_get_enm` → `execute_domain_operation` → `_set_enm` bez `blokada_przypadku`.

3. „Zabezpieczenie nizej — blokada w store" — NIE. `enm/store.py:136` (`get_enm`) i `:195` (`set_enm`) biora `blokada_przypadku` KAZDA OSOBNO i zwalniaja ja przed powrotem. Blokada CALEGO cyklu jest zalozona wylacznie w `application/station_templates/apply.py:71`. Grep po calym `src/`: `blokada_przypadku` wystepuje tylko w store.py (3x) i apply.py (2x) — potwierdza inwentarz ze zgloszenia.

4. „Zachowanie zamierzone i udokumentowane" — NIE. V12K-308 nazywa jako dlug wylacznie: (1) blokade MIEDZYPROCESOWA + `snapshot_base_hash`/409 dla szablonow (zmiana kontraktu API), (2) koszt czekania, (3) rewizje 1 bez wpisu dziennika, (4) waski brzeg odbiorczy. Zadne z nich nie obejmuje wyscigu apply↔domain-ops WEWNATRZ procesu. Sekcja 4 pkt 7 audytu (linia 602) to model wdrozeniowy (uvicorn >1 worker) — tez nie to.

5. „Petla zdarzen to serializuje" (jedyna powazna obrona; dokladnie to zalozyl audyt w punkcie obalajacym 6, linia 176 AUDYT_SZCZYTU: „6 z 7 to async def z ZERO await miedzy odczytem a zapisem — te petla zdarzen przypadkiem serializuje") — TO ZALOZENIE JEST FALSZYWE dla pary async↔pula watkow. Petla serializuje korutyny miedzy soba, ale nie wzgledem watku roboczego, ktoremu apply zostal juz oddany.

DOWOD WYKONANY (httpx.ASGITransport na realnym `api.main:app`, ENM_STORE_DIR w scratchpadzie, venv poetry backendu; sonda tylko w /tmp/claude-0/.../scratchpad/probe/, ZERO zmian w plikach repo — `git status --porcelain` pusty po biegu):
- Sonda 1 (`asyncio.gather` bez opoznienia, 6 rund): 0/6 strat — pierwsze podejscie NIE odtworzylo scenariusza, wiec zawezilem okno.
- Sonda 2 (przemiatanie opoznienia domain-ops wzgledem apply, 15 wartosci x 2 powtorzenia): **7/30 rund ze strata**, pasmo strat 0,1–1,0 ms. Poza pasmem (0 ms oraz ≥2 ms) strat brak.
- Sonda 3 (5 powtorzen przy 0,3 ms, kontrola istnienia refow): **5/5 strat**, za kazdym razem identycznie: `apply=200, op=200, op_error=None, zgloszone=16, nieistniejace=16, stacja_jest=False, stacje=1 (bez zmian), rewizja=6`. Wszystkie 16 zgloszonych `created_element_refs` NIE ISTNIEJE w modelu koncowym (sprawdzone rekurencyjnym zbiorem `ref_id` calego snapshotu).

MECHANIZM (uscislenie wzgledem opisu zgloszenia). Kolejnosc jest odwrotna niz w narracji zgloszenia — petla zdarzen jest zablokowana na czas synchronicznej obslugi domain-ops, wiec apply musi byc oddany do puli watkow UŁAMEK milisekundy WCZESNIEJ, a nie „wyslany w oknie". Wtedy: domain-ops `_get_enm` (enm.py:858) wyprzedza watek roboczy i czyta rew. 4 → zwalnia blokade → apply bierze blokade, czyta rew. 4, wstawia stacje, zapisuje rew. 5 → domain-ops `_set_enm` (enm.py:915) CZEKA na zwolnienie blokady i zapisuje rew. 6 zbudowana z rew. 4. Strata jest w tym ukladzie GWARANTOWANA (nie losowa), bo blokada w `set_enm` wymusza, ze spozniony zapis pojdzie jako ostatni — stad 5/5. Zmierzony skutek jest dokladnie ten, ktory podalo zgloszenie. Uscislenie kolejnosci nie zmienia wady ani wagi.

WAGA: krytyczny potwierdzony — utrata calej pracy kreatora stacji (16 elementow) przy HTTP 200 i sfabrykowanym `station_ref` + `created_element_refs` wskazujacych na byty nieistniejace w modelu. Naprawa nie wymaga zmiany kontraktu: `with blokada_przypadku(case_id):` wokol cyklu odczyt→przeliczenie→zapis w `api/enm.py:858-915` oraz `api/generators.py:444-476` i `:514-532`, dokladnie jak w `apply.py:71`.


### P6. [WYSOKI] Nieudany zapis dziennika nie jest wycofywany z pamieci — rewizja zostaje na trwale opisana operacja, ktora zostala cofnieta

**Miejsce:** `mv-design-pro/backend/src/enm/store.py:237`

**Opis:** Karta G wciagnela wpis do dziennika do sekcji krytycznej i objela go wycofaniem (`store.py:220-233`): `_persist_enm(...)` i `dopisz_do_dziennika(...)` w jednym `try`, `except Exception: _wycofaj_nieudany_zapis(...)`. Wycofanie (`store.py:237-267`) przywraca jednak WYLACZNIE model — pamiec (`_enm_store[case_id] = poprzedni`) i plik snapshotu (`_persist_enm(case_id, poprzedni)`). Stan dziennika w pamieci nie jest ruszany.

Tymczasem `dziennik_zmian.dopisz` dopisuje wpis do listy w pamieci PRZED zapisem pliku:
```
226:    dziennik.wpisy.append(wpis)
227:    dziennik.wpisy.sort(key=lambda w: w.rewizja)
...
230:    _zapisz(case_id, dziennik)
```
Gdy `_zapisz` podniesie OSError (`dziennik_zmian.py:178`), wpis-duch zostaje w `_dzienniki[case_id]`, choc model wrocil o rewizje. Drugi mechanizm zamienia to w stan TRWALY — idempotencja po numerze rewizji (`dziennik_zmian.py:213-215`):
```
213:    for istniejacy in dziennik.wpisy:
214:        if istniejacy.rewizja == rewizja:
215:            return istniejacy
```
Ponowna, tym razem UDANA operacja tworzy ten sam numer rewizji, trafia na wpis-ducha i wraca bez dopisania czegokolwiek — a przy okazji bez wywolania `_zapisz`, wiec na dysku powstaje dziura az do nastepnego zapisu. To wariant 3 defektu D4 („dziury w dzienniku zmian"), ktory karta deklaruje jako zamkniety, wchodzacy druga polowa tej samej sekcji krytycznej.

To nie jest dlug nazwany w V12K-308 pkt 4: tamten opisuje waski brzeg „przypadek na dysku ale nie w pamieci" i skutek dla pliku SNAPSHOTU. Tutaj przypadek jest normalnie w pamieci, snapshot wycofuje sie poprawnie, a psuje sie DZIENNIK — jedyne zrodlo odpowiedzi na pytanie „ktora zmiana uniewaznila moj wynik" (V12K-264). Bramka karty (test `test_nieudany_zapis_nie_awansuje_modelu_ani_dziennika`) wstrzykuje awarie w `_persist_enm`, czyli PRZED `dopisz` — sciezka awarii samego zapisu dziennika nie jest pokryta zadnym testem.

**Scenariusz awarii:** Przypadek w pamieci na rewizji 2. Projektant wykonuje `insert_station_on_segment_sn`; `_persist_enm` przechodzi, po czym zapis pliku dziennika pada na bledzie nosnika (ENOSPC/EACCES/EIO/EMFILE — dokladnie ta klasa awarii, dla ktorej napisano wycofanie). API melduje blad, model wraca na rewizje 2 (poprawnie), ale `GET /api/cases/{id}/enm/dziennik-zmian?od_rewizji=1` zwraca wpis „rewizja 3 — Wstawienie stacji na istniejacym segmencie SN, utworzone: STACJA-A" dla stacji, ktorej w modelu nie ma (fabrykacja wobec phantom rule). Projektant powtarza prace inna operacja — `add_transformer_sn_nn` tworzaca TRAFO-B — ktora udaje sie i daje rewizje 3. Dziennik NA TRWALE (rowniez po zapisaniu na dysk przy kolejnej operacji) opisuje rewizje 3 jako „insert_station_on_segment_sn / STACJA-A"; operacja, ktora te rewizje faktycznie stworzyla, nie ma wpisu nigdzie. Projektant, ktory po biegu obliczeniowym pyta „co uniewaznilo moj wynik", dostaje nazwe zmiany, ktora nigdy sie nie odbyla, i nie dostaje tej, ktora sie odbyla.

**Dowód przeglądu:** Sonda /tmp/.../sonda_dziennik.py na HEAD (podmiana `dziennik_zmian._zapisz` na podnoszacy OSError — ta sama technika iniekcji nosnika co w bramce karty G; zero zmian w plikach repozytorium). Zmierzone: po nieudanym zapisie model wraca na rewizje 2 (OK), a `wszystkie_wpisy` w pamieci zawiera `(3, 'insert_station_on_segment_sn', ('STACJA-A',))`; `wpisy_od(case, 1)` — czyli dokladnie to, co oddaje `GET /enm/dziennik-zmian` — zwraca ten wpis. Po udanej powtorce operacja `add_transformer_sn_nn`/TRAFO-B tworzy rewizje 3, a wpis dziennika dla rewizji 3 nadal brzmi `operacja='insert_station_on_segment_sn', utworzone=('STACJA-A',)`; na dysku w tym momencie rewizji 3 BRAK (dziura). Po trzeciej operacji stan trwaly na dysku to: rewizja 2 add_grid_source_sn, rewizja 3 insert_station_on_segment_sn/STACJA-A (blednie), rewizja 4 set_normal_open_point. Bramka karty G nadal 5 passed; sha256 store.py 18dbeb3a…, dziennik_zmian.py c68791b6… przed=po, git status czysty.

**Werdykt sceptyka:** NIE OBALONE. NIE OBALONE — znalezisko broni sie w kodzie i w realnym biegu. Co sprawdzilem, probujac je obalic:

1. MECHANIZM W KODZIE (potwierdzony). `enm/dziennik_zmian.py:226-230`: `dziennik.wpisy.append(wpis)` / `sort` / dopiero potem `_zapisz(case_id, dziennik)`; `_zapisz` (l. 159-181) podnosi OSError po `tmp.unlink`. `enm/store.py:220-233` trzyma `_persist_enm` i `dopisz_do_dziennika` w jednym `try`, a `_wycofaj_nieudany_zapis` (l. 237-267) dotyka WYLACZNIE `_enm_store` i pliku snapshotu — ani slowa o dzienniku. Wpis-duch zostaje w `_dzienniki[case_id]`.

2. CZY WYZEJ/NIZEJ STOI ZABEZPIECZENIE — NIE. `_wczytaj` (l. 139-141) czyta PAMIEC-FIRST (`if case_id in _dzienniki: return _dzienniki[case_id]`), wiec dysk nigdy nie „naprawia" pamieci. `wyczysc_dziennik` (l. 247) nie ma ANI JEDNEGO wywolania w `backend/src` (grep) — jest testowy, wiec duch zyje do konca procesu. Idempotencja po numerze rewizji (l. 213-215) wraca `return istniejacy` PRZED `_zapisz`, wiec realna operacja o tym samym numerze nie dopisuje niczego i nie zapisuje pliku.

3. CZY SCIEZKA JEST OSIAGALNA W PRODUKCJI — TAK. `zrodlo_zmiany` wchodzi wylacznie z `api/enm.py:915`, w koncowce `POST /{case_id}/enm/domain-ops` (l. 842) — i ta koncowka NIE jest na liscie `_PRODUCTION_DISABLED_ROUTE_KEYS` (l. 933-939 wylacza tylko `/enm`, `/enm/ops`, `/enm/ops/batch`, `/wizard/apply-step`). Jej docstring wymienia dokladnie `insert_station_on_segment_sn` i `add_transformer_sn_nn` ze scenariusza. `except Exception` na l. 916-925 zamienia OSError na komunikat „model pozostal bez zmian" — czyli API zapewnia uzytkownika, ze skutku nie ma, podczas gdy dziennik trzyma wpis-ducha. Klasa awarii (ENOSPC/EACCES/EIO) to dokladnie ta, dla ktorej napisano wycofanie; sonda 2 wstrzykuje ja na poziomie syscalla, nie przez podmiane funkcji produkcyjnej.

4. CZY TO JUZ NAZWANY DLUG — NIE. V12K-308 pkt 4 opisuje INNY brzeg: „przypadek na dysku ale nie w pamieci + udany zapis pliku + nieudany wpis dziennika -> na dysku zostaje NOWA REWIZJA (sciezka praktycznie martwa)". W moim biegu przypadek jest normalnie w pamieci (`poprzedni is not None`), snapshot wycofuje sie poprawnie (rewizja 2, brak STACJA-A), a psuje sie WYLACZNIE dziennik. Rozstrzygniecie karty mowi wprost „operacja meldujaca blad nie zostawia ZADNEGO skutku" oraz „rewizja i jej wpis powstaja razem albo wcale" (docstring `store.py:189-193`) — kod lamie wlasny, zadeklarowany niezmiennik. Audyt (AUDYT_SZCZYTU_2026-08-01.md) definiuje „WARIANT 3 (dziury w dzienniku zmian)" jako rewizje bez wpisu; tu mam gorszy wariant tej samej klasy: rewizja 3 stworzona przez `add_transformer_sn_nn`/TRAFO-B nie ma wpisu NIGDZIE, a jej slot opisuje operacje, ktora zostala cofnieta i ktorej elementu (STACJA-A) w modelu nie ma — fabrykacja wobec phantom rule.

5. CZY ISTNIEJACA BRAMKA TO LAPIE — NIE. `tests/enm/test_store_concurrency.py:280` (`test_nieudany_zapis_nie_awansuje_modelu_ani_dziennika`) wstrzykuje awarie w `store._persist_enm`, czyli PRZED `dopisz` — sciezka awarii samego zapisu dziennika nie jest pokryta zadnym testem w repo (grep po `tests/`: zero iniekcji w `dziennik_zmian._zapisz`). Bramka kontraktowa „liczba wpisow == liczba rewizji" tez nie pomaga: po duchu liczby sie ZGADZAJA, klamie tresc.

Waga „wysoki" broni sie: wyzwalacz jest rzadki (awaria nosnika dokladnie miedzy zapisem snapshotu a zapisem dziennika), ale skutek jest trwaly i cichy — jedyne zrodlo odpowiedzi na „ktora zmiana uniewaznila moj wynik" (V12K-264) podaje operacje, ktora sie nie odbyla, i milczy o tej, ktora sie odbyla. Zadne kryterium obalenia nie zostalo spelnione: kod ma te wade, sciezka jest produkcyjna, zabezpieczenia nie ma na zadnym poziomie, zachowanie jest sprzeczne z kanonem karty, a scenariusz odtworzyl sie 2/2 w rzeczywistym biegu.

**Dowód sceptyka:** DWIE SONDY (obie usuniete po biegu; `git status --porcelain` pusty, zadnego pliku repo nie modyfikowalem — sondy byly NOWYMI plikami w tests/enm/, skasowanymi razem z .pyc).

SONDA 1 (podmiana `enm.dziennik_zmian._zapisz` na jedno OSError(28)) — `poetry run pytest tests/enm/test_probe_ghost_dziennik.py -q -s`:
[1] rewizja bazowa = 2; dziennik = [(2, 'add_grid_source_sn', ('ZRODLO-1',))]
[2] po awarii zapisu DZIENNIKA przy `insert_station_on_segment_sn`: rewizja modelu = 2 (wycofanie modelu POPRAWNE), 'STACJA-A' w modelu = False,
    ale dziennik W PAMIECI = [(2,'add_grid_source_sn',('ZRODLO-1',)), (3,'insert_station_on_segment_sn',('STACJA-A',))]  <- WPIS-DUCH
    dziennik NA DYSKU = tylko rewizja 2 (dziura)
[3] udana, INNA operacja `add_transformer_sn_nn` (TRAFO-B) -> rewizja 3; dziennik NADAL = [(2,'add_grid_source_sn'), (3,'insert_station_on_segment_sn',('STACJA-A',), 'Wstawienie stacji na istniejacym segmenc...')] — realna operacja NIE MA WPISU NIGDZIE
[4] kolejna operacja (rewizja 4) wymusza `_zapisz` -> plik na dysku zawiera na TRWALE wpis rewizja 3 = 'insert_station_on_segment_sn' / ['STACJA-A']
[5] odpowiedz `wpisy_od(case, 2)` (czyli GET /api/cases/{id}/enm/dziennik-zmian?od_rewizji=2) = [(3,'insert_station_on_segment_sn',('STACJA-A',)), (4,'update_element_parameters',())]

SONDA 2 (awaria na poziomie NOSNIKA, nie podmiana funkcji: `pathlib.Path.write_text` podnosi OSError(28, 'No space left on device') WYLACZNIE dla pliku roboczego `*.dziennik.json.<pid>.<uuid>.tmp`; snapshot zapisuje sie normalnie):
[A] rewizja po bledzie = 2, 'STACJA-A' w modelu = False, dziennik = [(2,...), (3,'insert_station_on_segment_sn',('STACJA-A',))]
[B] udana `add_transformer_sn_nn` -> rewizja 3 (nazwa modelu 'Z trafo B' potwierdzona), endpoint `od_rewizji=2` zwraca WYLACZNIE [(3,'insert_station_on_segment_sn',('STACJA-A',),'Wstawienie stacji na istniejacym segmencie SN')]; plik dziennika na dysku ma tylko rewizje 2 (dziura, bo idempotencja wraca przed `_zapisz`).

Wynik obu sond identyczny i zgodny ze scenariuszem znaleziska co do slowa.

### P7. [KRYTYCZNY] Rozdzielenie ZIP gubi CALA generacje na szynie z odbiorem zaleznym tylko od czestotliwosci

**Miejsce:** `mv-design-pro/backend/src/network_model/solvers/power_flow_zip.py:186`

**Opis:** Karta C (V12K-313) rozdzielila moc szyny ZIP na czesc odbiorowa (skalowana wielomianem) i czesc stala (generacja). `split_zip_constant_part` (w. 112-160) przebazowuje `p_spec[idx]` na sama czesc odbiorowa dla KAZDEGO PQSpec, ktory niesie `zip_base_p_mw`, natomiast czesc stala jest doliczana z powrotem WYLACZNIE wewnatrz petli `for idx, c in zip_table.items()` (w. 183-188 oraz `if not zip_table: return` w w. 178). Tymczasem `build_zip_table` POMIJA szyne, gdy `c.is_constant_power()` (w. 102) — a `zip_coeffs_from_materialized_params` (w. 243) i `aggregate_zip` (w. 279) zwracaja NIE-None takze wtedy, gdy a_p=b_p=a_q=b_q=0, ale k_pf/k_qf != 0 (odbior stalomocowy w NAPIECIU, wrazliwy na CZESTOTLIWOSC). Skutek: `enm/mapping.py:583` ustawia wtedy `zip_load_*` (bo `bus_zip is not None`), split przebazowuje moc na sam odbior, a nikt nie dodaje generacji z powrotem — generacja znika z rozwiazania. To dotyczy NR, GS (galaz `else` sweepu, gauss_seidel.py:611) i FD identycznie, oraz blizniaczego buildera `sld_substrate_power_flow.py`. `k_pf`/`k_qf` sa polami pierwszej klasy `LoadType` (catalog/types.py:1989) i sa materializowane do `materialized_params` (types.py:3234), wiec dane wyzwalajace sa kanoniczne.

**Scenariusz awarii:** SONDA A (bezposrednio na solverach, /tmp/.../probe_zip_freq.py): szyna B z odbiorem 3,0 MW / 1,0 Mvar o wspolczynnikach ZIP (0,0,1 / 0,0,1) i k_pf=0,5 przy f=f0=50 Hz (wspolczynnik czestotliwosciowy = 1, wiec fizyka MUSI byc rowna zwyklemu PQ) plus generacja 5 MW na tej samej szynie, PQSpec(p_mw=-2,0; zip_base_p_mw=3,0). Odniesienie (PQ netto -2,0 MW): U_B = 0,999799900 pu. Badana: U_B = 0,979370176 pu — czyli BITOWO rowna sieci BEZ generacji (asercja `badana == bez_generacji` -> True). Roznica -0,020430 pu; moc slacka +0,304170 pu zamiast -0,197999 pu (znak odwrocony). Identycznie dla newton-raphson, gauss-seidel i fast-decoupled.
SONDA B (sciezka PRODUKCYJNA create_run/execute_run, /tmp/.../probe_enm_freq.py, ta sama siec co tests/enm/test_zip_generation_split.py: 15 kV, linia 12 km, odbior 3,0 MW / 1,5 Mvar, generator 3,0 MW na szynie b2; ENMValidator: WARN, zero blokad): odniesienie (odbior stalomocowy) v_pu=0,9306386872, p_injected=0,0 MW (3-3=0, poprawnie); ten sam model z `materialized_params={a_p:0, b_p:0, c_p:1, k_pf:0,5, f0_hz:50}` -> v_pu=0,8413282903, p_injected=-3,0 MW. Generator 3 MW wyparowal z rozplywu: blad napiecia 0,0893 pu = 1,34 kV na szynie 15 kV, moc przylacza zawyzona o 3 MW poboru. To dokladnie klasa defektu D1, ktora karta C zamykala — na galezi czestotliwosciowej. Zaden test fali tego nie lapie: caly nowy zestaw (tests/test_power_flow_zip.py::_solve_with_generation, tests/enm/test_zip_generation_split.py) uzywa wylacznie CONST_Z (a_p=1), czyli zawsze trafia do zip_table; `grep k_pf` w tests/enm/test_zip_generation_split.py = 0 trafien.

**Werdykt sceptyka:** NIE OBALONE. NIE UDALO SIE OBALIC — znalezisko broni sie w kodzie i odtwarza sie w realnym biegu, takze na sciezce produkcyjnej.

CO SPRAWDZILEM (proba obalenia, punkt po punkcie):

1. Czy kod ma te wade — TAK. `power_flow_zip.py:102` (`if c is None or c.is_constant_power(): continue`) wyklucza z `zip_table` szyne, ktorej wspolczynniki nie maja zaleznosci NAPIECIOWEJ; `is_constant_power()` (w. 57-61) patrzy wylacznie na a_p/b_p/a_q/b_q, a `has_frequency_dependence()` (w. 63-64) jest osobnym warunkiem. Jednoczesnie `split_zip_constant_part` (w. 138-159) przebazowuje `p_spec[idx]` na sama czesc odbiorowa dla KAZDEGO specu z `zip_base_p_mw`, bez ogladania sie na `zip_table`, a doliczenie `zip_const` siedzi wylacznie w petli `for idx, c in zip_table.items()` (w. 183-188), za wczesnym `if not zip_table: return p_spec, q_spec` (w. 178-179). Sonda potwierdzila: `build_zip_table([spec], {"B":0})` = `{}` przy `is_constant_power()=True, has_frequency_dependence()=True`.

2. Czy sciezka jest osiagalna — TAK, kanonicznie. Jedyna droga do `zip_coeffs is not None and is_constant_power()` to k_pf/k_qf != 0 (sprawdzilem `zip_coeffs_from_materialized_params` w. 243 i `aggregate_zip` w. 302 — oba zwracaja None dopiero gdy stalomocowy I bezczestotliwosciowy). `LoadType.k_pf/k_qf` to pola pierwszej klasy (catalog/types.py:1989) w `solver_fields` kontraktu materializacji namespace OBCIAZENIE (types.py:3234), a `enm/mapping.py:583-598` ustawia `zip_load_active/reactive_power` dokladnie gdy `bus_zip is not None`, wiec przy k_pf!=0 spec DOSTAJE `zip_base_p_mw` (canonical_analysis.py:1572). Przeplyw k_pf -> node.zip_coeffs jest juz przypiety cudzym testem `tests/enm/test_zip_wiring.py:102-107`. Wejscie zewnetrzne: PUT ENM z `materialized_params` (odnotowane w samym audycie, AUDYT_SZCZYTU_2026-08-01.md:35).

3. Czy jest zabezpieczenie wyzej/nizej — NIE MA. ENMValidator przepuszcza (status != FAIL, bieg konczy sie FINISHED). Zaden solver ani warstwa wyzej nie odtwarza zgubionej czesci stalej.

4. Czy zachowanie jest zamierzone i udokumentowane — NIE. Przeczytalem rejestr V12K-305..314: wpis V12K-313 (karta C) deklaruje wprost, ze rozdzielenie „prowadza NR, GS i FD", a warunek twardy brzmi „dla sieci BEZ generacji na szynach ZIP wynik BITOWO identyczny". Ani slowa o wylaczeniu galezi czestotliwosciowej; `grep k_pf|k_qf|czestotliwo` w rejestrze = 0 trafien. To nie jest nazwany dlug.

5. Czy to regresja fali, czy stan zastany — REGRESJA karty C. Kontrola historyczna: ten sam `zip_coeffs` z k_pf=0,5 BEZ zadeklarowanego rozdzielenia (sciezka sprzed karty C) daje U_B = 0.9997998999159158, czyli BITOWO tyle co zwykle PQ. Dopiero deklaracja rozdzielenia (ktora mapping/canonical_analysis robia teraz automatycznie) gubi generacje.

6. Czy testy fali to lapia — NIE. `tests/test_power_flow_zip_solver_parity.py:94` bada czestotliwosc, ale BEZ generacji/rozdzielenia; `tests/enm/test_zip_generation_split.py` ma zero trafien na k_pf — caly nowy zestaw stoi na CONST_Z/CONST_I, czyli zawsze wpada do `zip_table`.

INTEGRALNOSC REPO: `git status --porcelain` po sondach pokazuje wylacznie zastany, nieslezony `mv-design-pro/backend/src/application/analyses/_sonda_sceptyka.py` (nie moj, nigdzie nieimportowany — `grep` po src/ i tests/ = 0 trafien). Zaden sledzony plik nie zostal zmieniony; moj tymczasowy test byl kopiowany do tests/ i usuwany.

UWAGA DO WAGI: dzis zaden dostarczony typ katalogowy odbioru nie ma k_pf != 0, wiec wyzwolenie wymaga importu ENM albo wlasnego typu — ale to DOKLADNIE to samo zastrzezenie, ktore audyt zapisal dla D1 (AUDYT_SZCZYTU_2026-08-01.md:35), a dom mimo to uznal D1 za „najpowazniejszy defekt fizyczny fali". Ta sama brama wejsciowa, ta sama klasa zlej liczby inzynierskiej — waga „krytyczny" broni sie precedensem wlasnego rozstrzygniecia V12K-313.

**Dowód sceptyka:** DOWOD 1 — sonda bezposrednio na solverach (/tmp/claude-0/.../scratchpad/skeptic_zip_freq.py, wlasna, napisana od zera; szyna B: odbior 3,0 MW / 1,0 Mvar, ZipCoeffs(0,0,1, 0,0,1, k_pf=0,5, f0=50) przy f=f0 => wspolczynnik czestotliwosciowy dokladnie 1,0, plus generacja 5 MW; PQSpec(p_mw=-2,0; zip_base_p_mw=3,0; zip_base_q_mvar=1,0); S_b=10 MVA, linia 0,4+j0,8 om/km, 1 km):
  build_zip_table(...) = {} ; is_constant_power()=True ; has_frequency_dependence()=True
  newton-raphson:  odniesienie (PQ netto -2,0 MW) U_B=0.9997998999159158, slack=(-0.1979991993593666+0.10400160128126501j)
                   badana                        U_B=0.9793701761991925, slack=( 0.30417028985781225+0.10834057971562461j)
                   bez generacji                 U_B=0.9793701761991925  -> badana == bez_generacji BITOWO: True
  gauss-seidel:    delta U = -0.020429724 pu, badana == bez_generacji BITOWO: True
  fast-decoupled:  delta U = -0.020429724 pu, badana == bez_generacji BITOWO: True
  SOLVERY Z ODCHYLENIEM: 3/3. Znak mocy slacka odwrocony (+0,3042 zamiast -0,1980 pu).

DOWOD 2 — kontrola „to regresja karty C" (skeptic_hist.py): ten sam ZipCoeffs, ale BEZ zip_base_* (sciezka sprzed rozdzielenia):
  historical U_B = 0.9997998999159158 ; reference plain PQ U_B = 0.9997998999159158 ; rowne BITOWO: True.

DOWOD 3 — sciezka PRODUKCYJNA create_run/execute_run (tymczasowy test skopiowany do tests/enm/, uruchomiony `poetry run pytest -q -s`, potem usuniety; siec ta sama co tests/enm/test_zip_generation_split.py: 15 kV, linia 12 km, odbior 3,0 MW / 1,5 Mvar na b2, generator 3,0 MW na TEJ SAMEJ szynie; ENMValidator != FAIL, run.status=FINISHED):
  odniesienie (load model="pq", stalomocowy):        v_pu = 0.9306386871657689 ; p_injected_mw = 0.0
  badany (model="zip", materialized_params {a_p:0,b_p:0,c_p:1,a_q:0,b_q:0,c_q:1,v0_pu:1,k_pf:0.5,f0_hz:50}, f=f0):
                                                     v_pu = 0.8413282902724865 ; p_injected_mw = -3.0
  siec BEZ generatora:                               v_pu = 0.8413282902724865 ; p_injected_mw = -3.0
  BADANY == BEZ GENERACJI (bitowo): True
  delta v_pu = -0.08931039689328246  => blad napiecia 1.3397 kV na szynie 15 kV; moc przylacza zawyzona o 3,0 MW poboru.
  Generator 3 MW zniknal z rozplywu na kanonicznej sciezce biegu.

### P8. [SREDNI] Guard zwarciowy (AST) slepy na wywolanie solvera przez zmienna posrednia, tablice dyspozycji i instancje

**Miejsce:** `mv-design-pro/scripts/no_direct_fault_params_guard.py:192`

**Opis:** Regula A odpala sie tylko wtedy, gdy `root_name(node.func) in aliases` (w. 192), a `root_name` (w. 134-138) zwraca pusty napis dla `Subscript`, `Call` i innego korzenia niz `Name`. Regula B (w. 201) dopasowuje wylacznie NAZWE wolanego. Docstring nazywa jako swiadome ograniczenie tylko przekazanie POZYCYJNE i „opakowane w obiekt wejsciowy" — nie obejmuje przypadku, gdy adresat jest ten sam (kanoniczny `ShortCircuitIEC60909Solver.compute_3ph_short_circuit`), a jedynie osiagniety posrednio. Trzy takie formy to naturalny refaktor istniejacego kodu: `application/analysis_run/service.py:1005-1044` ma cztery niemal identyczne galezie `if fault_type == ... : ShortCircuitIEC60909Solver.compute_Xph_short_circuit(graph=..., fault_node_id=...)` — sciagniecie ich do slownika dyspozycji jest oczywistym krokiem i cicho wylacza jedyna bramke tego inwariantu.

**Scenariusz awarii:** INIEKCJA w pliku BEZ zadnych wykluczen (backend/src/application/analyses/wytrzymalosc_cieplna_przewodow.py, sha256 przed=po 3dbb394ebf142f15ebd406a1e78cde485c5753ad5018a32fef59d8c8f0f2b79c). Dopisane trzy funkcje, kazda wstrzykujaca `fault_node_id=` do TEGO SAMEGO solvera: (1) `_DYSPOZYTOR['3F'](graph=..., fault_node_id=...)` gdzie `_DYSPOZYTOR = {'3F': ShortCircuitIEC60909Solver.compute_3ph_short_circuit}`; (2) `solver = ShortCircuitIEC60909Solver; solver.compute_3ph_short_circuit(..., fault_node_id=...)`; (3) `ShortCircuitIEC60909Solver().compute_3ph_short_circuit(..., fault_node_id=...)`. Wynik guarda: `Scanned 762 Python file(s)` + `PASS: No direct fault parameter violations found`, RC=0 — zero trafien na trzy naruszenia. KONTROLA POZYTYWNA w tym samym pliku: forma bezposrednia `ShortCircuitIEC60909Solver.compute_3ph_short_circuit(graph=graph, fault_node_id=node_id)` -> RC=1 z dokladnym `…wytrzymalosc_cieplna_przewodow.py:690: iniekcja 'fault_node_id=' …`. Czyli nie chodzi o brak importu ani o wykluczenie pliku, tylko o forme wywolania.

**Werdykt sceptyka:** NIE OBALONE. NIE OBALONE — rdzen znaleziska broni sie w rzeczywistym kodzie, potwierdzony wykonanym dowodem. Probowalem obalic czterema drogami i zadna nie zadziala:

(a) „Kod nie ma tej wady" — ma. `root_name` (w. 136-138) idzie petla wylacznie po `ast.Attribute` i zwraca `""` dla korzenia `Subscript` (tablica dyspozycji) oraz `Call` (instancja); dla `solver.compute_...` zwraca `solver`, ktorego nie ma w `aliases` (tam jest tylko `ShortCircuitIEC60909Solver`). Regula A (w. 191-195) odpada we wszystkich trzech przypadkach, regula B (w. 201) dopasowuje tylko nazwy `execute_short_circuit`/`_execute_short_circuit`. Odtworzylem to wlasna sonda: trzy iniekcje -> RC=0, dopisana forma bezposrednia w tym samym pliku -> RC=1 z wierszem 23.

(b) „Sciezka nieosiagalna / forma sztuczna" — nie. `compute_3ph_short_circuit` jest `@staticmethod`, wiec wszystkie trzy formy sa poprawnym wywolaniem, co potwierdzilem realnym biegiem: cztery formy daja BITOWO ta sama wartosc 8051.990544637209 A. Bypass to pelne wejscie w fizyke, nie martwa skladnia.

(c) „Istnieje zabezpieczenie wyzej albo nizej" — nie istnieje. `arch_guard.py` nie klasyfikuje `application/analyses/**` (segment `analyses` != `analysis`, w. 44-51) i jego predykat zakazu (`imported == "solvers"` / `startswith("solvers.")`, w. 33-34) nigdy nie pasuje do realnego `network_model.solvers`; RC=0. `solver_boundary_guard.py` pilnuje diffa plikow solvera, nie wolajacych. To jest jedyna bramka tego inwariantu i nie ma zapasowej.

(d) „Zamierzone i udokumentowane w kanonie/rejestrze" — nie. Docstring (w. 21-24) nazywa jako swiadome ograniczenie tylko przekazanie POZYCYJNE i opakowane w obiekt; rejestr V12K-306 nazywa dlug (3) identycznie waskim zakresem (pozycyjnie). Przypadek „argument nazwany, adresat ten sam kanoniczny, tylko droga posrednia" nie jest objety ani jednym, ani drugim. Nie przypina go tez zaden z 13 testow guarda (13 passed, zaden nie dotyka form posrednich).

KOREKTA, ktora naleza sie zglaszajacemu (osłabia narracje, nie teze): przywolany w opisie „naturalny refaktor" `application/analysis_run/service.py:1005-1044` jest ZLYM przykladem — ten plik figuruje w `LEGACY_DIRECT_SOLVER_CALLERS` (w. 82), wiec guard w ogole go nie oglada; sciagniecie tych czterech galezi do slownika dyspozycji NICZEGO tam nie wylacza, bo tam nie ma czego wylaczac. Zdanie „cicho wylacza jedyna bramke tego inwariantu" jest dla TEGO pliku nieprawdziwe. Ale scenariusz awarii, ktory znalezisko faktycznie stawia i ktory zweryfikowalem (iniekcja w pliku BEZ wykluczen), odtwarza sie co do joty — a wlasnie w plikach bez wykluczen lezy CALA prospektywna wartosc tej bramki. Rejestr V12K-306 deklaruje zapadke jako „ZAMKNIETA: KAZDE NOWE miejsce = naruszenie"; ta obietnica jest warta tyle, ile detekcja, a detekcja przepuszcza trzy zwykle formy wywolania w kazdym nowym miejscu.

Waga „sredni" trafna i zgodna ze skala (luka pokrycia bramki bez dzisiejszego skutku): na czystym HEAD guard jest zielony i poprawny na 762 plikach, zadnego zlego wyniku inzynierskiego dzis nie ma. Naprawa jest waska: w regule A rozwiazywac korzen takze dla `Subscript`/`Call` oraz sledzic przypisania aliasu (`x = <alias solvera>`), albo — prosciej i bez falszywych trafien wobec `is_data_construction` — dopelnic regule A druga: kwarg `fault_node_id=` w wywolaniu, ktorego `callee_name` nalezy do zbioru nazw metod solvera SC (`compute_*_short_circuit`), niezaleznie od formy adresata.

**Dowód sceptyka:** SONDA NIEZALEZNA (nie powtorzenie sondy autora; nowy plik zamiast edycji, wiec zero ryzyka przywrocenia).

1) Utworzylem NOWY plik `mv-design-pro/backend/src/application/analyses/_sonda_sceptyka.py` (lokalizacja BEZ zadnego wpisu w WHITELISTED_PATHS, SOLVER_LAYER_PREFIXES ani LEGACY_DIRECT_SOLVER_CALLERS), z importem `from network_model.solvers import ShortCircuitIEC60909Solver` i trzema formami posrednimi wstrzykujacymi `fault_node_id=`:
   - `_DYSPOZYTOR = {"3F": ShortCircuitIEC60909Solver.compute_3ph_short_circuit}` ; `_DYSPOZYTOR["3F"](graph=..., fault_node_id=..., c_factor=1.1)`
   - `solver = ShortCircuitIEC60909Solver` ; `solver.compute_3ph_short_circuit(graph=..., fault_node_id=..., c_factor=1.1)`
   - `ShortCircuitIEC60909Solver().compute_3ph_short_circuit(graph=..., fault_node_id=..., c_factor=1.1)`
   Wynik: `Scanned 763 Python file(s)` + `PASS: No direct fault parameter violations found`, RC=0. ZERO trafien na trzy iniekcje.

2) KONTROLA POZYTYWNA w TYM SAMYM pliku (dopisana forma bezposrednia): RC=1 z komunikatem
   `.../_sonda_sceptyka.py:23: iniekcja 'fault_node_id=' do wywolania warstwy solvera 'compute_3ph_short_circuit' poza warstwa wiazania FaultScenario`
   — i tylko wiersz 23. Formy posrednie z wierszy 8/13/17 nadal niewidoczne w TYM SAMYM biegu. To wyklucza tlumaczenia „brak importu", „plik wykluczony", „zly korzen skanu": plik jest ogladany, alias rozwiazany, a mimo to trzy naruszenia przechodza.

3) DOWOD ROWNOWAZNOSCI FUNKCJONALNEJ (zeby wykluczyc obalenie „te formy i tak by nie dzialaly"): `compute_3ph_short_circuit` jest `@staticmethod` (short_circuit_iec60909.py:1069-1070). Uruchomilem realny bieg solvera na grafie SLACK 110 kV + TR 25 MVA/uk 10% + szyna 20 kV, wszystkimi czterema formami:
   bezposrednia / dyspozycja / zmienna / instancja -> Ikss_a = 8051.990544637209 dla kazdej, `IDENTYCZNE: True`.
   Czyli forma posrednia to pelnoprawne wejscie w fizyke z tym samym adresatem, nie ciekawostka skladniowa.

4) SPRAWDZENIE ZABEZPIECZENIA WYZEJ/NIZEJ (glowna sciezka obalenia — nie potwierdzila sie):
   - `scripts/arch_guard.py`: `_layer_for_path` (w. 44-51) klasyfikuje po segmencie sciezki `analysis`; `application/analyses/**` ma segment `analyses`, wiec zwraca None i plik NIE JEST w ogole sprawdzany. Niezaleznie od tego `_matches_forbidden(imported, "solvers")` (w. 33-34) wymaga `imported == "solvers"` albo `imported.startswith("solvers.")`, a realny import brzmi `network_model.solvers` — nie pasuje w ZADNYM pliku, takze w `backend/src/analysis/**`. `python3 scripts/arch_guard.py` -> RC=0. Zaden inny guard nie pokrywa tej reguly (`solver_boundary_guard.py` pilnuje DIFFA chronionych plikow solvera, nie wolajacych).
   - `grep` po `backend/src/analysis/`: zaden plik nie importuje dzis `network_model.solvers`, wiec nie ma tez przypadkowej ochrony przez istniejacy stan.

5) SPRAWDZENIE „zamierzone i udokumentowane": docstring guarda (w. 21-24) nazywa jako swiadome ograniczenie WYLACZNIE przekazanie POZYCYJNE i „opakowane w obiekt wejsciowy". Rejestr V12K-306 nazywa dlug (3) jako „przekazanie identyfikatora POZYCYJNIE niewykrywane (jawnie w docstringu guarda; rozszerzenie wymaga listy sygnatur solverow)". Ani docstring, ani rejestr nie obejmuja przypadku, gdy argument JEST nazwany, a posrednia jest DROGA DO ADRESATA. Wiec to nie jest dlug juz nazwany.

6) `poetry run pytest -q ../scripts/test_no_direct_fault_params_guard.py` -> 13 passed. Zaden z 13 przypadkow nie dotyka form posrednich (przejrzalem nazwy testow) — czyli zachowanie nie jest tez przypiete zadna asercja jako zamierzone.

7) PRZYWROCENIE: `rm` pliku sondy; `git status --porcelain` PUSTY; guard na czystym HEAD -> `Scanned 762 Python file(s)`, PASS, RC=0. Kotwice wierszowe zgodne ze zgloszeniem: regula A w. 191-195 (`root_name(node.func) in aliases`), `root_name` w. 134-138 (`return expr.id if isinstance(expr, ast.Name) else ""`), regula B w. 201 (`if name in BINDING_CALL_NAMES`).

### P9. [WYSOKI] Rozdzielenie ZIP (karta C) GUBI generację na szynie z odbiorem zależnym wyłącznie od częstotliwości — regresja wobec bazy

**Miejsce:** `mv-design-pro/backend/src/network_model/solvers/power_flow_zip.py:154`

**Opis:** `split_zip_constant_part` przestawia `p_spec`/`q_spec` na CZĘŚĆ ODBIOROWĄ dla KAŻDEJ specyfikacji, która niesie `zip_base_p_mw` (wiersze 147-158: `p_spec[idx] = p_base_pu`, reszta trafia do `p_const`). Człon stały jest jednak doklejany z powrotem WYŁĄCZNIE dla indeksów obecnych w `zip_table` — `zip_effective_spec` (wiersze 178-188) ma `if not zip_table: return p_spec, q_spec` i pętlę `for idx, c in zip_table.items()`, identycznie w pętli NR (`power_flow_newton_internal.py:657-662`) i w zamiataniu GS (`power_flow_gauss_seidel.py:602-607`). Tymczasem `build_zip_table` (power_flow_zip.py:102) POMIJA pozycje, dla których `c.is_constant_power()`, a `enm/mapping.py:583-584` ustawia `zip_load_active_power` zawsze, gdy `aggregate_zip` zwróci cokolwiek — także dla odbioru napięciowo stałomocowego (a=b=0, c=1) z niezerowym `k_pf`/`k_qf`. Taki odbiór jest w pełni wspierany: `k_pf`/`k_qf` to pola katalogowe LoadType (catalog/types.py:1989-1990) materializowane kontraktem OBCIAZENIE (types.py:3234-3235), a `zip_coeffs_from_materialized_params` jawnie zwraca dla nich obiekt („Returns None when the params describe a constant-power, FREQUENCY-INDEPENDENT load"). W efekcie na szynie z takim odbiorem i generacją baza zostaje przeskalowana do samego odbioru, a moc generatora nie wraca NIGDZIE — znika z rozpływu bez śladu, bez kodu gotowości, bez ostrzeżenia. Ta sama konstrukcja jest w bliźniaczym budowniczym `application/reference_networks/sld_substrate_power_flow.py:100-110`. Przed kartą C ten przypadek liczył się poprawnie (szyna była zwykłym PQ o mocy wypadkowej), więc to REGRESJA, nie zastany dług.

**Scenariusz awarii:** Sieć: GPZ 15 kV — linia 12 km (0,4 + j0,8 Ω/km) — szyna zakładowa z odbiorem 3,0 MW / 1,5 Mvar o materialized_params {"k_pf": 0.02} (napięciowo stała moc) ORAZ agregatem kogeneracyjnym 3,0 MW na TEJ SAMEJ szynie; slack 1,0 pu, S_b = 10 MVA; bieg PF produkcyjną ścieżką create_run/execute_run. Baza 05138f2d: v_pu szyny = 0,930639, p_injected szyny = 0,000 MW, pobór na GPZ = 0,0554 MW. HEAD 6307dfb3: v_pu = 0,841328, p_injected = -3,000 MW, pobór na GPZ = 3,3391 MW — wynik IDENTYCZNY jak dla modelu BEZ generatora (sprawdzone bezpośrednio: oba biegi dają co do bitu te same liczby). Inżynier dostaje napięcie zaniżone o 0,089 pu (1,34 kV na 15 kV) i moc na przyłączu zawyżoną 60x, a raport twierdzi, że policzono model z generatorem.

**Dowód przeglądu:** Sonda `tests/enm/test_sonda_zip_freq_only.py` (wzorowana na tests/enm/test_zip_generation_split.py, ta sama ścieżka produkcyjna) uruchomiona na HEAD: `v_pu bez generacji = 0.8413282902724865`, `v_pu z generacja = 0.8413282902724865`, `p_inj b2 = -3.0` w obu biegach. Ta sama sonda skopiowana do worktree na 05138f2d i uruchomiona tym samym interpreterem venv: `v_pu z generacja = 0.9306386871657689`, `p_inj b2 = 0.0`, `p_inj b1 = 0.0554215914831629`. Dodatkowo sonda mapowania wypisała: `zip_coeffs = ZipCoeffs(a_p=0.0, b_p=0.0, c_p=1.0, a_q=0.0, b_q=0.0, c_q=1.0, v0_pu=1.0, k_pf=0.02, k_qf=0.0, f0_hz=50.0)`, `is_constant_power = True`, `zip_load_active_power = -3.0`, `active_power (netto) = 0.0` — czyli baza ZIP jest ustawiona, a indeks nie trafia do `zip_table`. Plik sondy usunięty, worktree usunięty, repo bez zmian (git status pusty).

**Werdykt sceptyka:** NIE OBALONE. NIE UDALO SIE OBALIC — wada w kodzie jest realna, odtworzyla sie na biegu i jest regresja wobec bazy. Ale waga zostala ZAWYZONA: powinno byc "sredni", nie "wysoki".

CO SPRAWDZILEM I CO SIE POTWIERDZILO

1. Asymetria w kodzie istnieje dokladnie tak, jak opisano. `split_zip_constant_part` (power_flow_zip.py:138-159) odpala sie na samym `zip_base_p_mw is not None`, BEZ patrzenia na wspolczynniki — wiersze 154-157 przestawiaja `p_spec[idx] = p_base_pu` i chowaja reszte w `p_const`. Doklejenie z powrotem jest natomiast kluczowane na `zip_table`: `zip_effective_spec` ma `if not zip_table: return p_spec, q_spec` (:178) i petle `for idx, c in zip_table.items()` (:183), identycznie NR (power_flow_newton_internal.py:648 `if zip_table or inv_table:`) oraz GS i FD. A `build_zip_table` pomija pozycje stalomocowe napieciowo: `if c is None or c.is_constant_power(): continue` (:102). `enm/mapping.py:583` ustawia `zip_load_active_power` zawsze, gdy `aggregate_zip` cokolwiek zwroci. Domkniecie logiczne: `aggregate_zip` zwraca nie-None przy `is_constant_power()==True` WYLACZNIE gdy `has_frequency_dependence()==True` — czyli wyzwalaczem jest odbior o a=b=0 z niezerowym k_pf/k_qf plus generacja na tej samej szynie. Zgadza sie z opisem.

2. Skutek jest taki, jak zgloszono, i jest to CICHA UTRATA DANYCH: 3,0 MW generacji znika z rozplywu bez sladu, bez kodu gotowosci, bez ostrzezenia — bieg konczy sie FINISHED. Sonda 1 dala co do bitu te same liczby dla modelu Z generatorem i BEZ niego; liczby ze zgloszenia (0,930639 / 0,841328 / 0,0554 / 3,3391) odtworzylem punkt w punkt.

3. Regresja potwierdzona niezaleznie (Sonda 2), z weryfikacja, ktore drzewo `src` zostalo zaladowane. To NIE jest dlug zastany — baza liczyla ten przypadek poprawnie, bo szyna byla zwyklym PQ o mocy wypadkowej 0.

4. Nie jest to rzecz juz nazwana w rejestrze. V12K-313 wymienia trzy dlugi (przypisywanie zamiast akumulacji w `build_power_spec_v2`, martwa instrukcja w FD, GN_03) — asymetrii rozdzielenie/doklejenie wsrod nich nie ma. Karta C dolozyla testy do `tests/enm/test_zip_wiring.py` i nowy `test_zip_generation_split.py`, ale ZADEN nie pokrywa kombinacji "freq-only + generacja".

5. Przypadek nie jest wydumany: odbior zalezny wylacznie od czestotliwosci to wspierana, przetestowana sciezka — `tests/enm/test_zip_wiring.py:93-107` (`test_frequency_sensitivity_reaches_node`, `materialized_params={"k_pf": 2.0, "k_qf": 1.0}`), `tests/test_power_flow_zip.py:223-233`, `tests/test_power_flow_zip_solver_parity.py:95`; k_pf/k_qf sa polami katalogowymi LoadType (catalog/types.py:1989-1990) w kontrakcie materializacji OBCIAZENIE (types.py:3234-3235).

CZEGO ZGLOSZENIE NIE DOWIOZLO — KOREKTA WAGI

Scenariusz konczy sie zdaniem "Inzynier dostaje napiecie zanizone ... a raport twierdzi, ze policzono model z generatorem". Tego dzisiaj nie da sie osiagnac z poziomu aplikacji, bo ZADNA produkcyjna trasa zapisu nie potrafi wprowadzic k_pf/k_qf do odbioru:
- Jedyna wystawiona trasa zapisu ENM to POST /api/cases/{case_id}/enm/domain-ops; `PUT .../enm`, `.../enm/ops`, `.../enm/ops/batch`, `.../wizard/apply-step` sa w `_PRODUCTION_DISABLED_ROUTE_KEYS` (api/enm.py:933-939) i wyciete z `production_router`, ktory jako jedyny jest wpiety w main.py:150 (zmierzone: 405/404/404/404).
- Przelotka, ktora by na to pozwolila — `topology_ops.py:506` (`"materialized_params": data.get("materialized_params")` w galezi `device_type == "load"`, plus `"model": data.get("model", "pq")`) — wisi wylacznie na tych wylaczonych trasach `/enm/ops`.
- Wszystkie trzy produkcyjne sciezki tworzenia odbioru pisza model "pq" i zero parametrow ZIP: `add_nn_load` (domain_operations_v2.py:1959-2023, bez `materialized_params`), odbior potrzeb wlasnych stacji (domain_operations.py:4335), uzupelnienie katalogowe (catalog_completion.py:609 — tylko catalog_item_id/p_kw/q_kvar/cos_phi).
- Wszystkie trzy katalogowe typy OBCIAZENIE maja k_pf = k_qf = 0,0 (zmierzone), wiec materializacja z katalogu daje `zip_coeffs_from_materialized_params(...) -> None` i sciezka historyczna.
Moja sonda dosiegla defektu tylko przez `set_enm` wolane wprost z warstwy serwisowej, a nie przez trase HTTP.

WNIOSEK. Znalezisko sie broni jako realna wada kodu i realna regresja w warstwie solvera, ale bez dzisiejszego skutku produkcyjnego — brakuje pisarza k_pf. To dokladnie kubelek "sredni (luka pokrycia/kontraktu bez dzisiejszego skutku)" z §5, nie "wysoki (bledne zachowanie w realnej sciezce)". Rekomendacja mimo to za naprawa u zrodla (Zero-Debt): to warstwa solvera, defekt jest cicha utrata mocy generacji, a bomba odpala sie w chwili, gdy do katalogu trafi pierwszy typ odbioru z niezerowa czuloscia czestotliwosciowa — a kontrakt katalogowy juz to pole przewiduje. Naprawa jest jednowierszowa po stronie symetrii: doklejanie `zip_const` musi byc kluczowane na zbiorze indeksow ROZDZIELONYCH, a nie na `zip_table` (albo `split_zip_constant_part` ma nie rozdzielac pozycji, ktorych `build_zip_table` nie przyjmie). Do tego test na kombinacje "freq-only + generacja", ktorej dzis nie ma.

**Dowód sceptyka:** SONDA 1 — odtworzenie na produkcyjnych funkcjach `create_run`/`execute_run` (sonda usunieta po biegu; sha256 plikow sledzonych bez zmian, `git status --porcelain` czysty):
Siec ze scenariusza: GPZ 15 kV — linia 12 km (0,4 + j0,8 om/km) — szyna z odbiorem 3,0 MW / 1,5 Mvar o `materialized_params={"k_pf": 0.02}` ORAZ generatorem 3,0 MW na TEJ SAMEJ szynie; slack 1,0 pu, S_b = 10 MVA, f = 50 Hz.

HEAD 6307dfb3 (modul: /home/user/MV-Design-PRO/mv-design-pro/backend/src/network_model/solvers/power_flow_zip.py, `hasattr(split_zip_constant_part) == True`):
  v_pu szyny  bez generacji = 0.841328 | z generacja 3 MW = 0.841328
  p_inj GPZ   bez generacji = 3.339063 | z generacja 3 MW = 3.339063
  p_inj szyny z generacja   = -3.000000 MW
  IDENTYCZNE bez/z generacji: v: True, p_GPZ: True  -> generacja NIE WCHODZI do rozplywu.

Niezalezny Newton (czysty numpy, dwa wezly, bez uzycia badanego solvera), odbior stalomocowy przy f = f0:
  z generacja 3 MW -> v_pu = 0.930639, pobor na GPZ = 0.055422 MW
  bez generacji    -> v_pu = 0.841328, pobor na GPZ = 3.339063 MW
Czyli HEAD zwraca dla modelu Z generatorem dokladnie wynik modelu BEZ generatora. Blad: -0,089 pu napiecia (1,34 kV na 15 kV) i 60-krotnie zawyzony pobor na przylaczu.

SONDA 2 — dowod REGRESJI (worktree na bazie 05138f2d, potwierdzony modul: .../scratchpad/base05/.../power_flow_zip.py, `hasattr(split_zip_constant_part) == False`):
  v_pu bez generacji = 0.841328 | z generacja = 0.930639
  p_inj GPZ bez      = 3.339063 | z generacja = 0.055422
Baza liczy ten przypadek POPRAWNIE (co do 1e-6 zgodnie z niezaleznym Newtonem). Zatem karta C (commit 2095a758) faktycznie wprowadzila regresje na tym przypadku.

SONDA 3 — osiagalnosc w produkcji (TestClient na `api.main:app`):
  PUT  /api/cases/{id}/enm            -> 405
  POST /api/cases/{id}/enm/ops        -> 404
  POST /api/cases/{id}/enm/ops/batch  -> 404
  POST /api/cases/{id}/wizard/apply-step -> 404
  Jedyna produkcyjna trasa zapisu ENM: POST /api/cases/{case_id}/enm/domain-ops.
  Katalogowe typy OBCIAZENIE: load_mieszk_15kw / load_uslugi_30kw / load_przem_75kw — WSZYSTKIE k_pf=0.0, k_qf=0.0, a_p=0.0, b_p=0.0, c_p=1.0.

### P10. [WYSOKI] Profil roczny OLTC podstawia za brakujące pasmo martwe wartość 0,000 kV i wydaje twardy werdykt „poza pasmem" — dokładnie ta heurystyka, którą karta D usunęła piętro wyżej

**Miejsce:** `mv-design-pro/backend/src/network_model/solvers/power_flow_oltc_studies.py:332`

**Opis:** Karta D (V12K-314) ustanowiła w tym pliku regułę: kryterium pochodzi z MODELU (`TapChanger.deadband_kv`), a brak danej daje wynik NIEDOSTĘPNY z kodem `oltc.deadband_missing` — nigdy domysł (patrz `_kryterium_dopuszczalnosci`, wiersze 553-577). Profil roczny w tym samym pliku robi odwrotnie: `half = (tc.deadband_kv or 0.0) / 2.0` (wiersz 332) i `within[reg.id] = abs(v - tc.voltage_setpoint_kv) <= half`, a formatter wywodu powtarza to samo podstawienie (`half = (deadband or 0.0) / 2.0`, wiersz 403) i drukuje inżynierowi próg `0.000 kV` jako kryterium. `AnnualProfileResult.to_dict()` (wiersze 270-276) nie niesie ŻADNEGO `readiness_codes`, więc ekran nie ma czego pokazać ani jak naprawić — mimo że emiter kodu istnieje od tej samej karty. Ścieżka jest realna: `deadband_kv` jest opcjonalne w modelu (`network_model/core/branch.py:574`, `enm/models.py:315`), operacja domenowa dopisuje je tylko przy obecnym `transformer_deadband_kv` (`enm/domain_operations.py:2406-2408`), a kreator transformatora ma to pole domyślnie puste i BEZ walidacji (`frontend/src/ui2/kreatory/transformator/transformatorModel.ts:55`, `KreatorTransformatoraSnNn.tsx:398` — dla nastawy walidacja jest, dla pasma nie).

**Scenariusz awarii:** Transformator z przełącznikiem zaczepów, nastawa U_zad = 15,0 kV, pole „pasmo martwe" zostawione puste w kreatorze (deadband_kv = None). Inżynier uruchamia badanie „profil roczny" na profilu noc/dzień/szczyt. Ekran pokazuje „kroki poza pasmem: 3 z 3", tabela ma w kolumnie „W paśmie" trzy razy „nie", a ślad obliczeń drukuje `|15.001 − 15.000| = 0.001 > 0.000 kV`. Odchyłka 1 V na szynie 15 kV zostaje ogłoszona naruszeniem pasma regulatora, którego nikt nie zadeklarował. Wniosek inżyniera: regulacja nie trzyma napięcia w żadnym stanie pracy — podczas gdy prawdą jest wyłącznie „pasma nie podano".

**Dowód przeglądu:** Sonda solvera na sieci referencyjnej testów OLTC (`_build_input(_oltc(...))`, `_solve_once`), profil noc 0,3 / dzień 1,0 / szczyt 1,6. Model Z pasmem 0,2 kV: `steps_outside_deadband = 0 z 3`, `within = {'TR1': True}` w każdym kroku. Ten sam model BEZ pasma (deadband_kv=None), ta sama nastawa 15,0 kV i te same napięcia (15.0826 / 15.0008 / 14.9518 kV): `steps_outside_deadband = 3 z 3`, `within = {'TR1': False}` w każdym kroku. Klucze `to_dict()` wyniku profilu: ['steps', 'total_switch_count', 'steps_outside_deadband', 'wywod'] — żadnego `readiness_codes`. Wywód: `\left|15.001 - 15.000\right| = 0.001 > 0.000\ \text{kV}`. Sondy uruchamiane skryptem w katalogu tymczasowym, żaden plik repozytorium nie był modyfikowany.

**Werdykt sceptyka:** NIE OBALONE. POTWIERDZONE — próba obalenia nie powiodła się. Co sprawdziłem, w kolejności prób obalenia:

1) Czy kod ma tę wadę. Ma. `power_flow_oltc_studies.py:331-332`: `half = (tc.deadband_kv or 0.0) / 2.0` / `within[reg.id] = abs(v - tc.voltage_setpoint_kv) <= half`, oraz formatter `_wywod_profilu` w. 403: `half = (deadband or 0.0) / 2.0` i podstawienie LaTeX z progiem `{half:.3f}`. `AnnualProfileResult.to_dict()` (w. 270-276) zwraca wyłącznie steps/total_switch_count/steps_outside_deadband/wywod — bez `readiness_codes`. Sonda odtworzyła to liczbowo (wyżej).

2) Czy ścieżka jest osiągalna w produkcji. Jest, cały łańcuch domknięty:
 - model: `TapChanger.deadband_kv: float | None = None` (`core/branch.py:574`), `from_dict` przez `_opt_float` (w. 650) — None przechodzi; `enm/models.py:315` tak samo; `enm/mapping.py:94` przepuszcza bez podstawienia.
 - zapis: `enm/domain_operations.py:2406-2408` dopisuje `deadband_kv` TYLKO gdy `transformer_deadband_kv` niepuste (setpoint analogicznie w. 2402-2404) — brak pola = brak klucza = None.
 - kreator: `transformatorModel.ts:58-77` — `walidujFormularz` wymaga `voltage_setpoint_kv > 0` dla OLTC+AUTOMATIC (w. 76-77) i NIE wymaga `deadband_kv`; `KreatorTransformatoraSnNn.tsx:398` renderuje pole pasma bez `blad={bladDlaPola(...)}` (setpoint w w. 397 ma). Domyślna wartość `deadband_kv: null` (w. 55). Czyli „setpoint jest, pasma nie ma" to stan produkowany przez kreator domyślnie.
 - badanie: `enm/canonical_analysis.py:1293-1305` (`study == "annual_profile"`) → `oltc_annual_profile` do global_results (w. 3014); front wysyła `oltc_load_profile` (`ui2/wyniki/oltc/oltcBadaniaModel.ts:122-125`) i renderuje wynik: `EkranBadanOltc.tsx:255` „Kroki poza pasmem nieczułości: {n}" (strings.ts:62) i w. 277 kolumna „W paśmie" → `tak`/`nie`. Inżynier widzi więc dokładnie „3" i trzy razy „nie", bez kryterium i bez akcji naprawczej (blok kryterium/`kryteriumNiedostepne` istnieje tylko dla `optimize`).

3) Czy istnieje zabezpieczenie wyżej/niżej. Nie znalazłem żadnego. Brak wymogu `deadband_kv` w walidatorach (`enm/validator*`, `network_model/validation/` — zero trafień na deadband), brak domyślnej wartości w katalogu (trafienia `deadband` w `catalog/` dotyczą wyłącznie `deadband_hz`/`qu_deadband_*` falowników). Emiter kodu `oltc.deadband_missing` i spec z akcją `fix_oltc_deadband` + nawigacją `inspector/regulacja/deadband_kv` ISTNIEJĄ (`domain/canonical_operations.py:1136-1147`) — ale są emitowane wyłącznie przez `_kryterium_dopuszczalnosci` badania §17, więc profil roczny ich nie zapala. Warstwa raportu jest przy tym uczciwa (`analysis/reporting/oltc_report.py:_fmt_kv` drukuje „—" dla None), co potwierdza, że podstawianie 0,000 kV jest lokalną anomalią profilu, a nie konwencją domu.

4) Czy zachowanie jest zamierzone i udokumentowane. Nie. `docs/plan/OLTC_ARCHITEKTURA_2026-07.md` w wierszu G3 (§17) jawnie opisuje kontrakt NIEDOSTĘPNY + kody `oltc.deadband_missing`/`oltc.target_voltage_missing`, a wiersz G2 (§8, profil roczny, w. 242) mówi tylko „czy w paśmie nieczułości" — o braku danej milczy. Rejestr V12K-314 nazywa dwa długi (wymagalność „napięcia docelowego" na ekranie badań; brak e2e ekranu OLTC) — tego przypadku wśród nich nie ma. Zgłoszenie nie dubluje więc długu z rejestru.

5) Czy scenariusz nie odtwarza się w realnym biegu. Odtwarza się (§ dowód). Dodatkowo obserwacja z odbioru karty D w rejestrze („iniekcja trafiła najpierw w PROFIL ROCZNY") potwierdza, że to ten sam znacznik decyduje, ile kroków inżynier zobaczy jako „poza pasmem".

Dwie uczciwe korekty do treści zgłoszenia (nie unieważniają go, ale precyzują zakres naprawy):
 a) Kotwica `:332` jest KODEM PRZEDISTNIEJĄCYM — `git log -L 325,340` wskazuje 85612985 z 2026-07-19, a `git diff 05138f2d..6307dfb3` na tym pliku nie ma hunka w tym rejonie (fala dodała tylko §17: `FeasibilityCriterion`, `_kryterium_dopuszczalnosci`, `_czy_dopuszczalna`, oraz w commicie 99638042 sam TEST profilu). Framing „karta D usunęła to piętro wyżej" jest trafny co do kanonu, ale defekt nie został wprowadzony w tej fali — to dług zastany, obowiązkowy do naprawy wg Zero-Debt pkt 1 („każdy NAPOTKANY błąd, także pre-existing").
 b) To samo podstawienie siedzi w PĘTLI regulatora: `power_flow_oltc.py:193` `half_band = (tc.deadband_kv or 0.0) / 2.0`. Sonda pokazuje, że skutek jest szerszy niż sam znacznik: przy braku pasma pętla „kręci" dalej i sumaryczne przełączenia rosną z 7 na 9 — czyli fabrykowane 0,000 kV zniekształca także liczbę `total_switch_count` pokazywaną jako „Łączne przełączenia". Naprawa wyłącznie w `power_flow_oltc_studies.py:332` dałaby wynik niespójny (znacznik „nieustalone" obok licznika policzonego przy zmyślonym paśmie) — kartę trzeba poprowadzić przez oba miejsca.

Waga: „wysoki" broni się. Wielkości fizyczne z solvera (pozycje, U szyny) pozostają poprawne, ale werdykt inżynierski jest fałszywy w realnej ścieżce klikanej z kreatora, a przy braku pasma jest fałszywy ZAWSZE (każda niezerowa odchyłka > 0,000), więc niesie zero informacji, czytając się jak awaria regulacji; dodatkowo licznik przełączeń jest zawyżony przez to samo podstawienie.

**Dowód sceptyka:** Sonda uruchomiona na HEAD 6307dfb3 (scratchpad/probe_deadband.py, `PYTHONPATH=backend poetry run python`), na produkcyjnym `run_annual_oltc_profile` + fixture `_build_input/_oltc` (110/15 kV, TR1 25 MVA, uk=12 %, OLTC AUTOMATIC, U_zad=15,0 kV, zakres -9..+9, krok 1,25 %), profil noc/dzień/szczyt (0,3 / 1,0 / 1,6). Wynik dwóch przebiegów obok siebie:

deadband_kv = 0,2 kV: steps_outside_deadband = 0 z 3; within = {True, True, True}; wywód: `|15.083 - 15.000| = 0.083 \le 0.100 kV`; total_switch_count = 7.
deadband_kv = None: steps_outside_deadband = 3 z 3; within = {False, False, False} przy IDENTYCZNYCH napięciach (15,0826 / 15,0008 / 14,9518 kV); wywód drukuje `|15.001 - 15.000| = 0.001 > 0.000 kV`, `|14.952 - 15.000| = 0.048 > 0.000 kV`; `"readiness_codes" in to_dict()` = False; total_switch_count = 9 (a nie 7).

Odchyłka 0,001 kV (1 V na szynie 15 kV) ogłoszona naruszeniem pasma, którego nikt nie zadeklarował — dokładnie scenariusz ze zgłoszenia. Ślad pętli regulatora przy deadband=None: 7 iteracji, decyzje step_down do pozycji -6, zakończenie `oscillation_stop` (nie `within_deadband`) — czyli 0,000 kV jest realnie podstawiane także w pętli.

### P11. [WYSOKI] Zrodlo OZE nN stacji (nn_block) omija brame katalogowa w OBU operacjach stacyjnych — generator deklaruje source_mode KATALOG, a moc i napiecie bierze WPROST z payloadu

**Miejsce:** `mv-design-pro/backend/src/enm/domain_operations.py:4447`

**Opis:** `_materialize_nn_source` tworzy generator PV/BESS/FW z `catalog_ref: source_converter_ref`, `catalog_namespace: ZRODLO_NN_PV`, `parameter_source: "CATALOG"`, `source_mode: "KATALOG"` — ale NIGDY nie wola `_materialize_catalog_payload` ani zadnej innej materializacji. `materialized_params` jest sklecony lokalnie z payloadu: `{"catalog_item_id": source_converter_ref, "catalog_item_version": "2024.1", "un_kv": nn_block.get("source_converter_un_kv"), "pmax_mw": p_mw, "sn_mva": nn_block.get("source_converter_sn_mva")}` (wiersze 4447-4455), a `p_mw` to `_as_positive_float(nn_block.get("source_converter_pmax_mw")) or _as_positive_float(nn_block.get("source_converter_sn_mva")) or 0.0` (4442-4446). Druga brama tez nie dziala: `extract_catalog_binding` dla `append_station_on_endpoint` (api/domain_ops_policy.py:186-196) i dla `insert_station_on_segment_sn` (tamze 177-184) wydobywa WYLACZNIE ref transformatora, a `_validate_field_equipment_bindings` (tamze 349-384) patrzy tylko na `sn_fields[].equipment` (CT/VT/przekaznik) — `nn_block.source_converter_catalog_ref` nie jest sprawdzany w zadnym torze. To DOKLADNIE ten sam ksztalt co defekt D2 zamkniety karta A dla transformatora, w siostrzanym elemencie tej samej funkcji: karta A naprawila transformator (wiersze 7919-7929) i dopisala operacje do CATALOG_REQUIRED_OPERATIONS, ale zrodlo nN zostalo poza brama. Parytet zlamany wobec operacji atomowej: `add_converter_source` jest w CATALOG_REQUIRED_OPERATIONS i ten sam ref odrzuca. Grep potwierdza, ze `source_converter_catalog_ref` wystepuje w calym backendzie TYLKO w tym jednym miejscu (src/enm/domain_operations.py:4427) — nie ma zadnego innego walidatora.

**Scenariusz awarii:** Projektant (albo klient API/skrypt/import archiwum, albo zwykla podmiana wersji katalogu miedzy pobraniem listy przez kreator a zapisem) konczy ciag SN stacja z blokiem nN i falownikiem PV, podajac `nn_block.source_converter_catalog_ref` z literowka oraz `source_converter_pmax_mw`. POMIAR (TestClient, realna sciezka `POST /api/cases/{case}/enm/domain-ops`, GPZ 15 kV/250 MVA + kabel 500 m + stacja 630 kVA): odpowiedz HTTP 200, `error: null`, w migawce generator `{"catalog_ref": "falownik-ktorego-nie-ma", "catalog_namespace": "ZRODLO_NN_PV", "parameter_source": "CATALOG", "source_mode": "KATALOG", "p_mw": 9.9, "materialized_params": {"catalog_item_id": "falownik-ktorego-nie-ma", "catalog_item_version": "2024.1", "un_kv": 0.4, "pmax_mw": 9.9, "sn_mva": 9.9}}`. TA SAMA referencja przez `add_converter_source` jest odrzucana brama API: `CatalogPolicyError(code='catalog.item_not_found', message_pl='Nie znaleziono rekordu katalogu: falownik-ktorego-nie-ma w kategorii ZRODLO_NN_PV')`. Wartosc `p_mw` idzie WPROST do rozplywu — `mapping.py:562`: `bus_p[gen.bus_ref] = bus_p.get(gen.bus_ref, 0.0) + gen.p_mw` — wiec wstrzyknieta moc 9,9 MW jest liczona jako generacja na szynie nN 0,4 kV za transformatorem 630 kVA i wchodzi do bilansu, napiec i spadkow. Wariant BEZ literowki jest rownie zly: przy POPRAWNYM refie `conv-pv-nn-0p5mw-0p4kv` (katalog: p_max_kw = 500, s_n_kva = 550) payload z `source_converter_pmax_mw: 9.9` daje generator `p_mw: 9.9`, `sn_mva: 9.9` z `parameter_source: CATALOG` — katalog nie jest czytany ANI RAZU, wiec nie ma czego z czym porownac.

**Dowód przeglądu:** Sonda HTTP (TestClient, `POST /api/cases/{case}/enm/domain-ops`, plik tymczasowy tests/api/test_sonda_zrodlo_nn.py, usuniety po pomiarze): wariant ze zlym refem -> 200 + generator jak w scenariuszu; wariant z poprawnym refem `conv-pv-nn-0p5mw-0p4kv` + `pmax 9.9` -> 200 + `p_mw: 9.9` mimo katalogowego `p_max_kw = 500.0` (odczyt katalogu: `PVInverterType(id='conv-pv-nn-0p5mw-0p4kv', s_n_kva=550.0, p_max_kw=500.0, un_kv=0.4, control_mode='Q_U_DROOP')`). Sonda polityki katalogowej: `validate_and_materialize_catalog_binding('append_station_on_endpoint', payload)` -> `None` (brak bledu); `validate_and_materialize_catalog_binding('add_converter_source', {'source_technology':'PV','catalog_ref':'falownik-ktorego-nie-ma'})` -> `CatalogPolicyError(code='catalog.item_not_found', ...)`. Kontrola katalogu: `get_default_mv_catalog().get_pv_inverter_type('conv-pv-append-1')` -> `None`, przy czym `conv-pv-append-1` to ref uzywany przez istniejacy test `tests/enm/test_append_station_on_endpoint.py:706` — czyli sam zestaw testow przypina obecnie ref, ktorego w katalogu NIE MA. Grep `source_converter_catalog_ref` po `backend/src/` -> 1 trafienie (domain_operations.py:4427). Przeglad rejestru V12K-305..314: wpis V12K-307 (karta A) wymienia piec dlugow nazwanych — zaden nie dotyczy zrodla nN; brak wpisu o `nn_block`/`_materialize_nn_source` w calym rejestrze.

**Werdykt sceptyka:** NIE OBALONE. NIE UDALO SIE OBALIC — znalezisko broni sie w kodzie i w realnym biegu. Sprawdzilem po kolei kazda mozliwa linie obrony:

1) CZY KOD MA TE WADE — TAK. `_materialize_nn_source` (mv-design-pro/backend/src/enm/domain_operations.py:4405-4510) nie wola zadnej materializacji: `p_mw` powstaje z payloadu (4442-4446: `_as_positive_float(nn_block.get("source_converter_pmax_mw")) or _as_positive_float(nn_block.get("source_converter_sn_mva")) or 0.0`), a `materialized_params` jest sklecony lokalnie (4447-4455) z zaszyta wersja `"2024.1"`, przy jednoczesnym `"parameter_source": "CATALOG"`, `"source_mode": "KATALOG"` (4468-4469). Kontrast z torem atomowym potwierdzony: `_build_converter_materialized_params` (domain_operations_v2.py:2104-2131) czyta katalog przez `_materialize_nn_source_params` i wyprowadza `pmax_mw`/`sn_mva` z `max_power_kw`/`rated_power_ac_kw`, a `_resolve_converter_defaults` (2200-2242) bierze moc z `materialized_params.get("pmax_mw")`.

2) CZY JEST ZABEZPIECZENIE WYZEJ (brama API) — NIE MA. `extract_catalog_binding` dla `insert_station_on_segment_sn` (api/domain_ops_policy.py:177-184) i `append_station_on_endpoint` (186-196) wydobywa wylacznie ref transformatora z `payload["transformer"]`; `_validate_field_equipment_bindings` (349-384) iteruje wylacznie `payload["sn_fields"][].equipment` po kluczach ct/vt/relay. Sciezka domyslna (`_extract_binding_from_container(payload)` + petla po kluczach segment/branch/load/protection/transformer/measurement) nigdy nie zaglada do `nn_block`. Grep po calym src: `source_converter_catalog_ref` wystepuje TYLKO w domain_operations.py:4427 — zadnego innego walidatora nie ma.

3) CZY JEST ZABEZPIECZENIE NIZEJ (walidator ENM / gotowosc / kwalifikowalnosc) — NIE MA. Zmierzone na powstalej migawce: `GET /enm/validate` -> status WARN z JEDNYM problemem (brak Z0 zrodla GPZ), zero uwag o falowniku; `GET /enm/readiness` -> `ready: true, blockers: []`; `GET /analysis-eligibility` -> LOAD_FLOW ELIGIBLE. Persystencja (`EnergyNetworkModel.model_validate` w api/enm.py) przyjmuje element bez mrugniecia.

4) CZY SCIEZKA JEST OSIAGALNA W PRODUKCJI — TAK. Kreator stacji ui2 buduje dokladnie ten blok (frontend/src/ui2/kreatory/stacja/stacjaModel.ts:944-950: `source_converter_catalog_ref/_name/_kind/_un_kv/_sn_mva/_pmax_mw`) i wysyla go operacjami `append_station_on_endpoint` / `insert_station_on_segment_sn` (stacjaModel.ts:335-336). Endpoint bierze `payload: dict[str, Any]` — zadnego filtrowania pydantic (NNBlockSpec nie jest w tej sciezce uzyty).

5) CZY ZACHOWANIE JEST ZAMIERZONE / JUZ NAZWANE DLUGIEM — NIE. Przeczytalem wiersze V12K-305..314. V12K-307 (karta A, D2) wymienia piec dlugow: komentarze do usunietego pliku, guard readiness_consumption, brak operacji w CANONICAL_OPERATIONS, `transformer.catalog_binding` bez `transformer_catalog_ref`, brak sprawdzenia zgodnosci napiec w append. ZADEN nie dotyczy zrodla nN. W AUDYT_SZCZYTU_2026-08-01.md `source_converter`/`nn_source` nie wystepuje.

KOREKTA WOBEC TRESCI ZNALEZISKA (bez wplywu na werdykt): tor `insert_station_on_segment_sn` wymaga `station.nn_voltage_kv` (nie `payload.nn_voltage_kv`) i `station_type` z listy A/B/C/D/inline/branch/terminal/sectional — po poprawieniu payloadu defekt odtwarza sie identycznie. Wariant z 9,9 MW za transformatorem 630 kVA NIE zbiega sie w rozplywie (co samo w sobie jest skutkiem wstrzyknietej mocy), wiec liczbowy dowod „zlego wyniku" oparlem na wariancie zbieznym z POPRAWNYM refem.

**Dowód sceptyka:** Sonda przez REALNA sciezke produkcyjna (fastapi TestClient, `POST /api/cases/{case}/enm/domain-ops`, izolowany ENM_STORE_DIR), siec: GPZ 15 kV/250 MVA (src-gpz-15kv-250mva-rx010) -> kabel 500 m (cable-tfk-yakxs-3x120) -> stacja z transformatorem 630 kVA (tr-sn-nn-15-04-630kva-dyn11), nn_voltage_kv 0,4.

A) BRAMA — `append_station_on_endpoint` z `nn_block.source_converter_catalog_ref = "falownik-ktorego-nie-ma"`, `source_converter_pmax_mw = 9.9`:
   HTTP 200, `error: null`, w migawce generator `{"ref_id": "stn/.../nn_source/pv_inverter", "catalog_ref": "falownik-ktorego-nie-ma", "catalog_namespace": "ZRODLO_NN_PV", "parameter_source": "CATALOG", "source_mode": "KATALOG", "p_mw": 9.9, "materialized_params": {"catalog_item_id": "falownik-ktorego-nie-ma", "catalog_item_version": "2024.1", "un_kv": 0.4, "pmax_mw": 9.9, "sn_mva": 9.9}}`.

B) DRUGA OPERACJA — `insert_station_on_segment_sn` (po poprawieniu `station.station_type="inline"` i `station.nn_voltage_kv=0.4`) z tym samym zlym refem: HTTP 200, `error: null`, generator `catalog_ref: "falownik-ktorego-nie-ma"`, `parameter_source: CATALOG`, `p_mw: 9.9`. Defekt jest w OBU operacjach stacyjnych.

C) PARYTET Z TOREM ATOMOWYM — ten sam ref przez `add_converter_source`: HTTP 422, `{"code": "catalog.item_not_found", "message_pl": "Nie znaleziono rekordu katalogu: falownik-ktorego-nie-ma w kategorii ZRODLO_NN_PV"}`. Parytet zlamany.

D) KONSUMPCJA PRZEZ ROZPLYW — `map_enm_to_network_graph` na migawce z (A): wezel „Szyna nN Stacja koncowa", U = 0,4 kV, `active_power = +9.8700 MW` (9,9 MW generacji minus 0,03 MW potrzeb wlasnych). Wstrzyknieta moc wchodzi do bilansu solvera.

E) ZLA LICZBA INZYNIERSKA NA ZBIEZNYM ROZPLYWIE — ten sam, POPRAWNY rekord katalogu `conv-pv-nn-0p5mw-0p4kv` (odczytany z katalogu: `p_max_kw = 500.0`, `s_n_kva = 550.0`), rozna moc w payloadzie, oba biegi `POST /runs/power-flow` zbiezne:
   - payload 0,5 MW -> generator `p_mw = 0.5`, v_pu szyny nN = 1,008032
   - payload 0,9 MW -> generator `p_mw = 0.9`, v_pu szyny nN = 1,014599 (0,4 kV: 405,8 V zamiast 403,2 V)
   W OBU przypadkach `parameter_source: "CATALOG"`, `catalog_ref: "conv-pv-nn-0p5mw-0p4kv"`. Katalog (500 kW) nie jest czytany ani razu — napiecie, ktore zobaczy projektant, pochodzi wprost z payloadu, a model deklaruje „KATALOG".

F) BRAK SIECI ZABEZPIECZAJACEJ PONIZEJ — na migawce z (A): `/enm/validate` -> WARN tylko o Z0 zrodla; `/enm/readiness` -> `ready: true, blockers: []`; `/analysis-eligibility` -> LOAD_FLOW ELIGIBLE.

HIGIENA: sonda byla NOWYM plikiem `mv-design-pro/backend/tests/api/test_probe_sceptyk_nn.py`, usunieta po pomiarach; zaden plik repozytorium nie byl modyfikowany — `git status --porcelain` pusty.

### P12. [WYSOKI] `materialized_params` z payloadu ZASTEPUJE materializacje katalogu w add_converter_source — obchodzi nawet katalogowa kontrole zgodnosci napiec (falownik 15 kV wchodzi na szyne 0,4 kV)

**Miejsce:** `mv-design-pro/backend/src/enm/domain_operations_v2.py:2110`

**Opis:** `_build_converter_materialized_params` zaczyna od `explicit = payload.get("materialized_params"); if isinstance(explicit, dict) and explicit: return dict(explicit), None` (2110-2112). Gdy payload niesie `materialized_params`, katalog NIE JEST CZYTANY W OGOLE: pomijane sa `_materialize_nn_source_params` z lista pol wymaganych (2115-2132 dla PV, 2135-2159 dla BESS) i wyprowadzenia `pmax_mw`/`sn_mva`/`un_kv`/`control_mode` z pozycji katalogowej. Rekord generatora i tak dostaje `source_mode: "KATALOG"` (3415) oraz `catalog_ref` prawdziwej pozycji, wiec migawka twierdzi, ze tabliczka pochodzi z katalogu, podczas gdy pochodzi z payloadu. Brama API tego nie lapie: `extract_catalog_binding` dla `add_converter_source` (api/domain_ops_policy.py:243-262) sprawdza wylacznie ISTNIENIE referencji (a jesli `catalog_ref` brak, syntetyzuje ja z `materialized_params.catalog_item_id`) — nigdy nie porownuje LICZB. To nie jest sciezka teoretyczna: kreator OZE ui2 ZAWSZE wysyla `materialized_params` zbudowane we froncie (`frontend/src/ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts:396` -> `materializedParams(converter, pSetpoint)`, 300-322), czyli tabliczka katalogowa kazdego zrodla OZE zapisywanego w produkcji przechodzi przez przegladarke i backend przyjmuje ja bez weryfikacji. Roznica jest mierzalna juz dzis, bez zlosliwego klienta.

**Scenariusz awarii:** (1) OBEJSCIE KONTROLI NAPIEC — pozycja katalogowa `conv-bess-0.5mw-1mwh-15kv` ma `un_kv = 15 kV`. Zadanie `add_converter_source` (`connection_variant: nn_side`) na szyne nN 0,4 kV stacji: BEZ `materialized_params` backend czyta katalog i ODRZUCA — `error_code='converter.voltage_mismatch'`, komunikat „Napiecie katalogowe zrodla nie jest zgodne z napieciem szyny. Zrodlo: 15 kV, szyna: 0.4 kV". Z `materialized_params` deklarujacym `un_kv: 0.4` (przy TYM SAMYM, poprawnym `catalog_binding`) operacja KONCZY SIE SUKCESEM (`error: None`) i magazyn 15 kV siada na szynie 0,4 kV. Kontrola zgodnosci napiec przestaje istniec, bo liczy sie na danej z payloadu, nie z katalogu. (2) ZAWYZONA MOC POD PRAWDZIWYM REFEM — pozycja `conv-bess-residential-100kw-04kv` (katalog: p_discharge_kw = 100, e_kwh = 215): payload z `materialized_params: {..., pmax_mw: 0.4, sn_mva: 0.44, e_kwh: 9999.0}` daje generator `p_mw = 0.4 MW` (4x moc katalogowa) z `catalog_ref` wskazujacym rekord 100 kW; wartosc idzie do rozplywu przez `mapping.py:562`. (3) ROZJAZD JUZ DZIS NA SCIEZCE KREATORA — dla tej samej pozycji sciezka katalogowa zapisuje `{"usable_capacity_kwh": 215.0, "charge_power_kw": 100.0, "discharge_power_kw": 100.0, "sn_mva": 0.1, "pmax_mw": 0.1}`, a payload kreatora ui2 `{"sn_mva": 0.11, "pmax_mw": 0.1, "e_kwh": 215.0}` — inna moc pozorna i trzy pola tabliczki znikaja, mimo ze rekord deklaruje `source_mode: KATALOG`.

**Dowód przeglądu:** Sonda (plik tymczasowy tests/api/test_sonda_konwerter_mat.py, usuniety po pomiarze; siec: GPZ 15 kV/250 MVA -> linia 500 m -> stacja 630 kVA z szyna nN 0,4 kV; trzy warianty tego samego zadania `add_converter_source` przez `execute_domain_operation`). Wariant A (bez `materialized_params`, ref `conv-bess-residential-100kw-04kv`): `error=None`, `materialized_params = {"catalog_item_id": "conv-bess-residential-100kw-04kv", "catalog_item_version": "2024.1", "usable_capacity_kwh": 215.0, "charge_power_kw": 100.0, "discharge_power_kw": 100.0, "un_kv": 0.4, "pmax_mw": 0.1, "sn_mva": 0.1, "e_kwh": 215.0}`, `p_mw = 0.1`. Wariant B (payload kreatora ui2 1:1 wg `materializedParams`): `error=None`, `materialized_params = {"sn_mva": 0.11, "pmax_mw": 0.1, "un_kv": 0.4, "e_kwh": 215.0, "power_setpoint_mw": 0.1, ...}` — bez `usable_capacity_kwh`/`charge_power_kw`/`discharge_power_kw`. Wariant C (falszywa tabliczka pod poprawnym refem): `error=None`, `p_mw = 0.4`, `catalog_ref = "conv-bess-residential-100kw-04kv"`. Obejscie kontroli napiec zmierzone osobno na `conv-bess-0.5mw-1mwh-15kv`: bez `materialized_params` -> `converter.voltage_mismatch` („Zrodlo: 15 kV, szyna: 0.4 kV"); z `materialized_params.un_kv = 0.4` -> `error: None` i generator w migawce. Przeglad rejestru: brak wpisu deklarujacego pierwszenstwo payloadowego `materialized_params` jako zamierzonego kontraktu (V12K-051/061 dotycza zakresu kreatora OZE, nie zrodla tabliczki); w kodzie brak komentarza uzasadniajacego ten wyjatek.

**Werdykt sceptyka:** NIE OBALONE. NIE UDALO SIE OBALIC — potwierdzam wykonanym dowodem (sonda domenowa + sonda HTTP przez produkcyjny endpoint). Co sprawdzilem:

1) KOD. `_build_converter_materialized_params` (backend/src/enm/domain_operations_v2.py:2104-2112): `explicit = payload.get("materialized_params"); if isinstance(explicit, dict) and explicit: return dict(explicit), None` — przy obecnym `materialized_params` katalog nie jest czytany w ogole (pomijane `_materialize_nn_source_params`, 2115-2159). Wynik trafia wprost do kontroli napiec (3323-3343) i do rekordu generatora z `source_mode: "KATALOG"` (3415).

2) SONDA DOMENOWA (tests/enm, sieC referencyjna: GPZ 15 kV -> kabel -> stacja SN/nN 15/0,4 kV, wpiecie `nn_side` na szyne 0,4 kV):
   - BEZ `materialized_params`, ref `conv-bess-0.5mw-1mwh-15kv`: `error_code=converter.voltage_mismatch`, „Zrodlo: 15 kV, szyna: 0.4 kV" — bramka dziala.
   - Z `materialized_params {un_kv: 0.4, sn_mva: 0.55, pmax_mw: 0.5, e_kwh: 1000}` przy TYM SAMYM, poprawnym `catalog_binding`: `error=None`, w migawce generator `{catalog_ref: "conv-bess-0.5mw-1mwh-15kv", source_mode: "KATALOG", bus_ref: .../nn_bus, p_mw: 0.5}`. Magazyn 15 kV siedzi na szynie 0,4 kV.

3) SONDA HTTP przez JEDYNA produkcyjna droge zapisu `POST /api/cases/{id}/enm/domain-ops` (TestClient na `api.main:app`): wariant bez tabliczki -> `converter.voltage_mismatch`; wariant z tabliczka -> HTTP 200, `error=None`, migawka UTRWALONA, `readiness = {ready: true, blockers: []}`, a nastepnie `POST /api/cases/cB/runs/power-flow` -> HTTP 200 (bieg policzony na skazonym modelu). Czyli zaden mechanizm nizej nie lapie: `ENMValidator().validate()` na tej migawce zwraca `status=WARN` z jedynym W002 (brak Z0 zrodla), `analysis_available: short_circuit_3f=True, load_flow=True` — o niezgodnosci napiecia ani slowa.

4) BRAMA API — sprawdzona osobno, potwierdza opis znaleziska i to jest najmocniejszy punkt: `validate_and_materialize_catalog_binding("add_converter_source", ...)` dla tego samego bindingu zwraca `err=None` ORAZ `fields={'un_kv': 15.0, 'p_charge_kw': 500.0, 'p_discharge_kw': 500.0, 'e_kwh': 1000.0, 's_n_kva': 550.0}` — polityka ZNA prawdziwe 15 kV z katalogu, ale wywolujacy je WYRZUCA: api/enm.py:873 `policy_error, _ = validate_and_materialize_catalog_binding(...)`, po czym `execute_domain_operation(..., payload=req.operation.payload)` dostaje payload BEZ ZMIAN (api/enm.py:885-889). Sprawdzilem tez drugi endpoint (api/domain_operations.py:163-181) — on materializuje katalog, ale to slepa koncowka: zwraca `status="accepted"` z pustymi `changes` i nie wykonuje operacji.

5) SCENARIUSZ 2 (zawyzona moc pod prawdziwym refem) — odtworzony: `conv-bess-residential-100kw-04kv` (katalog: 100 kW / 215 kWh) z `materialized_params {pmax_mw: 0.4, sn_mva: 0.44, e_kwh: 9999}` -> `error=None`, generator `p_mw = 0.4` (4x moc katalogowa) pod refem rekordu 100 kW.

6) SCENARIUSZ 3 (rozjazd JUZ DZIS, bez zlosliwego klienta) — potwierdzony pomiarem obu stron: sciezka katalogowa `_build_converter_materialized_params(payload={}, catalog_ref="conv-bess-residential-100kw-04kv")` daje `{usable_capacity_kwh: 215.0, charge_power_kw: 100.0, discharge_power_kw: 100.0, pmax_mw: 0.1, sn_mva: 0.1, e_kwh: 215.0}`, a kreator ui2 wysyla `materializedParams()` (frontend/src/ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts:300-322, wpiete bezwarunkowo w `zbudujPayload` linia 396; POST z KreatorZrodlaOze.tsx:352) bez tych trzech pol tabliczki i z `sn_mva` rekordu katalogu (0.11) zamiast 0.1 — przy `source_mode: KATALOG`. UCZCIWA KOREKTA NA KORZYSC OBRONY: to 0,11 jest wartoscia Z rekordu katalogu (mv_converter_catalog.py:1110), a to backendowy materializator wyprowadza `sn_mva` z `discharge_power_kw` i gubi zadeklarowane `sn_mva` — wina lezy inaczej, niz sugeruje opis, ale sam rozjazd (dwie niezgodne tabliczki dla jednego rekordu, obie znaczone KATALOG) jest realny i zmierzony.

PROBY OBALENIA, KTORE ZAWIODLY: (a) „lapie to polityka katalogowa API" — nie, wynik materializacji jest odrzucany (pkt 4); (b) „lapie to walidator/gotowosc" — nie, `ready=true`, `blockers=[]`, walidator tylko W002 (pkt 3); (c) „lapie to `oze_validators.py:166`" — nie, ta regula porownuje szyne z DOLNA strona transformatora BLOKOWEGO, a tu wariant to `nn_side` bez transformatora blokowego; (d) „sciezka nieosiagalna" — nie, `/enm/domain-ops` to jedyna produkcyjna droga zapisu (pozostale wylaczone w `_PRODUCTION_DISABLED_ROUTE_KEYS`) i przyjmuje `materialized_params` jako zadeklarowane pole kontraktu (`AddConverterSourcePayload`, domain_ops_models.py:1132); (e) „zachowanie zamierzone i udokumentowane" — przejrzalem wiersze V12K-305..314 (zaden nie dotyczy konwerterow; V12K-310 dotyczy cosfi odbiorow nN) oraz V12K-061/237/238/268 — nigdzie nie ma rozstrzygniecia, ze tabliczka z payloadu ma wygrywac z katalogiem; przeciwnie, to ta sama klasa co D2 audytu (payloadowa tabliczka pod `source_mode: KATALOG`), tyle ze na innej, NIENAPRAWIONEJ operacji, i lamie regule 10 CLAUDE.md (zakaz wstrzykiwania parametrow z pominieciem katalogu).

ZASTRZEZENIE DO WAGI (nie obalajace): sam kreator ui2 buduje tabliczke z WYBRANEJ pozycji katalogowej, wiec zwyklym klikiem projektant nie wyprodukuje `un_kv 0.4` pod refem 15 kV — scenariusz 1 to dziura w zaufaniu do klienta na otwartym endpoincie, nie blad wywolywany klikiem. Realnie mierzalny dzis bez zlosliwego klienta jest scenariusz 3. Waga „wysoki" pozostaje uzasadniona (kontrola zgodnosci napiec przestaje obowiazywac na jedynej produkcyjnej drodze zapisu, a model klamie o zrodle tabliczki), ale nie „krytyczny".

HIGIENA: sondy byly NOWYMI plikami (tests/enm/test_zz_probe_sceptyk_conv.py, tests/api/test_zz_probe_http_conv.py), usuniete po pomiarze wraz z ich __pycache__; zaden sledzony plik nie byl modyfikowany — `git status --porcelain` pusty.

**Dowód sceptyka:** Sonda domenowa (tests/enm, sieC GPZ 15 kV -> kabel -> stacja 15/0,4 kV): add_converter_source z ref `conv-bess-0.5mw-1mwh-15kv` na szyne 0,4 kV — BEZ materialized_params: error_code=converter.voltage_mismatch („Zrodlo: 15 kV, szyna: 0.4 kV"); Z materialized_params {un_kv:0.4, sn_mva:0.55, pmax_mw:0.5, e_kwh:1000} przy TYM SAMYM poprawnym catalog_binding: error=None, generator {catalog_ref:"conv-bess-0.5mw-1mwh-15kv", source_mode:"KATALOG", bus_ref:.../nn_bus, p_mw:0.5}. Sonda HTTP (TestClient na api.main:app, POST /api/cases/{id}/enm/domain-ops — jedyna produkcyjna droga zapisu): ten sam wariant -> HTTP 200, error=None, migawka utrwalona, readiness {ready:true, blockers:[]}, nastepnie POST /runs/power-flow -> HTTP 200. ENMValidator().validate() na tej migawce: status=WARN, jedyny issue W002 (brak Z0 zrodla), analysis_available short_circuit_3f=True/load_flow=True — brak jakiegokolwiek sygnalu o niezgodnosci napiec. Brama API zmierzona osobno: validate_and_materialize_catalog_binding("add_converter_source", ...) -> err=None, fields={'un_kv': 15.0, 'p_charge_kw': 500.0, 'p_discharge_kw': 500.0, 'e_kwh': 1000.0, 's_n_kva': 550.0} — zna prawdziwe 15 kV, a api/enm.py:873 wyrzuca ten wynik (`policy_error, _ =`) i przekazuje payload bez zmian (api/enm.py:885-889). Scenariusz 2: ref `conv-bess-residential-100kw-04kv` z pmax_mw:0.4 -> error=None, p_mw=0.4 (4x moc katalogowa 100 kW). Scenariusz 3: sciezka katalogowa dla tego refu daje {usable_capacity_kwh:215.0, charge_power_kw:100.0, discharge_power_kw:100.0, pmax_mw:0.1, sn_mva:0.1, e_kwh:215.0} wobec payloadu kreatora ui2 (zrodloOzeModel.ts:300-322, 396) bez tych trzech pol i z sn_mva 0.11. Pliki sond usuniete, git status --porcelain pusty.

---

## 3. Znaleziska niezweryfikowane adwersaryjnie (ocena w syntezie)

### N1. [WYSOKI] validate_zip_coeffs przeniesione do aggregate_zip wywraca CZYSTA funkcje mapowania — pada analiza zwarciowa, ktora z modelem ZIP nie ma nic wspolnego

**Miejsce:** `mv-design-pro/backend/src/network_model/solvers/power_flow_zip.py:301`

**Opis:** Fala dodala `validate_zip_coeffs(agg)` na koncu `aggregate_zip`. Agregacja jest wazona moca (`_share_q` = suma(q_i * udzial_i) / suma(q_i)) i jest poprawna wylacznie dla skladnikow o ZGODNYM znaku. Odbior POJEMNOSCIOWY ma Q ujemne — to kanon katalogu, jawnie zapisany w enm/catalog_completion.py:550-551 i realizowany w w. 577 (`return (-q_mvar if mode == 'POJ' else q_mvar), ...`), a operacja kanoniczna `add_nn_load` przyjmuje `reactive_power_kvar: float | None` bez ograniczenia znaku (enm/domain_ops_models.py:1176). Przy mieszanych znakach Q na jednej szynie udzial agregatu wychodzi poza [0,1] i walidator podnosi ValueError — ale teraz JUZ W `map_enm_to_network_graph`, ktore jest udokumentowane jako 'pure, deterministic function' (mapping.py:529) i jest wspolnym wejsciem dla: _execute_short_circuit (canonical_analysis.py:1033), energy_validation/service.py:104, state_estimation/service.py:100, wytrzymalosc_cieplna_przewodow.py:497, sld_substrate_power_flow.py:79, proof_engine/packs/sc_symmetrical.py:88, api/proof_pack.py:354. Wada modelu OBCIAZENIA rozplywowego kladzie wiec analizy, ktore modelu ZIP w ogole nie czytaja. Komunikat jest po angielsku ('ZIP a_Q must be in [0, 1], got 3.0') i trafia do run.error_message. To NIE jest dlug nazwany w V12K-313 (rejestr wymienia trzy inne: przypisanie w build_power_spec_v2, martwa instrukcja w FD, odrzucanie GN_03).

**Scenariusz awarii:** Szyna SN z dwoma odbiorami: L1 = 3,0 MW / +1,5 Mvar z typu katalogowego o wspolczynnikach ZIP stalej impedancji (a_q = 1) oraz L2 = 1,0 MW / -1,0 Mvar (odbior pojemnosciowy, cos_phi_mode = 'POJ' albo reactive_power_kvar < 0 z add_nn_load). Suma Q = +0,5 Mvar, wiec agregat a_q = (1,5*1 + (-1,0)*0)/0,5 = 3,0. Bieg ZWARCIOWY (analysis_type='short_circuit_sn') na tym modelu konczy sie statusem FAILED z komunikatem 'ZIP a_Q must be in [0, 1], got 3.0'. Przed fala ten sam bieg zwarciowy konczyl sie FINISHED (walidacja wspolczynnikow siedziala w build_zip_table, czyli po stronie rozplywu). Uzytkownik traci analize zwarciowa, walidacje energii, estymacje stanu i wytrzymalosc cieplna przewodow z powodu parametru odbioru istotnego wylacznie dla rozplywu.

### N2. [SREDNI] Zapadka zastanych wywolan solvera moze cicho urosnac: wykluczenie dziala na PLIK, nie na miejsce wywolania

**Miejsce:** `mv-design-pro/scripts/no_direct_fault_params_guard.py:109`

**Opis:** `is_whitelisted` konczy sie `rel in WHITELISTED_PATHS or rel in LEGACY_DIRECT_SOLVER_CALLERS` (w. 109), a `check_file` przy trafieniu zwraca pusta liste PRZED sparsowaniem pliku (w. 168-169). Wykluczenie obejmuje wiec CALY plik i OBIE reguly, bezterminowo. Komentarz nad lista glosi „Lista jest ZAMKNIETA: KAZDE NOWE miejsce = naruszenie" (w. 76) i wpis V12K-306 powtarza to jako bramke — twierdzenie jest prawdziwe tylko na poziomie NAZWY PLIKU. Wewnatrz dziesieciu wymienionych plikow (m.in. `enm/canonical_analysis.py`, ktory ma dzis 4 wywolania `_execute_short_circuit`, oraz `application/network_wizard/service.py`) liczba bezposrednich wejsc w solver moze rosnac bez ograniczen i bez sygnalu — a to wlasnie te pliki sa najbardziej narazone na dokladanie kolejnych sciezek, bo juz maja gotowe importy i wzorzec.

**Scenariusz awarii:** INIEKCJA: do `backend/src/enm/canonical_analysis.py` (plik z zapadki, sha256 przed=po a6a74f02e397c8e69e7c098629c8309051174a7b7921c15c645bc6c151c6f314) dopisano NOWA funkcje `_sonda_nowe_miejsce`, ktora wola `_execute_short_circuit(graph, node_id, "3F", {}, False)` — czyli piate, nieistniejace wczesniej bezposrednie wejscie w solver z pominieciem kanonicznego wiazania FaultScenario. Guard: `Scanned 762 Python file(s)` + `PASS`, RC=0. Dokladnie to zdarzenie, ktore rejestr opisuje jako „nowe miejsce = czerwone CI", przechodzi na zielono. Nastepstwo praktyczne: dlug architektoniczny nazwany w V12K-306 pkt 1 (konsolidacja 10 miejsc) mierzy sie liczba plikow, a nie liczba wywolan, wiec moze rosnac przy niezmienionej liczbie plikow i przy zielonej bramce.

### N3. [SREDNI] Tabela profilu rocznego renderuje brak danej jako „nie" (poza pasmem) i przeczy własnemu podsumowaniu na tym samym ekranie

**Miejsce:** `mv-design-pro/frontend/src/ui2/wyniki/oltc/EkranBadanOltc.tsx:277`

**Opis:** `<td>{k.within_deadband[branchId] ? T.tak : T.nie}</td>` — dwa stany na polu, które w kontrakcie backendu bywa NIEOBECNE. `run_annual_oltc_profile` wpisuje klucz do `within_deadband` tylko wtedy, gdy regulator ma nastawę i znane napięcie szyny (`power_flow_oltc_studies.py:331-333`), a licznik zbiorczy pomija pusty słownik (`if within and not all(within.values())`, wiersz 336). Karta D w TYM SAMYM pliku wprowadziła dla tabeli optymalizacji trójstanowy `fmtDopuszczalna` (True/False/„—") dokładnie po to, żeby „nie wiadomo" nie udawało „nie" (oltcBadaniaModel.ts:209-213) — tabela profilu została przy dwóch stanach. To ta sama reguła uczciwego stanu zerowego, zastosowana w jednej tabeli ekranu i pominięta w drugiej.

**Scenariusz awarii:** Transformator z przełącznikiem zaczepów w trybie MANUAL, bez nastawy napięcia (voltage_setpoint_kv = None — domyślny stan kreatora transformatora). Inżynier uruchamia „profil roczny". Podsumowanie nad tabelą mówi „kroki poza pasmem: 0", a w tabeli KAŻDY wiersz kolumny „W paśmie" pokazuje „nie". Ekran przeczy sam sobie, a obie liczby są nieprawdziwe: prawdą jest, że kryterium pasma nie zostało ustalone (brak nastawy), więc żaden krok nie jest ani w paśmie, ani poza nim.

### N4. [SREDNI] Aparat pol SN stacji (`field_apparatus_catalog_ref`) nie przechodzi bramy katalogowej w zadnej z operacji stacyjnych — model zapisuje zdanie o pozycji katalogowej, ktorej nie ma

**Miejsce:** `mv-design-pro/backend/src/enm/domain_operations.py:7760`

**Opis:** `_materialize_sn_field_apparatus` tworzy galaz aparatu pola SN z `"catalog_ref": apparatus_catalog_ref` i `"catalog_namespace": "APARAT_SN"` (7760-7761), a w meta wpisuje zdanie opisujace STAN RZECZYWISTY: `"catalog_message": "Aparat pola SN z jawnie wskazanej pozycji katalogu APARAT_SN: {apparatus_catalog_ref}."` (7773-7776) — bez jakiegokolwiek sprawdzenia, czy taka pozycja istnieje (`materialized_params` zostaje `null`, `source_mode` `null`). Brama API tego nie obejmuje: `extract_catalog_binding` dla obu operacji stacyjnych (api/domain_ops_policy.py:177-196) czyta wylacznie ref transformatora, a `_validate_field_equipment_bindings` (349-384) tylko `sn_fields[].equipment`. Wyjatek dla stacji BEZ transformatora (`_append_station_tworzy_transformator`, 387-398 + wczesny powrot 418-421) NIE jest tu winowajca — sprawdzilem: warunek jest wiernym lustrem warunku domenowego `if transformer_catalog_ref:` (7872-7875, te same dwa klucze), a kontrola wyposazenia pol stoi PRZED wczesnym powrotem, wiec CT/VT/przekazniki nadal sa bramkowane; ref aparatu jest nieweryfikowany tak samo z transformatorem, jak i bez niego. To luka inwentarza bramy, nie skutek wyjatku.

**Scenariusz awarii:** Projektant (albo szablon stacji / klient API) stawia stacje na koncu ciagu, wskazujac `field_apparatus_catalog_ref` z literowka albo ref wycofany z katalogu. POMIAR (TestClient, `POST /api/cases/{case}/enm/domain-ops`, stacja bez transformatora): HTTP 200, w migawce galaz `{"ref_id": "stn/.../sn_field_apparatus/001", "catalog_ref": "aparat-ktorego-nie-ma", "catalog_namespace": "APARAT_SN", "materialized_params": null, "source_mode": null, "meta": {..., "catalog_message": "Aparat pola SN z jawnie wskazanej pozycji katalogu APARAT_SN: aparat-ktorego-nie-ma."}}` — model zapisuje jako fakt zdanie o pozycji, ktorej w katalogu nie ma. TA SAMA referencja w operacjach atomowych tego samego namespace jest odrzucana: `add_sn_bay` i `insert_section_switch_sn` -> `CatalogPolicyError(code='catalog.item_not_found', message_pl='Nie znaleziono rekordu katalogu: aparat-ktorego-nie-ma w kategorii APARAT_SN')`. Dzisiejszy skutek liczbowy jest zerowy (aparat ma `r_ohm = 0.0`, `x_ohm = 0.0`), ale most katalogowy aparat -> wytrzymalosc (I_th/I_dyn pozycji APARAT_SN) dostaje martwa referencje, a projektant nie ma sygnalu, ze wybor aparatury jest nieosadzony w katalogu — dowie sie dopiero z niedostepnosci kryterium wytrzymalosciowego, ktora wskaze objaw zamiast przyczyny (dokladnie ten wzorzec, ktory karta A zamknela dla transformatora).
