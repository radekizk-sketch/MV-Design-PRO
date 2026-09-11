# NAPRAWA CZTERECH CZERWONYCH BRAM CI — 2026-09-10

Zakres: cztery bramki, które były **twardymi krokami workflowów** (bez
`continue-on-error`) i zwracały kod ≠ 0 zarówno na HEAD gałęzi
`claude/opus5-dynamic-prearchitecture-lab`, jak i na jej bazie `2473afd2`.

Powód podjęcia: CLAUDE.md §Zero-Debt pkt 1 — „Każdy NAPOTKANY błąd naprawiasz —
także pre-existing… nie wolno go pominąć argumentem »był wcześniej« ani »poza
moim zakresem«". W rundzie 2 przeglądu transzy dynamicznej te cztery bramki
zostały **odnotowane jako dług**, a nie naprawione. Odnotowanie było naruszeniem
kanonu i ten dokument je odwraca.

## 0. Atrybucja — czyj to dług (pomiar, nie domysł)

Bramki uruchomiono na drzewie roboczym BASE (`git worktree add … 2473afd2`)
i na HEAD, kody wyjścia łapane bezpośrednio (nie przez `| tail`).

| Bramka | Workflow | BASE `2473afd2` | HEAD `22b6b7d6` | Różnica wyjścia |
|---|---|---|---|---|
| `enm_contract_parity_guard` | `python-tests.yml` | EXIT=1 | EXIT=1 | brak — bajtowo identyczne |
| `success_toast_guard` | `p0-extended-guards.yml` | EXIT=1 | EXIT=1 | brak — bajtowo identyczne |
| `solver_input_substitute_guard` | `p0-extended-guards.yml` | EXIT=1 | EXIT=1 | tylko licznik pól 1867→1868 (`capability_id`); lista naruszeń identyczna |
| `tsconfig_gate_guard` | `frontend-checks.yml` | EXIT=1 (658/39) | EXIT=1 (658/39) | brak |

**Wniosek:** transza dynamiczna nie dołożyła ani jednego naruszenia. Dług jest
zastany — co go NIE zwalnia z naprawy.

## 1. `enm_contract_parity_guard` — jedno pole poza lustrem

`Cable.return_conductor_x_ohm_per_km` (reaktancja żyły powrotnej PE/PEN,
karta P0.6) istniało w `backend/src/enm/models.py`, ale nie w lustrze
`frontend/src/types/enm.ts` — mimo że pięć bratnich pól `return_conductor_*`
już tam było. Odczyt z frontu wymuszałby rzutowanie wyłączające kontrolę typów.

Naprawa: pole dopisane w kolejności backendu, z semantyką przepisaną z modelu
(brak = dana nieznana; `fault_loop_builder` odmawia liczenia pętli — fail-closed,
nigdy domyślne zero).

## 2. `success_toast_guard` — 15 operacji bez potwierdzenia sukcesu

`operationSuccessMessages.ts` nie pokrywało 15 operacji kanonicznych (rodzina nN
i sekcje GPZ). Każdy komunikat napisany po przeczytaniu implementacji operacji,
nie z nazwy: np. `add_nn_distribution_board` tworzy rozdzielnicę **i** szynę
główną, więc komunikat wymienia oba utworzone elementy; `append_station_on_endpoint`
dostał „Dołączono", bo „Wstawiono" jest w tym pliku zarezerwowane dla operacji
rozcinających odcinek. `SILENT_OPERATIONS` nietknięte — żadna z 15 nie jest cicha.

Przypięcie (KLASA §4): do `snapshotStore.successToast.test.ts` dopisano trzy
testy czytające **ten sam** `domain/canonical_operations.py` **tym samym**
wzorcem, co bramka pythonowa — w tym asercję, że żadna operacja nie jest
jednocześnie opisana i cicha (sprzeczność, którą bramka przepuszczała, bo liczy
sumę zbiorów, a w runtime wygrywa SILENT).

