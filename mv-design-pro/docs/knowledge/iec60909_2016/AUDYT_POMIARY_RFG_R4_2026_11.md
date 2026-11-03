# MV-DESIGN-PRO — R4: materiały pomiarowe i PTPiREE NC RfG v3.0

Data indeksacji: **2026-11-03**. Status: **warstwa wiedzy, nie solver, nie gotowy certyfikator PGM**.

## Źródło A — EMH, Landis+Gyr, Pozyton, Poznań lipiec 2018
Plik lokalny: `OK _Wzory EMH LANDIS POZYTON.pdf`. 2 strony, SHA-256 `da8f751f26566a49b6ea0cfa4f8c0a890486eacf0e8a068623e868ff3a484743`.
**Klasyfikacja: materiał techniczny / zestawienie robocze, nie Polska Norma i nie samodzielny standard ENEA.**

Na stronie 1 zestawiono układy **pośrednie** i **półpośrednie**, na stronie 2 **bezpośrednie**. Każdy z trzech typów licznika ma odrębnie zdefiniowany zapis współczynników strat prądowych `Aobc (I²h)` i napięciowych `Ajał (U²h)`. Formuły obejmują odcinki SN/nN, linie kablowe/napowietrzne oraz straty transformatora: obciążeniowe `ΔPcu` i jałowe `ΔPFe(S)`.

### Mnożniki — niebezpieczna pułapka
| Układ i składnik | EMH | Landis+Gyr | Pozyton |
|---|---:|---:|---:|
| Pośredni: Aobc=R₀·l·δp² | bez mnożnika | bez mnożnika | ×10⁻³ |
| Pośredni: Ajał kabla | ×10⁻⁹ | ×10⁻⁶ | ×10⁻⁶ |
| Półpośredni: Aobc transformatora, czynnik bazowy (δp/In₂)²·(1/3)·ΔPcu | ×10³ | ×10³ | bez mnożnika |
| Półpośredni: Ajał transformatora, czynnik bazowy (1/Un₂)²·ΔPFe(S) | ×10⁻³ | bez mnożnika | bez mnożnika |
| Bezpośredni: Aobc linii SN, bazowo R₀·l·(1/δTR)² | bez mnożnika | bez mnożnika | ×10³ |
| Bezpośredni: Aobc transformatora, bazowo (1/In₂)²·(1/3)·ΔPcu | ×10³ | ×10³ | ×10⁶ |
| Bezpośredni: Aobc nN, bazowo R₀·l | bez mnożnika | bez mnożnika | ×10³ |

Pełne wzory i odsyłacze do stron są w kartach `MTR-*` pliku rozszerzenia. W szczególności **nie wolno zmieniać mnożników**, aby „ujednolicić” zapis różnych liczników.

**Uwaga ZMD (PDF str. 2):** materiał wskazuje konfigurację ENEA Operator `Rcu=1 Ω`, `Rfe=1 kΩ`; w tym kontekście dla ZMD na podstawie EMH/LZQJ-XC podaje `I²h(LANDIS)=I²h(EMH)` i `U²h(LANDIS)=1000·U²h(EMH)` dla wszystkich trzech sposobów pomiaru.

**Bramka interpretacji:** załącznik nie definiuje w sposób kompletny jednostek i semantyki wszystkich symboli `δp`, `δTR`, `δN`, `R₀`, `l`, `C`, `In₂`, `Un₂`, `ΔPcu`, `ΔPFe`. Dlatego z tych wzorów nie implementowano kalkulatora produkcyjnego. Najpierw konieczna jest weryfikacja wymiarowa na danych liczników i rzeczywistych przykładowych rozliczeniach. Nie należy także mieszać **współczynników rozliczeniowych** z fizycznymi wynikami strat rozpływowych solvera.

## Źródło B — PTPiREE Procedura testowania NC RfG v3.0
Plik lokalny: `Procedura- zmieniona.pdf`, 155 stron, SHA-256 `51dec3245466e2b12ac2960a627e20ba2a75cffaf3c5e8a933878420775076e8`.
Status: dokument publiczny PTPiREE, **publikacja 15.12.2025, obowiązuje od 01.01.2026**, wersja 3.0. Wymogi rozporządzenia Komisji UE 2016/631 oraz WOS i uzgodnienia operatora są **odrębnymi podstawami**, których sam program ramowy nie zastępuje.

### Mapa PDF: globalny numer strony / załącznik
| PDF strony | Poddokument |
|---|---|
| 1–15 | Procedura główna (§1–10) |
| 16–27 | 10.1 LFSM-O |
| 28–40 | 10.2 LFSM-U |
| 41–52 | 10.3 FSM |
| 53–69 | 10.4 Regulacja odbudowy częstotliwości |
| 70–75 | 10.5 Praca na potrzeby własne |
| 76–82 | 10.6 Generacja Q na napięciu ≥110 kV |
| 83–88 | 10.7 Generacja Q na napięciu poniżej 110 kV |
| 89–93 | 10.8 Regulacja P |
| 94–98 | 10.9 Tłumienie oscylacji |
| 99–105 | 10.10 Regulacja U |
| 106–111 | 10.11 Regulacja Q |
| 112–117 | 10.12 Regulacja cosφ |
| 118–124 | 10.13 Dodatkowy test PMAX |
| 125–129 | 10.14 Dodatkowy test PMIN |
| 130–139 | 10.15 Praca wyspowa |
| 140–147 | 10.16 Rozruch autonomiczny |
| 148–151 | 10.17 Zaprzestanie generacji P |
| 152–155 | 10.18 Zmniejszenie generacji P |

