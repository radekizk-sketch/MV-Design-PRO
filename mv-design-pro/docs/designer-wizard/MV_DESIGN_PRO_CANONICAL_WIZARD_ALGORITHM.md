<# MV-DESIGN-PRO — KANONICZNY ALGORYTM KREATORA
# (ALGORYTM PROJEKTANTA – WERSJA PRZEMYSĹOWA)
# ĹąRĂ“DĹO: PeĹ‚na Specyfikacja Algorytmu Projektanta (DOCX)

================================================================================
STATUS
================================================================================
- STATUS: CANONICAL / NORMATIVE
- KLASYFIKACJA: Industrial (benchmark / DIgSILENT benchmark)
- TEN PLIK JEST JEDYNYM KONTRAKTEM DLA:
  - kreatora (wizard)
  - backendu (logika dostępnoĹ›ci)
  - AI (Codex / Claude Code)
- WSZYSTKIE WCZEĹšNIEJSZE OPISY KREATORA TRACĄ WAĹ»NOĹšĆ

================================================================================
ZASADY NADRZÄDNE (Z DOCX — LINIA PO LINII)
================================================================================
[DOCX]
â€žProjektant nie wykonuje obliczeĹ„ ręcznych. Wszystkie parametry wynikają
z danych katalogowych i obliczeĹ„ systemowych.â€ť

→ UI NIE LICZY
→ UI NIE POSIADA DANYCH ELEKTRYCZNYCH
→ WSZYSTKIE PARAMETRY Z KATALOGĂ“W

[DOCX]
â€žElementy sieci dobierane są wyĹ‚ącznie z zatwierdzonych baz danych.â€ť

→ WSZYSTKIE ELEMENTY: catalog.*
→ UI OPERUJE WYĹĄCZNIE NA ID

================================================================================
DEFINICJE
================================================================================
DesignSession:
- aktywna sesja projektowa

Snapshot:
- niezmienny zapis stanu po kaĹĽdej operacji
- zawiera graf, katalogowe ID, wyniki solverĂłw, white-box trace

Katalog:
- jedyne ĹşrĂłdĹ‚o danych technicznych
- brak ręcznego wprowadzania parametrĂłw

================================================================================
TRYBY ALGORYTMU (Z DOCX)
================================================================================
SIMPLIFIED:
- uproszczona Ĺ›cieĹĽka
- ograniczona liczba weryfikacji

FULL:
- peĹ‚na Ĺ›cieĹĽka projektowa
- peĹ‚ne sprawdzenia normowe i zabezpieczeniowe

================================================================================
TYPY DECYZJI ALGORYTMICZNYCH (Z DOCX)
================================================================================
ALLOW   — operacja dopuszczona
BLOCK   — operacja zabroniona, brak kontynuacji
RETURN  — cofnięcie do wczeĹ›niejszego kroku
WARNING — dopuszczone z flagą ostrzegawczą

================================================================================
ALGORYTM PROJEKTANTA — KROK PO KROKU (DOCX → SYSTEM)
================================================================================

--------------------------------------------------------------------------------
ALG_STEP 1 — INICJALIZACJA PROJEKTU
--------------------------------------------------------------------------------
[DOCX]
â€žProjekt rozpoczyna się od pustej struktury sieciowej.â€ť

WARUNEK:
- projekt istnieje

EFEKT:
- pusty graf
- brak elementĂłw
- snapshot startowy

--------------------------------------------------------------------------------
ALG_STEP 2 — DEFINICJA ĹąRĂ“DĹA ZASILANIA (GPZ)
--------------------------------------------------------------------------------
[DOCX]
â€žNa początku naleĹĽy okreĹ›lić jedno gĹ‚Ăłwne ĹşrĂłdĹ‚o zasilania SN.â€ť

OPERACJA:
- ADD_SOURCE (catalog.sources)

WARUNKI:
- dokĹ‚adnie jedno ĹşrĂłdĹ‚o

JEĹ»ELI:
- brak ĹşrĂłdĹ‚a → BLOCK
- więcej niĹĽ jedno → BLOCK

EFEKT:
- snapshot
- obliczenia zwarciowe IEC / PN-EN 60909

--------------------------------------------------------------------------------
ALG_STEP 3 — BUDOWA TOPOLOGII SIECI
--------------------------------------------------------------------------------
[DOCX]
â€žSieć rozwijana jest przez dodawanie kolejnych odcinkĂłw i stacji.â€ť

OPERACJE:
- CONTINUE_TRUNK_SEGMENT_SN / START_BRANCH_SEGMENT_SN
- INSERT_STATION_ON_SEGMENT_SN
- ADD_TRANSFORMER_SN_NN

