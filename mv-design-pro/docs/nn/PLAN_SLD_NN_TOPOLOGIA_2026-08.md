# PLAN SLD-nN-TOPOLOGIA (2026-08-14) — BINDING

Werdykt właściciela B-02 nad P0.8: **0/10 HARD FAIL** (pełna dyspozycja
P0.1–P0.12 w treści werdyktu; ocena warstw: topologia 0, separacja SN/nN 0,
TR jako granica 0, RGnN 0, integracja obliczeń 0). Diagnoza właściciela
POTWIERDZONA lekturą kodu: `sld/v3/compose/station.ts` układa dzieci
wizualne stacji wokół linii poziomych — scena nie jest projekcją grafu
elektrycznego; dolna linia to artefakt layoutu, nie szyna 0,4 kV.

## Zasada nadrzędna (dyspozycja właściciela, dosłownie)
NAJPIERW dowód testem grafowym: ścieżka 15 kV → T1 → 0,4 kV → RGnN →
odpływ → odbiornik poprawna ORAZ żaden element poza transformatorem/
konwerterem nie łączy domen napięciowych. ZAKAZ poprawiania symboli,
fontów, odstępów, kolorów przed zielenią dowodu grafowego.

## Architektura docelowa (P0.8 dyspozycji)
ENM → TERMINAL GRAPH → ELECTRICAL GRAPH → VOLTAGE DOMAINS →
CONNECTIVITY VALIDATION → OPERATING TOPOLOGY → SLD VIEW MODEL →
LAYOUT → RENDER. Layout jest OSTATNI — decyduje wyłącznie GDZIE narysować
istniejące połączenie, nigdy CO jest połączone. Źródło prawdy: relacje
elektryczne ENM (bus.voltage_kv; branch.from/to_bus_ref; transformer z
JAWNYMI terminalami HV/LV — hv/lv voltageLevel + hv/lv bus). Renderer NIE
inferuje strony HV/LV z położenia.

## Inwarianty (P0.7 dyspozycji — komplet, egzekwowane w walidacji grafu)
1. edge voltage compatibility (HARD ERROR przy portA.vl≠portB.vl bez
   crossVoltageDevice), 2. transformer voltage boundary, 3. bus voltage
   consistency, 4. device terminal consistency, 5. no dangling energized
   terminal, 6. no cross-voltage conductor, 7. no unresolved active
   apparatus (UNRESOLVED = HARD VALIDATION ERROR + status SLD INVALID /
   MODEL INCOMPLETE — nigdy element w aktywnym torze), 8. no LV feeder on
   MV bus, 9. no MV field on LV bus.

## Fazy
- **T0 — dowód i fundament (bez pikseli):** moduł `sld/v3/electrical/`
  (graf terminali z ENM + walidacja inwariantów + domeny napięciowe);
  fixture Stacji B (przelotowa: K-in→F01→S01→F02→K-out; S01→FT1→T1→LV
  terminal→QF-TR1→RGNN-1→QF-01..03→kable→odbiory/RGN-2); WYROCZNIA
  ZGODNOŚCI SCENY: każda krawędź przewodząca sceny MUSI odpowiadać
  krawędzi grafu elektrycznego — na dzisiejszej kompozycji CZERWONA
  (dowód defektu), po T1 zielona na zawsze (zapadka „layout nie tworzy
  topologii"). Test ścieżkowy P0.12 (istnieje ścieżka przez T1; nie
  istnieje żadna 15 kV→nie-transformator→0,4 kV; inaczej SLD INVALID +
  FAIL buildu).
- **T1 — kompozycja z view-modelu:** przebudowa `compose/station.ts`
  (strona nN) na konsumpcję SLD VIEW MODEL z grafu; RGnN jako OBIEKT
  (LVSwitchboard: incomer, aparat główny, sekcje szyn, sprzęgło, odpływy
  QF-xx, SPD/pomiary/kompensacja — rysowane TE, które istnieją w modelu);
  pełny tor T1→LV→incomer→szyna 0,4→odpływy→aparaty→kable→podrozdzielnice
  →odbiory; inwarianty TR2W/KOMPLETNOSC-POLA-TR (piny nadzoru) ZIELONE bez
  modyfikacji asercji; substrat sieci BEZ nN bajtowo nietknięty.
