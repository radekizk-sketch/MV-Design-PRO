# Katalogi produkcyjne i pokrycie szablonów — pomiar i naprawy

Dokument transzy „MAXIMUM PRE-FABLE ENGINEERING & QUALIFICATION" w części
katalogowej (§17–§25 zlecenia) oraz produkcyjnej (§27). Wszystkie liczby
pochodzą z uruchomionych pomiarów; komendy są podane przy każdej sekcji, żeby
dało się je powtórzyć bez zaufania do prozy.

Gałąź: `claude/max-dynamic-audit-kzbivg`. Baza: `1e962025`.

> **STATUS:** delta `1e962025..cac842855` została ODRZUCONA przez niezależny
> shadow review (`docs/audit/WORK_SHADOW_REVIEW_LATEST.md`). Ten dokument
> został skorygowany w miejscach, gdzie twierdził więcej, niż dowodził kod.
> Przebieg remediacji: `docs/audit/WORK_SHADOW_REVIEW_REMEDIATION_2026-09-11.md`.

---

## 1. Pokrycie szablonów stacji — miary ROZŁĄCZNE, nie jedna liczba

> **KOREKTA PO NIEZALEŻNEJ RECENZJI (P1-DELTA-05).** Pierwsza wersja tej sekcji
> nosiła tytuł „0/57 → 57/57" i mówiła o „gotowości". Recenzent wykazał, że
> wykonywalna bramka sprawdzała WYŁĄCZNIE brak jednego kodu
> (`switch.catalog_ref_missing`) i nie asertowała nawet `ready is True`. Liczba
> była szersza niż dowód. Poniżej miary rozłączne, każda ze swoim testem.

**Pomiar** (apply KAŻDEGO szablonu przez API + `engineering-readiness` +
`analysis-eligibility`, ta sama ścieżka, którą idzie kreator):

| Miara | Wynik | Co dokładnie znaczy |
|-------|-------|---------------------|
| materializacja szablonu | **57/57** | `apply` kończy się 200/201 |
| brak `switch.catalog_ref_missing` | **57/57** | każdy łącznik ma wiązanie katalogowe |
| `engineering-readiness.ready` | **57/57** | model kompletny wg kontraktu gotowości |
| LOAD_FLOW eligible | **57/57** | rozpływ mocy wykonalny |
| SC_3F eligible | **31/57** | 26 szablonów DER blokuje granica `k_sc` |
| SC_1F eligible | **0/57** | brak Z₀ źródła (kod `W002`) |
| SC_2F eligible | **0/57** | kontrakt Z₂ nieukończony |
| FAULT_LOOP_NN / SWZ_NN eligible | **0/57** | brak odcinków kablowych nN |

**Stan wyjściowy dla porównania:** `ready` 0/57, `switch.catalog_ref_missing`
57/57, `W061` 38/57, `W041` 15/57.

**SC_3F = 31/57 jest ZAMIERZONE.** To działanie granicy miarodajności `k_sc`
(sekcja 2): szablon z czynnym źródłem przekształtnikowym bez deklaracji
współczynnika NIE MOŻE dać miarodajnego wyniku zwarciowego. Bramka sprawdza
predykat parzysty — zbiór zablokowanych MUSI równać się zbiorowi szablonów z
falownikiem, bo sama liczba 31 przeszłaby też dla blokady przypadkowej.

**Czego te liczby NIE znaczą.** Żadna z nich nie jest dowodem przydatności
projektowej: nie mówią nic o doborze aparatury wobec prądu zwarciowego,
selektywności, `Icu`/`Iz′` ani o dopuszczalności regulacyjnej. Gotowość modelu
i gotowość zdolności to dwie różne rzeczy i dlatego są tu mierzone osobno.

Pozostałe `W002` (ostrzeżenie, nie blokada) to brak Z₀ źródła w fiksturze
pomiarowej: backend bez Z₀ zwraca `None` i uczciwie melduje niedostępność zwarć
doziemnych (`enm/mapping.py` `_source_zero_impedance_ohm`), a kreator źródła pole
Z₀ wystawia.

### 1.1 Wyłącznik główny nN — wariant „B + A"

