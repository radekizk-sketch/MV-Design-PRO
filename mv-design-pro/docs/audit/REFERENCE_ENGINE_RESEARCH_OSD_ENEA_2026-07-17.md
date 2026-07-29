# Research: Standardy sieci dystrybucyjnej ENEA Operator — wymagania dla walidacji modelu sieci SN

Data researchu: 2026-07-17. Wszystkie cytowania pochodzą z realnie pobranych i przeczytanych PDF-ów
(pełny tekst wyekstrahowany `pdftotext -layout`, zweryfikowany stronami dokumentu — numeracja stron wg
stopki dokumentu „Strona | X/Y"). Skróty: Z1/Z2/Z3 = Zeszyty 1/2/3 standardu „Stacje elektroenergetyczne
średniego napięcia"; TELE = standard „Linie i stacje elektroenergetyczne średniego napięcia. Telemechanika".

---

## E. Metadane dokumentów (przeczytanych w całości)

| Skrót | Pełny tytuł | Wersja | Zatwierdzenie | Obowiązuje od | Stron |
|---|---|---|---|---|---|
| Z1 | „Stacje elektroenergetyczne średniego napięcia. Zeszyt 1. Stacje transformatorowe kompaktowe prefabrykowane SN/nn do 630 kVA oraz złącza/szafy kablowe SN. Standard w sieci dystrybucyjnej ENEA Operator sp. z o.o." | 09.2021 – 2 | Uchwała nr 364/2021, zmieniona Uchwałą nr 7/2024 Zarządu ENEA Operator | 02.04.2024 | 33 |
| Z2 | „Stacje elektroenergetyczne średniego napięcia. Zeszyt 2. Stacje transformatorowe kompaktowe prefabrykowane SN/nn do 400 kVA «uproszczone». Standard w sieci dystrybucyjnej ENEA Operator sp. z o.o." | 06.2024 | Uchwała nr 372/2024 Zarządu ENEA Operator (zastępuje wersję 06.2019) | 01.01.2025 | 19 |
| Z3 | „Stacje elektroenergetyczne średniego napięcia. Zeszyt 3. Stacje transformatorowe słupowe SN/nn. Standard w sieci dystrybucyjnej ENEA Operator sp. z o.o." | 06.2021 – 2 | Uchwała nr 211/2021, zmieniona Uchwałą nr 7/2024 Zarządu ENEA Operator | 02.04.2024 | 76 (14 stron części głównej + załączniki 1–5) |
| TELE | „Linie i stacje elektroenergetyczne średniego napięcia. Telemechanika. Standard w sieci dystrybucyjnej ENEA Operator sp. z o.o." | 12.2025 | Uchwała nr 8/2026 Zarządu ENEA Operator; zastępuje wersję 12.2024 standardu „Stacje elektroenergetyczne SN. Zeszyt 5. Telemechanika…" (Uchwała 223/2025) | 01.02.2026 | 18 |

Struktura serii (Z1, rozdz. 2, s. 3): standard „Stacje elektroenergetyczne średniego napięcia" obejmuje
5 zeszytów: Zeszyt 1 (kompaktowe do 630 kVA + złącza/szafy kablowe SN), Zeszyt 2 (kompaktowe do 400 kVA
„uproszczone"), Zeszyt 3 (słupowe), Zeszyt 4 (moduł bilansujący systemu AMI), Zeszyt 5 (telemechanika —
obecnie zastąpiony samodzielnym standardem TELE).

Semantyka wymagań (Z1 rozdz. 3, s. 8; Z3 s. 7; TELE rozdz. 3, s. 3): „Poprzez słowa «powinien» lub «należy»
użyte w niniejszym Standardzie należy rozumieć «musi» lub «wymaga się»." Parametry są wymaganiami
minimalnymi (Z1 rozdz. 1, s. 3; TELE rozdz. 1, s. 3).

Odstępstwa (Z1 rozdz. 6, s. 32; Z2 rozdz. 7, s. 18; Z3 rozdz. 5, s. 14; TELE rozdz. 9, s. 17–18): rozwiązania
inne niż standardowe wymagają każdorazowo indywidualnej decyzji Dyrektora właściwego Oddziału Dystrybucji
(Z3 dla odstępstw ogólnych: Dyrektora Departamentu Zarządzania Majątkiem Sieciowym w konsultacji
z Dyrektorem Departamentu Planowania i Rozwoju).

Uwaga IP: Z2 zawiera rozwiązanie chronione zgłoszeniem patentowym ENEA Operator P.425507 „Stacja
transformatorowa"; stosowanie na warunkach pkt 6 Z2 (s. 2, 15–18).

---

## A. Wymagania konstrukcyjne stacji SN/nN — hierarchia typów stacji

### A.1 Stacja kompaktowa prefabrykowana do 630 kVA = rozwiązanie podstawowe
Z1, rozdz. 2 „Zakres opracowania", s. 3 (cytat):
> „W przypadku budowy nowego układu pracy sieci lub przebudowy istniejącego, obejmującego stacje
> transformatorową SN/nn, należy jako podstawowe rozwiązanie stosować stację transformatorową kompaktową
> prefabrykowaną SN/nn do 630 kVA."

### A.2 Stacja kompaktowa do 400 kVA „uproszczona" — warunki stosowania
Z1, rozdz. 2, s. 3 (cytat):
> „Stacja kompaktowa prefabrykowana SN/nn do 400 kVA «uproszczona» powinna być stosowana w tych miejscach, gdzie:
> — do tej pory stosowano stacje transformatorowe słupowe SN/nn,
> — z punktu widzenia rozbudowy sieci SN nie będzie potrzeby zastosowania w przyszłości dodatkowych pól
>   liniowych i/lub przyłączy SN,
> — z punktu widzenia rozbudowy sieci nn nie będzie potrzeby zastosowania w przyszłości dodatkowych pól
>   liniowych i/lub przyłączy nn."

Zakres Z2 (rozdz. 2, s. 3): „wymagania dla nowo budowanych stacji transformatorowych kompaktowych
prefabrykowanych SN/nn z transformatorami do 400 kVA «uproszczonych» oraz istniejących w zakresie objętych
ich rozbudową i przebudową."

### A.3 Stacje słupowe — status i dopuszczalność
- Z1, rozdz. 2, s. 3 (cytat): „Nie zaleca się budowy nowych stacji słupowych SN/nn."
- Z3, rozdz. 2, s. 3 (cytaty):
  > „W przypadku budowy nowego układu pracy sieci lub przebudowy istniejącego, obejmującego stację
  > transformatorową SN/nn, należy jako podstawowe rozwiązanie stosować stację transformatorową kompaktową
  > prefabrykowaną SN/nn."
  > „Niniejszy zakres opracowania określa wymagania dla przebudowywanych stacji transformatorowych słupowych
  > SN/nn w zakresie objętym ich przebudową. Przy czym za zasadę należy przyjąć, iż w przypadku takiej
  > możliwości, należy stosować stację transformatorową kompaktową prefabrykowaną SN/nn, a jedynie
  > w uzasadnionych przypadkach pozostać przy technologii stacji słupowej."
  > „Nie zaleca się budowy nowych stacji słupowych SN/nn. Nie należy stosować nowych stacji słupowych SN/nn
  > z kablowym podejściem SN."
- Z3, rozdz. 5, s. 14: „Decyzja o zastosowaniu nowej stacji słupowej SN/nn (z wyłączeniem nowych stacji
  słupowych SN/nn z kablowym podejściem SN) każdorazowo indywidualnie podejmowana i ewidencjonowana będzie
  przez Dyrektora Oddziału Dystrybucji."

### A.4 Granice mocy transformatora per typ stacji
| Typ stacji | Granica mocy trafo | Źródło |
|---|---|---|
| Kompaktowa prefabrykowana (Z1) | do 630 kVA (schemat ideowy: „Transformator 6,15,20/0,4 kV/kV, Moc do 630 kVA, Napięcie dolne 420 V, Grupa połączeń Dyn5"); misa olejowa ≥ objętość oleju trafo 630 kVA (§4.7.1.k, s. 16); przekaźnik zabezpieczeniowy wyłącznika pola trafo dla trafo 160–630 kVA (§4.3.3.b, s. 11) | Z1 rys. 1 (s. 10), §4.3.3, §4.7.1 |
| Kompaktowa „uproszczona" (Z2) | do 400 kVA (rys. 1, s. 4: „Moc do 400 kVA, Napięcie górne 15/20 kV, Napięcie dolne 420 V, Grupa połączeń Dyn5"); klasa obudowy ≥ 20 dla maks. obciążenia trafo 400 kVA trwającego 6 h (§4.7.1.b, s. 10); misa olejowa ≥ objętość oleju trafo 400 kVA (§4.7.1.j, s. 10) | Z2 rys. 1, §4.7.1 |
| Słupowa (Z3) | do 400 kVA — §4.1, s. 7 (cytat): „Jako podstawowe rozwiązanie dla stacji transformatorowych słupowych SN/nn przyjmuje się stację z pełnym wyposażeniem z transformatorami o mocy do 400 kVA na napięcie znamionowe izolacji 24 kV bez pomostu obsługi na słupie strunobetonowym wirowanym." Załączniki 1–2: masa trafo 400 kVA ≤ 2300 kg; warianty nośności słupa 17,5 kN i 12 kN (rozdz. 2, s. 3) | Z3 §4.1, rozdz. 2, zał. 1–2 |

### A.5 Pojemność konstrukcyjna stacji (rozdzielnice)
- Z1 §4.1.2–4.1.3 (s. 8): stacja do 630 kVA konstrukcyjnie przygotowana do zabudowy rozdzielnicy SN
  **max. 5-polowej** (izolacja SF6 lub powietrzna z łącznikami próżniowymi) i **12 pól rozdzielczych nn**
  z rozłącznikami wielkości 2.
- Z2 §4.1.2–4.1.3 (s. 3): stacja „uproszczona" przygotowana do zabudowy rozdzielnicy SN **max. 3-polowej**
  (izolacja gazowa, powietrzna lub stało-powietrzna) i **5 pól rozdzielczych nn** z rozłącznikami
  bezpiecznikowymi wielkości 2.
- Z2 §4.1.10–4.1.11 (s. 3): wymiary maks. stacji uproszczonej 1,9 m (wys.) × 1,25 m × 2,4 m; dla stacji
  zabudowywanych po 01.01.2028: 2400 × 1300 × 2100 mm.
- Z1 §4.1.11 (s. 8): wysokość stacji do 630 kVA maks. 2 m od znacznika zakopania do dachu.
- Z1 §4.1.4–4.1.5 (s. 8): stacja musi mieć miejsce na szafę modułu bilansującego AMI oraz miejsce na szafę
  telemechaniki (z korytami kablowymi między rozdzielnicą nn, SN i szafką telemechaniki).
- Z2 §4.1.4 (s. 3): stacja uproszczona musi mieć miejsce na szafę AMI (standard Z2 nie wymienia szafy
  telemechaniki w układzie funkcjonalnym — §4.2, s. 4, wymienia tylko: rozdzielnica SN, rozdzielnica nn,
  komora transformatorowa, miejsce pod szafę AMI).

### A.6 Złącza/szafy kablowe SN (ZK SN) — Z1 rozdz. 5
- §5.1.2 (s. 20): złącze przygotowane do zabudowy rozdzielnicy SN max. 5-polowej.
- Trzy warianty (rys. 4a–4h, s. 21–26): wariant 1 — bez telemechaniki; wariant 2 — z telemechaniką
  (obudowa min. 3 pola SN + zasilanie telemechaniki); wariant 3 — z telemechaniką i układem
  pomiarowo-rozliczeniowym (pomiar pośredni); osobno „złącze pomiarowe SN z układem pomiarowo-rozliczeniowym
  pośrednim" (rys. 4h, s. 26).

---

## B. Wymagany skład pól rozdzielnicy SN i aparaty obowiązkowe

### B.1 Stacja kompaktowa do 630 kVA (Z1 §4.3, s. 11–12)
- §4.3.1 (s. 11): rozdzielnica SN (kompaktowa lub modułowa, SF6 lub powietrzna z łącznikami próżniowymi)
  powinna: „a) posiadać jedno pole transformatorowe, b) posiadać od dwóch do czterech pól liniowych, pola
  liniowe z możliwością założenia ograniczników przepięć na istniejące głowice konektorowe (stożek typu
  Int C)". Obowiązkowe też: tabliczki opisowe przy napędach, trwały schemat układu połączeń na obudowie,
  miejsce na schemat jednokreskowy A4, uchwyty kablowe nieprzewodzące.
