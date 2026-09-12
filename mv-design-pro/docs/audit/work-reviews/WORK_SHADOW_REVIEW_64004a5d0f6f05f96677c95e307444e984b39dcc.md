# MV-DESIGN-PRO — INDEPENDENT WORK SHADOW REVIEW

Data przeglądu: 2026-09-12  
Tryb: READ-ONLY wobec kodu produkcyjnego; niezależna reprodukcja w lokalnym, odłączonym klonie  
Reviewer checkpoint: implementacyjny HEAD zweryfikowany, niezaakceptowany; niewykonany zakres zachowany

## REVIEW RANGE

Base:  
49bf0ab639eea4856e18db85a95e5aa78a25e118

Head:  
64004a5d0f6f05f96677c95e307444e984b39dcc

Merge base:  
49bf0ab639eea4856e18db85a95e5aa78a25e118

Opus branch:  
claude/max-dynamic-audit-kzbivg

PR:  
NONE dla tej gałęzi. Powiązany PR #475 pozostaje otwarty na claude/opus5-dynamic-physics-audit-fixes, HEAD 1e96202535abb0acfb123ebac8a49dae430e792c; nie obejmuje bieżącej delty.

Commity zakresu:

- 554e9c725846778547baa18d251f8103f7bda0ba — zapis poprzedniego raportu, bez delty implementacyjnej;
- b2dbd37666ce08941213f0e9bd41c5d3093f5921 — aktualizacja poprzedniego raportu, bez delty implementacyjnej;
- e6c9e6bad98f08ebbb1f7d405013db66e2cae2cf — Milestone A: granica autorytetu wyniku zwarciowego i gotowość per zdolność;
- 64004a5d0f6f05f96677c95e307444e984b39dcc — Milestone B: tory równoległe i porównanie trajektorii z ANDES.

Zakres merytoryczny: dwa ostatnie commity. Nie reaudytowano całego repozytorium.

## EXECUTIVE VERDICT

REJECT CURRENT DELTA

Remediacja jest częściowa. Usunięto globalne pole ready, dodano rzeczywiste punkty wywołania bramki dla czterech konsumentów downstream, zamknięto przepełnienie k_sc razy I_n dla dodatniego skończonego I_n oraz naprawiono ciche wyłączenie wszystkich torów równoległych.

Nie domknięto jednak podstawowej własności łańcucha dowodowego. Snapshot służący do wyprowadzenia proweniencji nie jest związany z liczbami zwarciowymi, run_id ani snapshot_id, które konsument interpretuje. Poprawny snapshot może więc autoryzować liczby z powietrza. Ponadto walidacja wkładu uznaje za miarodajne źródło z deklarowanym k_sc, lecz z zerowym, ujemnym, NaN albo Inf prądem znamionowym; wkład zostaje wtedy cicho zastąpiony wartością 0 A. Oba defekty mogą zaniżyć albo dowolnie zmienić wynik będący podstawą doboru aparatury, nastaw zabezpieczeń i dowodu.

Warstwa dynamiczna pozostaje UNVALIDATED_MODEL. Nowe porównanie z ANDES wspiera tylko klasyczny SMIB/GENCLS bez regulatorów, dla wyłączenia jednego toru oraz kanałów delta i omega. Nie uzasadnia statusu VALIDATED_SIMULATION ani dowodu NC RfG.

## POZIOMY WERYFIKACJI

- IMPLEMENTED: TAK — bramki downstream, capability-scoped readiness, kontrola przepełnienia, identyfikatory gałęzi, porównanie ANDES.
- SOFTWARE-VERIFIED: CZĘŚCIOWO — testy celowane autora istnieją; pełne CI na HEAD jest czerwone.
- MATHEMATICALLY VERIFIED: CZĘŚCIOWO — iloczyn k_sc razy I_n jest kontrolowany na przepełnienie, ale dziedzina I_n nie jest przenoszona do autorytetu.
- NUMERICALLY VERIFIED: CZĘŚCIOWO — zmierzono drabinę kroku dla jednego SMIB; występuje nierozstrzygnięta podłoga błędu około 3e-5 rad i brak rozdzielonego kryterium akceptacji dla zdarzenia.
- PHYSICALLY SUPPORTED: CZĘŚCIOWO — klasyczna maszyna na jednym zdarzeniu topologicznym.
- PHYSICALLY VALIDATED: NIE.
- PRODUCTION-READY: NIE.
- REGULATORY-EVIDENCE-READY: NIE.