## 3. `solver_input_substitute_guard` — zero udające pomiar (rdzeń tej fali)

### 3.1 Co bramka wykryła i czego NIE mogła wykryć

Bramka zgłosiła **11 naruszeń** w `enm/domain_operations_v2.py` i `enm/mapping.py`.
Inwentarz klasy (KLASA §1) — „odczyt WYMAGANEGO pola fizycznego gałęzi z zapasem
liczbowym" — dał **37 miejsc**, bo bramka widzi tylko swój zakres skanu i tylko
formy, które umie sparsować. Liczby poniżej są **przeliczone skanem**, nie
przepisane z pamięci (pierwsza wersja tej tabeli podawała 8/12/4 i sumę 35 —
korekta w dół byłaby zawyżeniem zasługi, w górę zaniżeniem długu, więc obie
strony są tu poprawione):

| Obszar | Miejsc | Decyzja |
|---|---|---|
| `enm/domain_operations_v2.py` (nN: split, merge, sprzęgło) | 9 | **naprawione u źródła** |
| `enm/domain_operations.py` (SN: wcięcie stacji, punkt odgałęzienia, łącznik sekcyjny) | 13 | **naprawione u źródła** (były zamrożone w zapadce) |
| `enm/mapping.py`, `enm/topology_ops.py` | 2 | zapadka z uzasadnieniem merytorycznym (kardynalność / sentinel przed BLOCKER) |
| `network_model/core/branch.py`, `network_model/catalog/types.py` | 9 | **poza naprawą — bramka B-01** (zamrożony rdzeń, wymaga zgody właściciela) |
| `application/reference_networks/**` | 5 | **poza naprawą** — zmiana ruszyłaby golden/determinizm; wymaga osobnego pomiaru |

Naprawione: **22 z 37**. Ostatnie dwa wiersze (14 miejsc) są wyłączeniem
z powodem merytorycznym, nie „poza zakresem"; `topology_ops.py` ma uzasadnienie
merytoryczne w samej zapadce (sentinel 0, po którym NATYCHMIAST zapada
`BLOCKER` — brak nigdy nie dociera do fizyki jako liczba).

### 3.2 Defekt: `Cable.length_km`/`r_ohm_per_km`/`x_ohm_per_km` są WYMAGANE

W `enm/models.py` te trzy pola nie mają wartości domyślnej — rekord bez nich nie
jest odcinkiem sieci, tylko rekordem uszkodzonym. Kod czytał je jednak przez
`segment.get("r_ohm_per_km", 0.0)` i `segment.get("length_km", 1.0)`, więc:

* rozcięcie/scalenie/wcięcie na takim rekordzie dawało **kabel o impedancji
  jednostkowej ZERO** — idealny zwieracz wchodzący wprost do prądu zwarciowego
  i spadku napięcia, nieodróżnialny od pomiaru,
* albo **kabel o długości 1 km wziętej znikąd**.

Naprawa: jeden helper `_fizyka_odcinka` w `enm/domain_operations.py` (reużycie,
nie druga implementacja — v2 go importuje) czyta komplet długość/R/X i zwraca
`(None, nazwa_pola)`; sześć operacji melduje brak przez `_error_response`
z kodem `*.segment_missing_physics`.

### 3.3 Defekt drugi — niewidoczny dla bramki: scalenie gubiło odcinek B

`merge_nn_segments` brał `r_ohm_per_km`/`x_ohm_per_km` **wyłącznie z odcinka A**
i rozciągał je na sumę długości obu odcinków. Zgodność z odcinkiem B wynikała
tylko z tego, że warunek wejścia (ta sama pozycja katalogowa) „dziś się zgadza" —
czyli klasyczne **rozjazd predykatów** (KLASA §3). Dane brzegowe, w których się
nie zgadza, już istnieją: `set_nn_cable_laying_conditions` przelicza R odcinka
względem warunków ułożenia, więc dwa odcinki tej samej pozycji katalogowej mogą
mieć różne R/km.