- §4.3.2 (s. 11): parametry minimalne rozdzielnicy SN: napięcie znamionowe 24 kV; 3 fazy; poziom izolacji
  125 kV/50 kV; 50 Hz; prąd ciągły szyn 630 A; prąd krótkotrwały wytrzymywany (szyny, pole liniowe, uziemnik
  pola liniowego) 16 kA; prąd szczytowy 40 kA; odporność na łuk wewnętrzny 16 kA/1 s.
- §4.3.3 (s. 11): **pole transformatorowe** w wykonaniu podstawowym: „a) rozłącznik trzypołożeniowy
  w izolacji SF6 z bezpiecznikami, realizujący funkcje: zamknięty, otwarty, uziemiony, lub opcjonalnie
  b) wyłącznik próżniowy z odłączniko-uziemnikiem wyposażony w autonomiczny przekaźnik zabezpieczeniowy
  do zabezpieczenia transformatorów o mocy 160–630 kVA przed skutkami przeciążeń, zwarć doziemnych
  i międzyfazowych oraz odłączniko-uziemnik."
- §4.3.4 (s. 11): łącznik pola trafo — mechaniczna blokada wzajemna zamknięty↔uziemiony; blokada zdjęcia
  pokrywy przedziału kablowego poza pozycją uziemiony; możliwość zamknięcia napędu na kłódkę.