## NEW P0/P1

### P0-DELTA-12 — snapshot autoryzuje liczby, których nie wyprowadzono z tego snapshotu

Subsystem: short-circuit authority / equipment selection / protection coordination / evidence.

Claim under test: proweniencji nie da się zadeklarować; wynik zależny od zwarcia wymaga miarodajnej proweniencji wejścia.

Independent evidence:

- api/equipment_proof_pack.py wyprowadza proweniencję z payload.snapshot, ale required_fault_results kopiuje niezależnie z payloadu.
- api/protection_coordination.py wyprowadza proweniencję z request.snapshot, ale fault_currents kopiuje niezależnie z requestu.
- api/proof_pack.py dla sc-asymmetrical wyprowadza proweniencję z snapshotu, ale Z1/Z2/Z0, napięcia, c_factor i run_id bierze niezależnie z payloadu.
- Żadna z tych dróg nie sprawdza, że liczby są wynikiem solvera dla tego snapshotu, że run_id istnieje ani że snapshot_id odpowiada snapshotowi.
- Test autora test_M4_dowod_doboru_aparatury_z_deklaracja_producenta_powstaje używa jawnie run_id=BIEG-KTORY-NIGDY-NIE-ISTNIAL oraz liczb dobranych ręcznie, a po dołączeniu snapshotu z k_sc=1.35 oczekuje HTTP 200 i ZIP. Test nie zabija obejścia; formalizuje je jako zachowanie dodatnie.

Reproduction:

    cd mv-design-pro/backend
    pytest -q tests/api/test_granica_autorytetu_downstream.py::test_M4_dowod_doboru_aparatury_z_deklaracja_producenta_powstaje

Następnie, przy niezmienionym snapshotcie, zmienić required_fault_results, fault_currents albo Z1/Z2/Z0 na arbitralne wartości. Obecna bramka nadal przepuszcza, ponieważ czyta wyłącznie klasyfikację k_sc ze snapshotu.

Why it matters physically/mathematically:

Wartości I″k, ip, Ith i impedancje sekwencyjne są wielkościami zależnymi od pełnej topologii, parametrów i punktu zwarcia. Sam fakt, że niezależny snapshot zawiera deklarowane k_sc, nie dowodzi, że podane liczby pochodzą z tego modelu. Można uzyskać fałszywie dodatni dobór zdolności wyłączalnej, fałszywą koordynację albo pakiet regulacyjny dla nieistniejącego biegu.

Do existing Opus tests detect it: NIE. Test dodatni M4 wprost oczekuje sukcesu dla fałszywego run_id i arbitralnych liczb.

Acceptance test:

- stały snapshot plus zmiana choć jednej wielkości wyniku poza artefaktem solvera musi zostać odrzucona;
- konsument musi pobierać wynik przez zweryfikowaną tożsamość run/snapshot/implementation albo sam wyliczać wielkości z przekazanego snapshotu;
- hash lub podpis musi obejmować pełny wynik, scenariusz, punkt zwarcia i implementację, nie samą obecność deklaracji k_sc;
- nieistniejący run_id nie może wytworzyć dowodu autorytatywnego.

SOL CAN RESOLVE.

### P0-DELTA-13 — niepoprawny prąd znamionowy DER daje autorytatywny wkład 0 A

Subsystem: DER short-circuit contribution / readiness / breaking capacity.

Claim under test: kontrola dziedziny wyniku blokuje każdą parę danych, dla której fizyczny wkład nie istnieje.

Independent executable evidence:

