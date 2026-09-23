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

**Pomiar (grep pełnotekstowy `mv-design-pro/**`, `git log --all --grep`, wszystkie gałęzie zdalne):**
żaden z tych identyfikatorów nie występuje w repozytorium, w historii commitów ani na żadnej gałęzi
zdalnej (`origin/main`, `origin/claude/mv-design-pro-twin-audit-u4lhy0`, `origin/claude/relaxed-sagan-ww188q`).
Poprzednia sesja **nie zdążyła zatwierdzić ani wypchnąć** tego planu. Odzyskane = dokładnie baseline R10.

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
| **W6-A obserwable** | B2, B3, B4, C2–C5 (obserwable) | **wykonane** (SO-1A na G17) | `W6_A_KONTRAKT_OBSERWABLI.md` Z3–Z5, `tests/e2e/test_so1a_scenariusz_odniesienia.py` |
| **W6-F dowód i walidacja** | H1–H4 | **ACCEPTED DONE (R10)**: D01–D07 = L5, D08–D10 = L4 | `tests/walidacja_fizyczna/**` (bramki G1–G13, mutacje M10–M21, manifest, ANDES w osobnym jobie) |
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
| W6-7 jakość energii (flicker do solvera, VUF, harmoniczne pod „Jakość", EN 50160) | — | **otwarte**; harmoniczne dziś: widmo z karty (W2-C) + `v126_academic._power_quality` (FROZEN, sumowanie bez modelu sieci) — audyt §8 | `solver_input/v126_contracts.py::V126HarmonicSourceInput`, `catalog/types.py::harmonic_spectrum_percent` |

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
| D-10 | Zwarcie i clearing: PRE-FAULT → FAULT → CLEARING → POST-FAULT; wejścia minimum: lokalizacja, impedancja zwarcia, chwila wystąpienia, czas usunięcia, topologia pozwarciowa; obserwable `U_i(t)`, `θ_i(t)`, `f_i(t)`, `ROCOF_i(t)`, `I_ij(t)`, `P_ij(t)`, `Q_ij(t)` + stany urządzeń | D1, D3, B1–B4 | AB-2 (wykonane w części: SO-1A) |
| D-11 | FRT dla PPM-B jako pełna symulacja: zwarcie, zapad, ogranicznik, `I_d`, `I_q`, odpowiedź prądem biernym, tłumienie prądu czynnego, priorytet składowej, clearing, odbudowa, stan końcowy; kryteria ROZDZIELONE i mierzone osobno: `stay_connected`, `reactive_current_activation`, `reactive_current_magnitude`, `current_limit_behavior`, `active_power_recovery`, `final_operating_state` | C2, E2, E6 | AB-2 |
| D-12 | Szybki prąd zakłóceniowy: `I_d(t)`, `I_q(t)`, `|I| = √(I_d²+I_q²) ≤ I_max`; deadband, gain, opóźnienie aktywacji, zależność od napięcia, nasycenie, priorytet P/Q, zachowanie zwolnienia | C2, E6 | AB-2 |
| D-13 | Odbudowa mocy czynnej po clearingu: chwila rozpoczęcia, gradient, czas osiągnięcia zadanego udziału `P_pre`, maksimum, przeregulowanie, stan końcowy, ograniczenie limiterem, ograniczenie dostępnością źródła | E6 | AB-2 |
| D-14 | LFSM-O jako pełna symulacja (nie wykres algebraiczny): skok `f_0→f_1`, rampa `f(t)=f_0+kt`, powrót; próg, deadband, statyzm, opóźnienie, ramp-rate, dostępne P, nasycenie, odbudowa | E3, E7 | AB-3 |
| D-15 | Regulatory P/Q/U dynamiczne: `Q(U)`, `cosφ(P)`, `Q=Q_zad`, `P=P_zad`, `U=U_zad`; dla każdego: dynamika, deadband, nachylenie, stałe czasowe, ograniczenia szybkości, nasycenie, priorytet, punkt pomiaru | C2, C3, D13 | AB-3 |
| D-16 | BESS pełny model dynamiczny: `P(t),Q(t),I(t),SOC(t),E(t)`; `dE/dt = F(P, η_ch, η_dis)` z jawną konwencją znaków; `SOC_min ≤ SOC ≤ SOC_max`; nie ma energii znikąd; tryby charge/discharge/idle, P control, Q control, Q(U), LFSM-O jeśli dotyczy, FRT, limiter, GFL, GFM tam gdzie model reprezentuje zdolność | C4, E7 | AB-4 |
| D-17 | Utrata źródła: loss of PV, loss of BESS, loss of synchronous source, simultaneous loss, partial generation loss; analiza U, f, ROCOF, redystrybucji mocy, odpowiedzi BESS, odpowiedzi zabezpieczeń, wyspowania | D5, D6, E3 | AB-2 |
| D-18 | Skoki: `LOAD_STEP`, `GENERATION_STEP`, `P_SETPOINT_STEP`, `Q_SETPOINT_STEP`, `U_SETPOINT_STEP`; analiza ustalania, przeregulowania, odpowiedzi f i U, interakcji regulatorów | D8, D13 | AB-2 / AB-3 |
| D-19 | Zmiana topologii minimum: `LINE_OPEN/CLOSE`, `TRANSFORMER_OPEN/CLOSE`, `COUPLER_OPEN/CLOSE`, `SOURCE_TRIP`, `BREAKER_TRIP`, `RECLOSE`; po zmianie `Y⁻→Y⁺` i obowiązkowa re-inicjalizacja algebraiczna `g(x⁺,y⁺)=0` | D4, D9, D10, D12 | AB-2 |
| D-20 | SO-1A: clearing zaplanowany (`t_clear` od projektanta) — osobna zdolność, pozostaje ważna | §0.2 zamrożenia | wykonane (W6-A) |
| D-21 | SO-1B: clearing z zabezpieczenia: fault → I/U → relay → trip → breaker → topology → RMS continuation; SO-1A nie dowodzi SO-1B | D3, D14 | AB-5 |
| D-22 | IEC 60255 w pętli czasowej ze STANEM zabezpieczenia: pickup, akumulator, dropout, reset, trip latch, breaker delay — nie `t_trip=f(I(t))` liczone niezależnie w każdym kroku | D14 | AB-5 |
| D-23 | Automatyka: SPZ, SZR, sprzęgła, odciążanie, generation shedding, LoM, logika wyspowa, sekwencje wielozdarzeniowe; każde działanie: `time, trigger, device, cause, state_before, state_after` | D15 | AB-5 |
| D-24 | Praca wyspowa: wykrycie wysp po zmianie topologii, źródła, GFL/GFM, bilans P/Q, U, f; wyspa z odbiorem bez źródła = nazwana odmowa przed Newtonem; zakaz `U=1 pu, f=50 Hz` jako fallback | D11 | AB-5 (wykrycie wykonane R10 F-8; zdarzenie i warunek brzegowy otwarte) |
| D-25 | Rekonekcja: przed zamknięciem `ΔU`, `Δf`, `Δθ`; wynik wyjaśnia, dlaczego załączenie jest/nie jest dopuszczalne dla aktywnego kryterium | D12 | AB-5 |
| D-26 | Stabilność kątowa: `δ̇=ω_b(ω−1)`, `ω̇=(P_m−P_e−D(ω−1))/2H`; obserwować δ, ω, P_e, P_m, tłumienie, oscylacje; zakaz samego `δ_max` bez formalnego kryterium | C1, E4 | AB-5 |
| D-27 | Small-signal / odpowiedź oscylacyjna: okres, tłumienie, wpływ H, D, impedancji źródła, regulatorów; nie udawać pełnego eigenanalysis; jeśli implementowany — osobny zwalidowany kontrakt | E4 (rozszerzenie) | AB-5 (kontrakt osobny) |
| D-28 | CCT automatyczne `t_CCT`; nie zakładać monotoniczności dla układu konwerterowego; przed bisekcją sprawdzić założenie granicy; `M_CCT = t_CCT − t_clear` | E5, F1 | AB-5 |
| D-29 | Częstotliwość węzła zachowana: `θ̇ = Im(V̇·V̄)/|V|²`, `f = f_n + θ̇/2π`; rozdzielone: bus frequency, PLL frequency, rotor frequency | B2 | wykonane (W6-A, OD-30) |
| D-30 | ROCOF rozdzielony: `bus_rocof`, `pll_rocof`, `rotor_rocof` — nie mieszać w jeden kanał | B3 | wykonane w części (bus); PLL/rotor jako kanały — AB-2 |
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
| 1 | **WOS resolver** | Rozwiązywacz wymagań ogólnego stosowania (NC RfG, rozporządzenie 2016/631, zatwierdzone przez URE dla PSE) po `(typ modułu A/B, klasa PPM/SyPGM, poziom napięcia nN/SN, data warunków przyłączenia)` → lista wymagań z `clause_ref`, wersją i datą obowiązywania. Dziś: 5 profili YAML bez wersji i bez różnic między OSD (A-15). Cel: `catalog/profiles/nc_rfg/*.yaml` + nowy `catalog/profiles/wos/` z polami `version, valid_from, source_document, clauses[]`; do czasu OD-21 profil nosi `validation_status: UNVERIFIED_SOURCE` i **nie** produkuje `ComplianceResult` klasy dowodu | AB-1b |
| 2 | **PTPiREE resolver** | Mapowanie wymagania WOS → test procedury PTPiREE 3.0 (T01–T20 solvera FROZEN, kanon `docs/analysis/NC_RFG_PTPiREE_TESTY_KANON.md`) z `AcceptedEvidenceMethod` per test; jedyna kanoniczna przestrzeń numeracji = T01–T20 (A-5); `compliance_tests` w YAML = martwe (OD-26) | AB-1b |
| 3 | **WiPWC** | „Warunki i Procedury Wykorzystania Certyfikatów" (PTPiREE): reguła, kiedy certyfikat jednostki/komponentu zastępuje test/symulację (`AcceptedEvidenceMethod = CERTIFICATE`), z zakresem ważności (moc, typ, wersja oprogramowania), rejestrem certyfikatów PTPiREE (`ptpiree_wykaz_snapshot.json`, klasa K-H „dane śladowe") | AB-1b |
| 4 | **Bank Nastaw** | Bank nastaw zabezpieczeń modułów wytwarzania (PTPiREE/OSD): nastawy 27/59/81U/81O/81R/ROCOF jako **profil regulacyjny**, nie jako fizyka; konsument: AB-5 (zabezpieczenia w pętli) i `ochrona_lom.py`; jedna prawda nastaw = model (OD-34), profil = wymaganie, do którego model jest porównywany | AB-1b |
| 5 | **PPM vs SyPGM** | Klasyfikacja modułu: Power Park Module (przekształtnikowy) vs Synchronous Power Generating Module — jawne pole w ENM (`Generator.modul_wytworczy: PPM \| SyPGM`) wyprowadzone z rodziny dynamicznej i katalogu, nigdy z nazwy; różne wymagania WOS (np. FRT prąd bierny dla PPM, stabilność kątowa dla SyPGM) | AB-1b |
| 6 | **AcceptedEvidenceMethods** | Per wymaganie: `{SIMULATION_VALIDATED_MODEL, TYPE_TEST, COMMISSIONING_TEST, CERTIFICATE, DECLARATION}` — które metody profil akceptuje; `ComplianceResult` bez metody akceptowanej = `REQUIREMENT_UNVERIFIED` | AB-1b |
| 7 | **Internal test IDs** | Wewnętrzne identyfikatory testów/scenariuszy programu (E2E-R*, E2E-H*, E2E-SH*, E2E-MP*, bramki G*, mutacje M*) ≠ identyfikatory PTPiREE T01–T20; mapowanie w rejestrze `provenance.py` (A-2), nigdy w solverze FROZEN | AB-1b |
| 8 | **ModelValidationStatus** | Trzy rozłączne pytania (W-96) na każdym modelu urządzenia i każdej sekcji katalogu: `equation_validated` (równania wobec wyroczni analitycznej), `device_model_validated` (parametry urządzenia wobec pomiaru/certyfikatu), `compliance_evidence_accepted` (wynik dopuszczony jako dowód wymagania przez profil); istniejący `EvidenceTier` (S-1) pozostaje osią wyniku, `ModelValidationStatus` jest osią modelu — dwie osie, dwie nazwy (wzorzec A-8) | AB-1a |
| 9 | **ComplianceStimulus ≠ PhysicalNetworkDisturbance** | Bodziec testowy (np. rampa f na zaciskach wg PTPiREE, zadany profil U(t) z obwiedni) jest **zdarzeniem na zaciskach** (`bodziec_zgodnosci`), a zakłócenie sieciowe (zwarcie w węźle, wyłączenie gałęzi) jest **zdarzeniem w sieci** (`ScenariuszDynamiczny.zdarzenia`); dwa rodzaje w kontrakcie scenariusza, wynik nosi, którym był; test zgodności nigdy nie udaje badania sieci i odwrotnie | AB-1a |
| 10 | **AB-1d_min przed AB-1c** | Rejestr domen fizycznych i rodzajów biegów (`harmoniczne`, `skan_czestotliwosciowy`, `supraharmoniczne` jako `analysis_type` z nazwaną odmową do czasu solvera) musi istnieć **zanim** łańcuch zgodności (AB-1c) zostanie zbudowany — inaczej łańcuch powstałby wyłącznie dla RMS i utrwalił redukcję do compliance | §7 |
| 11 | **Explainable Verdict Contract** | Kontrakt `WynikInzynierski` (W-71: 16 pól obowiązkowych) jako jedyna forma werdyktu we wszystkich domenach; guard `explainable_verdict_guard.py` zakazuje literałów `SPEŁNIA/NIE SPEŁNIA/PASS/FAIL` jako samodzielnych pól wyniku w API i UI | AB-1a |

