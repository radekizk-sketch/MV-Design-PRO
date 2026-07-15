# SPECYFIKACJA KREATORÓW — MAKSYMALNA SZCZEGÓŁOWOŚĆ, ZERO PUSTYCH PÓL (2026-07)

**Status:** WIĄŻĄCY dla Programu UI/UX 2026-07 (epik E3; okna W-201…W-204)
**Data:** 2026-07-15 (dyrektywa właściciela: „kreatory maksymalnie szczegółowe i intuicyjne,
gotowe przykłady z maksymalnie uzupełnionymi danymi i podpowiedzią")
**Relacja do kanonu (zero dwóch prawd):**
- `docs/ui/UX_KREATOR_SIECI_SN_OD_GPZ.md` — payloady operacji domenowych kreatora: OBOWIĄZUJĄ bez zmian.
- `docs/ui/KANON_KREATOR_SN_NN_NA_ZYWO.md` — zasada „1 klik = 1 operacja", SLD na żywo: OBOWIĄZUJE.
- Ten dokument dodaje warstwę UX kreatorów (prefill, podpowiedzi, gotowe przykłady) — nie zmienia
  kontraktów domenowych ani API.

---

## 1. Trzy zasady naczelne

### Z1 — ZERO PUSTYCH PÓL
Każde pole każdego kroku kreatora jest wstępnie wypełnione uzasadnioną wartością. Hierarchia
źródeł wartości domyślnej (od najsilniejszego):
1. **Typ katalogowy** (katalog-first — parametry z karty typu, nieedytowalne poza wyborem typu),
2. **Szablon stacji / wzorzec referencyjny** (`station_templates`, `reference_patterns`),
3. **Kontekst modelu** (np. napięcie z szyny nadrzędnej, długość z poprzedniego odcinka),
4. **Wartość typowa inżynierska** z jawnym źródłem (norma/praktyka OSD), oznaczona jako
   „podpowiedź inżynierska — do potwierdzenia".
Wartość domyślna jest zawsze edytowalna (poza parametrami typu katalogowego) i zawsze pokazuje
swoje pochodzenie (skąd się wzięła). Pole, którego nie da się sensownie wypełnić, dostaje
jawny stan „wymaga decyzji inżyniera" z instrukcją — nigdy pustkę bez wyjaśnienia.

### Z2 — PODPOWIEDŹ PRZY KAŻDYM POLU
Każde pole ma podpowiedź (ikona ⓘ + hover/fokus) o stałej strukturze, pisaną językiem
inżyniera SN (nie marketingowym):
```
CO TO JEST     — jedno zdanie (z symbolem normowym, np. „uk — napięcie zwarcia [%]")
ZAKRES TYPOWY  — liczby z jednostkami (np. „4,5–6,5% dla TR 15/0,4 kV do 630 kVA")
SKĄD DOMYŚLNA  — źródło wartości (typ katalogowy / szablon / norma / praktyka)
KONSEKWENCJA   — na co wpływa (np. „wyższe uk → mniejszy prąd zwarcia po stronie nn,
                 większy spadek napięcia")
```
Podpowiedzi są treścią karty zadania (dokładne stringi PL) — wykonawca ich nie wymyśla.

### Z3 — GOTOWE PRZYKŁADY NA STARCIE
Każdy kreator otwiera się galerią kompletnych, w pełni sparametryzowanych przykładów
(sekcja §4). Wybór przykładu buduje CAŁĄ strukturę operacjami domenowymi (nie importem
obejściowym) i zostawia inżyniera w trybie edycji — może zmienić każdy element.
Przykład ≠ szkic: przechodzi walidację, ma komplet typów katalogowych i gotowość
umożliwiającą natychmiastowe uruchomienie analiz.

## 2. Kreator sieci SN (W-201/W-202) — przepływ maksymalnie szczegółowy

Kroki (każdy krok = żywy podgląd SLD + panel gotowości; zasada „1 klik = 1 operacja"):

| Krok | Zakres | Prefill (źródło) | Kluczowe podpowiedzi |
|---|---|---|---|
| 1. Źródło (GPZ) | napięcie, S″k3, R/X, typ pola zasilającego | typ katalogowy TR 110/SN; S″k3 z podglądu źródła (`grid_source_preview`); R/X = 0,1 (praktyka OSD) | co znaczy S″k3 i skąd ją wziąć od OSD; wpływ R/X na ip |
| 2. Magistrala | typ kabla/linii, przekrój, długość odcinka, sposób ułożenia | katalog (np. 3×XRUHAKXS 120 dla magistrali miejskiej); długość 0,8 km (mediana odcinka SN miejskiego) | dobór przekroju do I″k i obciążalności; ziemia vs kanalizacja |
| 3. Stacje na magistrali | typ stacji (szablon), transformator, pola SN, strona nn | `station_templates` (miejska przelotowa / odgałęźna / RMU); TR 250–630 kVA wg gęstości odbiorów | typy stacji z konsekwencją dla pierścienia; dobór mocy TR do obciążenia szczytowego |
| 4. Odgałęzienia i pierścień | punkty odgałęzień, domknięcie pierścienia, NOP | wzorce referencyjne (`reference_patterns`); NOP na łączniku środkowym pierścienia | po co NOP i gdzie go stawiać; wpływ na niezawodność (SAIDI) |
| 5. Odbiory nn | P, cosφ, profil | wartości typowe wg typu odbiorcy (mieszkalny 4 kW/lokal, usługowy wg m²) | ZIP vs stała moc; szczyt vs średnia |
| 6. Podsumowanie | bilans, gotowość, braki | automat | lista fix-actions z linkami |

Nawigacja: krok ↔ krok bez utraty danych; `Esc` = wyjście z zachowaniem modelu (operacje już
zapisane — kreator nie ma własnego bufora, zgodnie z kanonem „na żywo").

## 3. Kreator stacji SN/nn (W-203) i kreator DER (W-204)

**Stacja:** wybór szablonu (galeria z miniaturą schematu pól: liczba pól liniowych/trafo/
pomiarowych/sprzęgła) → prefill kompletu aparatów z typów katalogowych (wyłącznik/rozłącznik/
uziemnik/przekładniki wg szablonu) → strona nn (rozdzielnica, odpływy) → uziemienie (R_uz
z podpowiedzią pomiarową). Każdy aparat ma podpowiedź z parametrami granicznymi (I_th, I_dyn)
zestawionymi z wynikami zwarciowymi, gdy istnieją.

**DER (PV / BESS / FW / agregat / UPS):** wybór technologii → prefill zestawu: falownik
(typ katalogowy), transformator blokowy (jeśli moc > próg), tryby pracy (cosφ(P), Q(U) wg
NC RfG — profil operatora z `ncrfg_ptpiree`), krzywa FRT z wymagań OSD. Podpowiedzi tłumaczą
wymagania przyłączeniowe (moduł B/C/D wg mocy) i konsekwencje trybów regulacji dla profilu
napięcia. Po dodaniu DER kreator proponuje od razu: „uruchom test zgodności NC RfG".

## 4. Gotowe przykłady (galeria startowa — komplet danych)

Seed (rozszerzalny; źródła: sieci referencyjne repo + wzorce):

| ID | Przykład | Zawartość (kompletna parametryzacja) |
|---|---|---|
| P-01 | Magistrala miejska 15 kV | GPZ 110/15, 7 stacji przelotowych, kable XRUHAKXS, odbiory komunalne |
| P-02 | Pierścień z NOP | 2 magistrale, domknięcie, NOP, łączniki sekcyjne — gotowy wariant N-1 |
| P-03 | Przyłączenie PV 2,5 MW | magistrala + PV (10 falowników, TR blokowy, Q(U), FRT) — pod wniosek do OSD |
| P-04 | PV + BESS (magazyn) | jak P-03 + BESS 1 MWh z trybami ładowania/rozładowania i pracą wyspową |
| P-05 | Sieć wiejska napowietrzna | GPZ, linia AFL, stacje słupowe, odgałęzienia, agregat rezerwowy |

Wymóg twardy: każdy przykład po wczytaniu ma **gotowość bez blokad** i przechodzi pełny
przebieg „zwarcia + rozpływ" bez dodatkowych uzupełnień. Przykłady są danymi testowymi e2e
(determinizm: identyczny model przy każdym wczytaniu).

## 5. Wymogi implementacyjne (do kart zadań E3)

1. Prefill wyłącznie przez istniejące źródła (katalog, szablony, wzorce, kontekst) — ZAKAZ
   zaszywania parametrów elektrycznych w kodzie UI (guard `no_direct_fault_params_guard`).
2. Podpowiedzi: słownik w jednym module treści (PL), testowany na kompletność (każde pole
   formularza ma wpis — test kontraktowy per formularz).
3. Gotowe przykłady budowane sekwencją operacji domenowych (audytowalne, undo-owalne).
4. Telemetria kreatora liczona w bramce „100× lepiej": liczba pól do ręcznego uzupełnienia
   od startu do gotowości (cel: ≤ 5 przy użyciu przykładu; stare kreatory: kilkadziesiąt).
5. Stany, gramatyka interakcji i rejestr okien — wg `MODEL_INTERAKCJI_APLIKACJI_2026-07.md`.
