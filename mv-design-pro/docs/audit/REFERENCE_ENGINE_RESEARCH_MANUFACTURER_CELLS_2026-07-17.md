# Research: konfiguracje celek/pól rozdzielnic SN wg publicznych katalogów producentów

Data: 2026-07-17. Metoda: pobrane oficjalne katalogi PDF (curl przez proxy, TLS aktywne), odczyt tabel i schematów jednokreskowych narzędziem Read + ekstrakcja tekstu (pdftotext). **Każdy fakt poniżej pochodzi z realnie odczytanej strony wskazanego dokumentu.** Tam, gdzie katalog nie rozróżnia standard/opcja albo skład nie jest opublikowany — napisano to wprost.

Słownik składu aparatowego: `CB` wyłącznik, `LOAD_SWITCH` rozłącznik, `DS` odłącznik, `ES` uziemnik, `FUSE` podstawy/wkładki bezpiecznikowe (kombinacja rozłącznik-bezpieczniki), `CT` przekładnik prądowy, `VT` przekładnik napięciowy, `CABLE_HEAD` przyłącze kablowe (przepusty/głowice), `SURGE_ARRESTER` ogranicznik przepięć.

---

## 1. ABB SafeRing / SafePlus 12–24 kV (RMU SF6)

**Źródło:** „SafeRing/SafePlus 12-24kV — Gas-insulated ring main unit SafeRing and Compact switchgear SafePlus" (katalog ABB, ID dokumentu 9AKK107492A6537), 128 s.
URL: https://search.abb.com/library/Download.aspx?DocumentID=9AKK107492A6537&DocumentPartId=
Odczytane strony: 20–22 (konfiguracje SafeRing), 23 (dane techniczne modułów C/F/V), 25 (lista modułów SafePlus), 26–48 (opisy modułów 7.2–7.14), 49–51 (side metering, mini-metering).

### 1.1 Konfiguracje SafeRing (RMU w jednym zbiorniku SF6)

SafeRing dostarczany jest w **10 standardowych konfiguracjach** (s. 20–22; literówka konfiguracji = sekwencja modułów):

| Konfiguracja | Szerokość | Funkcja (PL) |
|---|---|---|
| DeF | 696 mm | przyłącze bezpośrednie z uziemnikiem + pole transformatorowe bezpiecznikowe |
| CCF | 1020 mm | 2× pole liniowe (rozłącznikowe) + pole transformatorowe bezpiecznikowe |
| CCCF | 1346 mm | 3× pole liniowe + pole transformatorowe bezpiecznikowe |
| CCFF | 1346 mm | 2× pole liniowe + 2× pole transformatorowe bezpiecznikowe |
| DeV | 696 mm | przyłącze bezpośrednie z uziemnikiem + pole wyłącznikowe |
| CCV | 1020 mm | 2× pole liniowe + pole wyłącznikowe |
| CCCV | 1346 mm | 3× pole liniowe + pole wyłącznikowe |
| CCVV | 1346 mm | 2× pole liniowe + 2× pole wyłącznikowe |
| CCC | 1020 mm | 3× pole liniowe |
| CCCC | 1346 mm | 4× pole liniowe |

(wszystkie: głębokość 751 mm, wysokość 1336 mm / opcjonalnie 1100 mm; s. 21–22).
Dodatkowo sekcja 7.16 „Mini-metering (integrated metering)" wymienia konfiguracje RMU **CCVm** (z wyłącznikiem) i **CCFm** (z bezpiecznikami) ze zintegrowanym pomiarem, dla jednostek 3-/4-polowych 12 i 24 kV (s. 51).

Wyposażenie standardowe każdego SafeRing (s. 20): uziemniki (ES), napędy z blokadami mechanicznymi, dźwignia napędu, kłódki na wszystkich łącznikach, przepusty kablowe od frontu z osłonami (CABLE_HEAD), pokrywa przedziału kablowego umożliwiająca montaż ogranicznika przepięć lub podwójnego kabla, szyny zbiorcze 630 A, szyna uziemiająca, wskaźnik obecności napięcia (pojemnościowy). Opcje (s. 20): przepusty do zewn. szyn / rozbudowy bocznej, przepusty do prób kabla (moduły C i De), manometr SF6, napęd silnikowy, cewki wybijakowe, styki pomocnicze, przekaźniki i RTU, wskaźniki zwarć, ogranicznik przepięć (szyna uziemiająca dla SA jako opcja).

### 1.2 Moduły SafePlus (lista modułów: s. 25)

Katalog jawnie rozróżnia „Standard features" i „Optional features" per moduł.

