/**
 * ApparatusStateModal R30 tests — operacyjne sterowanie łącznikami.
 *
 * Pokrycie:
 *   - 4 selecty (CB/DS_BUS/DS_LIN/ES) + komentarz
 *   - Interlock walidacje (ES vs CB, CB vs DS)
 *   - Read-only mode dla controlMode='local'
 *   - Delta computation (tylko zmienione fields wysyłane)
 *   - Impact summary
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, cleanup } from '@testing-library/react';

import { ApparatusStateModal, type ApparatusStateData } from '../ApparatusStateModal';

const initialClosed: ApparatusStateData = {
  bayRef: 'bay-1',
  bayNumber: '10',
  feederName: 'PST1',
  cbState: 'closed',
  dsBusState: 'closed',
  dsLinState: 'closed',
  esState: 'open',
  cbQ: 'Q0',
  dsBusQ: 'Q1',
  dsLinQ: 'Q9',
  esQ: 'Q8',
  controlMode: 'remote',
};

describe('ApparatusStateModal — render', () => {
  it('Renderuje 4 selecty + komentarz', () => {
    const { container } = render(
      <ApparatusStateModal
        isOpen
        initial={initialClosed}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-testid="apparatus-state-cb"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="apparatus-state-ds-bus"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="apparatus-state-ds-lin"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="apparatus-state-es"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="apparatus-state-comment"]')).toBeTruthy();
    cleanup();
  });

  it('Title + subtitle z bay number i tryb', () => {
    const { container } = render(
      <ApparatusStateModal
        isOpen
        initial={initialClosed}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const title = container.querySelector('[data-testid="sld-modal-title"]');
    expect(title?.textContent).toContain('Sterowanie polem 10');
    expect(container.textContent).toContain('PST1');
    expect(container.textContent).toContain('zdalne');
    cleanup();
  });

  it('Q-numbery widoczne w labelach (Q0, Q1, Q9, Q8)', () => {
    const { container } = render(
      <ApparatusStateModal
        isOpen
        initial={initialClosed}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('Q0');
    expect(container.textContent).toContain('Q1');
    expect(container.textContent).toContain('Q9');
    expect(container.textContent).toContain('Q8');
    cleanup();
  });
});

describe('ApparatusStateModal — interlock walidacje (kanon polski + IEC 61850)', () => {
  it('ES closed + CB closed → BLOKADA error', () => {
    const { container } = render(
      <ApparatusStateModal
        isOpen
        initial={initialClosed}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    /* Zmień ES na closed (CB jest closed) */
    const esSelect = container.querySelector('[data-testid="apparatus-state-es"]') as HTMLSelectElement;
    fireEvent.change(esSelect, { target: { value: 'closed' } });

    /* BLOKADA error widoczny */
    expect(container.textContent).toContain('BLOKADA: ES nie może być załączone');
    /* Confirm disabled */
    const confirm = container.querySelector('[data-testid="sld-modal-confirm"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    cleanup();
  });

  it('CB closed + DS_BUS open → BLOKADA error', () => {
    const initialCbClosedDsOpen: ApparatusStateData = {
      ...initialClosed,
      dsBusState: 'open',
    };
    const { container } = render(
      <ApparatusStateModal
        isOpen
        initial={initialCbClosedDsOpen}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('BLOKADA: CB nie może być zamknięte');
    cleanup();
  });

  it('Wszystko bezpieczne (CB open, ES open) → brak błędów', () => {
    const safe: ApparatusStateData = {
      ...initialClosed,
      cbState: 'open',
      dsBusState: 'open',
      dsLinState: 'open',
      esState: 'open',
    };
    const { container } = render(
      <ApparatusStateModal isOpen initial={safe} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container.textContent).not.toContain('BLOKADA');
    cleanup();
  });

  it('ES closed gdy wszystko otwarte → OK (legalne)', () => {
    const safeForGround: ApparatusStateData = {
      ...initialClosed,
      cbState: 'open',
      dsBusState: 'open',
      dsLinState: 'open',
      esState: 'open',
    };
    const { container } = render(
      <ApparatusStateModal isOpen initial={safeForGround} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    /* Zmień ES na closed (legal — wszystko otwarte) */
    const esSelect = container.querySelector('[data-testid="apparatus-state-es"]') as HTMLSelectElement;
    fireEvent.change(esSelect, { target: { value: 'closed' } });
    expect(container.textContent).not.toContain('BLOKADA');
    cleanup();
  });
});

