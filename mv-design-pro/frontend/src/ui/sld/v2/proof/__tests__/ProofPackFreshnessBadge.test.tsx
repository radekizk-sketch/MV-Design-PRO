import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProofPackFreshnessBadge } from '../ProofPackFreshnessBadge';

describe('ProofPackFreshnessBadge', () => {
  it('pokazuje "Nie wygenerowano" gdy brak generatedAt', () => {
    render(
      <ProofPackFreshnessBadge
        generatedAt={null}
        snapshotFingerprint={null}
        currentSnapshotFingerprint={null}
      />,
    );
    expect(screen.getByTestId('proof-freshness-not-generated')).toBeTruthy();
    expect(screen.getByText('Nie wygenerowano')).toBeTruthy();
  });

  it('pokazuje "Świeży" gdy fingerprinty się zgadzają', () => {
    render(
      <ProofPackFreshnessBadge
        generatedAt="2026-05-23T10:00:00Z"
        snapshotFingerprint="abc123"
        currentSnapshotFingerprint="abc123"
      />,
    );
    expect(screen.getByTestId('proof-freshness-fresh')).toBeTruthy();
    expect(screen.getByText('Świeży')).toBeTruthy();
  });

  it('pokazuje "Przeterminowany" gdy fingerprinty się różnią', () => {
    render(
      <ProofPackFreshnessBadge
        generatedAt="2026-05-23T10:00:00Z"
        snapshotFingerprint="abc123"
        currentSnapshotFingerprint="xyz789"
      />,
    );
    expect(screen.getByTestId('proof-freshness-stale')).toBeTruthy();
    expect(screen.getByText('Przeterminowany')).toBeTruthy();
  });

  it('Świeży gdy current snapshot jest null (nie ma na czym porównać)', () => {
    render(
      <ProofPackFreshnessBadge
        generatedAt="2026-05-23T10:00:00Z"
        snapshotFingerprint="abc123"
        currentSnapshotFingerprint={null}
      />,
    );
    expect(screen.getByTestId('proof-freshness-fresh')).toBeTruthy();
  });

  it('title atrybut zawiera datę wygenerowania', () => {
    render(
      <ProofPackFreshnessBadge
        generatedAt="2026-05-23T10:00:00Z"
        snapshotFingerprint="abc"
        currentSnapshotFingerprint="abc"
      />,
    );
    const badge = screen.getByTestId('proof-freshness-fresh');
    expect(badge.getAttribute('title')).toContain('Wygenerowane');
  });
});