Naprawa: warunek wejścia i wyjścia z jednego źródła prawdy — różne impedancje
jednostkowe kończą operację błędem `nn.merge_impedance_mismatch`, zamiast cicho
kasować impedancję odcinka B.

### 3.4 Defekt trzeci: numer porządkowy sekcji

`add_nn_section_coupler` czytał `s.get("order", 0)`; brak `order` dawał
`last_order + 1 == 1`, czyli numer **już zajęty** przez szynę główną — cicha
kolizja porządku sekcji. Teraz sekcja bez `order` kończy operację błędem.

### 3.5 Testy maskujące defekt produktu (Zero-Debt pkt 5) — 40 czerwonych

Po naprawie 40 testów stanęło na czerwono. Przyczyna nie była w naprawie: **pięć
fikstur deklarowało gałąź `type: "cable"` z polami `r_ohm`/`x_ohm`**, które na
`Cable` **nie istnieją** (są na `SwitchBranch`/`Source`/`GroundingConfig`). Te
fikstury nigdy nie były kablami modelu — testy przechodziły wyłącznie dlatego,
że produkt podstawiał sobie 0,0 Ω/km. Dwa defekty, oba naprawione: produkt
u źródła i fikstury do realnego kontraktu (`r_ohm_per_km`/`x_ohm_per_km`,
długość 1,0 km zachowuje sumę omów).

Rozróżnienie zrobione pomiarem, nie hurtem: skan wykazał 10 gałęzi z polem
`r_ohm`, z czego 5 to **poprawne** `type: "breaker"` (SwitchBranch je ma) —
tych nie ruszono.

### 3.6 Przypięcie jako ILOCZYN CECH (KLASA §2)

`tests/enm/test_brak_fizyki_odcinka_bez_podstawien.py` — 14 testów po trzech
osiach: operacja × brakujące pole × **który odcinek** (A czy B).

Oś „który odcinek" jest dowodem naprawy KLASY, a nie instancji. **Mutacja
sprawdzająca:** przywrócono stary odczyt „tylko z A" → czerwone dokładnie
`[b-length_km]`, `[b-r_ohm_per_km]`, `[b-x_ohm_per_km]`, a warianty `[a-*]`
pozostały **zielone**. Test napisany tylko dla odcinka A nie zobaczyłby defektu.

### 3.7 Zapadka: dług zmalał, więc próg obniżony

Zdjęto z `ZASTANE_ZASTEPNIKI`: `segment.length_km` (3), `segment.r_ohm_per_km`
(5), `segment.x_ohm_per_km` (5), `run.c_factor` (1 — dług zmalał wcześniej,
budżetu nikt nie obniżył). Dopisano dwa wpisy z uzasadnieniem merytorycznym
(`branch.n_parallel`, `payload.n_parallel` — kardynalność, jedynka jest
elementem neutralnym, nie zmyśloną wielkością).

**Powód odroczenia z karty RATCHET-DICT-READ wygasł.** Karta zakazywała edycji
obu plików „bo wątek nN pracuje na nich równolegle". Wątek scalił się
(`072ee0f4`), ostatnia zmiana obu plików to 2026-08-14, a właściciel zniósł
twardą granicę wątków. Odroczenie przeżyło swój powód i zamrażało realną
fabrykację — zostało zdjęte, a nieaktualne uzasadnienie w zapadce poprawione.

## 4. `utf8_mojibake_guard` — deklaracja szersza niż detekcja

Znalezisko uboczne. Nagłówek modułu deklaruje klasę „polska litera zamieniona na
ASCII '?'" jako pokrytą, a reguła wymaga litery po **obu** stronach `?`. Realny
<!-- mojibake-guard: probka celowa — uszkodzony zapis JEST przedmiotem tego akapitu -->
komunikat operatora `"Najpierw przepi??/usun?? pola."` w `enm/domain_operations.py`
przechodził, bo po prawej stronie stoi ukośnik. Deklaracja szersza niż detekcja
jest groźniejsza niż sama luka (KLASA §4).

