# PROGRAM A/B — dynamika i zgodność modułów wytwarzania typu A i B w sieciach nN/SN, rozszerzony o harmoniczne i supraharmoniczne

**Status:** KANONICZNY, ŻYWY — rejestr wymagań i graf zależności programu; podlega
`FINAL_DYNAMICS_CAPABILITY_FREEZE.md` (cel produktu dynamiki) i `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md`
§8 (jedyna tabela wycinków W1–W12). Ten dokument **uszczegóławia wycinek W6** (fale W6-A…W6-K z zamrożenia
§5 oraz W6-6/W6-7 z syntezy §2.11) — nie zastępuje go i nie otwiera konkurencyjnej mapy dróg.

**Zlecenie:** mandat właściciela z 2026-09-23 „FABLE — CONTINUATION ORCHESTRATOR MANDATE · OPUS 5.5 — ONLY
EXECUTION / REVIEW SUBAGENT · TYPE A + TYPE B · nN + SN · FULL DYNAMICS + PROTECTION + AUTOMATION ·
HARMONICS + SUPRAHARMONICS · END-TO-END" (§0–§107). Treść wymagań przeniesiona do §5 tego dokumentu
**w całości** (rejestr, nie streszczenie), bo poprzednia sesja programu została przerwana limitem i jej
wynik nie istnieje w żadnym repozytorium ani gałęzi (§0.2) — kanon musi żyć w repo, nie w sesji.

**Baza pomiarowa:** HEAD `ef9f6228` (R10 W6-F ACCEPTED DONE; gałąź `claude/mv-design-pro-twin-audit-u4lhy0`
fast-forward na `claude/relaxed-sagan-ww188q`, `main` = `7e84753a` jest przodkiem obu).

---

## 0. Odzyskanie stanu i uczciwy bilans (ETAP 1–2 mandatu)

### 0.1 Stan repozytorium

| Pozycja | Wartość |
|---|---|
| `git status --short` | pusty (kontener świeży, brak lokalnych zmian do odzyskania) |
| HEAD punktu wyjścia | `ef9f6228383fcdb87a2f3556e881c6d4b28c7a38` — **zgodny z baseline mandatu §3** |
| `origin/main` | `7e84753a` — przodek `ef9f6228` (508 commitów za baseline, 0 własnych) |
| Gałąź robocza | `claude/relaxed-sagan-ww188q` = fast-forward do `ef9f6228` (żadnego `reset --hard`, `clean`, `rebase`, `force push`) |
| Stash / refs kopii | brak |
| R10 | W6-F ACCEPTED DONE: D01–D07 = L5, D08–D10 = L4 (`docs/evidence/RUNDA10_DOMKNIECIE_DOWODU_WYKONYWALNEGO_2026-09-20.md` §Z, §AA) — **nie otwierane ponownie** |

### 0.2 Czego NIE odzyskano — i dlaczego to nie jest ukryte

Mandat §2 nakazuje odnaleźć „Program A/B — dynamika i zgodność modułów wytwarzania typu A i B w sieciach
nN/SN" z sekwencją AB1a → AB1b → AB1d_min → AB1c → AB2 → … → AB7 oraz poprawki dokumentacyjne z
poprzedniej sesji (§95: WOS resolver, PTPiREE resolver, WiPWC, Bank Nastaw, PPM vs SyPGM,
AcceptedEvidenceMethods, internal test IDs, ModelValidationStatus, ComplianceStimulus ≠
PhysicalNetworkDisturbance, AB-1d_min przed AB-1c, Explainable Verdict Contract).

**Pomiar Fable (pierwszy, NIEPEŁNY):** grep pełnotekstowy `mv-design-pro/**`, `git log --all --grep` na klonie
**płytkim** (`is-shallow-repository = true`, 12 granic, 1108 commitów osiągalnych) i trzy gałęzie zdalne
(`origin/main`, `origin/claude/mv-design-pro-twin-audit-u4lhy0`, `origin/claude/relaxed-sagan-ww188q`) — zero trafień.
**Korekta z audytu Opus** (`docs/evidence/OPUS_AUDYT_WARSTWY_REGULACYJNEJ_2026-09-23.md` §1): pierwsze twierdzenie
„wszystkie gałęzie zdalne" było fałszywe co do zakresu — `origin` ma **419 gałęzi + 475 głów PR**; pełna, niepłytka
historia (4779 commitów) pobrana do osobnego klonu w katalogu sesji i przeszukana `git log --all -S` dla dziewięciu
terminów: **każdy występuje wyłącznie w commicie `637a322f` (ten plan)**; `stash` pusty, `fsck` bez obiektów wiszących,
reflog bez śladu pracy poprzedniej sesji. Wniosek co do treści potwierdzony pełnym dowodem: poprzednia sesja **nie
zdążyła zatwierdzić ani wypchnąć** planu. Czego metoda nie wyklucza: pracy nigdy niewypchniętej z innego kontenera,
gałęzi skasowanych bez PR, forków. Odzyskane = dokładnie baseline R10.

**Dwa wyjątki (istnieją w kodzie i mają być ROZSZERZANE, nie tworzone):** `WiPWC` (ok. 40 plików: `ptpiree_wipwc_version`,
`PtpireeGeneratorCertificate.wipwc_version`, `mv_ptpiree_catalog.py`, `dowod_certyfikatu.py`, front `station-der`,
`oze/macierz`, `HelpPanel`) — istnieje wersja dokumentu i rejestr, nie istnieje REGUŁA (kiedy certyfikat zastępuje
test); `SyPGM` — `PtpireeModuleFamily = Literal["PPM","SyPGM","Morski_PPM"]` w kontrakcie FROZEN, przy czym most
modelu wpisuje `"PPM"` na sztywno (`model_bridge.py:211`) i pomija generatory synchroniczne (`:266-267`).

**Konsekwencja:** Program A/B jest w tym dokumencie **odtworzony z mandatu i z istniejącego kanonu W6**
(§2), a poprawki §95 są **wykonane po raz pierwszy** (§6, AB-1a/AB-1b), nie „dokończone". Piszę to wprost,
żeby nikt nie wziął rekonstrukcji za kontynuację niewidocznego dokumentu.

### 0.3 Rozstrzygnięcia orkiestratora (§0 karty — wiążące dla wykonawców)