**B — nie tworzymy aparatu, którego układ nie zawiera.** `_build_nn_field_specs`
tworzyło `nn_main_breaker` BEZWARUNKOWO, także dla stacji generacyjnej z
transformatorem blokowym 2,5 MVA / 0,4 kV, która rozdzielnicy nN NIE MA
(falowniki łączą się własnym torem AC, `outgoing_feeders_nn_count = 0`). Sprzęt
istniał, bo spodziewała się go ścieżka kodu. Predykat „czy jest rozdzielnica nN"
czyta TO SAMO źródło prawdy, co liczba odpływów.

**A — tam, gdzie rozdzielnica JEST, aparat jest dobierany.** Kryterium:
klasa napięciowa (`U_e ≥ U_szyny`), potem NAJMNIEJSZA pozycja o
`I_n ≥ S_n/(√3·U_nN)`. Przewymiarowanie psuje selektywność wobec odpływów, więc
„największy, jaki jest" nie jest doborem. Brak dopasowania = BRAK wiązania i
zablokowana gotowość, nigdy podmianka.

**Katalog rozszerzony zweryfikowanymi danymi.** Rodzina kończyła się na 1600 A
przy zapotrzebowaniu do 3608 A. Dopisano 2000 / 2500 / 3200 / 4000 A z tabel
zamówieniowych **ABB SACE Emax 2** (`1SDC200023D0205`, ed. 2017.01) — z kodami
zamówieniowymi 3P, `Icu(440 V)` i `Icw(1 s)`.

Proweniencja jest ODTWARZALNA, nie deklaratywna:

```bash
cd mv-design-pro && python scripts/import_katalog_abb_emax2.py --sprawdz \
    --pdf <plik> --wyjscie docs/katalog/zrodla/abb_emax2_1SDC200023D0205.json
```

Importer przypina dokument sumą SHA-256, parsuje tabele zamówieniowe i
**przerywa import**, gdy niezależna tabela zbiorcza tego samego katalogu nie
potwierdzi wartości. Metodę waliduje reprodukcja ISTNIEJĄCEGO wpisu
`cb_nn_1600a` (rama E1.2 C, Icu 440 V = 50 kA) ze strony 17 tego samego
dokumentu — czyli kontrola wobec danej, której importer nie tworzył.

### 1.2 Aparat pola źródłowego DER — przestrzeń katalogu z napięcia szyny

**Trzy ogniwa, jedno założenie.** Przestrzeń katalogu była ZASZYTA na
`APARAT_NN` w zapisie pola, w kontroli istnienia aparatu przed mutacją i w
promocji wpisu do realnego łącznika. Rozkład zmierzony: 78 niezwiązanych
aparatów w 26 szablonach — **66 na szynie 15 kV** (przyłączenie przez
transformator blokowy, 21–127 A, rodzina `APARAT_SN`) i **12 na 0,4 kV**
(prosument, 79 A, `APARAT_NN`). Wiązanie aparatu SN nie materializowało się w
przestrzeni nN, więc promocja cicho wracała `(None, None)` i łącznik powstawał
bez `catalog_ref` — mimo że pole wiązanie MIAŁO.

Regułę „napięcie szyny → przestrzeń" trzyma teraz `domain/dobor_aparatu_pola.py`
i czytają ją wszystkie trzy ogniwa.

**Bramka klasy napięciowej złapana PRZY naprawie.** Dobór po samym prądzie
wiązał aparat 690 V do szyny 15 kV: transformator WN/SN 110/15 kV daje
`I_n = 385 A`, więc kryterium prądowe spełniała pierwsza pozycja rodziny nN.
Dla SN obowiązuje `U_m(aparatu) ≥ U_m(sieci)` wg szeregu IEC 60038 — sieć 15 kV
wymaga aparatu 17,5 kV, bo rodzina „12 / 17,5 / 24 kV" JEST szeregiem napięć
najwyższych urządzenia wg IEC 62271-1. Mapa szeregu jest ZAMKNIĘTA: napięcie
spoza niej to odmowa doboru, nie domyślna klasa izolacji.

### 1.3 Granica doboru — nazwana, nie przemilczana

