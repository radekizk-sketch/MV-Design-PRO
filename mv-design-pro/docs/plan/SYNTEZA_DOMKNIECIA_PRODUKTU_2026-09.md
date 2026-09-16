# SYNTEZA DOMKNIĘCIA PRODUKTU — MV-DESIGN-PRO PRODUCT COMPLETION SYNTHESIS (2026-09-16)

**Status:** WIĄŻĄCA (rozstrzygnięcia architekta wg misji właściciela z 2026-09-16, §54–§57;
zapis dosłowny dyrektywy: `MISJA_DOMKNIECIA_PRODUKTU_2026-09.md` część II). Podporządkowana kanonowi
(`../v12xx/KANON_V12_XX.md`, `../system/SPEC_*.md`) i misji; **nadrzędna wobec `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §8
tam, gdzie zmienia kolejność lub zakres wycinków** (każda zmiana nazwana w §5 tego dokumentu; mapa §8 dostaje
odnośnik, nie drugą tabelę).
**Baza pomiaru:** HEAD `c307e95f` (drzewo `fable-f3` = zdalny szczyt `b89c13b3` + odbiór fali 3 W3), `main` = `7e84753a`
(#473), wątek badawczy dynamiki `origin/claude/max-dynamic-audit-kzbivg` = `85084102` (99 commitów od `7e84753a`,
318 plików, +70 327/−6 284; PR #475 „NIE DO SCALENIA", głowa PR `1e962025`), PR #474 = ta gałąź (głowa `b89c13b3`),
PR #471 = szkic Codex z 2026-08-10 (`mergeable_state: dirty`, treść zastąpiona przez istniejące guardy — patrz §1 p. 8).
**Metoda:** każdy wiersz jest pomiarem na drzewie (grep, diff, uruchomienie testów), nie deklaracją dokumentu;
dokument nie jest audytem — jest syntezą stanu, roadmapy, użytkowników, toku pracy, fizyki, modeli, SLD, zabezpieczeń,
doborów, OZE/BESS, wymagań WOS/NC RfG, wątku badawczego, shadow review, walidacji, dowodów i raportowania (misja §54).
Powiązane: `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` (klasyfikacja per zdolność), `KARTA_W3_KONWERGENCJA_FIZYKI_2026-09.md`,
`KARTA_B02_POWIERZCHNIE_ANALITYCZNE_2026-09.md`, `../evidence/CONVERGENCE_EVIDENCE.md`, `../twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md`.

---

## 0. Stan faktyczny na dzień syntezy (pomiar, nie deklaracja)

| Pozycja | Stan |
|---|---|
| Drzewo | `c307e95f`: pełna regresja backendu `-m "not pandapower"` **14 557 passed / 1 skipped (bramka `MV_TEST_POSTGRES_URL`) / 1 xfailed (IEEE 13-bus PLANNED)** w 790 s; wyrocznia pandapower **30 passed**; `guardy_z_ci.py` 85 guardów: 84 zielone + `tsconfig_gate_guard` czerwony **z zapadki w dół** (dług typów poza bramką 119 → 117 — budżet obniżony w tym odbiorze); lint jak CI 4/4; 799 testów własnych guardów; vitest FULL i e2e w toku łańcucha przedpushowego |
| Wycinki W1–W12 (mapa §8) | W1 wykonana i odebrana (2026-09-09); W2 + W2-B + W2-C wykonane; **W3 w odbiorze fali 3** (TRACE-V2, W3-G1/G2/G3, W3-H zamknięte; W3-J „jedno źródło progów napięcia" i V12.7 „prezentacja inżynierska" w toku u agentów na bazie `c307e95f`); B-02 dla powierzchni analitycznych: werdykt właściciela 8,5/10 (2026-09-16) z listą poprawek V12.7 |
| Główny dług architektoniczny zmierzony w tej syntezie | (1) **dowód regulacyjny bez bezpiecznika**: `_execute_dynamic_stability` (`enm/canonical_analysis.py:1633-1638`) wpisuje `proof_status="complete"`/`reporting_status="reportable"` NA SZTYWNO dla porównania progowego z opcji biegu; certyfikat zgodności NC RfG powstaje z werdyktów testów T14/T15, które są tautologią (`solvers/ncrfg_ptpiree/engine.py:646-655`: `simulated_voltage = limiting.voltage_pu; margin = simulated_voltage − limiting.voltage_pu ≡ 0`) — B-01; (2) **`no_module` liczy się jak gotowość**: `calculation_readiness/service.py:91` `all(s in ("ready","n_a","no_module"))` → `ready`; literał `no_module` w 21 miejscach `backend/src` i 13 w `frontend/src` (poza testami) mimo ZASADY NR 1; (3) **trzy implementacje NC RfG** (solver T01–T20; `application/ncrfg_compliance/checker.py` T1–T18 z własnym silnikiem 18 testów, żywy przez `GET /api/ncrfg-tests/cases/{id}/compliance` → sekcja „Zgodność przekrojowa" w `ui2/oze/macierz`; martwa wyspa kliencka `station-der/NcRfgComplianceBadge.tsx` + `DerValidationBanner.tsx` + `derPowerValidation.ts`, 0 importerów poza 3 własnymi testami); (4) **k_sc = 1,1 jako domyślka dopuszczona do wyniku**: `network_model/core/inverter.py:28` `k_sc: float = field(default=1.1)` + drugie pole `k_sc_zrodlo` (dwie dane, które muszą się zgadzać), gotowość degraduje tylko do `partial` (`inverter.k_sc_assumed`), dobór aparatury/nastawy/pakiet dowodowy konsumują wynik bez pytania o proweniencję — sprzeczne z dyrektywą właściciela „K_sc pozostaje DEFAULT_FORBIDDEN"; (5) **liczby z żądania jako dowód**: `POST /api/equipment-proof/pack` (`api/schemas/equipment_proof.py:30` `required_fault_results: dict`) i `POST /api/protection-coordination/*` przyjmują prądy zwarciowe wprost z żądania, bez związania z biegiem, który je policzył (obejście odtworzone przez wątek badawczy na `main`: `run_id="BIEG-KTORY-NIGDY-NIE-ISTNIAL"` + 999 kA → kompletny pakiet dowodowy); (6) `STAN_REPO.md` (LIVING, „czytaj NAJPIERW") ostatnio aktualizowany 2026-05-29 i deklaruje „Stabilność dynamiczna RMS — PODPIĘTE", co jest fałszem (0 konsumentów `stability_rms` poza własnym pakietem) |
| Wątek badawczy dynamiki (izolowane laboratorium) | 32 moduły `backend/research/dynamic_lab/*` + `research/kwalifikacja.py` + 44 pliki testów = 39 298 linii; poziomy weryfikacji wg własnego raportu wątku: IMPLEMENTED TAK · SOFTWARE-VERIFIED TAK (CI 9/9 na `a6ee782c`) · MATHEMATICALLY/NUMERICALLY/PHYSICALLY SUPPORTED CZĘŚCIOWO · **PHYSICALLY VALIDATED NIE · PRODUCTION-READY NIE · REGULATORY-EVIDENCE-READY NIE**; shadow review `b55cd086` (2026-09-13): REJECT CURRENT DELTA — P1-B55-01 (re-inicjalizacja meldowała `Δy=0` przy rzeczywistym 1,01), P1-B55-02 (niezgodność baz BESS nieegzekwowana przez `ModelDynamiczny`, błąd energii 2:1), P1-B55-03 (kampania mutacyjna zależna od opcjonalnego ANDES), P2-B55-04 (twierdzenie o niezmienniczości permutacji szersze niż pomiar); wątek zmienił też **kod produkcyjny** (ok. 60 plików `backend/src`, w tym FROZEN `solvers/ncrfg_ptpiree/{engine,contracts}.py` +261/−28 bez zgody B-01) — klasyfikacja per element w §3 |

---

## 1. Odpowiedzi na 28 pytań misji (§55)

### 1. Jaki dokładnie produkt końcowy budujemy?

Jedno środowisko pracy inżyniera elektroenergetyka dla sieci **SN – transformator – nN z OZE/BESS**, w którym jedna
prawda modelu (ENM; DT-1/DT-2) prowadzi przez cały łańcuch: cel projektu → model (import, kreatory, katalog) → gotowość →
obliczenia (rozpływ, zwarcia, doziemne, nN, cieplne, jakość, dynamika) → dobór (kable, transformatory, aparaty, CT/VT,
zabezpieczenia, kompensacja) → warianty i scenariusze → zgodność (NC RfG / wymagania WOS, IRiESD) → schemat (SLD jako
projekcja) → dokumentacja (pakiety dowodowe, wniosek OSD, certyfikat, zestawienia, nastawy) → odbiór i as-built.
Granica produktu: **SN 6–36 kV, TR SN/nN, nN 0,4 kV**; sieć WN wyłącznie jako równoważnik zasilania (S''kQ, I''kQ, R/X,
U_n górnej strony) — nie jako modelowana sieć (rozstrzygnięcie A-1 w §4; wnioski z OD-19: jawna szyna 110 kV w
rozpływie NR daje rozwiązanie zdegenerowane). Każda liczba widoczna dla użytkownika pochodzi z solvera/analizy z
proweniencją, ma stopień dowodowy i ślad WHITE BOX; UI nie liczy fizyki.

### 2. Kim są jego użytkownicy?

1. **Projektant sieci SN/nN** (biuro projektowe, wykonawca): projekty nowych ciągów, stacji SN/nN, modernizacji.
2. **Inżynier przyłączeń OZE/BESS** (deweloper, EPC, doradca): studium przyłączeniowe, wniosek o warunki, dokumenty
   zgodności NC RfG, hosting capacity, kompensacja.
3. **Specjalista zabezpieczeń** (OSD, wykonawca): nastawy, koordynacja, selektywność SN↔nN, doziemne, LoM/SPZ.
4. **Inżynier OSD** (uzgodnienia, weryfikacja projektów obcych, ocena studiów przyłączeniowych).
5. **Audytor / weryfikator** (niezależna kontrola: pochodzenie wyników, pakiety dowodowe, powtarzalność).
6. **Inżynier rozruchu / eksploatacji** (odbiór, iniekcja wtórna, as-built, linia bazowa).
Role są projekcjami jednego stanu projektu (misja §22), nie osobnymi aplikacjami.

### 3. Jakie zadania zawodowe mają wykonywać?

Klasy projektów akceptacyjnych (misja §24) są jednocześnie kluczowymi zadaniami użytkownika i definicją ukończenia
produktu (§60): **A** nowa sieć promieniowa SN z odbiorami i stacją SN/nN; **B** pierścień z NOP (N-1, odtworzenie
zasilania); **C** przyłączenie OZE/BESS (studium, hosting, NC RfG, dokumenty OSD); **D** stacja SN/nN z obwodami nN
(pętla zwarcia, SWZ, dobór wyłącznika głównego i odpływów); **E** sieć kompensowana (zwarcie doziemne, 51N/67N,
admitancyjne, napięcia dotykowe); **F** modernizacja (as-is → wariant → porównanie → wybór). Zadania przekrojowe:
dobór przekroju/aparatu z uzasadnieniem, nastawy z pakietem dowodowym, raport zgodności z proweniencją, SLD
projektowe/powykonawcze, protokół odbioru.

### 4. Jak powinien wyglądać ich najlepszy workflow?

Kanon E1–E8 (`../uiux/FLOW_PROJEKTANTA_2026-07.md`) z jednym mechanizmem „następna najlepsza akcja" znającym klasę
projektu i jej DoD: **E1** cel + klasa projektu + warunki OSD → **E2** model (import XLSX/CGMES, kreatory stacji/pola/
źródła, katalog-first) → **E3** gotowość per obliczenie z nazwanymi brakami i akcją naprawczą → **E4** obliczenia
(scenariusze MAX/MIN, N-1, warianty) → **E5** dobór i zabezpieczenia (kandydaci, ranking, uzasadnienie, nastawy w
modelu) → **E6** ocena techniczna wyników (wartość – granica – margines – podstawa – stopień dowodowy) → **E7**
zgodność i dokumenty (NC RfG/WOS, wniosek OSD, certyfikat, pakiety dowodowe, zestawienia) → **E8** SLD/raport/
odbiór/as-built. Zasady: nigdy nie pytać o dane, które system zna (propagacja z proweniencją); każdy błąd
naprawialny w miejscu; świeżość wyników z koperty rewizji; wynik zawsze pokazany na właściwym schemacie.

### 5. Co już działa dobrze? (z dowodem)

- **Jedna prawda sieci** — ENM per projekt (CV-1), rewizje z dziennika (CV-2), scenariusze i warianty przez
  `apply_scenario`/`bieg_wariantu` (CV-3), jeden assembler wejścia solverów (CV-4.1/4.2), import XLSX → ENM przez jeden
  kompilator grafu + kasacja legacy ORM (W1); guardy wskrzeszenia.
- **Rozpływ mocy**: NR/GS/FD jako opcja biegu (W3-G1), rozpływ per wyspa z nazwaną odmową (K3b), szyny PV z modelu
  (A3-04), wyrocznia pandapower z proweniencją (K7 + D-2), pasma wiarygodności (W3-G2), porównanie NR↔FD.
- **Zwarcia IEC 60909**: MAX/MIN (K7: Ik''(PCC,MIN) = I''kQmin rel 1e-9), wkłady gałęziowe i ślad na żądanie, sieć 50
  stacji 153 s → 7,7 s (PERF-SC-50), ekran pasma MIN/MAX (W3-G3), parytety złotych hashy 264/132.
- **Katalog-first**: brama katalogowa, jeden predykat wymagalności (W3-I), katalogi frontu przeniesione do backendu
  (FAB-L/M), Reference Engine (OSD ENEA, komórki producentów).
- **Zabezpieczenia SN**: IDMT na jednym jądrze IEC 60255 (W3-A), metodyka nastaw Hoppel/IRiESD z pakietem dowodowym
  (W3-C1/C2), ALF z jądra + obwód wtórny CT/VT w modelu (W3-B), koordynacja TCC.
- **Proof Engine**: 8 pakietów + wywody KaTeX (zasada 2026-07-22), kwantyzacja kontraktu (DT-11), determinizm.
- **Powierzchnie analityczne B-02**: katalog kart z gotowością i „Ocena techniczna wyników" — werdykt właściciela
  8,5/10; jednostki w jednym miejscu (W3-F); zero fabrykacji ekranów (W2).
- **Dyscyplina dowodowa repo**: 85 guardów + 799 testów własnych, pełny łańcuch przedpushowy, CI 9 workflowów,
  fikstury harnessu z realnego backendu (E2E-FULL-FIX-3), mapa domknięcia z dowodów.

### 6. Co działa częściowo?

- **Zabezpieczenia**: brak funkcji kierunkowych 67/67N, 21, 87T, 25, 50BF, grup nastaw, macierzy TRIP; nastawy poza
  modelem (`update_relay_settings` fasada) — W4.
- **Uziemienie i model fazowy**: 6 reprezentacji uziemienia, `meta.field_specs` zamiast typowanego `Bay`, TT/IT bez
  fizyki, rozpływ niesymetryczny bez konsumenta — W5.
- **Dynamika**: fasada progowa z opcji biegu prezentowana jako dowód (§0 p. 1), `stability_rms` bez sprzężenia z siecią
  (U ≡ 1,0; P0-02…P0-06 audytu), `frt_hvrt` z trajektorią będącą wejściem (P0-07), readiness „Można uruchomić
  obliczenia" dla ścieżki bez fizyki (P0-10) — W6.
- **BESS**: pola `bess_mode`/`soc_*`/`p_charge_kw` zapisywane, 0 czytelników w solverach i analizach (I1–I9) — W6.
- **Jakość energii**: flicker poprawny fizycznie, ale w `application/` (litera NOT-A-SOLVER); harmoniczne pod
  „akademickimi"; asymetria ≠ VUF; brak raportu EN 50160 — W6.
- **NC RfG / WOS**: 20 testów, 5 profili operatorów, certyfikat i wniosek OSD — ale T14/T15 tautologia, T16/T17/T18
  z deklaracji, brak wersjonowania profili (data obowiązywania, warunki przyłączenia) — W6-5.
- **Raporty**: wniosek OSD, certyfikat, studium, pakiety dowodowe istnieją; brak BOM, doboru przekroju, rejestru
  założeń, pakietu do podpisu, macierzy wymagań — W10.
- **SLD**: v3 renderuje projekcję, ale semantyka (BFS ścieżki zasilania) po stronie klienta, nadpisania geometrii w
  trzech magazynach — W7.
- **V12.6 pakiet akademicki**: 10 rodzajów jako jedyna implementacja (koordynacja izolacji, udar, uziemienia IEEE 80,
  rozruch), z długiem stałych zaszytych (OD-15) — W6/W10.

### 7. Co jest niepołączone? (backend bez toku pracy albo UI bez zdolności)

`analysis/voltage_profile/*` + `GET /api/quality/voltage-profile` ↔ `ui/voltage-profile/*` (0 wywołań trasy, 0 importów
komponentu; B6 — rozstrzygane w W3-J/W6); `stability_rms` (0 konsumentów); `power_flow_unbalanced` (bez projektu nN
fazowego); `validate_selectivity` (operacja bez ekranu); `sld_overrides` (trzy magazyny, jeden konsument); CGMES
(1 843 linie, 46 testów, 0 tras); `load_profile_ref` (zapis bez odczytu); `der_dynamic` katalog ↔ `frt_hvrt` (stałe
`tp/tiq/K` zaszyte — OD-15(b)); `GET /api/oze-analysis/frt-trajectories` ↔ ocena NC RfG (ewaluator nie czyta
trajektorii); `certificate_evidence` w biegu NC RfG ↔ dokumenty (dowód certyfikacji dopięty, ale bez stopnia
dowodowego testów); readiness `stability`/`frt_hvrt` ↔ rzeczywista zdolność (deklaruje gotowość ścieżki bez fizyki).

### 8. Co jest zbędne? (kasacja z bramką wskrzeszenia)

- Martwa wyspa kliencka NC RfG: `station-der/NcRfgComplianceBadge.tsx`, `DerValidationBanner.tsx`,
  `derPowerValidation.ts` + 3 testy (§15.3 pakietu decyzyjnego; potwierdzone na `c307e95f`: 0 importerów).
- Literał i stan `no_module` (21 + 13 miejsc) — stan zastępowany przez `blocked` z nazwanym brakiem (A-7).
- `application/stability/voltage_trajectory.py` (krzywa szablonowa τ) i `stability_rms` — po zastąpieniu nowym
  rdzeniem (D-02(b), D-13) — kasacja pod B-01 (OD-20).
- Drugi silnik NC RfG w `application/ncrfg_compliance/checker.py` (18 testów T1–T18) — po przepięciu trasy
  `/compliance` na kanoniczny solver przez istniejący `model_bridge.py` (A-5).
- PR #471 (Codex, 2026-08-10): `route_prefix_guard`, `v126_contract_text_guard`, `guardy_z_ci`,
  `verification_entrypoints_guard` istnieją już na gałęzi (potwierdzone w biegu `guardy_z_ci` na `c307e95f`);
  kasacje z #471 (`protection-comparison`, `variantStore`) wykonane inaczej w CV-3.3-B2 — PR do zamknięcia przez
  właściciela jako zastąpiony (nie mój PR; nie zamykam cudzych).
- Reszta klasy K-F z mapy §4 (`CaseConfigPage.tsx` skasowana w W3-G1; `AutomationPanel`/`FdirPhase`,
  `EarthingSystemSelector.tsx`, `/api/fault-loop/compute` → W5).

### 9. Co jest duplikacją?

Zmierzone i rozstrzygnięte w W3 (`KARTA_W3…` §0): IDMT ×5 → jądro; metodyka ×3 → Hoppel; ALF ×2 → jądro; hosting ×2,
straty/OLTC ×2, ranking N-1 ×2 → 410 + jeden tor; `source_compliance` → NC RfG; predykat katalogu ×2 → jeden;
skalowanie jednostek 252 miejsca → `pochodne/jednostki.py`; progi napięcia (W3-J w toku). **Pozostałe duplikaty
poza W3**: NC RfG ×3 (A-5), stabilność ×2 (`stability_rms` vs `application/stability` — D-06/D-13 → W6), tabela BIL
×2 (parytet testem W3-E; jedno źródło w W6-8), słowniki niepełności ×2 (`partial` vs `incomplete` — A-8), numeracje
testów ×2 (`T01` vs `T1` — A-5), przeliczniki baz BESS (laboratorium usunęło własny duplikat — wzorzec dla W6-3),
konwencje znaków P/Q DER w rozpływie vs dynamice (jedno źródło w W6-1: `konwencje.py` laboratorium jako baza).

### 10. Co jest architektonicznie błędne?

1. **Dowód bez bezpiecznika** — statusy dowodowe wpisywane stałą zamiast wyprowadzane z klasyfikacji zdolności
   (§0 p. 1); certyfikat nie rozróżnia „wykazane" od „zadeklarowane" (kolumna „Podstawa" nie istnieje).
2. **Ewaluator wymagań wytwarza wielkość, którą ocenia** (T14/T15) — zamiast konsumować wynik symulacji (D-05).
3. **Kontrakty `stability_rms`/`frt_hvrt` zakodowały rozprzężenie od sieci** (`enm_ref` nieczytany, `integrator`
   nieczytany, `target_ref` ignorowany) — rozszerzanie ich jest droższe niż wymiana (D-02(b), D-03).
4. **Domyślka fizyczna dopuszczona do wyniku projektowego** (`k_sc = 1,1`) i **liczby z żądania jako dowód**
   (§0 p. 4–5) — granica autorytetu wyniku nie istnieje.
5. **Gotowość fail-open** (`no_module` → `ready`; readiness synchronicznych `n_a`; `ready` bez sprawdzenia danych).
6. **Trzy prawdy zgodności NC RfG** i dwie przestrzenie numeracji.
7. **Warstwa prezentacji z fizyką** (BFS ścieżki zasilania SLD w kliencie; W7) i **metadane produkcyjne w pierwszym
   planie UI** (V12.7 w toku).
8. **Dokument LIVING sprzeczny z kodem** (`STAN_REPO.md`) — dwie prawdy o stanie repo (§57 misji: superseduję w S-5).

### 11. Co wymaga rozszerzenia?

ENM: parametry dynamiczne maszyn synchronicznych (Xd, X'd, X''d, T'd0, T''d0, H, D, nasycenie), przekształtników
(PLL, ogranicznik prądu z priorytetem P/Q, stałe regulatorów, tryb GFL/GFM z parametrami), BESS jako stan energii
(E_n, P_ch/P_dis, η_ch/η_dis, SOC_min/max, SOC_0), wiatru (typ 1–4, dwumasowość, crowbar), profili czasowych
(odbiory, generacja, ceny) z konsumentem; `OperatingScenario` o zdarzenia w czasie (`FaultDelta`, `der_trip`,
zmiana topologii, komendy regulacji); `CanonicalRun` o kontrakt wyniku czasowego (ResultSet dynamiczny, D-08(b));
readiness per rodzina źródła i per zdolność; profile WOS z wersją i datą obowiązywania (D-10); katalog `APARAT_SN`
o klasę 36 kV (brak danych — OD-17); Reference Engine o pozostałych OSD (OD-17).

### 12. Co wymaga wymiany?

`stability_rms` (rdzeń bez sieci) → nowy rdzeń DAE ze sprzężeniem sieciowym (W6-2, z laboratorium: `siec`,
`silnik`, `calkowanie`, `zdarzenia`, `reinicjalizacja`, `skonczonosc`); `voltage_trajectory.py` (szablon) → trajektoria
z symulacji; ewaluator T14/T15/T16/T17/T18 → konsument trajektorii (B-01: OD-20); `frt_hvrt/engine.py` → model
urządzenia z katalogu (OD-15(b) lub wymiana razem z rdzeniem); `checker.py` (drugi silnik) → most ENM → solver
kanoniczny; `no_module` → `blocked` z nazwanym brakiem; `k_sc` dwa pola → jedno pole z wyprowadzoną proweniencją i
kontraktem zdolności zależnych (A-3); statusy dowodowe stałe → wyprowadzane z rejestru zdolności (A-2).

### 13. Jakich obliczeń brakuje? (stan ustalony)

Dobór przekroju kabla/linii (IEC 60364-5-52, IEC 60287, obciążalność SN z katalogu z korektami ułożenia i
temperatury — W10); obciążalność cieplna i starzenie transformatora (IEC 60076-7, hot-spot; wymaga profilu — W6-6);
koordynacja izolacji pod kanonicznym solverem z pakietem dowodowym (H3/H9 — W6-8); prąd załączania/blokada 2.
harmonicznej z modelu nasycenia (G4 — W6-8, po OD-15(d)); pętla zwarcia TT/IT/RCD i rozpływ 4-przewodowy z modelu
fazowego (W5); zwarcie doziemne sieci kompensowanej end-to-end (Y0 z uziemienia z modelu, Ic/Petersen, U_dot/U_krok z
geometrii — W8); selektywność SN↔nN (B5 — W4); straty roczne i bilans energii (QSTS — W6-6); impedancja harmoniczna
i skan częstotliwościowy/rezonans (W6-7); VUF wg składowych (OD-15(c)); odtworzenie zasilania/NOP (W10); model
kosztowy (OD-16).

### 14. Jakich symulacji brakuje? (czas)

RMS ze sprzężeniem sieciowym (inicjalizacja z rozpływu, DAE, zdarzenia, re-inicjalizacja); trajektorie FRT/HVRT z
modelu urządzenia (nie z wejścia); odpowiedź częstotliwościowa P(f) (LFSM-O/U, FSM) jako przebieg f(t)/P(t);
odbudowa mocy czynnej P(t) po zwarciu; szybki prąd zwarciowy Iq(t); praca wyspowa / LoM / synchronizacja; rozruch
autonomiczny (black start) i tłumienie oscylacji mocy (POD); inercja syntetyczna (dla wymagań typu C/D, jeśli profil
WOS ją nazywa); rozruch silników na encji silnika; QSTS (szereg czasowy rozpływów z profilami i dyspozycją BESS);
czas krytyczny zwarcia (CCT) jako wielkość projektowa.

### 15. Jakie wynikają z WOS/NC RfG?

WOS = **właściwy operator systemu** (art. 41 NC RfG: ocena zgodności modułu przez cały okres eksploatacji, prawo
żądania testów). Podstawa w repo: NC RfG (UE 2016/631), IRiESD pięciu operatorów (profile `catalog/profiles/nc_rfg/*.yaml`,
15 kluczy liczbowych, 0 różnic między pięcioma operatorami — pomiar 2026-09-16; zróżnicowanie pozorne do czasu OD-21), Procedura testowania modułów wytwarzania energii
PTPiREE **wer. 3.0** (obowiązuje od 2026-01-01; źródło: https://ptpiree.pl/kodeksy-sieci/procedura-testowania/,
plik https://ptpiree.pl/wp-content/uploads/2025/12/Procedura-testowania_wer_3.0.pdf) — repo już pinuje
`procedure_version = "PTPiREE Procedura testowania v3.0"` i kanon T01–T20 (`../analysis/NC_RFG_PTPiREE_TESTY_KANON.md`).
Podział wymagań wg rodzaju twierdzenia (A-2, rejestr `ClaimKind`):
- **Zachowanie dynamiczne** (dowód wyłącznie z ZWALIDOWANEJ symulacji): T01–T04 (LFSM-O, LFSM-U, FSM, odbudowa
  częstotliwości → f(t), P(t)), T14 LVRT, T15 HVRT (U(t) vs obwiednia), T16 odbudowa P po FRT (P(t)), T17 prąd bierny
  podczas FRT (Iq(t)), T18 wyspa / rozruch autonomiczny / tłumienie oscylacji; dodatkowo — jeśli profil WOS/IRiESD
  danego OSD je nazywa — inercja syntetyczna i RoCoF/LoM (koordynacja z SPZ, J6).
- **Konfiguracja zadeklarowana** (deklaracja / karta katalogowa jest właściwą podstawą): T05 regulacja P, T06–T09
  tryby Q/U/cosφ i zdolność bierna (z zastrzeżeniem: zdolność Q(P) da się WYKAZAĆ rozpływem — W6-5 promuje T09 do
  wyniku obliczonego), T10/T11 P_MAX/P_MIN, T12/T13 zaprzestanie/zmniejszenie generacji, T19 telemechanika/SCADA/
  rejestrator, T20 THD_U (z pomiaru/karty; W6-7 daje wynik obliczony z widma).
Program ramowy testów i „WOS 2025" jako zbiór szczegółowych wymagań operatora: pełna lista klauzul z datą obowiązywania
i datą warunków przyłączenia wchodzi do profili jako dane wersjonowane (D-10(a)); **repo nie niesie treści programów
ramowych PTPiREE ani IRiESD 2025 poza pięcioma profilami** — pozycja OD-21 (właściciel wskazuje dokumenty źródłowe
lub potwierdza pobranie ze stron publicznych OSD; treści normatywnych nie fabrykuję).

### 16. Jakich modeli urządzeń brakuje?

Maszyna synchroniczna (4./6. rząd) z AVR/governor/PSS (rodzina wykluczona przez readiness — P0-10); przekształtnik
GFL z PLL, regulatorem prądu, ogranicznikiem z priorytetem, FRT z Iq; GFM (droop/VSM) z ograniczeniem prądu;
BESS jako magazyn (SOC, energia, sprawność, limity) z regulacją częstotliwościową i dyspozycją; wiatr typ 1–4 (IEC
61400-27: DFIG z crowbarem, dwumasowość, pitch); regulator elektrowni (PPC) z limitem eksportu w PCC (D-07 → po
modelach urządzeń); silnik asynchroniczny jako encja (rozruch); obciążenie dynamiczne (ZIP w czasie); OLTC w czasie;
ogranicznik przepięć/koordynacja izolacji jako element z danymi (H4 — dane OD-17).

### 17. Jakie luki istnieją w UX?

Brak formularza scenariusza dynamicznego z osią zdarzeń i ekranu trajektorii (kanały U, f, P, Q, δ, SOC) z obwiednią
FRT; brak etykiety stopnia dowodowego przy każdym werdykcie (wiarygodny/zadeklarowany/model niezwalidowany/bez
symulacji) na ekranach OZE i w macierzy NC RfG; matematyka w części ekranów jako surowy tekst (V12.7 — w toku);
metadane produkcyjne (UUID, hashe) w pierwszym planie (V12.7 — w toku); brak ekranu „Zabezpieczenia w modelu"
(nastawy jako część `Bay` — W4); brak ekranu dziennika/rewizji i cofnij/ponów (A6/A10 — W9); brak NBA dla E6–E8 z
realnych danych (W9); „napraw" jako nawigacja (K4 — W9); brak deklaracji zakresu napięć produktu w UI (A-1);
brak ekranu doboru przekroju i BOM (W10).

### 18. Jakie ręczne mosty wykonuje użytkownik?

(1) przenosi prądy zwarciowe do doboru aparatury i koordynacji „ręcznie" przez żądanie API z liczbami (§0 p. 5) —
zamykane w S-2; (2) liczy dobór przekroju kabla poza systemem (brak solvera — W10); (3) wpisuje k_sc albo
przyjmuje 1,1 bez karty producenta — S-2 blokuje konsumpcję, OD-17 dostarcza dane; (4) sprawdza NC RfG w kilku
miejscach (macierz, `/compliance`, certyfikat) i sam godzi trzy werdykty — S-3; (5) przenosi profil obciążenia/
generacji poza system (QSTS — W6-6); (6) tworzy BOM, rejestr założeń, pakiet do podpisu w arkuszu (W10; mapa §5
„wyjścia do Excela"); (7) rysuje SLD nN/stacji w CAD i wraca z poprawkami bez round-tripu (W12); (8) prowadzi
odbiór/rozruch poza systemem (W11); (9) wersjonuje profile OSD ręcznie (D-10).

### 19. Jakie luki istnieją w SLD?

Semantyka po stronie klienta (BFS ścieżki zasilania) zamiast projekcji `TopologyView` backendu (B1/B2); trzy magazyny
nadpisań geometrii (W-2: konsolidacja do `branch_ref` + `waypoints[]`); brak rewizji rysunku; brak nakładek
wyników dynamicznych i stanów scenariusza w czasie (W6-4 dostarcza dane, W7 nakładkę); brak arkuszy stacji nN jako
projekcji tej samej prawdy; CAD round-trip (W12). Werdykt wizualny nadal wyłącznie właściciela (B-02).

### 20. Jakie luki istnieją w zabezpieczeniach?

Nastawy poza modelem (druga prawda) i brak zapisu z koordynacji do `BayProtectionControlUnit`; brak 67/67N (RCA,
polaryzacja), admitancyjnych, 21, 87T, 25, 50BF, grup nastaw, macierzy TRIP; brak relacji „zabezpieczenie → chroniona
gałąź" (przestrzenie kluczy prądów zwarciowych i roboczych rozłączne — zmierzone przez wątek badawczy; blokuje
związanie prądu roboczego z biegiem rozpływu w koordynacji — A-4 wprowadza relację w W4); selektywność SN↔nN;
koordynacja LoM z SPZ; iniekcja wtórna i czas zadziałania vs nastawa (W11); IEC 61850/SCL (decyzja zakresu — poza
kolejką do W11).

### 21. Jakie luki istnieją w raportach?

Kolumna „Podstawa werdyktu" (stopień dowodowy) w certyfikacie, wniosku OSD i studium — S-1; BOM, dobór przekroju,
rejestr założeń, pakiet do podpisu, macierz wymagań (L9) — W10; raport EN 50160 zintegrowany i raport jakości —
W6-7; pakiet dowodowy dynamiki (trajektorie, zdarzenia, tożsamość scenariusza) — W6-5; pakiet dowodowy koordynacji
izolacji (H9) — W6-8; dokument „wynik nieaktualny" z powodem w każdym eksporcie (koperta rewizji — CV-2 dostarcza,
eksporty nie wszystkie ją cytują — inwentarz w S-1).

### 22. Jakie luki istnieją w validation/evidence?

Brak trzeciej osi proweniencji (stopień dowodowy WYNIKU, nie pola wejścia) — A-2 wprowadza `EvidenceTier` +
`ClaimKind` w `solver_input/provenance.py`; brak wyroczni zewnętrznej dla dynamiki (ANDES — A-10: opcjonalne
środowisko wyroczni jak pp-venv, osobny job CI, znacznik `andes`, zero skipów w głównym biegu); brak testów
niezmienników fizycznych w czasie (bilans energii, całka pierwsza, rzędy metod — z laboratorium); brak kampanii
mutacyjnej w CI (opcjonalny job — A-10); brak związania wyniku zwarciowego z biegiem (pieczęć 6 wielkości — A-3);
brak deklaracji precyzji międzyplatformowej dla wyników dynamiki (kontrakt DT-11 rozszerzony o „zadeklarowaną
precyzję", nie ostatni bit — potwierdzone pomiarem wątku: `np.linalg.inv` nieprzenośne między mikroarchitekturami).

### 23. Co warto przejąć z research? (szczegóły i klasy w §3)

PRZEJĄĆ/ZAADAPTOWAĆ: model zaufania D-09 (`EvidenceTier`, `ClaimKind`, `CapabilityEvidence`, `BRAK_DOWODU_PL`,
rejestr fail-closed), bramka dowodowa certyfikatu (dwie niezależne bramki: dowodowa + kompletności), readiness
fail-closed dla braku modułu, granica autorytetu wyniku zwarciowego (proweniencja wyprowadzana, nie deklarowana;
pieczęć wiązania biegu; zdolności zależne od wkładu falownikowego jako zamknięty kontrakt), trzy stany k_sc
(deklaracja / brak / dane niepoprawne), dobór aparatu pola z tabliczki i klasy napięciowej (pre-dobór, jawnie
rozdzielony od doboru normatywnego), niezmienniki katalogu z klasyfikacją mocy (konieczność fizyczna / wymóg normowy /
zakres produktu / wiarygodność), warstwa algebraiczna sieci + pętla DAE + integratory + zdarzenia + re-inicjalizacja +
skończoność + tożsamość scenariusza + kontrakt wyniku czasowego, urządzenia (SM 4. rzędu, GFL/GFM, BESS z SOC, PPC,
DFIG bez crowbaru z zakresem ważności), regulatory z anti-windup, łańcuch baz BESS, ewaluator FRT konsumujący ślad
biegu, drabina dowodów C×W, macierz pokrycia, uprząż porównania postaci, inwentarz ryzyka postaci modelu,
wzorce ANDES (jako wyrocznia opcjonalna), rama mutacyjna (jako narzędzie laboratoryjne), globalizacja Newtona w
solverze sieci laboratorium (wzorzec dla własnego NR? — NIE: rdzeń PF FROZEN; wzorzec tylko dla nowego rdzenia
dynamiki), korekta `StationInternalView` w `CLAUDE.md` (już zrobiona u nas 2026-09-02).

### 24. Co z research odrzucić?

ODRZUCIĆ (nie scalać): edycje FROZEN `solvers/ncrfg_ptpiree/{engine,contracts}.py` (+261/−28; `capability_id` w
`TEST_CATALOG`, `_module_evidence_status` w silniku) — słuszna idea, złe miejsce: mapowanie `test_id → capability`
i bramka żyją POZA solverem (A-2), a zmiana solvera czeka na OD-20; scalenie mechaniczne 60 plików `backend/src`
wątku na nasze drzewo (W1–W3 zmieniły te same pliki: `canonical_analysis.py`, `domain_operations_v2.py`,
`calculation_readiness/service.py`, `governance.py`) — każdy element wchodzi przez kartę z parytetem, nie przez merge;
twierdzenia o walidacji fizycznej (żadna zdolność nie awansuje do `VALIDATED_SIMULATION`); uzależnienie kampanii
mutacyjnej od ANDES w głównym biegu (P1-B55-03); twierdzenie o niezmienniczości permutacji szersze niż pomiar
(P2-B55-04); re-inicjalizacja z fałszywym `Δy=0` (P1-B55-01 — do naprawy przed adaptacją); egzekwowanie baz BESS
poza `ModelDynamiczny` (P1-B55-02 — do naprawy przed adaptacją); `stability_rms` „rozszerzyć" (D-02(a)); `PLANS.md`
jako nośnik programu dynamiki (D-01(b) — struktura W1–W12 istnieje i obowiązuje); dokumenty planistyczne wątku
(`PLANS.md`, `STAN_REPO.md` w wersji wątku) — superseduję własnymi; modyfikacje fikstur nN `01…18_*.json` bez
naszego generatora (regenerować u nas, nie kopiować).

### 25. Jak powinien wyglądać target product?

Warstwy bez zmian (prezentacja → aplikacja → domena → solvery → analiza; NOT-A-SOLVER, WHITE BOX, jedna prawda), z
trzema dodatkami architektonicznymi: (a) **trzecia oś proweniencji** — stopień dowodowy każdego WYNIKU (rejestr
zdolności, fail-closed) czytany przez readiness, ekrany ocen, certyfikat, wniosek OSD, studium, pakiety dowodowe;
(b) **granica autorytetu wyniku** — dobór aparatury, nastawy, pakiety dowodowe i koordynacja konsumują wyłącznie
wyniki ZAPISANYCH biegów z miarodajną proweniencją (pieczęć wiązania), nigdy liczby z żądania ani domyślki
fizyczne; (c) **oś czasu jako pierwszorzędny wymiar** — `OperatingScenario` ze zdarzeniami, kontrakt wyniku
czasowego, rdzeń DAE ze sprzężeniem sieciowym, profile i QSTS, BESS jako stan energii — pod jednym rejestrem biegów
i jedną koperta rewizji. Ekrany: E1–E8 z NBA; każdy werdykt = wartość – granica – margines – podstawa – stopień
dowodowy; matematyka w KaTeX; metadane w warstwie audytowej; SLD jako projekcja z nakładkami czasu.

### 26. Jak dojść do niego ewolucyjnie?

Wzorzec misji §59 na każdym wycinku: bieżący runtime → docelowy właściciel → pełna ścieżka pionowa → dowód →
migracja konsumentów → kasacja starego toru → guard wskrzeszenia. Kolejność bez big-bangu: najpierw bezpieczniki
(dowód, autorytet, gotowość, `no_module`) na dzisiejszym runtime — nie wymagają nowej fizyki, usuwają fałsz widoczny
dziś; potem konwergencja NC RfG (jeden tor); potem fundament czasu (kontrakt wyniku + dane + rdzeń) z benchmarkami
i wyroczniami; potem urządzenia rodzinami (synchroniczne → przekształtnikowe → BESS → wiatr → PPC); potem ewaluator
WOS jako konsument trajektorii i kasacja `stability_rms`/`frt_hvrt` (B-01); równolegle W4/W5/W7/W8/W9/W10 wg zależności.

### 27. Co wdrażać jako pierwsze?

**S-1** bezpiecznik dowodowy (A-2) · **S-2** granica autorytetu wyniku zwarciowego i `k_sc` DEFAULT_FORBIDDEN (A-3) ·
**S-3** jeden tor NC RfG + kasacja martwej wyspy (A-5) · **S-4** `no_module` → `blocked` (A-7) · **S-5** `STAN_REPO.md`
supersesja (A-11) — wszystkie na dzisiejszym runtime, bez B-01, na bazie `c307e95f`, jako karty równoległe
(§6). Zaraz po nich **W6-1** (dane i kontrakt wyniku czasowego) i **W6-2** (rdzeń DAE) — projekt architekta.

### 28. Co można prowadzić równolegle?

W toku: V12.7 (agent), W3-J (agent), łańcuch przedpushowy fali 3. Równolegle po pushu: S-1, S-2, S-3, S-4 (agenci
w worktree; wspólne pliki: `calculation_readiness/service.py` w S-1/S-4 → jedna karta S-1+S-4 dla jednego agenta;
`api/oze_analysis_runs.py` w S-1/S-3 → kolejność S-1 przed S-3), S-5 (architekt), projekt W6-1/W6-2 (architekt),
W3-J i V12.7 odbiór. Niezależne od W6: W4 (po W5), W5 (po W1 — możliwy start), W9, W10 (po W9), W7 (po W5), W8 (po
W4/W5). Wąskie gardło: odbiór z pełnym łańcuchem na jednym drzewie — kolejka odbiorów, nie równoległe pushe.

---

## 2. W6 ARCHITECTURE SYNTHESIS — „Dynamika, czas i jakość energii" (misja §56)

W6 istnieje w mapie §8 od 2026-09-09 (audyt wątku badawczego mierzył starsze drzewo `main`; jego „W6 nie istnieje" jest
nieaktualne). Poniżej pełna synteza brakującej części: zakres, rola, zależności, wartość, powiązania, modele,
fundamenty, solvery, dane, UX, walidacja, dowody, kolejność.

### 2.1 Zakres i rola

W6 dodaje produktowi **oś czasu**: (a) dynamikę elektromechaniczną i przekształtnikową (RMS), (b) czas
quasi-statyczny (QSTS, profile, magazyn energii), (c) jakość energii jako dyscyplinę inżynierską (flicker, VUF,
harmoniczne, EN 50160) — na tej samej prawdzie modelu i w tym samym rejestrze biegów co rozpływ i zwarcia. Rola: bez
W6 nie da się WYKAZAĆ (nie zadeklarować) żadnego wymagania WOS/NC RfG o zachowaniu w czasie (T01–T04, T14–T18),
zwymiarować BESS jako magazynu, policzyć strat rocznych ani obciążalności cieplnej TR z profilu — a certyfikat
zgodności pozostaje dokumentem z deklaracji. W6 jest też jedynym wycinkiem, który zastępuje fasadę (stabilność
progowa) prawdziwą fizyką zamiast ją poprawiać.

### 2.2 Zależności

Wejściowe: W3 (jedna fizyka statyczna; jednostki; progi — W3-J), CV-2 (koperta rewizji dla świeżości wyniku
czasowego), CV-3 (`OperatingScenario` jako nośnik zdarzeń), OD-15(b) (`frt_hvrt` z katalogu) albo wymiana silnika
razem z rdzeniem (OD-20). Równoległe: W5 (model fazowy nie jest warunkiem dla dynamiki składowej zgodnej; jest
warunkiem dla dynamiki nN i VUF z modelu), W4 (nastawy w modelu — warunek dla oceny selektywności w czasie i LoM/SPZ).
Wyjściowe: W6 dostarcza dane nakładkom SLD (W7), dokumentom (W10: pakiet dowodowy dynamiki), odbiorowi (W11:
porównanie rejestracji z symulacją).

### 2.3 Wartość użytkowa (kto i co zyskuje)

Inżynier przyłączeń: studium przyłączeniowe z wykazanym FRT/odpowiedzią częstotliwościową, hosting z magazynem w
czasie, dokumenty OSD z kolumną „Podstawa". Specjalista zabezpieczeń: LoM/SPZ/RoCoF na przebiegach, CCT jako
kryterium nastaw. Projektant: straty roczne, obciążalność TR z profilu, dobór BESS z bilansu energii. OSD/audytor:
werdykt z symulacji ze stopniem dowodowym, tożsamość scenariusza, powtarzalność. Miara wartości: zamknięcie klasy
projektu **C** (OZE/BESS) bez ręcznego sklejania narzędzi (misja §64).

### 2.4 Powiązania z WOS/NC RfG

Rejestr zdolności (`solver_input/provenance.py`) klasyfikuje każdą zdolność dynamiczną: `NOT_SIMULATED` /
`DECLARATION` / `UNVALIDATED_MODEL` / `VALIDATED_SIMULATION`; ewaluator WOS konsumuje ResultSet dynamiczny (D-05), nie
wytwarza wielkości; mapowanie testów na zdolności i rodzaj twierdzenia (§1 p. 15) żyje poza solverem (A-2). Awans
zdolności do `VALIDATED_SIMULATION` wymaga dowodu z drabiny C×W (wyrocznia zewnętrzna albo analityczna na przypadku
odniesienia) — nigdy nazwy. Profile operatorów dostają wersję, datę obowiązywania i datę warunków przyłączenia
(D-10(a)); dokument cytuje wersję profilu, z której liczono.

### 2.5 Powiązania z resztą systemu

Jeden rejestr biegów (`canonical_runs`) i jedna koperta rewizji — bieg dynamiczny jest `CanonicalRun` z
`analysis_type` czasowym; scenariusz zdarzeń jest rozszerzeniem `OperatingScenario` (nie osobnym modelem);
inicjalizacja dynamiki czyta rozpływ tego samego assemblera (`enm/assembler.py`), więc punkt pracy jest tą samą
liczbą, którą widzi ekran rozpływu; wyniki czasowe trafiają do tych samych powierzchni ocen (B-02) z etykietą stopnia
dowodowego; SLD dostaje nakładkę stanu w czasie (W7); readiness per rodzina źródła (synchroniczne przestają być
`n_a`).

### 2.6 Wymagane modele (ENM, addytywnie, `exclude_none`)

- `Generator.dynamika`: rodzina (`synchroniczna` | `przeksztaltnikowa_gfl` | `przeksztaltnikowa_gfm` | `wiatr_typ_1..4`
  | `magazyn`), parametry z katalogu `der_dynamic` (rozszerzonego o maszyny synchroniczne: Xd, X'd, X''d, Xq, X'q,
  T'd0, T''d0, T'q0, H, D, nasycenie S(1.0)/S(1.2)), przekształtnik (PLL: Kp/Ki; regulator prądu; ogranicznik
  I_max i **priorytet składowej jako parametr z katalogu — bez domyślki**; K_FRT/Iq; tp/tiq; tryb GFM: droop/VSM,
  R_v/X_v), magazyn (E_n kWh, P_ch/P_dis, η_ch/η_dis, SOC_min/max, SOC_0, regulacja f), wiatr (dwumasowość,
  crowbar, pitch).
- `OperatingScenario.zdarzenia[]`: `{t, rodzaj: zwarcie(węzeł, Z_f, rodzaj) | wyłączenie(gałąź/łącznik) |
  odłączenie źródła | zmiana obciążenia | komenda regulacji | synchronizacja}` z horyzontem i krokiem wyjściowym.
- `Profil czasowy` (odbiory/generacja/ceny) jako encja katalogowo-projektowa z konsumentem QSTS (`load_profile_ref`
  dostaje czytelnika albo ginie — konsument).
- Kontrakt wyniku czasowego `ResultSetDynamicV1` (D-08(b): osobny kontrakt w tym samym rejestrze; nie
  rozszerzenie `ResultSetV1`): kanały (klucz, przestrzeń, jednostka, element), próbki na wspólnej osi czasu, własności
  biegu (zbieżność, kompletność, kroki poniżej tolerancji), tożsamość scenariusza (odcisk migawki + punktu pracy +
  nastaw solvera + harmonogramu + implementacji), stopień dowodowy per zdolność, zdarzenia wykonane z czasami.

### 2.7 Fundamenty (projekt architekta rdzenia)

1. **Inicjalizacja**: rozpływ (assembler) → punkt pracy urządzeń → stany regulatorów → test równowagi
   ‖f(x₀,y₀)‖ ≤ ε jako NIEZBYWALNA bramka biegu (odmowa nazwana, nie ostrzeżenie).
2. **DAE półjawne indeksu 1**: ẋ = f(x,y,u,p,t), 0 = g(x,y,u,p,t); sieć algebraiczna na Ybus (składowa zgodna,
   fazory), wstrzyknięcia prądu urządzeń w dq → sieć przez jedną transformację (`konwencje`), rozwiązanie g przez
   Newtona z globalizacją.
3. **Zdarzenia i re-inicjalizacja**: harmonogram z dokładnym czasem zdarzenia (krok skracany do zdarzenia, nie
   „najbliższy krok"); stany różniczkowe trzymane (ciągłość strumienia, kąta, prędkości), algebra rozwiązywana od
   nowa na nowej topologii; diagnostyka Δx, Δy, ‖f‖, ‖g‖, residuum KCL liczone niezależnie od solvera (naprawa
   P1-B55-01 przed adaptacją).
4. **Całkowanie**: trapez niejawny jako domyślny (sztywność regulatorów), RK jawne wyłącznie diagnostycznie;
   tolerancja kroku skalowana krokiem; drabina dt…dt/8 jako test rzędu metody; skończoność (NaN/Inf) łapana w chwili
   powstania z adresem stanu.
5. **Ograniczniki**: anti-windup regulatorów, ogranicznik prądu z priorytetem z katalogu, okno SOC egzekwowane na mocy
   oddanej (nie na celu regulatora), formy alternatywne w inwentarzu ryzyka postaci modelu (lista zamknięta pilnowana
   skanem AST).
6. **Tożsamość i determinizm**: odcisk scenariusza i implementacji; zadeklarowana precyzja międzyplatformowa
   (kwantyzacja na granicy kontraktu — DT-11), zero zależności od historii obiektu silnika.
7. **Walidacja**: drabina C (złożoność przypadku) × W (poziom wyroczni); analityczne (małosygnałowe, równe pola/CCT),
   niezmienniki (całka pierwsza przy D=0, bilans energii magazynu), wyrocznia zewnętrzna ANDES (SMIB, GENROU+SEXS+TGOV1,
   trajektoria punkt-po-punkcie) w osobnym środowisku, pandapower dla punktu pracy.
Miejsce w repo: **nowy pakiet `network_model/solvers/dynamika/`** (rodzeństwo rdzeni FROZEN; nie edytuje żadnego z
nich — DT-9: nowe solvery obok rdzeni), do którego przenoszone są zaadaptowane moduły laboratorium po naprawie
znalezisk shadow review; laboratorium `backend/research/` nie wchodzi do `pyproject` (izolacja strukturalna) — u nas
nie powstaje w ogóle: adaptacja idzie prosto do pakietu produkcyjnego z testami, bez pośredniej kopii.

### 2.8 Wymagane solvery i analizy

`dynamika/` (rdzeń DAE + urządzenia + zdarzenia), ewaluator WOS jako analiza (konsument), `flicker_iec61000_3_7.py`
(przeniesienie bez zmiany liczb z `application/analyses/migotanie.py`), VUF (OD-15(c) w rdzeniu lub nowy solver
składowych w `dynamika/`/`jakosc/`), harmoniczne/impedancja harmoniczna z widmami z proweniencją (W2-C dała
wejście), QSTS (pętla rozpływów przez assembler + dyspozycja BESS), obciążalność TR IEC 60076-7, koordynacja
izolacji pod kanonicznym solverem (przeniesienie z V12.6 z parytetem), udar z modelu nasycenia (po OD-15(d)).

### 2.9 Potrzebne dane (i skąd)

Parametry dynamiczne z kart producentów i certyfikatów (OD-17; do czasu danych: brak = odmowa nazwana, nie domyślka);
profile WOS/IRiESD wersjonowane (OD-21); profile czasowe (użytkownik/pomiar/OSD); ANDES jako pakiet środowiska
wyroczni (A-10); przypadki odniesienia (SMIB, Kundur 2-area jako C2/C3, IEEE 9 dla stanu ustalonego; własne G01–G15
rejestru dla scenariuszy sieci SN).

### 2.10 Potrzeby UX

Formularz scenariusza z osią zdarzeń (E4), ekran trajektorii (kanały, obwiednie FRT, zdarzenia, tożsamość, stopień
dowodowy), ekran QSTS (profil, SOC(t), straty, przekroczenia w czasie), sekcja „Podstawa werdyktu" w macierzy NC RfG
i dokumentach, readiness per rodzina, nakładka czasu na SLD, wszystkie wzory w KaTeX (V12.7).

### 2.11 Kolejność implementacji W6 (wycinki pionowe)

| Wycinek | Zakres | Warunek wejścia | Dowód wyjścia |
|---|---|---|---|
| **W6-0** | bezpieczniki na dzisiejszym runtime: S-1 (stopień dowodowy), S-3 (jeden tor NC RfG), S-4 (`no_module`) | — | certyfikat nie powstaje z testów bez podstawy; readiness nigdy `ready` przy braku modułu; jeden tor NC RfG |
| **W6-1** | dane i kontrakty: `Generator.dynamika`, `OperatingScenario.zdarzenia`, `ResultSetDynamicV1`, readiness per rodzina, katalog `der_dynamic` rozszerzony | W6-0 | testy kontraktów, snapshot OpenAPI, parytet ENM round-trip, brak = odmowa nazwana |
| **W6-2** | rdzeń `dynamika/`: konwencje, sieć, DAE, całkowanie, zdarzenia, re-inicjalizacja, skończoność, tożsamość; SMIB klasyczny | W6-1 | równowaga ‖f‖, całka pierwsza, CCT równych pól, drabina rzędu, determinizm; wyrocznia ANDES SMIB (job opcjonalny) |
| **W6-3** | urządzenia: SM 4. rzędu + AVR/GOV/PSS; GFL (PLL, ogranicznik, Iq); GFM; BESS z SOC i bazami; wiatr typ 3/4 | W6-2 | ANDES GENROU+SEXS+TGOV1; bilans energii; okno SOC; inwentarz ryzyka postaci |
| **W6-4** | scenariusze zdarzeń z modelu SN (zwarcie w węźle z Z_f, wyłączenie, wyspa), wielozdarzeniowość, PPC | W6-3 | niezmienniczość permutacji ZMIERZONA na klasie; re-init z Δy raportowanym prawdziwie |
| **W6-5** | ewaluator WOS jako konsument (T01–T04, T14–T18), certyfikat/wniosek/studium z „Podstawą", profile wersjonowane, **OD-20** kasacja `stability_rms`/`frt_hvrt` i przepięcie ewaluatora (B-01) | W6-4 + OD-20 + OD-21 | test T14 może wypaść negatywnie; zgodność z profilem i wersją; pakiet dowodowy dynamiki |
| **W6-6** | QSTS + BESS dyspozycja (9 trybów → reguły P(t)/SOC(t)), straty roczne, obciążalność TR 60076-7, hosting z magazynem | W6-3 (BESS) | bilans energii, parytet z rozpływem pojedynczym, profil w kopercie |
| **W6-7** | jakość: flicker do solvera bez zmiany liczb, VUF, harmoniczne pod „Jakość", EN 50160 raport, profil napięcia w ekranie (B6) | W3-J | parytet liczb, raport z proweniencją |
| **W6-8** | koordynacja izolacji + pakiet dowodowy (H3/H9), udar (G4 po OD-15(d)) pod kanonem | OD-15(d) | parytet z V12.6, kasacja duplikatu tabeli BIL |

---

## 3. Klasyfikacja wątku badawczego (misja §11: izolowane laboratorium; nie scalać mechanicznie)

Klasy: **PRZEJĄĆ** (kod wchodzi z parytetem po naprawie znalezisk), **ZAADAPTOWAĆ** (idea/kontrakt wchodzi, kod
przepisany do miejsca kanonicznego), **PRZEPISAĆ** (pomysł dobry, kod nie), **TYLKO-BADAWCZE** (narzędzie dowodowe,
nie produkt), **ODRZUCIĆ**.

| Element wątku | Klasa | Cel u nas | Uwaga |
|---|---|---|---|
| `solver_input/provenance.py`: `EvidenceTier`, `ClaimKind`, `CapabilityEvidence`, rejestr fail-closed, `BRAK_DOWODU_PL` | PRZEJĄĆ | S-1 | mapowanie `test_id → capability` przenoszone z FROZEN `TEST_CATALOG` do rejestru w `provenance.py` |
| bramka dowodowa certyfikatu (`certyfikat_zgodnosci.py`: dwie bramki, kolumna „Podstawa" JSON/DOCX/PDF) | PRZEJĄĆ | S-1 | rozszerzyć na wniosek OSD i studium |
| `calculation_readiness.overall_status` fail-closed | ZAADAPTOWAĆ | S-4 | u nas `no_module` znika jako stan (A-7), więc reguła upraszcza się do `blocked` |
| `_execute_dynamic_stability` ze statusem z klasyfikacji | PRZEJĄĆ | S-1 | identyczny wzorzec |
| `network_model/core/wklad_zwarciowy_przeksztaltnika.py` (trzy stany k_sc), `zdolnosci_wkladu_zwarciowego.py`, `autorytet_wyniku_zwarciowego.py`, `wiazanie_wyniku_zwarciowego.py`, `application/autorytet_biegu_zwarciowego.py`, bramki w `equipment_proof_pack.py` i `protection_coordination.py`, zmiana `InverterSource.k_sc: float | None` | PRZEJĄĆ | S-2 | `network_model/core/**` nie jest B-01; parytet złotych hashy SC bit w bit dla deklaracji; zmiana kontraktu HTTP (liczby jako echo) = zmiana łamiąca, zamierzona (dyrektywa: brak kompatybilności wstecznej) |
| `domain/dobor_aparatu_pola.py` (pre-dobór z tabliczki), wiązanie wyłącznika głównego nN, `W041` pole TR w szablonach, pole nN tylko przy odpływach (wariant B+A) | ZAADAPTOWAĆ | W5/W10 (karta `SZABLONY-NN`) | u nas szablony zmienione przez W1/FAB-K; przenieść z parytetem 57 szablonów |
| `network_model/catalog/niezmienniki_katalogu.py` (4 klasy mocy reguł), `mv_auxiliary_catalog.py` (+112) | ZAADAPTOWAĆ | karta `KATALOG-NIEZMIENNIKI` (po W3) | sprawdzić kolizję z W3-I `governance.py` |
| `enm/canonical_analysis.py::pobierz_slad_rozplywu_biegu` + `KLUCZE_ROZPLYWU` | już u nas (PERF-SC-50, klasa `KLUCZE_ROZPLYWU`) | — | port `1e9f21c5` wątku = nasza naprawa |
| globalizacja Newtona w solverze sieci laboratorium | ZAADAPTOWAĆ | W6-2 | tylko dla nowego rdzenia; rdzeń PF FROZEN nietknięty |
| `dynamic_lab/konwencje.py`, `siec.py`, `silnik.py`, `calkowanie.py`, `zdarzenia.py`, `reinicjalizacja.py`, `skonczonosc.py`, `tozsamosc.py`, `wynik.py` | PRZEJĄĆ (po naprawie P1-B55-01) | W6-2 → `network_model/solvers/dynamika/` | 21 błędów mypy (protokoły vs frozen dataclass) do naprawy przy przenosinach; testy `tests/research/*` → `tests/network_model/dynamika/*` |
| `urzadzenia.py` (SM 4. rzędu, GFL/GFM z dwiema eksperymentalnymi strategiami ograniczenia), `regulatory.py`, `urzadzenia_oze.py` (BESS+SOC, PPC, DFIG 3. rzędu), `bazy_bess.py` | PRZEJĄĆ (po naprawie P1-B55-02) | W6-3 | priorytet składowej ogranicznika = parametr z katalogu (A-9), nie wybór w kodzie |
| `frt.py`, `frt_z_biegu.py` (ewaluator konsumujący ślad) | ZAADAPTOWAĆ | W6-5 | wzorzec dla ewaluatora T14–T18 poza solverem FROZEN |
| `walidacja.py`, `drabina.py`, `benchmarki.py`, `dowod_walidacji.py`, `pomiar_zgodnosci.py`, `macierz_pokrycia.py`, `porownanie_postaci.py`, `ryzyko_postaci_modelu.py`, `sztywnosc.py` | TYLKO-BADAWCZE → narzędzia dowodowe w `tests/` | W6-2/W6-3 | wchodzą jako testy i uprząż dowodowa, nie jako kod produktu |
| `wzorzec_zewnetrzny.py`, `wzorzec_genrou.py`, `wzorzec_natywny.py`, `wzorzec_trajektoria.py` (ANDES) | TYLKO-BADAWCZE → wyrocznia opcjonalna | A-10 | osobne środowisko (jak pp-venv), znacznik `andes`, osobny job CI; nigdy skip w głównym biegu |
| `mutacje.py`, `sonda_mutacyjna.py`, `katalog_mutacji.py`, `kwalifikacja.py` | TYLKO-BADAWCZE | job opcjonalny CI (A-10) | bez zależności od ANDES w kampanii (P1-B55-03) |
| `research_isolation_guard.py` | ODRZUCIĆ | — | u nas nie ma katalogu `research/`; adaptacja idzie do pakietu produkcyjnego |
| edycje FROZEN `solvers/ncrfg_ptpiree/{engine,contracts}.py` | ODRZUCIĆ (treść), idea → S-1 poza solverem | OD-20 | B-01 |
| dokumenty wątku (`KARTA_MAX…`, `PAKIET_DECYZYJNY…`, shadow reviews, raporty rund) | ARCHIWIZOWAĆ jako dowód | `docs/audit/archive/dynamika_2026-09/` (kopia z gałęzi przy W6-1) | cytowane w tej syntezie; nie stają się kanonem |
| `PLANS.md`, `STAN_REPO.md`, `CLAUDE.md` w wersji wątku | ODRZUCIĆ | — | supersedowane naszymi (S-5) |
| fikstury nN `lv-domain/fixtures/generated/*.json`, `sldNetwork53.ts` | ODRZUCIĆ (kopie) | — | regenerować własnym generatorem po każdej zmianie modelu |

---

## 4. Rozstrzygnięcia architekta (wiążące) i decyzje właściciela

### 4.1 Rozstrzygnięcia architekta

| # | Rozstrzygnięcie | Uzasadnienie / dowód |
|---|---|---|
| **A-1** | **Granica produktu = SN 6–36 kV + TR SN/nN + nN 0,4 kV; WN wyłącznie jako równoważnik źródła** (S''kQ, I''kQ, R/X, U_n górnej strony w danych źródła). Jawna szyna WN w modelu jest niedozwolona; walidator ENM odrzuca szynę o U_n > 36 kV z nazwanym powodem; zakres napięć jest ZADEKLAROWANY jako kontrakt (nie wynika z zawartości katalogu). | OD-19 (NR na jawnej szynie 110 kV → rozwiązanie zdegenerowane); §J.5 shadow review (zakres nigdzie niezadeklarowany); misja §52 |
| **A-2** | **Trzecia oś proweniencji — stopień dowodowy wyniku** w `solver_input/provenance.py` (`EvidenceTier`, `ClaimKind`, `CapabilityEvidence`, rejestr fail-closed; nieznana zdolność = `UNVALIDATED_MODEL`); mapowanie `test_id → (capability_id, claim_kind)` dla T01–T20 w rejestrze (POZA solverem FROZEN); konsumenci: `_execute_dynamic_stability`, certyfikat, wniosek OSD, studium, macierz NC RfG (API `POST /api/ncrfg-tests/run` opakowuje wynik solvera polami addytywnymi `reporting_status`/`proof_status`/`evidence_limitations`/`evidence_note_pl`/`evidence` per test — w warstwie API/aplikacji, kontrakt solvera nietknięty), ekrany ocen. Żadna zdolność dynamiczna nie ma dziś statusu `VALIDATED_SIMULATION`. | §0 p. 1; D-00/D-09 wątku; zasada „wynik istnieje ≠ wynik pozytywny ≠ wynik jest dowodem" |
| **A-3** | **K_sc DEFAULT_FORBIDDEN**: `InverterSource.k_sc: float \| None` (jedno pole; wartość efektywna i pochodzenie WYPROWADZANE), trzy stany (deklaracja / brak → domyślka systemowa jawnie oznaczona w śladzie / dane niepoprawne → blokada), zamknięty kontrakt zdolności zależnych od wkładu falownikowego (`ZdolnoscMiarodajna`: zwarcia jako podstawa doboru, nastawy, koordynacja, pakiety dowodowe — blokowane przy domyślce; rozpływ/topologia/schemat dostępne), **granica autorytetu wyniku**: pakiet dowodowy doboru aparatury i koordynacja czytają wielkości z ZAPISANEGO biegu (`run_id`, bieg MIN osobno), liczby w żądaniu są echem (rozbieżność = 422), pieczęć wiązania sześciu wielkości; readiness: brak deklaracji `k_sc` = `blocked` dla zdolności zależnych (nie `partial`), rozpływ nadal `ready`. | dyrektywa właściciela 2026-09-16 (§41: „K_sc pozostaje DEFAULT_FORBIDDEN"); §0 p. 4–5; P0-DELTA-03 wątku; KATALOGI §2.4 (skutek: istniejące projekty z OZE bez kart producentów tracą miarodajność zwarciową dla doboru — zamierzony, uczciwy) |
| **A-4** | Relacja „zabezpieczenie → chroniona gałąź" wchodzi do modelu w W4 (`BayProtectionControlUnit.protected_branch_ref`), żeby prąd roboczy koordynacji dało się związać z biegiem rozpływu tą samą pieczęcią co prąd zwarciowy. | pomiar wątku: przestrzenie kluczy rozłączne (12 zwarciowych / 6 roboczych / 0 wspólnych) |
| **A-5** | **Jeden tor NC RfG**: kanoniczna przestrzeń numeracji = **T01–T20 solvera** (zgodna z kanonem `NC_RFG_PTPiREE_TESTY_KANON.md` i Procedurą PTPiREE 3.0); trasa `GET /api/ncrfg-tests/cases/{id}/compliance` buduje `NcRfgPtpireeModuleInput` z ENM przez istniejący `model_bridge.py` i uruchamia solver kanoniczny; silnik `checker.py` (T1–T18), słownik `no_module`, `NcRfgComplianceReport` — kasacja z bramką wskrzeszenia; sekcja „Zgodność przekrojowa" czyta ten sam kontrakt co macierz; martwa wyspa kliencka — kasacja (3 pliki + 3 testy). Słownik werdyktów kanoniczny: solver (`pass/fail/no_data/not_required` + moduł `zgodny/niezgodny/brak_danych`) + stopień dowodowy z A-2. | §15.1/§15.3 pakietu, D-06(a); pomiar na `c307e95f` |
| **A-6** | **T14/T15 do czasu OD-20**: ewaluator FROZEN zostaje, ale jego wynik jest klasyfikowany `NOT_SIMULATED` → `not_reportable`; certyfikat NIE powstaje z modułu wymagającego T14/T15 bez zwalidowanej symulacji (bramka dowodowa), dokument mówi „BRAK WYSTARCZAJĄCEGO DOWODU SPEŁNIENIA WYMAGANIA", nie „niezgodny". | KLASA: wiarygodność ≠ spełnienie (dyrektywa V12.7 właściciela 2026-09-16, załącznik B karty `KARTA_B02_POWIERZCHNIE_ANALITYCZNE_2026-09.md`); P0-01 |
| **A-7** | **`no_module` przestaje istnieć jako stan**: kontrakty (`stability_rms`, `frt_hvrt`, readiness, `der_readiness`, FE typy/etykiety) tracą literał; brak modelu dla urządzenia = `blocked` z nazwanym brakiem i akcją (kod `der.dynamic_profile_missing` już istnieje); `overall_status` nigdy nie zalicza braku; zdolność bez dostawcy numerycznego nie jest oferowana w UI (ZASADA NR 1), a jej wynik diagnostyczny nosi stopień dowodowy z A-2. Test w obie strony (pin) — dziś 0 testów pinuje regułę. | §15.4 pakietu (pomiar: 0 testów w obie strony); CLAUDE.md ZASADA NR 1 |
| **A-8** | Dwa słowniki niepełności zostają jako DWIE OSIE z różnymi nazwami pól: `completeness_status` (wynik: `complete/partial/failed/not_applicable`) i `proof_status` (dowód: `complete/incomplete`) — nigdy jako synonimy; dokumentacja kontraktu nazywa obie osie; guard `severity_contract_guard` rozszerzony o parę nazw. | §15.2 pakietu |
| **A-9** | Priorytet składowej ogranicznika prądu, forma okna SOC i wybór postaci modelu NIE są wybierane w kodzie: są parametrami z katalogu (`der_dynamic`), brak = odmowa nazwana; uprząż porównania postaci zostaje narzędziem dowodowym. | shadow review §12 (postać zmierzona, nie wybrana); zero fabrykacji |
| **A-10** | Wyrocznie i kampanie zewnętrzne (ANDES, mutacje) = osobne środowisko i osobny job CI (wzorzec pp-venv: znacznik `andes`, `-m andes`), zero skipów w głównym biegu; ANDES nie wchodzi do `pyproject` produkcyjnego. | reguła Zero-Debt pkt 1 (wykluczenie ≠ naprawa); precedens PANDAPOWER-DEP |
| **A-11** | `STAN_REPO.md` **supersedowany**: sekcje 1–8 zastąpione jedną tabelą stanu z pomiaru 2026-09-16 i odesłaniem do mapy/evidence/tej syntezy; deklaracje sprzeczne z kodem usunięte (m.in. „RMS PODPIĘTE"). `PLANS.md` dostaje nagłówek supersesji (stan operacyjny = evidence §A + mapa §8 + ta synteza). | §57 misji (nie zostawiać dwóch prawd) |
| **A-12** | Nowy rdzeń dynamiki = **nowy pakiet `network_model/solvers/dynamika/`** obok rdzeni FROZEN (DT-9); `stability_rms` i `frt_hvrt` usuwane po W6-5 (OD-20); do tego czasu ich wyniki są `UNVALIDATED_MODEL`/`NOT_SIMULATED`. | D-02(b), D-03, D-13(b) |
| **A-13** | Kanoniczny wynik dynamiczny = osobny kontrakt `ResultSetDynamicV1` w tym samym rejestrze biegów (nie rozszerzenie FROZEN `ResultSetV1`); pakiety dowodowe dynamiki czytają go READ-ONLY. | D-08(b); DT-10 |
| **A-14** | Kolejność rodzin urządzeń w W6-3: synchroniczne → GFL → GFM → BESS → wiatr → PPC (synchroniczne definiują problem stabilności i są dziś wykluczone przez readiness). | D-04(a), D-07(b) |
| **A-15** | Wersjonowanie profili WOS/IRiESD: `version`, `valid_from`, `connection_conditions_date`, `clauses[]` w profilu; dokumenty cytują wersję; **Pomiar 2026-09-16:** 5 profili `catalog/profiles/nc_rfg/*.yaml` ma 15 kluczy liczbowych wymagań i **0 różnic między operatorami** (różnią się wyłącznie nagłówkiem tekstowym; PSE niesie dodatkowo progi klas modułów `threshold_kw_*`/`voltage_kv_max`) — „zróżnicowanie OSD" jest dziś pozorne (P1-10 potwierdzone); realne różnice IRiESD wchodzą z OD-21. | D-10(a); P1-10 |

### 4.2 Decyzje wymagające właściciela (nowe; rejestr w mapie §7)

| ID | Decyzja | Dlaczego właściciel |
|---|---|---|
| **OD-20** | **B-01 pakiet W6**: (a) ewaluator T14/T15/T16/T17/T18 w `solvers/ncrfg_ptpiree/engine.py` przepięty na konsumpcję `ResultSetDynamicV1` (koniec tautologii), (b) kasacja `network_model/solvers/stability_rms/**` i `network_model/solvers/frt_hvrt/**` po W6-5, (c) `capability_id` w `TEST_CATALOG` (opcjonalnie — mapowanie żyje w rejestrze A-2, więc (c) jest wygodą, nie koniecznością). Do czasu zgody: bezpiecznik A-6. | edycja `network_model/solvers/**` |
| **OD-21** | Dokumenty źródłowe wymagań WOS 2025: programy ramowe testów PTPiREE (wer. 3.0, obowiązuje od 2026-01-01), IRiESD 2025 pięciu OSD z datami obowiązywania, warunki przyłączenia dla profili — właściciel dostarcza albo potwierdza pobranie z publicznych stron OSD; do czasu: profile w repo z adnotacją „wersja niezweryfikowana ze źródłem". | dane spoza repo; treści normatywnych nie fabrykuję |
| **OD-22** | Skutek A-3 dla istniejących projektów z OZE bez kart producentów: dobór/nastawy/dowody BLOKOWANE do uzupełnienia `k_sc` (uczciwe) — właściciel potwierdza świadomie (jak w wątku badawczym) lub wskazuje okres przejściowy z widocznym znacznikiem „domyślka systemowa" w dokumencie. Domyślnie wdrażam BLOKADĘ (dyrektywa „DEFAULT_FORBIDDEN"). | wpływ na istniejące projekty użytkowników |
| **OD-23** | PR #471 (Codex, 2026-08-10) — zastąpiony; do zamknięcia przez właściciela. | cudzy PR |

---

## 5. Aktualizacja roadmapy (mapa §8 pozostaje jedyną tabelą wycinków; poniższe zmiany są wiążące)

1. **Kolejność:** W1 → W2 → W3 (w odbiorze) → **W6-0 (S-1…S-5, natychmiast, równolegle z domknięciem W3)** → W5 → W4 →
   **W6-1/W6-2 (fundament czasu — projekt architekta, równolegle z W5)** → W8 → W6-3…W6-8 → W7 → W9 → W10 → W11 → W12.
   Uzasadnienie zmiany względem §8 (W6 po W8): bezpieczniki W6-0 usuwają fałsz widoczny DZIŚ w dokumentach
   regulacyjnych (najwyższe ryzyko produktu: certyfikat z tautologii), a fundament W6-1/2 nie zależy od W8 i jest
   najdłuższą ścieżką krytyczną programu; W8 zależy od W4/W5 i nie blokuje W6.
2. **W6 dostaje podział na W6-0…W6-8** (§2.11) z warunkami wejścia/wyjścia; mapa §8 wiersz W6 odsyła tutaj.
3. **Nowe karty poza W-numeracją** (dług z wątku badawczego, zaadaptowany): `SZABLONY-NN` (wiązanie wyłącznika
   głównego nN, pole TR, B+A) → W5; `KATALOG-NIEZMIENNIKI` → po W3; `ARCHIWUM-DYNAMIKA` (kopia dokumentów wątku
   jako dowód) → W6-1.
4. **Klasy projektów akceptacyjnych A–F = DoD produktu** (§60): każda ma test e2e na realnym backendzie jako bramkę
   CI (dziś: A przez import — W1; E nazwana w W8; C zależy od W6-5; D od W5; B od W10; F od W10).
5. **Poza kolejką (bez zmian):** D-11 (hasz kolekcji ENM), B-01-RI, G11 (trójuzwojeniowe), IEC 61850 (decyzja zakresu
   przy W11).

---

## 6. Wykonanie natychmiastowe (misja §58): karty S-1…S-5 i delegacja

| Karta | Zakres (KLASA, nie instancja) | Wykonawca | Baza | Dowód odbioru |
|---|---|---|---|---|
| **S-1 DOWÓD** | rejestr `EvidenceTier`/`ClaimKind`/`CapabilityEvidence` + mapowanie T01–T20 w `solver_input/provenance.py`; wrapper wyniku NC RfG w API/aplikacji (pola addytywne per test i per bieg); `_execute_dynamic_stability` statusy z klasyfikacji (+ kolumny `reporting_status`/`proof_status` w tabeli wyniku); bramka dowodowa w `certyfikat_zgodnosci.py`, `wniosek_osd.py`, studium (kolumna „Podstawa" JSON/DOCX/PDF); FE: etykieta stopnia dowodowego w macierzy (`ui2/oze/macierz`), FRT (`ui2/oze/frt`), stabilności (`ui2/wyniki/stabilnosc`); testy iloczynu cech (rodzaj twierdzenia × stopień × wymagany/nie × werdykt); snapshot OpenAPI | agent | `c307e95f` (+ push fali 3) | certyfikat z T14/T15 nie powstaje; `dynamic_stability` = `not_reportable`; 0 stałych `"reportable"` poza rejestrem (guard `evidence_status_guard`) |
| **S-2 AUTORYTET** | `InverterSource.k_sc: float \| None` + `wklad_zwarciowy_przeksztaltnika.py` (3 stany) + `zdolnosci_wkladu_zwarciowego.py` + `autorytet_wyniku_zwarciowego.py` + `wiazanie_wyniku_zwarciowego.py` + `application/autorytet_biegu_zwarciowego.py`; bramki: `POST /api/equipment-proof/pack` (liczby z biegu, echo → 422), koordynacja (bieg MAX + MIN), `nn_device_selection`, pakiety dowodowe; readiness `inverter.k_sc_assumed` → `blocked` dla zdolności zależnych; mapowanie ENM (`materialized_params.k_sc` bez fabrykacji 1,1); FE kreator OZE: k_sc jawnie z karty albo „brak"; złote hashe SC bit w bit dla deklaracji; testy: deklaracja/brak/niepoprawne × PF/SC/dobór/koordynacja/pakiet × liczby zgodne/rozbieżne | agent | `c307e95f` | obejście „999 kA z żądania" niemożliwe (test); `k_sc_zrodlo` usunięte (jedno pole); guard `sc_authority_guard` |
| **S-3 NC-RFG-JEDEN-TOR** | trasa `/compliance` przez `model_bridge.py` → solver kanoniczny; kasacja `checker.py` silnika + `NcRfgComplianceReport` + FE typy `NcRfgComplianceVerdict`; sekcja „Zgodność przekrojowa" na kontrakcie macierzy; kasacja `NcRfgComplianceBadge.tsx`/`DerValidationBanner.tsx`/`derPowerValidation.ts` + testy; bramka wskrzeszenia; e2e macierz/przekrojowa na realnym backendzie | agent (po S-1) | drzewo po S-1 | 1 implementacja NC RfG (grep `T1"`/`T18"` = 0); e2e zielone |
| **S-4 NO-MODULE** | kasacja literału `no_module` (21 + 13) i stanu: `stability_rms/contracts.py`, `frt_hvrt/contracts.py` — UWAGA: to `network_model/solvers/**` → **B-01**: do OD-20 kontrakty solverów NIETKNIĘTE, a warstwa aplikacji/readiness/FE nie emituje i nie czyta `no_module` (mapowanie na `blocked` na granicy); `overall_status` fail-closed; pin w obie strony | agent (razem z S-1, ten sam plik readiness) | `c307e95f` | `grep no_module backend/src frontend/src` = tylko kontrakty FROZEN (2 pliki) + adapter na granicy; guard |
| **S-5 STAN-REPO** | `STAN_REPO.md` supersesja (A-11), `PLANS.md` nagłówek supersesji, `MAPA` §7 OD-20…OD-23 + §8 odnośnik do §5 tej syntezy, `INDEX.md`, `INDEX_TWIN.md`, `MISJA` część II (dyrektywa 2026-09-16 verbatim), `KANON`/`SIMULATION_ARCHITECTURE` §5.7 odsyła do §2 | architekt | `fable-f3` | guardy docs zielone |

Definition of Done każdej karty: inwentarz klasy w meldunku · testy jako iloczyn cech · złote hashe bez zmian (zmiana
= STOP) · `guardy_z_ci.py` komplet · snapshot OpenAPI · commit bez push, tytuł bez polskich znaków diakrytycznych ·
odbiór architekta = cherry-pick + pełny łańcuch + push + CI 9/9 + wpisy w mapie/evidence/rejestrze.

---

## 7. Supersesje dokumentów (misja §57)

| Dokument | Zmiana | Status |
|---|---|---|
| `STAN_REPO.md` | sekcje 1–8 zastąpione tabelą stanu z pomiaru + odesłaniami (A-11) | S-5 |
| `PLANS.md` | nagłówek: stan operacyjny prowadzą evidence §A, mapa §8, ta synteza; treść §1–§3 historyczna | S-5 |
| `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` | §7 OD-20…OD-23; §8 wiersz W6 → §2.11 tutaj; kolejność wg §5 tutaj | S-5 |
| `MISJA_DOMKNIECIA_PRODUKTU_2026-09.md` | część II: dyrektywa 2026-09-16 (verbatim) — nadrzędna wobec części I tam, gdzie doprecyzowuje | S-5 |
| `../twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` §5.7 | odsyła do §2 tutaj (rdzeń `dynamika/`, nie rozszerzenie `stability_rms`) | S-5 |
| `../architecture/PRODUCT_CAPABILITY_CONSTITUTION.md` | wiersze K/M/P: dynamika `PARTIAL` → „fasada; W6-0…W6-8"; BESS bez zmian (już skorygowane) | S-5 |
| `../architecture/CONVERGENCE_ROADMAP.md` §1 | wpis stanu 2026-09-16 (jedna linia: HEAD, W3 fala 3, synteza, S-1…S-5) | S-5 |
| dokumenty wątku badawczego | archiwum dowodowe (`docs/audit/archive/dynamika_2026-09/`) przy W6-1; nie są kanonem | W6-1 |

---

## 8. Meldunek etapu (misja §61) — synteza

- **HEAD:** `c307e95f` (fable-f3), zdalny `b89c13b3`; `main` `7e84753a`; wątek badawczy `85084102`.
- **Stan produktu:** W1–W2 wykonane, W3 w odbiorze fali 3 (łańcuch przedpushowy: pytest 14 557/0, pandapower 30/0,
  guardy 84/85 + zapadka tsconfig 119→117, vitest/e2e w toku); B-02 powierzchni analitycznych 8,5/10 (V12.7 w toku).
- **Najważniejsze decyzje:** A-1…A-15 (§4.1); OD-20…OD-23 do właściciela.
- **Zachowuję:** kanon warstw, rdzenie FROZEN, ENM jedna prawda, kolejność W1–W12 (z jawną korektą §5), gates B-01/B-02.
- **Rozszerzam:** proweniencję o stopień dowodowy wyniku; ENM o dynamikę/zdarzenia/profile/BESS; rejestr biegów o
  kontrakt czasowy; readiness o rodziny źródeł.
- **Zmieniam:** kolejność W6 (bezpieczniki natychmiast, fundament równolegle z W5); `k_sc` na jedno pole z
  DEFAULT_FORBIDDEN; NC RfG na jeden tor; `no_module` znika; `STAN_REPO.md` supersedowany.
- **Czego brakowało użytkownikowi:** wykazania (nie deklaracji) zachowania w czasie; jednej odpowiedzi „czy zgodne"
  zamiast trzech; pewności, że liczby w dowodzie pochodzą z jego biegu; magazynu jako magazynu; strat rocznych.
- **UX:** brak zmian w tym etapie (V12.7 i W3-J w toku u agentów); zaprojektowane: etykieta stopnia dowodowego,
  kolumna „Podstawa", formularz scenariusza, ekran trajektorii (§2.10).
- **Architektura:** trzecia oś proweniencji, granica autorytetu wyniku, oś czasu jako wymiar pierwszorzędny (§1 p. 25).
- **WOS/NC RfG:** podział wymagań wg rodzaju twierdzenia (§1 p. 15), bezpiecznik A-6, wersjonowanie profili (A-15),
  OD-21 dokumenty źródłowe.
- **Z research:** klasyfikacja per element (§3): 6 pozycji PRZEJĄĆ, 6 ZAADAPTOWAĆ, 4 TYLKO-BADAWCZE, 6 ODRZUCIĆ.
- **Dowody:** pomiary na drzewie w §0 i §1 (grep/diff/testy); brak nowych dowodów wykonawczych w tym etapie (etap
  syntezy).
- **Commity:** ten dokument + supersesje S-5 (w tej samej kolejce, po zakończeniu łańcucha fali 3).
- **Następny krok wykonawczy:** push fali 3 po zielonym łańcuchu → karty S-1+S-4, S-2 do agentów (worktree, baza po
  pushu) → odbiór V12.7 i W3-J → S-3 po S-1 → projekt W6-1 (kontrakty) przez architekta.
