# RED TEAM II — niezależny audyt fizyki zwarć i wiarygodności źródeł

**Data:** 2026-10-22 · **Stan:** P0 / nie scalać jako wdrożenia normy · **Charakter:** przegląd statyczny kodu + niezależny rachunek kontrolny; pełnej walidacji solvera nie wykonano.

## 1. Klasy dowodów

- **POTWIERDZONE ŹRÓDŁEM PIERWOTNYM:** IEC Webstore: publikacje 2016 i 2026; udostępniony przez Szwedzki Komitet Normalizacyjny oficjalny podgląd EN 60909-0:2016; wykaz EN w PKN.
- **POTWIERDZONE KODEM:** wprost obecne instrukcje, oznaczenia zmiennych i przepływy; nie są dowodem, że każdy przypadek używa danej ścieżki.
- **POTWIERDZONE MATEMATYCZNIE:** kontrprzykład lub obliczenie ręczne, bez uruchamiania produkcyjnego solvera.
- **HIPOTEZA / WYMAGA TESTU:** możliwy wpływ na produkcyjne wyniki konkretnej topologii.
- **NIEPOTWIERDZONE NORMOWO:** postanowienia 2026 bez pełnego tekstu; nigdy nie zapisywać jako implementowalne pewniki.

## 2. Krytyczne defekty i ryzyka kodu

### P0-IB — błędne znaczenie prądu wyłączalnego

- `backend/src/network_model/solvers/short_circuit_core.py:203`:
  `ib_a = ikss * sqrt(1 + ((kappa-1)*exp(-tb/ta))**2)`.
- `backend/src/application/solvers/short_circuit_binding.py:169` utrwala `tb_s = 0.1` i nazywa tę wartość domyślną IEC — niezweryfikowane.
- IEC 60909-0:2016 §3.9 oraz §9 definiują **symetryczny prąd wyłączalny** jako wartość skuteczną składowej okresowej w chwili rozdzielenia styków; udział składowej nieokresowej nie jest składnikiem definicji `I_b`. Analogicznie IEC 2026 §3.8 i §9.
- Dla zwarcia dalekiego od generatora, przy niezmiennej amplitudzie okresowej, `I_b=I''k` (dla odpowiedniej konfiguracji źródeł), podczas gdy implementacja daje wartość wyższą przy dodatniej składowej nieokresowej.
- **Niezależny kontrprzykład**: R/X=0.02, f=50 Hz, t_b=0.1 s: κ≈1.9429; T_a≈0.15915 s; wzór w kodzie daje `I_b/I''k ≈ 1.1194` (+11.94%). Dla t_b=0.02 s daje 1.3006 (+30.06%). Zmiana fizyki: odróżnić prąd symetryczny `I_b` od odrębnego prądu asymetrycznego/nieokresowego. Trzeba zwalidować rozkład przy źródłach synchronicznych, silnikach i przekształtnikach. Nie dokonywać uproszczonej „naprawy” `Ib = Ik''` dla wszystkich przypadków.

### P0-KCL — błędne uzasadnienie zachowania prawa Kirchhoffa w gałęziach

- `backend/src/network_model/solvers/short_circuit_iec60909.py:959, 967, 969–972, 1031–1040` oblicza udział gałęzi `f_mag=abs(fraction)`, klasyfikuje kierunek po porównaniu modułów napięć i sumuje `f_mag` jako dowód KCL.
- Rzeczywisty bilans dla prądów okresowych o fazorach jest równaniem **zespolonym** `Σ I_in - Σ I_out - I_shunt - I_source = 0`. Suma modułów nie jest prawem Kirchhoffa.
- Kontrprzykład ogólny: `I1=100∠0° A`, `I2=100∠120° A`, `|I1+I2|=100 A`, ale `|I1|+|I2|=200 A`. Wynik „KCL z modułów” jest o 100% wyższy niż moduł sumy.
- Kierunek prądu nie jest wyznaczany przez porównanie `|V_i|` i `|V_j|` w AC z niezerowym kątem. Wymagana konwencja orientacji gałęzi i prądy zespolone z pełnego modelu π, przekładnią i bocznikami.
- `short_circuit_iec60909.py:662` przekazuje z `Zkj/Zkk` wyłącznie moduł. To może być użyteczną normową aproksymacją wkładu RMS w określonym rachunku, ale **nie jest dowodem** spójności prądów zespolonych gałęzi.
- **Status:** błąd logiczny dowodu KCL potwierdzony; wpływ ilościowy na wyniki poszczególnych sieci wymaga testów numerycznych.

### P0-Z0 — sztuczny bocznik fizyczny

- `backend/src/enm/mapping.py:594`: do wiersza/kolumny Y0 bez połączenia dodawane `complex(1e6,0)` w pu.
- Wartość jest przewodnością numeryczną, nie udokumentowanym fizycznym połączeniem neutralnym do ziemi. Jej wpływ na Z0 i 1F trzeba sprawdzić metodą eliminacji izolowanych składowych, bez „uziemiania” fizycznie izolowanego obwodu.
- Zakaz automatycznego zamieniania niedomiaru rzędu macierzy na wynik udający fizyczny.

### P0-C — niepełne warianty nN i częstotliwości

