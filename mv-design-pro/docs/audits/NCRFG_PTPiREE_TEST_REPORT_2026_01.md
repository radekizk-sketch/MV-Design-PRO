# Raport testów NC RfG / PTPiREE od 01.2026

Status: WYKONANO  
Data wykonania: 2026-05-28  
Zakres: backend solver, API, frontend zakładki `Testy NC RfG`, browser pass, raport zgodności  
Repo: MV-DESIGN-PRO  

## 1. Podstawa wymagań

Raport oparto na aktualnej procedurze PTPiREE:

- Strona źródłowa PTPiREE: https://ptpiree.pl/kodeksy-sieci/procedura-testowania/
- Procedura testowania wersja 3.0: https://ptpiree.pl/wp-content/uploads/2025/12/Procedura-testowania_wer_3.0.pdf
- Numer wersji dokumentu: 3.0.
- Data publikacji: 15.12.2025.
- Dokument obowiązuje od: 01.01.2026.

Zakres lokalny odpowiada kanonowi:

- `docs/analysis/NC_RFG_PTPiREE_TESTY_KANON.md`
- `backend/src/network_model/solvers/ncrfg_ptpiree/`
- `backend/src/api/ncrfg_ptpiree_tests.py`
- `frontend/src/ui/workspace/surfaces/NcRfgTestsTab.tsx`

Uwaga formalna: wynik MV-DESIGN-PRO jest pakietem symulacyjno-dokumentacyjnym. Nie zastępuje certyfikacji, protokołu testów obiektowych ani udziału właściwego operatora systemu, jeżeli są wymagane procedurą.

## 2. Wykonany pakiet kontrolny T01-T20

Pakiet wykonano przez API `POST /api/ncrfg-tests/run` dla kompletnego modułu kontrolnego:

| Parametr | Wartość |
|---|---:|
| Obiekt testowy | Park energii testowy Typ C 60 MW |
| Rodzina modułu | PPM |
| Operator | ENEA Operator |
| Typ PGM wg profilu | C |
| Pmax | 60000 kW |
| Pmin | 6000 kW |
| Napięcie PCC | 15 kV |
| Procedura | PTPiREE Procedura testowania v3.0 |
| Solver | ncrfg-ptpiree-whitebox-1.0 |
| Kontrakt wyniku | NcRfgPtpireeTestResultV1 |
| Input hash | `e0499838b953df95197be0d29033ab069f9a633dd4ba7af760df435f2a79c3b2` |
| Deterministic hash | `59b606a2910d7c692367e0b14adc04581ea965c547607e915ae31cf8be5d013b` |

Wymuszono pełny program szczegółowy `T01..T20`, żeby potwierdzić wszystkie ścieżki solvera i śladu white-box.

## 3. Wynik pakietu T01-T20

| Test | Zdolność | Status |
|---|---|---|
| T01 | LFSM-O | pozytywny |
| T02 | LFSM-U | pozytywny |
| T03 | FSM | pozytywny |
| T04 | regulacja odbudowy częstotliwości | pozytywny |
| T05 | możliwość regulacji mocy czynnej | pozytywny |
| T06 | tryb regulacji napięcia | pozytywny |
| T07 | tryb regulacji mocy biernej Q | pozytywny |
| T08 | tryb regulacji współczynnika mocy cosφ | pozytywny |
| T09 | zdolność do generacji mocy biernej | pozytywny |
| T10 | potwierdzenie mocy maksymalnej PMAX | pozytywny |
| T11 | potwierdzenie mocy minimalnej PMIN | pozytywny |
| T12 | zaprzestanie generacji mocy czynnej | pozytywny |
| T13 | zmniejszenie generacji mocy czynnej | pozytywny |
| T14 | LVRT | pozytywny |
| T15 | HVRT | pozytywny |
| T16 | odbudowa P po FRT | pozytywny |
| T17 | prąd bierny podczas FRT | pozytywny |
| T18 | praca wyspowa, rozruch autonomiczny, tłumienie oscylacji | pozytywny |
| T19 | SCADA i rejestrator zakłóceń | pozytywny |
| T20 | jakość energii, THD_U | pozytywny |

Podsumowanie:

