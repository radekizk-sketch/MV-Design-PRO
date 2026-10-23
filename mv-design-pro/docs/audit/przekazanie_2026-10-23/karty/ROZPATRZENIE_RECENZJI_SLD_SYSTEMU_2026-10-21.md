# Rozpatrzenie recenzji SLD i systemu z 2026-10-20 (PR #484)

**Status:** dokument roboczy integratora, NIE program prac. Recenzja (`MV_DESIGN_PRO_RECENZJA_SLD_SYSTEMU_2026-10-20.md`,
rewizja bazowa `9d5168ea3`) jest materiałem do rozpatrzenia. Każdy punkt przypisano do ISTNIEJĄCEJ karty;
nowych programów nie otwarto.

**Metoda.** Ekstrakcja punktów i lokalizacja odpowiedników w kodzie: model Haiku (tylko odczyt). Klasyfikacja:
Opus na podstawie odczytu kodu na `d8d884f35` (czubek partii 11) i biegów CI. „Niezweryfikowane" nie oznacza
„nie działa".

## Klasyfikacja

| Punkt | Teza recenzji (skrót) | Klasyfikacja | Dowód (plik:linia / bieg) | Karta |
|---|---|---|---|---|
| R01 | Wyniki nie wracają do jednego panelu dolnego | CZĘŚCIOWO ROZWIĄZANA | `PanelDolny` na gałęzi UI/UX (nie scalona) | K8 / K1 |
| R02 (front) | Rozbudowa pola z SLD niedostępna | POTWIERDZONA | brak akcji w menu kontekstowym pola | K2 (+ ocena PR #483) |
| R02 (backend) | Brak operacji doposażenia pola | POTWIERDZONA | `BEZ_DOPOSAZENIA`, brak operacji w `domain_operations.py` | W5-B / POLA-W-TORZE |
| R03 | Tor zasilania nie z jednego dostawcy | CZĘŚCIOWO ROZWIĄZANA | `application/topologia_zasilenia.py` + GET `/enm/topologia/zasilenie` (K6a, gałąź UI/UX) | K4 |
| R04 | Strzałki rozpływu ignorują nieświeżość wyniku | POTWIERDZONA | renderer strzałek nie czyta `resultsStale` | K4 |
| R05 | Wytrzymałość pola: czas bez czasu własnego wyłącznika, prąd stacyjny bez `run_id` | POTWIERDZONA | `czas_wylaczenia_pola.py:~210-231`; `wytrzymalosc_aparatury_pol.py:~121-179`; `api/enm.py:633-669` | WYTRZYMALOSC-PRAD-POLA |
| R06 | Dwa werdykty przekładnika prądowego | POTWIERDZONA | `ocena_nadpradowa.py:1696` (`granica = alf·i1n`, obciążenie pominięte) vs `ct_burden_saturation.py` | CT-JEDEN-WERDYKT |
| R07 | BESS bez modelu dynamicznego z kreatora | POTWIERDZONA | `dynamika_z_katalogu.py:313-337` (magazyn zawsze odmowa: brak sprawności/okna SOC w katalogu, SOC początkowy to dana scenariusza); brak pola SOC początkowego w UI | KATALOG-DYNAMIKI-BRAKI + AB-4a (dane z karty producenta — pakiet właściciela) |
| R08 | Chwila z wykresu przebiegów nie trafia do SLD | POTWIERDZONA | `WykresPrzebiegow.tsx` — kursor bez konsumenta w `ui/sld/v3` | K8 / AB-4a |
| R09 | Słaba tolerancja e2e rozpływu (mediana szerokości bloku) | w karcie R10-E2E | `e2e/sld-pa-powerflow-tor.spec.ts:~240-305` | R10-E2E |
| R10 | Pełne E2E czerwone | POTWIERDZONA | bieg 38905049508 (`9d5168ea3`): K9-A `kreator-oze-max.spec.ts:555` (`mvd-kreator-oze-bom-tabela`), `sld-pa-powerflow-tor.spec.ts:370` (N-2), `:523` (N-3, `ring_closure`); czerwone też biegi 38868461571, 38714198929 | R10-E2E |
| R11 | `I_b` nie jest prądem wyłączeniowym normy | POTWIERDZONA | `short_circuit_core.py:202-203`; pomiar karty: +28,07 % wobec symetrycznego | SC-IB-ITH-ZRODLA (B-01 (n), delegowane architektowi) |
| R12 | Nagłówek STAN_REPO nieaktualny | POTWIERDZONA | nagłówek z 2026-09-30 | aktualizacja nagłówka przy partii integracji |
| S9 | Zmiana punktu podziału nie zamyka poprzedniego NOP, brak `open_switch`/`close_switch` | POTWIERDZONA | `domain_operations.py:9360` `set_normal_open_point` | W5-C |
| P08 | AC-11 wskazuje nieistniejący job „visual-regression" | POTWIERDZONA → NAPRAWIONA | `SLD_VISUAL_ACCEPTANCE_CRITERIA.md:181`; job nie istnieje w `sld-determinism.yml` | naprawa w `342a588cb` |
| P13 | `deviceRef` aparatu nie trafia do inspektora | POTWIERDZONA | adapter SLD | K6 |
| P15 | `--no-file-parallelism` zdjęte z `sld-determinism.yml` | ODRZUCONA | każdy krok uruchamia `npx vitest run <JEDEN plik>` — równoległość plików nie występuje; CLAUDE.md dotyczy biegu pełnego (`npm test`) | — |
| Adapter | Zaszyte stany DER, mapowanie OZE→DER_PV | POTWIERDZONA | adapter SLD v3 | K3 |
| W2c | Etykiety skryptu dowodowego z odrębnych wzorów | POTWIERDZONA → wniesiona bramka | gałąź audytu wniesiona w `342a588cb`; bramka W2c na drzewie: FAIL (w2c-2 etykieta na symbolu VT; w2c-7/8 utracone tożsamości) | W2C-PLAN-ETYKIET (K3) |
| QSTS | Brak symulacji quasi-stacjonarnej | POTWIERDZONA (brak) | brak modułu | W6-6 / AB-6b |

## Scenariusz odbiorczy (15 kV → … → raport)

Przejście przez UI na realnym backendzie: NIEZWERYFIKOWANE w tej pracy (zielone testy ≠ scenariusz).
Znane przerwania z dowodem kodu: rozbudowa pola z SLD (R02), BESS → właściwa symulacja (R07),
zmiana punktu podziału (S9), dobór aparatury pola na zaniżonym czasie (R05/R06).