| Moduł | Funkcja (PL) | Skład standardowy (słownik) | Opcje istotne dla składu |
|---|---|---|---|
| **C** — Cable switch (s. 26–28) | pole liniowe (rozłącznikowe) | LOAD_SWITCH (trójpołożeniowy rozłącznik z funkcją odłącznika: zamknięty–otwarty–uziemiony) + ES; CABLE_HEAD (przepusty Interface C z dzielnikiem pojemnościowym do wskazania napięcia) | przepusty do prób kabla; combisensory (CT/VT sensor) w przepustach; napęd silnikowy |
| **F** — Switch-fuse (s. 29–31) | pole transformatorowe bezpiecznikowe | LOAD_SWITCH+FUSE (trójpołożeniowy rozłącznik-bezpieczniki) + 2× ES (górny i dolny uziemnik sprzężone mechanicznie, uziemiają obie strony wkładek); kanistry na wkładki DIN (12 kV maks. 125 A CEF, 24 kV maks. 63 A CEF); wybijak bezpiecznikowy + optyczna sygnalizacja zadziałania; CABLE_HEAD | napęd silnikowy; styki pomocnicze (w tym „fuse blown"); cewki wybijakowe; combisensory |
| **V** — Vacuum circuit-breaker (s. 32–34) | pole wyłącznikowe (transformatorowe 200 A / odpływowe 630 A) | CB (próżniowy 200 A lub 630 A) + DS/ES (trójpołożeniowy odłącznik/uziemnik za wyłącznikiem); zabezpieczenie elektroniczne samozasilające z CT Ferrantiego na kablach (standard tylko przy 200 A) + cewka wybijakowa; CABLE_HEAD (przepusty ze wskazaniem napięcia) | napęd silnikowy; wyzwalacz podnapięciowy; combisensory; styki pomocnicze |
| **V20/V25** — High duty VCB (s. 33 obszar 7.5) | pole wyłącznikowe dużej mocy 20/25 kA | CB (próżniowy 630 A, sekwencja O–0,3s–CO–15s–CO, zdolność SPZ) + DS/ES trójpołożeniowy; CABLE_HEAD | przekaźniki REF/RET/RED; combisensory |
| **Sl** — Busbar sectionalizer (s. 37) | sprzęgło rozłącznikowe | LOAD_SWITCH + ES (dane techniczne: rozłącznik sekcjonujący + uziemnik) | — (katalog podaje głównie dane techniczne) |
| **Sv** — Busbar sectionalizer VCB (s. 38) | sprzęgło wyłącznikowe | CB (próżniowy 630 A) + DS/ES (trójpołożeniowy za wyłącznikiem); **Sv zawsze w parze z modułem wzniosu szynowego (Br)** | przekaźnik zabezpieczeniowy (wymaga modułu pomiarowego); cewki; napęd silnikowy |
| **Sv20/Sv25** (s. 39) | sprzęgło wyłącznikowe 20/25 kA | jw. (wariant o podwyższonych parametrach) | jw. |
| **D** — Direct cable connection (s. 40) | przyłącze kablowe bezpośrednie | CABLE_HEAD (tylko przyłącze; bez łącznika) | przepusty do zewn. szyn; combisensory |
| **De** — Direct cable connection with ES (s. 41–42) | przyłącze bezpośrednie z uziemnikiem | ES + CABLE_HEAD (przepusty Interface C ze wskazaniem napięcia) | przepusty do prób kabla; combisensory |
| **Be** — Busbar earthing (s. 43) | uziemianie szyn zbiorczych | ES (na szynach) | rozwiązanie łukoochronne |
| **CB** — Circuit-breaker module (s. 44–45) | pole wyłącznikowe pełne (dopływ/rozdział) | CB (próżniowy 630/1250 A, SPZ, cewki zamykająca+wyzwalająca) + DS + ES; przepusty do zewnętrznych szyn; przedział nn z przekaźnikami zabezpieczeniowymi | napęd silnikowy DS/ES i CB |
| **M** — Metering (s. 46–47) | pole pomiarowe | 2 lub 3× CT + 3× VT (jednobiegunowe, DIN 42600 Narrow), przedział powietrzny; 6 przepustów Interface C z zewn. szynami do modułów SafePlus po obu stronach; przedział nn (MCB 3-bieg. dla napięcia pomiarowego, MCB 1-bieg. dla napięcia ziemnozwarciowego, rezystor tłumiący ferrorezonans, listwy CT, miejsce na licznik) | bezpieczniki pierwotne VT (FUSE — **opcja**); woltomierz/amperomierz; wersja „tylko pomiar napięcia"; wersja bez VT/CT |
| **Mt** — Metering tariff (s. 48) | pole pomiarowe taryfowe | 3× CT + 3× VT (DIN 42600 Narrow); kabel dół-wejście/wyjście (3 warianty); CABLE_HEAD (konektory Elastimold/3M/Raychem itd.) | — |
| 7.15 Side metering (s. 49–50) | pomiar boczny (VT) | 3× VT jednofazowe ELEQ UGECAK; przepusty Interface C | 1× VT międzyfazowy Arteche VEG-24 (tylko 24 kV); VDS/VPIS |

Uwaga: `SURGE_ARRESTER` w SafeRing/SafePlus jest **opcją montowaną w przedziale kablowym** (pokrywa przedziału kablowego standardowo przewiduje SA lub drugi kabel; szyna uziemiająca dla SA — opcja; s. 20).

---

## 2. Siemens 8DJH (RMU SF6, do 24 kV)

**Źródło:** „Switchgear Type 8DJH for Secondary Distribution Systems up to 24 kV, Gas-Insulated" — Katalog Siemens HA 40.2 (stopka: HA 40.2 · 2022; metadane pliku: Edition 2017), 36 s.
URL: https://assets.new.siemens.com/siemens/assets/api/uuid:60f3dbd7588876438a66d3503921eedeadc95ad2/8djhcompact-en-cataloge.pdf
Odczytane strony: 10–13 (schematy jednokreskowe pól pojedynczych i pomiaru rozliczeniowego — odczyt wizualny), 14 (bloki 2/3/4-polowe), 19–21 (opis konstrukcji i wyposażenia).

Legenda producenta: na marginesach s. 10–13 katalog zawiera **własną legendę symboli** (three-position switch-disconnector, make-proof earthing switch, HV HRC fuse, capacitive voltage detecting system, cable connection outside cone, surge arrester/limiter, ring-core current transformer, plug-in voltage transformer, vacuum circuit-breaker, three-position disconnector) — odnotowano jako legendę symboli, odrębną od składu. Na s. 14 katalog pisze wprost: „Components shown in dotted lines can be used optionally" (elementy rysowane linią przerywaną/w ramkach ze strzałką = opcyjne).

### 2.1 Pola pojedyncze (s. 10–12, schematy jednokreskowe)

| Typ | Szer. | Funkcja (PL) | Skład wg schematu (standard) | Elementy opcyjne pokazane przy schemacie |
|---|---|---|---|---|
| **K** | 310 mm | pole kablowe (przyłączeniowe, bez łącznika) | CABLE_HEAD + pojemnościowy wskaźnik napięcia | SURGE_ARRESTER, CT (Ferrantiego na kablu) |
| **K(E)** | 430 mm | pole kablowe z uziemnikiem szybkim | ES (make-proof) + CABLE_HEAD + wskaźnik napięcia | SURGE_ARRESTER, CT Ferrantiego |
| **R** | 310 mm | pole liniowe pierścieniowe (rozłącznikowe) | LOAD_SWITCH trójpołożeniowy (funkcje rozłącznika+odłącznika) z ES make-proof (pozycje CLOSED–OPEN–EARTHED; opis s. 19) + CABLE_HEAD + wskaźnik napięcia | SURGE_ARRESTER, CT Ferrantiego |
| **R(500)** | 500 mm | pole liniowe z pomiarem | jak R | VT wtykowy 4MT3 (na szynach i/lub kablu), CT 4MC63, CT Ferrantiego, SURGE_ARRESTER |
| **T** | 430 mm | pole transformatorowe (rozłącznik z bezpiecznikami) | LOAD_SWITCH+FUSE (kombinacja rozłącznik–bezpieczniki wg IEC 62271-105, trójpołożeniowa, wskaźnik zadziałania wkładki na froncie; s. 19) + ES + CABLE_HEAD (przyłącze wtykowe typ A standard w polach transformatorowych; s. 19) + wskaźnik napięcia | SURGE_ARRESTER, CT Ferrantiego |
| **L** | 430 mm | pole wyłącznikowe | CB (próżniowy) + DS (odłącznik trójpołożeniowy z uziemieniem) + CABLE_HEAD (przyłącze śrubowe typ C standard; s. 19) + wskaźnik napięcia | SURGE_ARRESTER, CT Ferrantiego |
| **L(500)** | 500 mm | pole wyłącznikowe z pomiarem | jak L | VT 4MT3, CT 4MC63, CT Ferrantiego |
| **S** | 430 mm | sprzęgło (sekcjonowanie szyn rozłącznikiem) | LOAD_SWITCH trójpołożeniowy z ES w moście szynowym | — |
| **S(500)** | 500 mm | sprzęgło z pomiarem | jak S | VT 4MT3, wskaźnik napięcia, CT Ferrantiego |
| **S(620)** | 620 mm | sprzęgło (szersze, pełny most) | LOAD_SWITCH trójpołożeniowy z ES | — |
| **H** | 430 mm | sprzęgło z bezpiecznikami | LOAD_SWITCH+FUSE + ES w moście szynowym | — |
| **V** | 500 mm | sprzęgło wyłącznikowe | CB (próżniowy, wariant 1.1 lub 2) + DS trójpołożeniowy z ES + VT 4MT3 | wariant „design option with current transformer": + CT Ferrantiego + wskaźnik napięcia |
| **E** | 310 mm | uziemianie szyn zbiorczych | ES (make-proof, na szynach) | — |
| **E(500)** | 500 mm | uziemianie szyn + pomiar napięcia | ES + VT 4MT3 | — |
| **M(430)** | 430 mm | pomiar napięcia szyn (za bezpiecznikami) | FUSE (HV HRC) + VT wtykowy 4MT3 + element uziemiający wg schematu | — |
| **M (840 mm)** | 840 mm | pole pomiarowe rozliczeniowe (przedział powietrzny) | CT (żywiczne) + VT (żywiczne) w 4 układach przyłączy (kabel z lewej / z prawej / szyny z obu stron / kable z obu stron) + stałe punkty uziemienia szyn + wskaźnik napięcia (s. 13) | liczba i pozycje CT/VT wg wariantu (s. 13) |

Wyposażenie przedziału kablowego wspólne (s. 19): przepusty wg DIN EN 50181 (stożek zewnętrzny; śrubowe M16 typ C — standard w polach K/R/L; wtykowe typ A — standard w polach T); możliwe do podłączenia: głowice kątowe/T (CABLE_HEAD), CT Ferrantiego wg IEC 61869-1/-2 na kablach, sensory prądu wg IEC 61869-10, sensory napięcia (dzielnik rezystancyjny) wg IEC 61869-11 na wtykach, SURGE_ARRESTER. Napędy: ręczne, opcjonalnie silnikowe (s. 19).

### 2.2 Bloki typowe RMU (s. 14)

2-polowe: KT, K(E)T, RR, RT, RL, TT; 3-polowe: RRR, RRT, RRL, TTT; 4-polowe: RRRR, RRRT, RRRL, TRRT; bloki rozszerzalne: RRT-R (3R+1T), RRT-RRT (4R+2T). (Oznaczenia = sekwencje pól z 2.1.)

---

## 3. Schneider Electric SM6 (SM6-24 / SM6-36)

**Źródło:** „SM6 modular units — Air insulated switchgear up to 36kV, Medium Voltage Distribution, 2017 Catalog" (Schneider Electric; plik utworzony 2018-09), 156 s.; kopia hostowana przez dystrybutora Filkab.
URL: https://filkab-eng.com/uploads/products/30/pdf/5f27c0379e84a_SM6%202017.pdf
Odczytane strony: 24 (lista jednostek), 25 (przegląd funkcji ochronnych), 44–48 i 54–56, 58–59 (karty jednostek z sekcjami „Basic equipment / Versions / Option" — odczyt wizualny).

Katalog **jawnie rozróżnia** „Basic equipment" (standard), „Versions" (warianty) i „Option". Przy każdej jednostce jest schemat jednokreskowy producenta (elementy rysowane linią przerywaną na schematach = wyposażenie nie zawsze obecne; katalog nie opisuje tej konwencji wprost — skład podano niżej wg list tekstowych „Basic equipment", nie wg samego rysunku).

Lista jednostek (s. 24): IM, IMC, IMB, IMM (rozłącznikowe); PM (rozłącznik z bezpiecznikami); QM, QMC, QMB (kombinacja rozłącznik-bezpieczniki); CVM (stycznikowe); DM1-M, DM1-A, DM1-D, DM1-S (wyłącznik SF6, pojedyncza izolacja, wysuwny/„disconnectable"); DMV-A, DMV-D, DMVL-A, DMVL-D (wyłącznik próżniowy); DM1-W, DM1-Z (wyłącznik SF6 wysuwny, SM6-24); DM2 (podwójna izolacja); CM, CM2 (pomiar napięcia); GBC-A, GBC-B (pomiar prądu i/lub napięcia); NSM-cables / NSM-busbars (SZR); GIM, GEM, GBM (szynowe/łącznikowe); GAM2, GAM (przyłącze kablowe); SM (odłącznikowa); TM (transformator potrzeb własnych); EMB (uziemianie szyn, tylko SM6-24).

### 3.1 Jednostki odczytane w szczegółach

| Kod | Funkcja (PL) | Basic equipment (standard) | Opcje istotne dla składu |
|---|---|---|---|
| **IM** (s. 44) | pole liniowe (rozłącznikowe) | LOAD_SWITCH + ES; szyny 3-faz.; napęd CIT; przyłącza kabli suchych (CABLE_HEAD); wskaźnik obecności napięcia | motor napędu; styki pomocnicze; cewki; **SURGE_ARRESTER** (SM6-36 i SM6-24 w celce 500 mm); amperomierz cyfrowy; wskaźniki zwarć doziemnych; szyny 1250 A; detekcja łuku |
| **IMC** (s. 44) | pole liniowe z pomiarem prądu | jak IM + **1–3× CT** (SM6-24; 3× CT dla SM6-36) | jak IM |
| **IMB** (s. 44) | pole liniowe odpływ dołem w prawo/lewo | jak IM + dolne szyny 3-faz. dla odpływu | jak IM |
| **IMM** (s. 44) | pole rozłącznikowo-pomiarowe (nowość) | jak IM + **3× CT**; ochrona przez Sepam | 3× VT; przyłącze 630 A od góry |
| **NSM-cables / NSM-busbars** (s. 45) | układ SZR (zasilanie podstawowe+rezerwowe) | 2× LOAD_SWITCH + 2× ES; szyny; CABLE_HEAD; wskaźnik napięcia; blokada mechaniczna; napęd silnikowy CI2 z cewkami; automatyka T200 S | styki pomocnicze, blokady kluczykowe |
| **QM** (s. 46) | pole transformatorowe: kombinacja rozłącznik-bezpieczniki | LOAD_SWITCH+FUSE (z wybijakami DIN) + ES + **dolny ES o zdolności załączania 2 kA**; napęd CI1; wskaźnik napięcia; sygnalizacja mechaniczna przepalenia wkładki; CABLE_HEAD | motor; styk pomocniczy przepalenia wkładki; cewki; amperomierz; detekcja łuku; wkładki UTE (wersja) |
| **QMC** (s. 46) | jw. + pomiar prądu | jak QM + 1–3× CT (SM6-24) | jak QM |
| **QMB** (s. 46) | jw., odpływ dołem prawo/lewo | jak QM + dolne szyny odpływowe | jak QM |
| **PM** (s. 47) | rozłącznik z bezpiecznikami (bez kombinacji) | LOAD_SWITCH + ES + FUSE (3× wkładki z wybijakiem UTE dla SM6-24 lub DIN) + dolny ES 2 kA; napęd CIT; wskaźnik napięcia; CABLE_HEAD | motor; amperomierz; sygnalizacja przepalenia (opcja mechaniczna); detekcja łuku |
| **DM1-A** (s. 48) | pole wyłącznikowe SF6 (pojedyncza izolacja) | CB (SF1 „disconnectable") + DS + ES; napęd wyłącznika RI; napęd odłącznika CS; wskaźnik napięcia; dolny ES (2 kA przy 630 A, 25 kA przy 1250 A); styki pomocnicze CB; blokada mechaniczna CB–DS; CABLE_HEAD | **cubicle:** Sepam, 3× VT, SURGE_ARRESTER, styki DS, blokady kluczykowe; detekcja łuku; wersja LPCT; wersje SFset/SF1 |
| **DM1-D** (s. 48) | jw., odpływ prawo/lewo | jak DM1-A + dolne szyny 3-faz. | jak DM1-A |
| **DM1-M** (s. 48) | pole wyłącznikowe z pomiarem (nowość) | jak DM1-A + **3× CT** | jak DM1-A |
| **CM** (s. 54) | pomiar napięcia (sieć z uziemionym punktem neutralnym) | DS + ES; napęd CS; **FUSE: 3× wkładki 6,3 A UTE/DIN** + **3× VT (faza–ziemia)**; wyłącznik izolacyjny nn; bezpieczniki nn | styki pomocnicze; sygnalizacja przepalenia wkładek; detekcja łuku |
| **CM2** (s. 54) | pomiar napięcia (sieć izolowana) | jak CM, ale **2× VT (międzyfazowe)** | jak CM |
| **GBC-A** (s. 55) | pomiar prądu i/lub napięcia w torze (odpływ prawo/lewo) | **1–3× CT** (SM6-24; 3× dla SM6-36); mostki; szyny | **3× VT (f–z) lub 2× VT (międzyfaz.)** dla SM6-24; detekcja łuku |
| **GBC-B** (s. 55) | jw., w torze szyn | jak GBC-A | jak GBC-A |
| **GBM** (s. 56) | jednostka łącznikowa (odpływ prawo/lewo) | mostki + szyny (bez aparatów łączeniowych) | detekcja łuku |
| **GIM** (s. 56) | wstawka szynowa pośrednia | obudowa metalowa (tylko szyny) | — |
| **GAM2** (s. 58) | przyłącze kablowe dopływowe | szyny; wskaźnik napięcia; CABLE_HEAD; mostki (bez aparatu) | wskaźnik zwarć doziemnych; amperomierz; SURGE_ARRESTER (SM6-24/36) |
| **GAM** (s. 58) | przyłącze kablowe dopływowe z uziemnikiem | jak GAM2 + **dolny ES 25 kA** (napęd CC dla SM6-24 / CS dla SM6-36) | jak GAM2 + styki pomocnicze, blokady kluczykowe |
| **SM** (s. 59) | pole odłącznikowe | DS + ES; napęd CS; wskaźnik napięcia; CABLE_HEAD | styki pomocnicze; blokady kluczykowe; SURGE_ARRESTER (SM6-36); detekcja łuku |
| **TM** (s. 59) | transformator potrzeb własnych SN/nn | FUSE (2× 6,3 A UTE/DIN) + **1× VT międzyfazowy** (jako trafo potrzeb własnych) + wyłącznik izolacyjny nn | sygnalizacja przepalenia wkładek |
| **EMB** (s. 59) | uziemianie szyn (tylko SM6-24) | ES + mostki 3-faz.; napęd CIT; montaż na IM 375 mm lub DM1-A; wymaga blokad kluczykowych | styki pomocnicze |

Jednostki CVM (s. 53), DMV-A/D (s. 51), DMVL-A/D (s. 52), DM1-S/DM2 (s. 49), DM1-W/DM1-Z (s. 50), GEM/GFM/GUM/GMM (s. 57) istnieją w katalogu na wskazanych stronach — składu nie ekstrahowano w tej sesji (patrz „Nieosiągalne/ograniczenia").

---

## 4. ABB UniGear ZS1 (rozdzielnica pierwotna, przedziałowa, do 24 kV)

**Źródło:** „UniGear ZS1 — Medium-voltage air-insulated switchgear up to 24 kV" (ABB, Distribution Solutions), 108 s.; kopia z serwisu electrika.com (dokument ABB).
URL: https://storage.electrika.com/manu/man-9031/pdftech/9031-unigr-zs1-17.pdf
Odczytane strony: 82 (schematy jednokreskowe typical units — odczyt wizualny), 83 (legenda symboli graficznych producenta), 84–85 (tabele dostępności jednostek wg parametrów).

**Legenda składu na schematach (s. 82):** „Key to components: Standard components / Accessories / Alternative solutions" — trzy odcienie linii (czarny = standard, ciemnoszary = akcesoria, jasnoszary = rozwiązania alternatywne). **Uwaga uczciwościowa:** rozróżnienie dwóch odcieni szarości na skanie bywa niepewne; niżej elementy czarne oznaczono jako standard, a wszystkie szare łącznie jako „akcesoria/alternatywy", bez rozstrzygania odcienia tam, gdzie nie było to jednoznaczne.

**Legenda symboli producenta (s. 83, „Graphical symbols"):** circuit-breaker, contactor, switch-disconnector, disconnector, isolating bar, socket and plug (styki wtykowe członu wysuwnego), voltage transformers, current transformers, fuse, earth, cable entry, busbar entry, current sensor, voltage sensor — odnotowano jako odrębną legendę symboli (nie skład).

### 4.1 Jednostki typowe (typical units, s. 82; dostępność prądowa s. 84–85)

| Kod | Funkcja (PL) | Skład standardowy (czarny na schemacie) | Akcesoria/alternatywy (szare na schemacie) |
|---|---|---|---|
| **IF** — Incoming/outgoing feeder | pole dopływowe/odpływowe z wyłącznikiem wysuwnym | CB próżniowy **wysuwny** (styki wtykowe góra+dół), CT, CABLE_HEAD (cable entry) | ES; VT na kablu; **wysuwny VT z FUSE**; wariant sensorowy: current sensor + voltage sensor (osobny schemat, s. 81–82) |
| **OFM** — Outgoing with BB measurement | odpływ z pomiarem na szynach | jak IF + VT z FUSE na szynach (schemat s. 81) | jw. |
| **BT** — Bus-tie | sprzęgło wyłącznikowe | CB próżniowy wysuwny + CT; szyny obu sekcji | ES; VT z FUSE; sprzęgło wymaga pary z polem wzniosu R („bus-tie riser configuration", tekst katalogu przy opisie prób kablowych) |
| **R** — Riser | wznios szynowy | tor szynowy (busbar riser) | VT; ES |
| **RM** — Riser with measurements | wznios szynowy z pomiarem | tor szynowy + **wysuwny VT z FUSE** | ES |
| **M** — Measurements | pole pomiarowe | **wysuwny VT z FUSE** | ES (szyn) |
| **IFD** — Direct incoming/outgoing feeder | dopływ/odpływ bezpośredni (bez wyłącznika) | CABLE_HEAD (tor bezpośredni) | CT; VT; wysuwny VT z FUSE; ES |
| **IFDM** — Direct feeder with measurements | jw. z pomiarem | CABLE_HEAD + CT/VT pomiarowe (wg schematu) | wysuwny VT z FUSE; ES |
| **DF** — Switch-disconnector unit | pole rozłącznikowe z bezpiecznikami | LOAD_SWITCH (switch-disconnector) + FUSE + ES + CABLE_HEAD | isolating bar (wstawka izolacyjna) |
| **IFC** — Contactor panel | pole stycznikowe (silnikowe) | stycznik (wg tabeli s. 84–85 i symbolu s. 83; schemat jednostki nie był na s. 82) | — |

Dostępność (s. 84–85): IF/BT 630–4000 A; R/RM 1250–4000 A; M 630 A; IFD/IFDM 1250–4000 A; DF 630 A (wykonanie 12–17,5 kV, 31,5 kA); IFC 400 A (650 mm). Szerokości celek 650/800/1000 mm, wysokość 2200/2595 mm.

Struktura celki (s. 81): przedział szynowy, przedział aparatowy (człon wysuwny), przedział kablowy, przedział obwodów wtórnych (LV) z przekaźnikiem IEC 61850; sensory prądu/napięcia jako alternatywa dla przekładników konwencjonalnych.

---

## 5. Elektrometal Energetyka e²ALPHA

**Źródła:**
1. „Rozdzielnica średniego napięcia e²ALPHA — Karta katalogowa K-1.2.2", 8 s. — https://www.elektrometal-energetyka.pl/wp-content/uploads/2019/09/Karta-katalogowa-e2ALPHA-K-1.2.2.pdf (odczyt: s. 5 „Podstawowe rodzaje celek", s. 6 blokady, s. 7 parametry).
2. „Rozdzielnica dwusystemowa średniego napięcia e²ALPHA-2S — Karta katalogowa K-11.1.1", 8 s. — https://elektrometal-energetyka.pl/wp-content/uploads/2019/03/karta_katalogowa_e2alpha-2s_0-1.pdf (odczyt: sekcja „Podstawowe rodzaje celek", blokady).
3. „ROZWIĄZANIA Elektrometal Energetyka SA — Katalog K-0.2.11", 96 s. — https://elektrometal-energetyka.pl/wp-content/uploads/2026/02/Rozwiazania-0.2.11.pdf (odczyt: tabela „Podstawowe rodzaje celek" z dostępnością per e²ALPHA / e²ALPHA-2S / e²ALPHA-G, s. ~21–22; parametry; sekcja wyłączników e²BRAVO).

### 5.1 Typy pól (katalogowe listy typów)

Katalog K-0.2.11 (tabela „Podstawowe rodzaje celek") — dostępność wg rodziny:

| Typ pola (nazwa producenta, PL) | e²ALPHA | e²ALPHA-2S | e²ALPHA-G |
|---|---|---|---|
| pole zasilające | • | • | • |
| pole liniowe | • | • | • |
| pole dopływowo-odpływowe | • | • | • |
| pole sprzęgłowe – wyłącznikowe | • | • | • |
| pole sprzęgłowe – odcinacza | • | • | • |
| pole transformatora potrzeb własnych (wyłącznikowe lub rozłącznikowe) | • | • | • |
| pole pomiaru napięcia | • | • | • |
| pole wzniosu szynowego | • | • | • |
| pole pomiarowe z przekładnikami napięciowymi dla jednego systemu | – | • | – |
| pole pomiarowe z przekładnikami napięciowymi dla obu systemów | – | • | – |
| pole sprzęgła poprzecznego | – | • | – |
| pole sprzęgła podłużnego | • | • | • |
| pole silnikowe | • | • | • |
| pole silnikowe x2 (1 odpływ zasilający, 2 silniki) | • | • | • |
| pole silnikowe z członem suszenia | • | • | • |
| pole tłumienia ferrorezonansu | • | • | • |
| pole odpływowe rozłącznikowe | • | – | – |
| pole potrzeb własnych / koncentratora / obwodów separacji | • | • | • |
| inne – wg potrzeb Klienta | • | • | • |

Karta K-1.2.2 (s. 5) podaje krótszą listę dla e²ALPHA 1-systemowej (pole zasilające, liniowe, dopływowo-odpływowe, sprzęgłowe–wyłącznikowe, sprzęgłowe–odcinacza, transformatora potrzeb własnych wyłącznikowe/rozłącznikowe, pomiaru napięcia, wzniosu szynowego, inne) z zastrzeżeniem producenta: „Przedstawione rodzaje celek stanowią tylko przykład typowych układów… istnieje możliwość szerokiej rozbudowy infrastruktury technicznej pola o dodatkowe łączniki, przekładniki, ograniczniki przepięć oraz inne elementy zgodne z wymaganiami zamawiającego."

### 5.2 Skład aparatowy — czego katalog NIE publikuje

**Publiczne karty katalogowe e²ALPHA NIE zawierają tabeli składu aparatowego per typ pola ani schematów jednokreskowych typowych pól** (odczytano całość tekstu K-1.2.2, K-11.1.1 i odpowiednie sekcje K-0.2.11). Fakty o aparatach, które karty podają pośrednio:
- konstrukcja przedziałowa z **członem wysuwnym** (wyłącznikowym) — blokady standardowe opisują pozycje PRACA/PRÓBA członu wysuwnego, uziemnik (ES) i drzwi przedziału kablowego (K-1.2.2 s. 6; K-11.1.1);
- wyłącznik: własny **CB próżniowy e²BRAVO** (stacjonarny — „Schemat 01"; wysuwny — „Schematy 11; 12; 31; 32"), 630–4000 A, do 40 kA (K-0.2.11, rozdz. wyłączników, s. ~27–29);
- e²ALPHA-2S: pole 2-systemowe zawiera przedziały odłącznika systemu I i II (DS), przedział wyłącznikowy i przedział przyłączowy/kablowy (K-11.1.1, opis konstrukcji);
- przedział kablowy „ponad 550 mm" umożliwia montaż różnych typów przekładników Ferrantiego (CT) (K-1.2.2 s. 4-5);
- rozbudowa o „dodatkowe łączniki, przekładniki, ograniczniki przepięć" — jako klauzula ogólna, bez przypisania standard/opcja per pole (K-1.2.2 s. 5).

Wniosek dla Reference Profile: dla e²ALPHA można katalogowo ustalić **listę typów pól i nazwy funkcji**, ale skład aparatowy per typ pola musi pochodzić z DTR/projektu wykonawczego lub zapytania do producenta — **nie należy go uzupełniać z pamięci ani przez analogię do innych producentów**.

---

## Nieosiągalne / ograniczenia

1. **Schneider „Modular units SM6-24" AMTED398078EN (katalog 2006)** — URL https://www.studiecd.dk/pdfs/Kap_13/MV_Anlaeg/SM6_anlaeg/amted398078en.pdf zwrócił dokument HTML zamiast PDF (blokada/przekierowanie hosta). Zastąpiono oficjalnym katalogiem SM6 2017 (obejmuje SM6-24 i SM6-36; sekcje „Basic equipment" rozróżniają parametry per SM6-24/36).
2. **SM6: jednostki CVM, DMV-A/D, DMVL-A/D, DM1-S, DM1-W, DM1-Z, DM2, GEM/GFM/GUM/GMM** — obecne w katalogu (s. 49–53, 57), ale ich kart nie odczytano w tej sesji (ograniczenie zakresu, nie dostępności); strony wskazane do ewentualnego uzupełnienia.
3. **Elektrometal e²ALPHA** — brak publicznej tabeli składu aparatowego per typ pola (patrz 5.2). DTR rozdzielnicy e²ALPHA nie znaleziono publicznie (wyszukiwarka zwraca DTR uziemnika e²DELTA: https://elektrometal-energetyka.pl/wp-content/uploads/2021/01/DTR-e2DELTA-nr-D-14.1.1-PL.pdf — nie pobierano, poza zakresem).
4. **UniGear ZS1** — rozróżnienie „Accessories" vs „Alternative solutions" (dwa odcienie szarości na s. 82) miejscami nierozróżnialne na renderze; w raporcie połączono je w jedną klasę „akcesoria/alternatywy". Starszy dokument ABB M23724E (10 s.) pobrano, ale nie wykorzystano (nowszy katalog pełniejszy).
5. Katalog Siemens HA 40.2 pobrany z oficjalnego assets.new.siemens.com ma 36 stron (metadane „Edition 2017", stopka „2022"); istnieje też obszerniejsza edycja HA 40.2 — do składu pól wystarczyła pobrana wersja (schematy pól kompletne).

## Rozróżnienie: skład vs symbolika

Zgodnie z zadaniem raportowano **skład aparatowy**. Katalogi zawierające także **legendę symboli graficznych producenta** (do przyszłych wzorników): Siemens 8DJH — marginesy s. 10–13; ABB UniGear ZS1 — s. 83 („Graphical symbols"); Schneider SM6 — symbole na kaflach jednostek (bez wydzielonej strony legendy w odczytanych sekcjach); ABB SafeRing — schematy konfiguracji s. 21–22 (bez wydzielonej legendy w odczytanych sekcjach).

---

## Tabela zbiorcza

| Rodzina | Kod celki | Funkcja (PL) | Skład (standard; O= opcja) | Źródło (dok., strona) |
|---|---|---|---|---|
| ABB SafeRing/SafePlus | C | liniowa | LOAD_SWITCH+ES, CABLE_HEAD; O: CT/VT-sensory | ABB 9AKK107492A6537, s. 26–28 |
| ABB SafeRing/SafePlus | F | transformatorowa bezpiecznikowa | LOAD_SWITCH+FUSE, 2×ES, CABLE_HEAD | jw., s. 29–31 |
| ABB SafeRing/SafePlus | V | wyłącznikowa | CB(200/630A)+DS/ES, CT(Ferranti, std przy 200A), CABLE_HEAD | jw., s. 32–34 |
| ABB SafeRing/SafePlus | V20/V25 | wyłącznikowa 20/25 kA | CB(630A)+DS/ES, CABLE_HEAD | jw., s. 33 (7.5) |
| ABB SafeRing/SafePlus | Sl | sprzęgło rozłącznikowe | LOAD_SWITCH+ES | jw., s. 37 |
| ABB SafeRing/SafePlus | Sv (Sv20/25) | sprzęgło wyłącznikowe | CB+DS/ES (+moduł Br) | jw., s. 38–39 |
| ABB SafeRing/SafePlus | D | przyłącze bezpośrednie | CABLE_HEAD | jw., s. 40 |
| ABB SafeRing/SafePlus | De | przyłącze bezpośrednie z uziemnikiem | ES, CABLE_HEAD | jw., s. 41–42 |
| ABB SafeRing/SafePlus | Be | uziemianie szyn | ES | jw., s. 43 |
| ABB SafeRing/SafePlus | CB | wyłącznikowa pełna | CB(630/1250A)+DS+ES, przekaźniki nn | jw., s. 44–45 |
| ABB SafeRing/SafePlus | M | pomiarowa | 2–3×CT, 3×VT; O: FUSE(VT) | jw., s. 46–47 |
| ABB SafeRing/SafePlus | Mt | pomiarowa taryfowa | 3×CT, 3×VT, CABLE_HEAD | jw., s. 48 |
| ABB SafeRing (RMU) | DeF/CCF/CCCF/CCFF/DeV/CCV/CCCV/CCVV/CCC/CCCC | konfiguracje RMU | sekwencje modułów C/F/V/De | jw., s. 20–22 |
| Siemens 8DJH | K / K(E) | kablowa (z uziemnikiem) | CABLE_HEAD (+ES w K(E)); O: SURGE_ARRESTER, CT | HA 40.2, s. 10 |
| Siemens 8DJH | R / R(500) | liniowa pierścieniowa | LOAD_SWITCH(3-poz.)+ES, CABLE_HEAD; O: SA, CT; R(500): O VT/CT | HA 40.2, s. 10, 19 |
| Siemens 8DJH | T | transformatorowa | LOAD_SWITCH+FUSE+ES, CABLE_HEAD; O: SA, CT | HA 40.2, s. 10, 19 |
| Siemens 8DJH | L / L(500) | wyłącznikowa | CB+DS(3-poz. z uziem.), CABLE_HEAD; O: SA, CT; L(500): O VT/CT | HA 40.2, s. 11 |
| Siemens 8DJH | S / S(500) / S(620) | sprzęgło rozłącznikowe | LOAD_SWITCH+ES; S(500): O VT/CT | HA 40.2, s. 11 |
| Siemens 8DJH | H | sprzęgło z bezpiecznikami | LOAD_SWITCH+FUSE+ES | HA 40.2, s. 11 |
| Siemens 8DJH | V | sprzęgło wyłącznikowe | CB+DS+ES, VT; O: CT | HA 40.2, s. 12 |
| Siemens 8DJH | E / E(500) | uziemianie szyn | ES; E(500): +VT | HA 40.2, s. 12 |
| Siemens 8DJH | M(430) | pomiar napięcia szyn | FUSE+VT(+uziemienie wg schematu) | HA 40.2, s. 12 |
| Siemens 8DJH | M (840) | pomiarowa rozliczeniowa | CT+VT (żywiczne, 4 układy), punkty uziemienia szyn | HA 40.2, s. 13 |
| Siemens 8DJH | KT…RRT-RRT | bloki RMU | sekwencje K/R/T/L | HA 40.2, s. 14 |
| Schneider SM6 | IM/IMC/IMB/IMM | liniowa (rozłącznikowa) | LOAD_SWITCH+ES, CABLE_HEAD; IMC/IMM: +CT; O: SA, VT(IMM) | SM6 2017, s. 44 |
| Schneider SM6 | NSM | SZR (2 dopływy) | 2×(LOAD_SWITCH+ES), automatyka T200S | SM6 2017, s. 45 |
| Schneider SM6 | QM/QMC/QMB | transformatorowa (komb. rozł.-bezp.) | LOAD_SWITCH+FUSE+ES+ES(dolny 2kA), CABLE_HEAD; QMC: +CT | SM6 2017, s. 46 |
| Schneider SM6 | PM | rozłącznik z bezpiecznikami | LOAD_SWITCH+ES+FUSE+ES(dolny), CABLE_HEAD | SM6 2017, s. 47 |
| Schneider SM6 | DM1-A/D/M | wyłącznikowa SF6 | CB+DS+ES+ES(dolny), CABLE_HEAD; DM1-M: +3×CT; O: Sepam, 3×VT, SA | SM6 2017, s. 48 |
| Schneider SM6 | CM / CM2 | pomiar napięcia | DS+ES, FUSE(3×6,3A), 3×VT(f–z) / 2×VT(międzyfaz.) | SM6 2017, s. 54 |
| Schneider SM6 | GBC-A / GBC-B | pomiar prądu/napięcia | 1–3×CT; O: 2–3×VT | SM6 2017, s. 55 |
| Schneider SM6 | GBM / GIM | łącznikowa / wstawka szynowa | mostki/szyny (bez aparatów) | SM6 2017, s. 56 |
| Schneider SM6 | GAM2 / GAM | przyłącze dopływowe | CABLE_HEAD (+ES 25 kA w GAM); O: SA | SM6 2017, s. 58 |
| Schneider SM6 | SM | odłącznikowa | DS+ES, CABLE_HEAD | SM6 2017, s. 59 |
| Schneider SM6 | TM | trafo potrzeb własnych | FUSE(2×6,3A)+1×VT(międzyfaz.) | SM6 2017, s. 59 |
| Schneider SM6 | EMB | uziemianie szyn (SM6-24) | ES | SM6 2017, s. 59 |
| ABB UniGear ZS1 | IF | dopływ/odpływ z CB wysuwnym | CB(wysuwny)+CT+CABLE_HEAD; O: ES, VT, VT+FUSE(wysuwny), sensory | UniGear ZS1, s. 82, 84–85 |
| ABB UniGear ZS1 | OFM | odpływ z pomiarem szyn | jak IF + VT+FUSE na szynach | jw., s. 81–82 |
| ABB UniGear ZS1 | BT | sprzęgło | CB(wysuwny)+CT (para z R) | jw., s. 82 |
| ABB UniGear ZS1 | R / RM | wznios szynowy (z pomiarem) | szyny; RM: +VT+FUSE(wysuwny); O: ES, VT | jw., s. 82 |
| ABB UniGear ZS1 | M | pomiarowa | VT+FUSE(wysuwny); O: ES | jw., s. 82 |
| ABB UniGear ZS1 | IFD / IFDM | dopływ/odpływ bezpośredni | CABLE_HEAD; IFDM: +CT/VT; O: ES | jw., s. 82 |
| ABB UniGear ZS1 | DF | rozłącznikowa z bezpiecznikami | LOAD_SWITCH+FUSE+ES+CABLE_HEAD | jw., s. 82 |
| ABB UniGear ZS1 | IFC | stycznikowa | stycznik (wg tabeli, 400 A) | jw., s. 84–85 |
| Elektrometal e²ALPHA | (nazwy PL, bez kodów) | zasilające, liniowe, dopływowo-odpływowe, sprzęgłowe (wył./odcinacza/podłużne/poprzeczne-2S), pomiaru napięcia, pomiarowe VT (2S), wzniosu, tr. potrzeb własnych, silnikowe (x2, z suszeniem), tłumienia ferrorezonansu, odpływowe rozłącznikowe, potrzeb własnych | **skład per typ pola niepublikowany** (człon wysuwny z CB e²BRAVO, ES, DS systemowe w 2S — pośrednio z opisów blokad/konstrukcji) | K-1.2.2 s. 5–6; K-11.1.1; K-0.2.11 s. ~21–22, 27–29 |

## Pobrane pliki (scratchpad)

| Plik | Zawartość | Status |
|---|---|---|
| `safering_safeplus_12-24kV.pdf` | ABB SafeRing/SafePlus 12-24kV, katalog 9AKK107492A6537, 128 s. | OK, wykorzystany |
| `siemens_8djh_ha40-2.pdf` | Siemens 8DJH, Katalog HA 40.2, 36 s. | OK, wykorzystany |
| `sm6_2017.pdf` | Schneider SM6 modular units, 2017 Catalog, 156 s. | OK, wykorzystany |
| `unigear_zs1_catalogue.pdf` | ABB UniGear ZS1, katalog Distribution Solutions, 108 s. | OK, wykorzystany |
| `unigear_zs1_abb_m23724e.pdf` | ABB ZS1, starszy dokument M23724E, 10 s. | pobrany, niewykorzystany |
| `e2alpha_karta_k122.pdf` | Elektrometal e²ALPHA, Karta katalogowa K-1.2.2, 8 s. | OK, wykorzystany |
| `e2alpha_2s_karta.pdf` | Elektrometal e²ALPHA-2S, Karta katalogowa K-11.1.1, 8 s. | OK, wykorzystany |
| `elektrometal_rozwiazania_k0211.pdf` | Elektrometal „Rozwiązania", Katalog K-0.2.11, 96 s. | OK, wykorzystany |
| `sm6-24_catalogue_2006.pdf` | próba pobrania AMTED398078EN | NIEUDANE (HTML zamiast PDF) |

(Pliki `zeszyt1-3.pdf`, `telemechanika.pdf` w scratchpadzie pochodzą z wcześniejszych prac — nie należą do tego researchu.)
