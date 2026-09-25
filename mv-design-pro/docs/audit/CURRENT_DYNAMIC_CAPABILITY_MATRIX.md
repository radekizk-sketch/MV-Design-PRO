# CURRENT DYNAMIC CAPABILITY MATRIX — stan wykonywalny dynamiki i stabilności

**HEAD rozpoznania:** `957e2a5f` (gałąź `claude/mv-design-pro-twin-audit-u4lhy0`, 2026-09-18)
**Zlecenie:** dyrektywa właściciela „W6-3C / DYNAMICS & STABILITY PRODUCT ARCHITECTURE FREEZE" §2.
**Metoda:** dowodem jest KOD WYKONYWALNY i TEST, nie dokument i nie nazwa klasy. Każdy wiersz
niesie `plik:linia`. Tam, gdzie kod mówi co innego niż dokumentacja albo nazwa pola — wygrywa kod.

**Dokument towarzyszący:** `docs/plan/W6_3C_DYNAMICS_PRODUCT_FREEZE.md` (zamrożenie architektury
produktu; sekcja A tamtego dokumentu streszcza tę macierz, a nie powtarza jej).

---

## 1. Słownik statusów (zamknięty — dyrektywa §2)

| Status | Znaczenie |
|--------|-----------|
| `EXECUTABLE` | Zdolność wykonuje się na ścieżce produkcyjnej i zwraca wynik. |
| `PARTIAL` | Część łańcucha wykonywalna, część nie — zakres opisany w wierszu. |
| `MODEL_ONLY` | Kontrakt/model danych istnieje, brak wykonawcy. |
| `UI_ONLY` | Ekran istnieje, brak zdolności obliczeniowej pod nim. |
| `NOT_IMPLEMENTED` | Nie ma ani modelu, ani wykonawcy. |
| `REFUSED_BY_CORE` | Rdzeń JAWNIE odmawia nazwanym kodem (fail-closed) — to jest zdolność, nie brak. |
| `UNVALIDATED_MODEL` | Wykonuje się, ale poprawność modelu nie jest wykazana. |
| `VALIDATED_AGAINST_REFERENCE` | Porównane z niezależnym odniesieniem, wynik porównania w teście. |

Statusy nie są alternatywne: bieg może być jednocześnie `EXECUTABLE` (wykonuje się) i
`UNVALIDATED_MODEL` (nie wykazano poprawności). W tej macierzy kolumna „Status wykonania"
i kolumna „Status walidacji" są ROZDZIELNE, zgodnie z §21 dyrektywy.

---

## 2. Cztery niezależne tory w repozytorium (stan zmierzony)

Repozytorium niesie DZIŚ cztery odrębne byty nazywane „stabilnością" albo „dynamiką".
Nie są wariantami jednego toru — mają rozłączne wejścia, rozłączne wyjścia i rozłączne
konsumentów.

| Tor | Wejście | Rdzeń | Wyjście | Konsument produkcyjny |
|-----|---------|-------|---------|----------------------|
| **T1 — LEGACY `DYNAMIC_STABILITY`** | 9 pól wpisanych przez inżyniera (`enm/canonical_analysis.py:1528-1547`) | brak całkowania; porównanie progowe (`application/stability/dynamic_stability.py:183-247`) | `stable/STABLE/UNSTABLE`, `stability_index`, marginesy | ekran `ui2/wyniki/stabilnosc/**` (1 528 linii) |
| **T2 — RMS/DAE `dynamika_rms`** | migawka efektywna + jawny `pf_run_id` + scenariusz + nastawy (`enm/adapter_dynamiki.py`) | całkowanie DAE (`network_model/solvers/dynamika/**`, 9 589 linii) | `ResultSetDynamicV2` (próbki L/P chwili zdarzenia, AB-1b.1a) + szeregi czasowe w osobnej tabeli | **ŻADEN** — front nie ma ekranu (patrz §3 wiersz T2-UI) |
| **T3 — FRT/HVRT `frt_hvrt`** | scenariusz zapadu (`network_model/solvers/frt_hvrt/contracts.py`) | funkcja zadana w czasie, bez sprzężenia z siecią (`engine.py:23-60`) | trajektoria V/Iq/P + margines do obwiedni | katalog dynamiczny DER, bramka gotowości |
| **T4 — `stability_rms` (MARTWY)** | — | `network_model/solvers/stability_rms/**` (603 linie) | — | **ZERO importów produkcyjnych** (weryfikacja poniżej) |

**Dowód martwoty T4:** `grep -rn "stability_rms" backend/src` poza samym pakietem zwraca
WYŁĄCZNIE wzmianki w komentarzach i docstringach: `api/catalog.py:475`,
`network_model/catalog/der_dynamic/__init__.py:14`, `.../der_dynamic/models.py:4,126`.
Ani jednego `import`, ani jednego wywołania. Pakiet importuje wyłącznie sam siebie
(`stability_rms/__init__.py:19`, `stability_rms/engine.py:22`).

---

## 3. Macierz zdolności

Kolumny: zdolność · status wykonania · status walidacji · dowód (`plik:linia`) · test · uwaga.

### 3.1 Tor T2 — rdzeń RMS/DAE (W6-2 + W6-3A + W6-3B)

| Zdolność | Wykonanie | Walidacja | Dowód | Test |
|----------|-----------|-----------|-------|------|
| Całkowanie DAE ze sprzężeniem sieciowym | `EXECUTABLE` | `UNVALIDATED_MODEL` | `solvers/dynamika/calkowanie.py` (699 l.), `silnik.py` (780 l.) | `tests/network_model/dynamika/test_calkowanie.py` (15), `test_silnik.py` (17) |
| Dokładna lokalizacja zdarzenia w czasie (skrócenie kroku do chwili zdarzenia) | `EXECUTABLE` | `VALIDATED_AGAINST_REFERENCE` (pośrednio: CCT bisekcją vs równe pola) | `solvers/dynamika/zdarzenia.py:1-24` | `test_walidacja_smib.py` (8) |
| Re-inicjalizacja algebry po zdarzeniu z pomiarem skoku | `EXECUTABLE` | `UNVALIDATED_MODEL` | `solvers/dynamika/reinicjalizacja.py` (130 l.) | `test_reinicjalizacja.py` (8) |
| Wiele zdarzeń w jednym scenariuszu (harmonogram uporządkowany) | `EXECUTABLE` | — | `enm/scenariusze.py:288,316-318`; `solvers/dynamika/zdarzenia.py:8-16` | `test_zdarzenia.py` (16) |
| Zdarzenia równoczesne (jedna chwila, jedna re-inicjalizacja) | `EXECUTABLE` | — | `solvers/dynamika/wynik.py:39-46` | `test_zdarzenia.py` |
| Maszyna synchroniczna 6. rzędu + AVR (SEXS) + GOV (TGOV1) + PSS (PSS1A) | `EXECUTABLE` | `VALIDATED_AGAINST_REFERENCE` (SMIB, ANDES) | `urzadzenia/maszyna_synchroniczna.py:101-108,178-206` | `test_walidacja_smib.py`, `test_wyrocznia_andes.py` (3) |
| Maszyna klasyczna 2. rzędu (osobna klasa) | `EXECUTABLE` | `VALIDATED_AGAINST_REFERENCE` (SMIB) | `urzadzenia/maszyna_klasyczna.py:56-67` | `test_walidacja_smib.py` |
| Przekształtnik nadążny (GFL) z PLL i ogranicznikiem prądu | `EXECUTABLE` | `UNVALIDATED_MODEL` | `urzadzenia/przeksztaltnik_gfl.py:84-102,389-393` | `test_biblioteka_przebiegi.py` (27), `test_urzadzenia.py` (9) |
| Przekształtnik tworzący sieć (GFM): statyzm `droop` i maszyna wirtualna | `EXECUTABLE` | `UNVALIDATED_MODEL` | `urzadzenia/przeksztaltnik_gfm.py:85-91,322-335` | `test_biblioteka_przebiegi.py` |
| Magazyn energii: rdzeń przekształtnika + stan naładowania (dryf + twarde granice) | `EXECUTABLE` | `UNVALIDATED_MODEL` | `urzadzenia/magazyn.py:63,190-192,270` | `test_biblioteka_przebiegi.py` |
| Turbina wiatrowa typu 3 i 4: wirnik, kąt łopat, moc aerodynamiczna, crowbar | `EXECUTABLE` | `UNVALIDATED_MODEL` | `urzadzenia/turbina_wiatrowa.py:98-101,415-424` | `test_biblioteka_przebiegi.py` |
| Turbina wiatrowa typu 1 i 2 | `REFUSED_BY_CORE` | — | `urzadzenia/turbina_wiatrowa.py:104` (`TYPY_ZLOZALNE` = tylko typ 3 i 4); `fabryka.py:833-846` | `test_fabryka_urzadzen.py` (17) |
| Szyna sztywna (warunek brzegowy) | `EXECUTABLE` | — | `urzadzenia/szyna_sztywna.py:36` | `test_urzadzenia.py` |
| Analiza małosygnałowa (wartości własne, częstotliwość i tłumienie modu) | `EXECUTABLE` | `VALIDATED_AGAINST_REFERENCE` (vs przebieg) | `solvers/dynamika/walidacja/malosygnalowa.py` (129 l.) | `test_walidacja_smib.py`, `test_biblioteka_przebiegi.py` |
| Kryterium równych pól (całka pierwsza) jako niezależna wyrocznia | `EXECUTABLE` | — | `solvers/dynamika/walidacja/rowne_pola.py` (334 l.) | `test_walidacja_smib.py` |
| Wyrocznia zewnętrzna ANDES (SMIB) | `EXECUTABLE` | — | `tests/network_model/dynamika/wyrocznia_andes.py` | `test_wyrocznia_andes.py:103,119,134` |
| Tożsamość biegu (pięć odcisków + wersja solvera) | `EXECUTABLE` | — | `solvers/dynamika/tozsamosc.py` (234 l.); `application/contracts/resultset_dynamic_v2.py:157-169` | `test_tozsamosc.py` (12) |
| Adapter ENM → wejście dynamiki (16 nazwanych odmów adaptera, `KODY_ODMOW_ADAPTERA`; od AB-1b.1b: komenda regulacji, częściowa utrata, stanowisko badawcze, detektory) | `EXECUTABLE` | — | `enm/adapter_dynamiki.py:167-201` | `tests/enm/test_adapter_dynamiki.py` |
| Punkt pracy z JAWNIE wskazanego biegu rozpływu (`pf_run_id`) | `EXECUTABLE` | — | `enm/adapter_dynamiki.py:382`; `enm/canonical_analysis.py:1819-1824` | `tests/test_dynamika_rms_run.py` |
| Zapis szeregów czasowych poza wierszem biegu | `EXECUTABLE` | — | `enm/canonical_analysis.py::_execute_dynamika_rms`; `infrastructure/persistence/models.py::CanonicalRunTimeSeriesORM` (od AB-1b.1: kolumna `strona_probki_json`, próbki `None` dla wartości niedostępnej; kontrakt `resultset_dynamic_v2` ze schematem `backend/schemas/resultset_dynamic_v2_schema.json`) | `tests/test_dynamika_rms_run.py`, `tests/application/test_resultset_dynamic_v2.py` |
| Endpoint metadanych i endpoint próbek na żądanie | `EXECUTABLE` | — | `api/analysis_runs.py:767-790` | `tests/api/**` |
| **Powierzchnia użytkownika toru T2 (ekran)** | **`NOT_IMPLEMENTED`** | — | `grep -rln "dynamika_rms" frontend/src` → **wyłącznie** `frontend/src/types/enm.ts` | brak |
| Zwarcia niesymetryczne (2F/1F/2FZ) w torze czasowym | `REFUSED_BY_CORE` | — | `solvers/dynamika/zdarzenia.py:21-23,47`; kod `KOD_ZWARCIE_NIESYMETRYCZNE` | `test_zdarzenia.py` |
| Komenda regulacji (`komenda_regulacji`) w torze czasowym | `EXECUTABLE` (od AB-1b.1b, 2026-09-24; wcześniej `MODEL_ONLY` + `REFUSED_BY_CORE`) | `VALIDATED_AGAINST_REFERENCE` dla przypisania stanu (D-13, bramka G18: `solve_ivp` wyroczni); modele rodzin — `UNVALIDATED_MODEL` | kontrakt: `enm/scenariusze.py` (`KomendaRegulacji` z `NastawaDynamiczna` P/Q/U); rdzeń: `solvers/dynamika/zdarzenia.py` (`KomendaRegulacji` → przypisanie stanu z deklaracji `Urzadzenie.nastawy_regulacji`), odmowy `dynamika.nastawa_nieobslugiwana` (Q maszyny bez regulatora mocy biernej, U przy stałym wzbudzeniu, P turbiny wiatrowej) i `dynamika.punkt_pracy_poza_ograniczeniem` (nastawa poza oknem mocy) | `test_przypisania_stanu.py`, `test_adapter_dynamiki.py::TestKomendaIUtrataCzesciowa`, `test_dynamika_rms_run.py` |
| Przypisanie stanu (`PrzypisanieStanu`, rdzeń) | `EXECUTABLE` (AB-1b.1b) | `VALIDATED_AGAINST_REFERENCE` (D-13, L5) | `solvers/dynamika/silnik.py::_przypisz`; stany przypisywalne z deklaracji klasy (`stany_przypisywalne`); ciągłość stanów nieprzypisanych mierzona (`delta_x_nieprzypisane_max`) | `test_przypisania_stanu.py`, `walidacja_fizyczna/test_zdarzenia_rdzenia.py` |
| Częściowa utrata źródła (`utrata_czesciowa_zrodla`) | `EXECUTABLE` (AB-1b.1b) | `VALIDATED_AGAINST_REFERENCE` (D-20, L5: algebra sieci liniowej wyroczni) | `solvers/dynamika/urzadzenia/czesciowe.py` (agregat identycznych jednostek), `zdarzenia.py` (udział tylko malejąco; szyna sztywna i źródło testowe — odmowa `dynamika.udzial_zrodla_niedozwolony`) | `test_przypisania_stanu.py`, bramka G21 |
| Źródło testowe U/f/θ — stanowisko badawcze (`ScenariuszDynamiczny.stanowisko`) | `EXECUTABLE` (AB-1b.1b) | `VALIDATED_AGAINST_REFERENCE` (D-14, L5: postać zamknięta profilu) | `solvers/dynamika/urzadzenia/zrodlo_testowe.py`; adapter zastępuje źródło sieciowe (impedancja modelu albo idealna); tryb `stanowisko` wyprowadzony i w wyniku (`tryb_scenariusza`); reguła reszty mocy na szynie źródła z wytwórcą | `test_zrodlo_testowe.py`, `test_adapter_dynamiki.py::TestStanowiskoBadawcze`, bramka G15 |
| Zdarzenia warunkowe (dozory) i detektory przekroczeń | `EXECUTABLE` jako prymityw rdzenia (AB-1b.1b); w scenariuszu wyłącznie detektory BEZ akcji (OD-34) | `VALIDATED_AGAINST_REFERENCE` (D-12, L5: postacie zamknięte rampy i kroku trapezu) | `solvers/dynamika/dozory.py` (lokalizacja Illinois z krokiem bisekcji, akcja w `t*`, zwłoka, kasowanie); wynik `przekroczenia` | `test_dozory.py`, `test_adapter_dynamiki.py::TestDetektory`, bramka G14 |
| Synchronizacja źródła (`synchronizacja`) w torze czasowym | `MODEL_ONLY` + `REFUSED_BY_CORE` | — | kontrakt: `enm/scenariusze.py:252-260`; odmowa: jak wyżej | `test_adapter_dynamiki.py` |
| Działanie zabezpieczenia jako zdarzenie dynamiczne | `NOT_IMPLEMENTED` | — | prymityw zdarzeń warunkowych istnieje (AB-1b.1b, `dozory.py`, D-12); zabezpieczenie w pętli z nastawami z MODELU (OD-34) — AB-5 | — |
| Działanie automatyki (SPZ/SZR) jako zdarzenie dynamiczne | `NOT_IMPLEMENTED` | — | jak wyżej | — |
| Wydzielenie na wyspę / ponowne załączenie jako nazwane zdarzenie | `NOT_IMPLEMENTED` | — | jak wyżej (dają się złożyć z otwarć gałęzi, ale nie są nazwanym zdarzeniem) | — |
| Kanał częstotliwości szyny `f(t)` | `EXECUTABLE` (W6-A; sprostowanie 2026-09-24 — wiersz opisywał stan sprzed W6-A) | `VALIDATED_AGAINST_REFERENCE` (D-03, L5) | `solvers/dynamika/obserwable.py` (`f_hz@`, `u_f_est_hz@`, `jakosc_f@`; `None` z kodem jakości przy niedostępności) | `test_obserwable.py`, `walidacja_fizyczna/test_czestotliwosc_wezlowa.py` |
| ROCOF `df/dt` | `NOT_IMPLEMENTED` | — | jak wyżej; ani jednej implementacji różniczkowania w `solvers/dynamika/**` | — |
| Prądy gałęzi `I(t)`, przepływy `P(t)/Q(t)` gałęzi | `NOT_IMPLEMENTED` | — | `silnik.py:588-604` — `p_pu@`/`q_pu@` są WYŁĄCZNIE wstrzyknięciem urządzenia, nie przepływem gałęzi | — |
| Krytyczny czas usunięcia zwarcia (CCT) jako wielkość wyniku | `NOT_IMPLEMENTED` w produkcji | — | `silnik.py:633-668` — zbiór metryk to `u_min_pu`, `t_u_min_s`, `omega_max_pu@`, `omega_min_pu@`, `delta_max_rad@`. Bisekcja CCT istnieje WYŁĄCZNIE w teście `test_walidacja_smib.py` | — |
| Porównanie scenariuszy / przemiatanie parametryczne | `NOT_IMPLEMENTED` | — | brak wykonawcy wielobiegowego dla `dynamika_rms` | — |

### 3.2 Tor T1 — legacy `DYNAMIC_STABILITY`

| Zdolność | Wykonanie | Walidacja | Dowód | Test |
|----------|-----------|-----------|-------|------|
| Ocena progowa czterech kryteriów | `EXECUTABLE` | `UNVALIDATED_MODEL` | `application/stability/dynamic_stability.py:183-247` | `tests/application/**` |
| Kąty wirnika i wielkości pozwarciowe | `UI_ONLY` (wejście od inżyniera) | — | `enm/canonical_analysis.py:1528-1547` (9 pól), `:1626-1637` (odczyt z `run.options`) | `tests/enm/**` |
| „Szereg czasowy" `U(t)`/`f(t)` | `EXECUTABLE` jako funkcja zadana | `UNVALIDATED_MODEL` | `application/stability/voltage_trajectory.py:75-90` — `U(t) = U_post − (U_post − U_fault)·exp(−(t−t_c)/τ)` | `tests/application/**` |
| `stability_index` | `EXECUTABLE` | — | `dynamic_stability.py:225` — średnia arytmetyczna czterech znormalizowanych marginesów | `tests/application/**` |
| Ekran „Stabilność dynamiczna" (E-32) | `EXECUTABLE` | — | `frontend/src/ui2/wyniki/stabilnosc/**` (1 528 linii, 7 plików) | `__tests__/EkranStabilnosci.test.tsx` |
| Klasyfikacja dowodowa toru | — | `UNVALIDATED_MODEL` | `solver_input/provenance.py:329-338` | `tests/**/test_provenance*` |

### 3.3 Tor T3 — FRT/HVRT

| Zdolność | Wykonanie | Walidacja | Dowód |
|----------|-----------|-----------|-------|
| Trajektoria V/Iq/P przy zapadzie/wzroście | `EXECUTABLE` | `UNVALIDATED_MODEL` | `solvers/frt_hvrt/engine.py:23-60` — profil napięcia ZADANY (`v = scenario.voltage_dip_depth_pu`, odbudowa liniowa w 100 ms), stałe czasowe zaszyte (`tp = 0.1`, `tiq = 0.02`) |
| Margines do obwiedni profilu | `EXECUTABLE` | `UNVALIDATED_MODEL` | `solvers/frt_hvrt/contracts.py` |
| Klasyfikacja dowodowa toru | — | `UNVALIDATED_MODEL` | `solver_input/provenance.py:356-363` — „trajektoria napiecia MVP jest funkcja zadana … nie rozwiazaniem sieci" |
| Sprzężenie FRT z rzeczywistym przebiegiem sieci | `NOT_IMPLEMENTED` | — | brak wywołania rdzenia `dynamika` z toru FRT |

---

## 4. Macierz sygnałów (dyrektywa §6)

SYGNAŁ → ŹRÓDŁO FIZYCZNE → RODZINA MODELU → POLE SOLVERA → JEDNOSTKA → DOSTĘPNE DZIŚ? → WALIDACJA

| Sygnał | Źródło fizyczne | Rodzina | Pole/klucz kanału | Jedn. | Dostępne dziś | Walidacja |
|--------|-----------------|---------|-------------------|-------|---------------|-----------|
| `U_i(t)` moduł napięcia szyny | rozwiązanie algebraiczne sieci | sieć | `u_pu@<szyna>` | pu | **TAK** (`silnik.py:561-568`) | `UNVALIDATED_MODEL` |
| `θ_i(t)` kąt napięcia szyny | jak wyżej | sieć | `kat_deg@<szyna>` | deg | **TAK** (`silnik.py:570-577`) | `UNVALIDATED_MODEL` |
| `P_k(t)` moc czynna oddawana przez urządzenie | `V·conj(I)` urządzenia | urządzenie | `p_pu@<urządzenie>` | pu | **TAK** (`silnik.py:590-597`) | `UNVALIDATED_MODEL` |
| `Q_k(t)` moc bierna urządzenia | jak wyżej | urządzenie | `q_pu@<urządzenie>` | pu | **TAK** (`silnik.py:599-606`) | `UNVALIDATED_MODEL` |
| `δ_k(t)` kąt wirnika | stan różniczkowy | maszyna synchroniczna, klasyczna | `delta_rad@<maszyna>` | rad | **TAK** | `VALIDATED_AGAINST_REFERENCE` (SMIB/ANDES) |
| `ω_k(t)` prędkość wirnika | stan różniczkowy | maszyna synchroniczna, klasyczna, GFM (maszyna wirtualna) | `omega_pu@<urządzenie>` | pu | **TAK** | `VALIDATED_AGAINST_REFERENCE` (maszyna) / `UNVALIDATED_MODEL` (GFM) |
| Strumienie `E'_q, E'_d, E''_q, E''_d` | stany różniczkowe | maszyna synchroniczna | `eq_prim_pu@`, `ed_prim_pu@`, `eq_bis_pu@`, `ed_bis_pu@` | pu | **TAK** | `UNVALIDATED_MODEL` |
| Napięcie wzbudzenia `E_fd(t)` | stan różniczkowy AVR | maszyna synchroniczna | `efd_pu@` | pu | **TAK** (gdy AVR obecny) | `UNVALIDATED_MODEL` |
| Moc mechaniczna `P_m(t)`, stan zaworu | stany turbiny | maszyna synchroniczna | `p_mechaniczna_pu@`, `turbina_zawor_pu@` | pu | **TAK** (gdy GOV obecny) | `UNVALIDATED_MODEL` |
| Stany PSS | stany stabilizatora | maszyna synchroniczna | `pss_filtr_pu@`, `pss_wyprzedzenie1_pu@`, `pss_wyprzedzenie2_pu@` | pu | **TAK** (gdy PSS obecny) | `UNVALIDATED_MODEL` |
| Kąt i całka PLL | stany różniczkowe | GFL, turbina 3/4 | `pll_kat_rad@`, `pll_calka_pu@` | rad, pu | **TAK** | `UNVALIDATED_MODEL` |
| Prąd czynny/bierny przekształtnika | stany różniczkowe | GFL, turbina 3/4 | `i_czynny_pu@`, `i_bierny_pu@` | pu | **TAK** | `UNVALIDATED_MODEL` |
| Zadania `P*, Q*, U*` przekształtnika | stany różniczkowe | GFL, GFM, magazyn, turbina | `p_zadane_pu@`, `q_zadane_pu@`, `u_odniesienia_pu@` | pu | **TAK** | `UNVALIDATED_MODEL` |
| Zwolnienie odbudowy mocy po zapadzie | stan różniczkowy | GFL (gdy skonfigurowane) | `odbudowa_zwolnienie_pu@` | pu | **TAK** | `UNVALIDATED_MODEL` |
| Kąt SEM i filtry mocy GFM | stany różniczkowe | GFM | `kat_rad@`, `p_filtr_pu@`, `q_filtr_pu@` | rad, pu | **TAK** | `UNVALIDATED_MODEL` |
| Stan naładowania `SOC(t)` | stan różniczkowy | magazyn | `soc_pu@` | pu | **TAK** (`magazyn.py:63,190-192`) | `UNVALIDATED_MODEL` |
| Prędkość wirnika turbiny, kąt łopat, moc aerodynamiczna, crowbar | stany różniczkowe | turbina 3/4 | `omega_wirnika_pu@`, `pitch_rad@`, `p_aerodynamiczna_odniesienia_pu@`, `crowbar_pu@` | pu, rad | **TAK** | `UNVALIDATED_MODEL` |
| **`f_i(t)` częstotliwość szyny** | — | — | — | Hz | **NIE** | — |
| **`df_i/dt` (ROCOF)** | — | — | — | Hz/s | **NIE** | — |
| **`I_k(t)` prąd gałęzi** | — | — | — | A / pu | **NIE** | — |
| **`P_gałęzi(t)`, `Q_gałęzi(t)`** | — | — | — | pu | **NIE** | — |
| **`I_q(t)` prąd bierny wsparcia jako osobny kanał** | wielkość wewnętrzna GFL | GFL | — | pu | **NIE** jako kanał (jest stan `i_bierny_pu`, ale jego znaczenie to składowa prądu w osi biernej, nie kanał wsparcia FRT) | — |

**Wniosek §6/§7:** dziś nie da się zbudować ekranu stabilności częstotliwościowej z toru T2.
Nie ma czego rysować: częstotliwość szyny nie jest ani stanem, ani wielkością algebraiczną
wyniku. `omega_pu` jest prędkością WIRNIKA konkretnej maszyny — to inna wielkość fizyczna niż
częstotliwość węzła sieci i nie wolno jej podstawiać pod `f(t)`.

---

## 5. Macierz zdarzeń (dyrektywa §4/§14)

| Zdarzenie (słownik dyrektywy) | Kontrakt danych | Rdzeń wykonuje | Status |
|-------------------------------|-----------------|----------------|--------|
| Założenie zwarcia 3F | `scenariusze.py:172-193` | `zdarzenia.py:49` (`zwarcie`) | `EXECUTABLE` |
| Usunięcie zwarcia (osobny wpis z własnym czasem) | `t_usuniecia_s` tamże | `zdarzenia.py:49` (`zdjecie_zwarcia`) | `EXECUTABLE` |
| Zwarcie 2F / 1F / 2FZ | `scenariusze.py:181` (typ dopuszczony w danych) | — | `REFUSED_BY_CORE` (`KOD_ZWARCIE_NIESYMETRYCZNE`) |
| Otwarcie wyłącznika / gałęzi | `scenariusze.py:196-204` | `zdarzenia.py:49` (`wylaczenie_galezi`) | `EXECUTABLE` |
| Zamknięcie wyłącznika / gałęzi | `scenariusze.py:206-213` | `zdarzenia.py:49` (`zalaczenie_galezi`) | `EXECUTABLE` |
| Wyłączenie linii / transformatora | j.w. (gałąź) | j.w. | `EXECUTABLE` |
| Odłączenie generatora / źródła | `scenariusze.py:216-223` | `zdarzenia.py:49` (`odlaczenie_zrodla`) | `EXECUTABLE` |
| Skok obciążenia | `scenariusze.py:226-236` | `zdarzenia.py:49` (`skok_obciazenia`) | `EXECUTABLE` — WYŁĄCZNIE dla odbioru (`KOD_SKOK_POZA_ODBIOREM`) |
| Odłączenie odbioru | `scenariusze.py` (`odlaczenie_odbioru` / `zalaczenie_odbioru`) | `zdarzenia.py` (`ZmianaOdbioru`) | `EXECUTABLE` jako nazwane zdarzenie od karty AB-1b.1 (P2; odbiór poza bilansem węzła, powrót z mocą zadaną) |
| Skok zadania `P`/`Q`/napięcia wytwórcy | `scenariusze.py` (`komenda_regulacji`, `NastawaDynamiczna`) | `zdarzenia.py` (`KomendaRegulacji` → przypisanie stanu) | `EXECUTABLE` od AB-1b.1b (odmowy nazwane dla wielkości, której rodzina nie zadaje) |
| Skok zadania mocy magazynu | j.w. | j.w. (zakres = okno mocy zasobnika z rezerwą) | `EXECUTABLE` od AB-1b.1b |
| Częściowa utrata źródła | `scenariusze.py` (`utrata_czesciowa_zrodla`) | `zdarzenia.py` (`UtrataCzesciowaZrodla`) | `EXECUTABLE` od AB-1b.1b (wyłącznie generatory; udział malejąco) |
| Profil U/f/θ stanowiska badawczego | `scenariusze.py` (`StanowiskoBadawcze`) | `urzadzenia/zrodlo_testowe.py` (`rozwin_profil` → przypisania stanów) | `EXECUTABLE` od AB-1b.1b (tryb `stanowisko` rozdzielony od zakłóceń sieci) |
| Detektor przekroczenia progu | `scenariusze.py` (`Detektor`, bez akcji) | `dozory.py` (`Dozor` bez akcji) | `EXECUTABLE` od AB-1b.1b (wynik `przekroczenia`) |
| Synchronizacja / ponowne załączenie źródła | `scenariusze.py:252-260` | — | `MODEL_ONLY` + `REFUSED_BY_CORE` |
| Wydzielenie na wyspę | — | — | `NOT_IMPLEMENTED` jako nazwane zdarzenie |
| Zadziałanie zabezpieczenia | — | — | `NOT_IMPLEMENTED` |
| Zadziałanie automatyki (SPZ/SZR) | — | — | `NOT_IMPLEMENTED` |

Wielokrotne zdarzenia w jednym scenariuszu: **architektonicznie dopuszczone i wykonywane**
(`ScenariuszDynamiczny.zdarzenia` to krotka; kolejność kanoniczna `(t_s, indeks)`,
`scenariusze.py:316-318`). Zdarzenia w tej samej chwili dzielą jedną re-inicjalizację
(`wynik.py:39-46`).

---

## 6. Macierz walidacji (dyrektywa §21/§22)

| Rodzina | Wyrocznia niezależna | Co porównano | Wynik |
|---------|----------------------|--------------|-------|
| Maszyna synchroniczna / klasyczna | **ANDES** (inne narzędzie, inni autorzy) | warunki początkowe; trajektoria kąta odcinkami; podłoga różnicy vs krok | 3 testy, `test_wyrocznia_andes.py:103,119,134`; zgodność warunków początkowych `|Δδ| = 7e-10 rad` (`wyrocznia_andes.py:24-26`) |
| Maszyna synchroniczna / klasyczna | **kryterium równych pól** (całka pierwsza) | CCT z bisekcji na silniku vs CCT analityczny | `test_walidacja_smib.py` |
| Maszyna synchroniczna / klasyczna | **wartości własne** | częstotliwość modu z przebiegu vs z macierzy stanu | `test_walidacja_smib.py` |
| Maszyna synchroniczna / klasyczna | **bilans energii** | przyrost energii kinetycznej vs całka mocy niezbilansowanej | `test_walidacja_smib.py` |
| GFL | — (brak wyroczni zewnętrznej) | zgodność małosygnałowa, nienaruszalność ograniczeń, reakcja na skok, prawo kontraktu, pomiar różnicowy | `test_biblioteka_przebiegi.py` |
| GFM | — | j.w. | `test_biblioteka_przebiegi.py` |
| Magazyn | — | j.w. + granice SOC w całym przebiegu | `test_biblioteka_przebiegi.py` |
| Turbina 3/4 | — | j.w. + granice kąta łopat i crowbar | `test_biblioteka_przebiegi.py` |

**Stan formalny klasyfikacji dowodowej (rejestr proweniencji):** wszystkie trzy żywe tory są
`UNVALIDATED_MODEL` — `solver_input/provenance.py:329` (T1), `:340` (T2), `:356` (T3).
Żadna zdolność dynamiczna nie jest dziś `VALIDATED_SIMULATION` w rejestrze; pojedyncze
wiersze `VALIDATED_AGAINST_REFERENCE` w tej macierzy dotyczą KONKRETNEGO układu (SMIB),
nie rodziny na sieci rzeczywistej, i nie awansują zdolności w rejestrze.

---

## 7. Nadużycia semantyczne wykryte w rozpoznaniu

| # | Miejsce | Nazwa sugeruje | Kod robi | Kwalifikacja |
|---|---------|----------------|----------|--------------|
| N-1 | `dynamic_stability.py:151,239`, `model.ts:355` | `max_clearing_time_ms` — „maksymalny czas wyłączenia zwarcia", czyli CCT | PRÓG PRZYJĘTY, domyślnie 150 ms (`:47`), porównywany z `clearing_time_ms` (`:196`) | **nadużycie** — patrz `W6_3C_DYNAMICS_PRODUCT_FREEZE.md` §C.1 |
| N-2 | `canonical_analysis.py:1651-1672` | „Szereg czasowy `U(t)`/`f(t)` przebiegu" | dwie funkcje wykładnicze zadane, nie rozwiązanie równań: `U(t)` relaksuje ze stałą `τ` podaną przez inżyniera, `f(t)` tą samą stałą pomnożoną przez **zaszyty współczynnik 0,5** z uzasadnieniem w komentarzu „faster recovery typically" (`voltage_trajectory.py:108-113`); w czasie zwarcia `f = 1,0` z założenia (`:68`) | **nadużycie + zaszyta stała bez podstawy** |
| N-3 | `dynamic_stability.py:225` | `stability_index` — wskaźnik stabilności | średnia arytmetyczna czterech znormalizowanych marginesów progowych; nie ma jednostki ani znaczenia fizycznego | **nadużycie** |
| N-4 | `resultset_dynamic_v1.py:104-105` | docstring wymienia `cct_s` i `rocof_max_hz_s` jako przykłady metryk | rdzeń NIE liczy ani CCT, ani ROCOF (`silnik.py:633-668`) | **deklaracja bez pokrycia** (§4 reguły KLASA) |
| N-5 | `application/stability/voltage_trajectory.py` | moduł w warstwie APLIKACJI | zawiera model fizyczny odbudowy napięcia (funkcja wykładnicza) | **naruszenie granicy warstw** (NOT-A-SOLVER) |
| N-6 | `frt_hvrt/engine.py:1-8` | „Solver FRT/HVRT RMS time-domain" | profil napięcia jest zadany, nie rozwiązywany; stałe czasowe zaszyte w kodzie (`:38-39`) | **nadużycie** (rejestr proweniencji nazywa je uczciwie, nazwa modułu nie) |
| N-7 | `network_model/solvers/stability_rms/**` | „solver stabilności RMS" | zero importów produkcyjnych — kod nieosiągalny | **martwy kod w katalogu solverów** |

---

## 8. Odpowiedzi na trzy pytania, które właściciel zapowiedział, że sprawdzi

**(1) Czy `max_clearing_time_ms` to naprawdę CCT?**
NIE. To próg przyjęty w opcjach biegu, z wartością domyślną 150 ms
(`application/stability/dynamic_stability.py:47`), a „margines" to zwykła różnica
`próg − czas_wyłączenia` (`:193`). Repozytorium samo notuje, że nie ma dla tych czterech liczb
cytatu normy (`:38` `KRYTERIA_PROWENIENCJA_PL`). CCT liczony z solvera istnieje WYŁĄCZNIE
w teście wyroczni SMIB (bisekcja na silniku vs równe pola), nie w produkcie.

**(2) Czy `δ_fault`, `U_post`, `f_post` nadal wpisuje użytkownik?**
TAK — w torze T1, dziś, na ścieżce produkcyjnej. Dziewięć pól formularza
(`enm/canonical_analysis.py:1528-1547`) obejmuje `pre_fault_angle_deg`,
`during_fault_angle_deg`, `post_fault_angle_deg`, `post_fault_voltage_pu`,
`post_fault_frequency_pu`. Odczyt: `:1626-1637`. Formularz: `ui2/wyniki/stabilnosc/FormularzScenariusza.tsx`.
Wszystkie pięć to wielkości, które solver ma WYZNACZYĆ, a nie przyjąć.

**(3) Jakie realne przebiegi daje `ResultSetDynamicV1` dla każdej z pięciu rodzin?**
Patrz §4. Skrótowo, na urządzenie: komplet stanów różniczkowych tej konfiguracji
(zmienna liczba — blok nieobecny nie dostaje stanu, `uklad_stanow.py:1-18`) plus `p_pu@` i `q_pu@`.
Na szynę: `u_pu@` i `kat_deg@`. Brak `f(t)`, brak ROCOF, brak prądów i przepływów gałęzi.

---

## 9. Komenda i wynik pomiaru (dowód wykonania, nie deklaracja)

```
cd backend && PYTHONPATH=$PWD:$PWD/src python -m pytest \
  tests/network_model/dynamika tests/test_dynamika_rms_run.py tests/enm/test_adapter_dynamiki.py \
  -q -p no:cacheprovider -m "not pandapower and not andes"
```

Wynik na HEAD `957e2a5f`: **410 passed, 3 deselected w 264,32 s**, kod wyjścia 0.
Trzy odznaczone to testy wyroczni ANDES (marker `andes`, osobne środowisko — wzorzec A-10);
biegną w osobnym zadaniu CI i przechodzą (bieg 5045, 2 min 58 s).
