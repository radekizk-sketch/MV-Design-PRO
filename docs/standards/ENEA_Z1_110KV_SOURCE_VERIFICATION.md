# ENEA Operator — Zeszyt 1: źródło do weryfikacji SLD

## Źródło pierwotne
- Dokument: *Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe 110 kV/SN*.
- Wydawca: ENEA Operator sp. z o.o.
- Wersja: 02.2023–2.
- Obowiązuje od: 2024-04-02 (uchwała 148/2023 zmieniona 7/2024).
- Oficjalny PDF: https://www.operator.enea.pl/media/675/stacje-elektroenergetyczne-110-kv-zeszyt-1-stacje-dwutransformatorowe-110-kvsn-obowiazuje
- Katalog standardów: https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji

## Zadanie dla wykonawcy (Opus)
1. Pobierz PDF z oficjalnego źródła do lokalnego katalogu roboczego, poza repozytorium. Sprawdź tytuł, wersję, datę i integralność pobrania; zapisz SHA-256 w raporcie.
2. Otwórz strony PDF 86 oraz 92–97 wskazane w dotychczasowym zadaniu. **Zweryfikuj numerację fizycznych stron PDF względem numeracji drukowanej oraz oznaczenia załączników**; nie zakładaj ich zgodności.
3. Porównaj odpowiednie rysunki z implementacją SLD: topologię, symbole aparatów, połączenia, przekładniki, oznaczenia, tabliczki, pozycje i relacje funkcjonalne. Przy każdej rozbieżności podaj oznaczenie rysunku, stronę źródła, element kodu i dowód.
4. Popraw tylko potwierdzone rozbieżności; zachowaj zaakceptowany wygląd i architekturę, o ile nie naruszają źródła.
5. W raporcie rozdziel statusy: „zweryfikowano ze źródłem ENEA”, „wg wcześniejszego odczytu Zeszytu 1”, „niezweryfikowane”. Nie deklaruj zgodności całości bez kompletnego porównania.
6. Dołącz testy regresji i zrzuty rzeczywistej aplikacji; odnotuj wynik dla każdego rysunku.

## Ograniczenia
- Nie commituj pełnego PDF ani skanów stron normatywnych: prawa autorskie ENEA Operator.
- Nie traktuj niniejszego pliku jako dowodu zgodności SLD.
- Nie rozszerzaj zakresu na przebudowę interfejsu ani inne standardy.
- Nie myl tego Zeszytu 1 (stacje 110 kV/SN) z Zeszytem 1 dla stacji SN/nN.

---

# Raport weryfikacji (karta POLA-GPZ-SZABLONY, 2026-11-05)

## 1. Plik źródłowy

| Pozycja | Wartość |
|---|---|
| SHA-256 | `467547d5b32bdad0534208f3870484f48663a862368b49b27c6ce92f164ba488` |
| Liczba stron | 99 (A4, `pdfinfo`) |
| Tytuł (strona 1) | „Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe 110 kV/SN. Standard w sieci dystrybucyjnej ENEA Operator sp. z o.o.” |
| Wersja (strona 1) | „Wersja 02.2023 - 2”; zastępuje wersję 02.2023 (uchwała 148/2023) |
| Data (strona 1) | zatwierdzono uchwałą 148/2023 zmienioną uchwałą 7/2024 „z dniem 02.04.2024 r.”; podpis Rady Technicznej 2024-03-11 |
| Postać stron załączników | rastrowa (warstwa tekstowa stron 77–99 pusta) — porównanie na obrazach stron w 200 dpi, wycinki `convert -crop` oglądane bezpośrednio |

PDF i obrazy stron leżą wyłącznie poza repozytorium (`/tmp`), nie są commitowane.

## 2. Numeracja: strona fizyczna PDF → załącznik

Spis załączników: strona PDF 75 (druk „Strona I 75/76”) i 76 (Z.18–Z.20). Numer załącznika
odczytano z tabliczki rysunkowej (pole „Nr załącznika”) KAŻDEJ strony 80–99 — numeracja
architekta potwierdzona w całości.