Kryterium prądowe jest warunkiem KONIECZNYM, nie wystarczającym. Wynik doboru
niesie jawną listę KRYTERIÓW ODŁOŻONYCH: zdolność wyłączalna `Icu` wobec
spodziewanego prądu zwarciowego, obciążalność toru `Iz′`, selektywność. Na
etapie materializacji szablonu prąd zwarciowy nie jest policzony, więc pełny
dobór normatywny nN (cztery kryteria IEC 60364/60947) robi
`application/analyses/nn_device_selection` na GOTOWYM modelu. To nie są dwie
ścieżki tej samej fizyki, tylko dwa różne zadania: pre-dobór z tabliczki i
weryfikacja normatywna z modelu.

---

## 2. Współczynnik wkładu zwarciowego OZE — defekt P0

**Najpoważniejsze znalezisko tej transzy.** Wkład zwarciowy KAŻDEGO źródła
przekształtnikowego w produkcie brał się z liczby, której nikt nie wybrał ani
nie widział — a audyt pokazywał ją jako daną katalogową. Wynik trafia do doboru
aparatury i nastaw zabezpieczeń.

### 2.1 Co zmierzono

| Obserwacja | Pomiar |
|------------|--------|
| `k_sc = 1.1` wpisane na sztywno | **9 niezależnych miejsc** w `src` |
| Uzasadnienie liczby w repozytorium | **brak** — ani komentarza, ani odsyłacza |
| Pozycje katalogu z `sc_model` | **0 / 176** |
| Pole `k_sc` w typie katalogowym przekształtnika | **nie istnieje** |
| `SourceKind.DEFAULT_FORBIDDEN` w kontrakcie proweniencji | istnieje, **emitowany 0 razy** |
| Znacznik śladu dla `k_sc` przy źródle związanym z katalogiem | `CATALOG`, ścieżka `converter_types[<ref>]` |
| Operacje domenowe zapisujące `MaterializedSourceParams.k_sc` | **0** (pole bez producenta) |

Cztery warstwy jednej sprawy:

1. **Domyślna wartość fizyczna** w module, którego docstring deklaruje
   „NO heuristics, NO default physical values, NO data guessing".
2. **Obietnica bez testu** — kategoria `DEFAULT_FORBIDDEN` istniała wyłącznie
   jako deklaracja w kontrakcie.
3. **Fałszywy ślad audytowy** — `k_sc` meldował pochodzenie katalogowe dla
   wartości, której żaden katalog nie zawiera. To jest groźniejsze niż sama
   domyślka: domyślkę widać, fałszywy znacznik ją UKRYWA.
4. **Phantom kontraktu** — pole `k_sc` istniało w modelu operacji i w lustrze
   TypeScript, ale nic go nie zapisywało, więc deklaracja projektanta nie miała
   jak dotrzeć do solvera.

### 2.2 Co naprawiono

* Jedna stała w `network_model/core/wklad_zwarciowy_przeksztaltnika.py` zamiast
  dziewięciu literałów; skan AST po całym `src` pilnuje, żeby dziesiąty nie
  powstał.
* Jeden predykat akceptacji dla wszystkich torów. Wcześniej
  `data.get("k_sc", 1.1)` przyjmowało zero i wartości ujemne, a
  `isinstance(...) and k_sc > 0` w innym torze je odrzucało — ta sama dana dawała
  różny wynik zależnie od tego, którędy weszła do modelu.
* **Jedno pole, nie dwa.** `InverterSource.k_sc` trzyma DEKLARACJĘ (`None` =
  nikt nie podał), a wartość użytą w rachunku (`k_sc_efektywny`) i znacznik
  pochodzenia (`k_sc_zrodlo`) WYPROWADZA właściwościami z tego samego pola.
  Pierwsza wersja tej naprawy trzymała wartość i znacznik obok siebie —
  `InverterSource(k_sc=1.35)` dawało wartość deklarowaną ze znacznikiem
  „domyślne", czyli dokładnie ten wzorzec, który kanon nazywa defektem
  czekającym na dane brzegowe. Jawny argument konstruktora JEST deklaracją;
  domyślka powstaje z POMINIĘCIA argumentu, nie z wpisania liczby równej
  domyślce.
* **Serializacja niesie deklarację, nie wartość efektywną.** Inaczej obieg
  `from_dict(to_dict(x))` zamieniałby domyślkę w deklarację (1,1 jest liczbą
  dodatnią), i po jednym zapisie modelu ślad przestawałby odróżniać oba
  przypadki.