| Metryka | Wynik |
|---|---:|
| Testy wymagane | 20 |
| Testy pozytywne | 20 |
| Testy negatywne | 0 |
| Braki danych | 0 |
| Testy niewymagane | 0 |
| Kroki white-box trace | 20 |
| Status ogólny | zgodny |

Artefakty:

- Żądanie: `tmp/ncrfg-ptpiree/request_full_t01_t20_type_c.json`
- Odpowiedź: `tmp/ncrfg-ptpiree/response_full_t01_t20_type_c.json`

## 4. Próba negatywna: brak danych wejściowych

Wykonano kontrolną próbę z niekompletnym modułem PV. Celem było potwierdzenie, że system nie generuje fałszywego wyniku pozytywnego.

| Metryka | Wynik |
|---|---:|
| Status ogólny | brak_danych |
| Testy wymagane | 10 |
| Braki danych | 9 |
| Deterministic hash | `cf0614b791c7af61449d96d6961df8240f6648a61876258fee8b2c2fb5ff6aa3` |

Artefakty:

- Żądanie: `tmp/ncrfg-ptpiree/request_missing_data.json`
- Odpowiedź: `tmp/ncrfg-ptpiree/response_missing_data.json`

Wniosek: brak PCC, profilu, krzywych albo parametrów katalogowych blokuje wynik jako `brak_danych`. System nie podstawia zer ani założeń ukrytych.

## 5. Test aktywnej aplikacji w przeglądarce

Adres testowany:

`http://127.0.0.1:5173/#analysis?project=de296d9b-94fe-4ff5-9cde-d06088113fc8&tab=ncrfg-tests`

Wynik:

- Widok `Analizy techniczne / Testy NC RfG` ładuje się bez błędów konsoli.
- Widok pokazuje matrycę audytu specjalistycznego.
- W aktywnym projekcie brak układu DER z PCC i profilami NC RfG, więc UI poprawnie blokuje wykonanie testów z modelu.
- Blokada nie jest błędem solvera. To poprawna walidacja braku danych wejściowych.

Artefakty przeglądarkowe:

- `tmp/ncrfg-ptpiree/browser_ncrfg_tests.png`
- `tmp/ncrfg-ptpiree/browser_ncrfg_tests_open.png`
- `tmp/ncrfg-ptpiree/browser_ncrfg_section.png`

## 6. Komendy walidacyjne

| Komenda | Wynik |
|---|---|
| `poetry run pytest tests/test_ncrfg_ptpiree_solver.py tests/api/test_ncrfg_ptpiree_api.py -q` | 5 passed |
| `npm test -- src/ui/workspace/surfaces/__tests__/NcRfgTestsTab.test.tsx --run` | 2 passed |
| `npm run type-check` | passed |
| `npm run build` | passed |
| `poetry run ruff check src/network_model/solvers/ncrfg_ptpiree src/api/ncrfg_ptpiree_tests.py tests/test_ncrfg_ptpiree_solver.py tests/api/test_ncrfg_ptpiree_api.py` | passed |
| `npm run lint -- --quiet` | passed |
| `GET /api/ncrfg-tests/catalog` | HTTP 200, 20 testów |
| `POST /api/ncrfg-tests/run` dla pełnego T01-T20 | zgodny, 20/20 |
| Browser pass zakładki NC RfG | passed, bez błędów konsoli |

## 7. Ocena zgodności funkcjonalnej

| Obszar | Ocena |
|---|---|
| Źródło wymagań od 01.2026 | zgodne z PTPiREE v3.0 |
| Katalog testów T01-T20 | komplet |
| Solver white-box | trace i hash obecne |
| Determinizm | potwierdzony testem i hashem |
| API | katalog i wykonanie testów działają |
| UI | działa, blokuje brak DER w aktywnym projekcie |
| Brak danych | nie jest zerem, daje `brak_danych` |
| Raport PL z backendu | generowany w odpowiedzi API |

## 8. Werdykt

Pakiet NC RfG/PTPiREE w warstwie solver + API + UI przeszedł walidację techniczną dla procedury PTPiREE obowiązującej od 01.01.2026.

Aktywny projekt widoczny w przeglądarce nie ma jeszcze układu DER przypisanego do PCC, dlatego testy z modelu są poprawnie zablokowane. Pełny pakiet T01-T20 został wykonany na kontrolnym module typu C przez API i zakończył się wynikiem `zgodny` z 20/20 pozytywnymi testami.