| Strona PDF | Załącznik | Tytuł rysunku (tabliczka) |
|---|---|---|
| 80 | Z.4.1 | Pole linii 110 kV z pomiarem bilansowo-kontrolnym energii i zabezpieczeniem podstawowym różnicowym |
| 81 | Z.5 | Pole linii 110 kV z pomiarem rozliczeniowym energii i zabezpieczeniem podstawowym odległościowym |
| 82 | Z.5.1 | … rozliczeniowym … różnicowym |
| 83 | Z.5.2 | Pole linii 110 kV do współpracy z wytwórcą / odbiorcą … odległościowym |
| 84 | Z.5.3 | … różnicowym |
| 85 | Z.6 | Pole transformatora 110 kV/SN – strona 110 kV |
| **86** | **Z.7** | Pole transformatora 110 kV/SN – strona SN |
| 87 | Z.8 | Pole łącznika szyn 110 kV w układzie H5 |
| 88 | Z.9 | Pole łącznika szyn 110 kV w układzie H4 |
| 89 | Z.10 | Pole linii odpływowej SN |
| 90 | Z.11 | Pole linii SN z pomiarem energii i napięcia zwrotnego |
| 91 | Z.11.1 | Pole linii SN z pomiarem napięcia zwrotnego |
| **92** | **Z.12** | Pole łącznika szyn SN |
| **93** | **Z.13** | Pole zespołu uziemiającego SN. Sieć uziemiona przez dławik z automatyczną regulacją dostrojenia |
| **94** | **Z.14** | Pole zespołu uziemiającego SN. Sieć uziemiona przez układ równoległy – dławik, rezystor |
| **95** | **Z.15** | Pole zespołu uziemiającego SN. Sieć uziemiona przez rezystor |
| **96** | **Z.16** | Pole baterii kondensatorów równoległych SN |
| **97** | **Z.17** | Pole pomiaru napięcia SN |
| 98 | Z.18 | Układ zasilania potrzeb własnych 220 V DC |
| 99 | Z.19 | Układ zasilania potrzeb własnych 230/400 V AC |

Uwaga do spisu: spis wymienia „Z.10 … z filtrem Holmgreena – rysunek usunięty” obok
„Z.10 Pole linii odpływowej SN” oraz Z.11.2, Z.11.3 jako usunięte — strony z tymi rysunkami
w pliku nie występują.

## 3. Wynik dla każdego rysunku

Statusy: **ZŹ** = zweryfikowano ze źródłem ENEA (obraz strony); **WO** = wg wcześniejszego
odczytu Zeszytu 1; **NZ** = niezweryfikowane / niezaimplementowane.

| Rysunek | Strona | Szablon w kodzie | Status całości |
|---|---|---|---|
| Z.7 | 86 | `bay_templates.BAY_TEMPLATE_GPZ_TRANSFORMATOR_Z7`, `obwody_wtorne_pola._OBWODY_Z7` | dane szablonu i obwodów wtórnych: ZŹ; rysunek SLD pola i tor transformatora przez pole (decyzja D2): NZ |
| Z.10 | 89 | `szablon_pola_liniowego_gpz("Z10", …)` | ZŹ kartą UX-04 (obrazy 400 dpi 2026-10-30, odbiór B-02 pola liniowego); kontrola tej karty: sekwencja i tabliczka CT 200-400/5 I 15 VA 5P20 zgodne |
| Z.11 | 90 | `szablon_pola_liniowego_gpz("Z11", …)` | ZŹ kartą UX-04; kontrola tej karty: tabliczka T3 „SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3”, I 0-10 VA kl. 0,2, II 7,5 VA kl. 0,2 — zgodne |
| Z.11.1 | 91 | `szablon_pola_liniowego_gpz("Z11_1", …)` | ZŹ kartą UX-04 (bez ponownej kontroli w tej karcie) |
| Z.12 | 92 | `BAY_TEMPLATE_GPZ_LACZNIK_SZYN_Z12`, `_OBWODY_Z12` | dane: ZŹ; rysunek pionowy A/B i rekord pola związany z gałęzią łącznika (D3), port uziemiany Q2: NZ |
| Z.13 | 93 | `bay_template_gpz_zespol_uziemiajacy_dlawik_enea_z13`, `_OBWODY_Z13`; wariant `Z13` | tor pola, tabliczka CT, funkcje, sygnały: ZŹ (§4.4, Io> z rdzenia I — interpretacja); rola ZU i operacje pola: wykonane; rysunek SLD pola i gałęzi punktu neutralnego w GPZ: wykonany z nośnika modelu (następca 7, §4.4) — kolejność aparatów ZŹ, porównanie zrzutu ze stroną: §4.4; pole ZU w stacji SN/nN: NZ |
| Z.14 | 94 | `…_dlawik_rezystor_enea_z14`, `_OBWODY_Z14`; wariant `Z14` | j.w.; Io>, Io>> z przekładnika gałęzi rezystora (linia rysunku) |
| Z.15 | 95 | `…_rezystor_enea_z15`, `_OBWODY_Z15`; wariant `Z15` | j.w.; SPZ (79) → ZW |
| Z.16 | 96 | `BAY_TEMPLATE_GPZ_BKR_Z16`, `_OBWODY_Z16` | dane: ZŹ; rysunek: przekładniki międzyfazowe T4/T5 na zaciskach baterii (glif `capacitorBank`) — poprawione 2026-11-05 (wcześniej odczep przekładnika napięciowego toru — rozbieżność z s.96); porównanie rysunku całego pola ze zrzutem: NZ |
| Z.17 | 97 | `BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17` | sekwencja, tabliczka i zestaw funkcji: ZŹ (karta UX-04 2026-10-29, kontrola tej karty zgodna); relacje funkcja → uzwojenie zapisane w §4.5, w danych szablonu brak obwodów wtórnych (NZ) |

Zgodności CAŁOŚCI (dane + rysunek SLD + ścieżka edycji) nie deklaruje się dla żadnego z pól
Z.7, Z.12, Z.13–Z.16: rysunek SLD tych pól i zrzuty nie zostały porównane w tej karcie.