- **T2 — semantyka i wyniki:** oznaczenia referencyjne (-Q1 CB 630 A
  CLOSED / -QE1 ES OPEN; koniec powielania QE1), pole TR z konfiguracji
  rodziny producenta (konsumpcja pakietu switchgear/ nadzoru — ich kanon),
  kotwiczenie danych (T1: 630 kVA·15/0,4·uk·Dyn5 przy transformatorze;
  Stacja B osobno), semantyka N/PE/PEN (uziemienie punktu neutralnego,
  TN-C-S, punkt rozdziału PEN), warstwa wyników nN na SLD (klik odpływu:
  Ib/In/Iz/ΔU/Ikmax/Ikmin/SWZ/I²t/selektywność — ONE SOURCE OF TRUTH
  z modułu nN).
- **T3 — layout i wygląd (dopiero po zieleni T0–T2 i re-werdykcie):**
  compact layout (hierarchy→grouping→rank→compact→label collision→fit),
  wykorzystanie arkusza, etykiety bez elips (łamanie 2-liniowe).

## POLITYKA LOD nN (zadanie właściciela „pomyśl nad LOD")
Zasada: LOD ukrywa SZCZEGÓŁY, nigdy TOPOLOGIĘ ani TOŻSAMOŚĆ.
- **L0 (Fit / cały arkusz) — NIGDY nie ukrywa:** oznaczenia referencyjne
  aparatów, poziomy napięć i etykiety szyn (S01 15 kV / RGNN-1 0,4 kV),
  nazwy pól, nazwa+parametry kluczowe TR, stany OPEN/CLOSED, ostrzeżenia
  krytyczne (SLD INVALID, UNRESOLVED), granica domen napięciowych. Fit ma
  gwarancję czytelności inżynierskiej: minimalny rozmiar glifu/fontu
  wymusza kompaktowy layout, nie odwrotnie.
- **L1 (zbliżenie robocze) — dochodzą:** typy katalogowe, prądy znamionowe,
  przekroje/długości kabli, oznaczenia głowic, układ N/PE/PEN szczegółowo.
- **L2 (inspekcja) — dochodzą:** parametry katalogowe pełne, producent,
  warstwa wyników inline (Ib/Iz/ΔU/Ik/SWZ per element), marginesy doboru.
- Wyjątek bezwzględny: element w stanie błędu/UNRESOLVED renderuje pełną
  etykietę na KAŻDYM poziomie LOD.
- „Ukryto N opisów" dopuszczalne wyłącznie dla treści L1/L2.

## Granice programu
Nasze pliki: `ui/sld/v3/electrical/` (nowy), `compose/station.ts` (strona
nN + wyrocznia), `scene/`, adapter ENM. NIE dotykamy: kanonu symboli poza
addytywnymi glifami (pin rejestru), `engine/` i `ui2/kreatory/stacja/**`
(program RMU nadzoru), `coordination/**`. Backend: bez zmian solverów;
ewentualne braki view-modelu → addytywne endpointy.

## T4 — WIDOK CAD ROZDZIELNICY nN (referencja właściciela, 2026-08-14)

