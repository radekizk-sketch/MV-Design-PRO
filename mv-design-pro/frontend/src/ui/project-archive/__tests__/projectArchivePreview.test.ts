import { describe, expect, it } from 'vitest';
import {
  validateArchive,
  summarizeArchiveContent,
  formatBytes,
  type ArchiveContent,
} from '../projectArchivePreview';

const validArchive: ArchiveContent = {
  archiveVersion: '1.2',
  createdAt: '2026-05-23T10:00:00Z',
  fingerprintSha256: 'a'.repeat(64),
  project: {
    name: 'GPZ Test',
    investor: 'PSE',
    phase: 'PB',
  },
  enmModel: {
    elementsCount: 25,
    snapshotHash: 'b'.repeat(64),
  },
  cases: [
    { id: 'c1', name: 'Wariant bazowy', type: 'power_flow', hasResults: true },
  ],
  materializedParams: 10,
  resultsBlob: {
    powerFlowRuns: 3,
    shortCircuitRuns: 1,
    totalSizeBytes: 500 * 1024,
  },
};

describe('validateArchive', () => {
  it('valid archive passes', () => {
    const r = validateArchive(validArchive);
    expect(r.isValid).toBe(true);
    expect(r.isCompatible).toBe(true);
  });

  it('niepoprawny fingerprint → invalid', () => {
    const r = validateArchive({ ...validArchive, fingerprintSha256: 'not-a-hash' });
    expect(r.isValid).toBe(false);
    expect(r.issues[0]).toContain('SHA-256');
  });

  it('starsza wersja → invalid', () => {
    const r = validateArchive({ ...validArchive, archiveVersion: '0.9' });
    expect(r.isValid).toBe(false);
    expect(r.issues[0]).toContain('starsza');
  });

  it('nowsza wersja → valid ale warning', () => {
    const r = validateArchive({ ...validArchive, archiveVersion: '2.0' });
    expect(r.isValid).toBe(true);
    expect(r.isCompatible).toBe(false);
    expect(r.warnings[0]).toContain('nowsza');
  });

  it('brak nazwy projektu → invalid', () => {
    const r = validateArchive({
      ...validArchive,
      project: { ...validArchive.project, name: '   ' },
    });
    expect(r.isValid).toBe(false);
    expect(r.issues[0]).toContain('Brak nazwy');
  });

  it('pusty ENM → warning', () => {
    const r = validateArchive({
      ...validArchive,
      enmModel: { ...validArchive.enmModel, elementsCount: 0 },
    });
    expect(r.isValid).toBe(true);
    expect(r.warnings.some((w) => w.includes('pusty'))).toBe(true);
  });

  it('duża liczba przebiegów → warning', () => {
    const r = validateArchive({
      ...validArchive,
      resultsBlob: {
        powerFlowRuns: 80,
        shortCircuitRuns: 30,
        totalSizeBytes: 100 * 1024 * 1024,
      },
    });
    expect(r.warnings.some((w) => w.includes('przebiegów'))).toBe(true);
  });
});

describe('summarizeArchiveContent', () => {
  it('zwraca string z kluczowymi danymi', () => {
    const summary = summarizeArchiveContent(validArchive);
    expect(summary).toContain('GPZ Test');
    expect(summary).toContain('PSE');
    expect(summary).toContain('Elementów ENM: 25');
    expect(summary).toContain("Case'y: 1");
  });
});

describe('formatBytes', () => {
  it('B → KB → MB → GB', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(1500 * 1024)).toBe('1.5 MB');
    expect(formatBytes(1500 * 1024 * 1024)).toBe('1.46 GB');
  });
});