Naprawa: 5 artefaktów naprawionych u źródła; dołożona reguła
`ZNAKI_ZASTEPCZE_NA_KONCU_SLOWA` (dwa `?` bezpośrednio po literze) z pomiarem —
**0 fałszywych alarmów na 5034 plikach**; 4 testy przypinające obie strony
granicy. Forma z pojedynczym `?` na końcu słowa **zostaje poza detekcją** i jest
tak nazwana w module: pomiar kandydata dał 43 trafienia zdominowane przez zdania
pytajne i notację pola opcjonalnego, a bramka złożona z fałszywych alarmów uczy
ignorować bramkę.

## 5. Co pozostaje otwarte

| Pozycja | Dlaczego nie w tej fali |
|---|---|
| 9 podstawień w `network_model/core/branch.py` i `catalog/types.py` | zamrożony rdzeń — bramka B-01, wymaga zgody właściciela |
| 4 podstawienia w `application/reference_networks/**` | ruszają golden/determinizm; wymagają osobnego pomiaru hashy przed zmianą |
| `genset_spec.rated_power_kw` / `ups_spec.rated_power_kw` | dług nazwany w zapadce; tabliczka znamionowa z payloadu kreatora — wymaga decyzji, jak katalog ma walidować komplet pól |

## 6. Weryfikacja końcowa (stan `2d34f341`)

Kody wyjścia łapane BEZPOŚREDNIO (`cmd > plik 2>&1; echo "EXIT=$?"`), nigdy
przez `| tail` — pipe zwraca kod ostatniego członu i na początku tej sesji
sam się na tym złapałem, meldując EXIT=0 dla czerwonych bramek.

| Pomiar | Wynik |
|---|---|
| Klaster bramek (42 skrypty) | **0 czerwonych** |
| `pytest -q -rs` (backend, stan zacommitowany) | **11 127 passed, 6 skipped, 0 failed** (19:27) |
| `npm run test:ci` (frontend) | **887 plików, 11 989 passed, 1 skipped, 14 todo, 0 failed** (25:07) |
| `npm run type-check` | EXIT=0, zero błędów |
| `npm run lint` (`--max-warnings 0`) | EXIT=0 |

Regresję backendu puszczono DWA razy: pierwszy bieg wystartował przed
`black`/`ruff --fix`, więc mierzył drzewo o innym formatowaniu niż
zacommitowane. Powtórka na stanie zacommitowanym dała **tę samą liczbę**
(11 127), co potwierdza, że zmiana była wyłącznie formatem.

Zestaw frontendu zmierzono NIEZALEŻNIE dwa razy (wykonawca i prowadzący) —
oba biegi dały identyczne liczby. Commit `34b565e0` zostawił ten pomiar jawnie
jako niewykonany; ten akapit go domyka.

### Błąd prowadzącego w tej samej fali

`e2ce9d01` zamknął trzy bramki i **zapalił czwartą**: rozszerzyłem
`utf8_mojibake_guard` o nową formę, po czym napisałem ten dokument, który tę
formę cytuje dosłownie — i nie powtórzyłem przebiegu bramki po napisaniu
dokumentu. Znalazł to wykonawca karty długu typów i zgłosił, zamiast
przemilczeć. Naprawione w `2d34f341` znacznikiem próbki celowej.

Przyczyna źródłowa leżała w KOLEJNOŚCI, nie w kodzie: klaster bramek
uruchomiłem PRZED napisaniem dokumentacji. Wniosek do stosowania: klaster
idzie na sam koniec, po ostatniej zmianie w repozytorium, cokolwiek ta zmiana
obejmuje — dokumentacja też zapala bramki.
