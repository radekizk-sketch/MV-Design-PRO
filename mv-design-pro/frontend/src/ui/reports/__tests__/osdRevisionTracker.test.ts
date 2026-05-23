import { describe, expect, it } from 'vitest';
import {
  createEmptyRevisionList,
  addRevision,
  nextRevisionNumber,
  updateRevision,
  getCurrentRevision,
  describeStatus,
  validateRevisionList,
  formatRevisionTable,
  type Revision,
} from '../osdRevisionTracker';

const sampleRev: Omit<Revision, 'number'> = {
  date: '2026-05-23',
  author: 'Jan Kowalski',
  description: 'Wersja początkowa',
  status: 'DRAFT',
};

describe('createEmptyRevisionList', () => {
  it('zwraca pustą listę', () => {
    const l = createEmptyRevisionList();
    expect(l.revisions).toHaveLength(0);
  });
});

describe('addRevision', () => {
  it('pierwsza rewizja = R0', () => {
    let l = createEmptyRevisionList();
    l = addRevision(l, sampleRev);
    expect(l.revisions[0].number).toBe('R0');
  });

  it('kolejne rewizje = R1, R2, ...', () => {
    let l = createEmptyRevisionList();
    l = addRevision(l, sampleRev);
    l = addRevision(l, { ...sampleRev, description: 'Korekta po audycie' });
    l = addRevision(l, { ...sampleRev, description: 'Wersja finalna' });
    expect(l.revisions.map((r) => r.number)).toEqual(['R0', 'R1', 'R2']);
  });
});

describe('nextRevisionNumber', () => {
  it('R0 dla pustej listy', () => {
    expect(nextRevisionNumber(createEmptyRevisionList())).toBe('R0');
  });

  it('R(n+1) dla n elementów', () => {
    let l = createEmptyRevisionList();
    l = addRevision(l, sampleRev);
    l = addRevision(l, sampleRev);
    expect(nextRevisionNumber(l)).toBe('R2');
  });
});

describe('updateRevision', () => {
  it('aktualizuje pole bez zmiany numeru', () => {
    let l = createEmptyRevisionList();
    l = addRevision(l, sampleRev);
    l = updateRevision(l, 'R0', { status: 'RELEASED', approvedBy: 'Anna Nowak' });
    expect(l.revisions[0].status).toBe('RELEASED');
    expect(l.revisions[0].approvedBy).toBe('Anna Nowak');
    expect(l.revisions[0].number).toBe('R0');
  });
});

describe('getCurrentRevision', () => {
  it('zwraca ostatnią rewizję', () => {
    let l = createEmptyRevisionList();
    l = addRevision(l, { ...sampleRev, description: 'first' });
    l = addRevision(l, { ...sampleRev, description: 'second' });
    expect(getCurrentRevision(l)?.description).toBe('second');
  });

  it('null gdy pusta', () => {
    expect(getCurrentRevision(createEmptyRevisionList())).toBe(null);
  });
});

describe('describeStatus', () => {
  it('zwraca PL labels', () => {
    expect(describeStatus('DRAFT')).toBe('Wersja robocza');
    expect(describeStatus('AUDIT')).toBe('Wersja do audytu');
    expect(describeStatus('RELEASED')).toBe('Wersja wydana');
  });
});

describe('validateRevisionList', () => {
  it('pusta lista → invalid', () => {
    const r = validateRevisionList(createEmptyRevisionList());
    expect(r.isValid).toBe(false);
    expect(r.issues[0]).toContain('pusta');
  });

  it('valid gdy minimum R0 z autorem i opisem', () => {
    let l = createEmptyRevisionList();
    l = addRevision(l, sampleRev);
    const r = validateRevisionList(l);
    expect(r.isValid).toBe(true);
  });

  it('RELEASED bez approvedBy → invalid', () => {
    let l = createEmptyRevisionList();
    l = addRevision(l, { ...sampleRev, status: 'RELEASED' });
    const r = validateRevisionList(l);
    expect(r.isValid).toBe(false);
    expect(r.issues.some((i) => i.includes('approvedBy'))).toBe(true);
  });

  it('brak autora/opisu → invalid', () => {
    let l = createEmptyRevisionList();
    l = addRevision(l, { ...sampleRev, author: '', description: '' });
    const r = validateRevisionList(l);
    expect(r.isValid).toBe(false);
    expect(r.issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe('formatRevisionTable', () => {
  it('zwraca markdown table', () => {
    let l = createEmptyRevisionList();
    l = addRevision(l, sampleRev);
    const table = formatRevisionTable(l);
    expect(table).toContain('| Nr |');
    expect(table).toContain('R0');
    expect(table).toContain('Wersja robocza');
  });

  it('"Brak rewizji" gdy pusta', () => {
    expect(formatRevisionTable(createEmptyRevisionList())).toBe('Brak rewizji.');
  });
});
