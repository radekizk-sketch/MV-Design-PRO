# Standard ENEA SN, Zeszyt 4 — moduł bilansujący systemu AMI w stacjach SN/nN

Status: **BINDING** (dyrektywa właściciela 2026-11-12; Zasada nr 5 w `CLAUDE.md`, wzorzec formy
`STANDARD_ENEA_GPZ_Z1.md`).

Źródło: ENEA Operator sp. z o.o., „Standardy w sieci dystrybucji — Stacje elektroenergetyczne
średniego napięcia, Zeszyt 4. Moduł bilansujący systemu AMI”, wersja 01.2021-2, obowiązuje od
30.11.2021, zatwierdzona uchwałą Zarządu nr 356/2021; zastępuje wersję 01.2021 (uchwała
103/2021). Adres pobrania: `https://www.operator.enea.pl/media/686/` (plik „stacje-
elektroenergetyczne-sredniego-napiecia-zeszyt-4modul-bilansujacy-systemu-…”), pobrany
2026-11-12, 17 stron (10 stron treści i 7 stron załączników), dokument w postaci skanu —
odczytany wzrokowo, SHA-256 pliku zaczyna się od `2b3735af` i kończy na `306f`.
PDF i obrazy stron NIE są w repozytorium (prawa ENEA). Dokument zawiera wyłącznie numery
punktów, wartości liczbowe i własne sformułowania.

Prefiks: `EA-`.

**Załączniki 1–4** (schematy połączeń szaf AMI wnętrzowej, zewnętrznej, poziomej, pionowej
i słupowej) są w dokumencie oznaczone jako informacja nieogólnodostępna. Ich treści NIE
przenosi się do repozytorium ani do produktu; wymagania tekstowe, które się do nich odwołują
(kolorystyka i numeracja torów listew), są zapisane wyłącznie jako odwołanie do załącznika.

## 1. Zakres stosowania w produkcie

Szafa AMI nie jest elementem obliczeń elektrycznych sieci. Standard wpływa na produkt
w miejscach:

- katalog i karta techniczna stacji: obecność i lokalizacja szafy AMI, przekładniki
  bilansujące nN (wymagane przez Zeszyty 1, 2, 3 i 6);
- model ENM: pomiar bilansujący po stronie nN stacji (przekładniki prądowe za łącznikiem
  głównym) jako punkt pomiaru, bez wpływu na fizykę;
- kreator stacji: miejsce na szafę AMI w każdym wariancie (kompaktowa, uproszczona,
  słupowa, wnętrzowa) oraz w stacjach istniejących (rozdz. 5);
- raport: zestawienie wyposażenia stacji.

Ocena zgodności (jeżeli wdrożona) jest werdyktem wyjaśnialnym; brak danych o szafie AMI
w modelu nie jest zgodnością.

## 2. Wymagania potwierdzone