## 4. Porównanie pozycja po pozycji

### 4.1. Z.7 (s.86) — pole transformatora 110 kV/SN, strona SN

| Pozycja | Źródło (obraz strony) | Status | Kod |
|---|---|---|---|
| Kolejność od szyny | szyna SN → wskaźnik napięcia (PF0) przy szynie → łącznik trójpołożeniowy z napędem (Q1) → wyłącznik z napędem (Q0) → węzeł odgałęzienia → P1, przekładnik prądowy (T1), P2 → wskaźnik napięcia (PF1) → złącze kablowe (GK) → kabel (linia kreskowa) → węzeł z ogranicznikiem przepięć do ziemi (F1) → transformator (kreskowany, trójkąt od strony SN, gwiazda od 110 kV) | ZŹ, zgodne | `bay_templates.py` plan Z.7; test `test_kolejnosc_aparatow_od_szyny_wg_rysunku` |
| PF0, PF1, F1 | obecne; F1 przy zaciskach transformatora, poza celą | ZŹ | j.w. |
| Odgałęzienie T3 | węzeł między Q0 a P1 → łącznik dwunożowy z uziemieniem (nóż od strony przekładnika, bez znaku napędu) → złącze wtykowe → przekładnik trzy jednofazowe („3”) | ZŹ, zgodne (Q5 jako łącznik trójpołożeniowy odgałęzienia, jak Z.11) | plan Z.7 `Q5`, `GK1`, `T3` |
| Tabliczka T3 | „SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3”; I 0-10 VA kl. 0,2; II 7,5 VA kl. 0,5; III 7,5 VA kl. 0,5/3P — trzy uzwojenia fazowe, bez otwartego trójkąta | ZŹ (rozstrzygnięcie architekta potwierdzone) | `UZWOJENIA_VT_POLA_TRANSFORMATORA_Z7` |
| Tabliczka T1 | „1000/5/5/5/5*”: I 10 VA kl. 0,2S FS5; II 10 VA kl. 0,2 FS5; III 15 VA kl. 5P20; IV 15 VA kl. 5P20 | ZŹ, zgodne | `mv_auxiliary_catalog` `ct_typ_ogolny_osd_*_5_5_5_5_z7` |
| Gwiazdka | tabela „Uwaga”: 1000/5/5/5/5 — 110/15 kV ≤ 25 MVA; 1600/… — 110/15 kV 40 MVA; 800/… — 110/20 kV ≤ 25 MVA; 1200/… — 110/20 kV 40 MVA | ZŹ; **poprawka**: cztery pozycje katalogu, szablon wskazuje 1000/5 jako wartość roboczą (ZASADA NR 4) | `_WARIANTY_PRZEKLADNI_TRANSFORMATORA`; test `test_przekladnie_z_gwiazdka_…` |
| Rdzeń I | → „Układ pomiarowy bilansowo-kontrolny” | ZŹ; **rozbieżność**: przeznaczenie było „ROZLICZENIE” → poprawione na POMIAR, JAKOSC_ENERGII | katalog CT Z.7; test j.w. |
| Rdzeń II (6 żył) | → „Pomiary lokalne str. SN” → linia do „ARN” | ZŹ | `_OBWODY_Z7` 90 |
| Rdzeń III | → „Zabezpieczenie różnicowe transformatora” | ZŹ | 87T |
| Rdzeń IV | → blok t1/I>, t2/I>> sterownika pola | ZŹ | 51, 50; ZS z rdzenia IV — interpretacja (rysunek nie prowadzi osobnej linii do Izs>>) |
| Uzwojenie I T3 | → „Analizator jakości energii” (blok wspólny z układem pomiarowym) | ZŹ; **rozbieżność**: było „niepodłączone” | `obwody_przekladnikow` |
| Uzwojenie II T3 | → „Pomiary lokalne str. SN” | ZŹ; **rozbieżność**: było wejściem ARN (interpretacja) | j.w. |
| Uzwojenie III T3 | → „ARN” oraz (odgałęzienie tej samej linii, 4 żyły) → „Sterownik pola” | ZŹ; **rozbieżność**: było „niepodłączone”, a ARN mierzył z II | 90: `_vt("T3", 3)` |
| Blok sterownika | t1/I>, t2/I>>, kolumna bez napisu, ZS (t, Izs>>), LRW, „Sterownik pola” | ZŹ | funkcje 51, 50, ZS, 50BF |
| Wyjścia na wyłącznik | piony t1, t2, ZS, LRW i kolumny bez napisu łączą się ukośnikiem wyłącznie z OW1; OW2 zasilany wprost wejściem „OW2 od zabezpieczeń str. 110 kV”; sterownik pola → OW1 i ZW | ZŹ; **rozbieżność**: było OW1+OW2 dla każdej funkcji | `_OBWODY_Z7`; nowe pole `SygnalPola.polaczony_z` |
| Obwody okrężne | „+AwUp” wejście; „Up”, „Aw”, „Al” wyjścia; „Pobudzenie LRW” WEJŚCIE (→ LRW); „WZS” wyjście (z ZS); „Blokowanie ZS” WEJŚCIE (→ ZS) | ZŹ; **rozbieżność**: „Blokowanie ZS” i „Pobudzenie LRW” były wyjściami, „WZS” nie istniało | test `test_sygnaly_i_kierunki_wg_grotow_strzalek` |
| Sygnały górnej krawędzi | „Zadziałanie Izs>> od łącznika szyn” (grot w górę), „OW od ZS do łącznika szyn” (grot w dół), „Blokowanie SZR” (wyjście), „OW od SZR”, „ZW od SZR”, „OW2 od zabezpieczeń str. 110 kV”, „OW od zabezpieczeń str. 110 kV”, „ZW sterownikiem str. 110 kV”, „OW sterownikiem str. 110 kV” (wejścia), „Wyłączenie pól SN z generacją” (wyjście), „Topologia”, „Zasilanie ⊕⊖” (wejścia), „SSiN”, „Łącze inżynierskie” (wyjścia) | ZŹ; **rozbieżność**: wymyślony sygnał „Wył. od zab. TR” jako wyjście pola TR usunięty | j.w. |
| 87T — wyjście | rysunek nie rysuje wyjścia bloku | interpretacja: OW2 przez wejście „OW2 od zabezpieczeń str. 110 kV” | `uwaga` powiązania |
| ARN — wyjście | rysunek nie rysuje | interpretacja: sygnał „Regulacja zaczepów” | `uwaga` |
| Napędy | Q0: okrąg M; Q1: kwadrat na kreskowanym sprzężeniu + kreskowany odcinek z poprzeczką (jak Z.10) | ZŹ; było przeniesione z Z.10 (interpretacja) | `_napedy_pola_gpz` |
| Tor transformatora przez pole Z.7 (D2), rysunek wieży TR w gramatyce `compose/gpz.ts` | — | NZ | meldunek przekazania |