- `backend/src/network_model/core/voltage_factor.py:36–37, 65–66` obsługuje dla wszystkich nN tylko `1.05/0.95` (tolerancja ±6%); IEC 2016 tabela 1 ma też wariant nN ±10% `1.10/0.90`.
- `backend/src/application/solvers/short_circuit_binding.py:72–110` wybiera automatycznie c per napięcie węzła. **Korekta wcześniejszego wstępnego audytu:** domyślne pola `StudyCaseConfig` nie wymuszają globalnie 1.10/0.95 w tej ścieżce, ale brakuje niezależnego doboru tolerancji nN ±10%.
- `backend/src/network_model/solvers/short_circuit_core.py:11,123,201` koduje częstotliwość 50 Hz w obliczeniu zaniku i cieplnym m. IEC obejmuje 50 i 60 Hz; zakaz deklaracji pokrycia 60 Hz przez tę ścieżkę.
- `backend/src/network_model/solvers/short_circuit_iec60909.py:25–26` oraz `compute_ikss_3ph_min/max()` przyjmują stałe c bez pasma i tolerancji. Przegląd konsumentów wymagany.

### P0-B0 — reguła zależna od normy w obecnym ENM

- `backend/src/enm/mapping.py:473` dodaje `b0_siemens_per_km` bez oceny zasad dla wydania IEC; pole jest **susceptancją** zerową w S/km, nie bezpośrednio pojemnością w F/km.
- `B0=ω C0` tylko przy jawnych, spójnych konwencjach składowych i danych; trzeba udokumentować jednostki i sposób przeliczenia z pojemności oraz modelu ekranów kabli.
- Wymóg 2016 §5.2(f): uwzględnianie pojemności w określonych niskoomowo uziemionych sieciach przy współczynniku ziemnozwarciowym `> 1.4`. Nie oznacza to reguły `b0 = 0` poza tym warunkiem.
- Treść 2026 §5.2.4 dotyczącą B0 należy uzyskać z licencjonowanego oryginału przed wdrożeniem.

### P1-IB-PROOF — błędne odwołania do rozdziałów IEC

- `short_circuit_core.py:124`, `short_circuit_iec60909.py:80,157` i `docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md:37` odnoszą równania `Ith` do „§4.7/§12”.
- Wydanie 2016: `Ith` i całka Joule'a — **rozdział 14**, współczynniki `m,n` — **załącznik normatywny A**. Wydanie 2026: rozdział 14, załącznik normatywny B.
- To błąd identyfikacji źródła w materiałach dowodowych, niezależny od numerycznej poprawności wzoru. Wymaga naprawy w właściwym pakiecie dowodowym.

### P1-SCOPE — niespójność redakcyjna zakresu 2016

- Autoryzowany publiczny podgląd `SS-EN 60909-0:2016`, strona IEC 7 (PDF strona 11), zawiera szeroko sformułowane wyłączenie pojedynczego zwarcia doziemnego w zakresie.
- Ta sama norma w spisie treści zawiera §7.5 **„Line-to-earth short circuit”**, a definicja §3.1 odnosi jednofazowe zwarcie doziemne do sieci z uziemionym neutralnym. Wyłączenie jest pozornie sprzeczne z regułami obliczeń.
- **Nie należy** deklarować bezwarunkowego wyłączenia wszystkich 1F w IEC 2016. Należy odnieść to do konkretnego układu neutralnego i sprawdzić oficjalne korekty/wyjaśnienia. W 2026 §1 wyraźnie wskazano sieci izolowane/rezonansowe.
- Bez wyjaśnienia konfliktu zakres wydania 2016 oznaczyć `SOURCE_CONFLICT_REVIEW_REQUIRED`.

## 3. Konieczna ścieżka walidacji
1. Sformułować niezależne odniesienie fizyczne z zespolonym Y/Z dla małej sieci 2-, 3- i 4-węzłowej; wyprowadzić wszystkie prądy gałęzi z orientacją.
2. Udowodnić bilans KCL zespolony na każdym węźle i sumaryczny prąd w miejscu zwarcia.
3. Zbudować test daleko/blisko generatora dla `I_b`, osobno składową nieokresową, `ip`, `Ith`; nie mylić definicji.
4. Przetestować nN ±6%/±10%, MAX/MIN i 50/60 Hz.
5. Przetestować B0=0, B0 dodatnie, B0 brak, Z0 singular oraz izolowane wyspy.
6. Zweryfikować każdy wynik w dwóch niezależnych narzędziach/referencjach, w tym dostępne przykłady IEC TR 60909-4:2021, z jawną tolerancją liczbową.
7. Przed scaleniem poprawić proof i raportowanie, by nie publikowały błędnie zdefiniowanego I_b.
8. Wszystkie zmiany solvera wyłącznie w dopuszczonej warstwie i po formalnym uzgodnieniu zamrożonych kontraktów wynikowych.

## 4. Źródła
- IEC 2016: https://webstore.iec.ch/en/publication/24100
- IEC 2026: https://webstore.iec.ch/en/publication/68454
- Oficjalny podgląd 2016, SEK Svensk Elstandard: https://elstandard.se/documents/preview/1694801
- Podgląd 2026: https://standards.iteh.ai/catalog/standards/iec/111c61a1-d4a4-4eb4-9655-ba4785738720/iec-60909-0-2026
- PKN, wykaz norm europejskich: https://www.pkn.pl/o-pkn/wspolpraca-miedzynarodowa/nowe-enisoiec/normy-europejskie
- Warianty c w IEC 2016: https://www.digsilent.de/en/faq-reader-powerfactory/why-are-the-results-of-short-citcuit-calculation-depending-on-max-voltage-tolerance.html

**Brak możliwości stwierdzenia pełnej zgodności IEC 2026 bez licencjonowanego tekstu i wzorcowych wyników. Żaden agent nie może zmieniać statusu na VALIDATED na podstawie samego PR #488.**