- §4.3.5 (s. 11): rozłącznik pola trafo: prąd ciągły (poza bezpiecznikami) 200 A; klasa M1, E2; wyzwalacz
  otwierający przy przepaleniu wkładki bezpiecznikowej.
- §4.3.6 (s. 12): zestaw rozłącznik+bezpieczniki: prąd załączalny zwarciowy 40 kA; wyłączalny zwarciowy
  16 kA; bezpieczniki z wybijakami 80 N.
- §4.3.7 (s. 12): wyłącznik pola trafo: 200 A; załączalny 40 kA; wyłączalny 16 kA; klasa M1, E2.
- §4.3.8 (s. 12): **pole liniowe**: „rozłącznik trzypołożeniowy (rozłącznik trzypozycyjny) w izolacji SF6
  z funkcjami: zamknięty, otwarty, uziemiony lub rozłącznik próżniowy z odłączniko-uziemnikiem z funkcjami
  zamknięty, otwarty, uziemiony. Dopuszcza się stosowanie wyłącznika w polu liniowym."
- §4.3.10 (s. 12): rozłącznik pola liniowego: prąd ciągły 630 A; załączalny zwarciowy 40 kA; wyłączalny
  630 A; klasa M1, E2.
- §4.3.11 (s. 12): wyłącznik pola liniowego: 630 A; załączalny 40 kA; wyłączalny zwarciowy 16 kA; M1, E2.
- §4.3.12 (s. 12): pola liniowe muszą umożliwiać zastosowanie telemechaniki 24 V DC (zdalna sygnalizacja,
  sterowanie, pomiary) bez demontażu rozdzielnicy.
- §4.3.13 (s. 12): pola liniowe muszą umożliwiać wyposażenie w sygnalizatory przepływu prądu zwarciowego
  lub układ zabezpieczeń (zwarcia doziemne i międzyfazowe; sieci kompensowane, uziemione przez rezystor
  oraz przez układ równoległy rezystor–dławik).
- §4.3.14 (s. 12): wskaźniki obecności napięcia na stałe **we wszystkich polach liniowych, w każdej fazie**,
  z zaciskami dla uzgadniaczy faz.
- §4.3.15 (s. 12): rozdzielnica z SF6 — wskaźnik lub manometr gazu.
- Głowice kablowe: §4.6.1 (s. 15): połączenie trafo–rozdzielnica SN: 3 kable 1-żyłowe XLPE Al 70 mm²
  12/20 kV zakończone obustronnie głowicami konektorowymi; w polu trafo głowice typu Int A (stożek
  zewnętrzny), przy wyłączniku — typu Int C; rys. 1 (s. 10): pola liniowe — głowice konektorowe typ C 630 A,
  pole trafo — typ A 250 A.
