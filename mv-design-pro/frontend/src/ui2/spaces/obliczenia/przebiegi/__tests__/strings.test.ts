import { describe, it, expect } from 'vitest';
import {
  etykietaAnalizy,
  etykietaStatusu,
  formatCzas,
  formatCzasTrwania,
  formatOdcisk,
  PRZEBIEGI_STRINGS as T,
} from '../strings';
import { ANALYSIS_TYPE_LABELS, RUN_STATUS_LABELS } from '../../../../../ui/study-cases/types';

describe('formatCzas — deterministyczny format znacznika ISO (zero Date.now)', () => {
  it('formatuje znacznik ISO na „RRRR-MM-DD GG:MM"', () => {
    expect(formatCzas('2026-07-15T14:32:00Z')).toBe('2026-07-15 14:32');
  });

  it('null → „—", wejście spoza wzorca bez zmian', () => {
    expect(formatCzas(null)).toBe(T.brakWartosci);
    expect(formatCzas('wczoraj')).toBe('wczoraj');
  });
});

describe('formatCzasTrwania — czas trwania z pól started/finished (karta §2)', () => {
  it('różnica poniżej minuty → sekundy', () => {
    expect(formatCzasTrwania('2026-07-15T14:32:00Z', '2026-07-15T14:32:45Z')).toBe('45 s');
  });

  it('różnica powyżej minuty → „X min YY s" (sekundy dopełnione zerem)', () => {
    expect(formatCzasTrwania('2026-07-15T14:32:00Z', '2026-07-15T14:34:05Z')).toBe('2 min 05 s');
  });

  it('brak started → „—"; brak finished (przebieg trwa) → „w toku"', () => {
    expect(formatCzasTrwania(null, null)).toBe(T.brakWartosci);
    expect(formatCzasTrwania('2026-07-15T14:32:00Z', null)).toBe(T.wToku);
  });

  it('znacznik spoza formatu → „—" (bez zgadywania)', () => {
    expect(formatCzasTrwania('nie-data', '2026-07-15T14:32:45Z')).toBe(T.brakWartosci);
  });

  it('deterministyczny: to samo wejście → identyczny wynik', () => {
    const a = formatCzasTrwania('2026-07-15T14:32:00Z', '2026-07-15T14:33:30Z');
    const b = formatCzasTrwania('2026-07-15T14:32:00Z', '2026-07-15T14:33:30Z');
    expect(a).toBe(b);
    expect(a).toBe('1 min 30 s');
  });
});

describe('formatOdcisk — skrócony odcisk SHA-256', () => {
  it('zwraca pierwsze 10 znaków skrótu', () => {
    expect(formatOdcisk('a1b2c3d4e5f607182930')).toBe('a1b2c3d4e5');
  });
});

describe('etykiety PL — import z istniejących słowników (karta §2, bez duplikacji)', () => {
  it('etykietaAnalizy zwraca wartość z ANALYSIS_TYPE_LABELS', () => {
    expect(etykietaAnalizy('SC_3F')).toBe(ANALYSIS_TYPE_LABELS.SC_3F);
    expect(etykietaAnalizy('LOAD_FLOW')).toBe(ANALYSIS_TYPE_LABELS.LOAD_FLOW);
  });

  it('etykietaStatusu zwraca wartość z RUN_STATUS_LABELS', () => {
    expect(etykietaStatusu('DONE')).toBe(RUN_STATUS_LABELS.DONE);
    expect(etykietaStatusu('FAILED')).toBe(RUN_STATUS_LABELS.FAILED);
  });
});
