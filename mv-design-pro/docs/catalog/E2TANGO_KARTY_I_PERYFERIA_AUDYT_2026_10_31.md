# e²TANGO — karty rozszerzeń, warianty pomiarowe, komunikacja i peryferia

**Audyt źródłowy z 31.10.2026; gałąź zależna PR #518.** Status: **wiedza o dostępnych podzespołach, nie zaakceptowana konfiguracja sprzętowa stacji**. Nie przypisywać z tego wykazu automatycznie funkcji, torów CT/VT, nastaw EAZ ani stanów na schemacie.

## 1. Podstawa źródłowa — rozdzielić rewizje dokumentacji

| Źródło oficjalne | Weryfikowany zakres |
|---|---|
| [Elektrometal K-3.2.25, 04/2026](https://elektrometal-energetyka.pl/wp-content/uploads/2026/04/Karta-katalogowa-e2TANGO-600-1200-K-3.2.25.pdf), s. 12–13 i 19–21 | **Obowiązująca jako punkt odniesienia audytu** lista kart 600/800/1000/1200, opcje TR, COM, IEC 61850 i formularz obsady |
| [Elektrometal K-43.1.7, 07/2025](https://elektrometal-energetyka.pl/wp-content/uploads/2025/07/Karta-katalogowa-e2TANGO-450-K-43.1.7.pdf), s. 13–15 | Moduł bazowy, karty B/C/D, pomiary TR/TU/TZ, komunikacja 450 |
| [Formularz zamawiania 450](https://elektrometal-energetyka.pl/rozwiazania-2/formularz-zamawiania-e%C2%B2tango-450/) | Aktualny wykaz rozbudowy i miejsca B–D; niezgodne zapisy AO10/A010 i 6O3I/603I |
| [Elektrometal K-42.1.8, 10/2025](https://elektrometal-energetyka.pl/wp-content/uploads/2025/10/Karta-katalogowa-e2TANGO-250-K-42.1.8.pdf), s. 6, 13–14 | 250, 4-slotowa jednostka, ograniczenia wariantów S/U, karty B/C/D |
| [Elektrometal K-33.2.2](https://www.elektrometal-energetyka.pl/wp-content/uploads/2021/04/Karta-katalogowa-e2TANGO-400-33.2.2.pdf), s. 8 | Historyczne wykonanie 400 — **nie przenosić bez weryfikacji na 450** |
| [Redundancja e²TANGO, 26.11.2024](https://elektrometal-energetyka.pl/redundancja-w-zabezpieczeniach-e%C2%B2tango/) | PSU2, redundantne porty, PRP |
| [e²ECHO-B/Bd](https://elektrometal-energetyka.pl/solutions/e%C2%B2echo-voltage-presence-indicators/) | Odrębne wskaźniki obecności napięcia i blokady uziemnika |

**Uwaga:** K-3.2.25 superseduje do potrzeb tego audytu starszą K-3.2.21 w części dostępności kart. Starsze rewizje zachować do odczytu wykonania istniejącego urządzenia, nie nadpisywać nimi zamówień 2026.

## 2. Architektura sprzętowa i granice systemu

### 600/800/1000/1200

Sterownik składa się z panela operatorskiego i zewnętrznej jednostki centralnej. Wybiera się J6 = A–F, J10 = A–J, J14 = A–N. W jednostce są standardowe CPU, PSU (z 7 wyjściami przekaźnikowymi) i port Ethernet. Jednocześnie trzeba określić **wersję karty pomiarowej**, **parametry wejść 1/5 A**, zasilacz, COM1, COM2, rodzaj mocowania, długość kabla panel–jednostka i opcję IEC 61850.

Karty pomiarowe: TRS (4I+5U), TR (5I+4U), TRU (9U), TRSG (5I+5U), TRP (5I+3Ip+4U), TRC (cewki Rogowskiego) i TRCZ (Rogowski + sensory napięcia). Są to warianty wyboru w zamówieniu, **nie pozycje w liczniku zwykłych kart wsuwanych**.

### 250/450

Jednostka ma 4 miejsca A/B/C/D; A jest fabrycznie obsadzone kartą 603I (250) albo opisaną jako 6O3I (450). Jedynie B/C/D pozostają do wyboru z formularza. Karta 250 K-42.1.8 podaje typy TR / TRU / TRC1–3, karta 450 podaje TR/TU/TZ1/TZ2 i TRC1–3. **TRC, TRCZ, TRC1, TRC2, TRC3 to nie warianty zamienne bez udokumentowanego dopasowania wejścia pomiarowego.** 250 i 450 nie dziedziczą automatycznie PSU2/TRR/3TMP/TVZ z 600–1200.

### Starsza 400

W K-33.2.2 występują między innymi karty 10 wejść i PT1000, których nie wprowadzono jako dostępnych dla 450. Do kompletnego audytu instalacji 400 potrzebny jest **numer DTR, kod zamówienia i wykonanie historyczne**.

## 3. Zestawienie kart 600–1200

| Grupa | Moduły | Ilość sygnałów / przeznaczenie |
|---|---|---|
| Wejścia dwustanowe | 8IN/12IN, 8IN24/12IN24, 8IN220/12IN220 | 8 lub 12 wejść, **odrębne napięcia pracy** |
| Wyjścia przekaźnikowe | 8OUT, 4OUTH | 8 zwykłych / 4 szybkie wzmocnione |
| Wejścia analogowe | AI10, AI20 | 4 × 0–10 V lub 4 × 4–20 mA |
| Wyjścia analogowe | AO10, AO20 | 4 × 0–10 V lub 4 × 4–20 mA |
| Temperatura | PT1, 3TMP, 6TMP | 6 × PT100 lub 3/6 czujników światłowodowych szyn |
| Zabezpieczenie łukowe | ARC, ARP | 6 wejść na kartę; różny rodzaj czujników |
| Redundancja zasilania | PSU2 | Drugi zasilacz; zajmuje **2 sloty** |
| Dodatkowy pomiar napięcia | TV, TVZ | 4U z przekładników / sensory dla synchrocheck |
| Dodatkowy pomiar prądów | TRR | Obwody dodatkowe SN1/SN2/nN; **2 sloty** w J10/J14 |

Napięcia wejść dwustanowych opisane w K-3.2.25:
- 8IN/12IN: konstrukcja dla 110 V, zakres wskazany przez producenta 80–390 V DC (do 276 V AC);
- 8IN24/12IN24: 19–60 V DC;
- 8IN220/12IN220: 176–264 V DC.

Nie wnioskować z tego o napięciu całej automatyki, dopuszczalnym prądzie łączeniowym wyjść ani parametrach CT. Wyjście logiczne **DO** i wyłącznik SN **CB** to osobne obiekty.

## 4. Jawne ograniczenia, nie wolno ich ignorować

1. **AI:** maks. jedna karta z AI10/AI20; **AO:** maks. jedna z AO10/AO20.
2. **PT1:** maks. jedna karta. **3TMP/6TMP:** maks. jedna z obu.
3. **8OUT:** maks. cztery karty w 600–1200.
4. **PSU2:** zajmuje dwa sąsiednie sloty, np. C+D; zasilanie 110–220 V AC/DC.
5. **ARC i ARP:** ARP wymaga ARC; jedna ARC i jedna ARP wg instrukcji. 450 posiada ARC, 250 ma niespójne źródła, więc nie dopuszczać ARC jako pewnej karty 250.
6. **TRR:** J10 lub J14. Przypis K-3.2.25 s.20 dopuszcza E (zajęte C+E) dla SN1 oraz F (D+F) dla SN2/nN; instrukcja s.21 mówi **tylko F** (D+F).
7. **TV:** przypis K-3.2.25 s.20 dopuszcza E/F i wymaga TRS/TRC/TRCZ; instrukcja s.21 mówi **tylko E oraz nie razem z TR**. Ta sprzeczność nie może zostać rozstrzygnięta przez model na podstawie intuicji.
8. **Kody 450:** wydruk 6O3I oraz AO10/AO20, formularz online 603I oraz A010/A020 — rozbieżności znakowe do potwierdzenia, żadnego dopisywania nowych części na podstawie literówki.
9. **250 a łuk:** tabela wyposażenia K-42.1.8 wspomina czujniki błysku, lecz formularz slotów ich nie oferuje. Brak podstaw do uznania ARC w konfiguratorze 250.
10. **IEC 61850:** według K-3.2.25 opcja zamówienia wyklucza podgląd kamer. Warianty E/EG/E2G i O/OG/O2G różnią medium, GOOSE i liczbą portów; PRP / HSR nie włączać bez kodu zamówienia.
11. **Sygnał pomiarowy 1 A / 5 A:** dotyczy wybranej karty, NIE numeru modelu 600/800/1000/1200; nie mieszaj ze stosunkiem CT 400/1 A lub 400/5 A.
12. **Peryferia zewnętrzne:** e²ECHO, e²TANGO-FER oraz czujniki zewnętrzne nie zajmują slotu w jednostce. Nie tworzyć z nich kart TR ani styczników w torze pierwotnym.

### Spór wymagający producenta: TV / TRR

Z punktu widzenia bezpieczeństwa i kontroli jakości baza danych oznacza oba kody jako wymagające potwierdzenia. **Nie wdrożono automatycznej walidacji slotów dla TV/TRR ani domyślnej konfiguracji transformatora z 87T.** Rozstrzygnięcie wymaga pisemnej rewizji dokumentacji, aktualnego formularza właściwego dla zamawianej jednostki i/lub potwierdzonego układu slotów z DTR.

## 5. Peryferia poza kasetą sterownika

- **e²ECHO-B** — oddzielny wskaźnik obecności napięcia, wyjścia pomocnicze współpracujące z blokadą uziemnika.
- **e²ECHO-Bd** — dodatkowo funkcja blokady i chwilowego odblokowania; źródło opisuje czas przywrócenia blokady ok. 30 s. Nie utożsamiać mechanicznego lub elektrycznego układu blokad z narysowaniem samej kontrolki.
- **e²TANGO-FER** — **zewnętrzny moduł mocy** do tłumienia ferrorezonansu w obwodach wtórnych przekładników napięciowych; system dwustopniowy sterowany przez odpowiednio wyposażony i skonfigurowany e²TANGO 600–1200. Nie wolno włączyć modułu do schematu pierwotnego SN jako typowego rezystora sieciowego ani traktować go jako uziemnika.
- **Czujniki łuku** — do ARC i ARP, długość fabryczna światłowodu 5 m; zasięg i prowadzenie optyki wymagają projektu.
- **Czujniki temperatury szyn** — do 3TMP/6TMP, optyka 5 m, obowiązkowa informacja o przekroju szyny przy zamawianiu.
- **PT100** — do PT1; nie dopowiadać typu przewodów i czujnika bez DTR.
- **Cewki Rogowskiego / sensory napięcia** — poprawne tylko w połączeniu z właściwym wariantem karty i parametrami sensora.
- **Panel operatorski i kabel panel–jednostka** — kable katalogowe 1/2 m, montaż N3 z kablem 0,25 m; inne rozwiązania na uzgodnienie.
- **Dodatkowe porty optyczne/elektryczne i redundancja PRP** — element konfiguracji komunikacyjnej, nie automatyczna „funkcja ochrony”. Przy IEC 61850 weryfikacja ICD/CID/SCD i sterowania GOOSE jest osobną bramką projektową.

## 6. Kontrakt MV-DESIGN-PRO

**Dostarczone:** plik `backend/src/network_model/catalog/data/e2tango_karty_peryferia_2026.json` zawiera 25 modułów/kart, 13 wariantów podstawowej karty pomiarowej, 11 typów peryferiów i 15 reguł/niejednoznaczności z metadanymi źródeł. Nie stwierdza, że wszystkie karty są kompatybilne z każdym modelem.

**API do pytań technicznych:** `GET /api/catalog/elektrometal-etango-expansions` — odczyt pełnych źródłowych danych, bez zapisu do ENM i bez mutacji funkcji EAZ.

**Nie wykonano:** konfiguratora kart, weryfikatora pinów i wiązek, tworzenia schematów obwodów wtórnych IEC 60617, sprawdzenia rzeczywistych rekordów SCL/ICD ani implementacji ochron 87T. Tego nie wolno uznać za zakończone na podstawie samego katalogu.

**Kryterium przyszłego odbioru konfiguratora:** możliwość odwzorowania rzeczywistego kodu zamówienia i pozycji slotów na podstawie DTR/zdjęcia tabliczki, kontrola sumy I/O i zajętości, odrzucanie tylko reguł jednoznacznych, blokada automatycznej akceptacji sprzecznych TV/TRR, test wspólnego poboru i podłączenia napięć pomocniczych, osobne sygnały pomocnicze uziemnika i e²ECHO oraz brak samoczynnego aktywowania zabezpieczeń.

**Zakres odpowiedzialności:** nie dotykać UX-04, wyglądu SLD, B-02 i pracy Opusa. Informacja o aparacie i okablowaniu to dane pochodzenia producenta, nie dowód zgodności z wymaganiami ENEA Operator.