Uruchomiono na odłączonym klonie HEAD 64004a5d:

    python - <<'PY'
    import sys
    sys.path.insert(0, 'mv-design-pro/backend/src')
    from network_model.core.inverter import InverterSource
    from network_model.core.autorytet_wyniku_zwarciowego import (
        ProweniencjaWynikuZwarciowego, wynik_jest_miarodajny
    )
    from network_model.core.zdolnosci_wkladu_zwarciowego import ZdolnoscMiarodajna

    class G:
        def __init__(self, s):
            self.inverter_sources = {s.id: s}

    for i_n in [0.0, float('nan'), float('inf'), -100.0]:
        s = InverterSource(id='DER-1', node_id='n', k_sc=1.35, in_rated_a=i_n)
        p = ProweniencjaWynikuZwarciowego.z_grafu(G(s))
        print(i_n, s.ik_sc_a, s.wklad_zrodlo,
              wynik_jest_miarodajny(
                  ZdolnoscMiarodajna.BREAKING_CAPACITY_SELECTION, p
              ))
    PY

Observed:

    0.0    0.0 DEKLARACJA True
    nan    0.0 DEKLARACJA True
    inf    0.0 DEKLARACJA True
    -100.0 0.0 DEKLARACJA True

Cause:

prad_wkladu_zwarciowego odrzuca niepoprawne i_n_a przez zwrot 0.0, lecz zachowuje znacznik pochodzenia samego k_sc. _znacznik_zrodla i blokady_autorytetu widzą DEKLARACJA i przepuszczają wynik.

Why it matters:

Aktywne źródło falownikowe może zostać usunięte z bilansu zwarciowego przez wadliwą wartość znamionową, a wynik nadal ma status miarodajny. Zaniżenie I″k może skutkować doborem aparatu o niewystarczającej zdolności wyłączalnej albo błędną oceną czułości zabezpieczenia.

Do existing Opus tests detect it: NIE. Macierz autora bada przepełnienie tylko przy dodatnim I_n; brak przypadków 0, wartości ujemnej, NaN i Inf z poprawnym k_sc.

Acceptance test:

Każdy czynny DER musi mieć skończone, dodatnie I_n wyprowadzone z kompletnych i spójnych S_n oraz U_n. Brak albo niepoprawność dowolnego składnika musi dawać blocker autorytetu, nigdy wkład 0 A z DEKLARACJA.

SOL CAN RESOLVE.

### P1-DELTA-14 — automatyczna tożsamość toru zależy od kolejności rekordów

Subsystem: event engine / parallel branches / scenario identity.

Claim under test: identyfikator wskazuje rzeczywisty komponent i pozostaje deterministyczny.

Independent executable evidence:

    cd <detached-clone>
    python - <<'PY'
    import sys
    sys.path.insert(0, 'mv-design-pro/backend/research')
    from dynamic_lab.siec import Galaz, TopologiaSieci

    def topo(xs):
        return TopologiaSieci(
            szyny=('A','B'),
            galezie=[Galaz('A','B',0.0,x) for x in xs],
            szyny_sztywne={'B':1+0j},
        )

    for xs in [(0.4,0.8),(0.8,0.4)]:
        t=topo(xs)
        po=t.z_wylaczona_galezia_po_id('A-B#1')
        print(xs, [(g.ident,g.x_pu) for g in t.galezie],
              [(g.ident,g.x_pu) for g in po.galezie if g.zalaczona],
              po.zbuduj_ybus()[0,0])
    PY

Observed:

    (0.4,0.8) -> A-B#1 oznacza x=0.4; po zdarzeniu pozostaje x=0.8; Y00=-1.25j
    (0.8,0.4) -> A-B#1 oznacza x=0.8; po zdarzeniu pozostaje x=0.4; Y00=-2.5j

Why it matters:

Przestawienie kolejności serializacji tego samego zestawu fizycznych torów zmienia komponent dotknięty zdarzeniem i wynik Ybus. Numer wystąpienia jest pozycją w liście, nie tożsamością aparatu/kabla. Naprawiono wyłączenie obu torów, ale nie zapewniono stabilnej tożsamości rzeczywistego komponentu.

Do existing Opus tests detect it: NIE. Test sprawdza wyłącznie, że identyczna kolejność daje identyczne nazwy.

Acceptance test:

Dwa tory o różnych parametrach muszą zachować własne identyfikatory po permutacji kolejności, serializacji/deserializacji i odbudowie modelu; zdarzenie na identyfikatorze ma prowadzić do tego samego fizycznego toru i tej samej macierzy Ybus.

