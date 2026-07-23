# OPINIA ZESPOŁU EKSPERTÓW — W2c DER PO STRONIE SN: DOBORY I WALIDACJE (2026-07-23) — WIĄŻĄCA

Status: **WIĄŻĄCA**. Werdykt: kierunek W2b/W2c właściwy (rozdzielenie TR
blokowego od TR stacji + pełny tor = obowiązujący standard całego systemu),
ale do kompletności produkcyjnej brakuje WARSTWY DOBORU I WALIDACJI:
model ma wynikać z parametrów elektrycznych, nie z geometrii; kreator nie
jest narzędziem graficznym.

## Wymagania (1–14, skondensowane bez utraty treści)

1. **Model z parametrów elektrycznych:** użytkownik definiuje moc źródła,
   U_AC falownika, liczbę falowników, grupowanie, U po stronie SN, moc TR
   blokowego, układ połączeń, impedancję, sposób regulacji, wymagania OSD —
   system SAM generuje poprawny tor.
2. **WALIDACJA OBOWIĄZKOWA — U_AC falownika ↔ strona nN TR blokowego:**
   falownik 400 V + TR 0,69/15 kV = BŁĄD; falownik 800 V + TR 0,4/15 kV =
   BŁĄD. Komunikat: „❌ Niezgodność napięcia falownika z napięciem strony nN
   transformatora."
3. **Automatyczny dobór TR blokowego** (propozycja systemu, nie tylko lista):
   z ΣP falowników, U_AC, przeciążalności, współczynnika jednoczesności,
   wymagań OSD, rezerwy. Przykład: PV 998 kW ⇒ propozycja 1000 kVA 0,4/15
   Dyn5 uk=6%. Wybór 630 kVA ⇒ „❌ Moc transformatora niewystarczająca."
4. **Dobór falowników end-to-end:** wejście (producent/model/moc/U_AC/MPPT/
   I_max/cosφ/Q(U)/zdolność Q) → automatycznie: dobór TR, kabla nN,
   zabezpieczenia nN, pola SN, przekładników, zabezpieczeń, model rozpływu/
   zwarciowy/regulacji → wyjście: SLD + wyniki + raport PDF + lista
   materiałowa. **Jeden model domenowy** — kreator i solver nigdy na różnych
   modelach.
5. **Walidacja mocy TR:** ΣP falowników ≤ Sn·dopuszczalne obciążenie ORAZ
   kaskada prądowa I_TR ≤ Iz kabli ≤ In pola.
6. **Walidacja napięcia SN:** TR 0,69/20 kV przy polu 15 kV = „❌ TR nie
   odpowiada napięciu sieci"; pole 20 kV przy sieci 15 kV = odrzucone.
7. **Układ połączeń TR (Dyn5/Dyn11/YNyn…):** parametr modelu, nie informacja
   katalogowa — wpływa na model zwarciowy, przesunięcie faz, składową
   zerową, analizę zabezpieczeń.
8. **Impedancja TR:** uk%, Pcu, P0, I0 — wprost do SOLVERA. Zakaz dwóch
   modeli (rysunkowego i obliczeniowego).
9. **Jawny parametr „Sposób przyłączenia":** ○ DER za TR SN/nN stacji ·
   ○ DER z własnym TR blokowym · ○ DER bezpośrednio na SN · ○ DER przez
   rozdzielnię producenta. Od tej decyzji zależy schemat — zakaz zgadywania.
10. **Walidacja kabli:** po doborze TR/mocy/napięcia system dobiera przekrój/
    żyły/obciążalność/ΔU/zwarcie; „❌ przekrój niewystarczający" /
    „❌ przekroczony dopuszczalny ΔU".
11. **Walidacja pola SN:** zgodność z napięciem, prądem, mocą TR, zwarciem,
    wyposażeniem (zakaz: TR 2,5 MVA na polu 630 kVA).
12. **Wyniki automatycznie po kreatorze:** rozpływ, ΔU, prądy, straty,
    zwarcia, dobór zabezpieczeń, raport zgodności — bez ponownego budowania
    modelu.
13. **Raport zgodności** (checklista ✓/❌ z walidacji i biegu) po zakończeniu
    kreatora; przy błędzie krytycznym „Nie można wygenerować projektu."
14. **Łańcuch end-to-end bez etapów ręcznych:** kreator → dobór falowników →
    walidacja U_AC → dobór TR → walidacja mocy → dobór pola → przekładniki →
    zabezpieczenia → kable → model solvera → obliczenia → schemat → wyniki →
    raport PDF → lista materiałowa → eksport.

## PRIORYTETY P0 (właściciel)
1. Walidacja U_AC falownika ↔ strona nN TR blokowego (obowiązkowa).
2. Automatyczny dobór TR blokowego z parametrów falowników.
3. Integracja doboru falowników z TR/kablami/polem/zabezpieczeniami/solverem
   w JEDNYM modelu danych.
4. Walidacje: napięcie SN, moc TR, obciążalność pola i kabli.
5. Dane kreatora = jedyne źródło prawdy dla schematu/obliczeń/raportów/BOM.

## PROGRAM „DOBÓR-OZE" (fazy — zarządca Fable, wykonawcy Opus)
- **D1 (P0.1+P0.4):** twarde walidacje domenowe w `add_converter_source`/
  `der_topology` (U_AC↔nN TR z tolerancją katalogową; strona SN TR ↔
  napięcie szyny/pola; ΣP≤Sn·k; kaskada I_TR≤Iz kabla≤In pola; komunikaty ❌
  po polsku) + jawny parametr „sposób przyłączenia" (4 opcje — mapowanie na
  istniejący kontrakt) + walidacje w kreatorze na żywo.
- **D2 (P0.2+P0.3):** silniki DOBORU (WHITE BOX, warstwa solverów
  pomocniczych — wzorzec `shunt_compensator_preview`): propozycja TR
  blokowego z katalogu (ΣP·k_j + rezerwa, napięcia, uk, grupa), dobór kabla
  (katalogi MAGISTRALA MAX + ΔU z backendu), dobór pola (prądy/zwarcie);
  kreator pokazuje propozycję + ostrzeżenia przy odstępstwie.
- **D3 (7+8):** grupa połączeń + uk/Pcu/P0/I0 TR blokowego w modelu i
  KONSUMOWANE przez solvery (recon zakresu modelu SC dla grup połączeń —
  ograniczenia jawnie, zero fabrykacji).
- **D4 (12+13+BOM):** auto-bieg obliczeń po zapisie kreatora (istniejący
  mechanizm analysis-run, opt-in), RAPORT ZGODNOŚCI (checklista z walidacji
  + wyników; magazyn dokumentów F-E8.3 jako persystencja), LISTA
  MATERIAŁOWA z materializowanych elementów toru (domyka jawny dług BOM z
  V12K-094/096).