- Strona nn (§4.4.1, s. 12): łącznik główny — rozłącznik izolacyjny 1250 A; 12 pól z rozłącznikami
  bezpiecznikowymi wielkości 2; §4.4.8 (s. 13): przekładniki prądowe 800:5, kl. 0,2s, 5 VA, FS 5 za
  łącznikiem głównym; §4.5 (s. 14): szyny nn 910 A (1100 A przy 2 h przeciążenia), 16 kA/1 s, szczytowy 32 kA.

### B.2 Stacja kompaktowa do 400 kVA „uproszczona" (Z2 §4.3–4.5, s. 5–8)
Różnice względem Z1 (pozostałe wymagania aparatowe analogiczne, te same wartości 24 kV/630 A/16 kA/40 kA —
§4.3.2, s. 5):
- §4.3.1 (s. 5): rozdzielnica SN: „a) posiadać jedno pole transformatorowe, b) posiadać **do dwóch pól
  liniowych**…"; izolacja gazowa, powietrzna lub stało-powietrzna (nie tylko SF6).
- §4.3.3 (s. 5): pole trafo — rozłącznik trzypołożeniowy z bezpiecznikami lub opcjonalnie wyłącznik
  próżniowy z przekaźnikiem (zapis identyczny jak Z1, w tym zakres 160–630 kVA).
- §4.4.1 (s. 6–7): łącznik główny nn — rozłącznik **910 A** rozłączany trójbiegunowo; **5 pól** rozdzielczych
  z rozłącznikami wielkości 2; §4.5 (s. 8): szyny główne nn 630 A, 16 kA/1 s.
- §4.4.8 (s. 8): przekładniki 800:5 kl. 0,2s, 5 VA, FS 5 (jak Z1).
- §4.6.2 (s. 9): kabel trafo–rozdzielnica nn: N2XY 0,6/1 kV, 4×1×150 mm² dla trafo ≤ 250 kVA;
  powyżej 250 kVA — 4×2×150 mm².

### B.3 Złącze/szafa kablowa SN (Z1 §5.3–5.5, s. 26–27)
- §5.3 (s. 26): rozdzielnica SN złącza: „a) posiadać **trzy do pięciu pól liniowych**" (bez pola trafo;
  wyjątek: wariant z przekładnikiem zasilania telemechaniki — rys. 4b/4f).
- §5.4 (s. 26): parametry jak w B.1: 24 kV, 630 A, 125 kV/50 kV, 16 kA, 40 kA, łuk 16 kA/1 s.
- §5.5.1 (s. 27): pole liniowe — rozłącznik trzypołożeniowy (SF6 lub próżniowy z odłączniko-uziemnikiem);
  „Dopuszcza się stosowanie wyłącznika w polu liniowym."
- §5.5.3 (s. 27): rozłącznik liniowy 630 A / 40 kA / wyłączalny 630 A / M1, E2.
- §5.5.6 (s. 27): wskaźniki obecności napięcia we wszystkich polach liniowych w każdej fazie.
- §5.6.1.f (s. 27–28): kanał kablowy SN złącza z **5** szczelnymi przepustami SN (stacja 630 kVA: 4 przepusty
  SN — Z1 §4.7.1.n, s. 16; stacja uproszczona: 2 przepusty SN — Z2 §4.7.1.m, s. 10).

### B.4 Stacja słupowa (Z3 §4.3–4.4, s. 8–12)
- §4.3.1 (s. 8): połączenia strony SN przewodami w osłonie 70 mm².
- §4.3.3 (s. 10): ograniczniki przepięć beziskiernikowe, prąd wyładowczy 8/20 µs min. 10 kA, z odłącznikami,
  na zejściu z linii na transformator; osłony izolacyjne na zaciskach fazowych.
- §4.3.7 (s. 10): podstawy bezpiecznikowe napowietrzne SN dla wkładek WBGNp 17,5 i 24 kV (izolacja
  kompozytowa, silikon LSR/HTV) — zabezpieczenie transformatora.
- §4.3.8 (s. 10, zalecenie): „Przed stacją transformatorową słupową SN/nn **zaleca się** stosować
  rozłączniki, o prądzie znamionowym ciągłym min. 200 A i prądzie znamionowym wyłączalnym – min. 20 A."
- §4.3.9 (s. 10, zalecenie): w terenach zadrzewionych łączniki bezpiecznikowe w każdej fazie SN o sile
  niszczącej 6 kN (żerdź 12 kN) / 8,75 kN (żerdź 17,5 kN).
- §4.4.1.d (s. 10): strona nn trafo — beziskiernikowe ograniczniki przepięć z odłącznikiem, 8/20 µs min.
  10 kA, Uc 440 V.
- §4.4.2.a (s. 11): rozdzielnica nn do 5 obwodów liniowych aparatów wielkości 2 i max. 10 obwodów na
  aparatach wielkości 00.
- §4.4.3.a (s. 11): łącznik główny — rozłącznik izolacyjny/bezpiecznikowy listwowy, trójbiegunowy, 630 A.
- §4.4.3.c (s. 12): przekładniki prądowe **200:5** kl. 0,2s, 5 VA, FS 5 dla trafo **do 160 kVA** oraz
  **800:5** kl. 0,2s dla trafo **powyżej 160 kVA**, za rozłącznikiem głównym.
- §4.4.1.a (s. 10): kabel trafo–rozdzielnica nn: N2XY 4×1×150 mm² ≤ 250 kVA; > 250 kVA — 4×2×150 mm²
  (identycznie jak Z2).

---

