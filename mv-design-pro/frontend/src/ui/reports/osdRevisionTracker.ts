/**
 * osdRevisionTracker — tabela rewizji wniosku OSD (Etap 13 z planu).
 *
 * "Revision table editor: dodawanie kolejnych rewizji (R0, R1, R2...)"
 *
 * Wymagany w wniosku OSD — każda zmiana po wysłaniu jest oddzielną rewizją.
 */

export type RevisionStatus = 'DRAFT' | 'AUDIT' | 'RELEASED';

export interface Revision {
  number: string;
  date: string;
  author: string;
  description: string;
  status: RevisionStatus;
  approvedBy?: string;
}

export interface RevisionList {
  revisions: Revision[];
}

const STATUS_LABELS: Record<RevisionStatus, string> = {
  DRAFT: 'Wersja robocza',
  AUDIT: 'Wersja do audytu',
  RELEASED: 'Wersja wydana',
};

export function createEmptyRevisionList(): RevisionList {
  return { revisions: [] };
}

export function addRevision(
  list: RevisionList,
  revision: Omit<Revision, 'number'>,
): RevisionList {
  const number = nextRevisionNumber(list);
  return {
    revisions: [...list.revisions, { ...revision, number }],
  };
}

export function nextRevisionNumber(list: RevisionList): string {
  if (list.revisions.length === 0) return 'R0';
  const last = list.revisions[list.revisions.length - 1].number;
  const match = last.match(/^R(\d+)$/);
  if (match) {
    return `R${parseInt(match[1], 10) + 1}`;
  }
  return `R${list.revisions.length}`;
}

export function updateRevision(
  list: RevisionList,
  number: string,
  patch: Partial<Revision>,
): RevisionList {
  return {
    revisions: list.revisions.map((r) =>
      r.number === number ? { ...r, ...patch, number } : r,
    ),
  };
}

export function getCurrentRevision(list: RevisionList): Revision | null {
  return list.revisions[list.revisions.length - 1] ?? null;
}

export function describeStatus(status: RevisionStatus): string {
  return STATUS_LABELS[status];
}

export function validateRevisionList(list: RevisionList): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (list.revisions.length === 0) {
    issues.push('Lista rewizji pusta — wymagana co najmniej R0 (wersja początkowa).');
    return { isValid: false, issues };
  }
  // Numery muszą być sekwencyjne
  for (let i = 0; i < list.revisions.length; i++) {
    const expected = `R${i}`;
    if (list.revisions[i].number !== expected) {
      issues.push(`Rewizja na pozycji ${i} ma numer ${list.revisions[i].number}, oczekiwany ${expected}.`);
    }
    if (!list.revisions[i].author.trim()) {
      issues.push(`Rewizja ${list.revisions[i].number} bez autora.`);
    }
    if (!list.revisions[i].description.trim()) {
      issues.push(`Rewizja ${list.revisions[i].number} bez opisu zmian.`);
    }
  }
  // RELEASED rewizja musi mieć approvedBy
  for (const rev of list.revisions) {
    if (rev.status === 'RELEASED' && !rev.approvedBy?.trim()) {
      issues.push(`Rewizja ${rev.number} status=RELEASED bez approvedBy (zatwierdzającego).`);
    }
  }
  return { isValid: issues.length === 0, issues };
}

export function formatRevisionTable(list: RevisionList): string {
  if (list.revisions.length === 0) return 'Brak rewizji.';
  const header = '| Nr | Data | Autor | Opis | Status |';
  const sep = '|----|------|-------|------|--------|';
  const rows = list.revisions.map(
    (r) => `| ${r.number} | ${r.date} | ${r.author} | ${r.description} | ${STATUS_LABELS[r.status]} |`,
  );
  return [header, sep, ...rows].join('\n');
}
