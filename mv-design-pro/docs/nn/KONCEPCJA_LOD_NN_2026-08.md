# KONCEPCJA LOD STRONY nN — DRABINA PYTAŃ INŻYNIERSKICH (2026-08-14)

Status: ZASTĄPIONA (2026-09-01) przez kanon
`docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md` — po odrzuceniu B-02 mieszany LOD
(plakietka nN na L0, wnętrze nN w przestrzeni SN na L1) został wycofany;
obowiązują dwie projekcje na jednej sieci obliczeniowej z jawnym portalem na
terminalu nN transformatora. Poniższa treść pozostaje jako zapis historyczny
diagnozy (dlaczego kompaktowanie nN w przestrzeni SN przegrało).

Status pierwotny: PROPOZYCJA do werdyktu właściciela (zadanie koncepcyjne „dla Fable").
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

---

## WERDYKT B-02 dla T5b (2026-08-14): REJECT 0/10 wykonania — koncepcja L2 potwierdzona 10/10

Zdanie kluczowe właściciela: „Zmiana domeny rozwiązała problem przestrzeni,
ale nie problem JĘZYKA SLD. L2 nadal przedstawia graf encji. Następna
iteracja ma zamienić RGnN/TR/PV/odpływ/podrozdzielnicę na rzeczywiste tory
elektryczne BUS → APPARATUS → CONDUCTOR → TERMINAL → DEVICE."

### P0 przed następnym werdyktem (BINDING, komplet 18 punktów)
1. RGnN-A/B = prawdziwe SEKCJE SZYN (kreska magistrali), nie ikonki-kwadraty.
2. Jawny aparat sprzęgła QF-BC między sekcjami + stan OPEN/CLOSED — kreska
   między sekcjami bez aparatu ZAKAZANA (zmienia znaczenie zwarciowe).
3. LV incomer każdego TR pokazany (ACB/MCCB/rozłącznik z modelu).
4. Jawny tor: TR → incomer → BUS (zakaz skracania TR→ikonka rozdzielnicy).
5. Każdy odpływ: BUS → zabezpieczenie → kabel → przeznaczenie (bez tej
   struktury overlay SWZ nie ma się do czego przypiąć).
6. Podrozdzielnica = downstream node PO rzeczywistym odpływie (QF + kabel
   z przekrojem/długością), nie kwadrat z podpisem.
7. PV = jawny tor DER: źródło → INV → QF → kabel → ● PCC-LV → szyna.
8. Boundary = odpływ → kabel (impedancja NALEŻY do modelu — nie wolno jej
   uciąć geometrią!) → ● terminal granicy → chip obcej domeny (klik =
   „Otwórz domenę Stacji OBCEJ").
9. Stany łączeniowe aparatów pokazane symbolem (QF-T1/T2/BC/PV).
10. Overlay SWZ = ZWIZUALIZOWANY na torach (plakietki per odpływ:
    `SWZ ✓ 0.12/0.40 s`, przy FAIL Ikmin/Ia), nie sam zielony przycisk.
11. PASS/WARN/FAIL + Ikmin/Zs/ta/tmax przynajmniej po interakcji.
12. Auto-layout: sensowna część viewportu po Fit (nie 15–20% kanwy).
13. Minimalne engineering sizes (oznaczenia/etykiety/symbole/pitch) —
    fit() nie schodzi poniżej progu czytelności.
14. Nagłówek OPISUJE DOMENĘ (`0,4 kV · 2×TR · 2 sekcje · PV · 1 boundary`);
    parametry Sn/uk/grupa przy T1/T2, nie w nagłówku widoku.
15. Hierarchia pionowa warstw: SN anchor → TR → LV incomers → MAIN BUS →
    feeders/DER → subdistribution → loads (rozpoznawalna w 0,5 s).
16. Test 2×TR: QBC OPEN = brak równoległości; QBC CLOSED = topologia i SC
    się zmieniają.
17. Test overlay: wartość na L2 = wynik solvera dla dokładnie tego
    feederId/runId/scenarioId.
18. Zakaz inferencji connectivity z geometrii.
Upstream chipy: rozróżnialne per węzeł SN (`↑ SN / S01` vs `S02`; ten sam
węzeł = jawnie ten sam); klik chipu = dowód (pełny snapshot). Docelowo
(może osobno): `[⚡ Fault at end]` na końcu kabla → Zs/Ik1min/Ia/ta/werdykt.