SOL CAN RESOLVE.

### P1-DELTA-15 — zmiana kontraktu readiness zepsuła krytyczny przepływ E2E

Subsystem: engineering-readiness API / frontend integration.

Claim under test: usunięcie globalnego ready zostało przeprowadzone jako spójna migracja kontraktu.

Evidence:

Na HEAD 64004a5d critical-real-backend-e2e zakończył się failure. Dokładny błąd:

    frontend/e2e/critical-run-flow.spec.ts:328
    expect(readiness?.ready).toBe(true)
    Expected: true
    Received: undefined

Backend i typy UI usunęły ready na rzecz kompletnosc_modelu oraz zdolnosci, ale krytyczny test rzeczywistego przepływu nadal czyta stary kontrakt.

Why it matters:

Samo usunięcie niejednoznacznego ready jest poprawne merytorycznie, lecz niekompletna migracja rozrywa kontrakt na realnej ścieżce case → readiness → run. Czerwony test jest deterministyczną regresją bieżącej delty, nie argumentem za przywróceniem globalnego ready.

Do existing Opus tests detect it: TAK — critical-real-backend-e2e.

Acceptance test:

Krytyczny przepływ musi wybierać i asertywnie sprawdzać konkretną zdolność, np. LOAD_FLOW, oraz osobno kompletnosc_modelu. Nie wolno odtwarzać globalnego ready jako skrótu.

SOL CAN RESOLVE.

## NEW P2

### P2-DELTA-16 — obiekt proweniencji pozostaje samodzielnie konstruowalny i fail-open dla nieznanego znacznika

ProweniencjaWynikuZwarciowego jest publiczną dataklasą, a ze_znacznikow przyjmuje dowolny Iterable[str]. blokady_autorytetu ignoruje znaczniki spoza _KOMUNIKAT_ZNACZNIKA.

Wykonana reprodukcja:

    ProweniencjaWynikuZwarciowego.ze_znacznikow(('DEKLARACJA',))
    ProweniencjaWynikuZwarciowego.ze_znacznikow(('NIEZNANY_ZNACZNIK',))
    ProweniencjaWynikuZwarciowego.ze_znacznikow(())

Każdy z trzech obiektów zwrócił True dla REGULATORY_EVIDENCE.

To nie jest obecnie bezpośrednie obejście HTTP, ale refutuje twierdzenie kodu, że proweniencji nie da się zadeklarować. Nieznany znacznik powinien być fail-closed. Istniejące testy nie zabijają tej mutacji.

### P2-DELTA-17 — raport maszynowy obejmuje tylko Icw <= Icu dla aparatury nN

Sześć reguł przeklasyfikowano do WIARYGODNOSC, lecz produkcyjny WynikPrzegladuWiarygodnosci implementuje wyłącznie Icw <= Icu (nN). R0 >= R1, P0 < Pk, Icw <= Icu (SN), 0 < R/X < 1 oraz 0 < i0% < 10 pozostają przede wszystkim kontrolami testowymi, a nie kompletnym artefaktem przeglądu katalogu.

Dodatkowo klasa_reguly dla każdej nieznanej nazwy zwraca KONIECZNOSC_FIZYCZNA. To nie jest dowód klasyfikacji; to twardy domysł. Nowa reguła bez jawnej decyzji może zostać błędnie nazwana koniecznością fizyczną.

### P2-DELTA-18 — porównanie ANDES nie ma ustalonego kryterium akceptacji i nie rozdziela błędu zdarzenia od odcinka gładkiego

Zmierzono błędy delta i omega na wspólnej siatce, lecz drabina 4/2/1/0.5 ms osiąga podłogę około 3e-5 rad. Autor wskazuje zagęszczanie kroku ANDES przy zdarzeniu jako prawdopodobną przyczynę, ale nie wykonał rozdzielnego pomiaru na odcinkach gładkich przed i po zdarzeniu ani wspólnej semantyki chwili przełączenia. Brak też niezależnie ustalonego progu akceptacji.