| Id | Rozstrzygnięcie |
|---|---|
| **R-01** | Program A/B = **karty wykonawcze wycinka W6**. Fale zamrożenia (W6-A…W6-K) i wycinki syntezy (W6-6, W6-7) pozostają definicją ukończenia; kamienie AB-1…AB-7 grupują je w kolejność wykonawczą (§7). Kamień, który nie wskazuje wierszy macierzy zamrożenia (`FINAL_DYNAMICS_CAPABILITY_FREEZE.md` §2–§3) albo wiersza rejestru §5, nie wchodzi do realizacji. |
| **R-02** | Harmoniczne i supraharmoniczne wchodzą jako **równorzędne domeny fizyczne** (`PhysicsDomain`, §5.4 W-07) **wewnątrz tych samych kamieni** (tor H obok toru R w AB-2…AB-7), z własnym rdzeniem solvera `network_model/solvers/harmoniczne/` obok rdzeni FROZEN (DT-9), własną wyrocznią, mutacjami i CI. Numeracja pomocnicza kart toru H (`H-xx`) nie tworzy osobnej mapy dróg. |
| **R-03** | **Jeden ENM** (§5.4 W-08): urządzenie ma sekcje `fundamental / short_circuit / dynamic / harmonic / supraharmonic` w katalogu i w modelu, ale jest jednym elementem ENM. Zakaz drugiego modelu sieci, osobnej aplikacji jakości energii, harmonicznego SLD. |
| **R-04** | Fale W6-A i W6-F są **zamknięte** (R10). Fale W6-B, W6-C, W6-D, W6-E, W6-G, W6-H, W6-I, W6-J, W6-K oraz W6-6, W6-7 **otwarte** — ich wiersze są mapowane na kamienie w §7. |
| **R-05** | Napięcie ścieżki użytkownika (ZASADA NR 1 vs zamrożenie §5 W6-I „powierzchnia po W6-A…E"): **każdy kamień wpina swój wynik w istniejącą przeglądarkę wyników (`ui2/wyniki/**`) i w bieg kanoniczny** jako minimalną ścieżkę użytkownika; dedykowana przestrzeń robocza dynamiki (W6-I: I1–I4) wchodzi z AB-5/AB-6. Backend bez konsumenta jest długiem (mapa: klasa BEZ-KONSUMENTA), więc „powierzchnia później" nie zwalnia z wpięcia. |
| **R-06** | Wykonawca i recenzent: wyłącznie **Claude Opus 5.5** (`claude-opus-5-5`; dostępność potwierdzona odczytem identyfikatora w tej sesji). Brak dostępności = STOP, nie podmiana. |
| **R-07** | Rdzenie FROZEN (IEC 60909, NR/GS/FD, IEC 60255, `ncrfg_ptpiree`, `frt_hvrt`, `stability_rms`, V12.6) — nietknięte; zmiany wyłącznie przez decyzje właściciela OD-14/15/18/19/20/24/26 (B-01). Nowe rdzenie powstają obok. |
| **R-08** | Termin „PCC" z mandatu → w modelu i dokumentach **„miejsce przyłączenia"** (`scripts/pcc_zero_guard.py`; precedens zamrożenie §0.2). „PCS" (przekształtnik magazynu) jest terminem dozwolonym. |
| **R-09** | Zakaz spłycenia (§104): każdy raport programu jest sprawdzany wobec czterech zdań-kontrolnych (§11). |

---

## 1. Cel produktu (§5, §105, §106 mandatu)

MV-DESIGN-PRO ma odpowiadać na pytania: **co stanie się** w tej konkretnej sieci SN/nN z tymi konkretnymi
urządzeniami przy tym stanie pracy, zakłóceniu, zmianie topologii lub nastaw — w częstotliwości podstawowej,
w dynamice RMS, w dziedzinie harmonicznej i supraharmonicznej; **dlaczego**; **jaki jest margines**; **jaki
element, regulator, zabezpieczenie, częstotliwość, rezonans lub źródło emisji ogranicza układ**; **czy
wymaganie przyłączeniowe / techniczne można na tej podstawie wykazać**.

Definicja docelowa (§105): jeden model sieci → stan ustalony (rozpływ, napięcia, obciążenia) · zwarcia
(Ik, Ip, Ith, 1F/2F/3F) · dynamika (FRT, LFSM-O, regulatory, zwarcia, utrata źródła, skoki, topologia, wyspy,
zabezpieczenia, automatyka, CCT, stabilność) · BESS (SOC, energia, P/Q, GFL/GFM, FRT, wsparcie f) ·
harmoniczne (harmonic load flow, THD, harmoniczne indywidualne, udział źródeł, skan częstotliwościowy,
rezonans, filtry) · supraharmoniczne (widmo emisji, zależność od punktu pracy, propagacja, transfer,
sprzężenie faz, filtracja) · multi-physics (stan dynamiczny → stan widmowy; zdarzenie topologiczne →
przesunięcie rezonansu; tryb BESS → zmiana widma) · walidacja (model vs pomiar) · warianty (porównanie,
przemiatanie, wrażliwość, worst case) · dowód (White-Box, margines, źródło, niepewność, wyjaśnienie).

Architektura wielofizyczna (§6): ENM → {POWER FLOW, SHORT CIRCUIT, RMS/DAE, SEQUENCE DOMAIN, HARMONIC
FREQUENCY DOMAIN, SUPRAHARMONIC FREQUENCY DOMAIN} → Observables → Metrics → Criteria → Margins → Evidence →
Explanation → EngineeringResult → (compliance) RegulatoryProfile → Applicability → AcceptedEvidenceMethod →
ComplianceResult.

---

## 2. Aktualna mapa dróg (odtworzona z kanonu) — co jest, co otwarte

| Fala / wycinek | Domyka wiersze zamrożenia | Stan na `ef9f6228` | Dowód |
|---|---|---|---|
| W6-0 (S-1 stopień dowodowy, S-2 k_sc, S-3 jeden tor NC RfG, S-4 `no_module`, S-5 supersesje) | — | **wykonane** (synteza §5, STAN_REPO §2) | `solver_input/provenance.py` (`EvidenceTier`, `ClaimKind`), gotowość `inverter.k_sc_default_forbidden` |
| W6-1 kontrakty czasu · W6-2 rdzeń DAE · W6-3 urządzenia + adapter | A1, A4, A5, B1, C1, D1, D4–D6, D8–D10 | **wykonane** | `network_model/solvers/dynamika/**`, `enm/adapter_dynamiki.py`, `enm/scenariusze.py` (7 rodzajów zdarzeń), bieg `dynamika_rms` |
| **W6-A obserwable** | B2, B4 (moduł prądu), obserwable stanów C2–C5 | **wykonane w części** (korekta po przeglądzie Opus `docs/evidence/OPUS_PRZEGLAD_LUK_DYNAMIKI_2026-09-23.md` T-1): częstotliwość szyny `f_hz@` z domeną ważności — TAK; **B3 ROCOF — BRAK jakiegokolwiek kanału** (`silnik.py:627-685`, W6-A §13.6 „pozostaje CELEM"); prąd gałęzi tylko jako moduł (`silnik.py:757-758`); prąd bierny wsparcia i stan ogranicznika (C2) niedostarczone; SO-1A wykonany na G17, ale likwidacja zwarcia pochodzi z bezwarunkowego `zdjecie_zwarcia`, nie z otwarcia wyłącznika (T-3) | `W6_A_KONTRAKT_OBSERWABLI.md` Z3–Z5, §13.6; `tests/e2e/test_so1a_scenariusz_odniesienia.py` |
| **W6-F dowód i walidacja** | H1, H2 (częściowo), H3 | **ACCEPTED DONE (R10) w zakresie maszyny klasycznej 2. rzędu na szynie sztywnej**: D01–D07 = L5, D08–D10 = L4. **H4 (wyrocznie per rodzina) OTWARTE** (T-2): jedyna wyrocznia zewnętrzna = ANDES `GENCLS`; GFL, GFM, magazyn, turbina, maszyna 6. rzędu z AVR/GOV/PSS — bez niezależnej wyroczni i bez mutacji w CI (`mutacje.py:58-182` mutuje 4 pliki rdzenia) | `tests/walidacja_fizyczna/**` (bramki G1–G13, mutacje M10–M21, manifest, ANDES w osobnym jobie); R10 §AA zakres werdyktu |
| W6-B silnik zdarzeń | D7, D11, D12, D13 | **otwarte** — `komenda_regulacji` i `synchronizacja` istnieją jako rodzaje w scenariuszu, ale rdzeń **odmawia** (zamrożenie D13, D12); wyspa: `wyspy.py` wykrywa wyspę bez źródła (R10 F-8), brak nazwanego zdarzenia i warunku brzegowego wyspy z GFM | zamrożenie §2 D11–D13 |
| W6-C zabezpieczenia i automatyka w pętli | D3, D14, D15 | **otwarte** (SO-1B niewykonalne) | zamrożenie §0.2 |
| W6-D kryteria i metryki | E1–E4, E6–E8 | **otwarte** | — |
| W6-E granica stabilności (CCT) | E5, F1 | **otwarte** (bisekcja tylko w teście wyroczni SMIB) | `dynamika/walidacja/rowne_pola.py` |
| W6-G porównania i studia | F2, F3 | **otwarte** | rejestr serii biegów istnieje |
| W6-H diagnostyka | G1, G2 | **otwarte** | — |
| W6-I powierzchnia | I1–I4 | **otwarte** | `ui2/wyniki/stabilnosc` czyta trasę progową (mapa dom. 6: fasada) |
| W6-J turbiny typ 1/2 | A2, C5 | **otwarte** (odmowa) | `turbina_wiatrowa.py` |
| W6-K zwarcia niesymetryczne w czasie | D2 | **otwarte** (po W5 model fazowy) | — |
| W6-5 ewaluator WOS jako konsument `ResultSetDynamicV1`, OD-20 | — | **otwarte** (bezpiecznik A-6: T14/T15 = `NOT_SIMULATED`) | `application/ncrfg_compliance/**` |
| W6-6 QSTS + dyspozycja BESS | — | **otwarte** | — |
| W6-7 jakość energii (flicker do solvera, VUF, harmoniczne pod „Jakość", EN 50160) | — | **otwarte**; harmoniczne dziś = **REWRITE** (audyt Opus `docs/evidence/OPUS_AUDYT_HARMONICZNE_SUPRAHARMONICZNE_2026-09-23.md` §0.1, F1–F9): `v126_academic._power_quality` (FROZEN) liczy Y w omach bez przekładni (U_5 po stronie nN ×1406 za duże, THD_U 463,9 %), R transformatora bez U² (×225 za małe), szyna odniesienia = pierwsza na liście (THD zależne od kolejności danych), moc zwarciowa sieci nieczytana, źródła sumowane z fazą 0°, grupa połączeń ignorowana, asymetria = 0,0 i „zgodny" bez obliczenia; jedyny test referencyjny sprawdza `THD ≥ 0`; **0 rekordów katalogu przekształtników niesie widmo**; brak dławika/filtra w ENM; supraharmoniczne: 0 trafień w kodzie. Poprawne i do przejęcia: `ShuntCapacitor` w ENM, topologia assemblera, VUF z rozpływu niesymetrycznego, znak susceptancji, flicker (cytowany IEC/TR 61000-3-7) do ADAPT | `v126_academic.py:240-520`, `v126_contracts.py:103-114, 740-944`, `mv_converter_catalog.py` (0 widm) |

Aktywne decyzje właściciela wpływające na program: OD-20 (B-01 pakiet W6), OD-21 (dokumenty źródłowe WOS/IRiESD
2025), OD-26 (martwe `compliance_tests` w profilach), OD-33 (jedna obwiednia FRT), OD-34 (nastawy z modelu), OD-37
(silnik indukcyjny — przyjęty do celu).

---

## 3. Role (§1 mandatu)

| Rola | Kto | Zakres |
|---|---|---|
| Orkiestrator, architekt, integrator, właściciel grafu zależności, strażnik kanonu / Git / CI / spójności domen | **Fable 5.1** | odzyskuje stan, planuje, deleguje, integruje, przyjmuje lub odrzuca wynik, utrzymuje JEDEN program |
| Wykonawca i falsyfikator | **Claude Opus 5.5** (jedyny) | role wg zadania: profesor systemów elektroenergetycznych, profesor elektrotechniki, specjalista dynamiki, DAE, metod numerycznych, stabilności, automatyki zabezpieczeniowej, energoelektroniki, modeli GFL/GFM, BESS, jakości energii, harmonicznych, supraharmonicznych, impedancji częstotliwościowych, pomiarów, inżynier walidacji, forensic Git auditor, master software architect |

---

## 4. Baseline R10 — co ma być ZACHOWANE (§3 mandatu)

Fail-closed dependencies (F-5) · wyspa bez źródła wykrywana przed Newtonem (F-8, `wyspy.py`) · numerical
firewall (`skonczonosc.py`) · mutation harness (M10–M21, job `mutacje-dynamiki`) · niezależne wyrocznie
(analityczne, całka pierwsza, równe pola, ANDES w osobnym środowisku) · bus-frequency contract (OD-30,
`obserwable.py`) · CCT evidence (`rowne_pola.py`, bramka) · corrected ANDES timing (R10 §F–§G) · exact-SHA CI
(R10 §W) · evidence reproducibility (`python -m tests.walidacja_fizyczna.uruchom`). Każda karta AB, która
dotyka rdzenia dynamiki, kończy się przebiegiem tego aparatu (bramka nieregresji).

---

## 5. REJESTR WYMAGAŃ (treść mandatu §5–§100, przeniesiona w całości)

Konwencja identyfikatorów: `D-` dynamika (mandat §9–§35), `H-` harmoniczne (§36–§52), `S-` supraharmoniczne
(§53–§67), `W-` wspólne (§6–§8, §68–§100). Kolumna „Kamień" odsyła do §7. Kolumna „Wiersz zamrożenia" wiąże
z `FINAL_DYNAMICS_CAPABILITY_FREEZE.md` tam, gdzie wiersz istnieje; `NOWY` = wymaganie spoza macierzy
zamrożenia (rozszerzenie celu, nigdy redukcja — zamrożenie §8 p. 4).

### 5.1 Dynamika RMS/DAE, zabezpieczenia, automatyka (`D-`)

| Id | Wymaganie (treść mandatu) | Wiersz zamrożenia | Kamień |
|---|---|---|---|
| D-09 | Pełna biblioteka zdarzeń i scenariuszy umożliwiająca rzeczywiste badania SN; **nie** cztery testy NC RfG | A3 | AB-2 |
| D-10 | Zwarcie i clearing: PRE-FAULT → FAULT → CLEARING → POST-FAULT; wejścia minimum: lokalizacja, impedancja zwarcia, chwila wystąpienia, czas usunięcia, topologia pozwarciowa; obserwable `U_i(t)`, `θ_i(t)`, `f_i(t)`, `ROCOF_i(t)`, `I_ij(t)`, `P_ij(t)`, `Q_ij(t)` + stany urządzeń | D1, D3, B1–B4 | AB-2 — PARTIAL: zwarcie 3F w węźle z `r_f/x_f` i zdjęciem jako osobnym wpisem TAK; BRAK: ROCOF, fazor prądu gałęzi, zwarcie na gałęzi (% długości), **predykat izolacji** (zdjęcie zwarcia jest bezwarunkowe — `zdarzenia.py:266-274`; rozróżnić `usuniecie_samoistne` od `izolacja`) |
| D-11 | FRT dla PPM-B jako pełna symulacja: zwarcie, zapad, ogranicznik, `I_d`, `I_q`, odpowiedź prądem biernym, tłumienie prądu czynnego, priorytet składowej, clearing, odbudowa, stan końcowy; kryteria ROZDZIELONE i mierzone osobno: `stay_connected`, `reactive_current_activation`, `reactive_current_magnitude`, `current_limit_behavior`, `active_power_recovery`, `final_operating_state` | C2, E2, E6 | AB-2 |
| D-12 | Szybki prąd zakłóceniowy: `I_d(t)`, `I_q(t)`, `|I| = √(I_d²+I_q²) ≤ I_max`; deadband, gain, opóźnienie aktywacji, zależność od napięcia, nasycenie, priorytet P/Q, zachowanie zwolnienia | C2, E6 | AB-2 |
| D-13 | Odbudowa mocy czynnej po clearingu: chwila rozpoczęcia, gradient, czas osiągnięcia zadanego udziału `P_pre`, maksimum, przeregulowanie, stan końcowy, ograniczenie limiterem, ograniczenie dostępnością źródła | E6 | AB-2 |
| D-14 | LFSM-O jako pełna symulacja (nie wykres algebraiczny): skok `f_0→f_1`, rampa `f(t)=f_0+kt`, powrót; próg, deadband, statyzm, opóźnienie, ramp-rate, dostępne P, nasycenie, odbudowa | E3, E7 | AB-3 |
| D-15 | Regulatory P/Q/U dynamiczne: `Q(U)`, `cosφ(P)`, `Q=Q_zad`, `P=P_zad`, `U=U_zad`; dla każdego: dynamika, deadband, nachylenie, stałe czasowe, ograniczenia szybkości, nasycenie, priorytet, punkt pomiaru | C2, C3, D13 | AB-3 |
| D-16 | BESS pełny model dynamiczny: `P(t),Q(t),I(t),SOC(t),E(t)`; `dE/dt = F(P, η_ch, η_dis)` z jawną konwencją znaków; `SOC_min ≤ SOC ≤ SOC_max`; nie ma energii znikąd; tryby charge/discharge/idle, P control, Q control, Q(U), LFSM-O jeśli dotyczy, FRT, limiter, GFL, GFM tam gdzie model reprezentuje zdolność | C4, E7 | AB-4 |
| D-17 | Utrata źródła: loss of PV, loss of BESS, loss of synchronous source, simultaneous loss, partial generation loss; analiza U, f, ROCOF, redystrybucji mocy, odpowiedzi BESS, odpowiedzi zabezpieczeń, wyspowania | D5, D6, E3 | AB-2 |
| D-18 | Skoki: `LOAD_STEP`, `GENERATION_STEP`, `P_SETPOINT_STEP`, `Q_SETPOINT_STEP`, `U_SETPOINT_STEP`; analiza ustalania, przeregulowania, odpowiedzi f i U, interakcji regulatorów | D8, D13 | AB-2 / AB-3 |
| D-19 | Zmiana topologii minimum: `LINE_OPEN/CLOSE`, `TRANSFORMER_OPEN/CLOSE`, `COUPLER_OPEN/CLOSE`, `SOURCE_TRIP`, `BREAKER_TRIP`, `RECLOSE`; po zmianie `Y⁻→Y⁺` i obowiązkowa re-inicjalizacja algebraiczna `g(x⁺,y⁺)=0` | D4, D9, D10, D12 | AB-2 |
| D-20 | SO-1A: clearing zaplanowany (`t_clear` od projektanta) — osobna zdolność, pozostaje ważna | §0.2 zamrożenia | wykonane (W6-A) **z zastrzeżeniem T-3**: G17 jest pierścieniem, otwarcie `wyl-pole` nie izoluje `b-sn-stacja` (zasilana przez `kab-domkniecie`, `so1a_pv_magazyn.py:267-274`) — SO-1A dowodzi wykonania harmonogramu, nie łańcucha likwidacji; wariant promieniowy (wymaga odcinka beznapięciowego B-1) → AB-2 |
| D-21 | SO-1B: clearing z zabezpieczenia: fault → I/U → relay → trip → breaker → topology → RMS continuation; SO-1A nie dowodzi SO-1B | D3, D14 | AB-5 |
| D-22 | IEC 60255 w pętli czasowej ze STANEM zabezpieczenia: pickup, akumulator, dropout, reset, trip latch, breaker delay — nie `t_trip=f(I(t))` liczone niezależnie w każdym kroku | D14 | AB-5 |
| D-23 | Automatyka: SPZ, SZR, sprzęgła, odciążanie, generation shedding, LoM, logika wyspowa, sekwencje wielozdarzeniowe; każde działanie: `time, trigger, device, cause, state_before, state_after` | D15 | AB-5 |
| D-24 | Praca wyspowa: wykrycie wysp po zmianie topologii, źródła, GFL/GFM, bilans P/Q, U, f; wyspa z odbiorem bez źródła = nazwana odmowa przed Newtonem; zakaz `U=1 pu, f=50 Hz` jako fallback | D11 | AB-2 (predykat „brak źródła FORMUJĄCEGO" — eksperyment E-1: wyspa z samym GFL kończy się `dynamika.krok_niezbiezny` po 0–208 ms policzonej fikcji, nie odmową fizyczną; kanał składu wysp) / AB-5 (warunek brzegowy wyspy z GFM/BESS — E-2: GFM + odbiór liczy się, 50,5 Hz / 1,143 pu; E2E-R8). Wykrycie wyspy bez urządzeń wnoszących prąd — wykonane R10 F-8 |
| D-25 | Rekonekcja: przed zamknięciem `ΔU`, `Δf`, `Δθ`; wynik wyjaśnia, dlaczego załączenie jest/nie jest dopuszczalne dla aktywnego kryterium | D12 | AB-5 |
| D-26 | Stabilność kątowa: `δ̇=ω_b(ω−1)`, `ω̇=(P_m−P_e−D(ω−1))/2H`; obserwować δ, ω, P_e, P_m, tłumienie, oscylacje; zakaz samego `δ_max` bez formalnego kryterium | C1, E4 | AB-5 |
| D-27 | Small-signal / odpowiedź oscylacyjna: okres, tłumienie, wpływ H, D, impedancji źródła, regulatorów; nie udawać pełnego eigenanalysis; jeśli implementowany — osobny zwalidowany kontrakt | E4 (rozszerzenie) | AB-5 (kontrakt osobny) |
| D-28 | CCT automatyczne `t_CCT`; nie zakładać monotoniczności dla układu konwerterowego; przed bisekcją sprawdzić założenie granicy; `M_CCT = t_CCT − t_clear` | E5, F1 | AB-5 |
| D-29 | Częstotliwość węzła zachowana: `θ̇ = Im(V̇·V̄)/|V|²`, `f = f_n + θ̇/2π`; rozdzielone: bus frequency, PLL frequency, rotor frequency | B2 | szyna: wykonane (W6-A, OD-30: `f_hz@`, `u_f_est_hz@`, `jakosc_f@`); **PLL i wirnik NIE są kanałami** (PLL: tylko stan `pll_calka_pu`, `przeksztaltnik_gfl.py:204-206`; wirnik: `omega_pu@` w pu; GFM `droop` bez stanu prędkości) → kanały `f_pll_hz@`, `f_wirnika_hz@` — AB-2 |
| D-30 | ROCOF rozdzielony: `bus_rocof`, `pll_rocof`, `rotor_rocof` — nie mieszać w jeden kanał | B3 | **GAP całości** (korekta T-1: zero kanałów ROCOF w `dynamika/**`; G3 liczy `(P_m−P_e)/2H` w teście): `rocof_chwilowy` szyny/PLL/wirnika → AB-2; `rocof_pomiarowy` (okno, filtr, interwał, semantyka zdarzeń) → AB-5 (konsument 81R) |
| D-31 | Modele odbiorów: constant P/Q, ZIP, frequency-sensitive, composite, silnik indukcyjny (stall, reacceleration, post-fault current, interakcja z odbudową napięcia); architektura ma to przewidzieć | C6 (OD-37) | AB-2 (constant/ZIP/f-sensitive), AB-5 (silnik) |
| D-32 | GFL minimum: PLL, P control, Q control, Id/Iq, limiter, FRT, post-fault recovery, setpoints | C2 | AB-2/AB-3 |
| D-33 | GFM jako osobna fizyka regulatora: formowanie U i f, droop, virtual inertia/VSM gdzie model istnieje, ograniczenie prądu, praca wyspowa; zakaz oznaczania GFM po nazwie produktu — wymagany jawny model | C3 | AB-3 |
| D-34 | Worst-case dynamics (AB-6): warianty P, Q, U, S_k'', X/R, SOC, t_fault, t_breaker, nastawy regulatorów, nastawy zabezpieczeń, topologia; `min_p M(p)` | F3 | AB-6 |
| D-35 | Comparison mode: scenariusz A/B na wspólnych wielkościach: U, f, ROCOF, P, Q, prądy, SOC, działania zabezpieczeń, marginesy FRT, CCT | F2 | AB-6 |

### 5.2 Harmoniczne (`H-`)

| Id | Wymaganie (treść mandatu) | Kamień |
|---|---|---|
| H-36 | Harmoniczne = równorzędna zdolność analityczna, nie dodatek; nie część DAE czasu podstawowego; część tego samego produktu | AB-1 (domena), AB-2H |
| H-37 | Harmonic load flow: dla `f_h = h·f_1` lub jawnej listy `f` budować `Y(f_h)` i rozwiązywać `Y(f_h)V(f_h)=I(f_h)`; dla każdego h/f: `V_h` na szynach, `I_h` w gałęziach, przepływ harmoniczny, udział źródło→szyna, źródło→gałąź | AB-2H |
| H-38 | Wyniki minimum `U_h`, `I_h`, `φ_U,h`, `φ_I,h` (jeśli model zawiera fazę) — nie tylko amplituda | AB-2H |
| H-39 | THD z właściwej definicji `THD_U = √(Σ_{h=2}^{H} U_h²)/U_1`, analogicznie `THD_I`; THD to tylko jedna metryka | AB-2H |
| H-40 | Harmoniczne indywidualne h=2,3,5,7,11,13,… widoczne dla użytkownika; źródło dominujące, szyna krytyczna, prąd w gałęzi, kierunek propagacji | AB-2H (wynik), AB-5H (dominujące źródło = contribution) |
| H-41 | Interharmoniczne: architektura częstotliwościowa dopuszcza dowolne `f ∈ ℝ⁺`, nie tylko `n·f_1` (konieczne też dla supraharmonicznych) | AB-1d_min (kontrakt), AB-2H |
| H-42 | Modele kabli zależne od częstotliwości: zakaz uniwersalnego `R(f)=R_50`, `X(f)=(f/50)X_50` jako prawdy całego pasma; model umożliwia `R(f), L(f), C(f), G(f)`; uwzględniać tylko efekty z modelem/danymi (skin, proximity, dielectric losses, R(f)); brak danych = jawna kwalifikacja jakości modelu | AB-2H |
| H-43 | Transformator w dziedzinie f: `Z_TR(f)`; leakage, straty, grupa połączeń, zachowanie składowej zerowej/fazowe gdzie potrzebne, transfer harmonicznych; zakaz jednej stałej `u_k` do dowolnie wysokiej f bez określenia domeny | AB-2H |
| H-44 | Kondensator `Z_C = 1/(jωC)` w zakresie ważności; dławik `Z_L = jωL` + realny model strat jeśli wymagany; układy kompensacji krytyczne dla rezonansów | AB-2H |
| H-45 | Filtry: passive tuned, high-pass, damping branches, inne jawnie modelowane; porównanie before/after z ilościową redukcją | AB-5H |
| H-46 | Frequency scan: dla węzła `Z_th(f)`: moduł, faza, częstotliwości rezonansu, antyrezonansu, piki, doliny — nie tylko wykres | AB-2H |
| H-47 | Rezonans jako analiza przyczynowa: przy jakiej f, jaki moduł, jaki element/układ dominuje, jak zmieni wynik długość kabla, kondensator, dławik, TR, sprzęgło, BESS, PV, topologia | AB-5H / AB-6 |
| H-48 | Modele źródeł harmonicznych co najmniej: `CURRENT_SPECTRUM`, `VOLTAGE_SPECTRUM`, `NORTON_EQUIVALENT`, `THEVENIN_EQUIVALENT`, `MEASURED_SPECTRUM`, `FREQUENCY_DEPENDENT_EQUIVALENT`; model ma `frequency, amplitude, phase, operating_point, source, version, validation_status` | AB-2H |
| H-49 | Agregacja wielu źródeł: zakaz sumowania modułów arytmetycznie bez informacji o fazie/metodzie; metoda jawna: complex phasor sum, statistical aggregation, conservative envelope — zależnie od rodzaju danych | AB-2H |
| H-50 | Tło sieci jako wejście: zakaz `U_h,bg = 0` bez danych; rozdzielone `U_background`, `U_plant`, `U_combined` | AB-2H |
| H-51 | Contribution analysis: które urządzenie najbardziej odpowiada za h-tą harmoniczną na szynie X — source decomposition, transfer sensitivity, contribution matrix; zakaz udawania przyczynowości korelacją amplitud | AB-5H |
| H-52 | Harmonic sensitivity (AB-6): liczba falowników, P, Q, długość kabla, wielkość kondensatora, topologia, impedancja źródła, wartości filtra | AB-6 |

### 5.3 Supraharmoniczne (`S-`)

| Id | Wymaganie (treść mandatu) | Kamień |
|---|---|---|
| S-53 | Supraharmoniczne wpisane do bieżącego grafu zależności i docelowego produktu — nie „odległa przyszłość" | AB-1d_min (kontrakt), AB-4H, AB-5H |
| S-54 | Kontrakt `SupraharmonicBand`: `f_min, f_max, frequency_resolution, aggregation_bandwidth, measurement_method, source_document, version`; zakaz hardkodowania jednej definicji bez źródła | AB-1d_min |
| S-55 | Źródła: PV inverter, BESS PCS, wind converter, EV charger, VFD, UPS, inne przekształtniki; model `E(f)`, docelowo `E(f,P,Q,U,mode)`, dla BESS `E(f,P,Q,U,SOC,mode)` | AB-4H |
| S-56 | Zależność emisji od punktu pracy: P, Q, U, charge/discharge, SOC, tryb sterowania, siła sieci — gdzie istnieją dane/model; zakaz jednego widma „BESS" dla wszystkich warunków | AB-3H / AB-4H |
| S-57 | Propagacja `I_s(f) → Y(f) → V_i(f)` w zakresie pasma; tłumienie, wzmocnienie, rezonans, transfer węzeł→węzeł | AB-4H |
| S-58 | Transfer function `H_{i←j}(f) = V_i(f)/I_j(f)` (lub właściwa wielkość transferowa); „jak emisja z BESS dociera do konkretnej szyny" | AB-4H |
| S-59 | Sprzężenie między fazami gdy wymagają dane: `Y_abc(f)`; źródło na fazie A → odpowiedź A/B/C; nie wyprowadzać z positive-sequence RMS | AB-5H (po W5 model fazowy) |
| S-60 | Import widma z pomiaru: frequency, magnitude, phase (jeśli dostępna), timestamp, operating point, device state; źródła CSV, XLSX, eksport analizatora jakości energii, eksport oscyloskopu / PQ monitor (format do dodania) | AB-7 |
| S-61 | Parametry pomiaru częścią danych: sampling rate, frequency resolution, window, aggregation, RBW, measurement duration, noise floor, calibration metadata | AB-7 |
| S-62 | Walidacja harmoniczna model↔pomiar: amplitude error, phase error, THD error, individual harmonic error, resonance-frequency error, max spectral error | AB-7 |
| S-63 | Walidacja supraharmoniczna minimum: peak frequency error, peak amplitude error, band-energy error, transfer ratio error, spectral distance; z parametrami metody pomiarowej | AB-7 |
| S-64 | Time-frequency (STFT, spectrogram, zmiana widma w czasie) dla emisji zależnych od trybu — przewidziane, **nie implementowane przed statyczną dziedziną f** | AB-7 (po S-62/S-63) |
| S-65 | Sprzężenie RMS ↔ spektrum: zakaz wkładania częstotliwości przełączania do RMS DAE; droga: RMS trajectory → operating-point snapshot → spectral-model selection → frequency-domain solve; `P(t),Q(t),U(t),SOC(t),limiter(t)` determinują `E(f,t)` | AB-3H / AB-4H (MP) |
| S-66 | Scenariusz multi-physics: PF → RMS zakłócenie → snapshoty → aktualizacja modelu spektralnego → solver harmoniczny/supraharmoniczny → korelacja na wspólnej osi zdarzeń | AB-4H / AB-6 |
| S-67 | Brak EMT ≠ brak analizy supraharmonicznej (measured spectra, frequency-domain equivalents, validated spectral models); zakaz deklarowania instantaneous switching waveform, jeśli nie jest symulowany | AB-1 (kontrakt domeny), AB-4H |

### 5.4 Wspólne: domeny, ENM, katalog, profil, normy, wyjaśnialność, dowód (`W-`)

| Id | Wymaganie (treść mandatu) | Kamień |
|---|---|---|
| W-06 | Jedna aplikacja, jedna sieć, wiele właściwych fizycznie silników; wspólny łańcuch Observables → Metrics → Criteria → Margins → Evidence → Explanation → EngineeringResult; compliance: EngineeringResult → RegulatoryProfile → Applicability → AcceptedEvidenceMethod → ComplianceResult | AB-1a, AB-1c |
| W-07 | Kontrakt `PhysicsDomain` minimum: `POWER_FLOW, SHORT_CIRCUIT, RMS_DYNAMICS, SEQUENCE_DOMAIN, HARMONIC_FREQUENCY_DOMAIN, SUPRAHARMONIC_FREQUENCY_DOMAIN`; nie mieszać phasor RMS 50 Hz, harmonic RMS, widma, waveform instantaneous, EMT; każdy wynik mówi, z jakiej domeny pochodzi | AB-1a |
| W-08 | ONE ENM: ta sama szyna, linia, kabel, TR, PPM, PV, BESS, wiatr, źródło synchroniczne, odbiór, kondensator, dławik, filtr, aparat widoczna w wielu domenach; urządzenie może mieć `fundamental_model, short_circuit_model, dynamic_model, harmonic_model, supraharmonic_model` — to nadal to samo urządzenie ENM | AB-1a (kontrakt), AB-2H (kondensator/dławik/filtr jako elementy ENM) |
| W-68 | Katalog urządzenia (np. PCS): sekcje `fundamental, short_circuit, dynamic, harmonic, supraharmonic, certification, measurement, validation`; każda sekcja z własnym statusem `VALIDATED, UNVALIDATED, MEASURED, CERTIFIED, UNKNOWN, OUTSIDE_DOMAIN` | AB-1a (statusy), AB-2H/AB-4H (sekcje) |
| W-69 | Profil regulacyjny — istniejący rozszerzyć, nie zastępować: NC RfG, WOS, PTPiREE, WiPWC, OSD, Bank Nastaw, power-quality requirements, harmonic requirements, supraharmonic requirements, measurement requirements | AB-1b |
| W-70 | Normy — zero zgadywania: przed zakodowaniem wymogu jakości energii Opus 5.5 ustala dokładny dokument, wersję, zakres napięcia, podmiot, punkt pomiaru, sposób agregacji, pasmo, jednostkę, kryterium; zakaz przenoszenia limitu nN→SN, urządzenie→instalacja, kompatybilność→emisja, inna norma, inna wersja | AB-1b (fail-closed do OD-21/OD-38) |
| W-71 | Wyjaśnialny wynik we wszystkich domenach — zakaz `SPEŁNIA / NIE SPEŁNIA / PASS / FAIL` jako samodzielnej odpowiedzi; każdy wynik ma: `subject, physics_domain, criterion, measured, required, margin, critical_point, cause, explanation, basis, evidence, model_status, input_status, uncertainty, domain_of_validity, trace` | AB-1a (Explainable Verdict Contract) |
| W-72 | Przykład harmoniczny (wzorzec zdania): THD_U na szynie SN X = 2,81 %, limit profilu 3,00 %, margines +0,19 p.p., największy udział 11. i 13., dominujące źródło 11. = PPM-2, wzmocnienie przez maksimum impedancji przy … Hz, status modelu kabla w tym zakresie, kryterium z … | AB-1a (szablon wyjaśnienia) |
| W-73 | Przykład supraharmoniczny: największy pik przy 16,2 kHz; wartość na zaciskach PCS … i na szynie SN …; transfer …; wzmocnienie lokalnym maksimum `|Z_th(f)|`; emisja w trybie ładowania przy P=…; dla rozładowania amplituda spada o … | AB-1a (szablon) |
| W-74 | White-Box dynamiki: INITIAL CONDITION → MODEL → EVENT → DAE → OBSERVABLE → METRIC → CRITERION → MARGIN → CAUSE → VERDICT EXPLANATION | H1 (wykonane W6-F) + AB-2 (metryki/kryteria) |
| W-75 | White-Box harmonicznych: SOURCE SPECTRUM → FREQUENCY → ELEMENT MODELS → Y(f) → SOLUTION → BUS/BRANCH SPECTRUM → METRIC → CRITERION → MARGIN → SOURCE CONTRIBUTION → EXPLANATION | AB-2H |
| W-76 | White-Box rezonansu: TOPOLOGY → Z_element(f) → Y(f) → Z_th(f) → PEAK → RESPONSIBLE ELEMENTS → SENSITIVITY → ENGINEERING CONSEQUENCE | AB-2H / AB-5H |
| W-77 | White-Box supraharmonicznych: OPERATING POINT → EMISSION MODEL → NETWORK MODEL(f) → TRANSFER → RECEIVER SPECTRUM → BAND METRIC → CRITERION → MARGIN → EXPLANATION | AB-4H |
| W-78 | Wyrocznie niezależne dynamiki: analityczna, niezależne całkowanie, ANDES gdzie porównywalne, niezależne drogi CCT, porównanie z pomiarem | zachowane (R10) + AB-5 (CCT), AB-7 |
| W-79 | Wyrocznie harmoniczne minimum: analityczna mała sieć, niezależny solver macierzowy, inne narzędzie tylko gdzie fizyka porównywalna, measurement benchmark; wyrocznia nie używa tych samych funkcji budowy `Y(f)` | AB-2H |
| W-80 | Mutacje dynamiki zachowane/rozszerzone: sign error, limiter error, event timing, Iq gain, recovery, base conversion, topology reinitialization, relay accumulator | R10 + AB-2/AB-5 |
| W-81 | Mutacje harmoniczne (każda zabita): wrong susceptance sign, Hz/kHz error, dropped harmonic source, constant R instead of R(f), missing capacitor, wrong transformer connection, ignored background, wrong frequency bin, magnitude/peak-RMS confusion | AB-2H |
| W-82 | Mutacje supraharmoniczne: operating point ignored, wrong spectrum interpolation, frequency-axis scale ×1000, wrong phase coupling, lost high-frequency damping, wrong transfer direction | AB-4H |
| W-83 | Wspólny framework wariantów PARAMETER → RUN → METRIC → MARGIN: dynamics (CCT, FRT, f nadir, ROCOF, recovery), harmonics (THD, U_h, I_h, resonance gain), supraharmonics (peak, band metric, transfer) | AB-6 |
| W-84 | Worst-case multi-physics `min_p M(p)` dla `p = (P,Q,U,SOC,S_k'',X/R,t_clear,L_cable,C,topology,controller,filter)`; worst-case różny dla FRT, CCT, THD, rezonansu, peak — zakaz łączenia w jeden sztuczny score | AB-6 |
| W-85 | Jedna przeglądarka wyników: PF (U/P/Q/loading), SC (Ik/Ip/Ith), RMS (przebiegi), harmoniczne (widmo, tabele, udział źródeł), skan (|Z|/kąt, rezonans), supraharmoniczne (widmo w.cz., metryki pasma, transfer); każdy wynik z modelem, scenariuszem, proweniencją, dowodem, wyjaśnieniem | każdy kamień (R-05) |
| W-86 | Ten sam SLD: kliknięcie szyny/urządzenia otwiera PF, SC, dynamikę, harmoniczne, skan, supraharmoniczne; zakaz harmonicznego SLD jako drugiego świata | AB-2H / AB-5 (nakładki), W7 |
| W-91 | Najpierw audyt istniejącego kodu (`harmonic, harmonics, THD, spectrum, FFT, frequency_scan, impedance, resonance, power_quality, supraharmonic, interharmonic, EMC` + katalogi + UI) z klasyfikacją `ADOPT / ADAPT / REWRITE / KEEP_RESEARCH_ONLY / REJECT` | §8 tego dokumentu |
| W-92 | Nie zakładać poprawności istniejącego kodu (precedens NC RfG: fałszywe testy, niepełne profile, uproszczone FRT): VERIFY → REPRODUCE → FALSIFY → DECIDE | §8 |
| W-93 | Wpięcie do obecnego planu, nie osobna roadmapa; preferowane rozszerzenia: AB-1 (wspólne wyniki, proweniencja, wyjaśnialność), AB-3 (regulatory jako źródło punktu pracy dla emisji), AB-4 (BESS: dynamic + harmonic + supraharmonic), AB-6 (wspólne sweeps), AB-7 (wspólna walidacja pomiarowa RMS + spectrum); osobny przyrost solvera harmonicznego = dependency istniejącego programu | §7, §9 |
| W-95 | Poprawki dokumentacyjne poprzedniej sesji (do wykonania przed AB-1): WOS resolver, PTPiREE resolver, WiPWC, Bank Nastaw, PPM vs SyPGM, AcceptedEvidenceMethods, internal test IDs, ModelValidationStatus, ComplianceStimulus ≠ PhysicalNetworkDisturbance, AB-1d_min przed AB-1c, Explainable Verdict Contract | §6 |
| W-96 | Rozdzielić: `equation validated` ≠ `device model validated` ≠ `compliance evidence accepted` — dla RMS, harmonic, supraharmonic | AB-1a (`ModelValidationStatus`) |
| W-97 | AB-7 rozszerzyć: time-domain `U(t),I(t),P(t),Q(t),f(t)`, frequency-domain `U(f),I(f)`, supraharmonic `Spectrum(f)` + pomiar | AB-7 |
| W-98 | Jakość danych: każdy parametr `VALUE, UNIT, SOURCE, VERSION, STATUS, DOMAIN`; zakaz danych producenta bez identyfikacji, „typowych" widm jako modelu certyfikowanego, modelu 50 Hz w 100 kHz, domyślnego tła 0, domyślnej impedancji sieci | AB-1a (kontrakt parametru), AB-2H |
| W-99 | Fail closed: brak danych → `UNVALIDATED_INPUT, MODEL_MISSING, OUTSIDE_DOMAIN, REQUIREMENT_UNVERIFIED` z pełnym wyjaśnieniem; zakaz fabrykacji | AB-1a |
| W-100 | Evidence standard wspólny: equation + implementation + units + domain + oracle + benchmark + mutation + CI — bez taryfy ulgowej dla harmonicznych | każdy kamień |

---

## 6. Poprawki §95 — wykonane po raz pierwszy (definicje wiążące dla AB-1)

Każda pozycja poniżej dostaje kontrakt w AB-1a/AB-1b; definicja tutaj jest źródłem prawdy dla wykonawcy.

| # | Pozycja | Definicja i miejsce w kodzie | Kamień |
|---|---|---|---|
| 1 | **WOS resolver** | **WOS = wymogi ogólnego stosowania** (art. 7 rozporządzenia 2016/631: propozycja właściwego operatora systemu, zatwierdzenie organu regulacyjnego; czy w PL zatwierdzono osobne dokumenty per OSD czy jeden wspólny — OD-21). Kolizja akronimu: `MAPA` OD-21 rozwijało „WOS" jako „właściwy operator systemu" — skorygowane (§12.1); operator pisany w pełni albo „OS". Klucz rozwiązywania: `(typ modułu A/B, rodzaj PPM/SyPGM/poza zakresem RfG, poziom napięcia nN/SN, data umowy na główne urządzenie wytwórcze — art. 4 ust. 2 rozróżnia moduł nowy od istniejącego, data przyłączenia)` → lista wymagań z `clause_ref`, wersją i datą obowiązywania. **BESS: 2016/631 nie obejmuje magazynów** (art. 3 ust. 2; litera przepisu — OD) → resolver zwraca `REQUIREMENT_UNVERIFIED` z powodem „wymagania krajowe dla magazynów — OD", nigdy wymagania PPM. Dziś: 5 profili YAML (brak Stoen Operator), 4 OSD bez żadnej różnicy liczbowej, PSE różni się jednym punktem HVRT (`pse.yaml:64`), progi klas modułów w KAŻDYM profilu (1 MW / 50 MW) **sprzeczne z progami PL 200 kW / 10 MW** opisanymi w `compliance/nc_rfg_modul.py:23-37` (OD-41), `classify_module` zwraca D dla < 0,8 kW. Cel: **jeden loader** (`catalog/profiles/nc_rfg/loader.py`) z dwoma rodzajami plików (profil operatora = IRiESD/warunki; profil WOS = krajowy) powiązanymi referencją — bez drugiego katalogu z równoległym loaderem; pola addytywne i opcjonalne (`NcRfgProfile.zrodlo{source_document, version, valid_from, validation_status}`, `wymagania[]{clause_ref, module_types, rodzaj_modulu, poziom_napiecia jako predykat kV, miejsce_pomiaru, wartosc, jednostka}`); `classify_module` z jednego źródła krajowego (dziś pięć kopii). Solver FROZEN czyta YAML (`engine.py:234`), więc **liczby w YAML nie zmieniają się do OD-21** (zmiana liczb = zmiana werdyktów FROZEN); do czasu OD-21 profil nosi `validation_status: UNVERIFIED_SOURCE` i **nie** produkuje `ComplianceResult` klasy dowodu; **zakaz uzupełniania liczb z pamięci modelu językowego lub z obcych kodeksów** | AB-1b |
| 2 | **PTPiREE resolver** | Mapowanie wymagania WOS → test procedury PTPiREE 3.0 (T01–T20 solvera FROZEN, kanon `docs/analysis/NC_RFG_PTPiREE_TESTY_KANON.md`) z `AcceptedEvidenceMethod` per test; jedyna kanoniczna przestrzeń numeracji = T01–T20 (A-5); `compliance_tests` w YAML = martwe (OD-26). **Kolizja potwierdzona audytem:** test harmoniczny solvera to **T20** (`engine.py:850-880`), a `T18` w YAML = „Test harmonicznych" podczas gdy T18 solvera = praca wyspowa — ta sama etykieta, dwa testy; resolver rozstrzyga wyłącznie po numeracji solwera. T20 porównuje `harmonic_thdu_percent` urządzenia z 8 % zaszytym w solverze (nie w profilu, wbrew `provenance.py:322`) — THD_U jest własnością napięcia sieci, nie emisji urządzenia (zakaz W-70), więc T20 w AB-1c czyta `WynikInzynierski` z AB-2H albo zostaje `REQUIREMENT_UNVERIFIED`; kontrolka „THD napięcia [%]" modułu w UI (`macierzModel.ts:347`, `NcRfgTestsTab.tsx:192`) jest phantomem semantycznym | AB-1b |
| 3 | **WiPWC** | „Warunki i Procedury Wykorzystania Certyfikatów" (PTPiREE; dokładny tytuł, numeracja wersji 1.2/1.3 z repo i relacja do „Wykazu urządzeń" — OD-21). **Istnieje w kodzie** (wersja dokumentu + rejestr **6887 realnych rekordów** — korekta wcześniejszej klasyfikacji K-H „dane śladowe"); nie istnieje REGUŁA. Cel: reguła w `application/ncrfg_compliance/` obok `certificate_status_z_tabliczki` (`model_bridge.py:161`): `status_certyfikatu(tabliczka, data_oceny, moc, wersja_oprogramowania) → {WAZNY_W_ZAKRESIE, POZA_ZAKRESEM, WYGASLY, NIEOKRESLONY}` → mapowane na istniejące `certificate_status` solvera (`ptpiree_verified/expired/unknown`; `expired` ma dziś zero dostawców). Warunek wstępny: `acceptance_date` w 6697 z 6887 rekordów to data PRZYSZŁA (najpewniej data ważności — dokumenty formalne podpisują ją mylnie „Data akceptacji"), 632 rekordy z uszkodzonym `firmware`, 6 dat niekalendarzowych → oczyszczenie danych z jawnym błędem, nie cicha akceptacja. Fikcyjna proweniencja „PTPiREE WiPWC" w katalogach rozdzielnic, kabli i transformatora — do usunięcia (`AcceptedEvidenceMethod = CERTIFICATE` wyłącznie z rejestru) | AB-1b |
| 4 | **Bank Nastaw** | **Opus 5.5 nie zna dokumentu PTPiREE o tytule „Bank Nastaw"** — istnienie, wydawca, zakres → **OD-40** (właściciel). Zasada architektoniczna pozostaje: nastawy WYMAGANE zabezpieczenia interfejsowego (27/59/81U/81O/81R/78, próg, opóźnienie, okno pomiaru, miejsce pomiaru, źródło) = sekcja profilu `nastawy_wymagane[]`; nastawy RZECZYWISTE = model (OD-34); klasa dokumentów źródłowych: IRiESD danego OSD i jego standardy techniczne, PN-EN 50549-1/-2 (zakres — pewne; polskie wartości — OD). Konsument: `ochrona_lom.py` zastępuje stałe (`:65-70`: progi zaszyte, podstawa „IEEE 1547 / NC RfG Art. 14" błędna, BESS wyłączony z wymogu, ROCOF 2 Hz/s bez dokumentu i okna) odczytem profilu z fail-closed INFO; **warunek wstępny:** `ProtectionSetting.function_type` nie ma 27/59 (`enm/models.py:104-118`) → dopisać addytywnie | AB-1b |
| 5 | **PPM vs SyPGM** | Definicja 2016/631: moduł parku energii = przyłączony niesynchronicznie lub przez energoelektronikę; SPGM = synchronicznie. **Bez nowego pola zapisywanego** (byłoby drugą prawdą — reguła „predykaty parami"): funkcja `rodzaj_modulu_nc_rfg(generator) → Literal["PPM","SyPGM","POZA_ZAKRESEM_RFG"]` wyprowadzona z `Generator.gen_type` (`synchronous → SyPGM`; `pv_inverter, wind_inverter, fw_pmsg, fw_dfig, fw_scig → PPM`; `bess → POZA_ZAKRESEM_RFG`) obok `GEN_TYPES_PRZEKSZTALTNIKOWE` (`enm/models.py:562`), z regułą walidatora: sprzeczność `gen_type` vs `dynamika.rodzina` = blocker. Wpięcie: `model_bridge.py:211` (koniec `"PPM"` na sztywno), `:266-267` (SyPGM wchodzi do biegu; BESS pominięty z nazwanym powodem), przy okazji `p_max_kw ← GenLimits.p_max_mw` (nie punkt pracy `p_mw`) i napięcie z miejsca przyłączenia (nie z szyny generatora); jedna prawda wyboru operatora (profil na generatorze vs parametr trasy). Kontrakt FROZEN ma już `module_family` — zero zmian FROZEN | AB-1b |
| 6 | **AcceptedEvidenceMethods** | Zbiór `{SIMULATION_VALIDATED_MODEL, TYPE_TEST, COMMISSIONING_TEST, CERTIFICATE, DECLARATION}` spójny z tytułem IV 2016/631; który zbiór akceptowany per wymaganie w PL — wyłącznie z WOS/WiPWC/Procedury (OD-21). **Nie nowa oś obok `EvidenceTier`**, lecz funkcja: metoda faktycznie dostarczona wyprowadzona z `EvidenceTier` + `ClaimKind` + status certyfikatu (`VALIDATED_SIMULATION → SIMULATION_VALIDATED_MODEL`, `DECLARATION → DECLARATION`, reguła §6.3 → `CERTIFICATE`, `ui2/wyniki/odbior` → `COMMISSIONING_TEST`) ∈ metody akceptowane przez profil → inaczej `REQUIREMENT_UNVERIFIED`. Zamyka trzy dzisiejsze błędy: T10 tautologia (`p_max_kw > 0` przy kontrakcie `gt=0` — zawsze przechodzi, dziś raportowalny), T20 raportowalny jako „fakt konfiguracyjny", moduł z zerem wymaganych testów = „zgodny" i `reportable` (pusta koniunkcja `engine.py:246-251` — reinterpretacja w warstwie aplikacji) | AB-1b |
| 7 | **Internal test IDs** | Identyfikatory wewnętrzne (E2E-R*, E2E-H*, E2E-SH*, E2E-MP*, bramki G*, mutacje M*) żyją tam, gdzie żyją bramki (manifest `tests/walidacja_fizyczna/**`); mapowanie test PTPiREE → zdolność żyje w `solver_input/dowod_ncrfg.py::TEST_ZDOLNOSC` (nie w `provenance.py` — korekta) i dostaje `wymaganie_ref`; relacja do zdolności w `provenance.py` jako `CapabilityEvidence.audit_ref`. Guard: `T\d\d` poza `TEST_CATALOG`/`TEST_ZDOLNOSC` = błąd; `T\d{1,2}` bez zera wiodącego poza plikami profili = błąd (OD-26). Identyfikatory wewnętrzne nie idą do UI | AB-1b |
| 8 | **ModelValidationStatus** | Na modelu urządzenia **dwie** osie (korekta: trzecia nie jest cechą modelu): `rownania_zwalidowane` (klasa urządzenia wobec wyroczni) i `parametry_urzadzenia_zwalidowane` (egzemplarz/typ wobec pomiaru lub certyfikatu; wartości sekcji katalogu W-68 `VALIDATED/UNVALIDATED/MEASURED/CERTIFIED/UNKNOWN/OUTSIDE_DOMAIN`); `dowod_zaakceptowany` zależy od wymagania i profilu → należy do `ComplianceResult` (§6.6). Wpięcie: `enm/dynamika_modele.py::ProweniencjaParametrow` (parametry), rejestr zdolności (równania), `catalog/types.py` (pole sekcji). Predykat parami: `EvidenceTier.VALIDATED_SIMULATION` niemożliwy, gdy `parametry_urzadzenia_zwalidowane ∉ {MEASURED, CERTIFIED}`; nowa rodzina bez statusu → `UNKNOWN`. `stability_rms`/`frt_hvrt` FROZEN — status liczony w adapterze | AB-1a |
| 9 | **ComplianceStimulus ≠ PhysicalNetworkDisturbance** | Bodziec na zaciskach (zadany U(t) / rampa f / skok f) to **inny warunek brzegowy** niż zdarzenie w sieci: sieć zastąpiona źródłem o przebiegu zadanym, nie zmodyfikowana topologicznie. **Osobny kontrakt `BadanieZgodnosci{urzadzenie_ref, bodziec: ProfilNapieciaZaciskow \| RampaCzestotliwosci \| SkokCzestotliwosci, impedancja_zastepcza_sieci (jawna, z proweniencją, zakaz domyślnej), horyzont_s, krok_wyjscia_s}` obok `ScenariuszDynamiczny`** — nie nowy rodzaj w unii `ZdarzenieDynamiczne` (zdarzenia sieciowe są walidowane referencjami do elementów; unia pozwoliłaby złożyć „zwarcie + zadany U(t)" bez sensu fizycznego; rozłączność typem pewniejsza niż flagą); oba jako warianty `rodzaj_badania` biegu `dynamika_rms`; `ScenariuszDynamiczny.tresc()` (hash) bez zmian. Rdzeń: „szyna o zadanym przebiegu" wymaga zmiany `silnik.py` (pod bramkami R10) → AB-3R karta pierwsza; AB-1a daje kontrakt z nazwaną odmową `bodziec.rdzen_nieobslugiwany`. Macierz NC RfG konsumuje wyłącznie wyniki rodzaju „badanie zgodności" | AB-1a (kontrakt), AB-3R (rdzeń) |
| 10 | **AB-1d_min przed AB-1c** | Rejestr domen i rodzajów biegów musi istnieć **zanim** łańcuch zgodności (AB-1c) powstanie — inaczej powstałby wyłącznie dla RMS. **Kolizja z istniejącym stanem:** `solver_capability_registry.py:218-230` rejestruje `POWER_QUALITY_HARMONICS` (`available`, `reportable=True`, `proof_support=True`) → AB-1d_min w tym samym kroku przeklasyfikowuje: `reportable=False`, tier `UNVALIDATED_MODEL`, `superseded_by="harmoniczne"` (rejestr w `application/`, nie FROZEN) — inaczej dwie prawdy o harmonicznych i gotowość `ready`. Trzy listy typów biegów (`domain/analysis_run.py:10`, `ExecutionAnalysisType`, `canonical_analysis`) → wskazać jedną. `PhysicsDomain` wyprowadzany z `analysis_type` przez rejestr, nie jako pole kontraktu FROZEN wyniku (pole addytywne w kopercie API dopuszczalne) | §7 |
| 11 | **Explainable Verdict Contract** | `WynikInzynierski` = **rozszerzenie istniejącego kształtu** `OcenaElementu` + `PozycjaOceny` (`ui2/wyniki/ocena/api.ts`, producent `application/analyses/werdykt_projektowy.py`; łańcuch ekranu podstawa → wynik → odniesienie → ocena → wniosek → dowód), który pokrywa 8 z 16 pól w pełni i 4 częściowo — nie trzeci kontrakt. Pola NOWE: `physics_domain` (z `analysis_type`), `basis{dokument, wersja, klauzula, zrodlo_status}` (dziś `norma_pl` tekst), `critical_point` ze współrzędną czasu/częstotliwości, `cause` strukturalne (element/regulator/ogranicznik), `model_status` (§6.8), `input_status` (z proweniencji do wyniku), `uncertainty`, `domain_of_validity` (rdzeń egzekwuje `waznosc.py`, nie raportuje); `evidence` — ujednolicić dwa kształty. `SPELNIA/NIE_SPELNIA/BRAK_PODSTAW` pozostaje dozwolonym polem **wewnątrz** obiektu z pełnymi towarzyszami. Wyniki FROZEN (NC RfG, v126) dostają adapter w warstwie API. **Guard `scripts/explainable_verdict_guard.py` (AST, `backend/src/{api,application,analysis,solver_input}/**`):** nośnik werdyktu = klasa z polem `Literal` zawierającym token werdyktu albo literał słownika z kluczem `{verdict, werdykt, wynik, status, overall_status, compatibility_status}` i wartością-tokenem; zgłaszany, gdy brakuje ≥ 1 z pięciu grup towarzyszy {wartość, wymaganie, margines, podstawa, dowód} w nośniku lub klasie nadrzędnej; nie zgłasza definicji typów, map etykiet, porównań, `tests/**`, `docs/**`; zamknięta lista wyjątków FROZEN (`NcRfgPtpireeTestResult`, `NcRfgPtpireeModuleResult`, `bus_results` v126) każda z przypiętym adapterem; `ochrona_lom.Verdict` NIE jest FROZEN → przebudowa; front: reguła na `ui2/**/api.ts` + import-graph guard etykiet werdyktu; testy mutacyjne guardu (7 przypadków, evidence §3.3) | AB-1a |

---

## 7. KAMIENIE PROGRAMU — kolejność wykonawcza i graf zależności (§4, §93 mandatu)

Sekwencja bazowa: **AB-1a → AB-1b → AB-1d_min → AB-1c → AB-2 → AB-3 → AB-4 → AB-5 → AB-6 → AB-7.**
Tor R (RMS) i tor H (harmoniczne/supraharmoniczne) biegną w kamieniach AB-2…AB-7 **równolegle** (delegacja
równoległa do Opus 5.5 na osobnych worktree, commit bez push, integracja przez Fable).

| Kamień | Zakres | Domyka (zamrożenie / rejestr) | Zależy od | Dowód wyjścia |
|---|---|---|---|---|
| **AB-1a** Fundament wyników i wyjaśnialności | `PhysicsDomain` (W-07) wyprowadzany z `analysis_type` przez jeden rejestr zdolności (nie pole kontraktu FROZEN; addytywnie w kopercie API), `WynikInzynierski` jako rozszerzenie `OcenaElementu`/`PozycjaOceny` z adapterami dla wyników FROZEN (§6.11), dwie osie `ModelValidationStatus` (§6.8), kontrakt `BadanieZgodnosci` obok `ScenariuszDynamiczny` z odmową `bodziec.rdzen_nieobslugiwany` (§6.9), kontrakt parametru `VALUE/UNIT/SOURCE/VERSION/STATUS/DOMAIN` (W-98), kody fail-closed (W-99), guard werdyktu (§6.11) z listą wyjątków FROZEN i przebudową `ochrona_lom.Verdict`; **poprawki rejestru dowodowego:** T10 tautologia → nie `reportable`, opis T20 w `provenance.py:318-326` (limit NIE z profilu), moduł z zerem wymaganych testów ≠ „zgodny" | H3 (rozszerzenie), NOWE | R10 | testy kontraktów; OpenAPI snapshot; guard w CI z 7 mutacjami; pin: hash istniejących scenariuszy bez zmian; odciski `ResultSetDynamicV1` bez zmian |
| **AB-1b** Profil regulacyjny | Jeden loader, dwa rodzaje profili (operatora / WOS krajowy) z metadanymi źródła (§6.1), `classify_module` z jednego źródła PL (OD-41), profil Stoen Operator (struktura, `UNVERIFIED_SOURCE`), BESS `POZA_ZAKRESEM_RFG`, `rodzaj_modulu_nc_rfg` + naprawa mostu (§6.5), reguła WiPWC + oczyszczenie rejestru (§6.3), `nastawy_wymagane[]` + 27/59 w ENM + `ochrona_lom` z profilu (§6.4, OD-40), AcceptedEvidenceMethods jako funkcja (§6.6), `wymaganie_ref` w `TEST_ZDOLNOSC` (§6.7), sloty power-quality/harmonic/supraharmonic/measurement (W-69) puste-fail-closed do OD-21/OD-38 (W-70); usunięcie fikcyjnej proweniencji „PTPiREE WiPWC" z katalogów aparatów/kabli/TR; etykieta `acceptance_date` → data ważności po potwierdzeniu (OD-21) | NOWE | AB-1a; **twarda zależność OD-21/OD-38 dla LICZB** — bez dokumentów resolver dostarcza strukturę + `UNVERIFIED_SOURCE` | resolver zwraca wymagania z `clause_ref` i wersją; brak źródła = `UNVERIFIED_SOURCE`, nie liczba; pin w obie strony: każdy profil ma `source_document` albo `UNVERIFIED_SOURCE`; `classify_module(0,5 kW)` → poza zakresem; klasyfikacja nie zależy od punktu pracy |
| **AB-1d_min** Rejestr domen i biegów | rodzaje biegów `harmoniczne`, `skan_czestotliwosciowy`, `supraharmoniczne` w rejestrze biegów kanonicznych (`ExecutionAnalysisType`, `v125_contracts`, `canonical_analysis`, gotowość, `solver_capability_registry`) z nazwaną odmową `domena.solver_nieobecny` do czasu AB-2H; `OsCzestotliwosci` z `f ∈ ℝ⁺` w Hz (H-41; rząd h = atrybut pochodny, nie klucz) i `SupraharmonicBand` (S-54) jako kontrakty bez wartości domyślnych; niezmiennik katalogu „rząd 2..50" zawężony do rodzaju `CURRENT_SPECTRUM_INTEGER_ORDER` (audyt #28); **wycofanie z powierzchni użytkownika** zdolności `POWER_QUALITY_HARMONICS` (`solver_capability_registry.py:219-231` `implemented` → nazwana odmowa z odesłaniem do audytu F1–F8) — to zmiana warstwy aplikacji, nie rdzenia FROZEN (kasacja kodu `v126_academic._power_quality` = OD-15(d)); usunięcie kontrolki „THD napięcia" modułu z macierzy NC RfG (phantom, audyt #24) | NOWE | AB-1a | bieg każdego rodzaju kończy się wynikiem albo nazwaną odmową; gotowość nie melduje `ready` bez solvera (A-7); ekran „Analizy specjalistyczne" nie oferuje harmonicznych z fałszywymi liczbami |
| **AB-1c** Łańcuch zgodności | EngineeringResult → RegulatoryProfile → Applicability → AcceptedEvidenceMethod → ComplianceResult (W-06) jako konsument **dowolnej** domeny; macierz NC RfG i certyfikat czytają `WynikInzynierski`; **T20 przestaje oceniać limitem 8 %** (THD_U sieci ≠ emisja urządzenia; do OD-38 T20 = `REQUIREMENT_UNVERIFIED`); usunięcie kontrolki „THD napięcia" modułu; bezpiecznik A-6 zachowany do OD-20 | — (przygotowanie W6-5) | AB-1b, AB-1d_min | test z RMS (`BadanieZgodnosci`) i z harmonicznych przechodzi tym samym łańcuchem; certyfikat cytuje wersję profilu; T10/T14/T15/T20 nie są `reportable` bez metody akceptowanej |
| **AB-2 R** Zakłócenia i FRT | **Karta pierwsza (warunki poprawności, z przeglądu Opus B-1…B-13):** ZIP + konwersja stałej mocy na impedancję przy niskim napięciu (B-11, przed E2E-R1 — inaczej G8 odmawia), predykat wyspy bez źródła FORMUJĄCEGO (B-3), gałąź obecna w modelu biegu jako nieaktywna w t=0 → zamknięcie NOP/sprzęgła/łącznika/baterii (B-2), odcinek beznapięciowy jako jawny stan `U=0` z wyłączeniem odbiorów z algebry i odmową kryteriów f na odcinku (B-1), ekwiwalent sieci nadrzędnej z bezwładnością i regulacją pierwotną (B-4, przed E2E-R7), fazor prądu gałęzi (B-12), zwarcie na gałęzi w % długości bez elementu ENM + predykat izolacji (B-10), rozszerzenie `ZdarzenieWykonane` o `trigger/cause/device/state_before/state_after` addytywnie (B-8), pomiar ΔU/Δf/Δθ przy każdym `zalaczenie_galezi` łączącym dwie zasilone wyspy (B-15 pomiar; kryterium w AB-5), kanały `f_pll_hz@`, `f_wirnika_hz@`, `rocof_chwilowy` szyny/PLL/wirnika (D-29, D-30), minimalny konsument UI `ResultSetDynamicV1` z osią zdarzeń wykonanych (B-13). **Karta druga:** D-10 (izolacja), D-11 (5 kryteriów trajektoriowych; `stay_connected` jako kryterium trajektorii wobec JEDNEJ obwiedni E2 z jawnym `NOT_SIMULATED` dla decyzji urządzenia — pełna wersja z zabezpieczeniami własnymi modułu w AB-5), D-12 (dopisać do kontraktu GFL: `t_aktywacji_iq_s`, `t_podtrzymania_iq_s`, `i_q_max_pu`, `k_id_frt` — bez domyślnych), D-13 (8 metryk odbudowy + kanały aktywności ogranicznika tempa, ogranicznika prądu i okna mocy), D-17 (utrata pełna/jednoczesna/częściowa — częściowa przez wykonanie `komenda_regulacji`), D-18 (P/Q_SETPOINT przez `komenda_regulacji`; GENERATION_STEP), D-19, D-31 (f-sensitive), D-32; W6-B (D7, D11 jako zdarzenie nazwane, D13), W6-D dla E1, E2 (po OD-33), E6. **Wyrocznia GFL** (analityczna: odpowiedź `I_q` na skok U przy nieaktywnym PLL = inercja 1. rzędu `Tiq`) + mutacje limiter/Iq gain/recovery/topology-reinit (B-14, B-15) | D7, D11 (nazwane), D13, E1, E2, E6, B3 (chwilowy), C2 (obserwable wsparcia) | AB-1a | E2E-R1, E2E-R7, SO-1A wariant promieniowy; metryki liczone w rdzeniu; bramki R10 zielone; nowe bramki: `|I| ≤ I_max` na przebiegu ze zwarciem, gradient odbudowy ≤ nastawa, G9 z mutacją pominięcia reinicjalizacji |
| **AB-2 H** Rdzeń harmoniczny | Nowy pakiet `network_model/solvers/harmoniczne/` wg architektury z audytu (§9 dokumentu evidence): `os_czestotliwosci.py`, `kontrakty.py` (WezelH, GalazH `PI_SKUPIONE\|LINIA_DLUGA` z R(f),L(f),C(f),G(f) i `domena_waznosci_hz`, TransformatorH z przekładnią zespoloną z grupy i drogą składowej zerowej, KondensatorH, DlawikH, FiltrH `STROJONY\|GORNOPRZEPUSTOWY\|TLUMIONY_C`, ZrodloH sześciu rodzajów H-48, TloH, MetodaAgregacji `FAZOROWA\|STATYSTYCZNA\|OBWIEDNIA`), `elementy.py` (poza domeną → `OUTSIDE_DOMAIN`, nie ekstrapolacja), `ybus_f.py` (pu na bazie assemblera; sekwencje h≡1/2/0 mod 3 z przekładnią fazową per sekwencja), `rozwiazanie.py` (LU per f, zero `pinv`, osobliwość = odmowa `harmoniczne.siec_plywajaca`, superpozycja tło + instalacja, wkłady `V_i = Σ_j Z_ij I_j`), `skan.py` (Z_ii, Z_ij, ekstrema z zagęszczaniem), `metryki.py`, `slad.py` (W-75, W-76), `wynik.py` (`resultset_harmonic_v1`, `resultset_frequency_scan_v1` z `physics_domain`). Topologia WYŁĄCZNIE przez nową `enm/assembler.py::zloz_wejscie_harmoniczne` (te same wyspy, łączniki, częstotliwość studium co PF/SC; bateria → C z `_build_shunt_specs_from_snapshot`); punkt pracy U_1/P/Q z biegu PF (`run_id`). ENM/katalog addytywnie: dławik, dławik odstrajający baterii, filtr, tło U_bg(f) z proweniencją pomiaru, sekcja `harmonic` kabla/TR/przekształtnika z `validation_status` (ADAPT #27, #30–#38). Wyrocznie W-A1…W-A5, W-M1 (własna Y bez importów z pakietu — guard AST), W-M2 (`scipy.signal.freqs`), niezmienniki (wzajemność, pasywność, Foster, Tellegen, niezależność od kolejności węzłów, skalowanie Hz↔kHz), benchmark literaturowy IEEE 14-bus harmonics / CIGRE. Mutacje H-M1…H-M9 zabijane testami fizyki (dziś: żadna). UI: `ui2/wyniki/harmoniczne`, `ui2/wyniki/skan`, sekcja w `ui2/wyniki/jakosc`; nakładka SLD po `element_ref` (W-86); karta analizy zastępuje „Jakość energii i harmoniczne" V12.6 (REWRITE #18, #47) | NOWE (W6-7 harmoniczne) | AB-1d_min | E2E-H1, E2E-H2, E2E-H3, E2E-H4, E2E-H5, E2E-H6 |
| **AB-3 R** Regulatory | **Karta pierwsza:** źródło programowalne `U(t)`, `f(t)` na zaciskach jako fizyczna realizacja `bodziec_zgodnosci` (§6.9, B-4) — bez niego LFSM-O w pracy równoległej jest niewykonalny (szyna sztywna trzyma 50 Hz, `szyna_sztywna.py:15-18`); pole `u_pu` w `Nastawa` (M-09). **Potem:** D-14 (LFSM-O: próg 50,2 Hz odrębny od strefy martwej, asymetria O/U, opóźnienie wg NC RfG art. 13 ust. 2, ogranicznik szybkości, filtr pomiaru f, powrót z rampą, metryki ΔP/Δf, czas martwy, czas narastania), D-15 (cosφ(P) — dziś BRAK; U=Uzad dla przekształtnika; rate limits dQ/dt, dP/dt; punkt pomiaru zaciski vs miejsce przyłączenia; tryb regulacji jako pole kontraktu), D-33 (GFM: częstotliwość wewnętrzna w trybie `droop`, kanał aktywności ograniczenia prądu, kryterium utraty synchronizmu GFM w ograniczeniu), W6-D E3, E7. **Wyrocznia GFM** (wyspa GFM + odbiór R: `f_ust = f_n(1 − m_p(P_R − P_zad))`, `U_ust` z `m_q` — rozwiązanie zamknięte; E-2 dało 50,5 Hz do porównania) | E3, E7 | AB-2 R | E2E-R2, E2E-R3 |
| **AB-3 H** Punkt pracy → model emisji | S-56, S-65 (snapshot punktu pracy z trajektorii RMS → wybór modelu widmowego) | NOWE | AB-2 H, AB-3 R | snapshot z biegu RMS zasila bieg harmoniczny bez ręcznego przepisywania liczb |
| **AB-4 R** BESS | **Karta pierwsza — KLASA ZDARZEŃ WARUNKOWYCH w silniku** (B-6: lokalizacja chwili przekroczenia progu z dokładnością zdarzenia planowanego, zdarzenia równoczesne, ochrona przed chatteringiem, hierarchia priorytetów; pierwszy konsument: okno SOC / odcięcie mocy przez BMS zamiast odmowy — zamrożenie §9; korekta zależności: plan pierwotny umieszczał mechanizm dopiero w AB-5, a AB-4 go wymaga). **Potem:** D-16 pełny: kanał `E(t)` [kWh], kanał prądu (także GFM), jawny stan trybu charge/discharge/idle, straty przekształtnika, `Q(U)` magazynu bez luk M-06; **wyrocznia `P-f` magazynu** (rozwiązanie zamknięte statyzmu), bramka G6 (dwie bazy → tożsamość `P(t)`) dla magazynu i GFM, mutacja znaku `dSOC/dt` z niezmiennikiem bilansu energii jako bramką | C4, E7 | AB-3 R | E2E-R4 |
| **AB-4 H** Supraharmoniczne | S-55, S-57, S-58, S-67, W-77, W-82; BESS `E(f,P,Q,U,SOC,mode)`; sekcje katalogu `harmonic/supraharmonic` (W-68) | NOWE | AB-2 H, AB-4 R | E2E-SH1, E2E-SH2, E2E-SH3, E2E-SH4, E2E-MP2 |
| **AB-5 R** Zabezpieczenia, automatyka, wyspy, stabilność | Przekaźniki na klasie zdarzeń warunkowych z AB-4 (D-22: stan dyskretny w wektorze hybrydowym, akumulator `∫dt/t(I)` z resetem wg IEC 60255-151, odpad `k_odp`, zatrzask, czas własny wyłącznika, pu→A przez CT; **pola ENM przed AB-5 — zależność W4**: czas własny wyłącznika, charakterystyka powrotu, współczynnik odpadu, przekładnia CT — dziś `ProtectionSetting` ma tylko `threshold_a/time_delay_s/curve_type/time_multiplier`, `enm/models.py:101-126`); D-21 SO-1B; `rocof_pomiarowy` (B-7) i 81R; zabezpieczenia własne modułu wytwórczego 27/59/81U/81O/81R w urządzeniu (B-5) → pełne `stay_connected`; ponowne przyłączenie źródła po odłączeniu z resetem regulatorów i rampą P (B-9) razem z `synchronizacja`; D-23 automatyka (SPZ wymaga B-1, SZR wymaga B-2); D-24 warunek brzegowy wyspy GFM/BESS; D-25 kryterium synchronizacji na pomiarze z AB-2 (E-3: dziś zamknięcie przy 175° przechodzi bez ostrzeżenia); D-26 kryterium Φ + COI + tłumienie/okres z przebiegu; D-27 kontrakt small-signal na ISTNIEJĄCYM `walidacja/malosygnalowa.py` (pełne widmo już liczone, zero konsumentów) z warunkiem ważności (ograniczniki nieaktywne, `granice_stanow` nienasycone); D-28 CCT produktowe (Φ, bracket, test monotoniczności na siatce, tolerancja, protokół, `M_CCT`); D-31 silnik indukcyjny (OD-37, wyrocznia Kloss); **wyrocznia maszyny 6. rzędu z AVR/GOV** (ANDES GENROU/EXST1/TGOV1 albo analityczna odpowiedź skokowa AVR); wyrocznia sekwencji zadziałań (`Σ Δt_k/t(I_k) = 1` dla `I(t)` odcinkami stałego); wyrocznia prądu udarowego zamknięcia `|ΔU|/|Z_pętli|`; mutacja akumulatora bez resetu i akumulatora „t(I) w każdym kroku" (wzorzec zakazany D-22). W6-C (D3, D14, D15), W6-B (D11, D12), W6-D E4, W6-E (E5, F1); nastawy z modelu (OD-34), Bank Nastaw jako wymaganie | D3, D11, D12, D14, D15, E4, E5, F1, C6 | AB-4 R, W4 (nastawy w modelu) | E2E-R5 (regresja), E2E-R6, E2E-R8, E2E-R9; SO-1B |
| **AB-5 H** Przyczynowość i filtry | H-45, H-47, H-51, S-59 (po W5) | NOWE | AB-2 H, AB-4 H | E2E-H7, E2E-SH5, E2E-SH6, E2E-MP3 |
| **AB-6** Warianty, przemiatania, worst case, porównania | D-34, D-35, H-52, W-83, W-84; W6-G (F2, F3), W6-H (G1, G2), W6-I (I1–I4) | F2, F3, G1, G2, I1–I4 | AB-5 R, AB-5 H | E2E-R10, E2E-MP1 |
| **AB-7** Walidacja pomiarowa | S-60, S-61, S-62, S-63, S-64 (ostatnie), W-78, W-97; rozszerzenie aparatu W6-F o benchmarki pomiarowe RMS + widmo | H4 (rozszerzenie) | AB-6 | E2E-H8, E2E-SH7 |
| Niezależne | W6-J (turbiny typ 1/2), W6-K (zwarcia niesymetryczne w czasie, po W5) | A2, C5, D2 | — | wg zamrożenia |

Graf zależności (krawędzie): AB-1a → {AB-1b, AB-1d_min, AB-2R} · AB-1b → AB-1c · AB-1d_min → {AB-1c, AB-2H} ·
AB-2R → AB-3R → AB-4R → AB-5R → AB-6 · AB-2H → {AB-3H, AB-4H, AB-5H} · AB-3R → AB-3H · AB-4R → AB-4H ·
AB-4H → AB-5H · {AB-5R, AB-5H} → AB-6 → AB-7 · W4 → AB-5R · W5 → {AB-5H (S-59), W6-K} · OD-20 → W6-5 (po AB-1c) ·
OD-21/OD-38 → AB-1b (wartości limitów).

---

## 8. AUDYT ISTNIEJĄCEGO KODU HARMONICZNEGO / JAKOŚCI ENERGII (§91–§92) — ADOPT / ADAPT / REWRITE / KEEP_RESEARCH_ONLY / REJECT

Pełna tabela 52 elementów z kolumnami VERIFY → REPRODUCE → FALSIFY → DECIDE, eksperymenty F1–F9 na solverze
FROZEN i mutacje próbne M1–M5: `docs/evidence/OPUS_AUDYT_HARMONICZNE_SUPRAHARMONICZNE_2026-09-23.md` §0–§1.
260 istniejących testów harmoniczno-SSCI-flickerowych: zielone (kod 0) — i **nic nie dowodzą o fizyce**.

| Decyzja | Elementy (numeracja tabeli audytu) | Skutek dla programu |
|---|---|---|
| **ADOPT** | #29 pola karty przekształtnika (ESTIMATED, cytowane) · #33 `ShuntCapacitor` w ENM · #34 tożsamości B=Q/U², I_c · #36 grupa połączeń i uziemienia TR · #39 topologia assemblera (`zbuduj_graf`, `_wyspy_zasilone`, `wezly_bez_impedancji_do_odniesienia`, `_droga_zerowa`) · #41 VUF z rozpływu niesymetrycznego · #43 wzorzec cytowania limitu (`kryteria_napiecia.py`) · #44 kod gotowości `generator.harmonic_spectrum_missing` · #45 walidator W009 · #46 kanały `ResultSetDynamicV1` jako źródło migawki · #52 eksport CGMES baterii | wchodzą do AB-2H/AB-3H bez zmiany liczb |
| **ADAPT** | #8 siatka SSCI → `OsCzestotliwosci` · #15 rozstrzyganie proweniencji widma (ręczne > karta > brak) · #19 warunki gotowości · #20 rejestr zdolności (status → odmowa) · #25 tekst `provenance.py:322` (limit T20 nie jest z profilu) · #27 `harmonic_spectrum_percent` jako `CURRENT_SPECTRUM` klasy „deklaracja producenta" · #28 niezmiennik rzędu 2..50 zawężony · #30 katalog kabli (sekcja `harmonic`: R(f)/L(f)/tan δ) · #31 katalog TR (R_k(f), pojemności) · #32 katalog baterii (C, dławik odstrajający, połączenie) · #35 linie/kable ENM (`harmonic_model_ref`) · #37 `Source` (tło jako osobny byt) · #38 `Load` (R‖L, CIGRE C-type) · #40 wzorzec pu+przekładnia z `core/ybus.py` (wzorzec, nie import) · #42 flicker (c(ψ_k) z karty, S_k z właściwego scenariusza, limity do profilu — W6-7) · #48 ekran „Jakość" · #50 wpis kanonu E-40 · #51 tekst kreatora kompensatora | rozszerzenia addytywne w AB-1b/AB-1d_min/AB-2H |
| **REWRITE** | #1 `_ybus` · #2 `_grid_source_shunt_admittance` · #3 `_driving_point_impedance` · #5 `_power_quality` · #13 `V126HarmonicSourceInput` · #18 karta katalogu analiz · #47 prezentacja akademicka | nowy pakiet `solvers/harmoniczne/` (AB-2H); stare zostaje jako historyczne pod FROZEN do OD-15(d), wycofane z powierzchni w AB-1d_min |
| **KEEP_RESEARCH_ONLY** | #9 `_z_conv_components` (kandydat `FREQUENCY_DEPENDENT_EQUIVALENT` po wyroczni publikacyjnej) · #10 `_ssci_impedance` · #21 rejestr SSCI · #22 werdykt Nyquista SSCI · #49 ekran SSCI | AB-5H po poprawnym Z_grid(f) z AB-2H |
| **REJECT** | #4 cichy `pinv` · #6 limity 8/5/5 % zaszyte · #7 stałe `unbalance=0.0`, `zgodny` · #11 2. harmoniczna udaru (poza H; W6-8) · #12 `_source_impedance` 0,15/0,99 · #14 most `build_v126_input_from_enm` jako wejście H · #16 override `parameters.harmonic_sources` (obejście Catalog Binding) · #17 `harmonic-limits` jako źródło limitów · #23 T20 jako dowód · #24 kontrolka „THD napięcia" modułu · #26 T18 „Test harmonicznych" w YAML (OD-26) | nie wchodzą do programu; #24 usuwane w AB-1d_min, #6/#17 zastąpione profilem fail-closed w AB-1b |

Nie znaleziono w repo (0 trafień): `supraharmonic`, `interharmonic`, skan jako rodzaj biegu, FFT/STFT, dławik/filtr
jako element ENM, `SupraharmonicBand`, tło harmoniczne, import widma z pomiaru, IEC 61000-3-6 (sumowanie α),
IEC 61000-4-7 jako metoda grupowania.

Trzy falsyfikowalne tezy o zawyżeniu w dokumentach (audyt §10): `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md:239`
(„CZĘŚCIOWE" → faktycznie REWRITE), `SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md:475` („widma z proweniencją" — 0 rekordów
z widmem; moc zwarciowa nie wchodzi do ścieżki), `MAPA:89` + `SYNTEZA:106-107` + `INWENTARZ_FUNKCJI_2026-07.md:36`
(harmoniczne jako zdolność z luką „położenie w UI" — to luka fizyki). Korekty tych dokumentów: §12.

## 9. MACIERZE LUK (§103) — DYNAMICS · HARMONIC · SUPRAHARMONIC · MULTI-PHYSICS · REGULATORY · MODEL · ORACLE · MEASUREMENT · CI/MUTATION

### 9.1 DYNAMICS GAP MATRIX — delta grafu zależności (pełna macierz 27 + 25 wierszy z dowodami `plik:linia`: `docs/evidence/OPUS_PRZEGLAD_LUK_DYNAMIKI_2026-09-23.md` §1; trzy eksperymenty E-1…E-3 odtwarzalne wg §8 tamtego dokumentu)

| Istniejący workstream | Nowa zdolność / korekta | Dlaczego potrzebna | Dependency | Current state | Target | Evidence odbioru |
|---|---|---|---|---|---|---|
| W6-A / AB-2 R | `rocof_chwilowy` szyny, PLL, wirnika jako kanały | mandat D-30; LOM, E3; plan zawyżał („wykonane w części") | B2 (jest) | **GAP** — zero kanałów ROCOF (`silnik.py:627-685`) | kanały z udokumentowaną metodą różniczkowania i obsługą nieciągłości | bramka: ROCOF z biegu SMIB = `(P_m−P_e)/2H` z wyroczni (dziś G3 liczy to w teście) |
| W6-A / AB-2 R | `f_pll_hz@`, `f_wirnika_hz@` | D-29 rozdział trzech częstotliwości | — | PLL = tylko stan całki; wirnik w pu | kanały Hz | test: trzy kanały rozłączne na zdarzeniu f |
| W6-A / AB-2 R | fazor prądu gałęzi (Re/Im) | 67/67N, atrybucja przepływu | B4 | tylko `abs()` (`silnik.py:757-758`) | kanał addytywny | parytet z IEC 60909 w chwili zwarcia (zamrożenie B4) |
| W6-B / AB-2 R | odcinek beznapięciowy (wyspa martwa z odbiorem) | SPZ promieniowy, RECLOSE, SO-1A wariant promieniowy | wyspy.py | odmowa G13 / `algebra_niezbiezna`; G17 musiał być pierścieniem | jawny stan `U=0`, odbiory poza algebrą, kryteria f niedostępne na odcinku | E2E: SPZ na linii promieniowej z odbiorem |
| W6-B / AB-2 R | zamknięcie elementu normalnie otwartego (NOP, sprzęgło, łącznik, bateria) | COUPLER_CLOSE, SZR, łączenie baterii | adapter | elementy `in_service=False`/`state≠CLOSED` pomijane (`adapter_dynamiki.py:759/785/817/849`) → `zdarzenie_bez_elementu` | „istnieje w modelu" ≠ „aktywna w t=0" | E2E: SZR / zamknięcie sprzęgła |
| W6-B / AB-2 R | odmowa wyspy zasilanej wyłącznie przez GFL (brak źródła formującego) | fizyka: GFL nie formuje U/f | wyspy.py | `krok_niezbiezny` po 0–208 ms fikcji (E-1) | odmowa nazwana przed Newtonem + kanał składu wysp | bramka G14 + mutacja „wyłącz predykat formującego" |
| W6-B / AB-2 R | ekwiwalent sieci nadrzędnej z bezwładnością i regulacją pierwotną | f nadir, LFSM-O, E3/E7 w pracy równoległej | szyna sztywna | 50 Hz stałe z konstrukcji (`szyna_sztywna.py:15-18`) | rodzina `ekwiwalent_sieci` (H, D, statyzm) z katalogu, bez domyślek | E2E-R7 z mierzalnym nadirem |
| W6-B / AB-3 R | źródło programowalne `U(t)`, `f(t)` (bodziec zgodności §6.9) | LFSM-O, testy PTPiREE | — | brak urządzenia | rodzina `zrodlo_programowalne` | E2E-R2 |
| W6-B / AB-2 R | zwarcie na gałęzi (% długości) + predykat izolacji | D-10 lokalizacja; poprawność clearingu (T-3) | — | tylko `bus_ref`; zdjęcie bezwarunkowe | `usuniecie_samoistne` vs `izolacja` | test: usunięcie `wylaczenie_galezi` z SO-1A zmienia wynik |
| W6-A / AB-2 R | `ZdarzenieWykonane` + `trigger/cause/device/state_before/state_after` | D-23; odcisk wyniku nie może się zmienić w AB-5 | — | 7 pól (`wynik.py:38-55`) | addytywnie, `exclude_none` | test odcisku: biegi sprzed zmiany identyczne |
| W6-I / AB-2 R | konsument UI `ResultSetDynamicV1` | R-05, ZASADA NR 1 | — | **zero konsumentów**; `ui2/wyniki/stabilnosc` czyta tor progowy FROZEN | minimalna przeglądarka przebiegów + oś zdarzeń wykonanych | e2e Playwright na realnym biegu |
| W6-B / AB-4 R | klasa zdarzeń warunkowych | okno SOC (AB-4), przekaźniki (AB-5), `stay_connected` | silnik | tylko harmonogram (`silnik.py:542-558`) | lokalizacja przejścia przez próg z dokładnością zdarzenia planowanego | bramka czasu zadziałania wobec wyroczni + mutacja „wykrycie na końcu kroku" |
| W6-C / AB-5 R | `rocof_pomiarowy`, zabezpieczenia własne modułu, ponowne przyłączenie źródła, pola ENM przekaźnika/wyłącznika/CT | SO-1B, LoM, Bank Nastaw | AB-4 (zdarzenia warunkowe), W4 | brak | pełny łańcuch D-21 | E2E-R6 |
| W6-F / AB-2…AB-5, W6-J | wyrocznie H4 per rodzina + mutacje w CI | plan zawyżał („H1–H4 ACCEPTED DONE") | — | wyrocznie tylko maszyna 2. rzędu; mutacje w 4 plikach rdzenia | GFL (AB-2), GFM (AB-3), magazyn (AB-4), maszyna 6. rzędu (AB-5), turbina (W6-J) | manifest `walidacja_fizyczna` rozszerzony o D-11…D-15 z mutacją per rodzina |
| W6-D / AB-2 R | konwersja stałej mocy → impedancja przy niskim U + ZIP w rdzeniu | głębokie FRT z odbiorem = odmowa G8 | — | `OdbiorDynamiki` = stała moc; ZIP odmowa | ZIP + próg konwersji jako parametr (bez domyślki) | E2E-R1 z odbiorem przy zwarciu |

Zdania kontrolne przeglądu (§11): rejestr planu wykracza poza „dynamika = FRT + LFSM-O"; **kod na HEAD realizuje mniej niż plan pierwotnie deklarował** — korekty wniesione powyżej.

### 9.2 HARMONIC GAP MATRIX (H-36…H-52; pełna: evidence §2)

| Id | Current | Dowód | Target (kamień) |
|---|---|---|---|
| H-36 | GAP | harmoniczne tylko jako rodzaj „akademicki" FROZEN, nie `PhysicsDomain` | domena + rodzaj biegu `harmoniczne` (AB-1d_min), solver (AB-2H) |
| H-37 | PARTIAL formalnie / GAP merytorycznie | `V=Y(h)⁻¹I` istnieje, Y(h) błędna (F1, F1b, F2, F7), `i_h` zawsze puste | Y(f) w pu z przekładnią, I_h gałęzi, udziały (AB-2H) |
| H-38 | PARTIAL | faza bez znaczenia (wszystkie źródła 0°) | φ_I,h, I_h, faza z danych (AB-2H) |
| H-39 | PARTIAL | THD z U_n zamiast U_1 rozwiązanego; h do 49 vs EN 50160 do 40 | U_1 z rozpływu, zakres H z profilu, THD_I (AB-2H) |
| H-40 | GAP | UI pokazuje tylko THD/TDD/K | tabele U_h/I_h, szyna krytyczna, kierunek Re(V·I*) per h (AB-2H) |
| H-41 | GAP | rzędy całkowite (`dict[int,float]`, niezmiennik 2..50) | `OsCzestotliwosci` f∈ℝ⁺ (AB-1d_min) |
| H-42 | GAP | R stałe, X·h; katalog bez danych f | R(f),L(f),C(f),G(f) z domeną ważności (AB-2H) |
| H-43 | GAP | R_T bez U², grupa ignorowana, brak przekładni | Z_TR(f), ±30°·k per sekwencja, blokada składowej zerowej (AB-2H) |
| H-44 | GAP | `ShuntCapacitor` gubiony przez most; dławika brak w ENM | kondensator, dławik, dławik odstrajający w Y(f) (AB-2H) |
| H-45 | GAP | filtra brak w ENM/katalogu/solverze; UI zaleca „dobierz filtr" | elementy filtrów + before/after (AB-5H) |
| H-46 | PARTIAL pozorne | skan 50–2500 Hz, szyna 0 = 1e-6 Ω | Z_th(f) z fizycznym źródłem, ekstrema, antyrezonanse (AB-2H) |
| H-47 | GAP | „ALERT" dla każdego punktu >10·Z_50 | wrażliwość dZ/dp, element dominujący (AB-5H) |
| H-48 | GAP | tylko `CURRENT_SPECTRUM` bez fazy/punktu pracy | sześć rodzajów + pola H-48 (AB-2H) |
| H-49 | GAP | faza 0 = suma arytmetyczna, niezadeklarowana (F4) | metoda jawna (AB-2H; parametry statystyczne po OD-38) |
| H-50 | GAP | U_bg=0 z konstrukcji | `U_background/U_plant/U_combined` (AB-2H) |
| H-51 | GAP | brak | macierz wkładów z liniowości (AB-5H) |
| H-52 | GAP | brak | framework wariantów (AB-6) |

### 9.3 SUPRAHARMONIC GAP MATRIX (S-53…S-67; pełna: evidence §3)

Wszystkie pozycje S-53…S-64, S-66, S-67: **GAP** (0 trafień `supraharm` w kodzie; brak `SupraharmonicBand`, widm
w.cz., importu pomiarów, metryk, pasma do 150 kHz, Y_abc(f)). S-65: PARTIAL po stronie RMS (kanały `p_pu`, `q_pu`,
`u_pu`, `soc_pu` istnieją; brak ekstrakcji migawki i kanału stanu ogranicznika/trybu). Kamienie: AB-1d_min (kontrakty),
AB-3H (migawka), AB-4H (emisja, propagacja, transfer), AB-5H (Y_abc(f) po W5), AB-7 (pomiar, walidacja, STFT ostatnie).

### 9.4 MULTI-PHYSICS GAP MATRIX (S-65, S-66, E2E-MP1…MP3; pełna: evidence §4)

| Pozycja | Stan | Brak | Kamień |
|---|---|---|---|
| Ekstrakcja `PunktPracyWChwili(t*)` z `ResultSetDynamicV1` | GAP | funkcja t* → {U_i∠θ_i, P_k, Q_k, SOC_k, tryb_k, stan ogranicznika_k, topologia(t*)}; reguły wyboru t* z tolerancją stanu quasi-ustalonego (|dx/dt| < ε) — harmoniczne mają sens tylko quasi-statycznie | AB-3H |
| Kanał stanu ogranicznika prądu GFL, kanał trybu FRT | GAP / PARTIAL | `ogranicz_prad` liczony, nie publikowany | AB-2R (kanał), AB-3H (konsument) |
| Topologia po zdarzeniach jako migawka dzielona z assemblerem | PARTIAL | funkcja „ENM + zdarzenia do t* → migawka" | AB-3H |
| Kontrakt wyboru `E(f, P, Q, U, SOC, tryb)` + reguła interpolacji z domeną ważności | GAP | sekcja `harmonic/supraharmonic` katalogu | AB-4H |
| Wspólna oś zdarzeń: bieg H niesie `{run_id_rms, t*}` + odcisk migawki | GAP | — | AB-3H |
| E2E-MP1 / MP2 / MP3 | GAP | wszystkie ogniwa po stronie H | AB-6 / AB-4H / AB-5H |

### 9.5 REGULATORY GAPS — jakość energii (pełna tabela liczb zaszytych: evidence §6)

**W repozytorium nie istnieje ani jeden limit harmoniczny z kompletną proweniencją** (dokument, wersja, poziom
napięcia, podmiot, miejsce oceny, agregacja, pasmo, jednostka); supraharmonicznych limitów — zero. Zaszyte: 8 %
„PN-EN 50160" jako wartość chwilowa w każdym węźle (norma: 95 % 10-minutówek w tygodniu, na zaciskach zasilania),
5 % „IEEE 519" dla każdego poziomu napięcia (norma: 1–69 kV w miejscu przyłączenia), TDD 5 % bez obliczenia
I_sc/I_L, indywidualne {5:6, 7:5, 11:3,5, 13:3} nigdzie nieoceniane, rzędy {2,3,5,7,11,…,49} bez źródła,
R/X = 0,15/0,99 sieci mimo `Source.rx_ratio`, próg rezonansu 10·|Z_50|, 30° zapasu fazy SSCI. Poprawnie cytowane:
flicker (IEC/TR 61000-3-7:2008 §5.2, Tab. 1, §5.5), ±10 % U_n (PN-EN 50160), VUF (IEC 61000-4-30).
Konsekwencja (W-70, AB-1b): sloty power-quality/harmonic/supraharmonic profilu startują jako `UNVERIFIED_SOURCE`
do decyzji **OD-38** (dokumenty źródłowe jakości energii — §12); wartości z kodu nie są przenoszone do profilu.

### 9.6 MODEL GAPS — Y(f) (pełna: evidence §5)

ENM + katalog + wejście solvera per model: linia/kabel R(f) GAP, L(f) GAP (skalowanie liniowe bez domeny), C(f)
PARTIAL (B=ωC poprawne, brak modelu rozłożonego), G(f) GAP, linia długa (γ, Z_c) GAP, Z_TR(f) GAP, kondensator
PARTIAL (ENM + katalog TAK, solver NIE), dławik GAP, dławik odstrajający GAP, filtry GAP, Norton/Thevenin GAP, widmo
prądowe PARTIAL (pole bez danych, bez fazy), widmo napięciowe GAP, widmo zmierzone GAP, Z_conv(f) PARTIAL
(KEEP_RESEARCH_ONLY), Z_Q(f) sieci GAP (idealna szyna w PQ), tło GAP, odbiór w dziedzinie f GAP, maszyny X''(f)
GAP, agregacja GAP.

### 9.7 ORACLE GAPS — harmoniczne (pełna: evidence §7)

Dziś: brak jakiejkolwiek wyroczni. `numpy` + `scipy` z pyproject wystarczają. Do zbudowania w AB-2H: W-A1
(2 szyny zapis zamknięty), W-A2 (RLC równoległy: f_r, Q, ekstremum), W-A3 (linia długa ABCD vs kaskada π,
zbieżność ~1/n²), W-A4 (superpozycja tła), W-A5 (grupa połączeń: ±30°·k, blokada zerowej), W-M1 (niezależny
solver macierzowy z własną Y — guard AST zakazuje importu `solvers/harmoniczne/{elementy,ybus_f}`), W-M2
(`scipy.signal.freqs` dla filtrów), niezmienniki (wzajemność, pasywność, Foster, Tellegen, niezależność od
kolejności węzłów, Hz↔kHz), benchmark literaturowy (IEEE Task Force 14-bus harmonics / CIGRE TB 766 — dane z
proweniencją). Benchmark pomiarowy (E2E-H8/SH7): brak widm zmierzonych w repo — dane właściciela (OD-38).

### 9.8 MEASUREMENT GAPS

Brak w repo: importera widm (CSV/XLSX/analizator/PQ-monitor), metadanych pomiaru (S-61), metryk model↔pomiar (S-62,
S-63), jakichkolwiek zmierzonych widm harmonicznych/supraharmonicznych i przebiegów czasowych do walidacji RMS
(W6-F ma wyłącznie wyrocznie numeryczne/analityczne/ANDES). Kamień AB-7; dane wejściowe = OD-38.

### 9.9 CI / MUTATION GAPS — harmoniczne i supraharmoniczne (pełna: evidence §8)

**Żadna z dziewięciu klas mutacji harmonicznych nie jest dziś zabijana przez test fizyki.** Cztery (stałe R, brak
kondensatora, zła grupa, zignorowane tło) nie dają się wstrzyknąć, bo obecny kod już JEST mutantem; pięć ginie
wyłącznie na porównaniu bajtowym fikstury UI (które zabija też każdą poprawkę) albo przypadkiem kształtu fikstury.
Sześć klas supraharmonicznych: kodu brak, testów brak. Docelowe detektory per klasa: evidence §8 (kolumna „Test,
który ma zabić"); wchodzą do manifestu `walidacja_fizyczna` jako twierdzenia H-01… z mutacją i bramką (W-100).

## 10. SCENARIUSZE END-TO-END (§87–§90)

| Id | Scenariusz | Kamień | Wyrocznia / dowód |
|---|---|---|---|
| E2E-R1 | PPM-B FRT (zwarcie, zapad, Iq, limiter, clearing, odbudowa P) z 6 kryteriami D-11 | AB-2 R | wyrocznia GFL (H4), obwiednia jedna (OD-33) |
| E2E-R2 | LFSM-O skok + rampa + powrót | AB-3 R | analityczna (statyzm, deadband) |
| E2E-R3 | Q(U) dynamiczne | AB-3 R | analityczna |
| E2E-R4 | BESS FRT + SOC (bilans energii, okno SOC) | AB-4 R | niezmiennik bilansu energii |
| E2E-R5 | SO-1A (G17) | wykonane W6-A | determinizm międzyprocesowy |
| E2E-R6 | SO-1B (chwila z zabezpieczenia) | AB-5 R | sekwencja zadziałań wobec wyroczni IEC 60255 |
| E2E-R7 | Utrata generacji (PV, BESS, synchroniczne, jednoczesna, częściowa) | AB-2 R | bilans mocy, f nadir |
| E2E-R8 | Wyspowanie z GFM/BESS | AB-5 R | wyrocznia przejścia w wyspę |
| E2E-R9 | Rekonekcja (ΔU, Δf, Δθ) | AB-5 R | kryterium synchronizacji jawne |
| E2E-R10 | Worst-case sweep | AB-6 | protokół przemiatania widoczny |
| E2E-H1 | Jedno źródło harmoniczne → U_h, I_h, THD | AB-2 H | analityczna mała sieć (2 szyny) |
| E2E-H2 | Wiele falowników (agregacja jawna) | AB-2 H | niezależny solver macierzowy |
| E2E-H3 | Tło + nowy PGM (U_background / U_plant / U_combined) | AB-2 H | analityczna superpozycja |
| E2E-H4 | Skan częstotliwościowy Z_th(f) | AB-2 H | analityczna (RLC) |
| E2E-H5 | Rezonans kabel/kondensator | AB-2 H | `f_r = 1/(2π√LC)` z modelu |
| E2E-H6 | Topologia OPEN/CLOSED → przesunięcie rezonansu | AB-2 H | dwa biegi, różnica z modelu |
| E2E-H7 | Filtr before/after | AB-5 H | ilościowa redukcja |
| E2E-H8 | Model vs pomiar (harmoniczne) | AB-7 | metryki S-62 |
| E2E-SH1 | Jedno źródło supraharmoniczne + propagacja | AB-4 H | transfer analityczny |
| E2E-SH2 | BESS charge/discharge/idle → różne widma | AB-4 H | model E(f, mode) z katalogu |
| E2E-SH3 | Sieć słaba/silna | AB-4 H | S_k'' jako parametr |
| E2E-SH4 | Przemiatanie długości kabla | AB-4 H / AB-6 | rezonans w.cz. |
| E2E-SH5 | Ocena filtra | AB-5 H | before/after |
| E2E-SH6 | Sprzężenie faz (Y_abc(f)) | AB-5 H (po W5) | źródło A → odpowiedź A/B/C |
| E2E-SH7 | Model vs pomiar (supraharmoniczne) | AB-7 | metryki S-63 |
| E2E-MP1 | PF → RMS FRT → stan podczas FRT → snapshot harmoniczny → widmo | AB-6 | oś zdarzeń wspólna |
| E2E-MP2 | BESS: praca → zwarcie → wsparcie Q → odbudowa → zmiana punktu pracy → zmiana widma | AB-4 H | snapshoty S-65 |
| E2E-MP3 | Zmiana topologii → odpowiedź RMS → nowa topologia → skan → nowy punkt rezonansu | AB-5 H | porównanie skanów |

## 11. Zdania kontrolne zakazu spłycenia (§104)

Raport programu jest **nieważny**, jeśli da się go streścić jednym z czterech zdań: „dodamy harmoniczne
później" · „harmoniczne = THD" · „dynamika = FRT + LFSM-O" · „supraharmoniczne = FFT". Każdy raport Fable
(§12) kończy się jawnym sprawdzeniem tych czterech zdań.

## 12. Korekty dokumentów kanonicznych i decyzje właściciela wynikłe z audytów

### 12.1 Korekty wniesione w tej kolejce (supersesje in-line, nie kasacje)

| Dokument:linia | Było | Jest |
|---|---|---|
| `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §3.6 #4 | Harmoniczne CZĘŚCIOWE | DO-PRZEPROJEKTOWANIA z dowodem F1–F9 i następcą AB-2H |
| `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §2 domena 6 | „harmoniczne (18 rzędów)" jako rdzeń, luka „pod akademickimi" | luka fizyki (REWRITE), rdzeń RMS nazwany z jego brakami |
| `SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md` §2.8 | „widma z proweniencją (W2-C dała wejście)" | W2-C dała regułę, nie dane; solver od nowa |
| `PROGRAM_AB…` §2, §5.1 (ten dokument) | W6-A „wykonane", W6-F „H1–H4 DONE", D-30 „wykonane w części" | korekty T-1…T-3 przeglądu dynamiki |
| `PROGRAM_AB…` §0.2, §6 (ten dokument) | „wszystkie gałęzie zdalne" (3 z 419); WiPWC/SyPGM jako nowe byty; trzecia oś na modelu; bodziec jako rodzaj zdarzenia; `WynikInzynierski` jako nowy kontrakt; „sumowanie bez modelu sieci" | pełne śledztwo 419 + 475 refów; WiPWC/SyPGM rozszerzane; dwie osie modelu; osobny kontrakt `BadanieZgodnosci`; rozszerzenie `OcenaElementu`; v126 buduje Y(h) z `R=const, X·h`, fazą 0 i bez przekładni |
| `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §7 OD-21 | „WOS = właściwy operator systemu" | WOS = wymogi ogólnego stosowania (jak rejestr PTPiREE `wos_version` i solver); operator pisany w pełni |

`INWENTARZ_FUNKCJI_2026-07.md:36` (S17 „Pakiet akademicki V12.6", ekrany E-40…E-50) pozostaje inwentarzem
POWIERZCHNI (wiersz nazywa ekran, nie fizykę); klasyfikację fizyki niesie mapa §3.6 #4 po korekcie powyżej.

### 12.2 Decyzje właściciela — nowe

| Id | Sprawa | Rekomendacja Fable |
|---|---|---|
| **OD-38** | **Dokumenty źródłowe jakości energii** (harmoniczne, supraharmoniczne, pomiar) dla nN i SN w Polsce — potrzebne, żeby sloty profilu (AB-1b) przestały być `UNVERIFIED_SOURCE`; tabela klas dokumentów (co definiuje: emisja / kompatybilność / poziom planowania; urządzenie / instalacja; zakres napięcia; miejsce pomiaru; agregacja; pasmo; czego NIE wolno przenosić między nimi) — *(uzupełniana z audytu regulacyjnego Opus 5.5, §12.3)* | właściciel dostarcza albo potwierdza pobranie ze źródeł publicznych (jak OD-21); do czasu: fail-closed, zero liczb w profilu |
| **OD-39** | **Widma zmierzone i rejestracje przebiegów** do walidacji pomiarowej AB-7 (E2E-H8, E2E-SH7, W-97) — w repo nie ma żadnych danych pomiarowych | właściciel wskazuje źródło (analizator, rejestrator zakłóceń, dane producenta z metadanymi S-61); do czasu: AB-7 buduje importer i metryki na danych syntetycznych oznaczonych `SYNTHETIC`, nigdy jako dowód |
| **OD-40** | **„Bank Nastaw"** — mandat §69 wymienia go jako składnik profilu; Opus 5.5 nie zna dokumentu PTPiREE o takim tytule i nie potwierdza istnienia, wydawcy ani zakresu (zero zgadywania, W-70) | właściciel wskazuje dokument (tytuł, wydawca, wersja) albo potwierdza, że chodzi o klasę: nastawy zabezpieczenia interfejsowego z IRiESD OSD / PN-EN 50549-1/-2; do czasu: sekcja `nastawy_wymagane[]` bez wartości, `ochrona_lom` = INFO z nazwą braku |
| **OD-41** | **Progi klas modułów A/B/C/D**: wszystkie 5 profili YAML niosą 1 MW / 50 MW / 75 MW (`module_types`), a `compliance/nc_rfg_modul.py:23-37` opisuje progi polskie 200 kW / 10 MW / 75 MW (decyzja krajowa do 2016/631 art. 5); pytanie zapisane w repo od karty FAB-J, nierozstrzygnięte; `classify_module` zwraca D dla mocy < 0,8 kW; zmiana liczb w YAML zmienia werdykty solvera FROZEN (B-01) | jedno źródło krajowe progów w loaderze (AB-1b), liczby po potwierdzeniu właściciela; do czasu: profil oznacza `module_types` jako `UNVERIFIED_SOURCE` |

### 12.3 Klasy dokumentów jakości energii (do OD-38)

Pełna tabela 20 dokumentów/klas z kolumnami: status pewności · co definiuje (kompatybilność / planowanie / emisja /
metoda pomiaru) · przedmiot (urządzenie / instalacja / sieć) · napięcie · miejsce oceny · agregacja · pasmo · czego NIE
wolno przenosić — `docs/evidence/OPUS_AUDYT_WARSTWY_REGULACYJNEJ_2026-09-23.md` ZADANIE 4. Streszczenie klas:

| Klasa | Dokumenty | Czego dotyczy | Zakaz przeniesienia |
|---|---|---|---|
| Wymagania przyłączeniowe modułów (bez limitów harmonicznych) | 2016/631 (NC RfG), PN-EN 50549-1 (nN) / -2 (SN) | moduł wytwórczy, miejsce przyłączenia | nie wolno twierdzić, że limit THD jest „wymaganiem NC RfG" (dziś T20) |
| Charakterystyki napięcia zasilającego (dotrzymywane przez OSD) | PN-EN 50160; rozporządzenie systemowe (parametry per grupa przyłączeniowa; aktualne brzmienie — OD) | napięcie sieci, zaciski zasilania, 10-min / 95 % tygodnia, do rzędu 40 | nie jest limitem emisji; nie porównywać z wartością deterministyczną z jednego punktu pracy jako „spełnia" (dziś `engine.py:860`, `v126_academic.py:455`) |
| Poziomy kompatybilności EMC | IEC 61000-2-2 (nN), 61000-2-12 (SN), 61000-2-4 (sieci przemysłowe, klasy 1–3) | środowisko sieci | kompatybilność ≠ emisja; nN ≠ SN; 61000-2-4 nie dla sieci publicznej (dziś `HelpPanel.tsx:48`) |
| Poziomy planowania i przydział emisji instalacjom | IEC TR 61000-3-6 (SN/WN), 61000-3-14 (nN), 61000-3-15 (DG w nN — OD) | instalacja zaburzająca, miejsce przyłączenia; wymaga danych OSD (moc zwarciowa, tło) | planowanie ≠ kompatybilność ≠ emisja; 3-6 nie dla nN |
| Limity emisji urządzeń (badanie typu) | IEC 61000-3-2 (≤ 16 A), 61000-3-12 (16–75 A, Rsce) | urządzenie na zaciskach, nN | widmo z deklaracji 61000-3-12 (`types.py:1397`) = badanie typu przy określonym Rsce, nie model źródła w sieci SN |
| Metody pomiaru | IEC 61000-4-7 (grupowanie, 2–9 kHz informacyjnie), 61000-4-30 (klasa A/S, agregacje), CISPR 16-1-1 (pasmo A 9–150 kHz, RBW 200 Hz) | przyrząd | wyniki z różnych metod nieporównywalne; symulacja bez definicji grupowania nieporównywalna z limitem mierzonym |
| Sygnalizacja PLC | EN 50065-1 (3–148,5 kHz) | nadajniki PLC nN | nie jest limitem emisji falowników |
| Normy zagraniczne | IEEE 519 (2014/2022): granice per klasa napięcia, TDD wg Isc/IL | miejsce przyłączenia, percentyle tygodniowe | niewiążąca w PL; nie jeden próg 5 % dla wszystkich szyn (dziś `v126_academic.py:457-460`) |
| IRiESD pięciu OSD (Energa, Enea, PGE, Tauron, **Stoen** — brak profilu) | wydania 2025 — OD-21 | instalacja przyłączana / sieć OSD | nie przenosić wartości między OSD |
| Supraharmoniczne 2–150 kHz dla falowników w PL | **brak znanego dokumentu wiążącego** — OD | — | do czasu OD: `SupraharmonicBand` bez limitu, wynik = `REQUIREMENT_UNVERIFIED` |

Pytania do właściciela (OD-38): (1) które dokumenty są wiążące dla emisji harmonicznych PPM w nN i SN (IRiESD,
rozporządzenie systemowe, IEC TR 61000-3-6/-3-14 jako metoda przydziału); (2) czy OSD udostępniają poziomy
planowania i dane do przydziału (bez nich wynik = `UNVALIDATED_INPUT`); (3) obowiązujące wydania PN-EN 50160 i
PN-EN 50549-1/-2; (4) czy istnieje wiążący dokument 2–150 kHz (jeśli nie — metryki pasma bez werdyktu); (5) metoda
pomiarowa referencyjna per pasmo (IEC 61000-4-7 zał. B / 61000-4-30 / CISPR 16) do `SupraharmonicBand.measurement_method`.

## 13. Raport Fable po pierwszej rundzie (§103)

*(sekcje CURRENT HEAD · RECOVERED WORK · CURRENT ROADMAP · DYNAMICS GAP MATRIX · HARMONIC GAP MATRIX ·
SUPRAHARMONIC GAP MATRIX · MULTI-PHYSICS GAP MATRIX · ADOPT/ADAPT/REWRITE/KEEP_RESEARCH_ONLY/REJECT ·
DEPENDENCY GRAPH DELTA · REGULATORY GAPS · MODEL GAPS · ORACLE GAPS · MEASUREMENT GAPS · CI/MUTATION GAPS ·
NEXT EXISTING WORKSTREAM — wypełniane po ETAPIE 8)*
