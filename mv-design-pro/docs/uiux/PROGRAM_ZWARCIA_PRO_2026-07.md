# PROGRAM ZWARCIA-PRO — przebudowa wyników zwarciowych IEC 60909 (BINDING)

Źródło: karta właściciela 2026-07-22 (15 punktów; „narzędzie klasy profesjonalnej
dla projektantów SN, zabezpieczeniowców, OSD i audytorów; globalnie, bez rozbieżności
między modułami"). Podlega: kanon V12.xx, ZASADA_WYWODOW_KATEX_I_TYPOGRAFII (BINDING),
FROZEN Result API (rozszerzenia WYŁĄCZNIE addytywne), zero fizyki w UI.

## §0. Rozstrzygnięcia architektoniczne (nie do dyskusji w kartach)

1. **Solver FROZEN już liczy pełny bilans.** `ShortCircuitResult` niesie: `zkk_ohm`
   (Thevenin, complex), `rx_ratio`, `kappa`, `c_factor`, `un_v`, `tk_s`, `tb_s`,
   `ikss_a`, `ip_a`, `ith_a`, `ib_a`, `sk_mva`, `ik_thevenin_a`, `ik_inverters_a`,
   `ik_total_a`, `contributions[]` (per źródło), `branch_contributions[]`,
   `white_box_trace`. Defekt łańcucha = `enm/canonical_analysis.build_short_circuit_results`
   FILTRUJE te pola. Naprawa u źródła łańcucha danych, solver NIETKNIĘTY.
2. **Projekcje w warstwie ENM, nie w UI**: moduł |Zk| z pary (Re, Im), X/R = 1/(R/X),
   I²t = Ith²·tk — to deterministyczne projekcje wielkości JUŻ policzonych przez
   solver (klasa przekształceń jak A→kA), budowane w `build_short_circuit_results`
   z komentarzem normowym. UI wyłącznie formatuje.
3. **μ i q są wielkościami per maszyna** (IEC 60909 §6.6) — ich miejsce to sekcja
   wkładów (endpoint contributions, wywód dyplomowy per źródło), NIE wiersz punktu
   zwarcia. Fabrykowanie „punktowego μ" zakazane.
4. **Czytelność przy dużych sieciach**: tabela główna = kolumny dzisiejsze + kolumny
   impedancyjne (Rk, Xk, |Zk|, X/R, κ) w trybie eksperckim; PEŁNY bilans punktu
   (c, Un, tk, tb, Ib, Ik, I²t, Sk″) w panelu „Bilans IEC 60909" wybranego punktu
   (klik wiersza) — bez zaglądania do White Box, bez przeładowania tabeli.

## §1. Fazy (mapowanie na punkty karty właściciela)

| Faza | Zakres | Punkty karty | Wykonanie |
|---|---|---|---|
| **F1** | Pełny bilans end-to-end: ENM rows + typ frontu + kolumny eksperckie + panel „Bilans IEC 60909" + API tables meta | 1, 2, 3, 4, 11 (kontrakt) | Fable osobiście — WYKONANE (V12K-115) |
| **F2** | Wkłady PRO: sortowanie/filtr (reuse TabelaWynikow), wykres udziałów + słupki przełączalne (Ik″/Ip/Ith/Sk″/I²t), rozwinięcie wkładu per źródło (μ, q, Ib, wywód dyplomowy per maszyna — dane z contributions) | 5, 12 | **SCALONE (V12K-116)**; GAP wkładów gałęziowych → delta w F4/F5 |
| **F3** | White Box sekcyjny (`SladSekcyjny`, sekcje z normą per tytuł); reguła 5% z wartościami (treść, próg, wartość, PASS/FAIL, wpływ); panel walidacji IEC (6 pozycji, budowany w backendzie) | 8, 9, 10 | **SCALONE (V12K-117)** |
| **F4** | Synchronizacja SLD: klik punktu → centrowanie + podświetlenie na schemacie (reuse selekcjaPoOperacji/centerSldOnElement), overlay wkładów: grubość/kolor ∝ prąd, kierunek, miejsce zwarcia (rodzina adapterów overlay z OLTC — reuse) | 6, 7 | karta W-C (po F1–F3) |
| **F5** | Parytet raportów/eksportów: PDF/DOCX/Excel + pakiet dowodowy SC3F zawierają pełny bilans i sekcje White Box 1:1 z UI; analiza zabezpieczeń/dobór aparatów/termika czytają NOWE pola z tego samego kontraktu | 13 | karta W-D (po F1) |
| Bramy | Normy (IEC 60909/-0/-4, 60076, 60255, PN-EN, IRiESD) = odwołania per krok w F3; kryteria odbioru pkt 15 = bramki każdej fazy | 14, 15 | każda karta |

## §2. Kryteria odbioru programu (pkt 15 właściciela, wiążące per faza)

- Wszystkie parametry liczone w solverze/backendzie (UI formatuje) — F1 ✅.
- Wszystkie wartości w API (rows kanoniczne + tables meta) — F1 ✅.
- White Box = kompletna ścieżka w sekcjach z normą per krok — F3.
- Identyfikowalność wynik→wzór→dane→element→katalog — F3 (odwołania) + istniejący
  dowodRef/trace (K3).
- Czytelność przy dużych modelach — §0.4 (kolumny eksperckie + panel bilansu).
- Klik punktu synchronizuje tabelę+White Box+SLD — F4.
- Raporty PDF/Excel/Word 1:1 z UI — F5.
- Globalnie, bez wyjątków — każda karta kończy się regresją pełnej warstwy.