Testy z ANDES są pomijane, gdy wyrocznia nie jest zainstalowana. Bieżący CI ma 15 skipped i nie dostarcza w tym raporcie dowodu, że ANDES TDS został wykonany w CI. Lokalny wynik autora pozostaje wsparciem badawczym, nie walidacją produkcyjną.

## k_sc READINESS VERDICT

PARTIALLY SUPPORTED, NOT PRODUCTION-READY.

Co zostało zamknięte:

- brak k_sc i domyślka 1.1 blokują świeże SHORT_CIRCUIT_3F, SHORT_CIRCUIT_1F i PROTECTION;
- nowe punkty wywołania obejmują BREAKING_CAPACITY_SELECTION, PROTECTION_COORDINATION, SC_WITHSTAND_EVIDENCE i REGULATORY_EVIDENCE;
- LOAD_FLOW, TOPOLOGY, SLD i EDITING pozostają niezależne;
- przepełnienie skończonego dodatniego k_sc razy skończone dodatnie I_n zwraca skończony wynik roboczy i znacznik SI-114, więc nie jest autoryzowane.

Co pozostaje otwarte:

- snapshot nie jest związany z konsumowanymi liczbami ani run_id;
- niepoprawne I_n daje autoryzowany wkład 0 A;
- samodzielnie skonstruowane i nieznane znaczniki proweniencji są fail-open;
- system nie dowodzi, że deklaracja k_sc pochodzi od producenta; dowodzi jedynie, że liczba została podana.

Decyzja właściciela nie jest jeszcze spełniona w sensie end-to-end. System-default k_sc nie przechodzi bezpośredniej bramki, lecz wynik autorytatywny nadal można uzyskać z liczb niepowiązanych z modelem.

## CATALOG INVARIANT VERDICT

Klasyfikacja pięciu wskazanych reguł jako ostrzeżeń wiarygodności jest zasadniczo poprawna:

- R0 >= R1 — PLAUSIBILITY GUARD ONLY.
- P0 < Pk — PLAUSIBILITY GUARD ONLY.
- Icw <= Icu — PLAUSIBILITY GUARD ONLY bez dodatkowego ograniczenia do konkretnej rodziny, wariantu, napięcia i czasu. Ics <= Icu pozostaje normatywną relacją rodziny IEC 60947-2.
- 0 < R/X < 1 — R > 0 i X > 0 mogą być ograniczeniem zdefiniowanej domeny modelu; samo R/X < 1 jest PLAUSIBILITY GUARD ONLY, dopóki zakres produktu nie zostanie jawnie zawężony.
- 0 < i0% < 10 — dodatniość jest prawidłową kontrolą danych dla modelowanego transformatora; granica 10% jest PLAUSIBILITY GUARD ONLY.

Nie stwierdzono nowej zbyt silnej twardej bramki dla tych pięciu reguł. Nie wolno jednak nazywać nowych, niezarejestrowanych reguł koniecznościami fizycznymi przez domyślną klasyfikację.

## 57/57 VERDICT

Claim is truthful only in a narrow sense.

Po tej delcie globalne ready zostało usunięte. 57/57 może uczciwie oznaczać:

- kompletność strukturalną wymaganych pól szablonów;
- możliwość materializacji modelu;
- w poprzednim pomiarze dostępność capability LOAD_FLOW dla wszystkich 57 szablonów.

57/57 nie dowodzi:

- 23/23 rodzin katalogowych zweryfikowanych produkcyjnie;
- zgodności każdej wartości z kartą konkretnego producenta;
- gotowości zwarciowej każdego szablonu;
- gotowości do doboru aparatury, koordynacji zabezpieczeń albo dowodu regulacyjnego;
- fizycznej walidacji modeli dynamicznych.

Samo SOURCE_REFERENCED oznacza obecność referencji źródłowej, nie niezależną weryfikację treści. Kompletne pola bez weryfikowalnej proweniencji producenta nie są danymi production-verified.

Current overstatement:

