# Nakladka roznic A/B na schemacie (kontrakt)

Status: AKTUALNY (2026-08-06). Dokument opisuje ZYWY lancuch „porownanie dwoch
przebiegow zwarciowych -> roznice na schemacie".

## Historia (dlaczego ten dokument zostal przepisany)

Pierwsza wersja opisywala lancuch, ktorego backend NIE SERWOWAL. Klient
`ui/comparison/sldDeltaOverlay.api.ts` wolal `/api/execution/comparisons/{id}/
sld-delta-overlay` i dwie sasiednie trasy rejestru porownan. Kod dostawcy
istnial (`api/batch_execution.py`), ale:

* router NIE byl wpiety w `api/main.py` — trasy nie bylo w aplikacji;
* usluga za nim (`ScComparisonService` nad `ExecutionEngineService`) trzymala
  przebiegi we WLASNEJ pamieci, do ktorej produkcyjna sciezka biegow
  (`enm/canonical_analysis.py`) nic nie zapisuje — samo wpiecie routera daloby
  koncowke odpowiadajaca „nie znaleziono przebiegu" na KAZDY realny
  identyfikator.

Jednoczesnie system mial juz ZYWE porownanie zwarciowe per punkt
(`POST /api/short-circuit-comparisons`, karta KD-3 poz. 11), uzywane przez ekran
porownan. Rejestr porownan spod `/api/execution` byl wiec DUPLIKATEM. Rozstrzygniecie:
zdolnosc „roznice na schemacie" dostala dostawce w zywej sciezce, a duplikat
(klient, store porownan, panel `SldDeltaOverlayPanel`, przelacznik i legenda
starej powloki) zostal usuniety.

## Lancuch (do ostatniego klika)

1. **Ekran porownan, tryb zwarciowy** (`ui2/wyniki/porownanie/TrybZwarciowy.tsx`):
   projektant wybiera przebieg A (odniesienie) i B (porownywany), klika
   „Porownaj przebiegi" — tabela punktow z Δ (delty liczy backend).
2. **Akcja „Pokaz roznice na schemacie"** — widoczna dopiero po porownaniu.
   Woła `POST /api/short-circuit-comparisons/sld-overlay` dla pary UZYTEJ
   w porownaniu (nie dla biezacego ustawienia selektorow).
3. **Store nakladki** (`ui/sld-overlay/sldDeltaOverlayStore.ts`) trzyma
   odpowiedz; po udanym pobraniu ekran przechodzi na schemat.
4. **Warstwa wynikowa kanwy v3** (`SldCanvasV3Workspace`) rysuje roznice jako
   etykiety per punkt zwarcia — TA SAMA warstwa co wyniki pojedynczego
   przebiegu, inna wylacznie rodzina szablonow.

## Backend

* **Domena**: `domain/zwarcia_porownanie.py` — delty per punkt (B − A oraz
  procent wobec A). Pole `element_id` (ADDYTYWNE od wersji raportu 1.2.0) niesie
  ref elementu SIECI — tozsamosc uzywana na schemacie.
* **Mapper**: `application/result_mapping/zwarcia_delta_overlay_v1.py` —
  porownanie -> kontrakt overlay v1 (`domain/result_contract_v1.py`).
  Deterministyczny: ten sam wynik -> identyczny payload i `content_hash`.
* **Koncowka**: `POST /api/short-circuit-comparisons/sld-overlay`
  (`api/zwarcia_porownania.py`), zadanie `{run_id_a, run_id_b}`.

### Ref elementu

`element_id` wiersza wyniku, a przy jego braku `target_id`. To DOKLADNIE regula
akcji „Pokaz na schemacie" ekranu zwarc (`pokazNaSchemacie.ts`) — jedno zrodlo
prawdy dla tozsamosci punktu na schemacie.

### Metryki roznicowe (kolejnosc = priorytet)

| Kod | Wielkosc | Jednostka | Format |
|-----|----------|-----------|--------|
| `DELTA_IK_3F_KA` | Δ prad poczatkowy Ik″ | kA | fixed2 |
| `DELTA_IK_3F_PCT` | Δ Ik″ wzgledne | % | fixed1 |
| `DELTA_IP_KA` | Δ prad udarowy ip | kA | fixed2 |
| `DELTA_ITH_KA` | Δ prad cieplny Ith | kA | fixed2 |
| `DELTA_SK_MVA` | Δ moc zwarciowa Sk | MVA | fixed1 |

