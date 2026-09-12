# `backend/research/` — kod BADAWCZY, poza ścieżką produkcyjną

**Status: NIE JEST PRODUKCJĄ. NIE JEST DOWODEM REGULACYJNYM. NIE JEST KANONEM.**

Ten katalog zawiera prototypy inżynierskie przygotowane przed decyzją
architektoniczną właściciela programu (Fable 5.1). Powstał, żeby zamienić pytania
architektoniczne na **mierzalne dowody**: zamiast opinii „DAE czy ODE", „jaki
integrator", „czy da się sprzęgnąć z Ybus" — działający kod i liczby.

## Dlaczego katalog leży POZA `src/`

`pyproject.toml` wylicza pakiety produkcyjne jawnie (`packages = [{include = ...,
from = "src"}]`). Katalog `research/` **nie jest w tej liście**, więc nie wchodzi
do zainstalowanego pakietu i **kod produkcyjny nie ma jak go zaimportować** —
to izolacja strukturalna, nie umowa dżentelmeńska. Testy laboratorium dokładają
tę ścieżkę jawnie (`tests/research/conftest.py`); żaden moduł w `src/` tego nie robi.

Guard `research_isolation_guard.py` pilnuje tej granicy w CI.

## Czego tu NIE WOLNO zrobić

- podpiąć wyniku laboratorium pod jakąkolwiek końcówkę API produkcji,
- użyć go do wygenerowania certyfikatu / wniosku / dowodu zgodności,
- pokazać go w UI jako wynik zwalidowany,
- nadać którejkolwiek zdolności `EvidenceTier.VALIDATED_SIMULATION`,
- zastąpić nim produkcyjnego solvera bez akceptacji właściciela programu.

Bezpiecznik dowodowy z gałęzi containment (`2473afd2`) obowiązuje bez zmian:
**żadna zdolność dynamiczna nie jest dziś dowodem regulacyjnym.**

## Czego tu WOLNO oczekiwać

