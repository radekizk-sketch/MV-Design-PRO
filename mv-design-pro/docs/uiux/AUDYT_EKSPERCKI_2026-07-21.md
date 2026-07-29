# AUDYT EKSPERCKI (szerokie grono) — dorobek sesji 2026-07-21

**Status:** BINDING (dyrektywa właściciela 2026-07-21 „przepytaj szerokie grono ekspertów o braki
i poprawki i kod review"). Panel: 7 soczewek eksperckich (projektant sieci, zwarciowiec,
zabezpieczenia, rozdzielnie, katalogi, przyłączenia/OZE, UX/IA) w 3 równoległych recenzjach
read-only nad dorobkiem sesji (arc flash, KreatorStacji, protection I-t, WLS, SSCI).
**Zakres:** commity `218ebb58..HEAD` (24 commity, 75 plików).

Każde znalezisko zweryfikowane niezależnie przez Fable przed dyspozycją. Dyspozycja: **NAPRAWA**
(ta runda) / **KARTA** (backlog z uzasadnieniem).

## A. KRYTYCZNE

| ID | Plik | Defekt | Dyspozycja |
|----|------|--------|-----------|
| **K1** | `enm/domain_operations.py` `append_station_on_endpoint` (6617–7279) | **`append_station_on_endpoint` całkowicie ignoruje `nn_block`** (czytany tylko w `insert` 3824–4441). W trybie ENDPOINT_APPEND kreator stacji cicho gubi źródło PV/BESS/FW, odpływy nN i wyłącznik główny nN. Transformator zwymiarowany pod falownik, który nigdy nie powstaje — cichy błąd danych w rdzeniu integracji OZE. **ZWERYFIKOWANE** (0 wystąpień nn_block w zakresie append). | **NAPRAWA** — parytet append↔insert w konsumpcji nn_block (opcja MAX). |
| **K2** | jw. | Odpływy nN + wyłącznik główny nN = phantom w append (ten sam rdzeń co K1). | **NAPRAWA** (razem z K1). |

## B. WYSOKIE

| ID | Plik | Defekt | Dyspozycja |
|----|------|--------|-----------|
| **W-1** | `protection/curves/iec_curves.py:220` | Krzywa LTI cicho spłaszczana do 1000 s (`min(trip,1000)`) bez śladu WHITE BOX; `base_time_s` vs `tripping_time_s` niespójne. | **NAPRAWA** — ujawnić/podnieść clamp + ślad. |
| **P1** | `stacja/strings.ts:19`, `stacjaModel.ts:137` | Brak typu „stacja końcowa (terminal WE+TR)" — backend obsługuje `terminal`/`mv_lv`, kreator mapuje wszystko→`branch`; dead-end dostaje nadmiarowe pola WY/ODG. Etykieta `branch`=„odbiorcza (odgałęźna)" myli pojęcia. | **NAPRAWA** — dodać typ terminal + poprawić etykiety + domyślny terminal w append. |
| **P2/P3** | `KreatorStacjiSnNn.tsx:128`, `stacjaModel.ts:538`, append 6681 | Zgadywanie napięcia SN: `deriveSnVoltageKv` fallback 15 kV nadpisuje guard backendu; w append napięcie z segmentu (guess) zamiast z `endpoint_bus`. | **NAPRAWA** — jedno źródło napięcia (endpoint w append), brak fallbacku nadpisującego guard. |

## C. ŚREDNIE

