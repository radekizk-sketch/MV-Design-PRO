# False zero and missing data guard audit

Status: release-gate evidence, 2026-05-07.

## Cel

Potwierdzic, ze aktywny frontend nie renderuje braku danych, braku wyniku ani braku obliczen jako `0.00`.

## Reguły

- `null`, `undefined`, `NaN`, brak obiektu i brak wyniku musza byc widoczne jako `—`, `brak danych`, `nie wyznaczono`, `wynik częściowy` albo `zablokowane`.
- `0.00` jest dopuszczalne tylko jako rzeczywisty wynik liczbowy albo kontrolowana metryka liczbowa.
- UI wynikowy nie moze stosowac wzorcow `value || 0` ani `Number(value ?? 0)` do brakow danych.

## Naprawione obszary w tej fazie

- Sekcja audit2 rozpływu mocy w `WorkspaceSurfaceRouter.tsx` nie opisuje juz brakujacej wersji modelu jako technicznego `snapshotu`; pokazuje "Brak aktywnej wersji modelu".
- Komunikaty bledu audit2 sa po polsku i nie uzywaja aktywnych terminow zakazanych.
- Test `ProofSurfaceAudit2PowerFlow.test.tsx` pilnuje polskich etykiet i liczbowych wynikow z jednostkami.

## Walidacja

| Komenda | Wynik | Zakres |
| --- | --- | --- |
| `npm run guard:grep-zero` | PASS | grep-zero guard V12.5 |
| `npm test -- src/ui/__tests__/no-zero-spam.test.ts` | PASS w `test:ci` | SLD, panele, wyniki, raporty i stany braku danych |
| `npm run test:ci` | PASS | 249 plikow, 3078 testow passed, 1 skipped |
| `npm run guard:ui-terminology` | PASS | brak powrotu zakazanych terminow po naprawach |

## Dowód

Ostatni pełny frontend test suite:

```bash
cd mv-design-pro/frontend
npm run test:ci
```

Wynik: `249 passed`, `3078 passed`, `1 skipped`.

Ostatni grep guard:

```bash
cd mv-design-pro/frontend
npm run guard:grep-zero
```

Wynik: `V12.5 grep-zero guard passed`.

## Pozostałe luki

Brak krytycznych luk dla aktywnej sciezki i CI. Pełny manualny przeglad wszystkich historycznych ekranow spoza aktywnego shell-a pozostaje poza zakresem tej fazy, bo martwy legacy SLD zostal usuniety z produkcyjnego type-checku przez usuniecie plikow, nie przez maskowanie.
