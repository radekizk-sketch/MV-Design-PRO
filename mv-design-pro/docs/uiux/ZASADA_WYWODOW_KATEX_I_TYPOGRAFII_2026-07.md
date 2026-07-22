# ZASADA WYWODÓW (KaTeX) I TYPOGRAFII — WIĄŻĄCA (dyrektywa właściciela 2026-07-22)

Status: **BINDING** (na równi z FLOW_PROJEKTANTA i ZASADY_WIAZANIA_KREATOROW).
Źródło: dyrektywa właściciela 2026-07-22 — „wzory renderowane KaTeX zapisz jako
zasadę; do zwarć też dodaj ślad obliczeń i wszystkich innych obliczeń — to jest
główny atut systemu i musi być używalny wszędzie, gdzie się da; nie przeładować
ekranu, obliczenia dostępne na żądanie/klik; usystematyzuj rodzaj czcionek".

## §1. Zasada KaTeX (wzory matematyczne)

1. **Każdy wzór matematyczny w UI renderuje się przez KaTeX** — komponenty
   `MathBlock`/`MathInline` z `ui/proof/MathRenderer` (fail-safe: przy błędzie
   parsowania fallback do `<code>`; flaga `ENABLE_MATH_RENDERING`).
2. **ZAKAZANE**: surowy LaTeX w `<code>`, wzory ASCII („odchylenie = |U-U_n|/U_n"),
   pseudo-matematyka w tekście UI. Wzór bez LaTeX-a w kontrakcie danych →
   uzupełnij dostawcę (backend), nie renderuj surowca.
3. **Kontrakt kroku wywodu** (kanoniczny, addytywny): `{tekst: string,
   latex: string | null}` — `tekst` zawsze (ASCII-PL, deterministyczny format),
   `latex` dla kroków ze wzorem/podstawieniem. Wzorzec: models/builder
   `energy_validation` (R3-D) i `wywod` endpointu wkładów SC3F.
4. **Zero fizyki w UI bez zmian**: LaTeX z liczbami podstawionymi buduje
   WYŁĄCZNIE backend (solver/analiza/serializer API) z wartości już policzonych.
   Frontend nie skleja podstawień z liczb.
5. **Wywód PEŁNY — standard pracy dyplomowej (dyrektywa 2026-07-22 II):**
   dla KAŻDEJ wielkości liczbowej wywód ma trzy ogniwa w LaTeX:
   wzór ogólny w symbolach → podstawienie liczbowe (wartości z tego biegu)
   → wynik z jednostką. Skróty typu „I_b = μ·q·I″k = wynik" bez wywodu
   składników (skąd μ? skąd I″k?) są NIEWYSTARCZAJĄCE. Wywód wielkości
   pośrednich buduje ta warstwa, która je liczy (solver — WHITE BOX rule;
   analiza — builder). Wzorce kanoniczne: `wywod_maszyny`
   (machine_sc_iec60909.py) i `_white_box_progowe` (energy_validation).

## §2. Zasada śladu obliczeń na żądanie

1. **Każdy ekran wynikowy** (zwarcia, rozpływ, walidacja, migotanie, arc flash,
   kompensacja, studium, OLTC, porównanie, zgodność...) **udostępnia ślad
   obliczeń (WHITE BOX)** dla prezentowanych liczb — to główny atut systemu.
2. **Na żądanie, nie na ekranie**: domyślnie zwinięty przycisk „Pokaż ślad
   obliczeń"; rozwinięcie nie może przeładować ekranu (lista przy pozycji,
   nie modal). Wspólny komponent: `ui2/wyniki/wzorzec/SladWywodu.tsx`.
3. **Dwie drogi do wywodu** (obie legalne, wybór wg natury liczby):
   - liczba z przebiegu solvera → `dowodRef` (2×klik) → zakładka „Dowód obliczeń";
   - liczba z buildera analizy → ślad `{tekst, latex}` przy pozycji (reguła K3:
     ref do śladu innego artefaktu niż źródło liczby jest ZAKAZANY).
4. **Brak danych wywodu = uczciwy brak przycisku** (komponent nie renderuje się
   przy pustej liście). Fabrykowanie kroków w UI zakazane.

## §3. Zasada typografii (systematyka czcionek)

1. **Dokładnie dwa kroje UI + matematyka**:
   - `var(--mvd-font-sans)` — cały tekst interfejsu (etykiety, nagłówki, opisy);
   - `var(--mvd-font-mono)` — WYŁĄCZNIE wartości liczbowe, identyfikatory
     techniczne i kroki tekstowe śladu (klasa `.mvd-num`);
   - font matematyczny KaTeX — WYŁĄCZNIE wzory (`MathBlock`/`MathInline`).
2. **ZAKAZ literałów `font-family` poza `theme/tokens.css`** — wyłącznie tokeny
   `--mvd-font-sans` / `--mvd-font-mono`. Trzeci krój na ekranie = defekt.
3. Liczby w tabelach: `.mvd-num` + `font-variant-numeric: tabular-nums`
   (wyrównanie kolumn liczbowych).

## §4. Stan wdrożenia (2026-07-22) i rollout

| Ekran / moduł | Ślad na żądanie | KaTeX | Status |
|---|---|---|---|
| Walidacja energetyczna | TAK (per pozycja) | TAK | GOTOWE (R2-A + R3-D) |
| Zwarcia — wkłady źródeł | TAK (`wywod` endpointu) | TAK | GOTOWE (ta karta) |
| Migotanie (Pst/Plt) | TAK | TAK | GOTOWE (ta karta) |
| Arc Flash (IEEE 1584) | TAK | TAK | GOTOWE (ta karta) |
| Rozpływ (szyny/gałęzie) | dowodRef → Dowód | n/d (dowód) | GOTOWE (K3) |
| Porównanie A/B | dowodRef A/B → Dowód | n/d (dowód) | GOTOWE (R3-C) |
| Kreatory — panele teorii | n/d | rollout | KARTA T-A (wykonawca) |
| Kompensacja / odbiór nN / studium / OLTC | audyt | audyt | KARTA T-B (wykonawca) |
| Typografia ui2 (tokeny sans/mono) | n/d | n/d | GOTOWE (tokeny + shell/inspector/search); sweep reszty = KARTA T-B |

Braki wykryte w rolloutach → wpis GAP w karcie + uzupełnienie dostawcy
(nigdy fabrykacja, nigdy „na później" bez wpisu).