---

## 7. KAMIENIE PROGRAMU — kolejność wykonawcza i graf zależności (§4, §93 mandatu)

Sekwencja bazowa: **AB-1a → AB-1b → AB-1d_min → AB-1c → AB-2 → AB-3 → AB-4 → AB-5 → AB-6 → AB-7.**
Tor R (RMS) i tor H (harmoniczne/supraharmoniczne) biegną w kamieniach AB-2…AB-7 **równolegle** (delegacja
równoległa do Opus 5.5 na osobnych worktree, commit bez push, integracja przez Fable).

| Kamień | Zakres | Domyka (zamrożenie / rejestr) | Zależy od | Dowód wyjścia |
|---|---|---|---|---|
| **AB-1a** Fundament wyników i wyjaśnialności | `PhysicsDomain` (W-07), `WynikInzynierski` (W-71/W-72/W-73), `ModelValidationStatus` (§6.8), `bodziec_zgodnosci` vs zdarzenie sieciowe (§6.9), kontrakt parametru `VALUE/UNIT/SOURCE/VERSION/STATUS/DOMAIN` (W-98), kody fail-closed (W-99), guard werdyktu (§6.11) | H3 (rozszerzenie), NOWE | R10 | testy kontraktów; OpenAPI snapshot; guard w CI; istniejące wyniki dynamiki (`ResultSetDynamicV1`) niosą `physics_domain=RMS_DYNAMICS` bez zmiany odcisków |
| **AB-1b** Profil regulacyjny | WOS/PTPiREE/WiPWC/Bank Nastaw resolvery, PPM vs SyPGM, AcceptedEvidenceMethods, internal test IDs (§6.1–§6.7), sloty power-quality/harmonic/supraharmonic/measurement w profilu (W-69) puste-fail-closed do OD-21/OD-38 (W-70) | NOWE | AB-1a | resolver zwraca wymagania z `clause_ref` i wersją; brak źródła = `UNVERIFIED_SOURCE`, nie liczba |
| **AB-1d_min** Rejestr domen i biegów | rodzaje biegów `harmoniczne`, `skan_czestotliwosciowy`, `supraharmoniczne` w rejestrze biegów kanonicznych z nazwaną odmową `domena.solver_nieobecny` do czasu AB-2H; `SupraharmonicBand` (S-54) jako kontrakt bez wartości domyślnych; oś częstotliwości `f ∈ ℝ⁺` (H-41) | NOWE | AB-1a | bieg każdego rodzaju kończy się wynikiem albo nazwaną odmową; gotowość nie melduje `ready` bez solvera (A-7) |
| **AB-1c** Łańcuch zgodności | EngineeringResult → RegulatoryProfile → Applicability → AcceptedEvidenceMethod → ComplianceResult (W-06) jako konsument **dowolnej** domeny; macierz NC RfG i certyfikat czytają `WynikInzynierski`; bezpiecznik A-6 zachowany do OD-20 | — (przygotowanie W6-5) | AB-1b, AB-1d_min | T-test z RMS i z harmonicznych przechodzi tym samym łańcuchem; certyfikat cytuje wersję profilu |
| **AB-2 R** Zakłócenia i FRT | D-10, D-11, D-12, D-13, D-17, D-18, D-19, D-30 (kanały PLL/rotor), D-31 (ZIP, f-sensitive), D-32; W6-B (D7, D11 jako zdarzenie nazwane, D12 bez synchronizacji, D13), W6-D dla E1, E2 (po OD-33 jedna obwiednia), E6 | D7, D11, D12, D13, E1, E2, E6 | AB-1a | E2E-R1, E2E-R7; metryki liczone w rdzeniu; bramki R10 zielone |
| **AB-2 H** Rdzeń harmoniczny | `network_model/solvers/harmoniczne/`: elementy `Z(f)` (H-42, H-43, H-44), `Y(f)` (H-37, H-41), harmonic load flow (H-37, H-38, H-39, H-40), źródła (H-48, H-49, H-50), skan `Z_th(f)` (H-46), White-Box (W-75, W-76), wyrocznia (W-79), mutacje (W-81), kondensator/dławik/filtr jako elementy ENM (W-08), wpięcie w bieg i przeglądarkę (W-85) | NOWE (W6-7 harmoniczne) | AB-1d_min | E2E-H1, E2E-H2, E2E-H3, E2E-H4, E2E-H5, E2E-H6 |
| **AB-3 R** Regulatory | D-14 (LFSM-O), D-15 (P/Q/U), D-33 (GFM jawny), W6-D E3, E7 | E3, E7 | AB-2 R | E2E-R2, E2E-R3 |
| **AB-3 H** Punkt pracy → model emisji | S-56, S-65 (snapshot punktu pracy z trajektorii RMS → wybór modelu widmowego) | NOWE | AB-2 H, AB-3 R | snapshot z biegu RMS zasila bieg harmoniczny bez ręcznego przepisywania liczb |
| **AB-4 R** BESS | D-16 pełny; okno SOC jako zdarzenie warunkowe (zamrożenie §9) | C4, E7 | AB-3 R | E2E-R4 |
| **AB-4 H** Supraharmoniczne | S-55, S-57, S-58, S-67, W-77, W-82; BESS `E(f,P,Q,U,SOC,mode)`; sekcje katalogu `harmonic/supraharmonic` (W-68) | NOWE | AB-2 H, AB-4 R | E2E-SH1, E2E-SH2, E2E-SH3, E2E-SH4, E2E-MP2 |
| **AB-5 R** Zabezpieczenia, automatyka, wyspy, stabilność | D-21, D-22, D-23, D-24, D-25, D-26, D-27, D-28, D-31 (silnik indukcyjny, OD-37); W6-C (D3, D14, D15), W6-B (D11 warunek brzegowy, D12 synchronizacja), W6-D E4, W6-E (E5, F1); nastawy z modelu (OD-34), Bank Nastaw jako wymaganie | D3, D11, D12, D14, D15, E4, E5, F1, C6 | AB-4 R, W4 (nastawy w modelu) | E2E-R5 (regresja), E2E-R6, E2E-R8, E2E-R9; SO-1B |
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

