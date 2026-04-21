<# MV-DESIGN-PRO â€” KANONICZNY ALGORYTM KREATORA
# (ALGORYTM PROJEKTANTA â€“ WERSJA PRZEMYSĹOWA)
# ĹąRĂ“DĹO: PeĹ‚na Specyfikacja Algorytmu Projektanta (DOCX)

================================================================================
STATUS
================================================================================
- STATUS: CANONICAL / NORMATIVE
- KLASYFIKACJA: Industrial (benchmark / DIgSILENT benchmark)
- TEN PLIK JEST JEDYNYM KONTRAKTEM DLA:
  - kreatora (wizard)
  - backendu (logika dostÄ™pnoĹ›ci)
  - AI (Codex / Claude Code)
- WSZYSTKIE WCZEĹšNIEJSZE OPISY KREATORA TRACÄ„ WAĹ»NOĹšÄ†

================================================================================
ZASADY NADRZÄDNE (Z DOCX â€” LINIA PO LINII)
================================================================================
[DOCX]
â€žProjektant nie wykonuje obliczeĹ„ rÄ™cznych. Wszystkie parametry wynikajÄ…
z danych katalogowych i obliczeĹ„ systemowych.â€ť

â†’ UI NIE LICZY
â†’ UI NIE POSIADA DANYCH ELEKTRYCZNYCH
â†’ WSZYSTKIE PARAMETRY Z KATALOGĂ“W

[DOCX]
â€žElementy sieci dobierane sÄ… wyĹ‚Ä…cznie z zatwierdzonych baz danych.â€ť

â†’ WSZYSTKIE ELEMENTY: catalog.*
â†’ UI OPERUJE WYĹÄ„CZNIE NA ID

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
- brak rÄ™cznego wprowadzania parametrĂłw

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
ALLOW   â€” operacja dopuszczona
BLOCK   â€” operacja zabroniona, brak kontynuacji
RETURN  â€” cofniÄ™cie do wczeĹ›niejszego kroku
WARNING â€” dopuszczone z flagÄ… ostrzegawczÄ…

================================================================================
ALGORYTM PROJEKTANTA â€” KROK PO KROKU (DOCX â†’ SYSTEM)
================================================================================

--------------------------------------------------------------------------------
ALG_STEP 1 â€” INICJALIZACJA PROJEKTU
--------------------------------------------------------------------------------
[DOCX]
â€žProjekt rozpoczyna siÄ™ od pustej struktury sieciowej.â€ť

WARUNEK:
- projekt istnieje

EFEKT:
- pusty graf
- brak elementĂłw
- snapshot startowy

--------------------------------------------------------------------------------
ALG_STEP 2 â€” DEFINICJA ĹąRĂ“DĹA ZASILANIA (GPZ)
--------------------------------------------------------------------------------
[DOCX]
â€žNa poczÄ…tku naleĹĽy okreĹ›liÄ‡ jedno gĹ‚Ăłwne ĹşrĂłdĹ‚o zasilania SN.â€ť

OPERACJA:
- ADD_SOURCE (catalog.sources)

WARUNKI:
- dokĹ‚adnie jedno ĹşrĂłdĹ‚o

JEĹ»ELI:
- brak ĹşrĂłdĹ‚a â†’ BLOCK
- wiÄ™cej niĹĽ jedno â†’ BLOCK

EFEKT:
- snapshot
- obliczenia zwarciowe IEC / PN-EN 60909

--------------------------------------------------------------------------------
ALG_STEP 3 â€” BUDOWA TOPOLOGII SIECI
--------------------------------------------------------------------------------
[DOCX]
â€žSieÄ‡ rozwijana jest przez dodawanie kolejnych odcinkĂłw i stacji.â€ť

OPERACJE:
- CONTINUE_TRUNK_SEGMENT_SN / START_BRANCH_SEGMENT_SN
- INSERT_STATION_ON_SEGMENT_SN
- ADD_TRANSFORMER_SN_NN

JEĹ»ELI:
- topologia niespĂłjna â†’ RETURN do poczÄ…tku kroku
- naruszenie struktury â†’ BLOCK

EFEKT:
- graf sieci
- snapshot po kaĹĽdej operacji

--------------------------------------------------------------------------------
ALG_STEP 4 â€” WERYFIKACJA KOMPLETNOĹšCI DANYCH
--------------------------------------------------------------------------------
[DOCX]
â€žW przypadku brakĂłw danych algorytm powraca do budowy struktury.â€ť