**Poddokumenty mają osobną numerację stron drukowanych.** Np. PDF str. 83 to str. 1 programu 10.7; PDF str. 85 to str. 3 tego samego programu. W `kb.py` stosuje się `source.document_start_page` i test `printed_page = pdf_page - document_start_page + 1`.

### Wybrane bramki proceduralne i pułapki
- §4, tablica 1 (PDF 5–6): zakres testów zależy od typu **A/B/C/D**, technologii **SyPGM/PPM/morski PPM** i rozróżnienia sprawdzeń podstawowych/dodatkowych. Znak „–” oznacza brak określonego testu z samego NC RfG, nie ogólny werdykt zgodności obiektu.
- §5.1 (PDF 7–9): dla A/B przy braku certyfikatów wymaganych zdolności — testy i dołączenie sprawozdania do dokumentacji DI/PGMD, z zachowaniem prawa właściwego OS do uczestnictwa. Udział OS jest warunkiem, gdy go zażądał.
- §5 (PDF 7): niepotwierdzenie deklarowanego PMAX/PMIN w wymaganym teście uruchamia potrzebę ponownego wykonania wszystkich testów z poprawionymi wartościami.
- §5 (PDF 7): wymóg przeprowadzenia testów przez odpowiednio wyspecjalizowany **niezależny podmiot trzeci**; nie utożsamiać projektanta i osoby testującej bez sprawdzenia niezależności.
- §5.1 pkt 2 (PDF 8): rzeczywiste warunki obiektowe; dopuszczalna symulacja sygnału wejściowego, gdy technicznie konieczna; automatyka i istotne układy normalnie czynne.
- §5.1 (PDF 8–9): rozróżnienie rejestrowanej **mocy brutto na zaciskach generatora** i **netto w punkcie przyłączenia**.
- §5.1 (PDF 9): dla typu B pozytywny wynik wymaganych testów jest **warunkiem koniecznym**, nie jedyną przesłanką pozwolenia na użytkowanie.
- §5.2 (PDF 9–11): dla C/D konieczny uzgodniony program szczegółowy, zgłoszenie terminu **co najmniej 14 dni** wcześniej (PDF 10), rejestracja sygnałów z rozdzielczością co najmniej **1 s** o ile OS nie określi inaczej (PDF 11).
- §7–9 (PDF 14–15): zmiany układów regulacji oraz niektóre modernizacje i incydenty mogą wymagać testów zdarzeniowych; o zakresie decyduje OS.
- Zał.10.1 §5.5.1 (PDF 22): LFSM-O sprawdza nastawialność progu **+200…+500 mHz** i statyzmu **2–12%** (z wyjątkiem dolnej granicy 3% dla określonej technologii gazowo-parowej).
- Zał.10.2 §5.5.1 (PDF 34): LFSM-U analogicznie **−200…−500 mHz**, statyzm **2–12%**. **Nie należy traktować całego zakresu nastawialności jako jednej wymuszonej nastawy.**
- Zał.10.1 definicje (PDF 18): t1=2 s i t2=30 s opisano jako **proponowane**; wartości ostatecznie określa właściwy OS.
- Zał.10.7 (PDF 83–88): dla farm przyłączonych do **15 kV** odpowiedni jest program zdolności Q **poniżej 110 kV**, a nie program 10.6 ≥110 kV.
- Zał.10.10–10.12 (PDF 99–117): regulacja U, regulacja Q i regulacja cosφ są **oddzielnymi** trybami i programami badań; nie wolno ich scalać w jeden abstrakcyjny „test Q”.

### Klasyfikacja odpowiedzi w bazie
1. `source_derived`: informacja dosłownie zgodna ze wskazanym rozdziałem programu, opisana własnymi słowami.
2. `conditional`: warunek zależy od konfiguracji licznika, typu PGM, rodzaju certyfikatu, wymogów WOS, dokumentacji i właściwego operatora.
3. `proposal_not_in_solver`: reguła kontrolna do przyszłego przepływu dokumentów; nie jest implementacją ani własnym wymaganiem normy.

## Zakres wdrożenia
- 2 nowe źródła z SHA-256, 62 karty i 20 propozycji reguł (łączny indeks po R4: **230 kart / 9 źródeł / 79 reguł**).
- 18 programów PTPiREE ma osobne karty rozpoczynające się od fizycznej strony PDF i odrębną resetowaną numerację stron.
- Przeglądarka offline, wyszukiwanie FTS5 i testy metadanych są rozszerzane w tym PR.
- Nie dodano oryginalnych PDF do repozytorium, nie zmieniono solvera zwarć/rozpływu, modeli SLD, kalkulatorów rozliczeniowych, ani procesu nadawania pozwolenia na użytkowanie.

**Walidacja produkcyjna** wymaga niezależnego sprawdzenia jednostek formuł, wartości liczników oraz kompletnego programu szczegółowego z OS. Sam indeks norm i procedur nie certyfikuje jednostki wytwórczej.