describe('ApparatusStateModal — readonly local mode', () => {
  it('controlMode=local → warning + disabled selecty', () => {
    const local: ApparatusStateData = { ...initialClosed, controlMode: 'local' };
    const { container } = render(
      <ApparatusStateModal isOpen initial={local} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="apparatus-state-readonly-warning"]')).toBeTruthy();
    const cb = container.querySelector('[data-testid="apparatus-state-cb"]') as HTMLSelectElement;
    expect(cb.disabled).toBe(true);
    cleanup();
  });

  it('controlMode=remote → brak warning + enabled selecty', () => {
    const { container } = render(
      <ApparatusStateModal isOpen initial={initialClosed} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="apparatus-state-readonly-warning"]')).toBeNull();
    const cb = container.querySelector('[data-testid="apparatus-state-cb"]') as HTMLSelectElement;
    expect(cb.disabled).toBe(false);
    cleanup();
  });
});

describe('ApparatusStateModal — delta computation', () => {
  it('Brak zmian → confirm disabled "Brak zmian"', () => {
    const { container } = render(
      <ApparatusStateModal isOpen initial={initialClosed} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    const confirm = container.querySelector('[data-testid="sld-modal-confirm"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toContain('Brak zmian');
    cleanup();
  });

  it('Zmiana CB → delta zawiera tylko cbState, NIE inne', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <ApparatusStateModal isOpen initial={initialClosed} onClose={vi.fn()} onSubmit={onSubmit} />,
    );
    const cb = container.querySelector('[data-testid="apparatus-state-cb"]') as HTMLSelectElement;
    fireEvent.change(cb, { target: { value: 'open' } });
    /* Najpierw musimy ustawić DS na open żeby nie było blokady */
    const dsBus = container.querySelector('[data-testid="apparatus-state-ds-bus"]') as HTMLSelectElement;
    fireEvent.change(dsBus, { target: { value: 'open' } });
    const dsLin = container.querySelector('[data-testid="apparatus-state-ds-lin"]') as HTMLSelectElement;
    fireEvent.change(dsLin, { target: { value: 'open' } });
    const confirm = container.querySelector('[data-testid="sld-modal-confirm"]') as HTMLButtonElement;
    fireEvent.click(confirm);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      bayRef: 'bay-1',
      cbState: 'open',
      dsBusState: 'open',
      dsLinState: 'open',
    }));
    /* esState NIE powinien być w delta */
    const calledArgs = onSubmit.mock.calls[0][0];
    expect(calledArgs.esState).toBeUndefined();
    cleanup();
  });

  it('Counter pokazuje liczbę zmian', () => {
    const { container } = render(
      <ApparatusStateModal isOpen initial={initialClosed} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    const dsBus = container.querySelector('[data-testid="apparatus-state-ds-bus"]') as HTMLSelectElement;
    const dsLin = container.querySelector('[data-testid="apparatus-state-ds-lin"]') as HTMLSelectElement;
    const cb = container.querySelector('[data-testid="apparatus-state-cb"]') as HTMLSelectElement;
    fireEvent.change(dsBus, { target: { value: 'open' } });
    fireEvent.change(dsLin, { target: { value: 'open' } });
    fireEvent.change(cb, { target: { value: 'open' } });

    const confirm = container.querySelector('[data-testid="sld-modal-confirm"]') as HTMLButtonElement;
    expect(confirm.textContent).toContain('3 zmian');
    cleanup();
  });

  it('Impact summary widoczne gdy są zmiany + brak blokad', () => {
    const { container } = render(
      <ApparatusStateModal isOpen initial={initialClosed} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    const dsBus = container.querySelector('[data-testid="apparatus-state-ds-bus"]') as HTMLSelectElement;
    fireEvent.change(dsBus, { target: { value: 'open' } });

    /* Po zmianie CB jest closed ale DS_BUS open → blokada CB */
    /* Trzeba też CB na open */
    const cb = container.querySelector('[data-testid="apparatus-state-cb"]') as HTMLSelectElement;
    fireEvent.change(cb, { target: { value: 'open' } });

    const summary = container.querySelector('[data-testid="apparatus-state-impact-summary"]');
    expect(summary?.textContent).toContain('Inv 4');
    cleanup();
  });
});