* Ślad White Box mówi prawdę: `DEFAULT_FORBIDDEN` dla domyślki (pierwsze użycie
  tej kategorii w historii repozytorium), `CATALOG`/`OVERRIDE` dla deklaracji.
* Phantom zamknięty: `add_converter_source` przyjmuje `k_sc` i zapisuje go do
  tabliczki, a pełny łańcuch (żądanie → tabliczka → mapowanie ENM →
  `InverterSource` → ładunek solvera) ma test.

### 2.3 Zmierzona granica naprawy

`GeneratorSN` i `GeneratorNN` też niosły literał `1.1` i też zostały przepięte na
wspólną stałą — ale ich semantyki deklaracji NIE zmieniono. Powód jest zmierzony,
nie uznaniowy: obie klasy **nie są instancjonowane nigdzie w `src`**, a
`get_sc_contribution_a` **nie jest wołane nigdzie w `src`**; służą wyłącznie jako
typy w `network_model/validation/oze_validators.py`. Nie zasilają produkcyjnej
ścieżki zwarciowej, więc rozszerzanie na nie zmiany kontraktu byłoby pracą bez
odbiorcy. Defekt, który JE dotyczył — dziewiąta kopia tej samej liczby — jest
usunięty.

### 2.4 Czego świadomie NIE zrobiono

Nie orzeczono, że `1.1` jest wartością normatywną. Takiego przypisu nie da się
uczciwie postawić bez dokumentu normy w ręku, a zmyślona podstawa normatywna
byłaby gorsza niż jawnie nazwana domyślka. Wartość zostaje jako DOMYŚLNA
SYSTEMOWA — stan „nikt nie podał danych" — i tak jest raportowana w śladzie.

**DECYZJA DLA WŁAŚCICIELA:** czy brak deklaracji `k_sc` ma BLOKOWAĆ gotowość
inżynierską (jak brak wiązania aparatu), czy pozostać ostrzeżeniem widocznym w
śladzie. Argument za blokadą: wynik zwarciowy zasila dobór aparatury i nastawy
zabezpieczeń. Argument przeciw: zablokowałoby to każdy istniejący projekt z OZE
do czasu uzupełnienia danych z kart producentów.

---

## 3. Macierz gotowości katalogów

Pomiar odtwarzalny:

```bash
cd mv-design-pro/backend && poetry run python scripts/inwentarz_katalogow.py
```

| Rodzina | N | kompl. pól | dok. zewn. | źródło projektowe | etykieta wewn. | Klasa |
|---------|---|-----------|-----------|------------------|----------------|-------|
| ptpiree_generator_certificates | 6887 | — | 6887 | 0 | 0 | FIELD_COMPLETE_SOURCE_VERIFIED |
| transformer_types | 192 | 100 % | 37 | 0 | 0 | FIELD_COMPLETE_ZRODLA_MIESZANE |
| converter_types | 176 | 100 % | 1 | 0 | 175 | FIELD_COMPLETE_ZRODLA_MIESZANE |
| inverter_types | 176 | 100 % | 1 | 0 | 175 | FIELD_COMPLETE_ZRODLA_MIESZANE |
| pv_inverter_types | 66 | 100 % | 1 | 0 | 65 | FIELD_COMPLETE_ZRODLA_MIESZANE |
| bess_inverter_types | 64 | 100 % | 0 | 0 | 64 | FIELD_COMPLETE_BEZ_ZRODLA_ZEWNETRZNEGO |
| cable_types | 63 | 100 % | 58 | 4 | 1 | FIELD_COMPLETE_ZRODLA_MIESZANE |
| lv_breaker_mcb_types | 60 | 100 % | 60 | 0 | 0 | FIELD_COMPLETE_SOURCE_VERIFIED |
| mv_apparatus_types | 48 | 100 % | 20 | 0 | 0 | FIELD_COMPLETE_ZRODLA_MIESZANE |
| switch_equipment_types | 48 | 100 % | 20 | 0 | 0 | FIELD_COMPLETE_ZRODLA_MIESZANE |
| lv_fuse_link_types | 30 | 100 % | 30 | 0 | 0 | FIELD_COMPLETE_SOURCE_VERIFIED |
| line_types | 26 | 100 % | 25 | 0 | 1 | FIELD_COMPLETE_ZRODLA_MIESZANE |
| source_system_types | 22 | 100 % | 0 | 22 | 0 | FIELD_COMPLETE_SOURCE_VERIFIED |
| lv_apparatus_types | 18 | 100 % | 15 | 0 | 0 | FIELD_COMPLETE_ZRODLA_MIESZANE |
| lv_cable_types | 17 | 100 % | 17 | 0 | 0 | FIELD_COMPLETE_SOURCE_VERIFIED |
| vt_types | 13 | 100 % | 13 | 0 | 0 | FIELD_COMPLETE_SOURCE_VERIFIED |
| ct_types | 12 | 100 % | 12 | 0 | 0 | FIELD_COMPLETE_SOURCE_VERIFIED |
| protection_device_types | 12 | 100 % | 0 | 0 | 12 | FIELD_COMPLETE_BEZ_ZRODLA_ZEWNETRZNEGO |
| surge_arrester_types | 12 | 100 % | 12 | 0 | 0 | FIELD_COMPLETE_SOURCE_VERIFIED |
| protection_curves | 8 | — | 8 | 0 | 0 | FIELD_COMPLETE_SOURCE_VERIFIED |
| protection_setting_templates | 8 | — | 8 | 0 | 0 | FIELD_COMPLETE_SOURCE_VERIFIED |
| shunt_capacitor_types | 5 | 100 % | 0 | 0 | 5 | FIELD_COMPLETE_BEZ_ZRODLA_ZEWNETRZNEGO |
| load_types | 3 | 100 % | 0 | 3 | 0 | FIELD_COMPLETE_SOURCE_VERIFIED |