| ID | Plik | Defekt | Dyspozycja |
|----|------|--------|-----------|
| **S-1** | `protection_read_model.py:562` | Funkcja bezzwłoczna (I>>, 50) bez zwłoki fałszywie „brak danych"; `t_s=0` na osi log-log. | **NAPRAWA** — instant = t≈0, nie brak; nie generować t_s=0. |
| **S-2** | `protection_read_model.py:104,496` | Funkcje LoM 81U/81O/81R/78 w FUNCTION_META nieosiągalne (bramka wymaga `threshold_a`). | **KARTA** (wymaga modelu setpointów częstotliwościowych). |
| **S-3** | `protection_read_model.py:721` | `tms: None` na sztywno w podsumowaniu nadprądowym mimo `setting.time_multiplier` (sprzeczność z krzywą I-t). | **NAPRAWA** — przekazać TMS. |
| **S-4** | `EkranJakosci.tsx:804` vs `arc_flash_report.py:57` | Rozkład ŚOI + sort rozjeżdżają ekran↔raport (front pomija `null`, `localeCompare`; backend `null→"—"`, codepoint). | **NAPRAWA** — ujednolicić (null→„—", sort stabilny). |
| **S-5** | `arc_flash/builder.py:296` | Energia liczona tylko z `I_arc` (bez scenariusza `I_arc_min` z dłuższym t) — niedoszacowanie „najgorszego przypadku". | **KARTA** (wymaga sprzężenia t(prąd) z TCC). |
| **P4** | `stacjaModel.ts:331`, helpers:295 | Zabezpieczenie źródła tylko dla PV; BESS/FW bez intencji; twardy ref aparatu `EM_ETANGO_400_V0`. | **KARTA** — rozszerzyć na BESS/FW + dobór z katalogu. |
| **P5** | `stacja` sekcyjna | „Sekcyjna" dokłada SPRZĘGŁO, ale brak drugiej sekcji szyny — sprzęgło „w powietrzu". | **KARTA** — model dwusekcyjny w operacji domenowej. |
| **WLS-S1/S2** | `state_estimation/service.py:315`, `wls:790` | Kolumna „Rezyduum r" tylko ze śladu (pusta poza ekspertem); r i r_N z różnych iteratów. | **NAPRAWA** — addytywne `final_residuals` w wyniku. |
| **WLS-S3** | `estymacja/EkranEstymacji.tsx:562` | Zastrzeżenie „walidacja syntetyczna, nie SCADA/PMU" ukryte w trybie eksperckim; `ZNACZNIK_SYNTETYCZNY` martwy. | **NAPRAWA** — baner niezależny od trybu. |
| **WLS-S4** | `estymacja/EkranEstymacji.tsx:599` | Duplikacja selektora przebiegu inline vs `przebiegRozplywuEstymacji` (test maskujący, Zero-Debt §5). | **NAPRAWA** — reużyć helper. |
| **B1** | brak `ui2/wyniki/ssci` | Werdykt SSCI ma backend+API, brak UI — łamie end-to-end. | **NAPRAWA** (agent SSCI UI w toku). |

## D. DROBNE (KARTA)
D-1 arc flash `log10` bez guardu dodatniości (500 zamiast uczciwego braku) — **NAPRAWA** (mały, obronny).
D-2 „najgorszy przypadek" miesza IEEE+Lee bez oznaczenia metody. D-3 rozkład ŚOI zawsze „dane
niekompletne" (pusta tablica NFPA 70E) — komunikat zamiast chipa. WLS-D1 podejrzany pomiar
pokazuje surowy enum — **NAPRAWA**. Stacja D2 duplikat `ogranicznikOdplywow`, D3 rozjazd
formaterów kV/MVA (kropka vs przecinek), D4 martwe klucze payloadu, D5 pusty katalog bez stanu
zerowego, D6 licznik odpływów miesza źródłowe/odbiorcze. SSCI D2 okrążenia −1 jako pierwotny
wyzwalacz (przybliżenie jednostronne).

## E. REALNE BRAKI FUNKCJI (stacja — karty do kolejnych rund, opcja MAX)
Uziemienie stacji / punkt neutralny nN (TN/TT, pętla zwarcia IEC 60364), ograniczniki przepięć
SPD SN/nN, układ pomiarowo-rozliczeniowy (przekładniki + licznik — obowiązkowy dla OZE),
sekcjonowanie nN, prawdziwa dwusekcyjna stacja sekcyjna, potrzeby własne stacji, praca
równoległa transformatorów.

## Status realizacji (2026-07-21, po batchach naprawczych)

Wszystkie dyspozycje **NAPRAWA** wdrożone end-to-end (kod + testy realnej ścieżki + bramki + push):

| ID | Status | Commit / zakres |
|----|--------|-----------------|
| K1/K2 | ✅ NAPRAWIONE | Parytet append↔insert dla `nn_block` (ekstrakcja `_build_nn_field_specs`/`_materialize_nn_source`); test reprodukujący PV+LOAD. |
| W-1 | ✅ NAPRAWIONE | `MAX_TRIPPING_TIME_S` udokumentowany + `unclamped_tripping_time_s`/`clamp_applied` w śladzie. |
| P1 | ✅ NAPRAWIONE | Typ `terminal` w kreatorze ui2 + domyślny terminal w append + etykiety. |
| P2/P3 | ✅ NAPRAWIONE | `deriveSnVoltageKv` z rzeczywistej szyny (odcinek/terminal); nieznane → pominięcie `sn_voltage_kv`; usunięto fallback 15 kV. |
| S-1 | ✅ NAPRAWIONE | Bezzwłoczna = podłoga czasowa solvera, nie „brak danych"/t_s=0. |
| S-3 | ✅ NAPRAWIONE (batch 1) | TMS w podsumowaniu nadprądowym z `it_curve`. |
| S-4 | ✅ NAPRAWIONE (batch 1) | Ujednolicenie rozkładu ŚOI ekran↔raport (null→„—", sort codepoint). |
| WLS-S1/S2 | ✅ NAPRAWIONE | Addytywne `final_residuals` w wyniku (r i r_N z tego samego iteratu, niezależne od śladu). |
| WLS-S3 | ✅ NAPRAWIONE | Baner „walidacja syntetyczna" niezależny od trybu. |
| WLS-S4 | ✅ NAPRAWIONE | Reużycie `przebiegRozplywuEstymacji`. |
| WLS-D1 | ✅ NAPRAWIONE | Etykieta PL podejrzanego pomiaru (`typPomiaruPL`). |
| B1 | ✅ NAPRAWIONE | Ekran werdyktu SSCI `ui2/wyniki/ssci` (endpoint v126). |
| D-1 | ✅ NAPRAWIONE | Jawny guard dodatniości argumentów `log10` w energii incydentu. |

Pozostają **KARTA** (backlog z uzasadnieniem): S-2 (setpointy częstotliwościowe LoM),
S-5 (`I_arc_min` + sprzężenie t(prąd) z TCC), P4 (zabezpieczenie BESS/FW + dobór z katalogu),
P5 (model dwusekcyjny), D-2/D-3 (drobne prezentacyjne) oraz REALNE BRAKI FUNKCJI stacji
(sekcja E: uziemienie/punkt neutralny, SPD, układ pomiarowo-rozliczeniowy, sekcjonowanie nN,
praca równoległa transformatorów).

## Ocena panelu
Warstwa fizyki (IEC 60255, IEEE 1584, WLS, SSCI) rzetelna i uczciwie oznacza proweniencję/braki.
Defekty dotyczą głównie warstwy interpretacji/prezentacji, przypadków brzegowych oraz — krytycznie
— **asymetrii insert/append w KreatorStacji (K1/K2)**, która jest realnym cichym błędem danych.