| Nr | Punkt | Wymaganie (własne sformułowanie) |
|----|-------|----------------------------------|
| EA-01 | §1–§2 | Wymagania minimalne dla modułu bilansującego AMI w nowych i rozbudowywanych stacjach SN/nN. |
| EA-02 | §3 | Normy wg Zeszytu 1. |
| EA-03 | 4.1.1.1 (i) | Szafa: 230/400 V, 50 Hz; napięcie izolacji 500 V; temperatura pracy −25…+40 °C; II klasa ochronności; IK 10; IP 44; palność V-0. |
| EA-04 | 4.1.1.1 (ii) | Obudowa skręcana, RAL 7035, tworzywo SMC z 25–32,5 % włókna, odporna na UV, lakier poliuretanowy 60/110 µm; wentylacja; drzwi otwierane na 180°; zamknięcie trzypunktowe; klamka pod MASTER KEY i kłódkę; ścianki ≥ 3,5 mm; łącznik krańcowy drzwi. |
| EA-05 | 4.1.1.1 (ii) | Wymiary: szafa pozioma 800 × 620 (tolerancja −5 %) × 245 mm; szafa pionowa 520 × 820 × 245 mm. |
| EA-06 | 4.1.1.1 (iii) | Fundament szafy wolnostojącej: dolna krawędź drzwi 25–30 cm nad terenem; konstrukcja niezależna z przegrodą; ścianki demontowalne; krata ustojowa; RAL 7035; znacznik poziomu gruntu. |
| EA-07 | 4.1.1.2 | Oznakowanie zewnętrzne: typ szafy, tabliczka ostrzegawcza 74 × 105 mm o niebezpieczeństwie porażenia. Oznakowanie wewnętrzne: producent, wytwórca, nazwa, typ, data produkcji, znak CE, numer fabryczny. |
| EA-08 | 4.1.2 | Wyposażenie szafy pod licznik bilansujący, zasilacz, akumulator, sterownik (koncentrator) i router. |
| EA-09 | 4.1.2.1 | Listwa kontrolno-pomiarowa: ≥ 230/400 V; izolacja ≥ 500 V; udar 6 kV; tory prądowe ≥ 30 A; tory napięciowe ≥ 6,3 A; palność V0; poliamid PA 6.6; przewody 1–6 mm²; rezystancja styku ≤ 1 mΩ; −35…+65 °C; szyna TH-35; obudowa plombowana; złącza klatkowe lub sprężynowe; 16 torów; gniazda pomiarowe 4 mm. |
| EA-10 | 4.1.2.1 | Tory napięciowe z bezpiecznikiem 3,15 A o zdolności zwarciowej ≥ 15 kA, rozwierane tylko przez wyjęcie wkładki, bez dźwigni; cztery tory prądowe na fazę, zwierane wyłącznie mostkami; kolorystyka i numeracja wg Załącznika 1. |
| EA-11 | 4.1.2.2 | Listwa pomocnicza: ≥ 230/400 V; izolacja ≥ 500 V; udar 6 kV; ≥ 30 A; V0; PA 6.6; 1–4 mm²; ≤ 1 mΩ; −35…+65 °C; TH-35; segmenty wg Załącznika 1; fabryczne mostki. |
| EA-12 | 4.1.2.3 | Wyłączniki nadprądowe: AC 230 V 6 A i 10 A, zdolność zwarciowa ≥ 15 kA, charakterystyka B, przewody 1–6 mm², moment 3 Nm, −25…+50 °C; DC ≥ 24 V 4 A, ≥ 6 kA, charakterystyka B. |
| EA-13 | 4.1.2.4 | Przewody (izolacja ≥ 500 V): napięciowe do listwy SKa 4 × NSGAFOU 1×2,5 mm², od listwy 4 × LY 1×1,5 mm²; prądowe do listwy YDY 7×2,5 mm², od listwy 6 × LY 1×2,5 mm²; koncentrator 4 × NSGAFOU 1×2,5 mm² i 4 × LY 1×1,5 mm²; oznaczniki przewodów; obwody DC i sygnalizacji wg Załącznika 1. |
| EA-14 | 4.1.2.5 | Gniazdo 230 V 10/16 A ze stykiem ochronnym na szynie TH35. |
| EA-15 | 4.1.2.6 | Mostki szynowe FZ1, FZ2, FGn. |
| EA-16 | 4.2 | Rozdzielnica słupowa z modułem AMI wg Zeszytu 3; dla niej obowiązuje Załącznik 4 zamiast Załącznika 1. |
| EA-17 | 5.1 | W nowych stacjach szafa AMI montowana wg Zeszytów 1 i 2. |
| EA-18 | 5.2 | Stacje istniejące typu MST: szafa na ścianie; montaż i obsługa bez wyłączania stacji. |
| EA-19 | 5.3 | Stacje małogabarytowe z obsługą zewnętrzną: szafa w komorze TR w świetle drzwi albo wolnostojąca na fundamencie. |
| EA-20 | 5.4 | Stacje wieżowe: szafa w świetle drzwi komory TR na konstrukcji uchylnej. |
| EA-21 | 5.5 | Gdy montaż wewnątrz jest niemożliwy — szafa na zewnątrz budynku stacji. |
| EA-22 | rys. 1–2 (odczyt rysunku) | Przykładowa lokalizacja szafy AMI w stacji MST oraz opcjonalne miejsce przekładników prądowych bilansujących. |

