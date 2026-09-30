# Karta wykonawcza AB-1b.3 — rdzeń dynamiki RMS: architektura modeli odbiorów (stała moc z przejściem PQ→Z, ZIP z parytetem rozpływu, odbiór czuły częstotliwościowo, kontrakt części dynamicznej dla silnika)

> **Utrwalenie dla wznowienia (2026-09-30).** Treść karty powstała w katalogu roboczym sesji, który ginie z kontenerem; tu jest przeniesiona bez zmian merytorycznych. Ścieżki `<scratchpad>/…` i `<worktrees>/…` oznaczają katalogi tamtej sesji — nowa sesja podstawia własne (meldunki i logi karty nie przetrwały; dowodem wykonania jest commit i wpis rejestru `PLAN_AB_DYNAMIKA_A_B_2026-09.md` §7). Stan karty i kolejność prac: `STAN_REPO.md` §7 (pakiet wznowienia).
> **Stan 2026-09-30:** AB-1b.3a (pakiety P0–P2, P5) wykonana — `4ff9672d`, plan §7. AB-1b.3b (pakiety P3, P4, P6, P7 + decyzja O-56) W TOKU — karta w części „Karta AB-1b.3b” na końcu tego dokumentu; praca w toku zabezpieczona na gałęzi zdalnej `claude/mv-design-pro-twin-audit-u4lhy0-wip-ab-1b3b`.

