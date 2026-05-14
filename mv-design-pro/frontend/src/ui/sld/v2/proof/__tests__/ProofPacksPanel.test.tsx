/**
 * ProofPacksPanel tests — 8 canonical proof packs visibility.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CANONICAL_PROOF_PACKS, ProofPacksPanel } from '../ProofPacksPanel';

describe('ProofPacksPanel — render', () => {
  it('renders 8 canonical proof packs', () => {
    expect(CANONICAL_PROOF_PACKS).toHaveLength(8);
  });

  it('renders header "Dowody inżynierskie (8)"', () => {
    render(<ProofPacksPanel hasNetworkModel={false} />);
    expect(screen.getByText(/Dowody inżynierskie \(8\)/)).toBeInTheDocument();
  });

  it('renders all 8 packs as buttons', () => {
    render(<ProofPacksPanel hasNetworkModel={true} />);
    for (const pack of CANONICAL_PROOF_PACKS) {
      expect(screen.getByTestId(`sld-proof-pack-${pack.id}`)).toBeInTheDocument();
    }
  });

  it('packs contain expected V12 canonical IDs', () => {
    const ids = CANONICAL_PROOF_PACKS.map((p) => p.id);
    expect(ids).toEqual([
      'sc_3f',
      'vdrop',
      'equipment',
      'power_flow',
      'losses',
      'protection',
      'earthing',
      'lf_voltage',
    ]);
  });
});

describe('ProofPacksPanel — status states', () => {
  it('all packs blocked when no network model', () => {
    render(<ProofPacksPanel hasNetworkModel={false} />);
    for (const pack of CANONICAL_PROOF_PACKS) {
      const btn = screen.getByTestId(`sld-proof-pack-${pack.id}`);
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', 'Wymaga modelu sieci (dodaj GPZ)');
    }
  });

  it('packs require calculation when model present', () => {
    render(<ProofPacksPanel hasNetworkModel={true} />);
    const btn = screen.getByTestId('sld-proof-pack-sc_3f');
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toContain('wymaga');
  });
});

describe('ProofPacksPanel — interactions', () => {
  it('onSelectPack called with id when clicked (model present)', () => {
    const onSelect = vi.fn();
    render(<ProofPacksPanel hasNetworkModel={true} onSelectPack={onSelect} />);
    fireEvent.click(screen.getByTestId('sld-proof-pack-vdrop'));
    expect(onSelect).toHaveBeenCalledWith('vdrop');
  });

  it('onSelectPack NOT called when blocked', () => {
    const onSelect = vi.fn();
    render(<ProofPacksPanel hasNetworkModel={false} onSelectPack={onSelect} />);
    fireEvent.click(screen.getByTestId('sld-proof-pack-vdrop'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('ProofPacksPanel — Polish labels', () => {
  it('all packs have Polish labelPl', () => {
    for (const pack of CANONICAL_PROOF_PACKS) {
      expect(pack.labelPl).toBeTruthy();
      expect(pack.labelPl.length).toBeGreaterThan(5);
    }
  });

  it('all packs have description', () => {
    for (const pack of CANONICAL_PROOF_PACKS) {
      expect(pack.description).toBeTruthy();
    }
  });
});
