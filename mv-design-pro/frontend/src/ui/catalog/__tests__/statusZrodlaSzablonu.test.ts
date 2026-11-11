/**
 * Jedno źródło prawdy statusu źródła szablonu pola (`STATUS_ZRODLA` w `BayTemplatePicker.tsx`):
 * nazwa szczegółowa (inspektor), grupa (kreatory, podgląd rozdzielnicy) i kompletność pakietu
 * (`isCompleteSourceStatus`) wynikają z JEDNEGO wpisu. Test idzie po CAŁEJ unii kontraktu
 * (rejestr zamknięty — `satisfies` każe dopisać nowy status tutaj) i przypina teksty widoczne
 * dla projektanta — scalenie dwóch słowników nie zmienia żadnego napisu na ekranie.
 */
import { describe, expect, it } from 'vitest';
import {
  etykietaStatusuZrodlaSzablonuPl,
  grupaZrodlaSzablonu,
  grupaZrodlaSzablonuPl,
  NAZWA_GRUPY_ZRODLA_PL,
  type BayTemplateSourceStatus,
  type GrupaZrodlaSzablonu,
} from '../BayTemplatePicker';
import { isCompleteSourceStatus } from '../../network-build/forms/InsertStationFormHelpers';

const OCZEKIWANE = {
  official_catalog: ['Oficjalny katalog producenta', 'pakiet katalogowy', true],
  repo_verified: ['Zweryfikowany w repozytorium', 'pakiet katalogowy', true],
  user_defined: ['Definicja użytkownika', 'pakiet użytkownika', true],
  canonical_fallback: [
    'Szablon kanoniczny ogólny (rozwiązanie zapasowe)',
    'poza konfiguracją projektową',
    false,
  ],
  requires_catalog: ['Wymaga uzupełnienia katalogu', 'poza konfiguracją projektową', false],
  incomplete_requires_review: [
    'Niekompletny — wymaga przeglądu',
    'poza konfiguracją projektową',
    false,
  ],
} as const satisfies Record<BayTemplateSourceStatus, readonly [string, string, boolean]>;

const STATUSY = Object.keys(OCZEKIWANE) as BayTemplateSourceStatus[];

describe('status źródła szablonu pola — jedno źródło prawdy', () => {
  it.each(STATUSY)('%s: nazwa szczegółowa × grupa × kompletność z jednego wpisu', (status) => {
    const [etykieta, grupaPl, kompletny] = OCZEKIWANE[status];
    expect(etykietaStatusuZrodlaSzablonuPl(status)).toBe(etykieta);
    const grupa = grupaZrodlaSzablonu(status) as GrupaZrodlaSzablonu;
    expect(grupa).not.toBeNull();
    expect(NAZWA_GRUPY_ZRODLA_PL[grupa]).toBe(grupaPl);
    expect(grupaZrodlaSzablonuPl(status)).toBe(grupaPl);
    expect(isCompleteSourceStatus(status)).toBe(kompletny);
    expect(isCompleteSourceStatus(status)).toBe(grupa !== 'POZA_KONFIGURACJA');
  });

  it('każda grupa ma co najmniej jeden status (słownik grup bez martwych wpisów)', () => {
    const uzyte = new Set(STATUSY.map((s) => grupaZrodlaSzablonu(s)));
    expect([...uzyte].sort()).toEqual(Object.keys(NAZWA_GRUPY_ZRODLA_PL).sort());
  });

  it.each(['catalog_solution', 'toString', 'constructor', ''])(
    '%s spoza unii — opis jawny, bez grupy, bez kompletności',
    (status) => {
      expect(grupaZrodlaSzablonu(status)).toBeNull();
      expect(grupaZrodlaSzablonuPl(status)).toBe('status źródła spoza słownika aplikacji');
      expect(etykietaStatusuZrodlaSzablonuPl(status as BayTemplateSourceStatus)).toBe(
        'Nieznany status źródła',
      );
      expect(isCompleteSourceStatus(status as BayTemplateSourceStatus)).toBe(false);
    },
  );
});
