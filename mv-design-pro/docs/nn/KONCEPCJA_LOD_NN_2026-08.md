# KONCEPCJA LOD STRONY nN — DRABINA PYTAŃ INŻYNIERSKICH (2026-08-14)

Status: PROPOZYCJA do werdyktu właściciela (zadanie koncepcyjne „dla Fable").
Diagnoza: kompaktowanie nN w przestrzeni współrzędnych SN przegrało z geometrią
(T3: pomiar kolizji, margines 60 j.św.). To nie jest problem odstępów — to
problem JEDNEJ przestrzeni dla DWÓCH domen. Dojrzałe narzędzia (PowerFactory:
diagram-per-station; GIS: semantic zoom) nie kompaktują — PRZEŁĄCZAJĄ domenę.

## Zasada nadrzędna
Każdy poziom odpowiada na JEDNO pytanie inżynierskie; element istnieje na
poziomie tylko, jeśli służy temu pytaniu. Granica wizualna = granica
obliczeniowa: transformator dzieli domeny dokładnie tam, gdzie dzieli je
pętla zwarcia (upstream Thevenin P0.6).

## Drabina

**L0 — SIEĆ (pytanie: jak płynie moc przez SN; które stacje żyją?)**
Widać: pełna topologia SN; stacja = symbol kompozytowy + PLAKIETKA nN:
`nN: 6 odpł. · 145 kW · ●` (liczba odpływów, ΣP z modelu, kropka najgorszego
werdyktu SWZ/obciążenia z biegów — ze znacznikiem świeżości; bez biegów:
tylko struktura, zero wymyślonego statusu). Znika: CAŁA geometria nN
(szyna, odpływy, tabliczka TR — zostaje moc w plakietce). Budżet: ≤3 glify
na stację.

**L1 — STACJA W KONTEKŚCIE (pytanie: co ta stacja robi; struktura nN jednym
rzutem?)** Wejście: zoom na stację (istniejące progi LodPolicy). Widać:
TR + szyna RGnN z sekcjami + KIKUTY odpływów (aparat + In + ikona
przeznaczenia: odbiór/PV/BESS/podrozdzielnica) — GŁĘBOKOŚĆ 1: łańcuch
poniżej pierwszego aparatu zwija się do chipa przeznaczenia. Powyżej N=8
odpływów: kikut-agregat „6+ odpływów" (wzorzec agregacji DER-row). Stacje
sąsiednie degradują do formy L0. Znika: długości kabli, podrozdzielnice
w głąb, tabliczka TR (nadal tylko moc).

**L2 — DOMENA nN JEDNEJ STACJI (pytanie: jak zbudowany jest obwód i czy
przechodzi?) — NOWY POZIOM, WŁASNA KANWA.** Wejście: JAWNE (dwuklik
stacji / klik plakietki / próg zoomu z afordancją „Wejdź do nN ⏎") — nie
samo kółko myszy. Świat SN ZNIKA CAŁKOWICIE poza JEDNĄ kotwicą źródła:
chip `SN 15 kV · Sk″/Ik″ w punkcie HV · kierunek GPZ` (dokładnie upstream
Thevenin, którym liczy pętla — wizualna granica = obliczeniowa). Nagłówek:
TABLICZKA TR (Sn·przekładnia·grupa·uk% — tu jest jej prawdziwy dom, nie
wciśnięta w kanwę SN jak w T3). Widać: pełna topologia nN — sekcje RGnN,
wszystkie odpływy z łańcuchami kabli (typ katalogowy, długość), podrozdzielnice
rozwinięte 1 poziom, odbiory/DER, plakietki SWZ/Iz′ per odpływ, ΔU
skumulowane na końcach. Wewnątrz L2 działa ISTNIEJĄCA drabina etykiet
T2-LOD. Nawigacja powrotna: breadcrumb `Sieć › Stacja B › nN`.

**L3 — TOR/DOKUMENT (pytanie: udowodnij ten obwód)** — nie nowa kanwa:
klik odpływu w L2 → istniejący drawer wyników (T2-WYNIKI) + wiersz
ARKUSZ-NN + pakiet dowodowy. Reuse w całości.

## Przejścia — co i kiedy znika
| Przejście | Mechanizm | Pojawia się | Znika |
|---|---|---|---|
| L0→L1 | ciągły zoom (LodPolicy, histereza) | szyna nN + kikuty gł. 1 | plakietki stacji sąsiednich |
| L1→L2 | JAWNE wejście w domenę (przełącznik kanwy) | pełne nN + kotwica SN + tabliczka TR | cały świat SN |
| L2→L1 | breadcrumb / Esc / próg wyjścia < progu wejścia (histereza) | świat SN | domena nN |

Twarde przełączenie domeny (nie przenikanie) LIKWIDUJE klasę kolizji z T3:
zero wspólnej przestrzeni współrzędnych = zero potrzeby routingu świadomego
przeszkód SN.

## Reuse (zero drugiej prawdy)
Jedno źródło: graf elektryczny T0 — kanwa L2 to DRUGA PROJEKCJA tego samego
grafu (wyrocznia zgodności sceny z grafem obejmuje obie). LodPolicy/
ViewportController (progi+histereza istnieją), agregacja DER-row (kikut-
agregat), T2-LOD (etykiety w L2), T2-WYNIKI+ARKUSZ (L3), plakietka=dane
z modelu/biegów ze świeżością. Umieszczenie korytarzowe rozdzielnicy nN
(odroczone z P0.8) staje się ZBĘDNE — pełny układ dostaje w L2.

## Pytania otwarte do werdyktu właściciela
1. Gest wejścia L1→L2: dwuklik stacji, klik plakietki, czy próg zoomu
   z afordancją? (proponuję: wszystkie trzy, próg tylko z afordancją).
2. Budżet kikutów L1: N=8 przed agregacją — potwierdzić/zmienić.
3. Czy L2 pokazuje sąsiednie stacje nN zasilane z tego samego odpływu SN
   (widok „grupy stacji"), czy ściśle jedną stację? (proponuję: jedną;
   grupa = P2).
4. Plakietka L0: który werdykt jest „najgorszy" — priorytet SWZ > Iz′ > ΔU?

---

## WERDYKT WŁAŚCICIELA (2026-08-14): 8,5/10 → 9,5/10 po korektach — BINDING

**ZASADA FUNDAMENTALNA (ZASTĘPUJE „granica wizualna = granica obliczeniowa"):**
GRANICA WIZUALNA = GRANICA DOMENY NAPIĘCIOWEJ I PROJEKCJI.
Nie oznacza ona przerwania zależności obliczeniowej.
Każda domena niższego napięcia otrzymuje jawny, wersjonowany
upstream electrical equivalent wynikający z tego samego ENM,
scenariusza i stanu łączeniowego.
Transformer pozostaje komponentem łączącym obie domeny
i jedyną legalną granicą 15 kV ↔ 0,4 kV w tej części modelu.

**Rozstrzygnięcia pytań:**
1. Wejście L2: klik stacji=zaznaczenie; przycisk „Wejdź do nN"=przejście;
   Enter=skrót; dwuklik=skrót ekspercki. ZAKAZ wejścia samym zoomem.
2. Budżet kikutów: ADAPTACYJNY (szerokość/sekcje/pitch), nie stała N=8.
   Agregacja PER SEKCJA SZYN (nigdy globalna przez sprzęgło). Agregat
   dziedziczy najgorszy status ukrytych. NIGDY w agregacie: incomer,
   sprzęgło, DER, agregat prądotwórczy, UPS, odpływ HARD FAIL, odbiór
   krytyczny.
3. L2 = `LvDomainView(rootStationId, scenarioId)` — granica z GRAFU domeny
   0,4 kV (nie containment); połączenie do innej stacji = boundary/link
   chip. WIELOŹRÓDŁOWOŚĆ jawna (2×TR+sprzęgło, PV/BESS/G1, ATS) — domena
   napięciowa, NIE szablon TR→RGnN→odpływy. Grupa stacji = P2.
4. Plakietka: najpierw POZIOM naruszenia (INVALID/HARD FAIL/FAIL/WARNING/
   PASS), przy remisie typ: SWZ → obciążalność/termika → napięcie.
   Freshness ma pierwszeństwo przed zielonym PASS.

**Korekty treści:**
- L0 plakietka: kierunek przepływu zamiast surowej ΣP:
  `630 kVA · nN · 6 odpł. · ↓145 kW · TR 42% · ●` (↑ przy eksporcie).
  Makroskopowo — bez Q/cosφ/U/Ik w chipie.
- L1: TOR TRANSFORMACJI ZAWSZE WIDOCZNY: SN → pole FT → symbol TR → QF-IN →
  szyna RGnN (sekcje+sprzęgło) → kikuty. Symbol TR w torze elektrycznym L1
  — tabliczka bogata dopiero w L2, ale symbol NIE znika z L1.
- L2 kotwica: kompaktowy chip na ekranie, pod nim PEŁNY immutable
  `UpstreamEquivalentSnapshot` (sourceNodeId, voltageLevelId, Uth, Sk″,
  Z1/R1/X1, Z0 jeśli wymagane, R/X, scenarioId, operatingStateId,
  calculationRunId, modelRevision/hash) — używany przez solver.
- L2 wyniki: przełączalne OVERLAYE inżynierskie (Obciążenia/Spadki U/
  Zwarcia/SWZ/Termika/Selektywność) — nie 10 liczb naraz; domyślny SLD czysty.
- MECHANIZMY ROZDZIELONE: L0↔L1 = semantic zoom (histereza); L1→L2 =
  DOMAIN NAVIGATION (VIEW DOMAIN i kamera to OSOBNE stany; zoom dowolny
  w każdej domenie).
- T5c: pamięć kontekstu powrotu (stacja, zoom, pan, scenario, warstwa
  wyników, zaznaczenie) — nigdy fitAll().

**Decyzja: T5a ZLECIĆ · T5b ZLECIĆ (priorytet) · T5c ZLECIĆ po zmianie na
explicit domain navigation. Kierunek „zmniejszyć RGnN pod stacją SN" —
ZAMKNIĘTY.**