### 4.2. Z.12 (s.92) — pole łącznika szyn SN

| Pozycja | Źródło | Status | Kod |
|---|---|---|---|
| Kolejność | sekcja A (u góry) → wskaźnik napięcia → łącznik trójpołożeniowy z napędem → wyłącznik z napędem M → P1, CT, P2 → łącznik trójpołożeniowy z napędem (lustrzany) → wskaźnik napięcia → sekcja B (u dołu) | ZŹ, zgodne | plan Z.12 |
| Uziemienie Q1/Q2 | nóż obraca się na sworzniu od strony wyłącznika; w położeniu uziemionym uziemia stronę wyłącznika (aparatu), nie szynę | ZŹ; **rozbieżność w kodzie**: `rodzaje_aparatury.PORT_UZIEMIANY_LACZNIKA_TROJPOLOZENIOWEGO = PORT_WYJSCIA` (dla Q2 to strona sekcji B) — stała nie ma konsumentów; poprawka z rysunkiem pionowym (D3): NZ | meldunek przekazania |
| Tabliczka | „1000/5/5*”: I 15 VA 5P20; II 15 VA 5P20; tabela „Uwaga” jak Z.7 (1000/1600/800/1200) | ZŹ; warianty dodane | `ct_typ_ogolny_osd_*_5_5_z12` |
| Rdzeń I | → t1/I>, t2/I>> | ZŹ | 51, 50 |
| Rdzeń II | → blok „Zab. ziemnozw.” t1, t2 ze znakiem kierunku; do bloku wchodzi obwód okrężny „Z,Zz” | ZŹ; **rozbieżność**: było 51N z odczytu; teraz 67N (rysunek) + 51N (kryterium prądowe — konwencja Z.10, decyzja właściciela 2026-10-29) | `_ziemnozwarciowe` |
| Wyjścia | t1, t2, blok ziemnozwarciowy, LRW, sterownik → „OW1, OW2”; sterownik → ZW; ZS → „Blokowanie ZS” (wyjście); LRW → „Pobudzenie LRW” (wyjście) | ZŹ | `_OBWODY_Z12` |
| Okrężne | +AwUp (we), Up, Aw, Al (wy), UL1,UL2,UL3,N (we → sterownik), Pobudzenie LRW, Blokowanie ZS (wy), Z,Zz (we) | ZŹ | test kierunków |
| SZR | rysunek bloku SZR nie ma | ZŹ: SZR poza polem (D3) | — |

### 4.3. Z.16 (s.96) — pole baterii kondensatorów