Kod badawczy jest nadal kodem inżynierskim: deterministyczny, otypowany,
przetestowany, z jawnymi jednostkami, bazami i konwencjami znaków. Każdy model
mówi wprost, **które równania implementuje** — bez zawyżania nazwą (to był jeden
z defektów P0 audytu: model nazwany „6-rzędowym" miał 2 stany).

## Zawartość

| Moduł | Zakres |
|---|---|
| `dynamic_lab/konwencje.py` | jednostki, bazy, konwencje znaków, transformacja dq↔sieć |
| `dynamic_lab/siec.py` | warstwa algebraiczna sieci: Ybus, wstrzyknięcia prądu, rozwiązanie `g(x,V)=0` |
| `dynamic_lab/urzadzenia.py` | protokół urządzenia + maszyna synchroniczna 4. rzędu + falownik GFL/GFM; **D-07/GFM**: dwie EKSPERYMENTALNE strategie ograniczenia prądu GFM (impedancja wirtualna, nasycenie zadania) — domyślnie WYŁĄCZONE, z wyprowadzonym kresem prądu i zmierzoną ceną numeryczną |
| `dynamic_lab/urzadzenia_oze.py` | prototypy **D-07** i **D-12**: magazyn ze stanem energii (SOC) i regulacją częstotliwościową, regulator elektrowni (PPC) z limitem eksportu ocenianym w PCC, maszyna dwustronnie zasilana 3. rzędu BEZ crowbaru (z jawnym zakresem ważności) |
| `dynamic_lab/regulatory.py` | AVR, governor — pętle ZAMKNIĘTE, z ogranicznikami i anti-windup |
| `dynamic_lab/zdarzenia.py` | harmonogram zdarzeń (zwarcie, wyłączenie, zmiana topologii) |
| `dynamic_lab/calkowanie.py` | integratory (jawne i niejawne) za wspólnym kontraktem; tolerancja równania kroku SKALOWANA KROKIEM (`wspolczynnik_kroku`), bo stała czyniła rząd metody nieosiągalnym poniżej pewnego `dt` — zagęszczanie kroku POGARSZAŁO wynik |
| `dynamic_lab/skonczonosc.py` | JEDNO miejsce, w którym NaN i Inf są łapane: `wymagaj_skonczonosci` zgłasza wartość niepoprawną w chwili POWSTANIA, z indeksami i nazwami stanów jako DANYMI wyjątku (nie tylko w komunikacie), żeby kontrakt wyniku mógł podać adres defektu bez parsowania tekstu |
| `dynamic_lab/silnik.py` | pętla DAE: `ẋ = f(x,y,u,p,t)`, `0 = g(x,y,u,p,t)`; inicjalizacja: rozpływ → punkt pracy → stany regulatorów → weryfikacja `‖f(x₀,y₀)‖` |
| `dynamic_lab/wynik.py` | kandydat kontraktu wyniku dynamicznego (szereg czasowy + tożsamość) |
| `dynamic_lab/walidacja.py` | metryki zgodności + wyrocznie analityczne (W2): wahania małosygnałowe i CCT z kryterium równych pól |
| `dynamic_lab/drabina.py` | JEDNA taksonomia dowodów: oś C (złożoność przypadku) × oś W (poziom wyroczni) |
| `dynamic_lab/benchmarki.py` | przypadki odniesienia (oś C: C1…C4), CCT przez bisekcję, porównanie integratorów |
| `dynamic_lab/sztywnosc.py` | dowód **D-02**: przypadek JAWNIE SZTYWNY (wskaźnik sztywności z widma jakobianu) + porównanie integratorów na nim — kroki graniczne wobec zamkniętego wzoru `2/\|λ\|` |
| `dynamic_lab/frt.py` | ocena FRT: wymaganie (obwiednia) vs wynik (przebieg) — ROZDZIELONE |
| `dynamic_lab/wzorzec_zewnetrzny.py` | dowód **C1/W3**: porównanie z NIEZALEŻNYM narzędziem (ANDES) — wymaga `pip install andes` |
| `dynamic_lab/wzorzec_genrou.py` | dowód **C1/W3** dla modelu 4. rzędu i regulatorów: ANDES GENROU (+SEXS, +TGOV1) — z ZMIERZONYM zakresem zgodności (tłumiki, nasycenie) zamiast założonego |
| `dynamic_lab/wzorzec_natywny.py` | walidacja MAPOWANIA parametrów na przypadku autorstwa ANDES (`cases/smib/SMIB.xlsx`) — sprawdza, czy rozumiemy wejście |
| `dynamic_lab/tozsamosc.py` | deterministyczna TOŻSAMOŚĆ: postać kanoniczna parametrów (rekurencyjnie po dataklasach, z jawną deklaracją pól pomijanych), odcisk scenariusza (migawka + punkt pracy + nastawy solvera + harmonogram) i odcisk topologii (wszystko, co wchodzi do Ybus) |
| `dynamic_lab/dowod_walidacji.py` | PROTOTYP D-09: stopień dowodowy WYPROWADZANY z zakresu walidacji, nie nadawany |
| `dynamic_lab/wzorzec_trajektoria.py` | **cross-check NUMERYCZNY** trajektorii wobec ANDES (`TDS`, nie `EIG`) na wyłączeniu jednego z dwóch torów równoległych: błąd punkt-po-punkcie raportowany ODCINKAMI (przed / okno przełączenia / po), z zakazem ekstrapolacji, kontrolą osi czasu i formalnym kryterium odbioru. Rozstrzyga, CZYJ jest błąd, przez TRZECIEGO ARBITRA — całkę pierwszą maszyny klasycznej przy `D = 0`. **Nie jest walidacją fizyczną**: oba narzędzia całkują to samo równanie |
| `dynamic_lab/mutacje.py` | rama KAMPANII MUTACYJNEJ: nazwany defekt + wskazany detektor; trzy wyniki (ZABITA / PRZEZYLA / BLAD_WYKONANIA), bo wyjatek w scenariuszu nie jest zabiciem |
| `dynamic_lab/sonda_mutacyjna.py` | WYKONAWCA sond kampanii: uruchamia pytest w procesie POTOMNYM z podmianą kodu, osobno dla biegu kontrolnego (bez mutacji) i zmutowanego — bez kontroli bazowej „zabicie" nie znaczy nic, bo sonda mogła być czerwona już wcześniej |
| `dynamic_lab/katalog_mutacji.py` | konkretne mutacje wpiete w DZIALAJACE detektory laboratorium (fizyka, numeryka, kontrakt, tozsamosc) |

Testy: `backend/tests/research/` (uruchamiane przez zwykły bieg pytest).

## Uprzaz kwalifikacyjna

`backend/research/kwalifikacja.py` uruchamia komplet pomiarow JEDNYM poleceniem i
zwraca raport maszynowy (JSON): residua inicjalizacji, stan wyroczni zewnetrznych,
blad trajektorii wobec ANDES, porownanie integratorow, czas krytyczny zwarcia i
wynik kampanii mutacyjnej.

```bash
python backend/research/kwalifikacja.py            # pelny bieg (~35 s)
python backend/research/kwalifikacja.py --szybko   # bez CCT i porownania metod
```

Kod wyjscia mowi o LUKACH KWALIFIKACJI (przezyta mutacja krytyczna), nie o
„sukcesie”. Raport NIE nadaje statusu dowodowego i nie moze go nadac.