Właściciel dostarczył referencyjny schemat CAD rozdzielnicy nN z odpływami
NSL („do tego ma dążyć schemat nN") — poziom projektu wykonawczego.
Wzorzec architektury: `PodgladRozdzielnicySn` nadzoru (MINI-RMU-CAD) —
symbole z kanonu, tabele funkcji/aparatury, zero lokalnej biblioteki.

Mapowanie cech referencji → model (co mamy / luki JAWNE):
| Cecha referencji | Stan |
|---|---|
| Odpływ = pełny tor z aparatem (NSL: prąd wkładki/podstawy, np. 500A/630A) | MAMY: LVApparatusType (rozłącznik, i_n_a) + LVFuseLinkType (in_a) — para wkładka/podstawa z kombinacji |
| Przekładniki prądowe z danymi (400/5 5VA kl.0,5S) | MAMY: measurements/CT w ENM (add_ct) — render w torze do zrobienia |
| SPD (DEHNventil TN-C) | CZĘŚCIOWO: SPD w liście obiektu LVSwitchboard (P0.4) — typ katalogowy SPD = LUKA katalogu |
| Osobne magistrale N i PE + zejścia per odpływ | MAMY semantykę: nn_earthing_system, żyła powrotna; render magistral = T4 |
| Punkt rozdziału PEN + uziemienie (R≤ wymóg) | CZĘŚCIOWO: układ TN-C-S w meta; wymóg R uziemienia = LUKA modelu (pole stacji) |
| Wymiary szyn zbiorczych (3xP120x10, 1xP60x10) | LUKA katalogu: typ SZYNA_NN (płaskownik: wymiar, ilość na fazę, materiał) |
| Wcinka generatora (G1 z kablem 4x YKXS 1x300 + PE) | MAMY: add_converter_source nn_side + katalog kabli; kable jednożyłowe wiązkami = sprawdzić katalog |
| Odpływy REZERWA rysowane w pełni | MAMY: odpływ bez odbioru legalny (D3) — render jako pełny tor z etykietą „Rezerwa" |
| Cele odpływów z kablem i przekrojem („Zasilanie RS, YKYżo 5x25") | MAMY: chain-walk P0.8 + katalog; etykieta celu z danymi kabla |
| PWP (przycisk ppoż wyłącznika) | LUKA modelu: element PWP — decyzja produktowa czy modelować w P1 |

Kolejność: T4 rusza PO odbiorze T3 (wspólny obszar sld/v3) — najpierw luki
katalogowe/modelu (SZYNA_NN, SPD, R uziemienia — osobna karta danych z
podwójną weryfikacją), potem widok (detail view stacji nN wzorcem
StationInternalView/PodgladRozdzielnicy: symbole z kanonu + wymiarowane
szyny + magistrale N/PE + tory odpływów + tabela aparatury).

---


---

## WERDYKT WŁAŚCICIELA (2026-08-14): T5a = ACCEPT 8,5/10 — ZAMKNIĘTA

T5a nie wraca do przebudowy. PASS: plakietka strukturalna L0, tor transformacji
L1, sekcje+sprzęgło (architektonicznie), agregacja per sekcja, budżet
adaptacyjny, neverAggregate, pełna geometria dopiero w L2. Hierarchia
L0=„co w sieci SN" / L1=„co elektrycznie zawiera stacja" / L2=„pełna sieć nN".

**Dług 1 — sufiks wynikowy plakietki (DEBT, oczekiwany):** wymaga
scenarioId+runId+modelRevision. Docelowa logika (BINDING):
BRAK BIEGU → `nN · 12 odpł.` · AKTUALNY → `nN · 12 odpł. · 186 kW · PASS` ·
NIEAKTUALNY → `… · STALE`. NIGDY stary zielony PASS po zmianie modelu —
freshness jest częścią wyniku.

**Dług 2 — krytyczność odbioru (ENM GAP, nie blocker):** ZAKAZ lokalnego
`critical: true` w komponencie LOD. Powstanie model domenowy
`LoadCriticality` (NORMAL/IMPORTANT/CRITICAL/SAFETY/LIFE_SAFETY lub
klasyfikacja inżynierska docelowego zakresu); renderer tylko konsumuje.

**Nowa twarda zasada LOD (dla T5c i dalej):** dwie klasy geometrii —
WORLD-SCALED (długości linii, odległości stacji, pozycja topologiczna) vs
SCREEN-STABLE/CLAMPED (symbole aparatów, statusy, nazwa stacji, plakietka nN,
znaczniki OPEN/CLOSED, warning/fail — minimalny rozmiar ekranowy, zakaz
skalowania w nieskończoność z kamerą). Szczególnie ważne dla L0.

## PROCEDURA ODBIORU T5b-2 (dyspozycja właściciela — BINDING)

18 punktów P0 bez zmian. Werdykt B-02 = TRZY warstwy dowodowe:
A. MODEL/TOPOLOGY (ENM → terminals → connectivity → scenario),
B. PROJECTION (ten sam graf → LvDomainView → SLD),
C. VISUAL (projektant widzi poprawny tor).
Raport per punkt: `P0.xx · STATUS PASS/FAIL · IMPLEMENTACJA (plik/funkcja/typ)
· TEST (nazwa) · FIXTURE (przypadek) · DOWÓD (oczekiwany rezultat) ·
SCREENSHOT (jeśli wizualny)`. „Testy zielone" NIE wystarcza dla wizualnych.

**Pięć twardych sprawdzeń właściciela:**
1. Sprzęgło: QBC OPEN→CLOSED zmienia rysunek ORAZ connectivity ORAZ wyniki
   zwarciowe (nie animacja symbolu).
2. 2×TR: QBC OPEN → dwa obszary zasilania; CLOSED → solver wie, czy praca
   równoległa dopuszczona/niedopuszczona/warunkowa — NIE renderer.
3. PV: DER → switching/protection → conductor → PCC → BUS (nie ikona→RGnN).
4. SWZ: overlay na konkretnym torze; displayedValue ==
   solverResult(feederId, scenarioId, runId).
5. Boundary: BUS → feeder → protection → cable → boundary terminal →
   foreign-domain chip (nie BUS → Stacja OBCA).

**T5c: HOLD** do zielonego B-02 T5b-2; potem kontrakt `DomainViewState`
(domainType/rootStationId/scenarioId/runId/overlay/selection/camera{zoom,pan}/
returnContext).