| Pozycja | Źródło | Status | Kod |
|---|---|---|---|
| Kolejność | szyna → łącznik trójpołożeniowy z napędem → wyłącznik (skrzynka napędu, okrąg M) → P1, CT, P2 → wskaźnik napięcia → złącze kablowe → kabel → węzeł z ogranicznikiem przepięć → bateria w podwójnej gwieździe; przekładniki napięciowe międzyfazowe L1-L2, L2-L3 „SN/0,1 kl. 3P”; przekładnik niezrównoważenia między punktami gwiazd | ZŹ, zgodne (brak wskaźnika przy szynie — zgodnie z rysunkiem) | plan Z.16 |
| Tabliczka CT | napis „100/5/5”, ale TRZY rdzenie z tabliczkami: I 10 VA kl. 0,2S FS5; II 15 VA kl. 5P20; III 15 VA kl. 5P20 | ZŹ; niespójność wewnętrzna rysunku (napis vs liczba rdzeni) — przyjęto trzy rdzenie (każdy ma tabliczkę i linię); nazwa pozycji katalogu „CT 100/5 A, 3 rdzenie” | `ct_typ_ogolny_osd_100_5_5_5_z16` |
| Rdzeń I (8 żył) | → „Układ pomiarowy bilansowo-kontrolny” (z napięciem obwodu „UL1,UL2,UL3,N, Pom.en.”) | ZŹ | `obwody_przekladnikow` |
| Rdzeń II | → I>, I>> | ZŹ | 51, 50 |
| Rdzeń III | → „Zab. ziemnozw.” (znak kierunku) + „Z,Zz” | ZŹ; **rozbieżność**: było interpretacją rdzenia III dla 51N | 51N, 67N |
| Ir> | ← przekładnik niezrównoważenia | ZŹ | 60N |
| U> | ← obwód okrężny „UL1,UL2,UL3,N, Pom.en.” | ZŹ; **rozbieżność**: było z przekładnika międzyfazowego T4 (interpretacja); T4/T5 nie mają linii do sterownika (rozładowanie, §17) | 59 |
| Wyjścia | piony I>, I>>, t1, t2 (ziemnozw.), Ir> (szara), ZS (szara), LRW (szara), kolumna bez napisu, sterownik → „OW1, OW2”; pion U> do linii OW nie dochodzi | ZŹ; U> → OW1, OW2 jako interpretacja z §26.9.7 | `uwaga` 59 |
| Okrężne | „Wył. od zab. TR” (wejście, wprost do „OW1, OW2”), +AwUp (we), Up, Aw, Al (wy), Pobudzenie LRW, Blokowanie ZS (wy), „UL1,UL2,UL3,N, Pom.en.” (we), „Z,Zz” (we); górna krawędź: „Sterowanie zegarem” (we) | ZŹ | `_OBWODY_Z16` |

### 4.4. Z.13, Z.14, Z.15 (s.93–95) — pola zespołu uziemiającego (porównanie bez implementacji)

Wspólne dla trzech rysunków (ZŹ): szyna → łącznik trójpołożeniowy z napędem → wyłącznik z
napędem M → P1, CT „100/5”, I 15 VA kl. 5P20 (4 żyły → I>) → P2 → węzeł z ogranicznikiem
przepięć do ziemi → transformator uziemiający (uzwojenie zygzak od strony SN, uzwojenie
gwiazdowe 400/230 V AC z uziemionym punktem neutralnym: „Zasilanie potrzeb własnych
400/230 V AC”); blok „BTI | BTII” transformatora → sterownik pola; punkt neutralny zygzaka →
ogranicznik przepięć do ziemi oraz gałąź uziemienia. Tekst §16 (s.30): układ ZNyn11,
regulacja beznapięciowa ±5 %; „AWSC z rezystorem zabudowanym po stronie wtórnej, wymuszającym
prądy 20 A ÷ 40 A … dopuszcza się rezystor wymuszający po stronie pierwotnej powyżej 40 A”;
odłącznik dławika z napędem ręcznym. Sterownik pola: t1/I>, t2/I>>, t1/Io>, t2/Io>>, ZS, LRW,
„Sterownik pola”; wyjścia I>, I>>, Io>, Io>> i sterownika → OW1 (Z.13–Z.15 mają tylko OW1),
sterownik → ZW; okrężne: +AwUp (we), Up, Aw, Al (wy), Pobudzenie LRW, Blokowanie ZS (wy),
UL1,UL2,UL3,N (we, 4 żyły), Z,Zz (we, 2 żyły); §26.9.6 — I>>, I>, ziemnozwarciowe, blokowanie
ZS, SPZ transformatorów uziemiających (tylko sieć z rezystorem), pobudzenie LRW.

| Rysunek | Gałąź punktu neutralnego | Io>/Io>> | Dodatkowo |
|---|---|---|---|
| Z.13 | odłącznik → dławik z regulacją (strzałka), blok „BDI | BDII”, uzwojenie 500 V z rezystorem AWSC przez stycznik (ramka kreskowana), uzwojenie 100 V → „Regulator dławika”; CT w uziemieniu dławika → „Regulator dławika” | brak osobnej linii — z rdzenia I (interpretacja) | „Regulator dławika” ↔ sterownik, → SSiN; okrężny „ZAWSC” (wy) |
| Z.14 | gałąź dławika (łącznik → dławik, „BDI | BDII”, 500 V) RÓWNOLEGLE z gałęzią rezystora (łącznik → rezystor → CT do ziemi); gwiazdka: „opcjonalna lokalizacja przekładnika prądowego SN w stosunku do przekładnika w gałęzi rezystora” | ← CT gałęzi rezystora (czerwona linia) | okrężny „ZAWSC” (wy) — rezystor po stronie pierwotnej (§16) |
| Z.15 | łącznik → rezystor → CT do ziemi | ← CT gałęzi rezystora | blok „SPZ” w sterowniku (SPZ transformatora uziemiającego) |