## C. Wymagania telemechaniki (TELE, wersja 12.2025)

### C.1 Zakres i kwalifikacja obiektów
TELE rozdz. 2, s. 3 (cytat): „Zakres opracowania określa wymagania w zakresie telemechaniki dla nowo
budowanych linii napowietrznych SN, stacji transformatorowych kompaktowych prefabrykowanych SN/nn,
złączy/szaf kablowych SN oraz istniejących w zakresie objętych ich rozbudową i przebudową."

**Dokument nie reguluje** kryteriów kwalifikacji, KTÓRE stacje/łączniki muszą być objęte telemechaniką
(np. „stacje w ciągach głównych", odległości między łącznikami sterowanymi zdalnie itp.). Określa wyłącznie
wymagania techniczne dla systemu telemechaniki tam, gdzie jest projektowany. Pośrednie wymagania gotowości
(readiness) są w Z1: każda stacja 630 kVA musi mieć miejsce na szafę telemechaniki (Z1 §4.1.5, §4.2.5,
§4.4.13, s. 8–13), a wszystkie pola liniowe muszą być przystosowane do telemechaniki 24 V DC (Z1 §4.3.12,
s. 12; Z2 §4.3.12, s. 6; Z1 §5.5.4 dla ZK SN, s. 27). ZK SN ma jawny wariant 2 „z telemechaniką" i wariant 1
„bez telemechaniki" (Z1 rys. 4a/4b, s. 21–22) — wybór wariantu nie jest w Z1/TELE skodyfikowany.

### C.2 Łączność (TELE §6.1.3, s. 6–7)
- §6.1.3.1: „Sterownik powinien mieć możliwość komunikacji radiowej z co najmniej dwoma niezależnymi
  drogami z systemem SCADA. **Podstawowym kanałem komunikacji jest system TETRA, a rezerwowym kanałem
  komunikacji są sieci GSM operatorów telekomunikacyjnych.**"
- §6.1.3.7: wymagane protokoły: DNP3.0, DNP3.0 over IP, DNP3.0 over SDS, PN-EN 60870-5-101/-103/-104,
  Modbus RTU, Modbus TCP.
- §6.1.3.8: SCADA po TETRA — DNP3.0 over SDS; po GSM/LAN — DNP3.0 over IP.
- §6.1.4.1 (s. 7): obligatoryjny montaż OBU anten (TETRA + GSM); §6.1.4.2: każda instalacja poprzedzona
  pomiarami poziomu sygnału TETRA i GSM.
- §6.1.5.3 (s. 8): terminal TETRA: 12 V DC, moc 3–10 W, pasmo 380–430 MHz, szyfrowanie TEA1/SCK/DCK/CCK/GCK.

### C.3 Sygnały i funkcje (wybrane, istotne dla modelu sieci)
- Szafa telemechaniki stacji SN/nn (§6.1.2, s. 5–6): przełącznik trybu sterowania
  (zdalne/lokalne/odstawione) **z przesyłaniem informacji o stanie do systemu dyspozytorskiego**; wyłącznik
  krańcowy otwarcia drzwi szafy z przesyłem stanu (odrębny od sygnału otwarcia drzwi stacji); bateria
  akumulatorów min. 16 Ah, żywotność ≥ 6 lat przy +25°C, zapewniająca przez min. 24 h po zaniku zasilania
  wykonanie 10-krotnego cyklu WZ (wyłącz–załącz); sterownik obiektowy telemechaniki; montaż szafy 0,15–1,5 m
  od poziomu terenu.
- Pomiary strony SN (§6.4.1, s. 14, cytat): „Po stronie SN do pomiaru napięcia należy stosować sensory
  napięciowe jako pojemnościowy lub rezystancyjny dzielnik napięcia. **Pomiar napięcia wymagany jest dla
  każdego pola liniowego / łącznika napowietrznego.** Do pomiaru prądu jako podstawowe rozwiązanie należy
  stosować przetworniki prądowe. […] **Pomiar prądu wymagany jest dla każdego pola liniowego / łącznika
  napowietrznego.**"
- Napędy (§6.4.2, s. 14): „Napędy łączników powinny być zasilane napięciem 24 V DC. Sygnalizację stanu
  położenia łączników SN realizować dwubitowo."
- Blokady (§6.4.3, s. 14): „Każde pole liniowe / łącznik napowietrzny powinny być wyposażone w blokadę
  zdalnego sterowania, którą można wyłączyć tylko lokalnie."
- Pola liniowe (§6.4.4, s. 14): telemechanika 24 V DC; zdalna sygnalizacja, sterowanie i pomiary
  podłączalne bez demontażu rozdzielnicy.
- Sygnalizacja zwarć przy rozłącznikach (§6.3.2, s. 12): sterowniki muszą mieć zabudowane moduły
  sygnalizatorów przepływu prądów zwarciowych (doziemne i międzyfazowe); wykrywanie w sieciach
  kompensowanych z automatyką AWSC oraz uziemionych przez rezystor; kryteria konduktancyjne, admitancyjne,
  nadprądowe z wyborem kierunku; przesył prądów fazowych oraz napięć fazowych i międzyfazowych do systemu
  dyspozytorskiego.
- Przy wyłączniku z zabezpieczeniem (§6.3.4, s. 13–14): wymagane funkcje zabezpieczeniowe m.in. nadprądowe
  fazowe kierunkowe, nadprądowe doziemne kierunkowe, konduktancyjne/admitancyjne kierunkowe, mocowe,
  asymetria prądowa/napięciowa, nad-/podnapięciowe, Uo, SPZ, częstotliwościowe, df/dt (ROCOF); rejestracja
  zakłóceń w formacie Comtrade; min. 4 banki nastaw.

### C.4 Zasilanie telemechaniki (§6.7, s. 15–16)
- §6.7.1–6.7.2: układ zasilania 24/12 V DC z akumulatorami — główne źródło zasilania; zasilany 230 V AC:
  - linie napowietrzne SN: przekładnik zasilający min. 400 VA (zabezpieczenie w skrzynce SBI);
  - **stacje SN/nn: z obwodu niskiego napięcia stacji**;
  - **złącze ZKSN: z przekładnika SN/nn o minimalnej mocy pozornej 1200 VA**; „Przekładnik napięciowy SN/nn
    należy zabudować w polu zasilającym ZKSN dla złącza bez układu pomiarowego"; przekładnik musi mieć
    bezpieczniki po stronie SN.
- §6.7.10–6.7.12: bateria = 2 akumulatory 12 V; min. 16 Ah; technologia VRLA-AGM lub żelowa.

---

## D. Układy pomiarowe i granice własności/eksploatacji

- Z1 §5.5.9 (s. 27, cytat): „Układ pomiarowy wraz z oprzewodowaniem, zgodnie z odrębnym Standardem w sieci
  dystrybucyjnej ENEA Operator sp. z o.o. dotyczącym układów pomiarowych energii elektrycznej." — czyli
  zeszyty stacyjne delegują pomiar rozliczeniowy do osobnego standardu (na stronie indeksowej ENEA figuruje
  dokument „Układy pomiarowe energii elektrycznej — obowiązuje od 02.04.2024",
  https://www.operator.enea.pl/media/698/uklady-pomiarowe-energii-elektrycznej-obowiazuje-od-02042024pdf.pdf —
  **nie był pobierany ani czytany w tym researchu**).
- Z1 §5.5.10 (s. 27): „Dostęp do układu pomiarowego należy realizować poprzez osobne drzwi bez ingerencji
  w pozostałą część złącza kablowego SN/złącza pomiarowego SN."
- Z1 rys. 4c–4h (s. 22–26): znormalizowane warianty złącza z układem pomiarowo-rozliczeniowym **pośrednim**
  (wariant 3 ZK SN oraz odrębne „złącze pomiarowe SN"); §5.9.8 (s. 31): dla wariantu 3 i złącza pomiarowego —
  12-miesięczny okres przejściowy wymagań dokumentacyjnych.
- Pomiar bilansujący (nie rozliczeniowy): wszystkie trzy typy stacji wymagają miejsca/układu AMI z
  przekładnikami za łącznikiem głównym nn (Z1 §4.4.8/§4.4.12; Z2 §4.4.8/§4.4.12; Z3 §4.5 — układ bilansujący
  wg Zeszytu 4).
- **Granica własności / granica eksploatacji: żaden z czterech przeczytanych dokumentów nie reguluje tego
  tematu** (brak jakiegokolwiek zapisu o granicy własności, granicy eksploatacji lub miejscu rozgraniczenia
  w Z1, Z2, Z3 i TELE). Dokumenty nie regulują też lokalizacji pomiaru rozliczeniowego względem granicy —
  to domena odrębnego standardu układów pomiarowych i umów przyłączeniowych.

---

## Nieosiągalne / ograniczenia

1. **Wszystkie 4 dokumenty źródłowe zostały pobrane i przeczytane w całości** (tekst wyekstrahowany
   pdftotext; rysunki-schematy czytane z warstwy tekstowej PDF — treść etykiet schematów, np. „Głowice
   konektorowe typ C - 630 A", pochodzi z tej warstwy; geometria rysunków nie była analizowana wizualnie).
2. URL telemechaniki z zadania (`www.m.operator.enea.pl/media/3463/...`) nie działał (błąd certyfikatu TLS —
   cert nie obejmuje subdomeny m.); dokument pobrano z tej samej ścieżki na domenie głównej
   `www.operator.enea.pl/media/3463/...` (link zweryfikowany na stronie indeksowej standardów).
3. Standard „Układy pomiarowe energii elektrycznej" (do którego delegują zeszyty stacyjne) — istnieje na
   stronie indeksowej, **nie był czytany** (poza zakresem zleconych źródeł). Analogicznie: Zeszyt 4 (moduł
   AMI), Zeszyt 6 (wytyczne projektowania i budowy), standard ochrony przeciwporażeniowej SN i standard
   linii kablowych SN — przywoływane przez zeszyty, nieczytane.
4. Kryteria kwalifikacji obiektów do telemechaniki (które stacje/łączniki w sieci MUSZĄ mieć zdalne
   sterowanie, np. w ciągach głównych) — **żaden z przeczytanych dokumentów tego nie reguluje**; TELE
   definiuje tylko wymagania techniczne systemu. Jeżeli takie kryteria istnieją, są prawdopodobnie w IRiESD
   lub wewnętrznych zasadach planowania rozwoju sieci ENEA Operator (nieczytane, niepotwierdzone).
5. Z3 załączniki 1–5 (s. 15+ pliku, ~60 stron rysunków) przeszukano tekstowo (grep: kVA, telemechanika,
   pomiar) — nie zawierają dodatkowych wymagań istotnych dla walidacji modelu poza potwierdzeniem granic
   400 kVA/2300 kg i podziału kabli nn 250 kVA; nie były czytane rysunek po rysunku.

---

## Propozycje reguł walidacyjnych (dla modelu sieci MV-Design-PRO)

Konwencja: reguła dotyczy modelu sieci na obszarze ENEA Operator (profil OSD = ENEA). Severity sugerowane:
ERROR = twarde wymaganie standardu („należy" = „musi"), WARNING = zalecenie/wymaga decyzji OSD.

| ID | Warunek sprawdzalny na modelu | Źródło | Wymagane dane modelu | Severity |
|---|---|---|---|---|
| ENEA-ST-001 | Nowa lub przebudowywana stacja SN/nN ma typ konstrukcji „kompaktowa prefabrykowana"; każdy inny typ (słupowa, wnętrzowa inna) → naruszenie zasady rozwiązania podstawowego | Z1 rozdz. 2, s. 3; Z3 rozdz. 2, s. 3 | Station.construction_type; Station.lifecycle (new/rebuild/existing) | WARNING (odstępstwo możliwe za zgodą Dyrektora OD) |
| ENEA-ST-002 | Nowa stacja słupowa SN/nN z kablowym podejściem SN → zakaz | Z3 rozdz. 2, s. 3 („Nie należy stosować nowych stacji słupowych SN/nn z kablowym podejściem SN") | Station.construction_type; typ przyłączonych gałęzi SN (Cable vs Line) | ERROR |
| ENEA-ST-003 | Stacja kompaktowa (Z1): moc znamionowa transformatora ≤ 630 kVA | Z1 tytuł + rys. 1 (s. 10) + §4.7.1.k (s. 16) | Transformer2W.sn_kva; Station.construction_type | ERROR |
| ENEA-ST-004 | Stacja kompaktowa „uproszczona" (Z2): trafo ≤ 400 kVA ORAZ liczba pól liniowych SN ≤ 2 ORAZ liczba pól rozdzielczych nn ≤ 5 | Z2 rys. 1 (s. 4), §4.3.1.b (s. 5), §4.1.3/§4.4.1 (s. 3, 6–7) | Transformer2W.sn_kva; liczba pól liniowych SN stacji; liczba odpływów nn | ERROR |
| ENEA-ST-005 | Stacja słupowa: trafo ≤ 400 kVA i napięcie izolacji 24 kV | Z3 §4.1, s. 7 | Transformer2W.sn_kva; Bus.un_kv | ERROR |
| ENEA-ST-006 | Stacja kompaktowa (Z1): rozdzielnica SN ma dokładnie 1 pole transformatorowe i 2–4 pola liniowe (łącznie ≤ 5 pól) | Z1 §4.1.2 (s. 8), §4.3.1.a–b (s. 11) | typologia pól (bay type: line/transformer) w stacji | ERROR |
| ENEA-ST-007 | ZK SN (złącze kablowe): 3–5 pól liniowych; brak pola transformatorowego (wyjątek: przekładnik potrzeb własnych telemechaniki) | Z1 §5.3.a (s. 26); rys. 4b/4f (s. 22, 25) | Station.kind = złącze; liczba i typ pól | ERROR |
| ENEA-ST-008 | Pole transformatorowe SN: aparat = rozłącznik trzypołożeniowy z bezpiecznikami LUB wyłącznik z odłączniko-uziemnikiem i przekaźnikiem zabezpieczeniowym; goły odłącznik/brak aparatu → naruszenie | Z1 §4.3.3 (s. 11); Z2 §4.3.3 (s. 5) | Switch.kind (rozłącznik/rozłącznik-bezpiecznikowy/wyłącznik) w polu trafo; obecność funkcji uziemnika | ERROR |
| ENEA-ST-009 | Pole liniowe SN: aparat = rozłącznik trzypołożeniowy (z funkcją uziemienia) lub wyłącznik; prąd znamionowy ciągły aparatu ≥ 630 A | Z1 §4.3.8/§4.3.10 (s. 12); Z1 §5.5.1/§5.5.3 (s. 27); Z2 §4.3.8/§4.3.10 (s. 6) | Switch.kind, Switch.in_a (z katalogu), funkcja uziemnika | ERROR |
| ENEA-ST-010 | Rozdzielnica SN stacji/złącza: Un ≥ 24 kV; Ik(1s) ≥ 16 kA; ip ≥ 40 kA; szyny ≥ 630 A (parametry katalogowe „nie gorsze niż") | Z1 §4.3.2 (s. 11), §5.4 (s. 26); Z2 §4.3.2 (s. 5) | parametry katalogowe rozdzielnicy/pól (un, ik_1s, ip, in) | ERROR |
| ENEA-ST-011 | Wynik obliczeń zwarciowych (IEC 60909) na szynie SN stacji: Ik ≤ 16 kA i ip ≤ 40 kA, jeżeli stacja w standardzie ENEA (weryfikacja doboru aparatury standardowej) | Z1 §4.3.2 (s. 11) — parametry znamionowe minimalne aparatury standardowej | ShortCircuitResult (Ik, ip) na szynie SN stacji | WARNING (przekroczenie ⇒ aparatura poza standardem) |
| ENEA-ST-012 | Rozłącznik pola trafo: In ≥ 200 A + obowiązkowy wyzwalacz od przepalenia wkładki; zestaw z bezpiecznikami: prąd wyłączalny zwarciowy ≥ 16 kA | Z1 §4.3.5–4.3.6 (s. 11–12); Z2 §4.3.5–4.3.6 (s. 5–6) | katalog aparatu pola trafo | ERROR |
| ENEA-ST-013 | Transformator stacji standardowej: grupa połączeń Dyn5, strona dolna 420 V (wg schematów ideowych) | Z1 rys. 1 (s. 10); Z2 rys. 1 (s. 4) | Transformer2W.vector_group, un_lv | WARNING (wartość ze schematu, nie z zapisu punktowego) |
| ENEA-ST-014 | Kabel trafo→rozdzielnica nn: dla Z2/Z3 — N2XY 4×1×150 mm² gdy Sn ≤ 250 kVA, 4×2×150 mm² gdy Sn > 250 kVA; dla Z1 — 2×N2XY 1×240 mm²/fazę | Z2 §4.6.2.a (s. 9); Z3 §4.4.1.a (s. 10); Z1 §4.6.2.a (s. 15) | typ/przekrój połączenia trafo–nn; Sn trafo | WARNING |
| ENEA-ST-015 | Przekładniki nn za łącznikiem głównym: Z1/Z2 — 800:5 kl. 0,2s; Z3 (słupowa) — 200:5 gdy trafo ≤ 160 kVA, 800:5 gdy > 160 kVA | Z1 §4.4.8 (s. 13); Z2 §4.4.8 (s. 8); Z3 §4.4.3.c (s. 12) | CT ratio w modelu pomiarowym stacji; Sn trafo | WARNING |
| ENEA-ST-016 | Jeżeli obiekt (stacja/złącze/łącznik napowietrzny) oznaczony jako telemechanizowany: każde pole liniowe/łącznik ma pomiar U ORAZ pomiar I; napęd 24 V DC; sygnalizacja położenia dwubitowa; blokada zdalnego sterowania | TELE §6.4.1–6.4.3 (s. 14) | flaga telemetry na obiekcie; atrybuty pól (has_voltage_measurement, has_current_measurement, drive_voltage) | ERROR (w obrębie obiektów telemechanizowanych) |
| ENEA-ST-017 | ZK SN z telemechaniką i bez układu pomiarowego: wymagany przekładnik potrzeb własnych SN/nn ≥ 1200 VA w polu zasilającym, z bezpiecznikami po stronie SN | TELE §6.7.2 (s. 15) | model wyposażenia złącza (aux transformer, jego Sn, zabezpieczenie) | ERROR |
| ENEA-ST-018 | Telemechanizowany obiekt: komunikacja dwudrożna — TETRA (podstawowa) + GSM (rezerwowa); obligatoryjnie obie anteny | TELE §6.1.3.1 (s. 6), §6.1.4.1 (s. 7) | atrybuty komunikacji obiektu (channels) | ERROR (jeśli model przechowuje warstwę komunikacji) |
| ENEA-ST-019 | Pola liniowe każdej nowej stacji/złącza muszą być „telemechanika-ready" (24 V DC, doposażenie bez demontażu rozdzielnicy) oraz stacja Z1 musi mieć miejsce na szafę telemechaniki i AMI | Z1 §4.3.12, §4.1.4–4.1.5 (s. 8, 12); Z2 §4.3.12 (s. 6); Z1 §5.5.4/§5.5.7 (s. 27) | atrybut readiness pola/stacji (katalogowy) | WARNING |
| ENEA-ST-020 | Wskaźniki obecności napięcia we wszystkich polach liniowych, w każdej fazie | Z1 §4.3.14 (s. 12), §5.5.6 (s. 27); Z2 §4.3.14 (s. 6) | wyposażenie pola (VDS present) | WARNING |
| ENEA-ST-021 | Obiekt z układem pomiarowo-rozliczeniowym SN: tylko znormalizowane warianty (ZK SN wariant 3 lub złącze pomiarowe SN, pomiar pośredni); szczegóły wg odrębnego standardu układów pomiarowych — walidacja delegowana | Z1 §5.5.9–5.5.10 (s. 27), rys. 4c–4h (s. 22–26) | flaga metering na złączu; wariant złącza | INFO/WARNING |

Uwaga implementacyjna: reguły ENEA-ST-003/004/005 wymagają rozróżnienia w modelu typu konstrukcji stacji
(kompaktowa-630 / kompaktowa-400-uproszczona / słupowa / złącze ZK SN / złącze pomiarowe) — dziś standardowa
klasa `Station` (logical container) musi nieść ten atrybut, aby profil walidacyjny OSD ENEA był stosowalny.

---

## Pobrane pliki (scratchpad)

Katalog: `/tmp/claude-0/-home-user-MV-Design-PRO/78af74df-082c-537d-9203-0850d59fe759/scratchpad/`

| Plik | Zawartość | Źródłowy URL |
|---|---|---|
| `zeszyt1.pdf` (+ `zeszyt1.txt`) | Z1, 33 strony | https://www.operator.enea.pl/uploads-ev2/Operator/us%C5%82ugidystrybucyjne/instrukcjeistandardysieci/standardywsieci/21.03.2024_1/STACJE~2.PDF |
| `zeszyt2.pdf` (+ `zeszyt2.txt`) | Z2, 19 stron | https://www.operator.enea.pl/uploads-ev2/Operator/.../19.12.2024/Stacje%20elektroenergetyczne...Zeszyt%202...do%20400%20kVA...pdf (URL z zadania, działał) |
| `zeszyt3.pdf` (+ `zeszyt3.txt`) | Z3, 76 stron (14 + załączniki) | https://www.operator.enea.pl/uploads-ev2/Operator/.../21.03.2024_1/Stacje...Zeszyt%203...s%C5%82upowe%20SNnn...pdf (URL z zadania, działał) |
| `telemechanika.pdf` (+ `telemechanika.txt`) | TELE, 18 stron | https://www.operator.enea.pl/media/3463/uslugi-dystrybucyjne/linie-i-stacje-elektroenergetyczne-sredniego-napiecia-telemechanika (domena główna; wariant m.operator.enea.pl z zadania miał błędny cert TLS) |
| `index.html` | strona indeksowa standardów | https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji |
