# Testy NC RfG / PTPiREE - kanon wykonawczy

Status: **AKTUALNY**  
Zakres: zakładka analityczna `E-35 / ncrfg-tests`, backend, API, trace, proof i raport PL  
Źródło zewnętrzne: PTPiREE, strona `https://ptpiree.pl/kodeksy-sieci/procedura-testowania/` oraz PDF `https://ptpiree.pl/wp-content/uploads/2025/12/Procedura-testowania_wer_3.0.pdf`

## 1. Cel

Zakładka **Testy NC RfG** ma dać inżynierowi jeden, powtarzalny tor sprawdzenia, czy katalogowy układ PV, BESS albo FW ma komplet danych i zdolności wymaganych procedurą testowania PTPiREE dla modułów wytwarzania energii.

Ten tor nie zastępuje certyfikacji ani badań obiektowych. W systemie jest pakietem symulacyjno-dokumentacyjnym: porządkuje wymagania, klasyfikuje moduł, uruchamia deterministyczne sprawdzenia i buduje raport z białym śladem obliczeń.

## 2. Flow inżyniera

1. Inżynier dodaje DER z katalogu urządzeń w kreatorze stacji SN/nN albo PCC.
2. Katalog materializuje moc znamionową, napięcie, profil NC RfG, krzywe FRT/HVRT, model dynamiczny, komunikację i certyfikat PTPiREE.
3. W `Analizy -> Testy NC RfG` inżynier wybiera DER, operatora i status certyfikatu.
4. Inżynier uzupełnia tylko brakujące parametry testowe: PMIN, droop, martwą strefę, rampę P, zakres Q, cosφ, K_FRT, czas odbudowy P i THD_U.
5. Backend uruchamia pakiet testów, zwraca wynik per wymaganie, `white_box_trace`, `input_hash` i `deterministic_hash`.
6. UI pokazuje status, listę braków, działania naprawcze i raport PL gotowy do dołączenia do uzasadnienia inżynierskiego.

## 3. Zakres testów

Pakiet obejmuje 20 testów:

- T01 LFSM-O.
- T02 LFSM-U.
- T03 FSM.
- T04 odbudowa częstotliwości.
- T05 regulacja mocy czynnej.
- T06 regulacja napięcia.
- T07 regulacja Q.
- T08 regulacja cosφ.
- T09 zdolność Q(P).
- T10 PMAX.
- T11 PMIN.
- T12 zaprzestanie generacji.
- T13 zmniejszenie generacji.
- T14 LVRT.
- T15 HVRT.
- T16 odbudowa P po FRT.
- T17 prąd bierny podczas FRT.
- T18 zdolności dodatkowe: wyspa, black start, tłumienie oscylacji.
- T19 telemechanika, SCADA i rejestrator zakłóceń.
- T20 jakość energii jako test uzupełniający THD_U.

## 4. Kontrakt backend

Backendowa ścieżka jest addytywna:

- Solver: `backend/src/network_model/solvers/ncrfg_ptpiree/engine.py`.
- Kontrakty: `backend/src/network_model/solvers/ncrfg_ptpiree/contracts.py`.
- API: `backend/src/api/ncrfg_ptpiree_tests.py`.

Endpointy:

- `GET /api/ncrfg-tests/catalog` - zwraca katalog testów i profile operatorów.
- `POST /api/ncrfg-tests/run` - uruchamia pakiet testów dla jednego lub wielu DER.

Wynik ma kontrakt `NcRfgPtpireeTestResultV1` i musi zawierać:

- klasyfikację typu modułu według progu mocy operatora,
- wynik per test: `pass`, `fail`, `no_data`, `not_required`,
- metryki użyte w decyzji,
- `white_box_trace` z formułą, danymi, podstawieniem, wynikiem i kontrolą jednostek,
- `input_hash` oraz deterministyczny hash wyniku,
- raport tekstowy PL.

## 5. Zasady architektoniczne

- UI nie liczy zgodności, tylko zbiera jawne wejście i pokazuje wynik backendu.
- Solver nie modyfikuje ENM i nie używa ukrytych korekt.
- Brak danych jest wynikiem `no_data`, a nie milczącym założeniem.
- Certyfikat PTPiREE może zamknąć część oceny dokumentacyjnej, ale nie może ukryć braków profili technicznych wymaganych do symulacji.
- Raport i eksport muszą korzystać z zamrożonego wyniku oraz trace, bez ponownego liczenia.

## 6. Definicja ukończenia

Zakładka jest kompletna, gdy:

- `E-35` dopuszcza `tabId = ncrfg-tests`.
- UI pokazuje DER z katalogu, parametry testowe, zdolności techniczne i wynik.
- Backend zwraca katalog testów i wykonuje deterministyczny pakiet testowy.
- Każdy wynik ma trace/proof i hash.
- Macierz API zawiera oba endpointy.
- Macierz testów zawiera bramkę V12-TST-030.
- Testy backendowe `test_ncrfg_ptpiree_solver.py` i `test_ncrfg_ptpiree_api.py` przechodzą.
- Test powłoki `workspaceShellV125.test.tsx` potwierdza wejście do zakładki.