- nazwa globalnego pola ready została usunięta — wcześniejsze przeszacowanie jest zamknięte na poziomie schematu;
- dokument PRE_FABLE nazywa pakiet gotowym do decyzji architektonicznej, nie produkcyjnie gotowym, co jest dopuszczalne;
- twierdzenie o domknięciu wszystkich znalezisk drugiej recenzji jest nieprawdziwe z powodu P0-DELTA-12 i P0-DELTA-13;
- twierdzenie, że proweniencji nie da się zadeklarować, jest zbyt mocne.

## PHYSICS SCORE

PARTIALLY SUPPORTED

Wsparcie: poprawne pozostawienie jednego toru w Ybus i zgodność klasycznego SMIB z ANDES dla delta/omega.

Ograniczenia: brak walidacji regulatorów, ograniczników, zwarć, napięć i mocy; autorytatywny wkład DER może zostać wyzerowany przez niepoprawne I_n.

## MATHEMATICS SCORE

PARTIALLY SUPPORTED

Kontrola skończoności iloczynu k_sc razy I_n jest matematycznie właściwa dla dodatnich czynników. Dziedzina pary jest jednak niepełna, bo niepoprawny drugi czynnik nie propaguje blokady. Nowe porównanie trajektorii nie ustanawia ogólnej równoważności modeli.

## NUMERICAL SCORE

UNRESOLVED

Zmierzono rzeczywisty błąd punkt-po-punkcie i jego zależność od kroku, co jest wartościowe. Obserwowany iloraz błędów 2.66, 1.68 i 1.22 nie daje stałego rzędu metody, a błąd zdarzeniowy nie został oddzielony od odcinków gładkich. Brak kryterium akceptacji oraz niezależnego wykonania ANDES w tej recenzji.

## ENERGY / NETWORK SCORE

REFUTED

Naprawa torów równoległych usuwa jedno lokalne naruszenie topologii. Jednocześnie P0-DELTA-13 pozwala cicho usunąć czynny wkład DER z bilansu zwarciowego, a P0-DELTA-12 pozwala połączyć dowolne liczby z niezależnym snapshotem. To uniemożliwia uznanie wyniku zwarciowego za miarodajny end-to-end.

Wcześniejszy P0 BESS pozostaje otwarty i nie był dotknięty deltą.

## CATALOG ENGINEERING SCORE

PARTIALLY SUPPORTED

Rozróżnienie twardych wymogów od reguł wiarygodności jest poprawione. 57/57 zostało oddzielone od 23/23. Brakuje pełnego maszynowego artefaktu ostrzeżeń dla pięciu z sześciu przeklasyfikowanych reguł oraz niezależnego potwierdzenia danych producenta.

## CI DELTA

Stan pobrany dla 64004a5d 2026-09-12 po zakończeniu głównego pytest:

Zielone:

- V12K Extended Invariant Guards;
- SLD Guards (Python);
- Architecture and catalog-first repo hygiene;
- Documentation integrity check;
- Blokada pól fizycznych w modalach.

Czerwone:

- pytest: 7 failed, 11906 passed, 15 skipped. Te same siedem rodzin fixture JSON nN co wcześniej; różnice projection_hash i wartości zmiennoprzecinkowych. Z dostępnego dowodu nie wynika nowa regresja tej delty — klasyfikacja: inherited/numerical fixture debt.
- SLD Contract Tests (Vitest): vertical_length_probe, wartości 22672 > 22440 i 45656 > 39448. Delta nie zmienia SLD; klasyfikacja: inherited regression/debt.
- critical-real-backend-e2e: readiness.ready jest undefined po usunięciu pola. Klasyfikacja: introduced deterministic contract regression, P1-DELTA-15.

W toku w chwili utrwalenia:

- full-real-backend-e2e;
- frontend.

Deklaracja dokumentu o 12031 backend tests i 11989 frontend tests bez błędów odnosi się do pomiaru lokalnego Milestone A i nie jest stanem pełnego CI bieżącego HEAD.

## MUTATION STATUS

Nowe mutacje/kontrprzykłady:

- k_sc=1e308, I_n=1000 A — KILLED w zakresie autorytetu: ik pozostaje skończony, znacznik SI-114 blokuje wynik.
- poprawne k_sc plus I_n=0/NaN/Inf/ujemne — SURVIVED: 0 A, DEKLARACJA, authoritative=True.
- stały poprawny snapshot plus arbitralna zmiana required_fault_results/fault_currents/Z1-Z2-Z0 — SURVIVED na podstawie wykonywalnej ścieżki i dodatniego testu HTTP autora.
- nieznany znacznik proweniencji — SURVIVED: brak blokady.
- permutacja dwóch nierównych torów bez jawnych identyfikatorów — SURVIVED: A-B#1 wskazuje inny fizyczny tor, Ybus po zdarzeniu zmienia się z -1.25j na -2.5j.
- wyłączenie wszystkich torów przez adresowanie parą szyn — KILLED: niejednoznaczność daje błąd, a adresowanie po ident wyłącza jeden tor.

## PREVIOUS FINDINGS STATUS

Nadal otwarte, niedotknięte deltą:

- P0-DELTA-01: projekcja SOC do zera bez ograniczenia elektrycznej energii; 0.165847882 kWh wobec zasobu 0.040 kWh, błąd nie znika z dt.
- P1-DELTA-02: projekcja NaN na górną granicę z STRICT_CONVERGENCE.
- re-inicjalizacja po zwarciu: max delta x0=1.09421789.
- NaN/Inf w kontrakcie wyników dynamicznych.
- niespójności baz BESS.
- samodzielnie konstruowane evidence/FRT i niepełne związanie implementacji.
- model-form risk limiterów AVR/governor.
- brak prawa do VALIDATED_SIMULATION i dowodu NC RfG.

Częściowo zamknięte:

- identity zdarzeń dla torów równoległych: zamknięto ciche wyłączenie wszystkich; stabilna tożsamość rzeczywistego komponentu pozostaje otwarta.
- k_sc downstream: dodano punkty wywołania, lecz łańcuch wyniku do snapshotu pozostaje otwarty.
- P1-DELTA-07: przepełnienie iloczynu przy dodatnim skończonym I_n zamknięte; niepoprawne I_n ujawniło nowy P0.
- P1-DELTA-08: globalne ready usunięte; migracja E2E nieukończona.

## UNRESOLVED PROFESSORIAL QUESTIONS

1. Czy artefakt wyniku zwarciowego posiada kanoniczny, niepodrabialny związek z pełnym snapshotem, operating point, fault location, solver implementation i liczbowym payloadem wyniku? Obecna delta takiego związku nie pokazuje.  
SOL CAN RESOLVE.

2. Jaki jest jawny kontrakt dla braku albo niepoprawności S_n/U_n/I_n czynnego DER i dlaczego obecnie wkład 0 A jest oznaczony DEKLARACJA?  
SOL CAN RESOLVE.

3. Czy identyfikatory gałęzi bez jawnego ident mają być trwałe poza pojedynczym obiektem w pamięci? Jeśli tak, numer wystąpienia nie spełnia wymagania.  
SOL CAN RESOLVE.

4. Jaki próg akceptacji obowiązuje dla błędu trajektorii ANDES oraz jaki jest obserwowany rząd na odcinkach gładkich osobno przed zdarzeniem, po zdarzeniu i w oknie zdarzenia?  
SOL CAN RESOLVE.

5. Czy pięć pozostałych reguł wiarygodności ma być widocznych w produkcyjnym raporcie katalogowym, czy wyłącznie w testach?  
SOL CAN RESOLVE.

## ASTRA ESCALATION

NIE ZALECA SIĘ.

Nowe P0/P1 są jednoznacznymi defektami łańcucha danych, dziedziny wejścia i tożsamości komponentu. Nie ma dwóch równie wiarygodnych interpretacji matematycznych lub fizycznych wymagających GPT-6 Astra.

## REVIEW CHECKPOINT

LAST_VERIFIED_SHA: 64004a5d0f6f05f96677c95e307444e984b39dcc

Uwaga: LAST_VERIFIED_SHA oznacza koniec przejrzanej delty, nie akceptację. pending_from_base pozostaje co najmniej od 1e96202535abb0acfb123ebac8a49dae430e792c dla wcześniejszych nierozstrzygniętych problemów dynamicznych, BESS, event/evidence i walidacji fizycznej.
