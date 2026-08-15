<# MV-DESIGN-PRO — KANONICZNY ALGORYTM KREATORA
# (ALGORYTM PROJEKTANTA – WERSJA PRZEMYSŁOWA)
# ŹRÓDŁO: Pełna Specyfikacja Algorytmu Projektanta (DOCX)

================================================================================
STATUS
================================================================================
- STATUS: CANONICAL / NORMATIVE
- KLASYFIKACJA: Industrial (benchmark / DIgSILENT benchmark)
- TEN PLIK JEST JEDYNYM KONTRAKTEM DLA:
  - kreatora (wizard)
  - backendu (logika dostępności)
  - AI (Codex / Claude Code)
- WSZYSTKIE WCZEŚNIEJSZE OPISY KREATORA TRACĄ WAŻNOŚĆ

================================================================================
ZASADY NADRZĘDNE (Z DOCX — LINIA PO LINII)
================================================================================
[DOCX]
„Projektant nie wykonuje obliczeń ręcznych. Wszystkie parametry wynikają
z danych katalogowych i obliczeń systemowych.”

→ UI NIE LICZY
→ UI NIE POSIADA DANYCH ELEKTRYCZNYCH
→ WSZYSTKIE PARAMETRY Z KATALOGÓW

[DOCX]
„Elementy sieci dobierane są wyłącznie z zatwierdzonych baz danych.”

→ WSZYSTKIE ELEMENTY: catalog.*
→ UI OPERUJE WYŁĄCZNIE NA ID

================================================================================
DEFINICJE
================================================================================
DesignSession:
- aktywna sesja projektowa

Snapshot:
- niezmienny zapis stanu po każdej operacji
- zawiera graf, katalogowe ID, wyniki solverów, white-box trace

Katalog:
- jedyne źródło danych technicznych
- brak ręcznego wprowadzania parametrów

================================================================================
TRYBY ALGORYTMU (Z DOCX)
================================================================================
SIMPLIFIED:
- uproszczona ścieżka
- ograniczona liczba weryfikacji

FULL:
- pełna ścieżka projektowa
- pełne sprawdzenia normowe i zabezpieczeniowe

================================================================================
TYPY DECYZJI ALGORYTMICZNYCH (Z DOCX)
================================================================================
ALLOW   — operacja dopuszczona
BLOCK   — operacja zabroniona, brak kontynuacji
RETURN  — cofnięcie do wcześniejszego kroku
WARNING — dopuszczone z flagą ostrzegawczą

================================================================================
ALGORYTM PROJEKTANTA — KROK PO KROKU (DOCX → SYSTEM)
================================================================================

--------------------------------------------------------------------------------
ALG_STEP 1 — INICJALIZACJA PROJEKTU
--------------------------------------------------------------------------------
[DOCX]
„Projekt rozpoczyna się od pustej struktury sieciowej.”

WARUNEK:
- projekt istnieje

EFEKT:
- pusty graf
- brak elementów
- snapshot startowy

--------------------------------------------------------------------------------
ALG_STEP 2 — DEFINICJA ŹRÓDŁA ZASILANIA (GPZ)
--------------------------------------------------------------------------------
[DOCX]
„Na początku należy określić jedno główne źródło zasilania SN.”

OPERACJA:
- ADD_SOURCE (catalog.sources)

WARUNKI:
- dokładnie jedno źródło

JEŻELI:
- brak źródła → BLOCK
- więcej niż jedno → BLOCK

EFEKT:
- snapshot
- obliczenia zwarciowe IEC / PN-EN 60909

--------------------------------------------------------------------------------
ALG_STEP 3 — BUDOWA TOPOLOGII SIECI
--------------------------------------------------------------------------------
[DOCX]
„Sieć rozwijana jest przez dodawanie kolejnych odcinków i stacji.”

OPERACJE:
- CONTINUE_TRUNK_SEGMENT_SN / START_BRANCH_SEGMENT_SN
- INSERT_STATION_ON_SEGMENT_SN
- ADD_TRANSFORMER_SN_NN

JEŻELI:
- topologia niespójna → RETURN do początku kroku
- naruszenie struktury → BLOCK

EFEKT:
- graf sieci
- snapshot po każdej operacji

--------------------------------------------------------------------------------
ALG_STEP 4 — WERYFIKACJA KOMPLETNOŚCI DANYCH
--------------------------------------------------------------------------------
[DOCX]
„W przypadku braków danych algorytm powraca do budowy struktury.”

SPRAWDZANE:
- kompletność katalogowych ID
- spójność grafu

JEŻELI:
- braki → RETURN do ALG_STEP 3
- sprzeczności → BLOCK

--------------------------------------------------------------------------------
ALG_STEP 5 — OBLICZENIA ZWARCIOWE
--------------------------------------------------------------------------------
[DOCX]
„Wykonywane są obliczenia zwarciowe zgodnie z PN-EN 60909.”

AKCJA:
- run_short_circuit

SPRAWDZANE:
- Ik3max
- Ik1min

JEŻELI:
- przekroczenia → RETURN do ALG_STEP 3
- brak zbieżności → BLOCK

--------------------------------------------------------------------------------
ALG_STEP 6 — OBLICZENIA ROZPŁYWU MOCY
--------------------------------------------------------------------------------
[DOCX]
„Wykonywane są obliczenia rozpływu mocy.”

AKCJA:
- run_power_flow

SPRAWDZANE:
- spadki napięć
- obciążenia

JEŻELI:
- przekroczenia → RETURN
- brak zbieżności → BLOCK

--------------------------------------------------------------------------------
ALG_STEP 7 — ODBIORY I ŹRÓDŁA OZE
--------------------------------------------------------------------------------
[DOCX]
„Odbiory i generatory przyłączane są do istniejącej sieci.”

OPERACJE:
- ADD_LOAD
- ADD_GENERATOR

EFEKT:
- aktualizacja obciążeń
- nowe obliczenia

--------------------------------------------------------------------------------
ALG_STEP 8 — BoundaryNode – PUNKT WSPÓLNEGO PRZYŁĄCZENIA
--------------------------------------------------------------------------------
[DOCX]
„Dla źródeł wytwórczych należy określić BoundaryNode.”

OPERACJA:
- SET_BoundaryNode

EFEKT:
- kontekst NC RfG
- snapshot

--------------------------------------------------------------------------------
ALG_STEP 9 — ZABEZPIECZENIA I SELEKTYWNOŚĆ
--------------------------------------------------------------------------------
[DOCX]
„Dobór zabezpieczeń wykonywany jest na podstawie wyników zwarciowych.”

WARUNEK:
- dostępne wyniki zwarciowe

JEŻELI:
- brak selektywności → RETURN
- brak danych → BLOCK

--------------------------------------------------------------------------------
ALG_STEP 10 — WALIDACJA KOŃCOWA
--------------------------------------------------------------------------------
[DOCX]
„Projekt podlega końcowej weryfikacji normowej.”

SPRAWDZANE:
- normy
- kompletność
- BoundaryNode

JEŻELI:
- niezgodność → RETURN do właściwego kroku

--------------------------------------------------------------------------------
ALG_STEP 11 — DOKUMENTACJA
--------------------------------------------------------------------------------
[DOCX]
„Generowana jest dokumentacja projektowa.”

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
DEFINICJA ZGODNOŚCI
================================================================================
Implementacja jest zgodna, jeżeli:
- algorytm da się odtworzyć wyłącznie z snapshotów
- solver jest jedynym źródłem fizyki
- kreator jest w 100% deterministyczny

================================================================================
KONIEC — TEN PLIK JEST WIĄŻĄCY
================================================================================
> 

END.

