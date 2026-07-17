/*
 * Testy grupy „Zgodność referencyjna" (REF-A, HANDOFF pkt 2.2). Kody
 * `reference.bays.*` z walidatora ENM (HANDOFF §1.2) grupowane jako ODRĘBNY cel
 * i renderowane w tym samym panelu gotowości: klik → selekcja element_refs[0],
 * akcja naprawcza → istniejący `onAkcjaNaprawcza` (BayModal). ZERO własnych
 * reguł walidacyjnych — konsumujemy wyłącznie wynik walidatora.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { celDlaKodu, grupujProblemyWgCelu, ETYKIETA_CELU } from '../grupowanieCelow';
import { PanelGotowosci } from '../PanelGotowosci';
import { GOTOWOSC_STRINGS } from '../strings';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useAppStateStore } from '../../../../ui/app-state/store';
import { readinessIssue } from './fixtures';
import type { EnergyNetworkModel, ReadinessInfo } from '../../../../types/enm';
import type { FixAction as EnmFixAction } from '../../../../types/enm';

const KODY_REFERENCJI = [
  'reference.bays.missing_required_apparatus',
  'reference.bays.missing_switching_function',
  'reference.bays.forbidden_apparatus',
  'reference.bays.apparatus_order_mismatch',
  'reference.bays.earth_switch_in_main_path',
  'reference.bays.family_mismatch',
] as const;

describe('celDlaKodu — kody Reference Engine (HANDOFF §1.2)', () => {
  it('wszystkie 6 kodów reference.bays.* -> zgodnoscReferencyjna', () => {
    for (const kod of KODY_REFERENCJI) {
      expect(celDlaKodu(kod)).toBe('zgodnoscReferencyjna');
    }
  });

  it('nowy kod rodziny reference.* -> zgodnoscReferencyjna (fallback prefiksu)', () => {
    expect(celDlaKodu('reference.stations.new_rule')).toBe('zgodnoscReferencyjna');
  });

  it('nie koliduje z innymi celami (regresja: protection nadal zabezpieczenia)', () => {
    expect(celDlaKodu('protection.ct_required')).toBe('zabezpieczenia');
    expect(celDlaKodu('station.voltage_missing')).toBe('stacje');
  });
});

describe('grupujProblemyWgCelu — grupa Zgodność referencyjna', () => {
  it('tworzy odrębną grupę zgodnoscReferencyjna z etykietą PL', () => {
    const grupy = grupujProblemyWgCelu([
      readinessIssue({
        code: 'reference.bays.forbidden_apparatus',
        severity: 'IMPORTANT',
        element_ref: 'POLE-3',
        element_refs: ['POLE-3'],
        message_pl: 'Aparat niedozwolony w polu liniowym.',
      }),
    ]);
    const grupa = grupy.find((g) => g.cel === 'zgodnoscReferencyjna');
    expect(grupa).toBeDefined();
    expect(grupa!.problemy).toHaveLength(1);
    expect(grupa!.ostrzezenia).toBe(1);
    expect(ETYKIETA_CELU.zgodnoscReferencyjna).toBe('Zgodność referencyjna');
  });

  it('nie miesza problemów referencyjnych z innymi celami', () => {
    const grupy = grupujProblemyWgCelu([
      readinessIssue({ code: 'reference.bays.family_mismatch', severity: 'IMPORTANT', element_ref: 'POLE-1' }),
      readinessIssue({ code: 'station.voltage_missing', severity: 'BLOCKER', element_ref: 'ST-1' }),
    ]);
    expect(grupy.find((g) => g.cel === 'zgodnoscReferencyjna')!.problemy).toHaveLength(1);
    expect(grupy.find((g) => g.cel === 'stacje')!.problemy).toHaveLength(1);
  });
});

// --- Integracja z panelem gotowości -----------------------------------------

function snapshotFixture(): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      revision: 1,
      hash_sha256: 'hash-1',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
  } as unknown as EnergyNetworkModel;
}

function readinessZReferencja(): ReadinessInfo {
  return {
    ready: false,
    blockers: [],
    warnings: [
      {
        code: 'reference.bays.missing_required_apparatus',
        message_pl: 'Pole liniowe wymaga rozłącznika i uziemnika.',
        element_ref: 'POLE-3',
        severity: 'OSTRZEZENIE',
      },
    ],
  } as unknown as ReadinessInfo;
}

function fixActionBay(): EnmFixAction {
  return {
    code: 'reference.bays.missing_required_apparatus',
    action_type: 'OPEN_MODAL',
    element_ref: 'POLE-3',
    modal_type: 'BayModal',
    panel: 'wizard',
    step: null,
    focus: 'POLE-3',
    message_pl: 'Uzupełnij skład aparatów pola.',
  } as unknown as EnmFixAction;
}

function props(over: Partial<Parameters<typeof PanelGotowosci>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onSelekcja: vi.fn(),
    onAkcjaNaprawcza: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  // Brak aktywnego przypadku → sekcja oceny nie woła API (izolacja testu grupy).
  useAppStateStore.setState({ activeCaseId: null });
  useSnapshotStore.setState({
    snapshot: snapshotFixture(),
    readiness: readinessZReferencja(),
    fixActions: [fixActionBay()],
    loading: false,
    error: null,
  });
});

describe('PanelGotowosci — ostrzeżenia referencyjne na żywo', () => {
  it('renderuje grupę „Zgodność referencyjna" z problemem walidatora', () => {
    render(<PanelGotowosci {...props()} />);
    const sekcja = screen.getByTestId('mvd-cel-zgodnoscReferencyjna');
    expect(within(sekcja).getByText(GOTOWOSC_STRINGS.celZgodnoscReferencyjna)).toBeInTheDocument();
    expect(within(sekcja).getByText('Pole liniowe wymaga rozłącznika i uziemnika.')).toBeInTheDocument();
  });

  it('klik wiersza → selekcja element_refs[0]', () => {
    const p = props();
    render(<PanelGotowosci {...p} />);
    const wiersz = screen.getByTestId('mvd-problem-reference.bays.missing_required_apparatus-POLE-3');
    fireEvent.click(within(wiersz).getByRole('button', { name: /Pole liniowe/ }));
    expect(p.onSelekcja).toHaveBeenCalledWith('POLE-3');
  });

  it('akcja naprawcza → onAkcjaNaprawcza z problemem (BayModal fix_action)', () => {
    const p = props();
    render(<PanelGotowosci {...p} />);
    fireEvent.click(screen.getByRole('button', { name: GOTOWOSC_STRINGS.napraw }));
    expect(p.onAkcjaNaprawcza).toHaveBeenCalledTimes(1);
    const problem = p.onAkcjaNaprawcza.mock.calls[0][0];
    expect(problem.code).toBe('reference.bays.missing_required_apparatus');
    expect(problem.cel).toBe('zgodnoscReferencyjna');
    expect(problem.fixAction?.modal_type).toBe('BayModal');
  });
});