**Program:** `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` — §5 sekwencja (:326) i uzasadnienie kolejności
AB-1b.3 przed AB-1b.2 (:335-337), wiersz **AB-1b.3** (:345); §2 **O-22** (:108), **O-47** (:143, pkt 2 —
jeden mechanizm węzła o napięciu narzuconym), **O-48** (:144, pkt 3–4 — więź napięciowa od AB-1b.1,
kolejność 1b.3 → 1b.2 „bez odmowy tymczasowej"); §3a wiersz 22 (:194); §10 wiersz RMS/DAE (:521); §11
wiersz AB-1b (:534) i AB-3 (+AB-3b) (:538); §12.1 bramka danych.
**Kontrakty:** `docs/plan/W6_A_KONTRAKT_OBSERWABLI.md` (§2 przestrzenie x/y/z, §3 częstotliwość węzła,
§5 zdarzenia nieciągłe, §7 przepływy, §9 F-2, zał. Z3.1 :738-752); `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`
(§3b poziomy dowodu).
**Zamrożenie:** `docs/plan/FINAL_DYNAMICS_CAPABILITY_FREEZE.md` wiersze **C6** (:141, :201), **D7** (:148),
**D8** (:149), **OD-37** (:338).
**Dowód pomiarowy luk:** `docs/audit/ab-raw/MACIERZ_LUK_DYNAMIKI_OPUS_2026-09-23.md` §„Gap matrix" #22 (:55),
sąsiednie #9 (:42), #15, #20, (c)2 (:95), (c)8; manifest `backend/tests/walidacja_fizyczna/manifest.py`
(D-01…D-10, :45-225); raport R10 `docs/evidence/RUNDA10_DOMKNIECIE_DOWODU_WYKONYWALNEGO_2026-09-20.md`.
**Karty sąsiednie (styl, numeracja, punkty styku):** `scratchpad/karta_AB_1b1_zdarzenia_rdzenia.md`
(D-12…D-21, bramki G14–G21, M22–M37), `scratchpad/karta_AB_1b2_1dmin_gfl.md` (D-11.1…D-11.9, GF1–GF11,
M22–M36 — kolizja numeracji, §5 S5), `scratchpad/karta_AB_H0_kontrakty_widma.md` (ten sam worktree).
**Data karty:** 2026-09-23. **Autor karty:** analityk (tryb tylko-odczyt, bez git; sondy
S1–S5 w `scratchpad/ab1b3/`).
**Wykonawca:** wykonawca (subagent; pakiety P0–P7 z własnymi bramkami; worktree `r10`; bez
`git commit`/`push` — odbiór, weryfikacja i commit po stronie integratora). P1→P2→P3→P4 dzielą pliki rdzenia
(`kontrakty.py`, `siec.py`, `calkowanie.py`, `silnik.py`, `obserwable.py`) — JEDEN wykonawca, sekwencyjnie.
P5 (strona rozpływu: `power_flow_zip.py`, `enm/mapping.py`, `enm/assembler.py`, `enm/load_zip_model.py`) ma
rozłączne pliki i może iść równolegle u drugiego wykonawcy od chwili zamknięcia P0.
**Baza:** commit integratora zamykający AB-1b.1 (obie części: AB-1b.1a = P0–P5 + P9 oraz AB-1b.1b = P6–P8 +
P10). SHA bazy zapisuje wykonawca w P0. Sekwencja §5 planu (:326) jest wiążąca: AB-1b.1 → **AB-1b.3** →
AB-1b.2.

**Status rdzenia wobec B-01.** Pakiet `network_model/solvers/dynamika/**` nie należy do
`scripts/solver_diff_guard.py:39-47` `PROTECTED_FILES`; jest edytowany z delegacji planu §2 („każda edycja
rdzenia niesie parytet/dowód w commicie") pod bramką „L5 rdzenia D-01…D-07 zachowane" (§11 :534).
Rdzenie FROZEN rozpływu i zwarć (`power_flow_newton_internal.py`, `power_flow_newton.py`, GS, FD,
`short_circuit_*`) — NIETKNIĘTE; w tej karcie są NIEZALEŻNĄ wyrocznią parytetu t = 0 (D-22). Pakiet P5
zmienia WYŁĄCZNIE niezamrożone `power_flow_zip.py` i warstwę ENM; jedyna zmiana, która wymagałaby edycji
FROZEN NR (reprezentacja wielu odbiorów ZIP na jednej szynie), jest nazwana jako pozycja B-01 (§0 pkt 10,
§7 pyt. 5) — to jest dozwolone zatrzymanie, nie odroczenie.

**UWAGA O CYTATACH `plik:linia`.** W chwili pisania karty (2026-09-23, 06:45–07:20 UTC) wykonawca AB-1b.1a
edytował rdzeń w tym samym worktree (pomiar `ls --time-style=full-iso`: `kontrakty.py` 07:06, `silnik.py`
07:07, `tozsamosc.py` 07:06, `urzadzenia/*` 07:08–07:09, potem `siec.py`, `zdarzenia.py`,
`adapter_dynamiki.py`, `tests/walidacja_fizyczna/bramki.py`), a równolegle inni wykonawcy (AB-H0/AB-1a)
edytowali warstwę ENM (`enm/models.py` 07:25, `enm/hash.py` 07:26, `enm/domain_operations_v2.py` 07:27,
`enm/domain_operations.py` 07:27). Wszystkie cytaty tych plików w karcie wskazują **stan bazowy R10**
(odczyt przed tymi edycjami; dla adaptera zweryfikowany kopią w głównym checkoucie — ten sam SHA-256
`2e06643779cc…`). Wykonawca lokalizuje miejsca PO NAZWIE funkcji/klasy — numery linii przesuną się o edycje
AB-1b.1, AB-H0 i AB-1a. Nazwy wprowadzone przez AB-1b.1 cytuję nazwą (z karty AB-1b.1 i z kodu w toku), nie
linią.

---

## Zależność od AB-1b.1 (punkty styku — karta ZAKŁADA ich obecność)

| Id | Mechanizm AB-1b.1 (nazwa w kodzie/karcie) | Co z nim robi ta karta |
|----|--------------------------------------------|------------------------|
| T1 | Węzeł o napięciu narzuconym: wiersz `V_k − E_k(x) = 0`, `Urzadzenie.sprzezenie`, `siec.prad_wezla_ograniczonego` (AB-1b.1 §0 pkt 3; w kodzie w toku `kontrakty.py` `SprzezenieUrzadzenia`) | odbiór w węźle narzuconym `V = 0` (zwarcie metaliczne) liczy prąd z gałęzi impedancyjnej `I = −Y_eq·V = 0`; prąd źródła/zwarcia wyprowadzany z bilansu węzła obejmuje prąd odbioru — bez zmian w mechanizmie |
| T2 | Odmowa `dynamika.odbior_stalej_mocy_przy_zerowym_napieciu` (`KOD_ODBIOR_STALEJ_MOCY_PRZY_ZEROWYM_NAPIECIU`, AB-1b.1 §0 pkt 3, P1/P3; test P3 „wiersz ograniczenia × odbiór PQ w węźle (odmowa nazwana)"; sonda 5 karty AB-1b.1) | **KASOWANA** (kod z rejestru `KODY_ODMOW`, miejsce podniesienia, test przepisany na bieg z `I_odb = 0` dokładnie) — §0 pkt 6 |
| T3 | Obszar beznapięciowy: `wyspy.klasyfikuj_wyspy`, odbiory obszaru wyłączone z wstrzyknięć, `ZdarzenieWykonane.odbiory_odciete` („ident + moc sprzed odcięcia"), `obszary_zasilone_ponownie`, kanał `stan_zasilania@` (AB-1b.1 §0 pkt 2, pkt 8) | „moc sprzed odcięcia" liczona funkcją modelu odbioru w próbce `L`; kanał `tryb_odbioru@` = 3 ⇔ `stan_zasilania@(węzeł odbioru) = 0` (ten sam predykat); reinicjalizacja estymatora częstotliwości odbioru przy ponownym zasileniu (§0 pkt 4d) |
| T4 | Aktywność odbiorów: `StanScenariusza.odbiory_aktywne`, zdarzenie `ZmianaOdbioru`, rodzaje `odlaczenie_odbioru`/`zalaczenie_odbioru` (AB-1b.1 §0 pkt 1, P2) | odbiór nieaktywny: prąd 0, estymator śledzi napięcie szyny (bez reguły szczególnej), `tryb_odbioru@` = 2 |
| T5 | `sposob_usuniecia ∈ {izolacja, samoczynne}` wymagane przy `t_usuniecia_s` (AB-1b.1 §0 pkt 4; w kodzie w toku już wymagane w `ZwarcieWezla`) | wzorce tej karty jawnie deklarują `"samoczynne"` (przemiatania zapadu) albo `"izolacja"` (scenariusze z izolacją) |
| T6 | Próbki obustronne `L`/`P`, `strona_probki`, kontrakt `resultset_dynamic_v2` z `None` w szeregach (AB-1b.1 §0 pkt 6, 7, 14) | nowe kanały odbiorów próbkowane w `C`/`L`/`P`; `None` w `f_odbioru_hz@` ⇔ `tryb_odbioru@ ∈ {2, 3}`; nowa wartość przestrzeni kanału `"odbior"` w v2 |
| T7 | Tożsamość: `parametry_tozsamosci()` w protokole, `odcisk_migawki` z parametrami (AB-1b.1 §0 pkt 13) | model odbioru dostaje `parametry_tozsamosci()`; odcisk obejmuje całą charakterystykę odbioru |
| T8 | Twierdzenie D-16 (ponowne zasilenie → wyższy pierwiastek; wyrocznia dwuwęzłowa odbioru stałej mocy) i mutacja M36 (AB-1b.1 P3) | wzorzec D-16 dostaje zadeklarowane `U_min` odbioru poniżej obu pierwiastków; wyrocznia D-16 bez zmian; M36 mierzona ponownie w P2 (§3) |
| T9 | (AB-1b.1b P6) `ZdarzenieWykonane.przypisania` (adres, przed, po) | reinicjalizacja estymatora przy ponownym zasileniu zapisywana w TYM SAMYM polu; gdyby pola nie było — ta karta je dodaje w kształcie z AB-1b.1 §0 pkt 9 (jedno pole, bez duplikatu) |
| T10 | (AB-1b.1b P7, jeśli obecne) źródło testowe idealne `ZrodloTestowe` (`idealna`, profil skoku/rampy f) | druga droga wyroczni D-24 (odpowiedź estymatora na znany profil f — postać zamknięta); brak P7 nie blokuje L5 D-24 (wyrocznia wyspowa wystarcza) |

**Co ta karta dostarcza kolejnym kartom:** AB-1b.2 — odbiór w węźle zwarcia metalicznego i przy
dowolnie głębokim zapadzie bez odmowy (O-48 pkt 4; ZVRT „w trybie sieci"); AB-3b — protokół części
dynamicznej odbioru (`ModelOdbioru`, stany odbiorów w DAE, kanały, blok ENM rozszerzalny addytywnie) i
tablica wymagań interfejsu silnika (§0 pkt 12); AB-1c — model odbiorów, na którym werdykt FRT w trybie
sieci ma sens.

---

## Stan wyjściowy (pomiar z repozytorium, nie z pamięci)

| Wielkość | Wartość | Skąd |
|----------|---------|------|
| Model odbioru w rdzeniu | wyłącznie stała moc: `OdbiorDynamiki(ident, wezel, p_pu, q_pu)` | `kontrakty.py:189-203` (baza) |
| Prąd i jakobian odbioru | `I = −conj(S)/conj(V)`; jakobian analityczny z `1/|V|²`, `1/|V|⁴` | `siec.py:226-231`, `:234-259` (baza) |
| Miejsca, w których rdzeń czyta odbiory | `siec.wstrzykniecia` `:262-277`, `residuum_algebry` `:280-291`, `jakobian_algebry` `:321-326`, `rozwiaz_algebre` `:383-392`, `residuum_kcl_niezalezne` `:501-503`; `wyspy.sprawdz_zasilanie_wysp` `:125-198`; `zdarzenia.odbiory_po_zdarzeniach` `:312-329`, `StanScenariusza.delty_odbiorow` `:84-90`; `calkowanie.KontekstKroku.odbiory` `:71`, trapez `:449`, RK4 `:603, :646, :671`; `obserwable` `:226, :238, :245, :268-295`; `reinicjalizacja` `:62, :83, :122`; `silnik` `:112, :147-148, :338-340, :458, :475, :693-736`; `tozsamosc.odcisk_migawki` `:100-103`; `walidacja/malosygnalowa.py:76`; `walidacja/rowne_pola.py:99-115` | `grep -n odbior` (baza) |
| Konstruktory `OdbiorDynamiki(` | 11 wywołań: `src/enm/adapter_dynamiki.py:853`, `src/.../dynamika/zdarzenia.py:323`, testy: `walidacja_fizyczna/{bramki.py:485, stanowisko.py:118, test_odpornosc_numeryczna.py:112}`, `network_model/dynamika/{test_obserwable.py:425, :626, :732, :816, uklady.py:182, kwalifikacja_niepewnosci.py:166}` | `grep -rn "OdbiorDynamiki("` |
| Fikstury pośrednie z odbiorem | `uklady.zbuduj_smib_z_odbiorem` używane w `test_siec.py:235`, `test_tozsamosc.py:122`, `test_reinicjalizacja.py:144`, `test_silnik.py:296`, `test_zdarzenia.py:198`; `stanowisko.zbuduj(odbior_p_pu=…)` w `bramki.py:303` (G8) i `test_odpornosc_numeryczna.py:185` | j.w. |
| Kanały odbiorów w wyniku | **zero** — ani moc pobierana, ani tryb; `_kanaly` wystawia węzły, stany i moce URZĄDZEŃ, obserwable węzłów i gałęzi | `silnik.py:572-670` (baza) |
| ENM `Load` | `p_mw`, `q_mvar`, `model: Literal["pq","zip"] = "pq"`, `phases`, katalog, `materialized_params` — **brak** bloku dynamiki, brak U_min | `enm/models.py:496-516` |
| Współczynniki ZIP | w `Load.materialized_params` (a/b/c P i Q, `k_pf`, `k_qf`, opcjonalnie `v0_pu`, `f0_hz`); czyta je rozpływ przez `zip_coeffs_from_materialized_params` (`power_flow_zip.py:303-326`, domyślne `v0 = 1,0`, `f0 = 50,0`, `c = 1`) — funkcja **ignoruje `Load.model`** | `enm/mapping.py:977-987` |
| Agregacja ZIP w rozpływie | JEDEN `ZipCoeffs` na szynę, wagi mocą bazową (`aggregate_zip`, `power_flow_zip.py:329-394`, docstring „this is exact" `:334-336`), jeden czynnik częstotliwościowy na szynę (`apply_zip_frequency` `:280-300`), `v0`/`f0` „first non-None is used" `:336-337, :362-365` | `enm/mapping.py:1050`; FROZEN NR czyta tablicę per indeks węzła (`power_flow_newton_internal.py:835-856, :939-941`) |
| Odmowa ZIP w dynamice | `KOD_ODBIOR_ZIP = "dynamika.odbior_zip_nieobslugiwany"` — predykat **`load.model == "zip"`** | `enm/adapter_dynamiki.py:161`, `:308-320` (baza) |
| Moc odbioru w podziale mocy węzła | `S_urz = S_net + Σ (P0 + jQ0)` — moc BAZOWA odbioru, nie moc charakterystyki w `V_pf` | `adapter_dynamiki.py:892-910` (`_moc_wypadkowa_urzadzen_pu`), `:852-860` (budowa odbiorów) |
| Pisarze `Load` | `add_nn_load` (`domain_operations_v2.py:2585`, `model` wyprowadzony `:2680`), `add_load_sn` (`:6192`, `:6246`), `create_device` (`enm/topology_ops.py:548-576`: `model = data.get("model", "pq")` `:568` NIEZALEŻNIE od ZIP; `p_mw`/`q_mvar` domyślnie 0 `:566-567`), `update_element_parameters` (`enm/domain_operations.py:8863`; kolekcja `loads` poza listą dozwolonych kluczy `:8933` — `model` i `materialized_params` zmieniane niezależnie; kontrola ZIP `:9048-9051`), `catalog_completion._build_default_load` (`enm/catalog_completion.py:748-800`, `model="pq"`) | `grep` |
| Czytelnicy `Load.model` | adapter dynamiki `:308`; `enm/v2_projection.py:406, :491` | `grep -rn "\.model =="` |
| Gotowość `dynamika_rms` | `n_a`, gdy model nie ma wytwórców (`service.py:692-700`) — adapter wykonuje taki bieg (brak warunku na wytwórców w `braki_modelu_dynamiki` `:224-366`); test przypina `n_a` przy obecnych odbiorach (`tests/application/calculation_readiness/test_pr12_readiness.py:600-603`, fikstura z odbiorami `:53`) | `grep` |
| Lustro typów FE | `frontend/src/types/enm.ts:437-450` (`Load`), `:694` (`Generator.dynamika`); pilnuje `scripts/enm_contract_parity_guard.py` | `grep` |
| Straż zera domyślek | `scripts/dynamika_zero_default_guard.py:44-52` skanuje `enm/dynamika_modele.py`, `catalog/der_dynamic/models.py`, `dynamika/kontrakty.py` | odczyt |
| Testy ZIP rozpływu | `tests/test_power_flow_zip.py` 31, `tests/enm/test_zip_wiring.py` 8, `test_zip_generation_split.py` 13, `test_model_zip_odbioru_kontrakt.py` 17 | `grep -c "def test_"` |
| Testy dotknięte | `test_adapter_dynamiki.py` 43 (w tym `test_odbior_zip` `:858-862`, `:977`), `test_dynamika_rms_run.py` 23, `test_obserwable.py` 42, `test_pr12_readiness.py` 42, `test_odpornosc_numeryczna.py` 4 | j.w. |
| Bramka G8 | „granica fail-closed odbioru o stałej mocy" — zamiatanie `x_f` (`bramki.py:271-338`); zmierzona granica `x_f = 0,03 pu` (bieg, min|U| = 0,130 pu) / `0,0222 pu` (`dynamika.krok_niezbiezny`), głębiej `dynamika.reinicjalizacja_niezbiezna` (`bramki.py:290-293`); jest na liście testów D-07 (`manifest.py:155-157`) | odczyt |

**Sondy tej karty** (skrypty i wyjścia w `scratchpad/ab1b3/`, interpreter
`mv-design-pro-backend-D2vgvUMQ-py3.11`, `PYTHONPATH=src:.`):

**S1 — dwa predykaty modelu odbioru (defekt nowy, niewymieniony w planie).** G16 (`build_dynamika_rms_enm`),
odbiory z `Load.model = "pq"` i współczynnikami ZIP w `materialized_params` (`a_p = 0,6, c_p = 0,4,
a_q = 1`) — stan, który zostawiają `create_device`/`update_element_parameters`:

    braki_modelu_dynamiki: []                                    ← żadnej odmowy ZIP
    PF b-odplyw: |V|=1.075451  (bazowo 1.076929)                 ← rozpływ LICZY ZIP
    RDZEN ODMOWA: dynamika.inicjalizacja_niezbiezna ||g|| = 0.002848 (b-odplyw)   ← zła przyczyna w odmowie
    == ZIP tylko na odb-potrzeby (szyna z wytwórcą), model=pq
    moc wytworcy wynikajaca z rozplywu = S_net + S_odb(V) = 0.050000000+0.010000000j
    moc wytworcy przyjeta przez adapter         = 0.049597694+0.009832372j  (roznica 4.358e-04 pu = 0.0436 MVA)
    RDZEN: bieg wykonany bez odmowy; residuum_g = 7.01857061e-09

Na szynie samych odbiorów rozjazd łapie bramka równowagi, ale z przyczyną „punkt pracy nie jest
równowagą"; na szynie z wytwórcą bieg idzie **po cichu** — wytwórca startuje z mocy 0,04960 zamiast 0,05000
pu (0,9 %), a odbiór liczony jest dalej jako stała moc, choć rozpływ liczył go jako ZIP. Zdanie planu i
macierzy „ZIP odrzucany" (`PLAN…:194`, macierz `:55`) jest prawdziwe wyłącznie dla `model == "zip"`.

**S2 — agregacja ZIP na szynie w rozpływie jest niedokładna w trzech przypadkach (defekt nowy).**

    (1) Z+k=2 i P+k=0, V=0.9, f=49.0: suma odbiorow=1.777600  agregat PF=1.773800  roznica=-3.800e-03
    (2) v0 = 1.0/1.05: suma=1.907029 agregat=2.000000 ;  v0 = 1.05/1.0: agregat=1.814059   ← zależne od KOLEJNOŚCI
    (3) Q1=1.0 (Z), Q2=-0.5 (P): agregat dokładny, ale ODRZUCONY przez build_zip_table: "ZIP a_Q must be in [0, 1], got 2.0"
    (3) Q1=1.0 (Z), Q2=-1.0 (P), V=0.9: Q suma odbiorow=-0.190000  Q agregatu=0.000000  ← cicho

Docstring „the polynomial of the sum equals the sum of the polynomials, so this is exact"
(`power_flow_zip.py:334-336`) jest deklaracją bez pokrycia dla: iloczynu wielomianu i czynnika
częstotliwościowego przy `f ≠ f0` i różnych `k`; różnych `v0`/`f0` na jednej szynie; sumy `Q0 = 0` przy
różnych wielomianach. Przypadek (3a) to poprawny model odrzucony surowym angielskim `ValueError`.

**S3 — bramka G8 w chwili pisania karty:** każdy punkt zamiatania kończy się `WYJATEK SUROWY TypeError`
(`ZwarcieWezla.__init__() missing … 'sposob_usuniecia'`) — pomocnik `bramki._zwarcie` jeszcze nie przepisany
przez AB-1b.1a w toku. To jest pomiar ruchomego celu, nie defekt bazy; wartości granicy cytuję z docstringu
G8 (`bramki.py:290-293`) i z W6-A zał. Z3.1 (`:743-747`: SO-1A przy `R_f ≤ 0,1 Ω` —
„re-inicjalizacja algebry nie zbiega").

**S4 — projekt wyroczni D-24 policzony BEZ kodu produktu** (układ wyspowy: maszyna klasyczna `H = 3,5 s`,
`X = X'd + X_L = 0,6`, `|E'| = 1,05`, odbiór `P0 = 0,5`, `Q0 = 0`, `c_p = 1`, `k_pf = 2`, `T_f = 0,1 s`, skok
mocy bazowej `+0,005 pu`):

    psi- = 16.485610 deg; skok dw_hat w chwili zdarzenia = -1.013393e-04 pu (-0.0051 Hz)
    t=  1.0 s: dw=-6.722085e-04  dw_hat=-6.072700e-04
    t= 20.0 s: dw=-4.685883e-03  dw_hat=-4.681867e-03
    stan ustalony zamkniety: dw_inf = -4.950495e-03 pu = -0.247525 Hz; |dw(60)-dw_inf| = 7.552e-07
    wartosci wlasne (postac zamknieta): -0.146476, -9.648382 1/s; tlumienie odbioru D = P0'k = 1.0100 pu; 2H/D = 6.931 s
    predkosc obrotu fazora w stanie ustalonym = -1.5552 rad/s -> pelny obrot co 4.04 s

Wyrocznia jest wykonalna (stan ustalony w postaci zamkniętej, wartości własne w postaci zamkniętej, skok w
chwili zdarzenia z równania skalarnego), a przebieg w 20 s przechodzi przez ±π kilka razy — mutacja
„estymator bez zawijania" (M44) ma na czym paść.

**S5 — ogólna charakterystyka redukuje się BITOWO do dzisiejszej stałej mocy:**

    stala moc przez wzor ogolny: 0 roznic bitowych na 20000 losowych punktow (wartosc i jakobian)
    jakobian ZIP analityczny vs roznica centralna: max |roznica| = 1.1782090858503125e-09

Warunek: moc liczona `P0·w·F` (dla `(0, 0, 1)` i `k = 0` mnożenia przez dokładne `1,0`), prąd i jakobian
bazowy liczone TYM SAMYM wyrażeniem co `siec.prad_odbioru_pu`/`jakobian_pradu_odbioru`, a wkład `dS/d|V|`
dodawany wyłącznie, gdy współczynniki `a`, `b` nie są DOKŁADNIE zerowe (warunek strukturalny, nie
tolerancja). To jest podstawa parytetu L5 (§0 pkt 0).

---

## §0 Rozstrzygnięcia (nienegocjowalne w tej karcie)

Każdy punkt: decyzja → uzasadnienie inżynierskie → gdzie kod dziś jest inaczej. `D/` =
`backend/src/network_model/solvers/dynamika/`, `S/` = `backend/src/`, `T/` = `backend/tests/`.

**0. Parytet L5 zdefiniowany operacyjnie.**
- *Bieg bez nowych mechanizmów* = wszystkie odbiory o charakterystyce stałej mocy (`a = b = 0`, `c = 1`,
  `k_pf = k_qf = 0`) z zadeklarowanym `U_min`, przy którym ŻADNA iteracja Newtona (algebry, kroku, reinicjalizacji,
  punktu skorygowanego obserwabli) nie wchodzi w gałąź impedancyjną. Taki bieg daje przebiegi, zdarzenia
  wykonane, metryki i ślad White Box **bitowo identyczne** z migawką P0 (baza = HEAD po AB-1b.1). Wyjątki
  wyłącznie wyliczone: `odcisk_implementacji`, `odcisk_migawki` (nowe pola odbioru, §0 pkt 8), nowe kanały i
  nowa sekcja śladu `odbiory`.
- Spełnienie warunku „żadna iteracja w gałęzi impedancyjnej" jest MIERZONE licznikiem wejść w gałąź
  (skrypt P0 wykonawcy, poza repo) — nie zakładane.
- Wartości bramek G1–G7, G9–G13 zmierzone w P0 pozostają IDENTYCZNE po każdym pakiecie. G8 jest
  skasowana (pkt 6) — jej dawne wyjście trafia do tabeli przed/po.
- *Biegi z nowym mechanizmem* (G16, G17/SO-1A — odbiory dostają blok z `U_min` i przy zwarciu wchodzą w
  gałąź impedancyjną) — tabela przed/po z przyczyną każdej różnicy, zero „dostrojenia".

**1. JEDEN model odbioru: charakterystyka statyczna z rozpływu × liniowy czynnik częstotliwościowy, z
przejściem składowych nieimpedancyjnych do stałej impedancji poniżej zadeklarowanego `U_min`.**
- Dla `|V| ≥ U_min` (gałąź charakterystyki), `r = |V|/v0`, `f̂ = f_n·(1 + Δω̂)`:

      P(V, f̂) = P0 · F_P(f̂) · [a_P r² + b_P r + c_P] ,   F_P = 1 + k_pf (f̂ − f0)/f0
      Q(V, f̂) = Q0 · F_Q(f̂) · [a_Q r² + b_Q r + c_Q] ,   F_Q = 1 + k_qf (f̂ − f0)/f0
      I_wstrz = −conj(S)/conj(V)

  to są DOKŁADNIE wzory rozpływu (`power_flow_zip.py:9-10` wielomian, `:272-277` czynnik częstotliwościowy).
- Dla `|V| < U_min` (gałąź impedancyjna):

      S(V, f̂) = S(U_min, f̂) · (|V|/U_min)² ,    I_wstrz = −Y_eq(f̂)·V ,   Y_eq = conj(S(U_min, f̂))/U_min²

  bez dzielenia przez `V` — w `V = 0` prąd jest zerem, jakobian skończony (`−Y_eq`).
- **Ciągłość mocy i prądu w `U_min` z konstrukcji** (ta sama `S(U_min, f̂)` po obu stronach); pochodna
  `dS/d|V|` ma skok (załamanie) — to jest cecha modelu, nazwana w `zalozenia`.
- Rozstrzygnięcie gałęzi: JEDEN predykat `w_galezi_impedancyjnej(|V|, U_min) ≔ |V| < U_min` dla wartości,
  jakobianu, kanału `tryb_odbioru@` i sprawdzenia punktu pracy (reguła predykatów parami, CLAUDE.md KLASA
  pkt 3).
- Pola bez znaczenia w danym modelu są `None`, nie liczbą (reguła „zero fantomów"): `v0_pu = None` ⇔
  `a_P = b_P = a_Q = b_Q = 0`; `f0_hz = None` ⇔ `k_pf = k_qf = 0`; `u_min_pu = None` ⇔ `b_P = c_P = b_Q = c_Q = 0`
  (czysta impedancja — przejście nie ma treści); `t_pomiaru_czestotliwosci_s = None` ⇔ `k_pf = k_qf = 0`.
  Walidacja w `__post_init__` kontraktu rdzenia, kod `dynamika.parametry_odbioru_sprzeczne`.
- `P0 ≥ 0` (odbiór pasywny — gałąź impedancyjna ma konduktancję nieujemną); `P0 < 0` → odmowa nazwana
  (pkt 9). `Q0` dowolnego znaku.
- *Dlaczego gałąź impedancyjna dla składowej stałoprądowej też:* dla `b ≠ 0` prąd `b·P0/v0` ma stały moduł i
  kierunek `V/|V|` — w `V = 0` kierunek nie istnieje (0/0). Przejście tylko części stałomocowej zostawiłoby tę
  samą osobliwość w innej składowej (mutacja M42).
- *Dlaczego statyczna funkcja kawałkami, a nie tryb dyskretny przełączany zdarzeniem:* charakterystyka jest
  ciągła, więc rozwiązanie algebraiczne nie ma skoku w chwili przejścia — nie ma czego reinicjalizować; Newton
  z globalizacją Armijo (`siec.py:46-49`, `:416-443`; `calkowanie.py` — ten sam współczynnik) działa na
  funkcji półgładkiej, a błąd lokalny trapezu na załamaniu pozostaje rzędu drugiego w skali biegu. Tryb
  zdarzeniowy wymagałby zdarzeń warunkowych deklarowanych przez element (Z1/Z2 z karty AB-1b.2), których
  AB-1b.1 nie buduje w tej postaci. Ryzyko R2 (§6) ma plan pomiarowy, nie wygładzenie z ε.
- *Gdzie dziś inaczej:* jedyny model to stała moc (`kontrakty.py:189-203`, `siec.py:226-259`); przy głębokim
  zapadzie bieg kończy się kodem NUMERYCZNYM (`krok_niezbiezny`, `reinicjalizacja_niezbiezna` — G8
  `bramki.py:290-293`), a docstring kontraktu zapowiada trzeci kod (`algebra_niezbiezna`,
  `kontrakty.py:193-197`) — trzy różne twierdzenia o tym samym zachowaniu (§5 S2).

**2. Jedno źródło prawdy współczynników ZIP: `zip_coeffs_from_materialized_params` — dla rozpływu,
dynamiki, gotowości i projekcji v2. `Load.model` staje się polem WYPROWADZANYM.**
- Adapter dynamiki buduje charakterystykę z wyniku TEJ funkcji (wartości `v0`, `f0` rozstrzygnięte tak, jak
  rozstrzyga je rozpływ). `None` = stała moc (semantyka udokumentowana w `power_flow_types.py:38-41`), więc
  adapter woła jedną z dwóch funkcji RDZENIA: `charakterystyka_stalej_mocy(...)` albo
  `charakterystyka_z_wielomianu(...)` — reguła „pole nieużywane = `None`" żyje wyłącznie w rdzeniu (adapter
  nie ma własnego predykatu).
- Czytelnicy `Load.model` (adapter `:308`, `v2_projection.py:406, :491`) przechodzą na predykat
  `enm/load_zip_model.py::jest_odbiorem_zip(load)` (= `zip_coeffs_from_materialized_params(...) is not None`).
- Pisarze wyprowadzają `model` z tego samego predykatu: `create_device` (`topology_ops.py:568` — dziś z
  payloadu), `update_element_parameters` dla `loads` (klucz `model` odrzucany w payloadzie, pole
  przeliczane po zmianie `materialized_params`), `add_nn_load`/`add_load_sn` (już wyprowadzają — przepięte
  na wspólną funkcję), `catalog_completion` (stała moc — bez zmian). Migracja istniejących migawek: brak (§7
  pyt. 4 — odcisk) — czytelnicy i tak nie patrzą już na pole.
- *Uzasadnienie:* sonda S1 — dwa predykaty („pole `model`" w dynamice, „obecność współczynników" w
  rozpływie) dają dziś cichy błąd mocy wytwórcy 0,9 % i bieg liczony innym modelem odbioru niż punkt pracy.

**3. Dane dynamiczne odbioru w ENM: `Load.dynamika: ModelDynamicznyOdbioru | None` — wymagane dla
`dynamika_rms`, zero wartości domyślnych, proweniencja obowiązkowa.**
- Klasa w `S/enm/dynamika_modele.py` (plik już skanowany przez `dynamika_zero_default_guard`):
  `proweniencja: ProweniencjaParametrow` (reużycie `:62-74`), `u_min_pu: float | None = Field(gt=0.0, lt=1.0)`
  (bez domyślnej wartości liczbowej; `None` dopuszczalne wyłącznie dla odbioru czysto impedancyjnego),
  `t_pomiaru_czestotliwosci_s: float | None = Field(gt=0.0)` (wymagane ⇔ `k_pf ≠ 0` albo `k_qf ≠ 0`).
  Walidacja KRZYŻOWA (blok × współczynniki z `materialized_params`) nie siedzi w pydantic (dane w dwóch
  obiektach), tylko w JEDNEJ funkcji `wymagane_parametry_odbioru(zip_coeffs) -> WymaganiaOdbioru` rdzenia,
  wołanej przez `braki_modelu_dynamiki` (gotowość i bieg — ten sam predykat).
- Odcisk ENM: `"loads": ("phases", "dynamika")` w `_POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE` (`enm/hash.py:67-70`)
  — migawki bez bloku haszują jak dziś (test w `T/enm/test_hash_pola_addytywne.py`).
- Lustro FE: `frontend/src/types/enm.ts` — `Load.dynamika?: ModelDynamicznyOdbioru | null` +
  interfejs (straż `enm_contract_parity_guard`). Edytor bloku w interfejsie — AB-1c (ten sam edytor co
  `Generator.dynamika`, plan AB-1b.2 P7); do tego czasu ścieżką jest API (`update_element_parameters`), tak
  jak dla wytwórców (§5 S14 karty AB-1b.2).
- **Brak wartości produktowych.** Wartości typowe (`U_min`, `T_f`) z publikowanego źródła są pozycją bramki
  danych §12.1 (nowy wiersz „parametry dynamiczne odbiorów — źródło: wskazane przez właściciela"); do tego
  czasu projektant deklaruje wartości z proweniencją `deklaracja_uzytkownika`. Fikstury testowe (G16, G17,
  stanowisko) deklarują wartości testowe z proweniencją i uzasadnieniem w `odniesienie` (§7 pyt. 3).
- *Gdzie dziś inaczej:* `Load` bez bloku (`enm/models.py:496-516`); `braki_modelu_dynamiki` nie sprawdza
  odbiorów poza `model == "zip"` (`adapter_dynamiki.py:308-320`).

**4. Odbiór czuły częstotliwościowo: estymator częstotliwości odbioru = inercja pierwszego rzędu
częstotliwości szyny (D-03), JEDEN stan, bez zawijania kąta.**
- (a) Stan `kat_pomiaru_rad` (`x`), wejście `e = arg(V·e^{−jx})` (argument w `(−π, π]`, bez różnicowania
  kątów), równania:

      dx/dt = e / T_f ,     Δω̂ = e / (ω_n·T_f) ,     f̂ = f_n·(1 + Δω̂)

  Między zdarzeniami, gdy `|θ − x| < π`, zachodzi DOKŁADNIE `T_f·dΔω̂/dt = Δω_szyny − Δω̂` z
  `Δω_szyny = θ̇/ω_n` — ta sama wielkość, którą publikuje `f_hz@` (W6-A §3, D-03). To nie jest przybliżenie
  małosygnałowe: to tożsamość algebraiczna (wyprowadzenie w docstringu klasy + test).
- (b) `x(0) = arg V_pf` ⇒ `e(0) = 0` ⇒ `Δω̂(0) = 0` ⇒ `f̂(0) = f_n` = częstotliwość studium, którą liczył
  rozpływ (`czestotliwosc_studium_hz` — wspólne źródło, `enm/assembler.py:190-204` i
  `canonical_analysis.py:1799`) ⇒ parytet t = 0 czynnika częstotliwościowego.
- (c) `V = 0` dokładnie (obszar beznapięciowy T3, węzeł narzucony T1): `e ≔ 0`, `∂e/∂V ≔ 0` (wybór jawny —
  0 należy do subróżniczki, ta sama konwencja co `modul_z_zerem` z karty AB-1b.2 §0.5a) ⇒ `x` trzymane. Prąd
  odbioru w `V = 0` jest zerem niezależnie od `Δω̂` (gałąź impedancyjna, pkt 1).
- (d) **Ponowne zasilenie** (węzeł odbioru w `obszary_zasilone_ponownie`, T3): `x ≔ arg V⁺` w reinicjalizacji
  chwili (przypisanie zapisane w `ZdarzenieWykonane.przypisania`, T9). Uzasadnienie: odbiór odcięty nie
  mierzy; bez tej reguły `e⁺ = wrap(θ⁺ − x_sprzed_odcięcia)` dałoby skok `Δω̂` do `π/(ω_n T_f)` z samego faktu,
  że faza po przerwie jest dowolna (mutacja M47). Odłączenie zdarzeniem na żywej szynie (T4) reguły nie
  potrzebuje — estymator śledzi napięcie szyny.
- (e) **Zakres ważności liniowego czynnika częstotliwościowego:** `F_P > 0` i `F_Q > 0` (odbiór nie zmienia
  znaku mocy bazowej) — sprawdzane po KAŻDYM przyjętym kroku i po każdej reinicjalizacji (jak
  `waznosc.sprawdz_zakresy_waznosci`); naruszenie = `dynamika.zakres_waznosci_przekroczony` z adresem
  `<odbior>.czynnik_czestotliwosci_P|Q`, chwilą, wartością. Nie w iteracjach Newtona (iteraty próbne mogą
  chwilowo wyjść).
- (f) *Dlaczego estymator, a nie `f_hz@` wprost:* `f_hz@` jest wyprowadzana z `ẏ` przez zróżniczkowanie
  algebry (`obserwable.py:224-240`); prąd odbioru zależny od `ẏ` robi z `g(x, y) = 0` układ z `ẏ` w algebrze
  (indeks wyższy niż 1) — integrator, reinicjalizacja i obserwable przestałyby obowiązywać. Stała `T_f` jest
  parametrem MODELU ODBIORU (odbiorniki reagują na częstotliwość przez prędkość napędów, nie natychmiast),
  więc dodatkowa wartość własna `−1/T_f` należy do fizyki odbioru — nie łamie zakazu „obserwabla nigdy nie
  zostaje stanem" (`obserwable.py:9-12`), bo opublikowana `f_hz@` pozostaje obserwablą (docstring
  uzupełniony, §5 S10). *Dlaczego nie filtr fazora (`ż = (V − z)/T_f`):* po przerwie beznapięciowej `|z| → 0`
  i estymata `Im((V−z)z*)/|z|²` rośnie jak `1/|z|` — bez górnej granicy; estymator kątowy ma `|Δω̂| ≤ π/(ω_n T_f)`.
- *Gdzie dziś inaczej:* częstotliwość w dynamice nie wpływa na odbiory wcale; `k_pf`/`k_qf` z
  `materialized_params` są czytane wyłącznie przez rozpływ (`power_flow_zip.py:280-300`).

**5. Architektura rdzenia: odbiory są OSOBNĄ rodziną elementów (nie urządzeniami); części stanowe obu
rodzin dzielą JEDEN protokół `ElementStanowy`.**
- `kontrakty.py`: `CharakterystykaOdbioru` (dane, zero domyślek), `OdbiorDynamiki` z polem
  `charakterystyka: CharakterystykaOdbioru` (dane); protokół `ElementStanowy` = część DAE wspólna
  (`ident`, `wezel`, `nazwy_stanow`, `granice_stanow`, `zakresy_waznosci`, `stany_bez_rownowagi`, `pochodne`,
  `jakobian_stan_stan`, `jakobian_stan_napiecie`, `prad_pu`, `jakobian_prad_napiecie`, `jakobian_prad_stan`,
  `parametry_tozsamosci`); `Urzadzenie(ElementStanowy, Protocol)` dokłada elementy źródłowe (`stan_poczatkowy(V,
  moc)`, `napiecie_bez_obciazenia`, `jakobian_napiecia_bez_obciazenia`, `sprzezenie`); `ModelOdbioru
  (ElementStanowy, Protocol)` dokłada `stan_poczatkowy_odbioru(V)`, `moc_poboru_pu(stan, V)`, `tryb(V)`.
- `D/odbiory.py` (nowy, fizyka odbiorów): `OdbiorCharakterystyczny` (implementacja `ModelOdbioru` z danych
  `OdbiorDynamiki`), funkcje `moc_charakterystyki`, prąd, jakobiany analityczne (w tym `∂I/∂x`, `∂ẋ/∂V`),
  `wymagane_parametry_odbioru`, `charakterystyka_stalej_mocy`, `charakterystyka_z_wielomianu`,
  `moc_poboru_w_punkcie_pracy`. Prąd i jakobian bazowy liczone wyrażeniami `siec.prad_odbioru_pu` /
  `jakobian_pradu_odbioru` (przeniesionymi albo importowanymi — jedno miejsce wzoru), wkład `dS/d|V|` dodawany
  tylko przy niezerowych `a`, `b` (S5).
- **Kolejność kanoniczna elementów stanowych: najpierw odbiory (kolejność wejścia), potem urządzenia** —
  dokładnie ta kolejność, w której `siec.wstrzykniecia` (`:271-276`), `jakobian_algebry` (`:321-329`) i
  `residuum_kcl_niezalezne` (`:501-506`) sumują dziś wkłady; suma zmiennoprzecinkowa w węźle i kolejność
  wpisów COO są więc bitowo te same. Krotka `stany` jest wyrównana z `elementy = (*odbiory, *urzadzenia)`;
  odbiory stałej mocy mają stan pusty — `spakuj_stany` daje wektor identyczny z dzisiejszym. Pętle stanowe
  pomijają elementy o wymiarze 0 (warunek strukturalny).
- Źródłowe miejsca pracują WYŁĄCZNIE na urządzeniach (`KontekstKroku.urzadzenia` i jawne
  `stany_urzadzen(stany)`): podział i klasyfikacja wysp (`wyspy.urzadzenie_wnosi_do_algebry`,
  `klasyfikuj_wyspy` z AB-1b.1), `_stany_poczatkowe` z `PunktPracy.moce_zrodel_pu`, `OdlaczenieZrodla`,
  kanały `p_pu@`/`q_pu@` urządzeń.
- *Dlaczego nie „odbiór jako urządzenie":* odbiór czuły częstotliwościowo ma niezerowy prąd i `dI/dV`, więc
  predykat „wnosi do algebry" (`wyspy.py:110-122`) uznałby wyspę samych odbiorów za zasilaną — obszar
  beznapięciowy AB-1b.1 i siatka G13 przestałyby działać; ponadto `moce_zrodel_pu`, `OdlaczenieZrodla`,
  `odbiory_aktywne`, `odbiory_odciete`, podział mocy węzła w adapterze wymagałyby dyskryminatora roli w
  każdym z tych miejsc. Osobna rodzina + wspólny protokół części DAE = zero rozgałęzień roli.
- *Dlaczego protokół teraz, a nie w AB-3b:* odbiór czuły częstotliwościowo JEST pierwszym odbiorem ze
  stanem; silnik (AB-3b) wchodzi tym samym torem bez zmian w integratorze.

**6. Kasacja dwóch odmów i jednej bramki; nowe kody nazwane.**
- Kasowane: `dynamika.odbior_stalej_mocy_przy_zerowym_napieciu` (T2 — rdzeń; `KODY_ODMOW`, miejsce
  podniesienia, test „odmowa" → test „bieg, `I_odb = 0` dokładnie"); `dynamika.odbior_zip_nieobslugiwany`
  (`KOD_ODBIOR_ZIP`, adapter `:161`, `:308-320`, rejestr `:172-189`; test `T/enm/test_adapter_dynamiki.py:858-862,
  :977`).
- **Bramka G8 skasowana** (nie „przepisana, żeby przechodziła"): jej twierdzenie („odbiór stałej mocy ma
  granicę fail-closed przy głębokim zapadzie") opisuje model, którego już nie ma. Zachowanie przy dowolnie
  głębokim zapadzie przejmuje bramka G23 (część b), a fail-closed dla wyspy bez źródła — G13 bez zmian. D-07:
  `test_g8_granica_odmowy` znika z `testy` (`manifest.py:155-157`), `rownanie`/`wyrocznia`/`zakres_waznosci`
  przepisane: w gałęzi charakterystyki residuum dla `Ybus = 0` nadal wynosi `|S|/|V|` i Newton startujący z
  `|V| ≥ U_min` nadal ucieka do `|V| → ∞` — siatka algebry (`sprawdz_zasilanie_wysp`, G13, M19) jest nadal
  potrzebna; fizyczne rozwiązanie takiej wyspy (`V = 0`) daje rdzeń WCZEŚNIEJ, jako obszar beznapięciowy
  (D-16). D-07 pozostaje L5 (G13, `test_odpornosc_numeryczna.py`, M18/M19).
- Nowe kody rdzenia (`KODY_ODMOW`): `dynamika.parametry_odbioru_sprzeczne` (fantom albo brak pola względem
  współczynników; `P0 < 0`), `dynamika.odbior_ponizej_napiecia_przejscia` (`|V_pf| < U_min` w punkcie pracy —
  rozpływ liczył model bez przejścia, więc punkt pracy nie jest równowagą modelu dynamicznego; odmowa
  PRZED bramką równowagi, z węzłem, `|V_pf|`, `U_min`). Nowe kody adaptera (`KODY_ODMOW_ADAPTERA`):
  `dynamika.odbior_bez_bloku_dynamiki`, `dynamika.odbior_parametry_dynamiczne_niespojne` (komunikat PL z listą
  pól wymaganych/zbędnych — ten sam predykat `wymagane_parametry_odbioru`). `zakres_waznosci_przekroczony`
  (istniejący) dla `F ≤ 0` (pkt 4e).
- `ZALOZENIA_RDZENIA` (`silnik.py:877-878`, baza): zdanie „Odbiory o stałej mocy — … odmowa nazwana"
  zastąpione opisem modelu (pkt 1, 4) i założeniem „odbiory jednofazowe (`Load.phases`) wchodzą jako
  symetryczne — jak w rozpływie symetrycznym; niesymetria — fala W6-K".

**7. Parytet rozpływ ↔ dynamika w t = 0 i podział mocy węzła — fizyka w rdzeniu, adapter składa.**
- `_moc_wypadkowa_urzadzen_pu` (`adapter_dynamiki.py:892-910`) i `_moce_urzadzen_pu` (`:913-982`) biorą moc
  odbioru z `odbiory.moc_poboru_w_punkcie_pracy(odbior, V_pf, f_n)` (funkcja rdzenia), nie `P0 + jQ0`. Dla
  stałej mocy wynik jest bitowo ten sam (S5) — podział mocy węzła i stan początkowy urządzeń bez zmian.
- Sprawdzenie `|V_pf| ≥ U_min` każdego odbioru — w rdzeniu (`silnik._stany_poczatkowe` albo osobna funkcja
  przed bramką równowagi), kod pkt 6.
- *Wyrocznia (D-22):* FROZEN rozpływ (NR) i jego własna implementacja wielomianu (`power_flow_zip`) — inna
  droga liczenia niż `D/odbiory.py`.

**8. Kanały, ślad, tożsamość, kontrakt wyniku.**

| Klucz | Przestrzeń | Jednostka | Definicja |
|-------|------------|-----------|-----------|
| `p_pobor_pu@<odbior>`, `q_pobor_pu@<odbior>` | obserwabla | pu (baza układu) | moc POBIERANA (konwencja poboru) z modelu odbioru; `0,0` przy `tryb ∈ {2, 3}` (fakt — brak prądu) |
| `tryb_odbioru@<odbior>` | obserwabla | kod | `0` charakterystyka (`|V| ≥ U_min`, także odbiór czysto impedancyjny), `1` stała impedancja (`|V| < U_min`), `2` odłączony zdarzeniem (T4), `3` odcięty — obszar beznapięciowy (T3); słownik `OPIS_TRYBU_ODBIORU_PL` przypięty testem zamkniętego zbioru |
| `f_odbioru_hz@<odbior>` (tylko `k ≠ 0`) | obserwabla | Hz | `f_n·(1 + Δω̂)` z estymatora (pkt 4) — częstotliwość WIDZIANA PRZEZ ODBIÓR (inercja `T_f`), nigdy zamiennik `f_hz@` szyny; `None` ⇔ `tryb ∈ {2, 3}`; w próbkach `L`/`P` wartość określona (to funkcja stanu i napięcia, nie pochodna) |
| `kat_pomiaru_rad@<odbior>` (tylko `k ≠ 0`) | **odbior** (nowa wartość `PrzestrzenKanalu`) | rad | stan estymatora |

- Nazwy z przedrostkiem `p_pobor_`/`q_pobor_` (nie `p_pu@`), bo `ref_id` odbioru i urządzenia nie są
  rozłączne z konstrukcji, a znak konwencji jest inny niż „moc oddawana" urządzeń.
- Ślad White Box: sekcja `odbiory` (dla każdego: charakterystyka, `U_min`, `T_f`, `S(V_pf)`, tryb w t = 0);
  `zalozenia_wejscia` adaptera dostaje wiersz proweniencji bloku każdego odbioru (wzorzec wytwórców
  `adapter_dynamiki.py:1157-1181`).
- `odcisk_migawki`: odbiory przez `parametry_tozsamosci()` modelu (T7) — test „każde pole
  `CharakterystykaOdbioru` jest w odcisku" (KLASA pkt 4). Dziś odcisk zna tylko `p`, `q` (`tozsamosc.py:100-103`)
  — dwa biegi różniące się ZIP albo `U_min` miałyby tę samą piątkę odcisków.
- Kontrakt `resultset_dynamic_v2` (AB-1b.1): nowe kanały i wartość przestrzeni `"odbior"` addytywnie; reguła
  testu „`None` wyłącznie z kodem niedostępności" rozszerzona o parę `f_odbioru_hz@` ↔ `tryb_odbioru@`.

**9. Skok obciążenia zmienia MOC BAZOWĄ (P0, Q0) — charakterystyka przeskalowana, nie doklejona stała moc.**
- `odbiory_po_zdarzeniach` (`zdarzenia.py:312-329`) buduje odbiór z `P0 + ΔP0`, `Q0 + ΔQ0` i TĄ SAMĄ
  charakterystyką; `Y_eq` przeliczane z nowej bazy. Dla stałej mocy — bitowo jak dziś.
- `P0 + ΔP0 < 0` po skoku → `dynamika.parametry_odbioru_sprzeczne` w chwili zdarzenia (odbiór stałby się
  wytwórcą — to jest `Generator`, nie odbiór).
- Docstring kontraktu danych `SkokObciazenia` (`enm/scenariusze.py:227-228`) i kontraktu rdzenia
  (`kontrakty.py:260-262`): „zmiana mocy bazowej odbioru (przy napięciu i częstotliwości odniesienia
  charakterystyki)"; zdanie „odbioru/źródła" poprawia już AB-1b.1 (S18 tamtej karty).

**10. Rozpływ: agregacja ZIP na szynie — reprezentowalność sprawdzana, nie zakładana; odniesienie `f0`
= częstotliwość studium.**
- Funkcja `enm/load_zip_model.py::reprezentowalnosc_zip_szyny(odbiory_szyny, f_studium_hz)` (czysta, jedna)
  rozstrzyga, czy suma odbiorów szyny jest DOKŁADNIE postacią `P_tot·F̄(f)·w̄(V)` z wagami mocy bazowej:
  wymaga równych `v0` i `f0` na szynie; przy `f_studium ≠ f0` — `Σ P0_i (F_i − F̄)·(a_i, b_i, c_i) = 0`
  (i analogicznie Q); przy `Σ Q0 = 0` — jednakowych wielomianów Q. Wołają ją: ścieżka rozpływu w assemblerze
  (`enm/assembler.py`, `OdmowaWejsciaRozplywu` z kodem `load.zip_agregat_niereprezentowalny`, komunikat PL z
  szyną, odbiorami i zmierzoną rozbieżnością) oraz gotowość rozpływu (ten sam predykat). Mapowanie grafu
  (`enm/mapping.py`) NIE odmawia (graf służy też zwarciom — `power_flow_zip.py:345-355`).
- `f0` nieobecne w `materialized_params` = częstotliwość studium (`czestotliwosc_studium_hz`), nie literał
  50 Hz (`power_flow_zip.py:321`, `load_zip_model.py:74`): odbiór deklaruje `P0` przy częstotliwości znamionowej
  SWOJEJ sieci. Dziś projekt 60 Hz z `k ≠ 0` ma w rozpływie `F = 1 + 0,2·k` przy częstotliwości znamionowej.
- Docstring `aggregate_zip` przepisany do warunku reprezentowalności (deklaracja bez pokrycia, S2).
- Poza tą kartą, z powodem: DOKŁADNA reprezentacja wielu odbiorów ZIP na szynie (PQSpec per odbiór) i
  przyjęcie agregatu o udziałach poza `[0, 1]` (S2 (3a)) zmieniają zachowanie FROZEN NR
  (`power_flow_newton_internal.py:835-856` czyta jedną tablicę per indeks węzła) → pozycja B-01 (d) w §12.2
  planu, zgłaszana właścicielowi razem z (a)–(c) (§7 pyt. 5). Do czasu decyzji: odmowa nazwana, nigdy cichy
  wynik.

**11. Gotowość ↔ bieg: jeden predykat, także dla „braku wytwórców".**
- `_check_dynamika_rms` (`service.py:670-720`): `n_a` wyłącznie, gdy model nie ma ani wytwórców, ani odbiorów
  (dziś: brak wytwórców ⇒ `n_a`, choć adapter wykonuje bieg sieci ze źródłem i odbiorami); tekst
  `recommended_action_pl` (`:709-713`) wymienia blok `Load.dynamika` zamiast „odbiory o stałej mocy". Test
  `test_pr12_readiness.py:600-603` przepisany z intencją („`n_a` = brak elementów dynamicznych") — §7 pyt. 7.
- Kanoniczny kod gotowości per odbiór (odpowiednik `der.dynamika_missing`) NIE powstaje: raport
  `dynamika_rms` niesie braki `braki_modelu_dynamiki` (tak jak dla wytwórców w tym typie), a nawigacja do
  edytora bloku bez edytora byłaby martwym klikiem (edytor — AB-1c) — §7 pyt. 11.

**12. Kontrakt rodziny silnika indukcyjnego (implementacja AB-3b) = protokół + blok ENM rozszerzalny +
tablica wymagań; bez klasy parametrów silnika.**
- Dostarczane teraz: `ModelOdbioru`/`ElementStanowy` (pkt 5), stany odbiorów w DAE (integrator, reinicjalizacja,
  obserwable, bramka równowagi, zakresy ważności, tożsamość), kanały per odbiór (pkt 8), blok ENM
  `ModelDynamicznyOdbioru` rozszerzalny addytywnie, predykat `wymagane_parametry_odbioru` jako jedyne miejsce
  reguł kompletności.
- Tablica wymagań interfejsu dla AB-3b (do zapisania w §5 planu, wiersz AB-3b):

  | Id | Wymaganie | Uwagi |
  |----|-----------|-------|
  | S1 | stan początkowy części silnikowej z UDZIAŁU mocy odbioru w `V_pf` (poślizg z równania momentu), część statyczna = reszta | reguła dla nadwyżki/niedoboru Q (kompensacja albo reszta w części statycznej) — decyzja AB-3b |
  | S2 | `prad_pu`, jakobiany analityczne, `nazwy_stanow` z sufiksami jednostek (`jednostka_stanu`) | test różnicy skończonej jak dla odbioru czułego f |
  | S3 | utyk (s → 1) jest fizyką, nie zakresem ważności; zakres ważności — tylko tam, gdzie model nie ma równań | kontrakt `Urzadzenie.zakresy_waznosci` (`kontrakty.py:424-460`) |
  | S4 | stycznik/zanik napięcia jako tryb dyskretny | wymaga zdarzeń warunkowych elementu (Z1/Z2 AB-1b.2) — AB-3b korzysta, nie buduje |
  | S5 | pole `silnik` w `ModelDynamicznyOdbioru` addytywnie; `wymagane_parametry_odbioru` rozszerzone | odcisk ENM: pole w bloku już objętym regułą addytywności |
  | S6 | kanały poślizgu i momentu przez stany; `tryb_odbioru@` rozszerzany wyłącznie o kody z mechanizmem | zero kodów zarezerwowanych na zapas |

- **„Odbiór złożony"** w rozumieniu literatury i PowerFactory („complex load") = część statyczna + część
  silnikowa; w tej karcie część statyczna jest kompletna (ZIP × F(f) × PQ→Z), a „złożony" bez silnika nie ma
  treści poza ZIP. Wiersz DoD „złożony" domyka AB-3b razem z silnikiem (§5 S6, §7 pyt. 1).

**13. Numeracja dowodów.** Twierdzenia **D-22…D-25**, bramki **G22–G25** (w tekstach zawsze „bramka G22", bo
„G16/G17" to sieci wzorcowe), mutacje **M38–M51**. AB-1b.2 (karta z M22–M36, kolizja z AB-1b.1) przenumerowuje
swoje mutacje na M52+ (§5 S5).

**14. Granica zakresu (świadomie poza kartą, każda pozycja przypisana):** silnik indukcyjny, utyk, ponowny
rozruch, udział silnikowy — AB-3b (O-22); odbiór niesymetryczny w czasie — W6-K; przejście trybu przez
zdarzenie zlokalizowane — tylko jeśli R2 wykaże potrzebę (decyzja architekta strategicznego z pomiarem); dokładny agregat ZIP w
FROZEN NR — B-01 (d); redukcja Krona odbioru czysto impedancyjnego w wyroczni równych pól
(`walidacja/rowne_pola.py:99-115` odmawia KAŻDEGO odbioru) — AB-5b (Φ/CCT, jedyny konsument); w tej karcie
wyłącznie komunikat tej odmowy przepisany z „stałej mocy" na „charakterystyki innej niż stała impedancja".

---

## §1 Inwentarz klasy (wszystkie miejsca dzielące mechanizm)

Ścieżki: `D/`, `S/`, `T/` jak wyżej; `F/` = `frontend/src/`. Linie — stan bazowy R10 (uwaga w nagłówku).

| # | Mechanizm | Miejsca |
|---|-----------|---------|
| 1 | Kontrakt danych odbioru w rdzeniu | `D/kontrakty.py:20` (docstring modułu „odbiory o stałej mocy"), `:189-203` (`OdbiorDynamiki` + docstring `:190-197`), `:260-267` (`SkokObciazenia`), `:542` (`WejscieDynamiki.odbiory`), `:103-120` (`KODY_ODMOW`; w toku AB-1b.1: `KOD_ODBIOR_STALEJ_MOCY_PRZY_ZEROWYM_NAPIECIU`), protokół `Urzadzenie` `:368-525` (podział na `ElementStanowy`); `D/__init__.py:33, :70` (eksport) |
| 2 | Fizyka odbioru w algebrze | `D/siec.py:1-22` (docstring: „residuum odbioru o stałej mocy zależy od `conj(V)`"), `:226-231`, `:234-259`, `:262-277`, `:280-291`, `:294-338` (`:321-326`), `:351-456` (`:383-392`), `:459-508` (`:501-503`); `D/wyspy.py:1-49` (docstring: „odbiór o stałej mocy ŻĄDA mocy"), `:125-198` (zapotrzebowanie `:146-154`; komunikat `:190-191`) |
| 3 | Stany i integrator | `D/calkowanie.py:66-141` (`KontekstKroku`: `wymiary_stanow`, `adresy_stanow`, `granice_stanow`, `zakresy_waznosci`), `:144-162` (pakowanie), `:165-178` (`pochodne_ukladu`), `:214-232` (`_najwieksze_residua` — adresy), `:235-312` (`_jakobian_sprzezony`, pętla `:264`), trapez `:387-575` (`:449-450`), RK4 `:576-688` (`_algebra` `:594-612`, `:646-647`, `:671-672`), `:689-…` (`blad_lokalny`); `D/waznosc.py:45` (`sprawdz_zakresy_waznosci`); `D/walidacja/malosygnalowa.py:46-80` (macierz stanu z `kontekst.urzadzenia` `:61`) |
| 4 | Silnik: inicjalizacja, bramka równowagi, zdarzenia, próbkowanie | `D/silnik.py:105-118` (`_Chwila.odbiory`), `:130-296` (`:147-148`, `:171`, `:250`), `:298-319` (`_stany_poczatkowe` — tylko urządzenia), `:321-331`, `:332-405` (bramka; maska stanów `:342-352` po urządzeniach; residuum `:338-340`), `:440-529` (`_nanies_chwile`: `odbiory_po_zdarzeniach` `:458`, `:475`; `UrzadzenieOdlaczone` `:476-484`), `:572-670` (`_kanaly` — stany i moce urządzeń `:590-620`), `:687-711` (`_probkuj`), `:713-762` (`_probkuj_obserwable`), `:875-882` (`ZALOZENIA_RDZENIA`, zdanie `:877-878`), `:885-900` (`jednostka_stanu`) |
| 5 | Zdarzenia na odbiorach | `D/zdarzenia.py:60-90` (`WpisHarmonogramu.delta_mocy_pu`, `StanScenariusza.delty_odbiorow`), `:103-243` (walidacja refów odbiorów `:121`, `:228-238`), `:246-309` (`zastosuj` — skok `:293-309`), `:312-329` (`odbiory_po_zdarzeniach`); AB-1b.1: `odbiory_aktywne`, `ZmianaOdbioru`, `odbiory_odciete` (T3, T4) |
| 6 | Obserwable z udziałem odbiorów | `D/obserwable.py:52-53`, `:97-98` (docstring „odbiór o stałej mocy"), `:179-198` (`_prawa_strona_dae` — tylko urządzenia; docstring `:187-188`), `:224-240`, `:243-311` (`:262-265` docstring), `:399-429` |
| 7 | Reinicjalizacja | `D/reinicjalizacja.py:60-127` (`:62`, `:83`, `:122`; `delta_x_max` po krotce stanów `:109-116`) |
| 8 | Tożsamość | `D/tozsamosc.py:75-109` (odbiory `:100-103`), `:202-213` (`zbuduj_tozsamosc` → `odcisk_migawki(model, wejscie.odbiory, urzadzenia)`) |
| 9 | Adapter ENM → rdzeń | `S/enm/adapter_dynamiki.py:1-57` (docstring „PODZIAŁ MOCY WĘZŁA"), `:161`, `:172-189`, `:224-366` (`braki_modelu_dynamiki`, ZIP `:308-320`), `:374-392`, `:598-668` (skok `:640-656`), `:731-863` (odbiory `:852-860`), `:892-910`, `:913-982`, `:988-1081` (szyna sztywna `:1042`), `:1105-1154`, `:1157-1181` (`zalozenia_wejscia`) |
| 10 | Kontrakt danych scenariusza | `S/enm/scenariusze.py:226-236` (`SkokObciazenia`), AB-1b.1 `odlaczenie_odbioru`/`zalaczenie_odbioru` |
| 11 | ENM `Load` i blok dynamiki | `S/enm/models.py:496-516`; `S/enm/dynamika_modele.py:1-60` (docstring), `:62-74` (proweniencja); `S/enm/hash.py:59-89` (`"loads": ("phases",)` `:67-70`); `F/types/enm.ts:437-450`, `:694`; `scripts/enm_contract_parity_guard.py:70-…`; `scripts/dynamika_zero_default_guard.py:44-52` |
| 12 | Jedno źródło współczynników ZIP | `S/network_model/solvers/power_flow_zip.py:303-326` (`zip_coeffs_from_materialized_params`), `:50-76` (`ZipCoeffs` — domyślne `v0 = 1,0`, `f0 = 50,0`), `:79-92` (`validate_zip_coeffs`); `S/enm/load_zip_model.py:36-74` (klucze i domyślne), `:107-160`, `:163-177`; `S/enm/mapping.py:977-987`, `:1050-1111`; `S/enm/assembler.py:81` (import), `:752-760` (`zip_coeffs`, `zip_base_*`), `:841` (`czestotliwosc_studium_hz`), `:190-204`; `S/network_model/core/node.py:72-78` |
| 13 | Agregacja ZIP (rozpływ) | `power_flow_zip.py:106-151` (`declares_zip_split`, `build_zip_table` z walidacją zakresu agregatu `:149`), `:154-211`, `:241-269`, `:280-300` (`apply_zip_frequency`), `:329-394` (`aggregate_zip`); konsumenci FROZEN `power_flow_newton.py:26, :151, :162`, `power_flow_fast_decoupled.py:259, :273`, `power_flow_gauss_seidel.py:237, :251`, `power_flow_newton_internal.py:25-29, :128-160, :200-256, :835-856, :921-941, :1015-1023`; `power_flow_inverter.py:208-220`; `S/enm/assembler.py` (ścieżka PF — miejsce odmowy), `S/application/calculation_readiness/service.py` (`_check_power_flow` — para) |
| 14 | Pisarze `Load` (model/ZIP/P/Q) | `S/enm/domain_operations_v2.py:2585-2700` (`add_nn_load`, `model` `:2680`), `:6192-6260` (`add_load_sn`, `:6246`), `S/enm/topology_ops.py:548-576` (`create_device`: `:566-568`), `S/enm/domain_operations.py:8863-9060` (`update_element_parameters`; `loads` poza listą dozwolonych `:8933`; ZIP `:9048-9051`), `S/enm/catalog_completion.py:748-800` |
| 15 | Czytelnicy `Load.model` | `S/enm/adapter_dynamiki.py:308`; `S/enm/v2_projection.py:406`, `:491` |
| 16 | Gotowość | `S/application/calculation_readiness/service.py:670-720` (`n_a` `:692-700`, `recommended_action_pl` `:709-713`); `T/application/calculation_readiness/test_pr12_readiness.py:53` (fikstura z odbiorami), `:585-720` (6 testów `dynamika_rms`) |
| 17 | Kontrakt wyniku / utrwalenie | `S/application/contracts/resultset_dynamic_v1.py:44` (`PrzestrzenKanalu`) → v2 z AB-1b.1; `D/wynik.py:27-36` (`KanalWyniku.przestrzen: str`) |
| 18 | Wzorce i fikstury z odbiorami | `T/walidacja_fizyczna/stanowisko.py:54, :114-120`; `T/walidacja_fizyczna/bramki.py:271-338` (G8), `:460-530` (G13, odbiór `:485`); `T/walidacja_fizyczna/test_odpornosc_numeryczna.py:106-120` (`_wyspa_bez_zrodla`), `:184-196` („głęboki zapad z odbiorem o stałej mocy"); `T/network_model/dynamika/uklady.py:160-200` (`zbuduj_smib_z_odbiorem`, `:182`), `kwalifikacja_niepewnosci.py:160-170`, `test_obserwable.py:401-470` (F-2 wyspa z odbiorem), `:597-760` (granica obciążalności, `:626`, `:732`), `:816`; `T/network_model/dynamika/{test_siec.py:235, test_tozsamosc.py:122, test_reinicjalizacja.py:144, test_silnik.py:296, test_zdarzenia.py:198}`; `T/golden/enm_builders/dynamika_rms.py:282-307` (`odb-odplyw`, `odb-potrzeby`); `T/golden/enm_builders/so1a_pv_magazyn.py:321-346` (`odb-gpz`, `odb-stacja`); `T/test_dynamika_rms_run.py:107`; `T/e2e/test_so1a_scenariusz_odniesienia.py:62-78` (komentarz R_f „MUSI być niezerowe"), `:90-106`; `T/golden/registry.py:438-470` (G17 niezmienniki) |
| 19 | Manifest, bramki, mutacje, CI | `T/walidacja_fizyczna/manifest.py:142-167` (D-07), `bramki.py:24-79` (`PROGI`, G8 `:51-53`), `:533-545` (`BRAMKI`), `mutacje.py:60-183` (wpis M18 — opis detektora „granica nieosiągalna z poziomu biegu"), `test_mutacje.py`, `uruchom.py`, `README.md`; `.github/workflows/python-tests.yml:345-401` (`mutacje-dynamiki`, 45 min) |
| 20 | Dokumenty stanu | plan §3a #22 (`:194` „ZIP odrzucany"), §5 wiersze AB-1b.3/AB-3b (`:345`, `:351`), §7, §12.1, §12.2; macierz #22 (`:55`); FREEZE C6 (`:141`, `:201`), OD-37 (`:338`); W6-A Z3.1 (`:743-747` — cytat złego kodu); `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md:209` („trzy drogi zapisu"); `docs/audit/CURRENT_DYNAMIC_CAPABILITY_MATRIX.md:164-165`; `S/solver_input/provenance.py:339-354` (uzasadnienie `dynamika_rms`) |

**Miejsca świadomie bez zmian (z powodem merytorycznym):** `D/wyspy.py:110-122` (predykat „wnosi do
algebry" — dotyczy urządzeń; odbiory nie zasilają wyspy z definicji); G13 i M19 (siatka algebry, §0 pkt 6);
`walidacja/rowne_pola.py` poza komunikatem (§0 pkt 14); FROZEN NR/GS/FD (wyrocznia).

---

## §2 Pakiety pracy (kolejność; każdy z własną bramką)

**Bramka wspólna parytetu (BW)** — po KAŻDYM pakiecie P1–P7, wyjścia wklejane do meldunku, kody wyjścia
łapane bezpośrednio (nigdy `cmd | tail; echo $?`): (a) skrypt porównania z migawką P0 — zero różnic poza
wyliczonymi (§0 pkt 0) oraz licznik wejść w gałąź impedancyjną = 0 dla biegów parytetowych; (b)
`poetry run pytest tests/walidacja_fizyczna -m "not andes" -q` zielone, G1–G7 i G9–G13 z wartościami
IDENTYCZNYMI z P0; (c) pełny harness `poetry run python -m tests.walidacja_fizyczna.mutacje` — każda mutacja
ZABITA albo (M21) NIEWAŻNA; (d) pełna regresja backendu `poetry run pytest -q -m "not pandapower and not andes"`
bez nowych czerwieni wobec bazy P0; (e) `python scripts/guardy_z_ci.py` (w tym
`dynamika_granica_importow_guard`, `dynamika_zero_default_guard`, `backend_no_physics_guard`,
`enm_contract_parity_guard`, `solver_diff_guard` — FROZEN nietknięte, `pcc_zero_guard`, `no_codenames_guard`),
black/ruff, zapadka mypy; (f) determinizm: dwa biegi w procesie + trzy ziarna `PYTHONHASHSEED` w osobnych
procesach — identyczny ładunek poza zegarem; (g) od P4: `npm run type-check` i `npm run lint` we FE (lustro
typów).

**P0 — migawka bazowa i testy padające (zero zmian produkcyjnych).**
Skrypt w scratchpadzie wykonawcy (poza repo): na HEAD po AB-1b.1 zapisuje JSON — `bramki.zmierz()` (wszystkie
pomiary), pełne ładunki (bez `czas_obliczen_s`) biegów stanowiska SMIB z odbiorem (`stanowisko.zbuduj(odbior_p_pu=0,4)`
bez zwarcia i ze zwarciem `x_f = 0,5 pu`), biegów `uklady.zbuduj_smib_z_odbiorem` z testów §1 wiersz 18,
przypadków `kwalifikacja_niepewnosci`, G16 przez adapter (`SCENARIUSZ` z `test_adapter_dynamiki.py:79-100`),
SO-1A na G17 (scenariusz po AB-1b.1); oraz — dla każdego z tych biegów — `min |V|` KAŻDEGO iteratu Newtona na
węzłach z odbiorem (instrumentacja w skrypcie przez podmianę funkcji w pamięci, nie w repo). Te minima
wyznaczają, które biegi mogą być parytetowe przy jakim `U_min` testowym, a które przejdą do tabeli przed/po.
Czasy biegów i harnessu. Następnie testy padające na STARYM zachowaniu (piszesz je pierwsze):
T0-1 S1 (`model = "pq"` + ZIP → moc wytwórcy = `S_net + S_ZIP(V_pf)` ≤ 1e-12, brak odmowy); T0-2 `model =
"zip"` → bieg; T0-3 zwarcie metaliczne w węźle odbioru → bieg, `I_odb = 0,0`; T0-4 zamiatanie głębokości G8 →
same biegi; T0-5 odbiór bez bloku → `dynamika.odbior_bez_bloku_dynamiki`; T0-6 kanały `p_pobor_pu@`,
`tryb_odbioru@`; T0-7 wyspa z odbiorem `k ≠ 0` → samoregulacja wg S4; T0-8 przypadki S2 → odmowa nazwana /
wynik dokładny; T0-9 studium 60 Hz, `k ≠ 0`, brak `f0` → `F = 1`; T0-10 gotowość bez wytwórców z odbiorami ≠
`n_a`; T0-11 `create_device` odbioru bez `p_mw`/`q_mvar` → odmowa (dziś 0 — fabrykacja, `topology_ops.py:566-567`);
T0-12 odcisk migawki rozróżnia odbiory różniące się wyłącznie ZIP/`U_min`; T0-13 odbiór czysto impedancyjny ≡
odsprzęg; T0-14 skok obciążenia na odbiorze ZIP skaluje bazę. Baza czerwona pełnej regresji zmierzona i
zapisana (worktree współdzielony z AB-1a i AB-H0). Bramka: plik migawki + lista testów czerwonych z powodem.

**P1 — kontrakt rdzenia i protokoły (bez zmiany zachowania).**
`CharakterystykaOdbioru` (zero domyślek; walidacja fantomów i `P0 ≥ 0` w `__post_init__`), `OdbiorDynamiki.
charakterystyka`, `ElementStanowy`, `Urzadzenie(ElementStanowy)`, `ModelOdbioru(ElementStanowy)`, nowe kody
(pkt 6), `wymagane_parametry_odbioru`, `charakterystyka_stalej_mocy`, `charakterystyka_z_wielomianu`.
Aktualizacja mechaniczna 11 konstruktorów `OdbiorDynamiki(` (charakterystyka stałej mocy + `U_min` testowe z
P0, z komentarzem „dana testu — poniżej wszystkich iteratów, pomiar P0") i fikstur pośrednich. Testy (~14):
iloczyn pól × {fantom, brak, poprawne} (`v0`, `f0`, `u_min`, `t_f` względem `a/b/c/k`), `P0 < 0`, brak
jakiejkolwiek domyślki liczbowej (wzorzec `test_kontrakty.py:81`), rejestr kodów zamknięty. Bramka: BW
(trajektorie bitowo, odcisk migawki zmieniony zgodnie z listą).

**P2 — fizyka charakterystyki i przejście PQ→Z w algebrze (odbiory bez stanów).**
`D/odbiory.py` (charakterystyka, gałąź impedancyjna, prąd, jakobian, `moc_poboru`), `siec.py` (delegacja do
modelu, jeden wzór), `wyspy.py` (docstring/komunikat, predykat bez zmian), `zdarzenia.odbiory_po_zdarzeniach`
(pkt 9), `silnik` (kanały `p_pobor_pu@`, `q_pobor_pu@`, `tryb_odbioru@`, sekcja śladu, `ZALOZENIA_RDZENIA`,
sprawdzenie `|V_pf| ≥ U_min`), kasacja T2 i G8, D-07 przepisany, AB-1b.1: „moc sprzed odcięcia" i
`tryb_odbioru = 3` ⇔ `stan_zasilania = 0`. Testy (~24) — iloczyn cech: kształt charakterystyki {stała moc,
czysty Z, czysty I, mieszany ZIP} × {P, Q} × położenie {`|V|` ≫ `U_min`, tuż nad, dokładnie `U_min`, tuż pod,
0 (metaliczne)} × start Newtona {z góry, z dołu} × integrator {trapez, RK4} × krok {stały, adaptacyjny} ×
{czynnik `F = 1`, `F ≠ 1` przez jawne `f0 ≠ f_n`}; jakobian analityczny vs różnica centralna dla każdej kombinacji
(M46); odbiór czysto impedancyjny ≡ `OdsprzegDynamiki(g = P0/v0², b = −Q0/v0²)` ≤ 1e-12 wzgl.; skok obciążenia na
ZIP; `P0 + ΔP0 < 0` → odmowa. Wzorzec D-16 (T8) dostaje `U_min` poniżej obu pierwiastków; M36 zmierzona ponownie.
**Twierdzenie D-23**, **bramka G23**, **mutacje M40, M41, M42, M43 (wariant statyczny), M46**. Bramka: BW + nowe.

**P3 — stany odbiorów w DAE i odbiór czuły częstotliwościowo.**
`ElementStanowy` w `calkowanie` (kontekst, pakowanie, pochodne, jakobian sprzężony, trapez, RK4, błąd lokalny),
`silnik` (stany początkowe odbiorów `x₀ = arg V_pf`, maska równowagi po elementach, kanały stanów odbiorów w
przestrzeni `"odbior"`, `f_odbioru_hz@`), `obserwable._prawa_strona_dae` (wkład `∂I_odb/∂x·ẋ` — inaczej `f_hz@`
kłamie w sieciach z odbiorami czułymi, M50), `reinicjalizacja` (krotka pełna), `waznosc`, `malosygnalowa`,
estymator (pkt 4), reguła ponownego zasilenia (pkt 4d, T3/T9), sprawdzenie `F > 0` (pkt 4e). Testy (~22) —
iloczyn cech: {wyspa jednomaszynowa, SMIB z szyną sztywną, obszar beznapięciowy i ponowne zasilenie, odłączenie
odbioru zdarzeniem} × {`k_pf ≠ 0`, `k_qf ≠ 0`, oba} × {skok obciążenia, zwarcie z przejściem przez `U_min`
przy `Δω̂ ≠ 0`} × {trapez, RK4} × {krok stały, adaptacyjny}; `θ` przechodzi przez ±π (≥ 4 obroty w horyzoncie);
jakobian stanu vs różnica skończona; `malosygnalowa.macierz_stanu` wyspy vs wartości własne w postaci
zamkniętej (S4); `F ≤ 0` przy małym `T_f` i skoku fazy → odmowa nazwana z adresem. **Twierdzenie D-24**,
**bramka G24**, **mutacje M43 (wariant dynamiczny), M44, M45, M47, M50**. Bramka: BW + nowe.

**P4 — ENM, adapter, gotowość, pisarze, lustro FE, fikstury.**
`ModelDynamicznyOdbioru` w `enm/dynamika_modele.py`; `Load.dynamika`; `hash.py`; `enm.ts`; adapter
(charakterystyka z `zip_coeffs_from_materialized_params` przez funkcje rdzenia, podział mocy przez
`moc_poboru_w_punkcie_pracy`, `braki_modelu_dynamiki` z nowymi kodami, kasacja `KOD_ODBIOR_ZIP`,
`zalozenia_wejscia`); jeden predykat `jest_odbiorem_zip` dla adaptera i `v2_projection`; pisarze wyprowadzają
`model` (pkt 2), `create_device` bez domyślnych `p_mw`/`q_mvar` (odmowa jak `add_load_sn`); gotowość (pkt 11);
fikstury G16/G17 (bloki odbiorów, §7 pyt. 3), `test_dynamika_rms_run.py:107`, `test_pr12_readiness.py:53`;
`provenance.py:339-354` (uzasadnienie). Testy (~22) — iloczyn cech: rodzaj szyny {same odbiory, z wytwórcą,
ze źródłem sieciowym} × kształt ZIP {stała moc, Z, I, mieszany} × {`k = 0`, `k ≠ 0`} × {jeden, dwa odbiory na
szynie} × {`f_studium = f0`, `f0` jawne ≠} × źródło współczynników {`model = "pq"`+ZIP, `model = "zip"`, bez ZIP};
gotowość ↔ bieg dla KAŻDEGO kodu braków (para); pisarze × {`model` sprzeczny z ZIP w payloadzie}. **Twierdzenia
D-22** i **D-25**, **bramki G22**, **G25**, **mutacje M38, M39, M48, M49**. Bramka: BW + (g) + tabela przed/po G16 i
SO-1A.

**P5 — rozpływ: reprezentowalność agregatu ZIP i odniesienie f0 (równolegle od P0, rozłączne pliki).**
`reprezentowalnosc_zip_szyny` (pkt 10) wołana w ścieżce rozpływu assemblera i w `_check_power_flow`;
`f0` nieobecne = częstotliwość studium (`zip_coeffs_from_materialized_params(params, f_studium_hz)`, wszyscy
wołający: `mapping.py:986`, adapter, `load_zip_model`); docstring `aggregate_zip`; zapis pozycji B-01 (d) w
§12.2 planu. Testy (~10): przypadki S2 (1)–(3b) → odmowa nazwana PL z szyną i rozbieżnością; przypadki
reprezentowalne (równe `k`, `f = f0`, jeden odbiór) → wynik bitowo jak dziś; studium 60 Hz. Regresja ZIP
rozpływu (69 testów §Stan wyjściowy) + parytet złotych hashy (`T/golden/parytet_assemblera`) — bez zmian (żadna
sieć rejestru nie ma ZIP; pomiar `grep "a_p" tests/golden` = 0). **Mutacja M51** (predykat reprezentowalności
wyłączony → D-22 z dwoma odbiorami o różnych `k` przy `f0 ≠ f_studium` pada). Bramka: regresja rozpływu, guardy,
`solver_diff_guard`.

**P6 — manifest, bramki, harness, CI.**
Wyrocznia `T/walidacja_fizyczna/wyrocznia_odbiorow.py` (ZERO importów z `network_model.solvers.dynamika` —
test AST jak dla `wyrocznia.py`): układ dwuwęzłowy (D-23), układ wyspowy jednomaszynowy (D-24), stan ustalony
i wartości własne w postaci zamkniętej, zredukowane równanie różniczkowe (DOP853, `rtol = 1e-12`), równanie
skalarne skoku w chwili zdarzenia (`brentq`). Manifest D-22…D-25 z kompletem siedmiu elementów; bramki
G22–G25 w `bramki.py` (`PROGI` z uzasadnieniem progu, jak dziś) i `test_bramki.py`; `uruchom.py`; mutacje
M38–M51 w `mutacje.py` z deklarowanym detektorem; szybkie zabicia (`SZYBKIE`) — M40, M42, M48 (detektory
tanie). CI: pomiar joba `mutacje-dynamiki` po dołożeniu 14 mutacji (do tego AB-1b.1: +16); gdy > 35 min —
deterministyczny podział na dwa joby, nie podniesienie limitu bez pomiaru. Bramka: BW + §4.

**P7 — dokumenty i potwierdzenia.**
Plan: §3a #22 (stan po karcie), §5 wiersz AB-3b (tablica S1–S6 z §0 pkt 12), §7 rejestr, §12.1 (wiersz
parametrów dynamicznych odbiorów), §12.2 (B-01 d); FREEZE C6/OD-37 (`:141`, `:201`, `:338` — „rozstrzygnięte
O-22: AB-1b.3 + AB-3b"), D7/D8 bez zmian treści; W6-A zał. Z3.1 (`:745-747` — poprawny kod i nieaktualna
przesłanka R_f); macierz luk #22 (adnotacja „stan po AB-1b.3"); `INWENTARZ_FUNKCJI_2026-07.md:209` (liczba
pisarzy i predykat); `CURRENT_DYNAMIC_CAPABILITY_MATRIX.md:164-165`; README walidacji; komentarz SO-1A
`test_so1a…py:62-78` (przesłanka „R_f MUSI być niezerowe" — nieaktualna po AB-1b.1 i tej karcie; wartość
zamrożona scenariuszem, nie modelem odbioru). Bramka: `docs_guard`, `plan_ab_zaleznosci_guard`, `guardy_z_ci.py`.

---

## §3 Granice

- **Nie dotykać:** plików FROZEN (`solver_diff_guard`), budowniczych admitancji; fizyki urządzeń (GFL, GFM,
  maszyny, magazynu, wiatru, szyny sztywnej) poza przeniesieniem ich na protokół `Urzadzenie(ElementStanowy)`
  bez zmiany liczb; metryk rdzenia (`_metryki` — AB-1b.2); zdarzeń warunkowych i źródła testowego (AB-1b.1b —
  wyłącznie z nich korzystać); `frt_hvrt/**`, `stability_rms/**`, toru T1; warstwy `werdykt/`; katalogu
  `der_dynamic`; złotych hashy PF/SC (pomiar P5 potwierdza brak zmian); fikstur e2e poza G16/G17 (bloki
  odbiorów) z tabelą przed/po.
- **Pliki współdzielone z innymi wykonawcami w tym samym worktree:** AB-1b.1 (rdzeń — ta karta startuje PO
  jego commicie, T1–T10); AB-H0 (`enm/hash.py:59-89` — dopisuje pole WYTWÓRCÓW obok `dynamika`;
  `enm/models.py` `Generator`; lustro `enm.ts`) — edycje w tym samym słowniku/pliku, rozłączne klucze, rebase
  przed odbiorem; AB-1a (`solver_input/provenance.py`, `enm/canonical_analysis.py`,
  `application/calculation_readiness/service.py` — jeśli dotyka) — edycje zlokalizowane, baza czerwona
  zmierzona w P0.
- **Zero:** wartości domyślnych liczbowych w kontraktach rdzenia i bloku ENM (straż); fizyki w adapterze
  (adapter woła funkcje rdzenia); „małej impedancji" i wygładzania załamania z ε; strojenia `U_min`, `T_f`,
  `R_f`, `eps_init` pod przebieg (wartości testowe mierzone i uzasadnione w P0, wartości produktowe — tylko z
  danych); luzowania progów bramek; kodów projektowych w komunikatach i opisach kanałów („D-24", „AB-1b.3",
  „O-22" nie trafiają do `komunikat_pl`/`opis_pl`); „PCC" (miejsce/punkt przyłączenia).
- **Granica importów rdzenia:** `D/odbiory.py` podlega `scripts/dynamika_granica_importow.py` (zero importów
  `power_flow_zip` — parytet dowodzony testem, nie wspólnym kodem); kontrakt danych w `kontrakty.py` (skanowany
  przez straż zera domyślek).
- **Test maskujący = dwa defekty:** każdy test przepisany (G8, T2, `test_odbior_zip`, `n_a` gotowości,
  `test_odpornosc_numeryczna` „głęboki zapad") ma komentarz z powodem zmiany kanonu i zachowaną intencją; D-22
  i SO-1A zawsze torem rozpływ → adapter → rdzeń.
- **Interfejs:** brak nowych ekranów; zmiana FE ograniczona do lustra typów ENM (straż). Funkcje tej karty są
  osiągalne ścieżką API biegu `dynamika_rms` i zapisu `update_element_parameters` — edytor bloku i ekrany w
  AB-1c (B-02).

---

## §4 Definicja ukończenia (CLAIMED DONE → VERIFICATION GATE)

Wszystkie bramki P0–P7 zielone z wklejonymi wyjściami; migawka P0 porównana po P7 (zero różnic poza
wyliczonymi); G1–G7, G9–G13 z wartościami IDENTYCZNYMI z P0; G22–G25 zielone; harness: M10–M21, M22–M37
(AB-1b.1) i M38–M51 ZABITE, M21 NIEWAŻNA, detektory faktyczne zgodne z deklarowanymi (wydruk); manifest D-22…D-25
z kompletem albo z uzasadnionym poziomem niższym; pełna regresja backendu, FE `type-check`/`lint`,
`guardy_z_ci.py` zielone; CI na DOKŁADNYM SHA po commicie integratora (praktyka R10).

**Twierdzenia (manifest):**

| Id | Zdolność | Równanie | Wyrocznia niezależna | Wzorzec | Mutacje | Bramka | Zakres ważności | Poziom celu |
|----|----------|----------|----------------------|---------|---------|--------|-----------------|-------------|
| D-22 | Parytet rozpływ ↔ dynamika w t = 0 (odbiory ZIP × F(f), podział mocy węzła) | `S_odb^dyn(V_pf, f_n) = S_odb^PF(V_pf, f_studium)`; `S_urz = S_net^PF + Σ S_odb^PF(V_pf)`; `‖g(x₀, y₀)‖∞ ≤ tol_PF / min|V_pf|` | FROZEN rozpływ NR (rozwiązanie) i jego wielomian `power_flow_zip` — druga implementacja | wariant G16 budowany W TEŚCIE (nie złota sieć) z odbiorami ZIP/`k` wg iloczynu cech P4 | M38, M39, M51 | G22 | szyny o agregacie reprezentowalnym (pkt 10); `|V_pf| ≥ U_min` | L5 |
| D-23 | Charakterystyka napięciowa z przejściem PQ→Z: ciągłość w `U_min`, postać zamknięta, `V = 0` bez odmowy | pkt 1 | układ dwuwęzłowy w postaci zamkniętej: gałąź impedancyjna liniowa `V = E·y/(y + Y_f + Y_eq)`; gałąź charakterystyki — równanie skalarne na `|V|` (`‖|V|²(y+Y_f) + conj S(|V|)‖ = |E y|·|V|`, górny pierwiastek `brentq`), kąt z postaci jawnej; `Y_f*` dające `|V| = U_min` wyznaczone przez wyrocznię | szyna sztywna (`Z_s = 0,01 + j0,10`) — linia (`0,02 + j0,08`) — odbiór (`P0 = 0,3`, `Q0 = 0,1`, `U_min = 0,7`) — ciąg zwarć o rosnącej admitancji z `"samoczynne"`, do metalicznego (T1) | M40, M41, M42, M43, M46 | G23 | charakterystyka statyczna; RMS składowej zgodnej | L5 |
| D-24 | Odbiór czuły częstotliwościowo: estymator = inercja 1. rzędu f szyny; samoregulacja (tłumienie) odbioru | pkt 4; `2H·dΔω/dt = P_m − P_L`, `P_L = P0'(1 + kΔω̂)`, `(T_f + a)·dΔω̂/dt = Δω − Δω̂`, `a = X·P0'k/(ω_n E'² cos 2ψ)`, `sin 2ψ = 2XP_L/E'²`; `Δω_∞ = (P_m/P0' − 1)/k` | S4: stan ustalony i wartości własne w postaci zamkniętej, skok w chwili zdarzenia z równania skalarnego, trajektoria z niezależnego całkowania DOP853 zredukowanego modelu; `f_hz@B` wobec `Δω − ψ̇/ω_n` z tej samej postaci | wyspa: maszyna klasyczna + linia + odbiór `k_pf = 2`, `T_f = 0,1 s`, skok `+0,005 pu`, horyzont ≥ 20 s | M43, M44, M45, M47, M50 | G24 | `|θ − x| < π` między zdarzeniami; liniowy czynnik częstotliwościowy z `F > 0` | L5 |
| D-25 | Fail-closed modelu odbioru: brak/fantom parametru, `P0 < 0`, punkt pracy poniżej `U_min`, `F ≤ 0` → odmowa nazwana, ta sama w gotowości i biegu | tablica użycia pól wyprowadzona z równań pkt 1 i 4 (pole użyte ⇔ wymagane) | analiza kontraktu (jak D-07/D-08), tablica spisana w teście NIEZALEŻNIE od `wymagane_parametry_odbioru` | macierz przypadków G25 | M48, M49 | G25 | kontrakt danych ENM i rdzenia | L5 |

**Progi bramek (uzasadnienie w `PROGI`):** G22 — `1e-12` wzgl. dla mocy odbioru i urządzenia (ten sam
wielomian dwiema implementacjami: różnica rzędu kilku ulp), `‖g‖∞ ≤ tolerance_used/min|V_pf|` (tolerancja z
wyniku rozpływu, `power_flow_result.py:147`; pomiar bazowy S1: `7,1e-9` przy `1e-8`); G23 — `|V − V_wyr| ≤ 1e-10`
(tolerancja Newtona `1e-11`, uwarunkowanie ~1), ciągłość `|S(U_min⁺) − S(U_min⁻)| ≤ 1e-12`, tożsamość próbkowa
`P_pobor = charakterystyka(|V|)` ≤ `1e-12` wzgl.; G24 — rząd metody zmierzony: `e(dt/2)/e(dt) ∈ [3,5; 4,5]` i
`e(dt) ≤ 1e-6·|Δω_∞|` przy `dt = 1e-3 s` (trapez: `(λ_max·dt)²/12 ≈ 8e-6` dla modu szybkiego o amplitudzie
`~1e-4`), skok w chwili zdarzenia ≤ `1e-12`, `f_hz@B` ≤ `1e-9` Hz; G25 — predykat `0,0`.

**Mutacje:**

| Id | Defekt fizyczny | Plik | Detektor |
|----|-----------------|------|----------|
| M38 | predykat modelu odbioru z `load.model == "zip"` zamiast współczynników | `enm/adapter_dynamiki.py` | G22 (przypadek S1) |
| M39 | podział mocy węzła z mocą bazową `P0 + jQ0` zamiast `S(V_pf)` | `enm/adapter_dynamiki.py` | G22 (szyna z wytwórcą i ZIP) |
| M40 | gałąź impedancyjna bez sprzężenia: `Y_eq = S(U_min)/U_min²` | `D/odbiory.py` | G23 (Q0 ≠ 0 poniżej `U_min`) |
| M41 | gałąź impedancyjna skalowana `S(v0)` zamiast `S(U_min)` | `D/odbiory.py` | G23 (ciągłość przy `b ≠ 0` albo `a ≠ 0`) |
| M42 | przejście wyłącznie składowej stałomocowej (`c`), składowa stałoprądowa bez przejścia | `D/odbiory.py` | G23 (`V = 0` przy `b ≠ 0`: NaN → odmowa zamiast biegu) |
| M43 | czynnik częstotliwościowy wyłącznie w gałęzi charakterystyki | `D/odbiory.py` | G23 (`F ≠ 1` przez `f0 ≠ f_n`), G24 (przejście przez `U_min` przy `Δω̂ ≠ 0`) |
| M44 | estymator z różnicy kątów `angle(V) − x` bez `arg(V·e^{−jx})` | `D/odbiory.py` | G24 (przejścia przez ±π) |
| M45 | `Δω̂ = e/T_f` (bez `ω_n`) | `D/odbiory.py` | G24 |
| M46 | jakobian odbioru bez członu `dS/d|V|` | `D/odbiory.py` | test jakobianu vs różnica centralna (`testy=`, jak M18) |
| M47 | brak `x ≔ arg V⁺` przy ponownym zasileniu | `D/silnik.py` | G24 (część: obszar beznapięciowy — `Δω̂(P) = 0` dokładnie) |
| M48 | brak sprawdzenia `|V_pf| ≥ U_min` | `D/silnik.py` (albo `D/odbiory.py`) | G25 (oczekiwany kod, a nie `inicjalizacja_niezbiezna`) |
| M49 | warunek bloku odbioru wycięty z `braki_modelu_dynamiki` | `enm/adapter_dynamiki.py` | G25 (surowy wyjątek zamiast kodu; para gotowość–bieg) |
| M50 | `_prawa_strona_dae` bez elementów stanowych odbiorów | `D/obserwable.py` | G24 (`f_hz@B` wobec postaci zamkniętej) |
| M51 | predykat reprezentowalności agregatu ZIP wyłączony | `enm/load_zip_model.py` | G22 (dwa odbiory, różne `k`, `f0 ≠ f_studium`) |

**Sondy (każda z wklejonym wyjściem):**
1. **S1 po naprawie:** G16 z `model = "pq"` + ZIP: brak odmowy, moc `gen-synchroniczny` = `S_net + S_ZIP(V_pf)`
   (różnica ≤ 1e-12 — wydruk obu), bramka równowagi `‖g‖` ≤ próg G22; ten sam bieg z M38 — różnica
   `4,358e-4 pu` wraca (wydruk).
2. **Zwarcie metaliczne w węźle odbioru** (układ D-23 i `b-odplyw` na G16): bieg bez odmowy; `p_pobor_pu@ =
   q_pobor_pu@ = 0,0` dokładnie w oknie zwarcia, `tryb_odbioru@ = 1`; kod
   `dynamika.odbior_stalej_mocy_przy_zerowym_napieciu` nieobecny w `KODY_ODMOW` (wydruk rejestru).
3. **Zamiatanie głębokości (dawne G8):** `x_f ∈ {0,5; 0,2; 0,1; 0,05; 0,03; 0,0222; 0,01; 0,002; 0}` pu —
   KAŻDY punkt „BIEG", tabela `min|U|`, czas w gałęzi impedancyjnej, tożsamość próbkowa mocy.
4. **Punkt dokładnie w `U_min`:** `Y_f*` z wyroczni — Newton zbiega startując z góry i z dołu (liczba iteracji,
   nawrotów, residuum — wydruk); gdyby nie zbiegał: pomiar i decyzja architekta strategicznego (R2), nie ε.
5. **Wyspa samoregulacji (D-24):** tabela produkt vs wyrocznia w `t = 0,1; 1; 5; 20 s` (`Δω`, `Δω̂`, `f_hz@B`),
   skok w chwili zdarzenia, rząd metody (`dt`, `dt/2`), liczba przejść `θ` przez ±π; M44 — wydruk błędu.
6. **Parytet t = 0 (D-22):** tabela iloczynu cech P4 (rodzaj szyny × kształt × `k` × liczba odbiorów × `f0`) —
   maksymalne różnice mocy odbioru, mocy urządzenia i `‖g‖`.
7. **Rozpływ (P5):** przypadki S2 (1)–(3b) → odmowa `load.zip_agregat_niereprezentowalny` z komunikatem PL;
   przypadki reprezentowalne — wynik bitowo jak przed; studium 60 Hz z `k = 1` → `P = P0` przy `V = v0`.
8. **Gotowość ↔ bieg:** macierz {bez wytwórców/z odbiorami, bez bloku odbioru, `T_f` brak/zbędny, `U_min`
   brak/zbędny, `P0 < 0`} → status gotowości i kod biegu (ten sam kod w obu).
9. **SO-1A i G16 przed/po:** `min|U|` szyn odbiorów, czas w gałęzi impedancyjnej, moce odbiorów w próbkach
   `L`/`P` zdarzeń, różnice kanałów dawnych (z przyczyną), liczba kanałów (przed/po), determinizm trzech ziaren.
10. **Tożsamość:** dwa biegi różniące się wyłącznie `a_P` jednego odbioru → różne `odcisk_migawki` (przed
    kartą: identyczne — wydruk obu stanów).
11. **Koszt:** czas SO-1A, G16, G1–G25, harnessu mutacji (przed/po); wzrost czasu SO-1A > 10 % wymaga profilu
    z przyczyną (odbiory to kilka elementów na bieg — oczekiwany koszt pomijalny).

Werdykt wizualny nie dotyczy tej karty (brak ekranów). Meldunek: co domknięte z dowodem, co częściowe, czego
nie zrobiono i dlaczego.

---

## §5 Sprzeczności (plan ↔ kontrakty ↔ kod ↔ testy) i proponowane rozstrzygnięcia

| Id | Sprzeczność | Dowód | Propozycja |
|----|-------------|-------|------------|
| S1 | Plan i macierz: „ZIP odrzucany" ↔ kod: odrzucany wyłącznie przy `Load.model == "zip"`; ZIP przez współczynniki przechodzi i jest liczony stałą mocą (cichy błąd mocy wytwórcy 0,9 %) | `PLAN…:194`; macierz `:55`; `adapter_dynamiki.py:308`; sonda S1 | §0 pkt 2 (jeden predykat), stan §3a #22 poprawiony w P7 |
| S2 | Trzy różne twierdzenia o głębokim zapadzie ze stałą mocą: macierz („algebra refusal, `silnik.py:877-878`" — to tekst `ZALOZENIA_RDZENIA`), docstring kontraktu (`algebra_niezbiezna`, `kontrakty.py:193-197`), pomiar G8 (`krok_niezbiezny` / `reinicjalizacja_niezbiezna`, `bramki.py:290-293`) | j.w. | model zastąpiony (§0 pkt 1); docstringi przepisane; G8 skasowana z uzasadnieniem |
| S3 | W6-A zał. Z3.1 cytuje `dynamika.odbior_zip_nieobslugiwany` jako kod granicy głębokiego zapadu SO-1A — to kod odmowy ZIP adaptera, a granica kończyła się `reinicjalizacja_niezbiezna` | `W6_A…:745-747` | poprawka dokumentu w P7 z adnotacją „stan sprzed AB-1b.3" |
| S4 | Nazwa odmowy odbioru w węźle zwarcia metalicznego: AB-1b.1 `dynamika.odbior_stalej_mocy_przy_zerowym_napieciu` (w kodzie w toku) ↔ AB-1b.2 `dynamika.odbior_w_wezle_zwarcia_metalicznego` (karta §0.5b, sonda 6) | obie karty | kod kasowany przez tę kartę; karta AB-1b.2 odwołuje się do „bieg bez odmowy" (O-48 pkt 4) |
| S5 | Kolizja numeracji mutacji: AB-1b.1 M22–M37 ↔ AB-1b.2 M22–M36 | obie karty | ta karta M38–M51; AB-1b.2 → M52+ (zapis w O-48/§7 planu) |
| S6 | „Złożony" w AB-1b.3 (plan :345) ↔ odbiór złożony = część statyczna + silnik (literatura, PowerFactory „complex load") ↔ silnik w AB-3b (O-22) | plan `:108`, `:345`, `:351` | §0 pkt 12: architektura + część statyczna teraz, DoD „złożony" z silnikiem w AB-3b (pyt. 1) |
| S7 | `aggregate_zip` „this is exact" ↔ S2 (niedokładny: `f ≠ f0` × różne `k`; różne `v0`/`f0` — zależny od kolejności; `ΣQ0 = 0` cicho zero; poprawny model z Q różnego znaku odrzucany surowym angielskim błędem) | `power_flow_zip.py:334-337`, `:362-365`, `:149` | §0 pkt 10 (odmowa nazwana teraz, dokładność w FROZEN — B-01 d) |
| S8 | Inwentarz: „JEDEN kontrakt ZIP wołany przez wszystkie TRZY drogi zapisu" ↔ cztery drogi zapisu + budowa domyślnego odbioru; `create_device` bierze `model` z payloadu niezależnie od ZIP i fabrykuje `p_mw = q_mvar = 0` | `INWENTARZ…:209`; `topology_ops.py:566-568`; `domain_operations_v2.py:2680, :6246` | §0 pkt 2 + P4 (pisarze), dokument w P7 |
| S9 | Gotowość `dynamika_rms`: `n_a` bez wytwórców ↔ adapter wykonuje taki bieg (brak warunku); test przypina `n_a` przy obecnych odbiorach | `service.py:692-700`; `test_pr12_readiness.py:600-603` | §0 pkt 11 (pyt. 7) |
| S10 | `obserwable.py:9-12` „Obserwabla NIGDY nie zostaje stanem" ↔ stan estymatora częstotliwości odbioru | §0 pkt 4f | brak sprzeczności merytorycznej (stan należy do MODELU odbioru, `f_hz@` zostaje obserwablą); docstring uzupełniony, żeby czytelnik jej nie widział |
| S11 | `f0 = 50 Hz` jako literał w `ZipCoeffs`/`load_zip_model` („wielkości odniesienia układu (1,0 pu i 50 Hz)") ↔ `ENMDefaults.frequency_hz` dowolne (60 Hz dopuszczalne) — rozpływ skaluje odbiory `k ≠ 0` o `1 + 0,2k` przy częstotliwości znamionowej | `power_flow_zip.py:67, :321`; `load_zip_model.py:74`; `enm/models.py:169` | §0 pkt 10 (pyt. 6) |
| S12 | FREEZE C6 „do decyzji OD-37" ↔ plan O-22 rozstrzygnął (AB-1b.3 + AB-3b) | FREEZE `:141`, `:201`, `:338`; plan `:108` | aktualizacja stanu w P7 (dokument dowodowy: adnotacja, nie przepisanie treści) |
| S13 | Opis mutacji M18: „granica `|V| ≤ u_V` NIEOSIĄGALNA z poziomu biegu (rdzeń odmawia wcześniej przy zapadzie)" ↔ po AB-1b.1 (V = 0 narzucone) i tej karcie (zapad dowolnej głębokości liczy się) przesłanka jest nieprawdziwa | wpis M18 w `mutacje.py` (opis detektora) | opis M18 przepisany; ocena, czy bramka biegu może teraz zabić M18 — w P6 (pomiar), bez zmiany detektora bez dowodu |
| S14 | Komentarz SO-1A: „zwarcie metaliczne kończy się nazwaną odmową rdzenia, więc impedancja MUSI być niezerowa" + W6-A Z3.1 (wybór R_f pod granicę odbioru stałej mocy) ↔ po AB-1b.1 i tej karcie obie przesłanki ustają | `test_so1a…py:69-78`; `W6_A…:738-747` | R_f zostaje (zamrożone scenariuszem), uzasadnienie przepisane w P7 |
| S15 | Plan DoD AB-1b.3 „wyrocznia tłumienia odbioru" bez definicji wielkości | plan `:345` | D-24: samoregulacja częstotliwościowa (`D = P0'k`, `2H/D`, `Δω_∞`) — klasyczne „tłumienie odbioru" (stała samoregulacji); zapis w planie |
| S16 | `kontrakty.py:24-28` „kontrakt danych dynamiki żyje w trzech miejscach" ↔ po karcie czwarte miejsce danych dynamiki (blok odbioru w `enm/dynamika_modele.py` — ten sam plik, więc lista plików straży bez zmian) | `kontrakty.py:24-28` | docstring: „trzy pliki, rodziny: źródła i odbiory" |

---

## §6 Rozmiar i ryzyka regresji L5

**Rozmiar (szacunek z mapy §1; ±25 %):**

| Pakiet | Kod produkcyjny (linie dodane/zmienione) | Pliki produkcyjne | Nowe testy | Testy przepisane |
|--------|------------------------------------------|-------------------|------------|------------------|
| P1 | ~220 | 3 (`kontrakty`, `tozsamosc`, `__init__`) + 11 konstruktorów | ~14 | 0 (mechaniczne) |
| P2 | ~600 | 6 (`odbiory` nowy, `siec`, `wyspy`, `zdarzenia`, `silnik`, `obserwable` docstringi) | ~24 | ~6 (G8, T2, odporność, D-07, D-16 wzorzec, `test_siec`) |
| P3 | ~550 | 7 (`calkowanie`, `silnik`, `obserwable`, `reinicjalizacja`, `waznosc`, `malosygnalowa`, `odbiory`) | ~22 | ~3 |
| P4 | ~450 | 11 (`dynamika_modele`, `models`, `hash`, adapter, `load_zip_model`, `v2_projection`, `topology_ops`, `domain_operations`, `domain_operations_v2`, gotowość, `provenance`) + `enm.ts` + 2 buildery | ~22 | ~6 (`test_odbior_zip`, `:977`, gotowość `n_a`, `test_dynamika_rms_run`, fikstury) |
| P5 | ~180 | 4 (`power_flow_zip`, `load_zip_model`, `assembler`, `mapping`) + gotowość PF | ~10 | 1 (docstring/test agregacji) |
| P6 | aparat: wyrocznia ~550, bramki ~400, mutacje ~220, manifest ~180 | 5 testowych | ~16 | 2 (manifest D-07, `test_mutacje` wzorce) |
| P7 | dokumenty | 9 | — | — |
| **Razem** | **~2 000 produkcyjnych + ~1 350 aparatu** | ~30 | **~108** | **~18** + mechaniczne |

Rekomendacja odbioru: dwa commity integratora — **AB-1b.3a** = P0–P2 + P5 (model statyczny, parytet rozpływu, kasacja
odmów — to jest dokładnie to, czego potrzebuje AB-1b.2), **AB-1b.3b** = P3–P4 + P6–P7 (stany odbiorów, ENM,
gotowość, manifest). Każdy z pełną BW.

**Ryzyka i mitygacja:**

| Id | Ryzyko | Mechanizm | Mitygacja (mierzalna) |
|----|--------|-----------|-----------------------|
| R1 | Refaktor krotki stanów (odbiory + urządzenia) zmienia bity biegów L5 | ~15 pętli `zip(kontekst.urzadzenia, stany)` | kolejność kanoniczna = kolejność sumowania (§0 pkt 5), pomijanie elementów o wymiarze 0, parytet P0 po KAŻDYM pakiecie; sonda S5 dowodzi redukcji wzoru |
| R2 | Załamanie w `U_min` — Newton cykluje albo zwalnia przy rozwiązaniu na załamaniu | funkcja półgładka | sonda 4 (§4) z oboma startami; Armijo; przy porażce: pomiar i decyzja architekta strategicznego o trybie zdarzeniowym (zdarzenia warunkowe AB-1b.1b), NIGDY wygładzenie z ε |
| R3 | G16 i SO-1A zmieniają przebiegi (odbiory w gałęzi impedancyjnej podczas zwarcia) | nowy mechanizm, nie regresja | tabela przed/po z przyczyną; akceptacja nowej bazy SO-1A przez integratora/właściciela (pyt. 3) |
| R4 | Istniejące projekty tracą gotowość `dynamika_rms` (brak bloków odbiorów) | zero domyślek | komunikat gotowości z listą odbiorów; wiersz bramki danych §12.1; edytor — AB-1c; zapis w §7 planu (pyt. 2) |
| R5 | Kolizje edycji z AB-H0/AB-1a w tym samym worktree | `hash.py`, `models.py`, `enm.ts`, gotowość, `provenance.py` | rozłączne klucze, rebase i pełna BW przed odbiorem; baza czerwona P0 |
| R6 | Skok fazy przy małym `T_f` daje `|Δω̂|` do `π/(ω_n T_f)` → `F ≤ 0` → odmowa przy zwarciu | fizyka estymatora | odmowa NAZWANA z adresem i wartością (nie wynik); test z małym `T_f`; brak górnej/dolnej granicy pola bez źródła — decyzja o zakresie pola wyłącznie z danych |
| R7 | P5 zmienia wyniki rozpływu (studium ≠ 50 Hz z `k ≠ 0`) i dodaje odmowy | naprawa cichego błędu | pomiar: złote hashe bez zmian (żadna sieć rejestru nie ma ZIP), 69 testów ZIP; lista przypadków zmienionych w meldunku |
| R8 | Czas biegu | ogólna charakterystyka w każdej ewaluacji algebry | pomiar sonda 11; odbiorów jest kilka — koszt pomijalny wobec LU |
| R9 | Ruchomy cel AB-1b.1 | cytaty linii | karta cytuje bazę; wykonawca lokalizuje po nazwach; start po commicie AB-1b.1 |
| R10 | M36 (AB-1b.1) przestaje ginąć po zmianie modelu odbioru we wzorcu D-16 | niższy pierwiastek stałej mocy nie istnieje poniżej `U_min` | `U_min` wzorca D-16 poniżej obu pierwiastków (pomiar); harness M36 w BW |

---

## §7 Pytania otwarte do architekta strategicznego (z rekomendacją)

1. **„Odbiór złożony"** — AB-1b.3 dostarcza architekturę części odbioru (protokół `ModelOdbioru`, stany odbiorów
   w DAE, blok ENM rozszerzalny, tablica S1–S6 dla silnika) i kompletną część statyczną; wiersz DoD „złożony"
   (część statyczna + silnik) domyka AB-3b, gdzie powstaje silnik i jego wyrocznia utyku. Alternatywa: silnik w
   AB-1b.3 (karta ≈ 2×, AB-1b.2 i ścieżka FRT przesunięte). *Rekomendacja:* podział jak wyżej — odbiór złożony
   bez silnika nie ma treści poza ZIP, a O-22 przypisuje silnik do AB-3b.
2. **Blok `Load.dynamika` wymagany dla KAŻDEGO odbioru** w biegu `dynamika_rms` (istniejące projekty z odbiorami
   stają się `blocked` do czasu uzupełnienia). *Rekomendacja:* TAK — alternatywą jest wartość domyślna `U_min`,
   czyli fabrykacja decyzji inżynierskiej; wiersz bramki danych §12.1 i edytor w AB-1c.
3. **Wartości testowe fikstur G16/G17** (`U_min`, brak `k` — odbiory stałej mocy jak dziś) i **nowa baza SO-1A**.
   *Rekomendacja:* `U_min = 0,7 pu` jako dana testowa (`deklaracja_uzytkownika`, odniesienie „dana testowa sieci
   wzorcowej — karta modeli odbiorów"), tabela przed/po SO-1A zaakceptowana przez integratora przed commitem; wartość
   produktowa wyłącznie ze źródła wskazanego w bramce danych.
4. **Pole `Load.model`** — czytelnicy przechodzą na predykat współczynników, pisarze wyprowadzają pole (teraz).
   Usunięcie pola zmieniłoby odcisk KAŻDEJ migawki z odbiorem (odciski zamrożone — docstring `_POLA_SKASOWANE_W_ODCISKU` w `enm/hash.py`).
   *Rekomendacja:* pole zostaje jako wyprowadzane (zapis zawsze spójny), bez migracji; istniejące niespójne migawki
   nie wpływają na żaden wynik, bo nikt nie czyta pola.
5. **Agregat ZIP w rozpływie** — teraz odmowa nazwana dla przypadków niereprezentowalnych; dokładna
   reprezentacja (PQSpec per odbiór) i przyjęcie agregatu o udziałach poza `[0, 1]` zmieniają zachowanie FROZEN NR.
   *Rekomendacja:* obie rzeczy jako pozycja B-01 (d) w §12.2, zgłoszona właścicielowi razem z (a)–(c).
6. **`f0` nieobecne = częstotliwość studium** (zmienia wyniki rozpływu projektów ≠ 50 Hz z odbiorami `k ≠ 0`).
   *Rekomendacja:* TAK — odbiór deklaruje moc przy częstotliwości znamionowej swojej sieci; literał 50 Hz jest
   fabrykacją dla każdej innej.
7. **Gotowość bez wytwórców:** `n_a` tylko, gdy nie ma ani wytwórców, ani odbiorów. *Rekomendacja:* TAK — po
   karcie odbiory mają model dynamiczny, a bieg i tak się wykonuje; alternatywą jest odmowa biegu bez wytwórców,
   co odebrałoby analizę zachowania odbiorów przy zwarciu (i silników w AB-3b).
8. **Estymator częstotliwości odbioru:** kątowy (jeden stan, dokładna inercja 1. rzędu f szyny, ograniczony
   `|Δω̂| ≤ π/(ω_n T_f)`) zamiast filtra fazora (nieograniczony po przerwie) czy `f_hz@` wprost (indeks DAE).
   *Rekomendacja:* kątowy, `T_f` jako dana wymagana ⇔ `k ≠ 0`.
9. **Zakres ważności `F > 0`** jako odmowa nazwana w biegu. *Rekomendacja:* TAK — ujemna moc bazowa odbioru jest
   ekstrapolacją liniowego modelu, nie fizyką.
10. **Numeracja:** D-22…D-25, bramki G22–G25, M38–M51; AB-1b.2 → M52+. *Rekomendacja:* TAK, zapis w O-48 / §7
    planu przed startem AB-1b.2.
11. **Kanoniczny kod gotowości per odbiór** (`load.dynamika_missing` z nawigacją do inspektora) — nie teraz.
    *Rekomendacja:* dodać razem z edytorem bloku w AB-1c; bez edytora nawigacja byłaby martwym klikiem, a raport
    `dynamika_rms` już niesie braki odbiorów.

---

## Karta AB-1b.3b (2026-09-25) — pakiety P3, P4, P6, P7 i decyzja O-56

### Karta AB-1b.3b — odbiory w rdzeniu dynamiki RMS: stany i estymator częstotliwości, blok `Load.dynamika` z katalogu z wiązaniem na ekranie dynamiki, manifest D-22…D-25, kasacje z O-55

Drzewo: `<worktrees>/odbior-ab1b3b` (gałąź `int/ab1b3b`, baza = czubek
`int/p5` z chwili startu: partia 4 + AB-P1 — rdzeń dynamiki w ścieżce produkcyjnej, ekran E-32).
Jeden commit lokalny, BEZ push. Meldunek:
`<scratchpad>/ab1b3b/meldunek.md`.
Biegi weryfikacyjne wg `<scratchpad>/REGULA_TESTOW.md`.

#### Po co

AB-1b.3a dało jeden statyczny model odbioru (ZIP × czynnik częstotliwościowy, przejście PQ→Z poniżej
`U_min`, prąd 0 przy V = 0). Model nie ma jednak jeszcze danych ani stanu:
- odbiory przychodzą z modelu sieci bez `U_min`, więc odmowa odbioru stałej mocy przy zerowym napięciu
  i bramka G8 zostały ZAWĘŻONE, a nie skasowane (decyzja O-55);
- odbiór czuły częstotliwościowo (k ≠ 0) kończy się odmową, bo nie ma estymatora częstotliwości szyny;
- manifest D-22…D-25, bramki G22–G25 i rejestracja mutacji M38–M51 w harnessie nie istnieją.

Od AB-P1 rdzeń dynamiki jest ścieżką produkcyjną projektanta (ekran E-32). Brak modelu odbiorów
i brak drogi podania jego danych oznacza, że każda realna sieć z odbiorami albo liczy się bez
modelu (dzisiejsze zawężenie), albo, po wymaganiu bloku, staje się `blocked` bez akcji naprawczej.
Ta karta domyka odbiory w rdzeniu i w toku pracy projektanta. Przy okazji zamyka jeden defekt
wykryty przy odbiorze AB-P1: założenia rdzenia trafiają na E-32 jako zdania bez polskich znaków,
z kluczami kodu i identyfikatorami węzłów, schowane w zwiniętym `ZapisTechniczny`, choć rdzeń
dynamiki nie jest na liście B-01.

Wejście merytoryczne (wiąże): karta wykonawcza AB-1b.3
`<scratchpad>/karta_AB_1b3_odbiory.md`:
pakiety P3, P4 (część niewykonana w AB-1b.3a), P6 i P7, twierdzenia D-22…D-25, progi, mutacje,
sondy 1–11 z §4. Do tego decyzje O-49 i O-55 planu
`docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` (§2.3) oraz meldunek AB-1b.3a
`<scratchpad>/ab1b3a/meldunek.md`
(co już jest, odesłania w kodzie do AB-1b.3b). Gdzie opis stanu wyjściowego w karcie AB-1b.3 różni
się od repozytorium po AB-1b.3a i AB-P1, rozstrzyga pomiar; rozbieżność nazywasz w meldunku.

#### §0 Rozstrzygnięcia (decyzja integratora O-56; wpis do planu robi integrator)

1. **Dane bloku `Load.dynamika` pochodzą z katalogu.** Źródłem jest katalog profili dynamiki odbiorów
   (napięcie przejścia `U_min`, stała pomiaru częstotliwości `T_f`), zbudowany według wzorca profili
   `der_dynamic`: wartości typowe z podstawą i jakością `ESTIMATED`, bez domyślek.
   - Odbiór wiąże się z profilem `dynamic_model_ref` jedną operacją domenową.
   - Kopię `Load.dynamika` buduje JEDNA funkcja materializacji, według wzorca
     `enm/dynamika_z_katalogu.py` z AB-P1. Kopia jest odświeżana w każdej odpowiedzi operacji;
     kopia nieaktualna blokuje gotowość i bieg tym samym predykatem.
   - Współczynniki ZIP i czułości k zostają tam, gdzie są dziś (typ katalogowy odbioru
     i `zip_coeffs_from_materialized_params`); profil dynamiki niesie wyłącznie parametry
     modelu dynamicznego.
   - Zanim ustalisz miejsce profili (osobny katalog albo sekcja typu odbioru), zmierz katalog
     i rodzaje odbiorów. Decyzję i jej podstawę opisz w meldunku.
2. **Wymaganie bloku idzie w parze z akcją naprawczą** (O-49 pkt 2 i 11, predykaty parami).
   - `load.dynamika_missing` (kod per odbiór, z nazwą odbioru z modelu) prowadzi do wiązania
     profilu na ekranie E-32, w tej samej sekcji co modele źródeł (`der.dynamika_missing`).
   - Edytora pól ręcznych nie ma (reguła 10 katalogu, O-54 pkt 2). Tym samym O-49 pkt 11
     („edytor w AB-1c”) zastępuje się wiązaniem w tej karcie.
   - Gotowość `n_a` tylko bez wytwórców i bez odbiorów (O-49 pkt 7).
   - Iloczyn testowy gotowość ↔ akcja ↔ bieg obejmuje każdy kod braku.
3. **Kasacje z O-55 w tej karcie**, gdy wymaganie bloku zamienia brak `U_min` w brak danych przed
   biegiem, a estymator (P3) zastępuje odmowę k ≠ 0. Znikają:
   - odmowa `dynamika.odbior_stalej_mocy_przy_zerowym_napieciu`;
   - bramka G8;
   - wariant `u_min_pu = None` dla odbiorów nie-impedancyjnych;
   - odmowa `dynamika.odbior_czuly_czestotliwosciowo_nieobslugiwany`.

   Każde z tych miejsc dostaje bramkę wskrzeszenia w istniejącym mechanizmie
   `legacy_public_path_guard`. Testy przepisane z powodu zmiany kanonu mają komentarz z intencją
   (reguła „test maskujący = dwa defekty”).
4. **Estymator częstotliwości odbioru jest KĄTOWY** (O-49 pkt 8): jeden stan, protokół
   `ElementStanowy`/`ModelOdbioru` razem ze stanem (O-55 pkt 2). Działa z obszarem beznapięciowym
   i ponownym zasileniem (M47) oraz z prawą stroną DAE obserwabli (M50).
5. **Fikstury i sieci wzorcowe** (G16, G17, SO-1A) wiążą profile testowe tą samą operacją:
   `U_min = 0,7 pu` jako dana testowa (O-49 pkt 3). Nowa baza SO-1A i G16 wchodzi z tabelą
   przed/po liść po liściu, z przyczyną każdej różnicy. Integrator akceptuje tabelę przed
   scaleniem — wklejasz ją do meldunku.
6. **Założenia rdzenia jako rekordy strukturalne.** Rdzeń emituje założenie jako kod, wielkości
   z jednostką i odwołania do elementów. Zdanie po polsku z nazwami z modelu (jedno źródło nazw)
   składa warstwa aplikacji dla E-32, raportu PDF/DOCX i opisu wyniku API. Efekty:
   - `ZapisTechniczny` znika z E-32 dla rdzenia dynamiki (zostaje wyłącznie przy rdzeniach B-01);
   - zapadka polskich znaków `silnik.py` schodzi do 0;
   - odciski implementacji zmienione wyłącznie o to (dowód liść po liściu).

   Ten sam wzorzec obejmuje komunikaty odmów rdzenia docierające do projektanta, jeśli niosą
   identyfikator albo klucz. Inwentarz podajesz w meldunku.

#### Granice

- Rdzenie B-01 (`scripts/rdzenie_b01.py`) bez zmian, w tym `stability_rms` i rozpływ NR.
  Dokładny agregat wielu odbiorów ZIP w rozpływie pozostaje pozycją B-01 (e).
- Fizyka urządzeń (GFL, GFM, maszyny, magazynu, wiatru, szyny sztywnej) bez zmiany liczb.
  Metryki rdzenia należą do AB-1b.2, zdarzenia warunkowe i źródło testowe — tylko z nich korzystasz.
- Kontrakty FROZEN wyników nietknięte. `resultset_dynamic_v2` i odpowiedzi API zmieniasz wyłącznie
  addytywnie (schemat i migawka OpenAPI z generatorów).
- Determinizm: dwa biegi w procesie i trzy ziarna `PYTHONHASHSEED` dają identyczny ładunek
  (poza zegarem).
- Zero domyślek liczbowych w kontraktach rdzenia, bloku ENM i profilach. Żadnego strojenia
  `U_min`/`T_f` pod przebieg, żadnego luzowania progów bramek.
- Fikstury e2e i harnessu wyłącznie z generatorów.
- Wiersze rejestru §7 i decyzję O-56 w planie dopisuje integrator.

#### Kryterium ukończenia

§4 karty AB-1b.3 dla P3, P4, P6 i P7 plus rozstrzygnięcia §0 tej karty (CLAIMED DONE z dowodami):
- twierdzenia D-22…D-25 z wyroczniami bez importów z rdzenia; bramki G22–G25 zielone;
- M38–M51 zarejestrowane w harnessie i ZABITE, M21 NIEWAŻNA, pełny harness KOD = 0;
- sondy 1–11 z wklejonymi wyjściami;
- iloczyn testowy gotowość ↔ akcja naprawcza ↔ bieg;
- spec e2e na realnym backendzie: projektant wiąże profil odbioru na E-32 i bieg przechodzi —
  natywne kliknięcia, porty backend 18843, frontend 5263;
- zrzuty E-32 (oba motywy) jako materiał B-02 do `docs/audit/visual/flow-ekspert/`, bez własnego
  werdyktu;
- testy celowane backendu i vitest dotkniętych modułów, `npm run type-check`, `npm run lint`,
  `python scripts/guardy_z_ci.py` — kody wyjścia w meldunku.

Pełną regresję, pełny vitest i pełny e2e robi integrator. Maszyna ma 4 CPU i jest współdzielona
z innymi wykonawcami: ciężkie biegi (harness mutacji, walidacja fizyczna) puszczaj pojedynczo,
w tle, z plikiem-znacznikiem końca.

Python: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`,
`PYTHONPATH=src:.` w `backend`; black -l 100; `frontend/node_modules` to dowiązanie — nie
uruchamiaj `npm ci`. Commit: `git -c user.name="radekizk-sketch" -c user.email="radek.izk@gmail.com"
commit --cleanup=verbatim`, stopka:
(stopka commita: dwie linie z bieżących wytycznych sesji — współautor i łącze sesji)