SPRAWDZANE:
- kompletnoĹ›Ä‡ katalogowych ID
- spĂłjnoĹ›Ä‡ grafu

JEĹ»ELI:
- braki â†’ RETURN do ALG_STEP 3
- sprzecznoĹ›ci â†’ BLOCK

--------------------------------------------------------------------------------
ALG_STEP 5 â€” OBLICZENIA ZWARCIOWE
--------------------------------------------------------------------------------
[DOCX]
â€žWykonywane sÄ… obliczenia zwarciowe zgodnie z PN-EN 60909.â€ť

AKCJA:
- run_short_circuit

SPRAWDZANE:
- Ik3max
- Ik1min

JEĹ»ELI:
- przekroczenia â†’ RETURN do ALG_STEP 3
- brak zbieĹĽnoĹ›ci â†’ BLOCK

--------------------------------------------------------------------------------
ALG_STEP 6 â€” OBLICZENIA ROZPĹYWU MOCY
--------------------------------------------------------------------------------
[DOCX]
â€žWykonywane sÄ… obliczenia rozpĹ‚ywu mocy.â€ť

AKCJA:
- run_power_flow

SPRAWDZANE:
- spadki napiÄ™Ä‡
- obciÄ…ĹĽenia

JEĹ»ELI:
- przekroczenia â†’ RETURN
- brak zbieĹĽnoĹ›ci â†’ BLOCK

--------------------------------------------------------------------------------
ALG_STEP 7 â€” ODBIORY I ĹąRĂ“DĹA OZE
--------------------------------------------------------------------------------
[DOCX]
â€žOdbiory i generatory przyĹ‚Ä…czane sÄ… do istniejÄ…cej sieci.â€ť

OPERACJE:
- ADD_LOAD
- ADD_GENERATOR

EFEKT:
- aktualizacja obciÄ…ĹĽeĹ„
- nowe obliczenia

--------------------------------------------------------------------------------
ALG_STEP 8 â€” BoundaryNode â€“ PUNKT WSPĂ“LNEGO PRZYĹÄ„CZENIA
--------------------------------------------------------------------------------
[DOCX]
â€žDla ĹşrĂłdeĹ‚ wytwĂłrczych naleĹĽy okreĹ›liÄ‡ BoundaryNode.â€ť

OPERACJA:
- SET_BoundaryNode

EFEKT:
- kontekst NC RfG
- snapshot

--------------------------------------------------------------------------------
ALG_STEP 9 â€” ZABEZPIECZENIA I SELEKTYWNOĹšÄ†
--------------------------------------------------------------------------------
[DOCX]
â€žDobĂłr zabezpieczeĹ„ wykonywany jest na podstawie wynikĂłw zwarciowych.â€ť

WARUNEK:
- dostÄ™pne wyniki zwarciowe

JEĹ»ELI:
- brak selektywnoĹ›ci â†’ RETURN
- brak danych â†’ BLOCK

--------------------------------------------------------------------------------
ALG_STEP 10 â€” WALIDACJA KOĹCOWA
--------------------------------------------------------------------------------
[DOCX]
â€žProjekt podlega koĹ„cowej weryfikacji normowej.â€ť

SPRAWDZANE:
- normy
- kompletnoĹ›Ä‡
- BoundaryNode

JEĹ»ELI:
- niezgodnoĹ›Ä‡ â†’ RETURN do wĹ‚aĹ›ciwego kroku

--------------------------------------------------------------------------------
ALG_STEP 11 â€” DOKUMENTACJA
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
- pokazuje dostÄ™pne operacje
- pokazuje BLOCK / RETURN / WARNING
- NIE interpretuje
- NIE liczy
- NIE ukrywa operacji

================================================================================
ZAKAZY ABSOLUTNE
================================================================================
- rÄ™czne parametry elektryczne
- lokalne obliczenia
- auto-kroki
- heurystyki UI

================================================================================
DEFINICJA ZGODNOĹšCI
================================================================================
Implementacja jest zgodna, jeĹĽeli:
- algorytm da siÄ™ odtworzyÄ‡ wyĹ‚Ä…cznie z snapshotĂłw
- solver jest jedynym ĹşrĂłdĹ‚em fizyki
- kreator jest w 100% deterministyczny

================================================================================
KONIEC â€” TEN PLIK JEST WIÄ„Ĺ»Ä„CY
================================================================================
> 

END.