JEĹ»ELI:
- topologia niespĂłjna → RETURN do początku kroku
- naruszenie struktury → BLOCK

EFEKT:
- graf sieci
- snapshot po kaĹĽdej operacji

--------------------------------------------------------------------------------
ALG_STEP 4 — WERYFIKACJA KOMPLETNOĹšCI DANYCH
--------------------------------------------------------------------------------
[DOCX]
â€žW przypadku brakĂłw danych algorytm powraca do budowy struktury.â€ť

SPRAWDZANE:
- kompletnoĹ›ć katalogowych ID
- spĂłjnoĹ›ć grafu

JEĹ»ELI:
- braki → RETURN do ALG_STEP 3
- sprzecznoĹ›ci → BLOCK

--------------------------------------------------------------------------------
ALG_STEP 5 — OBLICZENIA ZWARCIOWE
--------------------------------------------------------------------------------
[DOCX]
â€žWykonywane są obliczenia zwarciowe zgodnie z PN-EN 60909.â€ť

AKCJA:
- run_short_circuit

SPRAWDZANE:
- Ik3max
- Ik1min

JEĹ»ELI:
- przekroczenia → RETURN do ALG_STEP 3
- brak zbieĹĽnoĹ›ci → BLOCK

--------------------------------------------------------------------------------
ALG_STEP 6 — OBLICZENIA ROZPĹYWU MOCY
--------------------------------------------------------------------------------
[DOCX]
â€žWykonywane są obliczenia rozpĹ‚ywu mocy.â€ť

AKCJA:
- run_power_flow

SPRAWDZANE:
- spadki napięć
- obciąĹĽenia

JEĹ»ELI:
- przekroczenia → RETURN
- brak zbieĹĽnoĹ›ci → BLOCK

--------------------------------------------------------------------------------
ALG_STEP 7 — ODBIORY I ĹąRĂ“DĹA OZE
--------------------------------------------------------------------------------
[DOCX]
â€žOdbiory i generatory przyĹ‚ączane są do istniejącej sieci.â€ť

OPERACJE:
- ADD_LOAD
- ADD_GENERATOR

EFEKT:
- aktualizacja obciąĹĽeĹ„
- nowe obliczenia

--------------------------------------------------------------------------------
ALG_STEP 8 — BoundaryNode – PUNKT WSPĂ“LNEGO PRZYĹĄCZENIA
--------------------------------------------------------------------------------
[DOCX]
â€žDla ĹşrĂłdeĹ‚ wytwĂłrczych naleĹĽy okreĹ›lić BoundaryNode.â€ť

OPERACJA:
- SET_BoundaryNode

EFEKT:
- kontekst NC RfG
- snapshot

--------------------------------------------------------------------------------
ALG_STEP 9 — ZABEZPIECZENIA I SELEKTYWNOĹšĆ
--------------------------------------------------------------------------------
[DOCX]
â€žDobĂłr zabezpieczeĹ„ wykonywany jest na podstawie wynikĂłw zwarciowych.â€ť

WARUNEK:
- dostępne wyniki zwarciowe

JEĹ»ELI:
- brak selektywnoĹ›ci → RETURN
- brak danych → BLOCK

--------------------------------------------------------------------------------
ALG_STEP 10 — WALIDACJA KOĹCOWA
--------------------------------------------------------------------------------
[DOCX]
â€žProjekt podlega koĹ„cowej weryfikacji normowej.â€ť

SPRAWDZANE:
- normy
- kompletnoĹ›ć
- BoundaryNode

JEĹ»ELI:
- niezgodnoĹ›ć → RETURN do wĹ‚aĹ›ciwego kroku

--------------------------------------------------------------------------------
ALG_STEP 11 — DOKUMENTACJA
--------------------------------------------------------------------------------
[DOCX]
â€žGenerowana jest dokumentacja projektowa.â€ť

OPERACJE:
- export DOCX
- export PDF
- export JSON

================================================================================
ROLA KREATORA
================================================================================
- pokazuje dostępne operacje
- pokazuje BLOCK / RETURN / WARNING
- NIE interpretuje
- NIE liczy
- NIE ukrywa operacji

================================================================================
ZAKAZY ABSOLUTNE
================================================================================
- ręczne parametry elektryczne
- lokalne obliczenia
- auto-kroki
- heurystyki UI

================================================================================
DEFINICJA ZGODNOĹšCI
================================================================================
Implementacja jest zgodna, jeĹĽeli:
- algorytm da się odtworzyć wyĹ‚ącznie z snapshotĂłw
- solver jest jedynym ĹşrĂłdĹ‚em fizyki
- kreator jest w 100% deterministyczny

================================================================================
KONIEC — TEN PLIK JEST WIĄĹ»ĄCY
================================================================================
> 

END.