**Kompletność pól wymaganych wynosi 100 % w KAŻDEJ rodzinie** — licząc PER
ZDOLNOŚĆ, którą rodzina zasila, i biorąc NAJGORSZĄ z nich (korekta po recenzji:
wcześniej był jeden wskaźnik na rodzinę, więc brak pola potrzebnego wyłącznie
modelowi strat rozpływał się w średniej).

**KOMPLET PÓL TO NIE KWALIFIKACJA PRODUKCYJNA.** Klasy nazywają się teraz
`FIELD_COMPLETE_*` właśnie dlatego: mówią o kompletności pól oprogramowania i o
klasie proweniencji, a NIE o zweryfikowaniu danych wobec dokumentu producenta.
Żadna rodzina nie jest tu oznaczona jako PRODUCTION_QUALIFIED — takiej etykiety
nie przyznaje sobie pomiar wewnętrzny.

### 3.1 Klasy proweniencji

* **DOKUMENT ZEWNĘTRZNY** — numer katalogu producenta, oznaczenie normy albo
  strukturalny odsyłacz (`document_number`, `source_url`).
* **ŹRÓDŁO PROJEKTOWE / OSD** — dana, której producent NIE publikuje, bo nie
  jest jego: warunki przyłączenia, standard projektowy operatora, profil
  odbioru. Brak numeru katalogowego jest tu stanem POPRAWNYM.
* **ETYKIETA WEWNĘTRZNA** — seria opisana wyłącznie jako „profil przemysłowy
  MV-DESIGN-PRO". To najsłabsza klasa i jedyna, która wymaga uzupełnienia.

### 3.2 Gdzie leży realny dług proweniencji

| Rodzina | Pozycje bez źródła zewnętrznego |
|---------|--------------------------------|
| converter_types + inverter_types | 350 |
| pv_inverter_types + bess_inverter_types | 129 |
| transformer_types | 155 |
| mv_apparatus_types / switch_equipment_types | 28 |
| protection_device_types | 12 |
| shunt_capacitor_types | 5 |
| lv_apparatus_types | 3 |
| cable_types / line_types | 2 |

**DATA_ACQUISITION_REQUIRED.** Te pozycje mają komplet pól i przechodzą
walidacje — brakuje im wyłącznie wskazania dokumentu producenta. Uzupełnienie
wymaga kart katalogowych, których w repozytorium nie ma; wpisanie numerów „z
głowy" byłoby fabrykacją proweniencji, czyli defektem groźniejszym niż jej brak.