## 3. Rozdziały formalne (spis)

- §3 — normy wg Zeszytu 1.
- §6 — gwarancja 60 miesięcy (szafa) i 96 miesięcy (obudowa).
- §7 — tryb odstępstw (patrz luka 1).
- Załączniki 1–4 — schematy połączeń, informacja nieogólnodostępna (nieprzenoszona).

## 4. Decyzje właściciela (NIE są wymaganiami ENEA)

Decyzje właściciela z 2026-11-13 (reklozery, odgałęzienia) nie dotyczą Zeszytu 4.

## 5. Decyzje graficzne i interpretacje, których NIE wolno przedstawiać jako wymagań ENEA

- Szafa AMI nie jest rysowana na SLD jako aparat; ewentualne oznaczenie punktu pomiaru
  bilansującego jest decyzją produktu.
- Produkt nie odtwarza schematów połączeń z Załączników 1–4.

## 6. Luki i niejednoznaczności

1. **§7 wewnętrznie sprzeczny:** najpierw stwierdza, że nie dopuszcza się innych rozwiązań,
   a następnie opisuje tryb ich dopuszczenia decyzją Dyrektora Departamentu Zarządzania
   Informacją Pomiarową.
2. **5.1 wymienia tylko Zeszyty 1 i 2,** pomijając Zeszyt 3 (słupowe, które ma własny
   Załącznik 5 i odwołanie 4.2) i Zeszyt 6 (wnętrzowe; Z6 4.1.8 wymaga szaf AMI w liczbie
   równej liczbie rozdzielnic nN).
3. **Wymiary szafy:** Zeszyty 1, 2 i 6 wymagają miejsca min. 620 × 800 × 245 mm (wysokość ×
   szerokość × głębokość), Zeszyt 4 podaje szafę poziomą 800 × 620 × 245 mm (tolerancja −5 %
   na 620) i pionową 520 × 820 × 245 mm. Szafa pionowa nie mieści się w miejscu „poziomym”
   z Zeszytu 1 bez obrotu — standard tego nie rozstrzyga.
4. **Treść załączników** jest niejawna, więc wymagania EA-10, EA-11 i EA-13 w części
   „wg Załącznika 1” nie są w produkcie weryfikowalne.
5. **Skan:** dokument jest skanem; odczyt wzrokowy wartości w tabelach parametrów listew
   (EA-09, EA-11) jest pewny co do jednostek, ale przy wdrażaniu katalogu zaleca się
   ponowne porównanie z oryginałem.

## 7. Mapa wdrożenia (stan głównego checkoutu, pomiar 2026-11-13)

| Wymaganie | Miejsce w kodzie | Stan |
|-----------|------------------|------|
| EA-01, EA-17 (szafa AMI w stacji) | brak obiektu „szafa AMI” w ENM i katalogu (grep -w `AMI` w `backend/src/enm`, `backend/src/network_model/catalog`, `backend/src/application/station_templates` — 0 trafień) | brak |
| pomiar bilansujący nN (CT za łącznikiem głównym) | `backend/src/application/station_templates/_choices.py:346` (`CT_OPTIONS`) | częściowo (przekładniki bez roli „bilansujący AMI”) |
| EA-03–EA-16 (budowa szafy) | nie modelowane; poza zakresem obliczeń produktu, dane karty technicznej | brak (świadomie: element nieelektryczny, bez wpływu na obliczenia) |
| źródło wersji | `backend/src/reference_engine/packs/osd_enea/pack.json:7`–`13` — lista źródeł pakietu bez Zeszytu 4 | brak |