Kody sa WLASNE dla roznic — nie moga kolidowac z kodami wartosci bezwzglednych
(`IK_3F_A`, `IP_A`, `ITH_A`, `SK_MVA`), zeby roznica nie zostala wzieta za
wielkosc. Wielkosc bez roznicy (brak po jednej stronie, A = 0 przy procencie)
NIE dostaje metryki — konsument pokazuje brak, nigdy zera.

### Waga elementu i legenda

| Waga | Znaczenie |
|------|-----------|
| `INFO` | Bez zmian — wszystkie porownywane wielkosci identyczne |
| `WARNING` | Zmiana — co najmniej jedna wielkosc sie rozni |

Waga liczona jest z metryk, ktore FAKTYCZNIE trafily do nakladki (jedno zrodlo
prawdy: kolor bez pokrycia w liczbach jest wykluczony). Legenda jest polska
i pochodzi z backendu.

### Liczniki punktow

Cztery ROZLACZNE grupy, ktorych suma rowna sie liczbie punktow porownania:
`liczba_punktow_zmienionych`, `liczba_punktow_bez_zmian`,
`liczba_punktow_bez_odpowiednika`, `liczba_punktow_bez_danych`. Dwie ostatnie
grupy nie sa elementami nakladki (roznica dla nich nie istnieje), ale ich liczba
jest jawna — brak nie moze byc niemy.

## Frontend

* `ui/sld-overlay/sldDeltaOverlay.api.ts` — klient (jedna koncowka, walidacja
  ksztaltu odpowiedzi).
* `ui/sld-overlay/sldDeltaOverlayStore.ts` — store nakladki + `payloadEtykietRoznic`
  (postac czytana przez warstwe etykiet).
* `ui/sld/v3/canvas/resultLabelTemplates.ts` — rodzina `short_circuit_delta`
  (podpisy „Δ Ik″", „Δ Ik″ %", „Δ ip", „Δ Ith", „Δ Sk"); `analysis_type`
  z prefiksem `DELTA_` wybiera te rodzine.
* `ui/sld/v3/canvas/SldCanvasV3Workspace.tsx` — nakladka roznic ma
  PIERWSZENSTWO w warstwie etykiet; panel filtrow pokazuje pare przebiegow,
  rozklad punktow, legende i wyjscie („Wylacz roznice").

## Granice

* ZERO fizyki i ZERO arytmetyki w UI — roznice, jednostki, podpowiedzi formatu
  i wage liczy backend.
* ZERO kolorow hex w kontrakcie — wylacznie wagi i wartosci.
* Determinizm: ten sam wynik porownania -> ten sam `content_hash`.

## Swiezosc i wykluczenia

* Nakladka roznic podlega TEJ SAMEJ regule swiezosci co wynik pojedynczego
  przebiegu: `activeCaseResultStatus === 'OUTDATED'` (edycja modelu) wyszarza
  etykiety roznic tak samo jak kazdy inny wynik. Brak rownoleglego trackera.
* Tryb roznic A/B WYKLUCZA tryb porownawczy kolejnych biegow (Δ z Δ nie ma
  sensu inzynierskiego) — kanwa mowi to jawnie zamiast cicho ignorowac.

## Stany zerowe (uczciwe)

* Jeden przebieg wybrany -> walidacja ekranu porownan („Wskaz oba przebiegi").
* Brak punktow wspolnych -> zdanie „Brak punktow obecnych w obu przebiegach…"
  zamiast wyszarzonego przycisku.
* Blad pobrania -> komunikat przy akcji, BEZ przejscia na schemat.

## Testy

* Backend: `tests/application/test_zwarcia_delta_overlay_v1.py` (mapper,
  determinizm, liczniki), `tests/api/test_zwarcia_porownania_api.py`
  (kontrakt koncowki + WPIECIE trasy w aplikacje).
* Frontend: `ui/sld-overlay/__tests__/sldDeltaOverlayStore.test.ts` (adres
  trasy, kształt, drogi bledu), `ui/sld/v3/canvas/__tests__/resultLabelRoznice.test.tsx`
  (rodzina szablonow, tresc etykiet, pierwszenstwo, swiezosc, wyjscie z trybu),
  `ui2/wyniki/porownanie/__tests__/roznicNaSchemacie.test.tsx` (lancuch od
  kliku do przejscia na schemat).
* Guard: `scripts/route_prefix_guard.py` — modul nakladki NIE jest juz w
  rejestrze dlugu „klient bez dostawcy".

## Zadania wsadowe (batch)

Modul `api/batch_execution.py` pozostaje NIEWPIETY (znany, zarejestrowany brak —
patrz `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` §4/§8.5). Nakladka roznic NIE
zalezy juz od niego.