Reprezentacja zgodna z decyzją D1 i kartą zwarć doziemnych (drzewo `wt-ziemne`):
dławik — `GroundingConfig(type="petersen_coil", x_ohm=…)`, rezystor — `resistor_grounded`
z `r_ohm`, rezystor wymuszający AWSC (Z.13 po stronie wtórnej, Z.14 po stronie pierwotnej) —
`GroundingConfig.awsc_prad_wymuszenia_a` karty EWALUATORY-ZIEMNOZWARCIOWE (drzewo `wt-ziemne`, w tym drzewie jeszcze nieobecne; predykat `blad_konfiguracji_uziemienia`).
Bloker walidatora E-W5-04 (dwa uziemione nośniki w wyspie galwanicznej SN) i pole AWSC
`GroundingConfig.awsc_prad_wymuszenia_a` (przeniesione z karty zwarć doziemnych): wykonane
2026-11-05.

Stan po następcy 4 (2026-11-05):
- ZNyn11 (§16 s.30, tekst strony odczytany z warstwy tekstowej PDF): w słowniku
  `enm/grupa_polaczen.py` razem z parami odwrotnymi do Dz i Yz (Zd, ZNd, Zy, Zyn, ZNy, ZNyn;
  46 → 66 grup), lustro frontu i snapshot OpenAPI (addytywnie). Gałąź zygzaka uziemionego
  w `_decide_connection` ma test produkcyjny. Sonda `tests/enm/test_sonda_transformatora_uziemiajacego.py`:
  ZNyn11 z Z_N ≡ źródło z Z_0,Q = Z_T0 + 3·Z_N (do 1e-9), różnica wobec Z_0,Q = 3·Z_N równa Z_T0.
- Para przeniesienie / oddanie punktu neutralnego: `enm/zespol_uziemiajacy.py` (zapis pary na
  `Transformer.meta["zespol_uziemiajacy"]`, wartości robocze ESTIMATED: X_N = 1/(3·ΣB_0·1,1)
  przy znanej pojemności doziemnej — §16 zabrania pracy w rezonansie, rozstrojenie +10 % to
  założenie inżynierskie; R_N z profilu `mng_resistor_medium` 40 Ω; AWSC 40 A wg §16).
  Czytelnicy opisu sieci (`solver_input/v126_contracts._resolve_network_neutral`,
  `application/analyses/v126_gotowosc._uziemienie_z_modelu`,
  `application/field_read_model._resolve_neutral_grounding_mode`) czytają nośnik WYSPY
  (`typy_punktu_neutralnego_szyn_sn`) — jedno źródło z E-W5-04.
- NZ: rola pola „ZU” w słowniku ról i wszystkich miejscach roli BKR, szablony Z.13–Z.15
  z obwodami wtórnymi, wpięcie pary w `add_sn_bay` / `delete_element`, rysunek pola ZU.

Stan po następcy 5 (2026-11-05), odczyt obrazów stron 93–95 w 200 dpi:

| Pozycja | Z.13 (s.93) | Z.14 (s.94) | Z.15 (s.95) | Kod |
|---|---|---|---|---|
| Tor pola | szyna → łącznik trójpołożeniowy (Q1) z napędem → wyłącznik z napędem M (Q0) → P1, CT 100/5, P2 → węzeł z ogranicznikiem (F1) → transformator ZNyn11; brak wskaźnika napięcia i złącza kablowego | j.w. | j.w. | plan szablonu; `ct_typ_ogolny_osd_100_5_z13` |
| I>, I>> | rdzeń I (4 żyły, czerwona linia) → OW1 | j.w. | j.w. | 51, 50 (ZŹ) |
| Io>, Io>> | brak linii prądowej (CT w uziemieniu dławika → regulator dławika) | ← CT gałęzi rezystora (czerwona linia) | ← CT gałęzi rezystora | 51N, 50N: Z.13 interpretacja z rdzenia I; Z.14/Z.15 wejście `PRZEKLADNIK_PUNKTU_NEUTRALNEGO` T2 (przekładnik poza polem — nośnik punktu neutralnego, `RODZAJE_WEJSCIA_POZA_POLEM`) |
| ZS, LRW | → „Blokowanie ZS”, „Pobudzenie LRW” (okrężne) | j.w. | j.w. | ZS, 50BF |
| SPZ | — | — | blok SPZ → ZW | 79 (wejście z rdzenia I — interpretacja, §26.9.6) |
| Okrężne | +AwUp, Up, Aw, Al, ZAWSC, Pobudzenie LRW, Blokowanie ZS, UL1,UL2,UL3,N (4 żyły), Z,Zz (2 żyły) | j.w. | bez ZAWSC | `_obwody_zespolu_uziemiajacego` |
| BTI, BTII | blok przy transformatorze, linia do sterownika (kierunek nieopisany) | j.w. | j.w. | sygnał wejściowy — interpretacja |
| Regulator dławika | blok poza sterownikiem, linie do sterownika, SSiN | — | — | sygnał „Regulator dławika” — interpretacja |
| Gałąź punktu neutralnego | odłącznik → dławik z regulacją (BDI/BDII, 500 V, 100 V), AWSC: stycznik + rezystor (ramka), ogranicznik w punkcie neutralnym | odłącznik → dławik ∥ odłącznik → rezystor → CT → ziemia; ogranicznik; gwiazdka — opcjonalne miejsce CT | odłącznik → rezystor → CT → ziemia; ogranicznik | nośnik `Transformer.hv_neutral` (D1); rysunek w GPZ: wykonany (następca 7, niżej) |

