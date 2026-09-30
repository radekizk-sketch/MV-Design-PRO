# Karta wykonawcza AB-1b.2 + AB-1d_min — fizyka GFL w rdzeniu dynamiki RMS i minimalna wyrocznia GFL dla FRT

> **Utrwalenie dla wznowienia (2026-09-30).** Treść karty powstała w katalogu roboczym sesji, który ginie z kontenerem; tu jest przeniesiona bez zmian merytorycznych. Ścieżki `<scratchpad>/…` i `<worktrees>/…` oznaczają katalogi tamtej sesji — nowa sesja podstawia własne (meldunki i logi karty nie przetrwały; dowodem wykonania jest commit i wpis rejestru `PLAN_AB_DYNAMIKA_A_B_2026-09.md` §7). Stan karty i kolejność prac: `STAN_REPO.md` §7 (pakiet wznowienia).
> **Stan 2026-09-30: NIE ROZPOCZĘTA.** Numeracja mutacji tej karty przesunięta mechanicznie o +30 przy utrwaleniu (O-49 pkt 10: pierwotne M22–M36 kolidowały z mutacjami AB-1b.1 w harnessie) — w treści M52–M66; odwołania „M10–M21” oznaczają zestaw istniejący w chwili pisania karty (2026-09-30: M10–M37, M38–M51 po AB-1b.3b, M67–M69 z karty DETERMINIZM-KATA-FAZORA; kolejne numery od M70). Start po odbiorze AB-1b.3b (wspólne pliki rdzenia dynamiki); Pakiet E (bieg kontrolny h/2 w biegu produkcyjnym) wymaga wcześniej karty DYNAMIKA-W-TLE (synteza architekta 2026-09-30, plan §2 O-57). Kolejność wiążąca: plan §5.

**Program:** `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` — §5 wiersze **AB-1b.2** (:335) i **AB-1d_min**
(:337); §2.1 O-5 (:87), O-7 (:89); §2.2 O-14 (:101), O-18 (:105), O-23 (:109), O-24 (:110); §2.3 O-29
(:125), O-33 (:129), O-38 (:134), O-42 (:138), O-44 (:140); §3a wiersze 2a–2f, 3, 4, 20–21, 23–24, 28
(:174–194); §4 (:268); §10 wiersz RMS/DAE (:512); §11 wiersze AB-1b i AB-1d_min (:525–526); §12.2
(:564–569). **Kontrakty:** `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md` §3b, §6, §7;
`docs/plan/W6_A_KONTRAKT_OBSERWABLI.md` §3.4 (:137–151), §5 (:214–229), §8 (:303–321), §9.3 (:355–361),
§13.6 (:485–495). **Zamrożenie:** `docs/plan/FINAL_DYNAMICS_CAPABILITY_FREEZE.md` wiersze C2 (:137, :197),
E1 (:157, :212), E6 (:162, :217), H4 (:173, :228), §9 (:356–381). **Dowód pomiarowy:**
`docs/audit/ab-raw/MACIERZ_LUK_DYNAMIKI_OPUS_2026-09-23.md` (P1; pozycje #2a–#4, #23–#24, #28; (a)6;
(b)4, (b)7, (b)12) oraz sondy S0–S3 tej karty (§0.0). **Data karty:** 2026-09-23. **Autor karty:** Claude
analityk (tryb tylko-odczyt, bez git). **Wykonawca:** wykonawca (subagent; pakiety 0,
A–H z własnymi bramkami; worktree `r10`; bez `git commit`/`push` — odbiór, weryfikacja i commit po
stronie integratora). **Baza:** pliki worktree `r10` odczytane 2026-09-23; karta nie wykonywała git, więc SHA
bazy zapisuje wykonawca w Pakiecie 0.

**Status rdzenia wobec B-01.** Pakiet `network_model/solvers/dynamika/**` NIE jest rdzeniem
zamrożonym B-01 — stoi OBOK rdzeni FROZEN (`dynamika/kontrakty.py:7-13`). Obowiązuje bramka planu
„L5 rdzenia D-01…D-07 zachowane" (§11 :525) i parytet biegów bez GFL (§0.14). Rdzenie FROZEN
rozpływu i zwarć — nietknięte (§3).

**Zależność od AB-1b.1 (karta równoległa — tu wyłącznie NAZWANE wymagania interfejsu, projekt
należy do AB-1b.1).** AB-1b.2 potrzebuje od AB-1b.1:

| Id | Wymaganie interfejsu | Konsument w tej karcie |
|----|----------------------|------------------------|
| Z1 | zdarzenia warunkowe deklarowane przez URZĄDZENIE: dozór `g(x, V)` urządzenia z kierunkiem przejścia (w górę / w dół), lokalizacja pierwiastka z tolerancją `tolerancja_lokalizacji_zdarzen_s` (nowe pole nastaw); wyzwolenie w tej samej chwili, gdy dozór jest przekroczony już w próbce prawostronnej zdarzenia planowanego (skok stymulusa, zwarcie) | automat wsparcia i automat odbudowy (§0.3, §0.4), crowbar (§0.13) |
| Z2 | tryby DYSKRETNE urządzenia jako część stanu scenariusza (nie wektora `x`), zmieniane zdarzeniem, z JEDNĄ reinicjalizacją algebry na chwilę (reguła `silnik.py:23-27`) | §0.3, §0.4, §0.13 |
| Z3 | zdarzenie przypisania stanu (D13) wywołane przejściem trybu, ciągłość pozostałych stanów (manifest D-06) | `i_bierny_przed_pu := i_bierny_pu(t)` (§0.3) |
| Z4 | timer: zdarzenie planowane względem chwili zdarzenia warunkowego (`t_g + τ`), anulowane przejściem trybu | τ_akt, τ_pod, τ_op, zwłoka i czas trwania crowbar |
| Z5 | emulator `ComplianceStimulus`: SEM za impedancją Z (S_k, X/R jako dane ze statusem); Z = 0 jako WIĘŹ napięciowa węzła; skoki i rampy SEM o zadanej chwili i prędkości | wzorce wyroczni AB-1d_min (§0.15), zwarcie metaliczne (§0.5b — ten sam mechanizm więzi, P3) |
| Z6 | próbki obustronne `t_e⁻`, `t_e⁺` w chwili zdarzenia | rejestrator gęstej siatki (§0.9) — JEDEN punkt wpięcia |

Brak któregokolwiek z Z1–Z6 = Pakiety C, E, F nie startują (kolejność §5 planu: AB-1b.1 → AB-1b.2).

---

## §0 Rozstrzygnięcia (nienegocjowalne w tej karcie)

### 0.0 Pakiet 0 — pomiar bazowy i testy padające na STARYM zachowaniu (przed jakąkolwiek zmianą)

Każda pozycja dostaje test pisany PIERWSZY, czerwony na dzisiejszym kodzie. Sondy S0–S3 wykonane
przez autora karty 2026-09-23 na tym worktree (środowisko `mv-design-pro-backend-0Imy6Sc1-py3.11`,
skrypt `scratchpad/ab1b2_sonda_p1.py`, wyjście `scratchpad/ab1b2_sonda_p1.out`):

**S0 — reprodukcja P1 (ogranicznik na zadaniu przed członami inercyjnymi).** Fikstura
`tests/network_model/dynamika/biblioteka_urzadzen.py:271-289` (`i_max = 1,2`, priorytet `bierna`),
układ `zloz_uklad`, zwarcie `X_f = 0,05 Ω` (`test_biblioteka_przebiegi.py:95`) trwające 150 ms,
`dt = 1 ms`, próbka co krok, `T_iq = 0,02 s`:

| T_p/T_iq | P = 0,10 | P = 0,20 | P = 0,25 | P = 0,30 |
|----------|----------|----------|----------|----------|
| 0,5 | 0,9997 | 0,9997 | 0,9997 | 0,9997 |
| 1,0 | 0,9997 | 0,9997 | 0,9997 | 0,9997 |
| 2,0 | 0,9997 | 0,9998 | 0,9998 | 0,9999 |
| 5,0 | 1,0019 | 1,0189 | **1,0399** | **1,0738** |
| 10,0 | 1,0094 | 1,0526 | 1,0907 | **1,1407** |

(wartości `max|I|/i_max`). P1 przeglądu (1,040 / 1,074) odtworzone co do trzeciej cyfry; przy
`T_p/T_iq = 10` przekroczenie sięga **+14,1 %** — więcej niż raportował przegląd. Test przypinający
`test_biblioteka_przebiegi.py:400-418` jest ślepy PODWÓJNIE: fikstura ma `T_p = 2·T_iq` (wiersz
0,9998–0,9999) i test czyta próbki wyjściowe (`krok_wyjscia_s = 0,005` przy `dt = 0,002`), a nie kroki
— wbrew nazwie „w żadnym kroku". To jest test maskujący = dwa defekty (CLAUDE.md, Zero-Debt pkt 5).
Nieprawdziwe twierdzenie w kodzie: `przeksztaltnik_gfl.py:473-482` („człon inercyjny daje średnią
ważoną … koło jest wypukłe, więc prąd rzeczywisty nie może z niego wyjść") — prawdziwe wyłącznie
dla `T_p = T_iq` bez ogranicznika tempa.

**S1 — statyzmy GFL bez przeliczenia bazy (defekt nowy, niewymieniony w planie).** `S_n = 30 MVA`,
`S_b = 100 MVA`, `droop_p_f_pu = 0,04`, martwa strefa 0,02 Hz, odchyłka PLL +0,52 Hz: ΔP = **−25,00
MW** (prawo urządzenia daje −7,50 MW); `droop_q_u_pu = 0,05`, martwa strefa 0,01 pu, U = 1,03:
ΔQ = **−40,00 Mvar** (prawo daje −12,00 Mvar); przy `S_n = S_b` obie wartości zgodne. Przyczyna:
`przeksztaltnik_gfl.py:266-270` i :273-275 dodają wynik statyzmu (moc względna URZĄDZENIA) do
`p_zadane_pu`/`q_zadane_pu`, które są w bazie UKŁADU (:388-389); docstring :429-433 twierdzi, że
„przeliczany jest WYNIK działania statyzmu" — nie jest. Ten sam parametr `regulacja_f.droop_pu`
magazynu jest przeliczany w torze GFM (`fabryka.py:702` → `przeksztaltnik_gfm.py:394`) i NIE jest w
torze GFL (`fabryka.py:682`). Klasa defektu = D-02/F-1 z R10 (baza równa bazie układu ukrywa błąd
kierunku), dotąd zamknięta wyłącznie dla maszyny.

**S2 — `prog_frt_pu = 0` przy `p_odbudowa_opoznienie_s > 0`:** surowy `ZeroDivisionError` już w
inicjalizacji (`przeksztaltnik_gfl.py:222` wołane z :393). Kontrakt ENM dopuszcza tę wartość
(`enm/dynamika_modele.py:238`, `ge=0.0`) — odmowa bez nazwy, klasa F-7/F-8.

**S3 — napięcie zaciskowe dokładnie 0:** `OdmowaDynamiki(dynamika.wartosc_nieskonczona)` z
`bazowe.py:82-88` (wołane `przeksztaltnik_gfl.py:262`). Zwarcie metaliczne w węźle jest odrzucane
wcześniej (`zdarzenia.py:160-168`, `dynamika.zwarcie_metaliczne_bez_admitancji`).

Pozostałe pozycje Pakietu 0 (testy czerwone dziś, bez sondy liczbowej):
- (a) brak kanałów `i_modul_pu`, `i_bierny_wsparcia_pu`, `ogranicznik_aktywny`, `f_pll_hz` —
  `silnik.py:572-625` wystawia wyłącznie stany, `p_pu`, `q_pu` (W6-A §13.6 :489 to przyznaje);
- (b) metryki wyłącznie na siatce wyjścia (`silnik.py:764-803`, `min(probki[...])`) — test z
  analitycznym minimum MIĘDZY próbkami wyjściowymi;
- (c) okno GFL `[0, S_n]` bez mocy dostępnej (`fabryka.py:813`; `enm/dynamika_modele.py:215-254`
  bez pola);
- (d) profil `der_dynamic` o `control_mode = "grid_forming"` mapuje się na `PrzeksztaltnikGFL`
  (`network_model/catalog/der_dynamic/models.py:226-267` zwraca zawsze GFL) — tożsamość złamana w
  katalogu, a wpisy katalogu przekształtników GFM wskazują właśnie te profile
  (`mv_converter_catalog.py:728-730`, :1049-1051, :1068-1070);
- (e) mapowanie katalogu gubi pola bez śladu (`models.py:246-267`: `frt_response_time_ms`,
  `iq_max_during_fault_pu`, `iq_priority_during_fault`) i wstawia zera nigdzie niezadeklarowane
  (wiatr: `droop_p_f_pu = 0,0`, `martwa_strefa_f_hz = 0,0`, `droop_q_u_pu = 0,0`,
  `martwa_strefa_u_pu = 0,0` — :415-418; `tlumienie_walu_pu = 0,0` — :427);
- (f) opóźnienie startu odbudowy jest członem inercyjnym, nie martwym czasem
  (`przeksztaltnik_gfl.py:32-41`, :323-340), wbrew opisowi pola ENM („Opóźnienie startu odbudowy P",
  `enm/dynamika_modele.py:244-246`) — test: P(t) rośnie w pierwszym kroku po powrocie napięcia;
- (g) W6-A §8 (:310) definiuje `i_bierny_wsparcia_pu` jako rzut I na `+j·V/|V|` — w konwencji kodu
  daje to `−i_bierny` (§0.1) — test konwencji znaku przypięty do rejestru kanałów.

Bramka Pakietu 0: testy nowe CZERWONE na bazie z zapisanym wyjściem (log w scratchpad wykonawcy);
pomiar bazowy parytetu (§0.14) zapisany jako złote odciski PRZED jakąkolwiek edycją; pełny harness
walidacji (`python -m tests.walidacja_fizyczna.uruchom`) i pełny zestaw mutacji M10–M21 zielone na
bazie (odniesienie dla bramki L5).

### 0.1 Konwencja osi, znaków i baz (O-23) — jedna definicja w kontrakcie

- Rama PLL: oś q wzdłuż `θ_PLL`, oś d = `θ_PLL − π/2` (`konwencje.py:15-21`, :43-45;
  `przeksztaltnik_gfl.py:9-13`).
- Stany: `i_c ≡ i_czynny_pu` = składowa **q**; `i_b ≡ i_bierny_pu` = składowa **d**
  (`prad_dq`, :288-290). Prąd wstrzykiwany (konwencja generacji):

      I = (i_b + j·i_c)·e^{j(θ−π/2)} = (i_c − j·i_b)·e^{jθ}        (:292-302)

- Po synchronizacji (`θ = arg V`, `V_d = 0`): `S = V·I* = |V|·(i_c + j·i_b)`, więc
  `P = |V|·i_c`, `Q = |V|·i_b`; **`i_b > 0` ⇔ `Q > 0` = oddawanie mocy biernej = wsparcie napięcia
  przy zapadzie**.
- Składowe zaciskowe (niezależne od ramy PLL, mierzalne na zaciskach):

      i_c^z = Re(V*·I)/|V| = P/|V|,     i_b^z = Im(V·I*)/|V| = Q/|V| = rzut I na kierunek −j·V/|V|

  (NIE na `+j·V/|V|` — korekta W6-A §8 :310, Pakiet H).
- Bazy: stany i ogranicznik w bazie UKŁADU `S_b` (`zbuduj_rdzen_gfl`, :435-455); NOWE kanały prądów
  urządzenia w bazie URZĄDZENIA: `i^(urz) = i^(ukł)·S_b/S_n`, jednostka tekstowa
  `"pu (I_n urządzenia)"` (kontrakt werdyktu §1 :82-85: gołe „p.u." odrzucane na poziomie rekordu).
  Istniejące kanały stanów zachowują klucz i jednostkę `"pu"`; ich `opis_pl` dostaje oś i bazę
  (parytet kluczy, §0.14).
- Etykiety „I_d/I_q" zakazane w kluczach kanałów, opisach i tekstach (test tekstowy rejestru
  kanałów; plan O-23). Zamrożenie C2 (:137) używa „`I_d`/`I_q`" — sprzeczność §6 pkt 16.
- Test przypięty: po synchronizacji `P = U·i_c` i `Q = U·i_b` do 1e-12; zapad → `Q > 0`.

### 0.2 Ogranicznik prądu na wektorze RZECZYWISTYM — dwa poziomy, jedna funkcja granicy

Oznaczenia: `I = i_max` (baza układu), `w(x) = √max(0, I² − x²)` — JEDNA funkcja
`zapas_podporzadkowanej(x, I)` w `przeksztaltnik_gfl.py`, używana przez (a), (b) i (c) (predykaty
parami, CLAUDE.md KLASA pkt 3). `n` = składowa nadrzędna wg `priorytet_ogranicznika` (A-9: `b` dla
`"bierna"`, `c` dla `"czynna"`), `s` = podporządkowana.

**(a) Poziom zadań — bez dzielenia przez U przed ograniczeniem (O-38).** Funkcja:

    iloraz_ograniczony(L, U, G) = sgn(L)·G,  gdy |L| ≥ G·U
                                = L/U,       w przeciwnym razie (wtedy U > |L|/G ≥ 0)
                                = 0,         gdy L = 0 ∧ U = 0

Priorytet `"bierna"`:

    r_b = iloraz_ograniczony(Q*, U, I)                      w trybach N, D   (§0.3)
    r_b = ogranicz(i_b,pre + Δi_wsp, −I, I)                 w trybach S, H   (bez dzielenia)
    r_c = iloraz_ograniczony(P*, U, w(r_b))

Priorytet `"czynna"` — role zamienione (`r_c` z granicą `I`, `r_b` z granicą `w(r_c)`).
`P*` = zadanie mocy czynnej po statyzmie P/f i oknie (§0.6, §0.7); `Q*` = zadanie mocy biernej
po statyzmie Q/U (§0.6). Zastępuje `zadania_pradu` + `ogranicz_prad` (:105-132, :258-286).

**(b) Poziom stanów — anti-windup na prądzie rzeczywistym.** Równania stanu:

    di_b/dt = (r_b − i_b)/T_iq
    di_c/dt = min( (r_c − i_c)/T_p , ρ_o )          ρ_o z automatu odbudowy (§0.4)
    |i_n| ≤ I                                        granica STAŁA (granice_stanow)
    |i_s| ≤ w(i_n)                                   granica ZALEŻNA od stanu nadrzędnego

Warunek nasycenia (trapez niejawny, iteracja Newtona na `(x₁, y₁)`), residuum swobodne
`R_s = i_s1 − i_s0 − (h/2)(f_s0 + f_s1)`:

    aktywna górna  ⇔  i_s1 ≥ +w(i_n1)  ∧  R_s ≤ 0
    aktywna dolna  ⇔  i_s1 ≤ −w(i_n1)  ∧  R_s ≥ 0

(komplementarność identyczna z `calkowanie.py:181-206`, granica liczona w bieżącej iteracji; zbiór
aktywny rośnie w obrębie kroku jak `zbior_z`, :472-483). Wiersz aktywny: `i_s1 ∓ w(i_n1) = 0`;
wiersz jakobianu: `e_s ∓ w'(i_n1)·e_n`, `w'(x) = −x/w(x)` dla `w > 0`; w narożniku `w = 0`
(`|i_n| = I` przypięte granicą stałą) wiersz `e_s` — ta sama gałąź co `ogranicz_prad` przy
„zapas ≤ 0" (:124-126). Rzutowanie w `rozloz` (:418-434) i w stadiach RK4 (:633, :643): najpierw
granice stałe, potem zależne `i_s := ogranicz(i_s, −w(i_n), +w(i_n))` — jedna funkcja rzutu.

**Niezmiennik:** po rzutowaniu `i_b² + i_c² ≤ I²` na KAŻDYM przyjętym kroku do zaokrąglenia
(`w` liczone tą samą funkcją). Kryterium testu: `max_𝒢 |I|/I − 1 ≤ 1e-12` na gęstej siatce §0.9.

**Rozszerzenie kontraktu rdzenia:** `Urzadzenie.granice_zalezne: tuple[GranicaKolowa, ...]`,
`GranicaKolowa(nadrzedny: str, podporzadkowany: str, promien_pu: float)` — adresowanie NAZWAMI
stanów (magazyn i turbina składają układ po nazwach: `magazyn.py:300`, `turbina_wiatrowa.py:424-433`);
składanie w `KontekstKroku` obok `granice_stanow` (`calkowanie.py:87-113`); przeniesienie w
`UrzadzenieOdlaczone` (`odlaczone.py:48-51`). Urządzenia bez granic zależnych zwracają `()` i ich tor
liczb pozostaje bitowo bez zmian (§0.14).

**Dlaczego tak, a nie inaczej:** (1) zerowanie pochodnej na granicy daje przestrzał rzędu `h/2·f`
(pomiar w `kontrakty.py:404-418`: Efd = 7,165 pu przy granicy 6,0 pu) — tylko wiersz algebraiczny
zbioru aktywnego dotrzymuje granicy dokładnie; (2) ciągłe przybliżenia rzutu wymagają szerokości
przejścia ε — liczba dobrana, zakazana; (3) postać biegunowa (moduł jako stan z granicą pudełkową)
jest osobliwa w `I = 0`, a punkt pracy `P = Q = 0` jest legalny; (4) granica zależna zachowuje
priorytet składowej z katalogu (A-9), czego rzut radialny by nie zrobił.

**(c) Kanał `ogranicznik_aktywny`** — kod o zamkniętym zbiorze {0, 1, 2, 3} (szeregi wyniku są
float-only, wzór `obserwable.py:119-137`): bit 0 = zadanie obcięte (w (a) wzięto gałąź nasycenia dla
którejkolwiek składowej), bit 1 = prąd rzeczywisty na granicy (`|i_n| = I` albo `|i_s| = w(i_n)` —
równość DOKŁADNA po rzutowaniu, ta sama funkcja `w`). Słownik `OPIS_OGRANICZNIKA_PL` przypięty
testem. Uzasadnienie kodu dwubitowego: W6-A §8 (:311) definiuje flagę na ZADANIU, a F-15 (:359)
wymaga „dokładnie wtedy, gdy |i| = i_max" — przy członach inercyjnych to dwa różne zjawiska (zadanie
obcięte, prąd jeszcze dojeżdża; prąd na granicy przy zadaniu wewnątrz koła — przypadek S0). Kod niesie
oba; F-15 przepisane (Pakiet H).

### 0.3 Automat wsparcia napięciowego (FRT): U_pre, strefa martwa, opóźnienie aktywacji, podtrzymanie, zwolnienie

**Nowe stany:** `u_pre ≡ u_pre_filtr_pu`; `i_b,pre ≡ i_bierny_przed_pu` (pochodna 0, wartość
nadawana przypisaniem Z3). **Tryby** (Z2) `m_w ∈ {N — praca normalna, D — wykryto (oczekiwanie τ_akt),
S — wsparcie, H — podtrzymanie (τ_pod)}`. **Dozór** (Z1):

    g_w(x, V) = |U − u_pre| − Δ_db          U = |V|,  Δ_db = martwa_strefa_frt_pu

**Przejścia:**

| Z | Do | Warunek | Skutek |
|---|----|---------|--------|
| N | D | `g_w` przez 0 w górę (albo `g_w > 0` w próbce prawostronnej zdarzenia planowanego) | przypisanie `i_b,pre := i_b(t)`; `u_pre` zamrożone; timer `t + τ_akt` (Z4). Przy `τ_akt = 0`: od razu N → S |
| D | S | timer `t_D + τ_akt` | zadanie bierne przełączone na prawo wsparcia |
| D | N | `g_w` przez 0 w dół przed upływem τ_akt | timer anulowany, wsparcie nie nastąpiło, filtr `u_pre` wznowiony |
| S | H | `g_w` przez 0 w dół | timer `t + τ_pod` |
| H | S | `g_w` przez 0 w górę | timer anulowany |
| H | N | timer `t_H + τ_pod` | regulacja Q wznowiona („zwolnienie") |

**Równania:**

    du_pre/dt = (U − u_pre)/T_upre      w trybie N;   0 w trybach D, S, H
    Δi_wsp    = −k·sm(U − u_pre, Δ_db)  w trybach S, H (sm = strefa_martwa, pochodne_kierunkowe.py:198-212)
    zadanie bierne:  Q*/U  (N, D)  |  i_b,pre + Δi_wsp  (S, H)   — przez ogranicznik §0.2(a)

`Δi_wsp > 0` przy zapadzie, `< 0` przy wzroście napięcia — HVRT tym samym prawem (kasacja osobnej
gałęzi `u_max_ciagle_pu` we `wsparcie_napieciowe`, :236-237). Regulacja Q jest w S i H ZAMROŻONA
(prąd sprzed zakłócenia + prąd dodatkowy) — struktura modeli generycznych WECC REEC_A (logika
„voltage dip") i IEC 61400-27-1 (tryb FRT), nazwana w `ZALOZENIA_RDZENIA` (`silnik.py:875-882`) i w
zakresie ważności. W H prawo daje `Δi_wsp = 0` (U w strefie), więc „podtrzymanie" = utrzymanie
zamrożonej regulacji Q przez τ_pod; „zwolnienie" = H → N i powrót `r_b = Q*/U` przez człon `T_iq`.
`Δ_db = 0` jest dopuszczalne i znaczy wsparcie przy każdej odchyłce od `u_pre` (w chwili 0 `g_w = 0`
nie jest przejściem, więc tryb startowy to N).

**Kanał `i_bierny_wsparcia_pu`** = `Δi_wsp·[m_w ∈ {S, H}]` w bazie urządzenia (prawo przed
ogranicznikiem) — F-16 (W6-A :360) jako porównanie algebraiczne 1e-12.

**Nowe pola `PrzeksztaltnikGFL` (ENM, wymagane, bez domyślnych — `scripts/dynamika_zero_default_guard.py`):**
`t_filtru_u_pre_s` (> 0), `martwa_strefa_frt_pu` (≥ 0), `t_aktywacji_iq_s` (≥ 0),
`t_podtrzymania_iq_s` (≥ 0). **Zmiana roli pól:** `prog_frt_pu` — próg trybu zapadu automatu
odbudowy (§0.4), nie próg prawa wsparcia; `k_frt` — wzmocnienie ΔI_b/ΔU poza strefą martwą, baza
urządzenia, przeliczane jak dziś (:440). Opisy pól ENM `tp_s` („filtr mocy czynnej", :239) i `tiq_s`
(„regulator Iq", :240) poprawione na „stała czasowa członu inercyjnego prądu czynnego / biernego".

**Rozdział pojęć (zakaz pomylenia, każde z własną nazwą w kodzie i kanałach):** strefa martwa
URZĄDZENIA `Δ_db` (fizyka, ENM) ≠ strefa martwa KRYTERIUM (profil, §0.9) ≠ `martwa_strefa_u_pu`
statyzmu Q/U ≠ `prog_frt_pu`; `u_pre` URZĄDZENIA (stan) ≠ U_pre KRYTERIUM (filtr z profilu, §0.9).

**Dlaczego automat, nie ciągłe przybliżenie:** `przeksztaltnik_gfl.py:35-41` twierdzi, że stała
czasowa „realizuje to samo opóźnienie" — fałsz: człon inercyjny odpowiada natychmiast (ułamkiem),
martwy czas nie odpowiada wcale do chwili τ; metryka „aktywacja" i „start odbudowy" na członie
inercyjnym byłaby z definicji zerowa. Protokół `Urzadzenie` nie znał czasu (:37-40) — tę lukę
zamyka Z1/Z4.

### 0.4 Automat odbudowy mocy czynnej (martwy czas + rampa)

Tryby `m_o ∈ {PRACA, ZAPAD, OCZEKIWANIE, RAMPA}`; dozór `g_o = U − U_prog` (`U_prog = prog_frt_pu`);
dozór końca rampy `g_r = (r_c − i_c)/T_p − r_P/U` (`r_P = p_odbudowa_pu_na_s`, baza układu, :444).

| Z | Do | Warunek |
|---|----|---------|
| PRACA | ZAPAD | `g_o` w dół |
| ZAPAD | OCZEKIWANIE | `g_o` w górę (timer `τ_op = p_odbudowa_opoznienie_s` — MARTWY CZAS) |
| OCZEKIWANIE | ZAPAD | `g_o` w dół (timer anulowany) |
| OCZEKIWANIE | RAMPA | timer `t + τ_op` |
| RAMPA | PRACA | `g_r` przez 0 w dół (ogranicznik tempa przestaje wiązać — gałęzie `min` równe, brak skoku pochodnej) |
| RAMPA | ZAPAD | `g_o` w dół |

`ρ_o`: PRACA `+∞`; ZAPAD `0`; OCZEKIWANIE `0`; RAMPA `r_P/U`. W RAMPA `U > U_prog ≥ 0` z konstrukcji
automatu — dzielenie przez U nie może trafić zera. `U_prog = 0` ⇒ `g_o ≥ 0` zawsze ⇒ ZAPAD
nieosiągalny ⇒ `ρ_o = +∞` (koniec S2). Kasacja stanu `odbudowa_zwolnienie_pu` i funkcji
`glebokosc_zapadu` (:91, :208-222, :322-340, :392-393, :397-401). Nazwane założenie zakresu
ważności: w ZAPAD i OCZEKIWANIE prąd czynny nie rośnie (`ρ_o = 0`) — to dotychczasowa semantyka
(„zwolnienie → 0 w zapadzie"), teraz jawna i przypięta testem.

### 0.5 Przejście przez zero napięcia (ZVRT) i zwarcie metaliczne (O-38)

**(a) Urządzenie.** Zadania prądu z §0.2(a) — ograniczenie PRZED dzieleniem. Moduł napięcia liczony
funkcją `modul_z_zerem` (nowa, obok `modul_niezerowy` w `bazowe.py:71-89`): wartość `|V|`, a w
`V = 0` wartość 0 i gradient 0 (0 należy do subróżniczki normy w zerze — wybór jawny, nazwany w
docstringu i w `ZALOZENIA_RDZENIA`). `modul_niezerowy` zostaje tam, gdzie zero jest fizycznie
niedopuszczalne (strumień szczeliny maszyny, `maszyna_synchroniczna.py:323`). PLL przy `V = 0`:
`ε = −V_d = 0` ⇒ `dθ/dt = ω₀·x_pll`, `dx_pll/dt = 0` — pętla na biegu jałowym z ostatnią odchyłką;
w zakresie ważności: „brak bloku zamrożenia PLL w zapadzie — kontrakt go nie niesie". KLASA: wejście
regulatora napięcia maszyny synchronicznej `|V|` (`maszyna_synchroniczna.py:429`) daje dziś tę samą
odmowę w węźle zwarcia metalicznego — ta sama funkcja `modul_z_zerem` (AVR przy `|V| = 0` ma
określone wejście 0).

**(b) Sieć: zwarcie metaliczne jako WIĘŹ napięciowa węzła k.** Wiersze KCL węzła k zastąpione przez
`Re V_k = 0`, `Im V_k = 0` spójnie w: `residuum_algebry` (`siec.py:280-291`), `jakobian_algebry`
(:294-339), jakobianie sprzężonym (`calkowanie.py:287-291` — wiersze bloku `dR_y/dx` węzła k
zerowe), `pochodna_napiec` (`obserwable.py:224-240`, `dV_k/dt = 0`), `reinicjalizuj`
(`reinicjalizacja.py:60`), predykacie wysp (`wyspy.py:110-198` — węzeł więziony zasila wyspę
rozwiązaniem `V = 0`). Prąd zwarcia `I_f,k = Σ_j Y_kj·V_j − I_inj,k` (residuum KCL więzionego węzła)
jako kanał `i_zwarcia_pu@k` (moduł, baza układu, dla węzłów ze zwarciem w harmonogramie — również
zwarcia admitancyjnego, `I_f = Y_f·V_k`; poza przedziałem zwarcia wartość 0 jest fizycznie
prawdziwa: brak drogi zwarciowej). Odmowa `zdarzenia.py:160-168` skasowana dla 3F metalicznego.
Mechanizm więzi jest TEN SAM co źródło idealne emulatora (Z = 0, Z5) — jeden kod (P3).

Odbiór o stałej mocy w węźle więzionym (`prad_odbioru_pu` dzieli przez `conj(V)`, `siec.py:226-231`):
nazwana odmowa `dynamika.odbior_w_wezle_zwarcia_metalicznego` (nowy kod w `KODY_ODMOW`,
`kontrakty.py:103-120`) do czasu modeli odbiorów AB-1b.3 — P4.

### 0.6 Przeliczenie baz statyzmów GFL (KLASA bazy)

Naprawa S1: wynik statyzmu P/f i Q/U wchodzi do zadań po przeliczeniu `× S_n/S_b` — równoważnie
statyzm przeliczony jak impedancja, ta sama konwencja co GFM (`przeksztaltnik_gfm.py:394-395`).
JEDNA konwencja dla GFL i GFM, więc `regulacja_f.droop_pu` magazynu znaczy to samo w obu torach
(`fabryka.py:682` i :702). Docstring `zbuduj_rdzen_gfl` (:426-434) przepisany do stanu faktycznego.

Inwentarz baz rdzenia GFL po karcie: `i_max` ✓ (:436), `k_frt` ✓ (:440), `p_odbudowa_pu_na_s` ✓
(:444), `droop_p_f_pu` ✗→✓, `droop_q_u_pu` ✗→✓, `p_rezerwa_pu` ✓ (`magazyn.py:147`), próg crowbar ✓
(`turbina_wiatrowa.py:490`), H turbiny ✓ (:511), GFM komplet ✓ (`przeksztaltnik_gfm.py:393-403`);
pola §0.3 (`T_upre`, `Δ_db`, τ) — bez bazy; `P_available` — MW → pu układu przez `konwencje.moc_pu`.
Test klasy: TO SAMO urządzenie fizyczne w `S_n = 0,3·S_b` i `S_n = S_b` daje identyczne przebiegi w
bazie urządzenia (bramka GF10, wzór G6 z R10).

### 0.7 Moc dostępna P_available (O-42; §3a #4)

- **ENM:** `Generator.p_dostepna_mw: float | None` (MW, ≥ 0), rodzeństwo `p_mw` — to jest wielkość
  WARUNKÓW PRACY (nasłonecznienie, wiatr), nie parametr urządzenia, więc NIE w `Generator.dynamika`.
  Walidator: dla rodzin `przeksztaltnikowa_gfl`, `wiatr_typ_3`, `wiatr_typ_4` —
  `p_mw ≤ p_dostepna_mw ≤ s_n_mva przekształtnika`; dla `magazyn`, `synchroniczna`,
  `przeksztaltnikowa_gfm` — pole musi być `None` (okno magazynu wynika z zasobnika).
- **Odcisk ENM:** pole w `_POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE["generators"]` (`enm/hash.py:78`) —
  modele bez pola haszują jak dziś. **Zapis:** allowlista `enm/domain_operations.py:9018`.
  **Scenariusz:** `Nastawa.p_dostepna_mw` (`enm/scenariusze.py:142-153`) — zmiana warunków bez zmiany
  modelu (`apply_scenario`, :660-705).
- **Brak pola** dla rodzin wymagających → brak MODELOWY w `braki_modelu_dynamiki`
  (`enm/adapter_dynamiki.py:224`) z nowym kodem adaptera `dynamika.moc_dostepna_brak` — ten sam
  predykat dla gotowości (`calculation_readiness/service.py:670-705`) i biegu; kod gotowości
  `der.moc_dostepna_missing` w rejestrze `domain/canonical_operations.py` (obok :1051-1081) i
  mapowanie etapu we FE `ui2/spaces/gotowosc/grupowanieCelow.ts:352-355`. Nigdy wartość zastępcza
  `P_av = S_n` (to jest dzisiejsza fabrykacja okna) ani `P_av = P0`.
- **Rdzeń:** `PunktPracyUrzadzenia.moc_dostepna_pu` (`fabryka.py:508-520`);
  `PunktPracy.moce_dostepne_pu` (`kontrakty.py:206-216`) — do `odcisk_punktu_pracy`
  (`tozsamosc.py:118-131`) dopisywane WYŁĄCZNIE gdy słownik niepusty (parytet §0.14).
- **GFL samodzielny:** okno `[0, min(S_n, P_av)]` (dziś `[0, S_n]`, `fabryka.py:813`);
  `stan_poczatkowy` odmawia `P0 > P_av` (`punkt_pracy_poza_ograniczeniem`).
- **Turbina typu 4 (i 3):** `p_aerodynamiczna_odniesienia_pu := P_av` (dziś `P0`,
  `turbina_wiatrowa.py:380`); kąt łopat w punkcie pracy z `P0 = P_av·(β_max − β₀)/(β_max − β_min)`
  (prawo :48-57, :262-267) — dziś `β₀ = β_min` (:379), czyli założenie pracy bez ograniczenia mocy.
  Okno elektryczne turbiny zostaje `[0, S_n]` (energia kinetyczna wirnika, :768).
- **Magazyn:** bez zmian (`magazyn.py:86-105`).
- **Przydział planu, nie odroczenie:** jednostronność LFSM-O wobec `P_av`, próg odrębny od strefy
  martwej i filtr f — AB-2 (O-5c, §5 :342).

### 0.8 Kanały (C2 zamrożenia; W6-A §8) — dla KAŻDEGO urządzenia z rdzeniem GFL

Mechanizm (zero `isinstance` w silniku): protokół `Urzadzenie` dostaje `kanaly_urzadzenia:
tuple[OpisKanalu, ...]` i `obserwable_urzadzenia(stan, V, tryby) -> dict[str, float]`;
`silnik._kanaly` (:572-625) i `_probkuj` (:687-711) czytają je generycznie; urządzenia bez obserwabli
zwracają `()`. Dotyczy: przekształtnik GFL samodzielny, magazyn z przekształtnikiem GFL, turbina typu
3 i 4 (wspólny `RdzenGFL` — `magazyn.py:231-233`, `turbina_wiatrowa.py:356-358`).

| Klucz | Przestrzeń | Jednostka | Definicja |
|-------|------------|-----------|-----------|
| `i_czynny_pu@g` (istnieje) | urzadzenie (x) | pu (baza układu) | składowa q ramy PLL; `opis_pl` z osią i bazą |
| `i_bierny_pu@g` (istnieje) | urzadzenie (x) | pu (baza układu) | składowa d ramy PLL, dodatnia = oddawanie Q |
| `u_pre_filtr_pu@g`, `i_bierny_przed_pu@g` | urzadzenie (x) | pu | nowe stany §0.3 |
| `i_modul_pu@g` | obserwabla (z) | pu (I_n urządzenia) | `√(i_b² + i_c²)·S_b/S_n` |
| `i_czynny_zaciski_pu@g`, `i_bierny_zaciski_pu@g` | obserwabla (z) | pu (I_n urządzenia) | `P/|V|`, `Q/|V|` (§0.1) |
| `jakosc_i_zaciski@g` | obserwabla (z) | kod | 0 dostępna; 2 niedostępna gdy `|V| ≤ u_V` — TA SAMA reguła domeny co częstotliwość (`obserwable.py:375-378`), jedna funkcja |
| `i_bierny_wsparcia_pu@g` | obserwabla (z) | pu (I_n urządzenia) | `Δi_wsp·[m_w ∈ {S, H}]` (§0.3) |
| `ogranicznik_aktywny@g` | obserwabla (z) | kod | {0, 1, 2, 3} (§0.2c) |
| `f_pll_hz@g` | obserwabla (z) | Hz | `f_n·(1 + k_p·ε + x_pll)` (`przeksztaltnik_gfl.py:204-206`) — pomiar urządzenia, nigdy zamiennik `f_hz@węzeł` (W6-A §3.4) |
| `tryb_wsparcia@g` | obserwabla (z) | kod | {0 N, 1 D, 2 S, 3 H} |
| `tryb_odbudowy@g` | obserwabla (z) | kod | {0 PRACA, 1 ZAPAD, 2 OCZEKIWANIE, 3 RAMPA} |
| `i_zwarcia_pu@k` | obserwabla (z) | pu (baza układu) | §0.5b, węzły ze zwarciem w harmonogramie |

Nazwa `f_pll_hz` (W6-A §8 :312), nie `f_pll` z wiersza planu (:335) — sprzeczność §6 pkt 17.
**Świadomie poza tą kartą, z powodem merytorycznym:** `i_modul_pu`/`ogranicznik_aktywny` GFM
(ograniczanie GFM jest algebraiczne — prąd = f(E, V, Z_w) bez członu między ogranicznikiem a prądem —
a naprawa jego fizyki „nasycenie dokładnie |I| = i_max" to AB-4a, O-42); `f_gfm_hz` i
`f_wirnika_hz` (W6-A §8 :313-315) — AB-4a/AB-5b. Dodanie ich teraz zmieniłoby zestaw kanałów biegów
bez GFL (§0.14) bez naprawy fizyki, której dotyczą.

### 0.9 Metryki na gęstej siatce (E1, E6; §3a #4, #28; O-29)

**Gęsta siatka 𝒢** = końce wszystkich PRZYJĘTYCH kroków (`silnik.py:219-235`) ∪ próbki obustronne
`t_e⁻`, `t_e⁺` każdego wykonanego zdarzenia (Z6). Między sąsiednimi punktami 𝒢 w obrębie przedziału
ciągłości — interpolacja liniowa (błąd O(h²), zgodny z rzędem trapezu, objęty `u` §0.10); nigdy przez
granicę zdarzenia (W6-A §5 :217-220). Rejestrator `dynamika/rejestrator.py` wołany z pętli silnika po
każdym przyjętym kroku i po obu stronach chwili zdarzenia; liczy WYŁĄCZNIE sygnały tanie (U węzłów
obserwowanych, P, Q, |I|, `i_b^z`, kody trybów i ogranicznika) — bez faktoryzacji LU obserwabli (koszt
§5). **Nigdy siatka wyjścia** (`krok_wyjscia_s`) — KLASA (b)7: istniejące `u_min_pu`, `t_u_min_s`,
`omega_max_pu`, `omega_min_pu`, `delta_max_rad` (`silnik.py:764-803`) przechodzą na 𝒢 (P2);
`delta_max_rad` zmienia wyłącznie siatkę, semantyka (kąt bezwzględny, nie kryterium) zostaje do
AB-5b (O-24).

**Metryki bezparametrowe (zawsze; per urządzenie z rdzeniem GFL, `element_ref` = urządzenie):**

| Klucz | Definicja |
|-------|-----------|
| `i_max_obs_pu@g`, `t_i_max_obs_s@g` | `max_𝒢 |I|` (pu I_n urządzenia) i chwila |
| `czas_ogranicznika_s@g` | miara zbioru `{t : ogranicznik_aktywny > 0}`; przejścia lokalizowane interpolacją odległości do granicy `I − |I(t)|` |
| `t_wykrycia_s@g`, `t_wsparcia_s@g`, `t_podtrzymania_s@g`, `t_zwolnienia_s@g` | chwile przejść N→D, D→S, S→H, H→N z dziennika zdarzeń warunkowych (lokalizacja Z1) — pierwsze wystąpienie w biegu; kolejne w `slad_white_box` |
| `t_zapadu_s@g`, `t_oczekiwania_s@g`, `t_rampy_s@g`, `t_pracy_s@g` | przejścia automatu odbudowy |
| `p_przed_pu@g` | `P(t_1⁻)`, `t_1` = pierwsza WYKONANA chwila zdarzenia planowanego biegu |
| `p_dostepna_pu@g`, `rezerwa_mocy_pu@g` | `P_av`, `P_av − P(t_1⁻)` (0 = brak zapasu — informacja dla kryterium odbudowy z ograniczeniem dostępnością) |
| `p_koncowe_pu@g`, `q_koncowe_pu@g`, `u_koncowe_pu@g`, `i_koncowe_pu@g` | wartości w `t_H` (horyzont) |
| `u_min_pu`, `t_u_min_s` (istnieją) | `min_𝒢 min_k |V_k|`, argmin — na 𝒢 |
| `u_max_pu`, `t_u_max_s` | `max_𝒢 max_k |V_k|` (E1) |

**Metryki parametryzowane — `DefinicjaMetrykFRT`** (wszystkie liczby jawne i wymagane — zakaz
domyślnych jak w kontraktach dynamiki; źródło: profil przez AB-1c, w tej karcie blok scenariusza —
P7): `urzadzenie`, `t_1`, `t_2` (początek i koniec zakłócenia — wskazane jawnie; dla scenariuszy z
harmonogramu: chwila zdarzenia i jego zdjęcia), `T_pre_k` (filtr U_pre kryterium), `Δ_k` (strefa
martwa kryterium), `K_ref` (wymagane wzmocnienie — tylko do progu aktywacji), `x_akt` (ułamek progu
aktywacji), `t_ust_k` (przesunięcie okna wzmocnienia), `k_odb` (ułamek `P_przed`), `x_lo`, `x_hi`
(ułamki gradientu), `ε_kon` (pasmo stanu końcowego), `pasmo_U = [U_lo, U_hi]` i `wezly_U` (E1).

    U_pre^k      = F_k[U](t_1⁻),  F_k = filtr I rzędu o stałej T_pre_k rozwiązany DOKŁADNIE dla
                   sygnału kawałkami liniowego na 𝒢 (rekurencja ścisła, nie całkowanie numeryczne)
    ΔU(t)        = U(t) − U_pre^k ;   s = sgn(−ΔU) (kierunek wymaganego wsparcia)
    t_db         = inf{ t ≥ t_1 : |ΔU(t)| > Δ_k }
    ΔI_b(t)      = i_b^z(t) − i_b^z(t_1⁻)                 (zaciski, pu I_n urządzenia)
    ΔI_wym(t)    = K_ref·(|ΔU(t)| − Δ_k)                  (dla |ΔU| > Δ_k)
    t_akt        = inf{ t ≥ t_db : s·ΔI_b(t) ≥ x_akt·ΔI_wym(t) } − t_db      ← OD STREFY MARTWEJ (O-29)
    K_eff_min    = min_{t ∈ [t_db + t_ust_k, t_2⁻], |ΔU|>Δ_k} s·ΔI_b(t)/(|ΔU(t)| − Δ_k), wraz z chwilą
    K_eff_kon    = s·ΔI_b(t_2⁻)/(|ΔU(t_2⁻)| − Δ_k)
    P_c          = P(t_2⁺)
    t_start      = inf{ t ≥ t_2 : P(t) − P_c ≥ x_lo·(P_przed − P_c) } − t_2
    t_hi         = inf{ t ≥ t_2 : P(t) − P_c ≥ x_hi·(P_przed − P_c) }
    gradient     = (x_hi − x_lo)(P_przed − P_c)/(t_hi − (t_2 + t_start))           [pu/s]
    t_odb        = inf{ t ≥ t_2 : P(t) ≥ k_odb·P_przed } − t_2
    przeregul.   = max_{t ≥ t_2} (P(t) − P_przed)⁺  (i w odniesieniu do P_przed)
    t_ust_P      = sup{ t ≥ t_2 : |P(t) − P(t_H)| > ε_kon } − t_2   (0 gdy zbiór pusty)
    t_odb_U(k)   = inf{ t ≥ t_2 : U_k(t) ∈ pasmo_U } − t_2 ;  t_ust_U(k) = sup{ t ≥ t_2 : U_k ∉ pasmo_U } − t_2

`inf` i `sup` lokalizowane interpolacją liniową między punktami 𝒢. **Niedostępność:** zbiór pusty
albo mianownik ≤ 0 w całym oknie → metryka w `metryki_niedostepne` z powodem („nieosiągnięta w
horyzoncie", „mianownik ≤ 0 w oknie"), nigdy wartość zastępcza. Rdzeń nie ocenia (zero werdyktu w
rdzeniu — `werdykt_wyjasnialny_guard`); kryteria i marginesy — AB-1c.

### 0.10 Niepewność numeryczna z połowienia kroku (O-14; kontrakt §6)

- **Bieg kontrolny:** `nastawy' = (dt/2, dt_min/2, dt_max/2, tolerancja/2, tolerancja_kroku/2,
  tolerancja_lokalizacji_zdarzen/2)`, pozostałe pola bez zmian (`eps_init`, `max_iteracji_newtona`,
  `max_nawrotow`, `horyzont_s`, `krok_wyjscia_s`, `integrator`). Funkcja rdzenia
  `uruchom_z_biegiem_kontrolnym(wejscie, definicje)` (`dynamika/bieg_kontrolny.py`) uruchamia DWA
  `SilnikDynamiki` (bez stanu między biegami — `silnik.py:32-35`).
- **Wartość raportowana** `m = m(h/2)`; `u = |m(h) − m(h/2)|`; próbki i kanały wyniku pochodzą z biegu
  DROBNIEJSZEGO (przebieg na wykresie zgodny z metryką). Dostępność różna w obu biegach → metryka
  niedostępna z powodem „rozstrzygnięcie zależne od kroku".
- **Kontrakt wyniku (addytywnie):** `Metryka`/`MetrykaDynamicznaV1` (`wynik.py:72-80`,
  `resultset_dynamic_v1.py:108-119`) + `niepewnosc: float | None`, `metoda_niepewnosci: str | None`
  (`"polowienie_kroku"`), `wartosc_biegu_grubszego: float | None`; `ResultSetDynamicV1` (:141-167) +
  `metryki_niedostepne: tuple[MetrykaNiedostepnaV1, ...]` i `bieg_kontrolny: BiegKontrolnyV1 | None`
  (nastawy obu biegów, ich odciski, liczby kroków). Ślad WHITE BOX: `m(h)` i `m(h/2)` per metryka.
- **Wpięcie produktu:** `_execute_dynamika_rms` (`enm/canonical_analysis.py:1813`) woła
  `uruchom_z_biegiem_kontrolnym` dla KAŻDEGO biegu `dynamika_rms` (P1).
- **Falsyfikacja twierdzenia O-14 (bramka GF7):** na trajektoriach analitycznych
  `|m(h/2) − m_ref| ≤ u`. Porażka = O-14 jest błędne i wraca do architekta strategicznego z pomiarem — ZAKAZ poszerzania
  tolerancji albo `u` o dobrany współczynnik.

### 0.11 Jedna tożsamość GFL/GFM (O-44; §3a #23–#24)

Inwentarz źródeł tożsamości (dziś CZTERY, nie dwa jak w planie): (1) ENM `Generator.dynamika.rodzina`
(+ `magazyn.przeksztaltnik.rodzina`; `wiatr_typ_3/4` = GFL) — konsument: rdzeń (`fabryka.py:795-850`);
(2) pole karty przekształtnika `control_mode == "GRID_FORMING"` (`materialized_params`) — konsument
V12.6 (`solver_input/v126_contracts.py:594-601`); to samo pole niesie TRYB REGULACJI Q
(`STALY_COS_PHI`, `Q_U_DROOP`, `Q_OF_U` — `mv_converter_catalog.py`, konsumenci
`network_model/solvers/power_flow_inverter.py:430-449`, `enm/assembler.py:325-333`), więc przekształtnik
GFM nie może mieć trybu Q; (3) `InverterDynamicProfile.control_mode` (`der_dynamic/models.py:126`) —
ignorowane przez mapowanie (Pakiet 0 d); (4) zdolność wyspowa `resolve_der_island_capability`
(`application/analyses/lv_domain/energization.py:149-172`: `meta.island_capability` →
`meta.control_mode` → `materialized_params.control_mode` → klasa maszyny).

**Reguła:** tożsamością jest RODZINA ENM, gdy blok `dynamika` istnieje; pozostałe źródła są z nią
WALIDOWANE: (a) karta przekształtnika dostaje osobne pole `rodzina_sterowania: Literal["GFL", "GFM"]`
(`network_model/catalog/types.py:1299-1325`), wartość `"GRID_FORMING"` znika z `control_mode`
(`control_mode` = wyłącznie tryb regulacji Q; porządkowanie trybów Q — AB-3) — P10; (b) walidator
modelu: `rodzina_sterowania` karty ≠ rodzina ENM → blokada gotowości
`generator.tozsamosc_gfl_gfm_niespojna`; (c) `resolve_der_island_capability` czyta rodzinę ENM, gdy
blok istnieje; (d) V12.6 czyta rodzinę ENM, gdy blok istnieje, inaczej `rodzina_sterowania` karty;
(e) profil katalogu `grid_forming` materializuje się WYŁĄCZNIE do `PrzeksztaltnikGFM` (§0.12). Test
iloczynu cech: rodzina ENM {GFL, GFM, magazyn-GFL, magazyn-GFM, wiatr 3, wiatr 4} × karta {GFL, GFM,
brak} × konsument {rdzeń, V12.6, energizacja, gotowość}.

### 0.12 Jedno źródło parametrów dynamicznych (O-44)

Dziś „kontrakt danych dynamiki żyje w trzech miejscach" (`kontrakty.py:24-29`), a mapowanie katalog →
ENM (`to_parametry_dynamiczne`, `der_dynamic/models.py:226-267`, :357-433) nie ma ani jednego
konsumenta w `src/` (wyłącznie `tests/catalog/test_der_dynamic.py:250-290`) — `Generator.dynamika` jest
dziś wpisywane wyłącznie surowym słownikiem przez operację domenową (`domain_operations.py:9012-9018`).

**Rozstrzygnięcie:** (1) ENM `PrzeksztaltnikGFL` dzieli się na `regulacja: RegulacjaGFL` (wszystkie
pola względne i czasowe — w tym nowe z §0.3) + `s_n_mva` + `proweniencja`; (2) szablon katalogu JEST
instancją tej samej klasy `RegulacjaGFL` (jedna definicja pól z konstrukcji, nie dwie klasy
pilnowane testem parytetu); analogicznie `RegulacjaGFM` (P5); (3) operacja domenowa
`przypisz_profil_dynamiczny(generator_ref, profile_id)` materializuje `Generator.dynamika` (kopia
szablonu + `s_n_mva` z karty przekształtnika + proweniencja `profil_typowy_normy`/`karta_producenta`
z `profile_id` i wersją); solver czyta WYŁĄCZNIE ENM; (4) pola szablonu bez konsumenta w modelu
kanonicznym (`frt_response_time_ms`, `iq_max_during_fault_pu`, `iq_priority_during_fault`,
`to_frt_parameters`, `to_stability_parameters`) zostają wyłącznie dla torów `frt_hvrt`/`stability_rms`
kasowanych w AB-1c (inwentarz O-44), z testem, że ich JEDYNYMI konsumentami są te tory; (5) zera
fabrykowane w mapowaniu wiatru (:415-418, :427) znikają — szablon wiatru niesie komplet
`RegulacjaGFL` albo się nie materializuje; (6) wartości nowych pól w profilach `DEFAULT_*` — WYŁĄCZNIE z
cytowanym dokumentem (wydanie, tabela) w `proweniencja.odniesienie`; brak źródła = profil nie
materializuje się (nazwana odmowa), nigdy liczba wymyślona; (7) szablony GFM (`defaults.py:76-97`,
:126-147) nie niosą `tryb`, `d_wirtualne_pu`, `r_wirtualne_pu`, `x_wirtualne_pu`,
`strategia_ograniczenia` → odmowa materializacji z listą braków, wpis bramki danych planu §12.1.

### 0.13 Crowbar — timery zamiast członów inercyjnych (reguła „cały moduł")

Karta dotyka `turbina_wiatrowa.py` (§0.7), a ten sam moduł realizuje zwłokę i czas trwania crowbar
członami inercyjnymi (`turbina_wiatrowa.py:59-67`, :187-250) — ten sam wzorzec co §0.3 (KLASA pkt 5:
uczciwość w obrębie pliku). Rozstrzygnięcie: wyzwolenie = dozór `|I| − I_prog` (Z1), zamknięcie okna
po `czas_zwloki_s` (Z4), zwolnienie po `czas_trwania_s` (Z4), okno domykane dyskretnie trybem (Z2);
kasacja stanu `crowbar_pu` i mieszania stałych (:233-250). Wielkość wyzwalająca (prąd przekształtnika
zamiast prądu wirnika, :69-72) — bez zmian, przebudowa DFIG w AB-3c (O-42). P10.

### 0.14 Parytet i determinizm

- **Rdzeń, biegi bez urządzeń z rdzeniem GFL (maszyny, GFM, magazyn-GFM, szyna sztywna):**
  `SilnikDynamiki.uruchom()` daje BITOWO (po kwantyzacji `tozsamosc.kwantyzuj`) te same `os_czasu_s`,
  `probki`, `kanaly`, `zdarzenia_wykonane`, `wlasnosci` (bez `czas_obliczen_s`) i cztery odciski
  wejścia (`odcisk_migawki`, `odcisk_punktu_pracy`, `odcisk_nastaw_solvera`, `odcisk_harmonogramu`).
  `odcisk_implementacji` zmienia się z konstrukcji (skrót źródeł pakietu, `tozsamosc.py:174-187`).
  Metryki: te same klucze; wartości zmieniają się wyłącznie przez przejście na 𝒢 (P2) — zmiana
  zadeklarowana z tabelą przed/po na wzorcach G1–G17.
- **Bramki G1–G13:** pomiary `bramki.zmierz()` CO DO BITU identyczne przed i po (zapis bazowy w Pakiecie
  0) — silniejsze niż „zielone".
- **Odcisk ENM** modeli bez GFL i bez `p_dostepna_mw` — bez zmian (`enm/hash.py`); modele z blokiem GFL
  zmieniają odcisk (nowe pola wymagane — bez kompatybilności wstecznej, fikstury przepisane).
- **Determinizm:** dwa biegi tej samej piątki odcisków → identyczny ładunek; test międzyprocesowy przy
  zmienionym `PYTHONHASHSEED` rozszerzony na bieg z GFL, trybami dyskretnymi i biegiem kontrolnym
  (wzór `tests/walidacja_fizyczna/test_zdarzenia.py::test_wynik_nie_zalezy_od_pythonhashseed`).

### 0.15 AB-1d_min — minimalna wyrocznia GFL dla FRT

**(a) Układ.** Stanowisko (`ComplianceStimulus`, Z5): SEM `E(t)` (kąt 0) za impedancją
`Z = R + jX` (baza układu; `|Z| = S_b/S_k`, `R = |Z|/√(1 + (X/R)²)`) i jeden GFL w węźle przyłączenia,
bez odbiorów. Równanie sieci (konwencja generacji): `V = E + Z·I`. Wyrocznia jest NIEZALEŻNA: plik
`tests/walidacja_fizyczna/wyrocznia_gfl.py` importuje wyłącznie `math`, `numpy`, `scipy` (zero importów
z `network_model.solvers.dynamika`, wzór `wyrocznia.py`); równania spisane z tej karty (§0.2–§0.4),
nie z kodu produktu. Stanowisko produktu `stanowisko_gfl.py` podaje te same parametry JAWNIE po obu
stronach (wzór `stanowisko.py:1-13`), z `S_n ≠ S_b` (ślepy punkt F-1).

**(b) Punkt stały w zapadzie z ogranicznikiem (Z > 0).** Po ustaniu przebiegów (PLL zsynchronizowany,
`θ = φ = arg V`, tryby S i ZAPAD, człony inercyjne ustalone):

    V = U·e^{jφ},  I = (i_c − j·i_b)·e^{jφ}  ⇒  U − Z·(i_c − j·i_b) = E_d·e^{−jφ}
    (F1)  (U − R·i_c − X·i_b)² + (X·i_c − R·i_b)² = E_d²
    φ = atan2(X·i_c − R·i_b, U − R·i_c − X·i_b)        (gałąź fizyczna: U − R·i_c − X·i_b > 0)

Prądy (priorytet `"bierna"`, zapad `U < u_pre − Δ_db`, `u_pre = U_0`, `i_b,pre = i_b0`, `i_c,pre = i_c0`
ze stanu ustalonego sprzed skoku SEM):

    i_b(U) = ogranicz(a − k·U, −I, I),   a = i_b0 + k·(U_0 − Δ_db)
    i_c(U) = min( i_c0 , iloraz_ograniczony(P*, U, w(i_b(U))) )     (ZAPAD: ρ_o = 0 — prąd czynny nie rośnie)

Gałęzie i rozwiązania:
- **B1** (`i_b` nienasycony, `i_c = i_c0`): kwadratowe `A·U² + B·U + C = 0`,
  `A = (1 + Xk)² + (Rk)²`, `B = −2(1 + Xk)(R·i_c0 + X·a) + 2Rk(X·i_c0 − R·a)`,
  `C = (R·i_c0 + X·a)² + (X·i_c0 − R·a)² − E_d²` — postać zamknięta;
- **B2** (`i_b` nienasycony, `i_c = P*/U`): po pomnożeniu (F1) przez `U²` wielomian 4. stopnia —
  pierwiastek skalarny (`scipy.optimize.brentq` na przedziale gałęzi);
- **B3** (`i_b` nienasycony, `i_c = w(a − k·U)`): pierwiastek skalarny;
- **B4** (`i_b = I`, `i_c = 0`): `U = X·I + √(E_d² − R²·I²)`, warunek istnienia `E_d ≥ R·I`;
  przy `R = 0` i priorytecie `"bierna"` B3 domyka się postacią zamkniętą
  `(1 + 2Xk)·U² − 2Xa·U + (X²·I² − E_d²) = 0`;
- priorytet `"czynna"` — gałęzie z zamienionymi rolami.
Wyrocznia wylicza WSZYSTKIE gałęzie, zachowuje pierwiastki spełniające warunki gałęzi i znak gałęzi
fizycznej, i ŻĄDA dokładnie jednego — inaczej przypadek jest poza domeną (wyjątek wyroczni, nie
wynik).

**(c) Stan przejściowy — człony inercyjne z opóźnieniem i ogranicznikiem (Z = 0, `V(t) = E(t)`).**
Przy więzi napięciowej i skoku samego modułu SEM kąt V jest stały, `V_d ≡ 0`, PLL nie jest pobudzony —
prądy odprzęgają się od sieci. Dla skoku w `t_f` do `U_d` (`t_D = t_f`, bo `g_w > 0` w próbce
prawostronnej):

    t ∈ [t_f, t_S), t_S = t_f + τ_akt (tryb D):
        r_b^D = iloraz_ograniczony(Q*(U_d), U_d, I),  r_c^D = iloraz_ograniczony(P*, U_d, w(r_b^D))
        i_b(t) = r_b^D + (i_b0 − r_b^D)·e^{−(t−t_f)/T_iq}
    t ≥ t_S (tryb S):
        r_b^S = ogranicz(i_b0 + k·(U_0 − Δ_db − U_d), −I, I)
        i_b(t) = r_b^S + (i_b(t_S) − r_b^S)·e^{−(t−t_S)/T_iq}
    i_c (ZAPAD, ρ_o = 0):  di_c/dt = min((r_c − i_c)/T_p, 0),  |i_c| ≤ w(i_b(t))
        swobodnie: i_c(t) = r_c + (i_c(t_0) − r_c)·e^{−(t−t_0)/T_p}  gdy r_c < i_c,   i_c = const  gdy r_c ≥ i_c
        odcinek PRZYPIĘTY (stan przejściowy ogranicznika — przypadek S0):
            wejście t₁*: i_c^swob(t₁*) = w(i_b(t₁*))
            na odcinku:  i_c(t) = √(I² − i_b(t)²)                 (postać zamknięta)
            wyjście t₂*: pierwiastek skalarny  min((r_c − w)/T_p, 0) = dw/dt,
                         dw/dt = −i_b(t)·(di_b/dt)/w(i_b(t))
            po wyjściu: prawo swobodne od i_c(t₂*) = w(i_b(t₂*))

`Q*(U_d)` liczy statyzm Q/U z nasyceniem pasmem (`przeksztaltnik_gfl.py:240-256`) z bazą §0.6.

**(d) Odniesienie ΔU do filtrowanego U_pre.** Wzorzec: skok SEM `U_0 → U_1` w `t_0` z
`|U_1 − U_0| < Δ_db` (bez wykrycia), zapad w `t_f`:
`u_pre(t_f) = U_1 + (U_0 − U_1)·e^{−(t_f − t_0)/T_upre}` i cel wsparcia z `u_pre(t_f)`, nie z `U_1`.
Wzorzec rampy (lokalizacja wykrycia, M55): SEM maleje od `t_r` z prędkością `|ρ_E|`, filtr śledzi,
`g_w(t) = |ρ_E|·T_upre·(1 − e^{−(t−t_r)/T_upre})`, więc
`t_D = t_r − T_upre·ln(1 − Δ_db/(|ρ_E|·T_upre))` (warunek `Δ_db < |ρ_E|·T_upre`) — postać zamknięta.

**(e) Odbudowa P.** Powrót SEM do `U_0` w `t_2`: S → H w `t_2` (gdy `|U_0 − u_pre| < Δ_db`), H → N w
`t_2 + τ_pod`; ZAPAD → OCZEKIWANIE w `t_2`, RAMPA w `t_2 + τ_op`; w RAMPA
`i_c(t) = i_c(t_R) + (r_P/U_0)·(t − t_R)` do `i_c* = r_c − T_p·r_P/U_0`, dalej
`i_c = r_c − (T_p·r_P/U_0)·e^{−(t − t*)/T_p}`; z granicą kołową §0.2(b) jak w (c), dopóki `i_b` nie
opadnie. Postacie zamknięte + pierwiastki skalarne.

**(f) ZVRT.** Więź `V = 0` (Z = 0, `E_d = 0`, albo zwarcie metaliczne na zaciskach): w trybie S
`r_b = ogranicz(i_b0 + k·(U_0 − Δ_db), −I, I)`, `r_c = sgn(P*)·w(r_b)` (albo 0 dla `P* = 0`); w trybie D
`r_b = sgn(Q*)·I` (0 dla `Q* = 0`), `r_c = sgn(P*)·w(r_b)`; `f_pll = f_n·(1 + x_pll)`; prąd zwarcia
równy sumie wstrzyknięć węzła. Bieg MUSI się wykonać (dziś odmowa — S3).

**(g) Z > 0, przebieg przejściowy — druga droga numeryczna tej samej wyroczni.** Sprzężenie
`V = E + Z·I` jest algebraiczne, więc układ ma stany `(i_b, i_c, θ, x_pll, u_pre)` + tryby. Wyrocznia
spisuje te równania NIEZALEŻNIE (ramy dq wg §0.1) i całkuje `scipy.integrate.solve_ivp` (Radau,
`rtol = atol = 1e-12`), tryby i granica kołowa przez funkcje `events` z `terminal=True` i restartem
(wzór wyroczni CCT D-04 — DOP853/Radau). Jest to niezależna implementacja tych samych równań inną
metodą, nie druga niezależna droga w sensie O-7 (tą jest ANDES w AB-1d).

**(h) Tolerancje — wyprowadzone, nie dobrane:**
- punkt stały (GF1): produkt po `≥ 30·max(T_p, T_iq, T_PLL)` od skoku, z pomiarem
  `max|dx/dt| ≤ 1e-10 s⁻¹`; tolerancja `1e-8 pu` = tolerancja Newtona stanowiska (1e-10) × zmierzone
  wzmocnienie `J⁻¹` (≤ 8,4 — `obserwable.py:41-44`) plus resztka przebiegu `≤ 1e-10·max T`, z zapasem
  10×;
- przebiegi (GF2–GF5, GF9): SPÓJNOŚĆ Z NIEPEWNOŚCIĄ — w każdym punkcie porównania
  `|q(h/2) − q_orc| ≤ |q(h) − q(h/2)| + 10·tolerancja` (twierdzenie O-14 sprawdzone na wyroczni);
  dodatkowo drabina rzędu na odcinkach gładkich: `e(h)/e(h/2) ≥ 1,5` (rząd ≥ ~0,6 — wykrywa utratę
  zbieżności, nie wymaga pełnego rzędu 2 na załamaniach);
- niezmiennik koła (GF6): `max_𝒢 |I|/I − 1 ≤ 1e-12` (≈ 4500 ulp — rzut jest ścisły, każde naruszenie
  fizyczne jest rzędu 1e-3 i więcej, S0);
- tożsamości (GF10, GF11): `1e-12` względnie.

**(i) Domena D-11 (propozycja do decyzji P8; może się wyłącznie ZWĘŻAĆ po pomiarze).** Dane w module
produkcyjnym `network_model/solvers/dynamika/walidacja/domena_d11.py` (jedno źródło; manifest testowy
importuje), predykat `nalezy_do_domeny_d11(parametry_biegu) -> WynikDomeny(nalezy, powody)` liczony w
rdzeniu i niesiony w wyniku per urządzenie (AB-1c tylko czyta — zero algebry w warstwie analizy):

| Parametr | Zakres | Uzasadnienie |
|----------|--------|--------------|
| tryb | stanowisko (`ComplianceStimulus`, SEM za Z) | wyrocznia sformułowana dla źródła Thevenina; tryb sieci (odbiory, inne źródła) poza domeną do AB-1d |
| SCR = S_k/S_n | [3; 50] ∪ {∞ (Z = 0)} | poniżej 3 synchronizacja PLL w sieci słabej to AB-5b (O-42); 50 = brzeg siatki przemiatania |
| X/R | [1; ∞] (R = 0 dopuszczone) | brzeg siatki |
| głębokość `E_d/E_0` | [0; 0,9]; przy `R > 0` dodatkowo `E_d > R·I` | warunek istnienia gałęzi B4 (b); `E_d = 0` tylko dla `R = 0` |
| `P_0/S_n`; `Q_0/S_n` | [0; 1]; [−0,33; 0,33] | |
| `i_max` (baza urządzenia); priorytet | [1,0; 1,5]; {bierna, czynna} | zakres pola ENM [1; 3] zawężony do przemiatanego |
| `T_iq`; `T_p/T_iq` | [0,005; 0,1] s; [0,5; 20] | S0: defekt ujawnia się od 5 |
| `k_frt`; `Δ_db`; `τ_akt`; `τ_pod` | [0; 6]; [0; 0,1]; [0; 0,1] s; [0; 1] s | |
| `T_upre`; `τ_op`; `r_P`; `U_prog` | [0,1; 60] s; [0; 1] s; [0,1; 10] pu/s; [0,5; 0,9] | |
| PLL `k_p`; `k_i` | [6; 50]; [60; 2500] | wartości istniejących wzorców repo: fikstura 6/60 (`biblioteka_urzadzen.py:275-276`), SO-1A 50/500 (`so1a_pv_magazyn.py:90-91`) |
| statyzmy `droop_p_f`; `droop_q_u` | [0; 0,1]; [0; 0,2] | |
| `S_n/S_b` | {0,3; 1} | mutacja bazy (M58) |
| zdarzenia | skok SEM, rampa SEM `|ρ_E|` ∈ [0,5; 50] pu/s, powrót | |

Istnienie i jednoznaczność punktu stałego są SPRAWDZONE na siatce przemiatania (narożniki i punkty
środkowe wymiarów wiodących + przebieg jednoczynnikowy pozostałych), nie dowiedzione w całej domenie
— zapis w `uwagi` manifestu.

**(j) Twierdzenia manifestu (`tests/walidacja_fizyczna/manifest.py`, rodzina D-11):**

| Id | Zdolność | Równanie | Wyrocznia | Bramka | Mutacje | Poziom |
|----|----------|----------|-----------|--------|---------|--------|
| D-11.1 | konwencja osi i baz kanałów GFL | §0.1; `i^(urz) = i^(ukł)·S_b/S_n` | tożsamości algebraiczne z V i I biegu | GF10, GF11 | M58, M62 | L5 (własność implementacji) |
| D-11.2 | koło prądu na stanach — niezmiennik na każdym kroku | §0.2(b) | odcinek przypięty w postaci zamkniętej (c) + niezmiennik | GF2, GF6 | M53, M54 | L5 (własność implementacji) |
| D-11.3 | punkt stały w zapadzie z ogranicznikiem | (F1) + gałęzie B1–B4 | postaci zamknięte / `brentq` (b) | GF1 | M52, M54, M56, M58 | L4 |
| D-11.4 | odpowiedź I_q z opóźnieniem aktywacji | §0.3, (c) | wykładnicze kawałkami (Z = 0); niezależne całkowanie (g) (Z > 0) | GF3, GF9 | M55, M59 | L4 |
| D-11.5 | ΔU wobec filtrowanego U_pre | §0.3, (d) | filtr w postaci zamkniętej | GF4 | M60 | L4 |
| D-11.6 | odbudowa P: martwy czas + rampa + człon inercyjny | §0.4, (e) | postaci zamknięte | GF5 | M57 | L4 |
| D-11.7 | ZVRT: U = 0 bez odmowy | §0.5, (f) | wartości zamknięte przy U = 0 | GF8 | M61, M66 | L4 |
| D-11.8 | metryki na 𝒢 i niepewność z połowienia | §0.9, §0.10 | metryki analityczne na przebiegach (c)–(e) | GF7 | M63, M64, M65 | L5 (własność implementacji) |
| D-11.9 | parytet biegów bez GFL i determinizm z trybami | §0.14 | odciski złote sprzed zmiany; powtórzenie międzyprocesowe | test parytetu | — | L4 (jak D-10: brak mutacji falsyfikującej) |

Poziom wycinka **FRT-B = min(D-11.1…D-11.8) = L4** w domenie D-11 (plan :337, O-7, O-33). Twierdzenia
wierności modelu PPM (D-11.3…D-11.7) mają L4 z `uwagi`: „druga niezależna droga (ANDES REGC/REEC) —
AB-1d"; własności implementacji (D-11.1, D-11.2, D-11.8) spełniają kontrakt L5 z jedną wyrocznią
analityczną (jak D-01…D-07). Reguła PPM w manifeście: pole `drogi_niezalezne: int` i test „twierdzenie
rodziny PPM o wierności modelu ma L5 wyłącznie przy `drogi_niezalezne ≥ 2`" (P9). Poziom i domena
wycinka są danymi PRODUKCYJNYMI: wpis zdolności `dynamika_rms.gfl_frt_stanowisko` w
`solver_input/provenance.py` (obok :339-354; `EvidenceTier.UNVALIDATED_MODEL` wg tabeli kontraktu §3b
dla L4) + `walidacja/manifest_gfl.py` (poziomy, domena) importowany przez manifest testowy — AB-1c
odmawia werdyktu FRT, gdy poziom wycinka < L4 albo bieg poza domeną (O-7, O-33).

**(k) Mutacje (każda MUSI być ZABITA; wzorce tekstowe dopisuje wykonawca po napisaniu kodu —
`test_mutacje.py::test_wzorzec_mutacji_wystepuje_w_zrodle`):**

| Id | Defekt fizyczny (lista planu) | Plik | Oczekiwany detektor |
|----|-------------------------------|------|---------------------|
| M52 | **znak**: `Δi_wsp = +k·sm(U − u_pre, Δ_db)` | `przeksztaltnik_gfl.py` | GF1, GF3 |
| M53 | **ogranicznik — limit przed inercją**: `granice_zalezne` zwraca `()` | `przeksztaltnik_gfl.py` | GF6 (`T_p/T_iq = 10`: dziś 1,1407), GF2 |
| M54 | **ogranicznik — priorytet**: granica stanów z priorytetem przeciwnym do zadań | `przeksztaltnik_gfl.py` | GF2, GF1 (priorytet `czynna`) |
| M55 | **czas zdarzenia**: dozór strefy martwej wyzwalany na końcu kroku zamiast w pierwiastku | punkt wpięcia dozorów urządzenia (Z1) | GF3 na wzorcu rampy (d) |
| M56 | **wzmocnienie I_q**: strefa martwa pominięta w prawie (`k·(u_pre − U)`) | `przeksztaltnik_gfl.py` | GF1, GF3 przy `Δ_db > 0` |
| M57 | **odbudowa**: tempo odbudowy przyłożone do prądu bez dzielenia przez U | `przeksztaltnik_gfl.py` | GF5 (`U_0 = 1,05`) |
| M58 | **baza**: `i_max` albo wynik statyzmu przeliczony w złym kierunku | `przeksztaltnik_gfl.py` | GF10, GF1 (`S_n = 0,3·S_b`) |
| M59 | **opóźnienie = 0**: przejście N → S z pominięciem timera | `przeksztaltnik_gfl.py` | GF3 |
| M60 | ΔU wobec `U(t_D⁻)` zamiast `u_pre` | `przeksztaltnik_gfl.py` | GF4 |
| M61 | ZVRT: dzielenie `P*/U`, `Q*/U` przed ograniczeniem | `przeksztaltnik_gfl.py` | GF8 (odmowa = zabicie) |
| M62 | etykieta osi: `i_czynny_zaciski_pu` ↔ `i_bierny_zaciski_pu` | `przeksztaltnik_gfl.py` | GF11 |
| M63 | `t_akt` liczony od `t_1` zamiast od `t_db` | `rejestrator.py`/`metryki_frt.py` | GF7 (wzorzec rampy, `t_db > t_1`) |
| M64 | wartość metryki z biegu GRUBSZEGO | `bieg_kontrolny.py` | GF7 (`|m(h) − m_ref| ≈ 4/3·Δ > u`) |
| M65 | metryka na siatce wyjścia zamiast 𝒢 | `rejestrator.py` | GF7 (minimum analityczne między próbkami) |
| M66 | więź napięciowa bez zastąpienia wiersza KCL | `siec.py` | GF8 |

Mutacja „symetria strefy martwej" (LFSM-O) — AB-2; „η_ch ↔ η_dis", „nasycenie GFM" — AB-4a;
„crowbar" — AB-3c (plan §10 :512).

**(l) Bramka CI.** Bramki GF1–GF11 w `tests/walidacja_fizyczna/bramki.py` (rejestr `BRAMKI`, :533;
prefiks „GF", bo „G17" jest już nazwą sieci wzorcowej SO-1A); ich zestaw zredukowany (GF6 na 24
punktach: `T_p/T_iq` {1; 5; 20} × P {0,25; 0,8} × priorytet × `i_max` {1,0; 1,2}) w obowiązkowym jobie
`pytest`; pełna siatka GF6 i komplet mutacji M52–M66 w jobie mutacji (`.github/workflows/python-tests.yml:345-401`
— budżet czasu zmierzony, osobny job `mutacje-dynamiki-gfl`, jeśli 45 minut nie wystarcza); `uruchom.py`
(:59-80) z krokiem „bramki GFL".

---

## §1 Inwentarz klasy (miejsca dzielące mechanizm — komplet, nie przykład)

| Mechanizm | Miejsca (plik:linia) |
|-----------|----------------------|
| model GFL (rdzeń wspólny) | `backend/src/network_model/solvers/dynamika/urzadzenia/przeksztaltnik_gfl.py`: docstring :1-54 (fałszywe :35-41, :49-53), stany :84-102, `ogranicz_prad` :105-132, `RdzenGFL` :135-182, PLL :186-206, `glebokosc_zapadu` :208-222 (kasacja), `wsparcie_napieciowe` :224-238, statyzm Q/U :240-256, `zadania_pradu` :258-278, `prady_zadane` :280-286, prąd/moc :288-310, `rownania` :314-341, `stany_rownowagi` :345-394, `_uklad_stanow_gfl` :397-401, `zbuduj_rdzen_gfl` :404-455 (docstring fałszywy :429-433), `PrzeksztaltnikGFL` :458-570 (granice fałszywe :471-483) |
| konsumenci rdzenia GFL (KLASA — trzech) | `urzadzenia/magazyn.py` :60, :69, :195, :217, :231-233, :246, :300; `urzadzenia/turbina_wiatrowa.py` :91-95, :290, :311, :337-358, :368-383, :424-433, :493; `urzadzenia/fabryka.py` :50, INWENTARZ_POL GFL :160-195, `ParametryGFL` :382-418, `PunktPracyUrzadzenia` :508-520, `_rdzen_przeksztaltnika_gfl` :528-559, magazyn-GFL :676-684, turbina :720-772, GFL samodzielny :805-814, `moc_znamionowa_rodziny_pu` :855-880 |
| ograniczniki stanów w całkowaniu | `kontrakty.py` `Urzadzenie.granice_stanow` :397-422; `calkowanie.py` `granice_stanow` :87-113, `maska_nasycenia` :181-206, `rzutuj_stany` :209-211, jakobian sprzężony :235-311 (wiersze aktywne :271-275), `rozloz` :418-434, `residuum` :456-470, `zbior_z` :472-483, RK4 :624-643; `urzadzenia/odlaczone.py` :48-51; granice każdego urządzenia: GFL :471-483, GFM, magazyn :177-195, turbina :301-317, maszyna synchroniczna, maszyna klasyczna, szyna sztywna (wszystkie dostają `granice_zalezne = ()` poza rdzeniem GFL) |
| opóźnienia modelowane członem inercyjnym | GFL `p_odbudowa_opoznienie_s` :32-41, :323, :336-340; crowbar `turbina_wiatrowa.py` :59-67, :187-250 |
| dzielenie przez U / moduł w zerze | `przeksztaltnik_gfl.py` :262, :278, :324 (:357-363 — tylko inicjalizacja, U > 0); `bazowe.py` :71-89; `maszyna_synchroniczna.py` :429 (AVR) i :323 (strumień — zostaje); odbiór PQ `siec.py` :226-231 |
| sieć i więź zwarcia metalicznego | `zdarzenia.py` :153-169 (odmowa), :170-203; `siec.py` :94-202 (składanie — więź NIE jako admitancja), :262-277, :280-291, :294-339, :342-456, :459+ (KCL niezależne); `calkowanie.py` :287-291; `reinicjalizacja.py` :60; `obserwable.py` :179-311 (pochodna napięć), :375-378 (domena); `wyspy.py` :110-198; `kontrakty.py` `KODY_ODMOW` :103-120, `ZwarcieWezla` :224-240 |
| przeliczenie baz | `przeksztaltnik_gfl.py` :266-270, :273-275, :388-389, :435-455; `przeksztaltnik_gfm.py` :393-403; `fabryka.py` :682, :702; `magazyn.py` :147; `turbina_wiatrowa.py` :490, :511; `konwencje.py` :54-150 |
| kanały i próbki | `silnik.py` `_kanaly` :572-625, `_kanaly_obserwabli` :627-685, `_probkuj` :687-711, `_probkuj_obserwable` :713-762, `jednostka_stanu` :885-900; `wynik.py` `KanalWyniku` :26-34 |
| metryki i niepewność | `silnik.py` `_metryki` :764-803, pętla :179-257, `uruchom` :126-296, `ZALOZENIA_RDZENIA` :875-882; `calkowanie.py` `blad_lokalny` :689-711 (połowienie wyłącznie do sterowania krokiem); `wynik.py` `Metryka` :72-80, ładunek :98-168; `obserwable.py` estymaty `u_V`/`u_f` :41-84 |
| kontrakt wyniku i API | `application/contracts/resultset_dynamic_v1.py` :51-60, :108-119, :141-167, :170-190; `enm/canonical_analysis.py` :1782-1840 (`uruchom` :1813); `api/canonical_run_views.py` :482-495 (`results/dynamika`, `time-series`); `infrastructure/persistence/repositories/canonical_run_repository.py` (tabela szeregów — nowe kanały); `solver_input/provenance.py` :339-354, :369-388 |
| tożsamość i odciski | `tozsamosc.py` :75-131, :174-187, :202-213; `enm/hash.py` :60-80 |
| kontrakt ENM | `enm/dynamika_modele.py` GFL :209-263 (`prog_frt_pu` :238, `tp_s` :239, `tiq_s` :240, opóźnienie :244-246), GFM :266-292, magazyn :300-360, turbina :368-426, unia :433-449; `enm/models.py` :627-635; `enm/domain_operations.py` :8998-9018; `enm/scenariusze.py` `Nastawa` :142-153, `ScenariuszDynamiczny` :275-345, projekcja opcji :796-801; `enm/adapter_dynamiki.py` kody :129-189, `braki_modelu_dynamiki` :224-340, `_moce_urzadzen_pu` :913, `zloz_urzadzenia` :988-1080, `zloz_wejscie_dynamiki` :1103-1154, `zalozenia_wejscia` :1157-1185; `enm/validator.py` (walidacja tożsamości) |
| katalog `der_dynamic` | `network_model/catalog/der_dynamic/models.py` :102-104, :118-267 (mapowanie :226-267), :270-433 (zera :415-418, :427); `defaults.py` :53-147 i profile wiatru; `resolver.py` :119-152; `__init__.py` :1-18 (konsumenci `frt_hvrt`/`stability_rms` — kasacja AB-1c) |
| katalog przekształtników i tożsamość | `network_model/catalog/types.py` :1299-1325, :1522, :1602; `mv_converter_catalog.py` :66-110, :726-730, :1047-1051, :1066-1070; `catalog/repository.py` :197-205; `api/catalog.py` :476, :1298 |
| konsumenci tożsamości GFL/GFM | `solver_input/v126_contracts.py` :594-601; `application/analyses/lv_domain/energization.py` :95-172; `enm/assembler.py` :325-333; `network_model/solvers/power_flow_inverter.py` :430-449; FE `frontend/src/ui/sld/v3/lv-domain/{LvDomainView.tsx,composeLvDomainScene.ts,types.ts}`, `frontend/src/ui/network-build/station-der/{AddDerWizard.tsx,catalogs.ts,derRemoteCatalogs.ts,audit2-api.ts}` |
| gotowość | `application/calculation_readiness/service.py` :670-760 (`_check_frt_hvrt` :630-668 — kasacja AB-1c); `domain/canonical_operations.py` :1045-1081; FE `frontend/src/ui2/spaces/gotowosc/grupowanieCelow.ts` :352-355 |
| typy FE | `frontend/src/types/enm.ts` :535-560 (`PrzeksztaltnikGFL`), :570-640 (GFM, magazyn, turbina, unia) — lustro kontraktu ENM; brak edytora `dynamika` w UI (tylko typy) |
| dokumenty | `docs/plan/W6_A_KONTRAKT_OBSERWABLI.md` §8 :303-321, §9.3 :355-361, §13.6 :485-495; `docs/plan/FINAL_DYNAMICS_CAPABILITY_FREEZE.md` C2 :137, E6 :162 (stan po karcie w §7 planu, nie przepisywanie zamrożenia); plan §7 (rejestr postępu); `backend/tests/walidacja_fizyczna/README.md` |
| aparat walidacji | `tests/walidacja_fizyczna/manifest.py` :1-231; `test_manifest.py` :45-86; `mutacje.py` :57-178; `test_mutacje.py` :27; `bramki.py` PROGI :24-81, rejestr :533-592; `stanowisko.py`; `wyrocznia.py` (wzorzec niezależności); `uruchom.py` :59-80; `.github/workflows/python-tests.yml` :345-401 (ścieżka od korzenia repozytorium) |
| testy do przepisania / rozszerzenia (intencja w komentarzu) | `tests/network_model/dynamika/test_biblioteka_przebiegi.py` :380-389 (`PLL_WOLNY`, `IZOLACJA_FRT`), :391-398, :400-418 (ślepy), :420-492 (prawo FRT → ΔU/U_pre/strefa/opóźnienie), :494-528 (statyzm Q/U — baza), :530-565; `biblioteka_urzadzen.py` :265-306 (fikstura `T_p = 2·T_iq`); `test_biblioteka_urzadzen.py` :1-30 (iloczyn cech rozszerzony o tryby, `U = 0`, granicę kołową, obie bazy), :606-637 (bazy statyzmów); `test_fabryka_urzadzen.py` :410 (inwentarz pól); `test_urzadzenia.py`; `test_calkowanie.py` (granica zależna, narożnik); `test_silnik.py`; `test_wynik.py`; `test_tozsamosc.py`; `test_obserwable.py`; `test_zdarzenia.py` (zwarcie metaliczne); `test_kontrakty.py` (kody zamknięte); `tests/enm/test_dynamika_modele.py`; `tests/enm/test_adapter_dynamiki.py`; `tests/catalog/test_der_dynamic.py` :250-290; `tests/test_dynamika_rms_run.py`; `tests/e2e/test_so1a_scenariusz_odniesienia.py` + `tests/golden/enm_builders/so1a_pv_magazyn.py` :83-105 i `dynamika_rms.py`; `tests/application/calculation_readiness/test_pr12_readiness.py`; `tests/golden/registry.py` |
| strażnicy | `scripts/dynamika_zero_default_guard.py` :46-55 (skan obejmuje nowe pola i `RegulacjaGFL`); `dynamika_granica_importow_guard.py` (nowe moduły rdzenia: `rejestrator.py`, `bieg_kontrolny.py`, `metryki_frt.py`, `walidacja/domena_d11.py`, `walidacja/manifest_gfl.py`); `readiness_codes_guard.py`, `readiness_dictionary_guard.py`, `readiness_consumption_guard.py`; `backend_no_physics_guard.py` (adapter: MW → pu przez `network_model/pochodne`); `werdykt_wyjasnialny_guard.py` (zero pól werdyktu w rdzeniu); `catalog_binding_guard.py`, `catalog_enforcement_guard.py`, `catalog_gate_guard.py`, `catalog_metadata_guard.py` (karta przekształtników); `no_codenames_guard.py` (etykiety kanałów) |

Świadomie poza naprawą (z powodem merytorycznym): ogranicznik GFM (algebraiczny, AB-4a, §0.8);
wielkość wyzwalająca crowbar (prąd wirnika, AB-3c, §0.13); jednostronność LFSM-O (AB-2, §0.7);
zastępcza wartość f = 50,0 Hz (`obserwable.py:314-323` — AB-1b.1, O-25).

---

## §2 Pakiety pracy (kolejność; każdy z własną bramką)

**Pakiet 0 — pomiar bazowy i testy czerwone (§0.0).** Zapis SHA bazy; złote odciski parytetu (§0.14)
i pomiary `bramki.zmierz()` G1–G13 sprzed zmiany; testy S0–S3 i (a)–(g) czerwone z wklejonym wyjściem.
Bramka: wszystkie nowe testy czerwone z właściwego powodu; harness `uruchom` i mutacje M10–M21 zielone
na bazie.

**Pakiet A — kontrakt ENM, katalog, tożsamość, moc dostępna (§0.3 pola, §0.7, §0.11, §0.12).**
`RegulacjaGFL`/`RegulacjaGFM`, nowe pola bez domyślnych, opisy pól poprawione, `p_dostepna_mw` z
walidatorem, wykluczeniem z odcisku, allowlistą i nadpisaniem w scenariuszu; `rodzina_sterowania` w
karcie przekształtników (wpisy :726-730, :1047-1051, :1066-1070 przepisane), konsumenci tożsamości
(c)–(d); operacja `przypisz_profil_dynamiczny`; szablony z proweniencją albo odmową materializacji;
kody gotowości i mapowanie FE; typy FE `enm.ts`; fikstury (SO-1A, `dynamika_rms.py`, rejestr złotych)
przepisane. Bramka: `pytest tests/enm tests/catalog tests/application/calculation_readiness -q`,
`mypy` na zmienionych pakietach, strażnicy katalogu, gotowości i zero-default; `npm run type-check`,
`npm run lint`, `vitest` pełny (typy i gotowość).

**Pakiet B — rdzeń: granice zależne, protokół, więź, moduł w zerze (§0.2b, §0.5, §0.8 mechanizm).**
`GranicaKolowa` w kontrakcie; całkowanie (maska, rzut, residuum, jakobian, RK4) z narożnikiem;
protokół kanałów/obserwabli urządzenia; więź napięciowa (o ile nie z AB-1b.1 — P3) i zwarcie
metaliczne; `modul_z_zerem` (GFL, AVR maszyny); nowe kody odmów w rejestrze zamkniętym. Bramka:
`pytest tests/network_model/dynamika tests/walidacja_fizyczna -q`; testy jednostkowe całkowania na
urządzeniu testowym z granicą kołową (iloczyn: priorytet × narożnik × wejście/wyjście z granicy ×
trapez/RK4); parytet §0.14 (bity) na całym korpusie SMIB; pomiary G1–G13 co do bitu.

**Pakiet C — fizyka GFL (§0.2a, §0.3, §0.4, §0.5a, §0.6, §0.7 rdzeń, §0.13).** Ogranicznik dwupoziomowy
z jedną funkcją `w`; automaty wsparcia i odbudowy na Z1–Z4; filtr U_pre; bazy statyzmów; okno z `P_av`;
turbina 3/4 z `P_av`; crowbar na timerach; kasacja stanów i funkcji z §0.4; docstringi fałszywe
przepisane do stanu faktycznego. Bramka: różnice skończone jakobianów w iloczynie cech
(`test_biblioteka_urzadzen.py` — priorytet × tryb {N, D, S, H} × tryb odbudowy × granica kołowa
{wewnątrz, przypięta, narożnik} × U {znamionowe, zapad, 0} × baza {S_n = S_b, S_n = 0,3·S_b} × rodzina
{GFL, magazyn-GFL, turbina 3, turbina 4}; punkty przełączeń pominięte jak dziś :24-29); testy S0–S3
zielone; niezmiennik koła na przemiataniu `T_p/T_iq × P` (pełna siatka, gęsta siatka).

**Pakiet D — kanały, konwencja osi, kontrakt wyniku (§0.1, §0.8, §0.10 pola).** Kanały z tabeli §0.8,
słowniki kodów przypięte testem, `opis_pl` z osią i bazą, test zakazu „I_d/I_q"; pola addytywne
kontraktu wyniku. Bramka: `pytest tests/network_model/dynamika tests/test_dynamika_rms_run.py
tests/e2e -q`; `ResultSetDynamicV1.model_validate` na ładunku z prawdziwego biegu (wzór `wynik.py:1-10`);
F-15 i F-16 zielone.

**Pakiet E — rejestrator gęsty, metryki, bieg kontrolny, wpięcie produktu (§0.9, §0.10).** Rejestrator
w punkcie wpięcia Z6; metryki bezparametrowe i parametryzowane; istniejące metryki na 𝒢 (P2);
`uruchom_z_biegiem_kontrolnym`; blok definicji metryk w scenariuszu (P7) z hashem scenariusza
niezmienionym dla scenariuszy bez bloku; `_execute_dynamika_rms` na biegu kontrolnym; tabela
przed/po metryk na wzorcach G1–G17. Bramka: pełna regresja backendu `-m "not pandapower and not andes"`;
pomiar kosztu biegu produktu przed/po (SO-1A) wpisany do meldunku.

**Pakiet F — AB-1d_min (§0.15 a–j).** `wyrocznia_gfl.py` (niezależna), `stanowisko_gfl.py`, bramki
GF1–GF11, manifest D-11.1…D-11.9 z polem `drogi_niezalezne`, `walidacja/domena_d11.py`,
`walidacja/manifest_gfl.py`, wpis zdolności w `provenance.py`, predykat domeny w wyniku. Bramka:
`python -m tests.walidacja_fizyczna.uruchom` → „WALIDACJA WYKONANA"; `test_manifest.py` zielony (w tym
reguła PPM); test niezależności wyroczni (zero importów z `network_model.solvers.dynamika` — AST).

**Pakiet G — mutacje i CI (§0.15 k–l).** M52–M66 w `mutacje.py`, szybkie zabicia w `test_mutacje.py`;
job CI z budżetem czasu zmierzonym na pełnym zestawie. Bramka: `python -m tests.walidacja_fizyczna.mutacje`
→ `przezyly = []`, `bez_zmiany_tekstu = []`, M10–M21 nadal ZABITE (M21 NIEWAŻNA).

**Pakiet H — dokumenty i rejestr.** W6-A §8 (znak `i_b^z`, definicja `i_bierny_wsparcia_pu`, kod
ogranicznika, nazwy), §9.3 (F-15 przepisane), §13.6 (stan po karcie); plan §7 (wiersz rejestru z
dowodami), §3a wiersze 2b–2d, 3, 4, 20–21, 23–24, 28 (stan); wpis defektu S1 i S2 w rejestrze planu;
README walidacji (bramki GF, D-11). Bramka: `docs_guard`, `guardy_z_ci.py` (komplet).

Zależności pakietów: 0 → (A ∥ B) → C → D → E → F → G → H; C, E, F wymagają Z1–Z6 z AB-1b.1.

---

## §3 Granice

- Nie dotykać rdzeni FROZEN (`power_flow_newton_internal`, `core/ybus.py`, `short_circuit_iec60909`)
  ani ich kontraktów wyniku; tor rozpływu czyta `control_mode` bez zmiany zachowania (usunięcie
  wartości `"GRID_FORMING"` nie zmienia mapowania trybów Q, `power_flow_inverter.py:430-449`).
- Nie projektować i nie implementować mechanizmów AB-1b.1 (Z1–Z6) — wyłącznie z nich korzystać;
  wyjątek wyłącznie za decyzją P3.
- Nie ruszać `frt_hvrt/**`, `stability_rms/**`, toru T1 i końcówki `der_dynamic` w `api/catalog.py` —
  kasacja AB-1c; pola szablonu dla nich zostają z testem jedynych konsumentów (§0.12 pkt 4).
- Zero kryteriów, marginesów i werdyktów w rdzeniu i w metrykach (AB-1c); zero fizyki w warstwie
  analizy i UI; zero liczb dobranych (tolerancje z §0.15h, parametry z danych).
- Zero wartości zastępczych: brak `P_av`, brak pola szablonu, brak źródła wartości w profilu = nazwana
  odmowa albo blokada gotowości.
- LFSM-O (jednostronność, filtr f, próg) — AB-2; GFM (fizyka ograniczania, kanały) — AB-4a; DFIG — AB-3c;
  Φ/CCT przekształtników — AB-5b; odbiory ZIP/PQ→Z — AB-1b.3.
- Fikstury e2e i złote przepisywane wyłącznie tam, gdzie zmienia je ta karta, z komentarzem intencji
  i tabelą przed/po.

---

## §4 Definicja ukończenia (CLAIMED DONE → VERIFICATION GATE)

Pełna regresja backend `-m "not pandapower and not andes"` i frontend (vitest pełny, type-check,
lint) zielona; `guardy_z_ci.py` zielony; `python -m tests.walidacja_fizyczna.uruchom` → „WALIDACJA
WYKONANA"; pełny zestaw mutacji M10–M66 bez przeżyć; parytet §0.14 wykazany co do bitu. Sondy (każda
z wklejonym wyjściem):

1. **Przemiatanie `T_p/T_iq × P`** (`T_p/T_iq` ∈ {0,5; 1; 2; 5; 10; 20} × P ∈ {0,1; 0,2; 0,25; 0,3;
   0,5; 0,8; 1,0} × priorytet {bierna, czynna} × `i_max` {1,0; 1,2} × zwarcie `X_f = 0,05 Ω` 150 ms):
   `max_𝒢 |I|/i_max − 1 ≤ 1e-12` w KAŻDYM przypadku, na gęstej siatce (każdy przyjęty krok).
2. **Sonda P1 przeglądu nie reprodukuje się:** skrypt S0 (przeniesiony jako test
   `tests/network_model/dynamika/test_ogranicznik_kola_pradu.py`) daje ≤ 1 + 1e-12 we wszystkich
   komórkach tabeli S0 (dziś do 1,1407); kanał `ogranicznik_aktywny` ma bit 1 w przedziale przypięcia i
   bit 0 w przedziale obcięcia zadania.
3. **Mutacja M53** („limit przed inercją") ZABITA przez GF6 przy `T_p/T_iq = 10`.
4. **Bazy (S1):** +0,52 Hz → ΔP = −7,50 MW; U = 1,03 → ΔQ = −12,00 Mvar dla `S_n = 30 MVA` w
   `S_b = 100 MVA`; GF10 (to samo urządzenie w dwóch bazach) ≤ 1e-12 względnie.
5. **S2:** `prog_frt_pu = 0` z opóźnieniem odbudowy > 0 — bieg wykonuje się, tryb ZAPAD nieosiągalny.
6. **ZVRT (S3):** zwarcie metaliczne na zaciskach GFL i stymulus `E = 0, Z = 0` — biegi wykonane,
   `V = 0` dokładnie, `i_zwarcia_pu` = suma wstrzyknięć (1e-12), `f_pll_hz = f_n·(1 + x_pll)`, prądy
   zgodne z §0.15f; zwarcie metaliczne w węźle z odbiorem PQ → odmowa
   `dynamika.odbior_w_wezle_zwarcia_metalicznego` (albo wykonanie, jeśli P4 = zamiana kolejności).
7. **Automaty:** skok SEM z `τ_akt = 30 ms`: `t_wsparcia − t_wykrycia = 0,030 s` (do tolerancji
   lokalizacji); rampa (§0.15d): `t_wykrycia` zgodne z postacią zamkniętą; powrót: H → N po τ_pod;
   RAMPA po τ_op — P(t) nie rośnie przed `t_2 + τ_op` (dziś rośnie w pierwszym kroku — Pakiet 0 f).
8. **P_available:** PV z `P_av = P_0` nie przekracza `P_0` po zapadzie; turbina 4 z `P_av > P_0` startuje z
   `β₀ > β_min` (postać zamknięta §0.7) w równowadze (bramka równowagi `eps_init`); brak `p_dostepna_mw`
   → blokada gotowości i odmowa biegu z tym samym kodem.
9. **Tożsamość:** profil `default_pv_gfm` materializuje się do GFM albo odmawia z listą braków (nigdy do
   GFL); karta `rodzina_sterowania = GFM` przy rodzinie ENM GFL → blokada
   `generator.tozsamosc_gfl_gfm_niespojna`; energizacja i V12.6 czytają rodzinę ENM.
10. **Metryki i niepewność:** GF7 — `|m(h/2) − m_ref| ≤ u` dla `t_akt`, `K_eff_min`, `t_odb`,
    `i_max_obs`, `u_min` (minimum analityczne MIĘDZY próbkami wyjścia wykryte na 𝒢); M63–M65 zabite;
    każda metryka produktu niesie `niepewnosc` albo wpis w `metryki_niedostepne` z powodem.
11. **Wyrocznia D-11:** GF1–GF11 zielone w domenie; `wyrocznia_gfl.py` bez importów produktu (AST);
    manifest D-11.1…D-11.9 z poziomami §0.15j; wycinek FRT-B = L4; `nalezy_do_domeny_d11` w wyniku.
12. **Parytet:** korpus SMIB i sieci wzorcowe bez GFL — odciski ładunku co do bitu; G1–G13 pomiary co do
    bitu; zmiana metryk wyłącznie przez 𝒢, z tabelą przed/po.
13. **Determinizm:** bieg GFL z trybami i biegiem kontrolnym identyczny między procesami przy różnym
    `PYTHONHASHSEED`.

Ekrany: karta nie buduje ekranu (przeglądarka przebiegów W6-I i ekran FRT — AB-1c, bramka B-02); UI
edycji `dynamika` i `p_dostepna_mw` — AB-1c (P7). Brak zrzutów w tej karcie jest zgodny z zakresem,
nie jest odbiorem wizualnym.

---

## §5 Oszacowanie rozmiaru i ryzyka

**Rozmiar.** Kod produkcyjny ≈ 3 500–4 500 wierszy (rdzeń całkowania i protokołu ≈ 500; GFL, magazyn,
turbina ≈ 900; więź i zwarcie metaliczne ≈ 350; rejestrator, metryki, bieg kontrolny ≈ 900; ENM,
katalog, tożsamość, gotowość, adapter ≈ 1 100; kontrakt wyniku i wykonawca ≈ 250; FE typy i
mapowanie ≈ 80). Testy i aparat walidacji ≈ 3 500–4 500 wierszy (wyrocznia ≈ 600, stanowisko ≈ 300,
bramki ≈ 600, manifest i mutacje ≈ 400, testy jednostkowe i klasy ≈ 2 000). Około 45 plików backendu,
2 pliki FE, 4 dokumenty. Realizacja: trzy przebiegi wykonawcy (A+B; C+D+E; F+G+H) z weryfikacją integratora
po każdym.

**Ryzyka (z pomiarem albo przyczyną):**
- R1 — **zmiana całkowania** (maska, rzut, jakobian) dotyka toru wszystkich biegów: łagodzenie —
  granice zależne wyłącznie jako dodatkowa gałąź przy niepustej deklaracji; parytet co do bitu
  G1–G13 i korpusu SMIB (Pakiet 0 zapisuje odniesienie).
- R2 — **zależność od AB-1b.1** (Z1–Z6): bez nich automaty (§0.3–§0.4), rejestrator obustronny i
  wzorce stanowiska nie powstaną; kolejność §5 planu to gwarantuje, ale interfejs Z1–Z6 musi być
  uzgodniony między kartami PRZED startem Pakietu C.
- R3 — **koszt:** pomiar tej karty — bieg GFL na układzie dwuwęzłowym, 600 kroków `dt = 1 ms`, trwa
  3,6 s (5,7 s przy próbce co krok — obserwable z LU w każdej próbce); bieg kontrolny daje ≈ 3× koszt
  biegu produktu; pełna siatka GF6 (168 biegów × 2 priorytety × 2 `i_max`) ≈ 40 min — dlatego siatka
  zredukowana w jobie obowiązkowym i pełna w jobie mutacji; rejestrator bez LU.
- R4 — **uwarunkowanie w narożniku koła** (`w' → ∞`, gdy `|i_n| → I`): test dedykowany
  (`k_frt` duże, głęboki zapad, priorytet nasycony dokładnie `I`); jeśli Newton nie zbiega — pomiar i
  zmiana postaci wiersza (np. postać kwadratowa `i_s² + i_n² − I² = 0` poza narożnikiem), nie tolerancja.
- R5 — **drgania trybów** (brak histerezy w kontrakcie; oscylacje U po zdjęciu zwarcia mogą wielokrotnie
  przecinać `u_pre ± Δ_db`): liczba zdarzeń mierzona w meldunku; histereza tylko jako pole danych z
  proweniencją, nigdy liczba w kodzie.
- R6 — **fikstury i złote:** SO-1A (PV GFL z `T_p = T_iq`, `so1a_pv_magazyn.py:95-96` — wzorzec
  referencyjny także jest ślepy na S0), `dynamika_rms.py`, rejestr złotych — przepisywane z tabelą
  przed/po; koordynacja z AB-1b.1, które przepisuje G17 (predykat izolacji).
- R7 — **szablony katalogu bez źródeł** nowych pól (§0.12 pkt 6–7): możliwy stan „żaden profil
  typowy nie materializuje się" do czasu danych — bramka danych właściciela §12.1, nie liczba wymyślona.
- R8 — **O-14 na załamaniach** (p = 1: błąd ≈ Δ): GF7/GF2 mogą wykazać `|m(h/2) − m_ref| > u` —
  wtedy korekta kontraktu (§6 kontraktu werdyktu), nie tolerancji.
- R9 — **pole karty przekształtników** (`rodzina_sterowania`) dotyka strażników katalogu i kreatora
  DER we FE — zakres zmierzony w Pakiecie A.

---

## §6 Sprzeczności plan ↔ zamrożenie ↔ kontrakty ↔ kod (z rekomendacją)

1. **Definicja L5 w manifeście vs kontrakt §3b / O-7.** `manifest.py:3-16` daje L5 przy JEDNEJ
   niezależnej wyroczni + mutacji + CI + czystym klonie + domenie; kontrakt §3b i O-7 wiążą L5 z DWIEMA
   niezależnymi drogami. D-01…D-07 mają L5 z jedną wyrocznią. **Rekomendacja:** reguła „dwie drogi"
   dotyczy twierdzeń o WIERNOŚCI modelu rodzin PPM (O-7 „polityka wyroczni PPM") — pole
   `drogi_niezalezne` + test; własności implementacji i D-01…D-07 bez zmian (P9).
2. **W6-A §8 (:310) `i_bierny_wsparcia_pu` = rzut na `+jV/|V|`** — w konwencji kodu to `−Q/|V|` i jest
   to CAŁY prąd bierny, nie prąd wsparcia; zamrożenie C2 (:137, :197) chce „I_q jako wielkość wtrysku
   wsparcia (osobno od składowej stanu)". **Rekomendacja:** trzy rozłączne kanały §0.8
   (`i_bierny_pu` rama PLL, `i_bierny_zaciski_pu` = Q/|V|, `i_bierny_wsparcia_pu` = prawo) i korekta
   znaku w W6-A.
3. **W6-A §8 (:311) flaga na zadaniu vs F-15 (:359) „dokładnie wtedy, gdy |i| = i_max"** — sprzeczne
   przy członach inercyjnych. **Rekomendacja:** kod dwubitowy §0.2c, F-15 przepisane.
4. **Twierdzenia fałszywe w kodzie:** `przeksztaltnik_gfl.py:473-482` (wypukłość koła — obalone S0),
   :35-41 (człon inercyjny = opóźnienie), :429-433 (wynik statyzmu przeliczony — obalone S1); nazwa
   testu `test_gfl_nie_przekracza_ogranicznika_pradu_w_zadnym_kroku` (:400) przy próbkach wyjścia.
   **Rekomendacja:** przepisane w Pakiecie C z testami (KLASA pkt 4: deklaracja bez testu).
5. **Opisy pól ENM vs model:** `tp_s` „filtr mocy czynnej" (:239) i katalogowe `tp_s`/`tq_s` „filtr P/Q"
   (`der_dynamic/models.py:130-134`) mapowane na stałe członów inercyjnych prądu; `p_odbudowa_opoznienie_s`
   „opóźnienie" realizowane stałą czasową. **Rekomendacja:** §0.3/§0.4 — semantyka pola zgodna z opisem
   (martwy czas), opisy `tp_s`/`tiq_s` poprawione; mapowanie szablonu bez pomieszania filtrów mocy z
   członami prądu (szablon = `RegulacjaGFL`).
6. **Kontrakt ENM dopuszcza wartości, na których model pada:** `prog_frt_pu = 0` (S2). **Rekomendacja:**
   §0.4 usuwa dzielenie; test graniczny zakresu każdego pola GFL (iloczyn: wartość graniczna × tryb).
7. **Tożsamość GFL/GFM ma cztery źródła, nie dwa** (plan §3a #24 i wiersz AB-1b.2 wymieniają rodzinę
   ENM i `control_mode`); `control_mode` karty miesza dwa wymiary (GFM i tryb Q), a profil katalogu
   `grid_forming` staje się GFL. **Rekomendacja:** §0.11 z rozdzieleniem pola (P10).
8. **„Jedno źródło parametrów" (O-44) vs `kontrakty.py:24-29` „trzy miejsca"** — po karcie parametry
   urządzenia mają JEDNĄ klasę (`RegulacjaGFL`) w dwóch rolach (szablon, kopia); `kontrakty.py` to
   wejście solvera (sieć, nastawy), nie parametry urządzenia — docstring do przepisania (P5).
9. **Parytet „bez GFL" vs KLASA (b)7 i O-14.** Przejście istniejących metryk na 𝒢 i raportowanie z biegu
   drobniejszego zmienia ładunek produktu także dla biegów bez GFL. **Rekomendacja:** parytet w
   definicji §0.14 (rdzeń co do bitu, metryki ze zmianą zadeklarowaną), produkt na biegu kontrolnym dla
   wszystkich biegów (P1, P2).
10. **Metryki FRT „liczone przez rdzeń" (O-14, §4 planu) vs parametry z profilu (O-29) o stanie
    `NIEUSTALONE` (§12.1).** Rdzeń nie może czytać profilu (granica importów). **Rekomendacja:** jawne
    definicje wejściowe (§0.9), wypełniane z profilu w AB-1c; w tej karcie blok scenariusza (P7).
11. **Wyrocznia AB-1d_min „źródło testowe–GFL" wymaga emulatora AB-1b.1** (Z5), a zwarcie metaliczne
    (O-38 → AB-1b.2) i źródło idealne Z = 0 (O-38 → AB-1b.1) to ten sam mechanizm więzi. **Rekomendacja:**
    jeden właściciel mechanizmu (P3).
12. **Odbiór stałej mocy w węźle zwarcia metalicznego** — model odbiorów jest w AB-1b.3, po AB-1b.2 w
    sekwencji §5; jedyna odmowa tymczasowa karty. **Rekomendacja:** zamiana kolejności 1b.3 ↔ 1b.2
    (AB-1b.3 nie zależy od AB-1b.2 w §11; strażnik zależności to dopuszcza) — P4.
13. **`P_available` „w ENM" (plan :335)** — to wielkość warunków pracy; `Generator.dynamika` byłby
    złym miejscem. **Rekomendacja:** pole generatora obok `p_mw` z nadpisaniem w scenariuszu (P6).
14. **Zasada nr 1 (UI + backend) vs brak edytora `dynamika`** — cała dynamika jest dziś osiągalna
    wyłącznie przez API (plan §3 pkt 1); `p_dostepna_mw` i definicje metryk dziedziczą ten stan.
    **Rekomendacja:** edytor i ekran w AB-1c (W6-I, E2E-R1) — nazwane w §4, nie ukryte (P7).
15. **Defekt baz statyzmów (S1)** nie występuje w planie ani w macierzy luk, a mutacja „baza" (plan
    :337) zakłada kierunek przeliczenia jako ryzyko, nie jako stan. **Rekomendacja:** naprawa w Pakiecie C
    + wpis rejestru planu (§7) z pomiarem; ten sam pomiar dla magazynu z GFL.
16. **Zamrożenie C2 (:137) „`I_d`/`I_q`"** vs O-23 (zakaz etykiet bez konwencji). **Rekomendacja:** nie
    przepisywać zamrożenia (dokument dowodowy); stan i nazewnictwo w §7 planu i W6-A §8.
17. **Nazwa `f_pll` (plan :335) vs `f_pll_hz` (W6-A §8 :312).** **Rekomendacja:** `f_pll_hz` (jednostka
    w nazwie, jak `f_hz@`).
18. **SO-1A jest ślepy na S0** (`so1a_pv_magazyn.py:95-96`: `T_p = T_iq = 0,02 s`) — scenariusz
    referencyjny nie ćwiczy defektu ogranicznika. **Rekomendacja:** wariant SO-1A z `T_p ≠ T_iq` w
    zestawie testów klasy (nie zmiana zamrożonego opisu SO-1).
19. **Kontrakt §5.1 (wzorzec treści) „margines +0,05 p.u. (I_n modułu)" dla stosunku ΔI_q/ΔU** — to
    wielkość bezwymiarowa (p.u. prądu na p.u. napięcia). **Rekomendacja:** jednostka `"1"` albo
    „p.u. (I_n modułu)/p.u. (U_n)" w AB-1c; zgłoszone do rejestru kontraktu, poza zmianami tej karty.

---

## §7 Pytania otwarte dla architekta strategicznego (z rekomendacją)

1. **P1 — parytet i bieg kontrolny w produkcie.** Czy przyjmujemy definicję parytetu §0.14 (rdzeń co do
   bitu dla biegów bez GFL; `odcisk_implementacji` zmienia się z konstrukcji) oraz raportowanie z biegu
   drobniejszego dla WSZYSTKICH biegów `dynamika_rms` (koszt ≈ 3×)? **Rekomendacja: tak** — metryka bez
   `u` i tak kończy się `NIE_OCENIONO` (O-14), a dwa tryby biegu byłyby dwiema semantykami produktu.
2. **P2 — istniejące metryki na gęstą siatkę w AB-1b.2** (`u_min_pu`, `t_u_min_s`, `omega_*`,
   `delta_max_rad` — KLASA (b)7) ze zmianą wartości zadeklarowaną tabelą przed/po? **Rekomendacja: tak**;
   `delta_max_rad` zmienia wyłącznie siatkę, semantyka do AB-5b.
3. **P3 — właściciel więzi napięciowej węzła** (Z = 0 emulatora w AB-1b.1 i zwarcie metaliczne w
   AB-1b.2). **Rekomendacja:** AB-1b.1 buduje więź, AB-1b.2 reużywa; gdyby karta AB-1b.1 zamknęła się
   bez więzi — mechanizm w Pakiecie B tej karty, a emulator Z = 0 przepięty na niego w tym samym commicie.
4. **P4 — odbiór stałej mocy w węźle zwarcia metalicznego:** odmowa tymczasowa do AB-1b.3 czy zamiana
   kolejności AB-1b.3 ↔ AB-1b.2? **Rekomendacja: zamiana** — AB-1b.3 nie zależy od AB-1b.2 (§11), usuwa
   jedyną odmowę tymczasową i odblokowuje FRT w trybie sieci wcześniej.
5. **P5 — podział `PrzeksztaltnikGFL` → `RegulacjaGFL` (+ `RegulacjaGFM`)** jako klasa wspólna
   szablonu katalogu i ENM (zmiana struktury kontraktu ENM, typów FE, fikstur) oraz odmowa
   materializacji profili bez źródeł wartości nowych pól. **Rekomendacja: tak** — jedno źródło z
   konstrukcji zamiast dwóch klas pilnowanych testem; brak źródła = wpis bramki danych §12.1.
6. **P6 — `Generator.p_dostepna_mw`** (ENM + nadpisanie w scenariuszu; brak → blokada gotowości dla PV i
   wiatru w `dynamika_rms`; fikstury G17 i złote dostają pole). **Rekomendacja: tak.**
7. **P7 — metryki parametryzowane w AB-1b.2:** blok `definicje_metryk` w `ScenariuszDynamiczny` (ścieżka
   API — jedyna ścieżka dynamiki dziś) czy wyłącznie AB-1c? **Rekomendacja:** blok w scenariuszu teraz;
   AB-1c wypełnia go z profilu i szablonu programu badań oraz buduje UI edycji `dynamika` i
   `p_dostepna_mw` (W6-I, E2E-R1).
8. **P8 — domena D-11** (tabela §0.15i): dolna granica SCR = 3, zakresy PLL z istniejących wzorców, tryb
   sieci poza domeną do AB-1d. **Rekomendacja:** przyjąć tabelę; domena może się wyłącznie zwężać po
   pomiarze, nigdy poszerzać bez nowej siatki testów.
9. **P9 — reguła manifestu dla PPM** (`drogi_niezalezne ≥ 2` dla L5 twierdzeń o wierności modelu PPM;
   D-11.1/.2/.8 jako własności implementacji na L5 z jedną wyrocznią). **Rekomendacja: tak** — usuwa
   sprzeczność §6 pkt 1 bez obniżania D-01…D-07.
10. **P10 — rozdział pola karty `control_mode`** (tryb Q) i nowego `rodzina_sterowania` (GFL/GFM) oraz
    konwersja timerów crowbar w tej karcie (reguła „cały moduł"). **Rekomendacja: tak dla obu** —
    walidacja tożsamości nie jest możliwa na polu mieszającym dwa wymiary, a crowbar jest w module, który
    karta zmienia.
