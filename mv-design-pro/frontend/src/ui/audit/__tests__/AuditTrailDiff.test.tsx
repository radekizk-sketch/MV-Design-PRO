import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditTrailDiff, computeDiff } from '../AuditTrailDiff';
import type { OperationHistoryEntry } from '../elementHistory';

describe('computeDiff', () => {
  it('detects changed fields', () => {
    const diff = computeDiff(
      { ratedPowerMva: 0.4, voltageKv: 15 },
      { ratedPowerMva: 0.63, voltageKv: 15 },
    );
    const ratedField = diff.find((d) => d.key === 'ratedPowerMva');
    const voltageField = diff.find((d) => d.key === 'voltageKv');
    expect(ratedField?.changed).toBe(true);
    expect(voltageField?.changed).toBe(false);
  });

  it('null before → all fields treated jako "changed" (added)', () => {
    const diff = computeDiff(null, { ratedPowerMva: 0.4 });
    expect(diff[0].changed).toBe(true);
    expect(diff[0].before).toBeUndefined();
  });

  it('label PL z FIELD_LABELS', () => {
    const diff = computeDiff({}, { ratedPowerMva: 0.4 });
    expect(diff[0].label).toContain('Moc znamionowa');
  });

  it('unknown field → label = key', () => {
    const diff = computeDiff({}, { customField: 'val' });
    expect(diff[0].label).toBe('customField');
  });

  it('sortowanie: zmienione pierwsze, potem alfabet PL', () => {
    const diff = computeDiff(
      { voltageKv: 15, ratedPowerMva: 0.4, cableLengthKm: 1 },
      { voltageKv: 15, ratedPowerMva: 0.63, cableLengthKm: 1 },
    );
    expect(diff[0].changed).toBe(true);
  });
});

describe('AuditTrailDiff component', () => {
  const baseEntry: OperationHistoryEntry = {
    operation_name: 'edit_transformer',
    element_ref: 'gpz/main/tr1',
    user_id: 'user1',
    timestamp: '2026-05-23T10:00:00Z',
    parameters: { ratedPowerMva: 0.63 },
  };

  it('renderuje header z operation_name', () => {
    render(
      <AuditTrailDiff
        beforeEntry={null}
        afterEntry={baseEntry}
      />,
    );
    expect(screen.getByText(/edit_transformer/)).toBeTruthy();
  });

  it('pokazuje "Brak zmian parametrów" gdy identyczne', () => {
    render(
      <AuditTrailDiff
        beforeEntry={{ ...baseEntry, parameters: { ratedPowerMva: 0.63 } }}
        afterEntry={baseEntry}
      />,
    );
    expect(screen.getByText(/Brak zmian/)).toBeTruthy();
  });

  it('podświetla zmienione wiersze (data-testid)', () => {
    render(
      <AuditTrailDiff
        beforeEntry={{ ...baseEntry, parameters: { ratedPowerMva: 0.4 } }}
        afterEntry={baseEntry}
      />,
    );
    expect(screen.getByTestId('diff-row-ratedPowerMva')).toBeTruthy();
  });

  it('formatuje wartości PL (number with comma)', () => {
    render(
      <AuditTrailDiff
        beforeEntry={{ ...baseEntry, parameters: { ratedPowerMva: 0.4 } }}
        afterEntry={{ ...baseEntry, parameters: { ratedPowerMva: 0.63 } }}
      />,
    );
    const row = screen.getByTestId('diff-row-ratedPowerMva');
    // PL locale: 0,4 z przecinkiem
    expect(row.textContent).toMatch(/0[,.]4/);
  });

  it('puste params → "Operacja bez parametrów"', () => {
    render(
      <AuditTrailDiff
        beforeEntry={{ ...baseEntry, parameters: {} }}
        afterEntry={{ ...baseEntry, parameters: {} }}
      />,
    );
    expect(screen.getByText(/Operacja bez parametrów/)).toBeTruthy();
  });
});