*(wypełniane z audytu Opus 5.5 — ETAP 5; do czasu wpisu każdy element ma status `DO AUDYTU`)*

## 9. MACIERZE LUK (§103) — DYNAMICS · HARMONIC · SUPRAHARMONIC · MULTI-PHYSICS · REGULATORY · MODEL · ORACLE · MEASUREMENT · CI/MUTATION

*(wypełniane z przeglądu Opus 5.5 — ETAP 4–5; format: istniejący workstream | nowa zdolność | dlaczego
potrzebna | dependency | current state | target | evidence)*

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

## 12. Raport Fable po pierwszej rundzie (§103)

*(sekcje CURRENT HEAD · RECOVERED WORK · CURRENT ROADMAP · DYNAMICS GAP MATRIX · HARMONIC GAP MATRIX ·
SUPRAHARMONIC GAP MATRIX · MULTI-PHYSICS GAP MATRIX · ADOPT/ADAPT/REWRITE/KEEP_RESEARCH_ONLY/REJECT ·
DEPENDENCY GRAPH DELTA · REGULATORY GAPS · MODEL GAPS · ORACLE GAPS · MEASUREMENT GAPS · CI/MUTATION GAPS ·
NEXT EXISTING WORKSTREAM — wypełniane po ETAPIE 8)*