Stan po następcy 7 (2026-11-05) — rysunek pola ZU w GPZ (`compose/gpz.ts`,
`ogonZespoluUziemiajacego`; widok `v2/model/zespolUziemiajacyPola.ts` z zapisu pary
`Transformer.meta.zespol_uziemiajacy` i nośnika `hv_neutral`):

| Element rysunku | Źródło (s.93–95) | Status | Rysunek |
|---|---|---|---|
| Tor pola do transformatora | Q1 → Q0 → P1, T1, P2 → węzeł z F1 → transformator | ZŹ (kolejność z planu szablonu — tor jest ten sam co danych) | stos pola ZU, transformator ZNyn11 jako ostatni aparat toru (bez wieży transformatora) |
| Transformator ZNyn11 | zygzak od strony SN z wyprowadzonym punktem neutralnym, gwiazda 400/230 V | ZŹ | glif `transformer2W` z uzwojeniami z grupy połączeń; zacisk `punktNeutralny` rysowany tylko przy zygzaku z N |
| Ogranicznik w punkcie neutralnym | ogranicznik przepięć do ziemi przy punkcie neutralnym | ZŹ | `surgeArrester` pod węzłem punktu neutralnego |
| Odłącznik gałęzi | odłącznik przed dławikiem / rezystorem | ZŹ | `disconnector` (stan zamknięty) w każdej gałęzi |
| Dławik / rezystor | Z.13 dławik; Z.14 dławik ∥ rezystor; Z.15 rezystor | ZŹ | `neutralEarthing` coil / resistor z wariantu, bez wariantu z typu `hv_neutral`; podpis X_N / R_N z nośnika |
| CT gałęzi rezystora (T2) | Z.14, Z.15: przekładnik między rezystorem a ziemią → Io>, Io>> | ZŹ w treści; **świadoma różnica**: rysunek stawia CT NAD rezystorem (bliżej punktu neutralnego), bo port dolny glifu `neutralEarthing` jest uziemieniem glifu | przekładnik `…-zespol-rezystor-przekladnik` |
| AWSC | Z.13: rezystor na uzwojeniu 500 V przez stycznik (ramka kreskowana) | ZŹ w treści; **świadoma różnica**: rysunek nie rysuje uzwojenia 500 V ani stycznika — AWSC jest podpisem wartości („AWSC 40 A”) przy dławiku (nośnik `awsc_prad_wymuszenia_a`, bez elementu modelu, który mógłby być aparatem) | podpis gałęzi dławika |
| AWSC Z.14 | rezystor gałęzi równoległej jest rezystorem wymuszającym po stronie pierwotnej (§16 s.30) | ZŹ (tekst §16) | podpis rezystora „R_N … · AWSC 40 A” albo „rezystor · AWSC 40 A” bez R_N w nośniku |
| Kropki węzłów punktu neutralnego | kropki w rozgałęzieniach przewodu punktu neutralnego | ZŹ | kropka przy ogranicznik i przy każdym zejściu gałęzi poza ostatnim (narożnik) — predykat `ODCZEP_WEZLA_POLA` |
| CT w uziemieniu dławika → regulator dławika (Z.13) | obecny | ZŹ w treści; **świadoma różnica**: nierysowany — model nie ma tego przekładnika ani regulatora (obwody wtórne opisują sygnał „Regulator dławika”) | — |
| Potrzeby własne 0,4 kV | gwiazda 400/230 V z uziemionym N → „Zasilanie potrzeb własnych 400/230 V AC” | ZŹ | strzałka odbioru `loadArrow` z podpisem „potrzeby własne 0,4 kV” (napięcie z `lv_bus` transformatora) |
| BTI/BTII, BDI/BDII, uzwojenie 100 V | bloki zabezpieczeń własnych aparatów | WO (z odczytu następcy 5) | nierysowane (obwody wtórne pola) |

Testy: `frontend/src/ui/sld/v2/model/__tests__/zespolUziemiajacyPola.test.ts` (iloczyn wariant ×
dawca × deklaracja stacji × zapis na pole innej roli × glif), tablica parytetu
`pole_transformatorowe_parytet_v1.json` (cztery wiersze zespołu, pytest i vitest), sceny
`gpz110kvPoleZu{Z13,Z14,Z15}` z generatora `fikstury_enm_sld.py`. Zrzuty:
`mv-design-pro/docs/uiux/zrzuty/pola-gpz/pole-z1{3,4,5}-{ciemny,jasny}.png`.