Droga jest przygotowana i sprawdzona na rodzinie ACB: dokument →
importer z sumą SHA-256 → kontrola krzyżowa wobec niezależnej tabeli →
commitowany wyciąg → wpisy katalogu z odsyłaczem do strony źródła.

### 3.3 Pomyłki miernika, złapane i przypięte testami

Miernik gotowości może kłamać na dwa sposoby i oba zdarzyły się przy jego
pisaniu:

1. **Nazwa pola z pamięci.** Pytanie o `primary_a` / `i_th_a` / `q_mvar` —
   nazwy, których kontrakt nie ma — dało 0 % kompletności tam, gdzie dane BYŁY
   (`ratio_primary_a`, `ith_1s_a`, `rated_mvar`). Fałszywy brak danych wygląda
   jak wynik.
2. **Wzorzec zamiast struktury.** Klasyfikacja proweniencji po samym wyrażeniu
   regularnym uznała 6887 certyfikatów PTPiREE za „bez źródła zewnętrznego", bo
   „PTPiREE Wykaz urzadzen 1.2" nie ma numeru w kształcie normy — mimo że rekord
   niesie `document_number`, `source_url` i datę publikacji.

Oba przypadki mają teraz przypięte testy
(`tests/network_model/catalog/test_inwentarz_katalogow.py`).

### 3.4 Pole wyprowadzalne to NIE brak

`idyn_ka_peak` (CT) wyprowadza się z `ith_ka_1s` wg IEC 61869-2, a `ith_1s_a`
(przewody) z `jth_1s_a_per_mm2` i przekroju wg IEC 60949. Katalog trzyma
PODSTAWĘ, nie wynik — i to jest poprawna proweniencja (§19: DERIVED oddzielone
od DIRECT), nie luka.

**Korekta własnego znaleziska.** W trakcie pracy wpisałem `jth_1s_a_per_mm2` do
ośmiu typów kabli SN (YHAKXS, YHKXS), które go nie miały, uznając to za
uzupełnienie braku. To był **błąd i został wycofany**: dla tych typów
`derive_k_iec60949` liczy `k` ze wzoru normy i znakuje ślad jako
`K_SOURCE_DERIVED_IEC60949`. Wpisanie wartości tablicowej do rekordu kazałoby
śladowi zameldować `K_SOURCE_CATALOG`, czyli twierdzić, że producent tę liczbę
podał — dokładnie to, czego zakazuje §19. Braku nie było; był poprawnie
rozwiązany przez wyprowadzenie.

Zostało to zamienione na test WŁAŚCIWEGO niezmiennika: każdy przewód produkcyjny
da się sprawdzić cieplnie — z katalogu ALBO wyprowadzeniem — oraz na NIEZALEŻNY
oracle, który przelicza KAŻDE katalogowe `k` wzorem normy na zadeklarowanej
przez ten sam rekord trójce (materiał, θb, θk).

---

## 4. Stan bramek

| Bramka | Wynik |
|--------|-------|
| Pełna regresja backendu (baza + wyłącznik główny + pole DER) | 11643 passed, 6 skipped, 0 failed |
| `black`, `ruff` | czyste |
| arch / pcc_zero / domain_no_guessing / canonical_ops | 0 |
| catalog_binding / catalog_enforcement / catalog_gate / catalog_metadata | 0 |
| readiness_codes / audit_contract / solver_boundary / repo_hygiene / docs | 0 |
| enm_contract_parity | 69/69 encji |

---

## 5. Czego ta transza NIE rozstrzyga

* **Nie przyznano żadnego statusu zaufania.** Kod dynamiczny pozostaje
  `UNVALIDATED_MODEL`, D-00 nietknięte, PR #475 niescalone.
* **Granica SLD nietknięta.** Fikstura `sldNetwork53.ts` zregenerowana własnym
  generatorem repozytorium; zmiana to JEDNA linia `source_hash` (migawka ENM
  niesie teraz wiązanie pola), a zdestylowany model SLD — stacje, geometria,
  topologia — jest bajtowo bez zmian.
* **Blokada gotowości przy braku `k_sc`** — decyzja właściciela, sekcja 2.4.
* **Uzupełnienie proweniencji 350+ pozycji przekształtników** — wymaga kart
  producentów, sekcja 3.2.