Napotkane i naprawione: nośnik punktu neutralnego zadeklarowany jako uziemiony bez kompletu
wartości (dławik bez X_N przy nieznanej pojemności doziemnej) był niewidoczny dla blokera
E-W5-04 — drugi zespół uziemiający w wyspie przechodził; `nosniki_uziemione_sn` liczy go teraz
z deklaracji. Pakiet iec60617 (backend i kopia frontu) mapował `PHASE_TO_PHASE_VT` na symbol
`voltageTransformer`, choć od poprawki Z.16 rysuje go glif baterii — parytet frontu był czerwony.

### 4.5. Z.17 (s.97) — relacje funkcja → uzwojenie (kontrola)

Uzwojenie III (2 żyły) → Uo> i (odgałęzienie) obwód „Z,Zz”; uzwojenie II (4 żyły) → „Sterownik
pola” (bloki U>, U<, f<, df/dt są jego kolumnami) oraz obwody „UL1,UL2,UL3,N” i „Automatyka
SZR”; uzwojenie I (przez bezpiecznik) → „UL1-2-3-N Pom. en.”; f< → SCO1, SCO2, SCO/SPZ;
sterownik → Up, Al, „Blokowanie SZR”; wejścia +AwUp, Topologia, Zasilanie. Zgodne z opisem
w `BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17`. Rysunek nie rysuje wyjść bloków U>, U<, Uo>, df/dt —
dlatego szablon nie ma danych `obwody_wtorne` (kontrakt wymaga wyjścia funkcji).

## 5. Klasa defektu znaleziona przy okazji

`earthing_role` aparatu pola nadawały cztery drogi budowy pola niezależnie; droga szablonu
(`bay_templates.template_primary_devices`) pomijała ogranicznik przepięć (Z.7, Z.16 bez roli
„gałąź uziemiająca ogranicznika”). Naprawa: `network_model/core/uziemienie.py`
`ROLA_UZIEMIENIA_RODZAJU_APARATU`, czytana przez `bay_templates.template_primary_devices`,
`bay_templates.mv_source_field_primary_devices`, `reference_engine/field_configuration_catalog.py`,
`enm/pole_katalogowe._aparat_pierwotny` i `application/field_read_model.py`. Test iloczynu:
`backend/tests/network_model/test_rola_uziemienia_rodzaju_aparatu.py` (iniekcja: przywrócenie
warunku `== "ES"` → 2 testy czerwone).

Profile pola pakietu IEC 62271 (`transformer_breaker`, `coupler`, `capacitor_bank`) wymagały
odłącznika i aparatu transformatora — rozdzielnicy GPZ z łącznikami trójpołożeniowymi (§13)
nie przyjmowały. Profile dostały grupę „łącznik trójpołożeniowy albo odłącznik” (jak
`line_breaker`), łącznik szyn — kolejność lustrzaną, pole transformatora — transformator
opcjonalny (Z.7: transformator poza celą).

## 6. Testy

- `backend/tests/network_model/catalog/test_pola_gpz_zrodlo_enea.py` — tabela rysunków Z.7,
  Z.12, Z.16 przepisana z obrazu strony (funkcje × wejścia × wyjścia, kierunki sygnałów,
  przeznaczenie obwodów przekładników, tabliczki z wariantami gwiazdki, kolejność aparatów,
  brak statusu wtórnego odczytu, predykat parami połączenia sygnałów).
- `backend/tests/enm/test_powiazania_obwodow_aparatow_pola.py` — powiązania aparatów pól Z.7,
  Z.12, Z.16 ścieżką użytkownika (pole właściwej roli, tryb szablonu i katalogu).

## 7. Defekt zmierzony sondą D1 — nienaprawiony (zmienia złote wartości, decyzja architekta)

`enm/mapping._assemble_zero_sequence_y0` dokłada węzłowi bez żadnej drogi zerowej odniesienie
numeryczne 1e6 pu, czyli Z_0 ≈ 0: zwarcie 1F na szynie SN z punktem neutralnym izolowanym i bez
pojemności doziemnej liczy się jak w sieci uziemionej bezpośrednio (pomiar sondą: 4062,43 A wobec
4062,43 A dla Z_0 = 0). Zmiana na 1e-6 pu (przerwa, I″k1 → 0) czerwieni parytet assemblera
(`tests/golden/parytet_assemblera`, benchmarki IEEE 4/9/13/14 węzłów bez danych składowej
zerowej: I″k1 19 562,8 A → 0,0014 A; I″k2E o połowę) — granica karty „golden bez zmian wartości”,
więc zmiana wycofana. Do rozstrzygnięcia: odmowa nazwana zwarcia doziemnego w węźle bez drogi
zerowej zamiast liczby, z przebudową złotych benchmarków.
