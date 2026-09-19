/**
 * K30-77: useDerDragDrop hook + DerPaletteButton.
 *
 * Inwarianty:
 * 1. Initial state = null
 * 2. startDrag(kind) → state z hoverStationId=null
 * 3. hoverStation(id) → state.hoverStationId = id
 * 4. dropOnStation(id) → return {stationId, kind}, clear state
 * 5. cancel() → clear state
 * 6. DerPaletteButton renders 3 variants (PV/BESS/FW) z correct color
 * 7. disabled → onClick no-op
 */

import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, cleanup, renderHook, act } from '@testing-library/react';

import { useDerDragDrop, DerPaletteButton } from '../useDerDragDrop';

describe('useDerDragDrop — drag-drop hook', () => {
  it('initial state = null', () => {
    const { result } = renderHook(() => useDerDragDrop());
    expect(result.current.state).toBeNull();
  });

  it('startDrag(PV) → state z kind=PV, hoverStationId=null', () => {
    const { result } = renderHook(() => useDerDragDrop());
    act(() => result.current.startDrag('PV'));
    expect(result.current.state).toEqual({ kind: 'PV', hoverStationId: null });
  });

  it('hoverStation aktualizuje hoverStationId', () => {
    const { result } = renderHook(() => useDerDragDrop());
    act(() => result.current.startDrag('BESS'));
    act(() => result.current.hoverStation('s08'));
    expect(result.current.state?.hoverStationId).toBe('s08');
  });

  it('dropOnStation zwraca {stationId, kind} + clears state', () => {
    const { result } = renderHook(() => useDerDragDrop());
    act(() => result.current.startDrag('FW'));
    let dropResult: { stationId: string; kind: 'PV' | 'BESS' | 'FW' } | null = null;
    act(() => {
      dropResult = result.current.dropOnStation('s10');
    });
    expect(dropResult).toEqual({ stationId: 's10', kind: 'FW' });
    expect(result.current.state).toBeNull();
  });

  it('dropOnStation bez active drag → null', () => {
    const { result } = renderHook(() => useDerDragDrop());
    let dropResult: unknown = 'sentinel';
    act(() => {
      dropResult = result.current.dropOnStation('s10');
    });
    expect(dropResult).toBeNull();
  });

  it('cancel clears state', () => {
    const { result } = renderHook(() => useDerDragDrop());
    act(() => result.current.startDrag('PV'));
    act(() => result.current.cancel());
    expect(result.current.state).toBeNull();
  });
});

describe('DerPaletteButton — palette UI', () => {
  it('renders PV/BESS/FW variants z poprawnymi labels', () => {
    const { container: c1, getByText: g1 } = render(<DerPaletteButton kind="PV" onStart={vi.fn()} />);
    expect(c1.querySelector('[data-testid="der-palette-btn-PV"]')).toBeTruthy();
    expect(g1(/PV \(fotowoltaika\)/u)).toBeInTheDocument();
    cleanup();

    const { container: c2, getByText: g2 } = render(<DerPaletteButton kind="BESS" onStart={vi.fn()} />);
    expect(c2.querySelector('[data-testid="der-palette-btn-BESS"]')).toBeTruthy();
    expect(g2(/BESS \(magazyn\)/u)).toBeInTheDocument();
    cleanup();

    const { container: c3, getByText: g3 } = render(<DerPaletteButton kind="FW" onStart={vi.fn()} />);
    expect(c3.querySelector('[data-testid="der-palette-btn-FW"]')).toBeTruthy();
    expect(g3(/FW \(wiatr\)/u)).toBeInTheDocument();
    cleanup();
  });

  it('onClick wywołuje onStart(kind)', () => {
    const onStart = vi.fn();
    const { container } = render(<DerPaletteButton kind="PV" onStart={onStart} />);
    fireEvent.click(container.querySelector('[data-testid="der-palette-btn-PV"]') as Element);
    expect(onStart).toHaveBeenCalledWith('PV');
    cleanup();
  });

  it('disabled → onClick no-op + button disabled', () => {
    const onStart = vi.fn();
    const { container } = render(
      <DerPaletteButton
        kind="BESS"
        onStart={onStart}
        disabled
        disabledReason="Najpierw wstaw stację SN/nN w ciągu SN."
      />,
    );
    const btn = container.querySelector('[data-testid="der-palette-btn-BESS"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('Najpierw wstaw stację SN/nN w ciągu SN.');
    fireEvent.click(btn);
    expect(onStart).not.toHaveBeenCalled();
    cleanup();
  });

  it('enabled button explains expected DER placement flow', () => {
    const { container } = render(<DerPaletteButton kind="PV" onStart={vi.fn()} />);
    const btn = container.querySelector('[data-testid="der-palette-btn-PV"]') as HTMLButtonElement;
    expect(btn.title).toBe('Wstaw układ PV (fotowoltaika) na wybraną stację SN/nN.');
    cleanup();
  });

  it('data-der-kind attr emitted', () => {
    const { container } = render(<DerPaletteButton kind="FW" onStart={vi.fn()} />);
    expect(container.querySelector('[data-testid="der-palette-btn-FW"]')?.getAttribute('data-der-kind')).toBe('FW');
    cleanup();
  });

  it('active=true → aria-pressed + data-der-active=true', () => {
    const { container } = render(<DerPaletteButton kind="PV" onStart={vi.fn()} active />);
    const btn = container.querySelector('[data-testid="der-palette-btn-PV"]') as HTMLButtonElement;
    expect(btn.getAttribute('data-der-active')).toBe('true');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    cleanup();
  });

  it('active=false (default) → data-der-active=false, brak aria-pressed', () => {
    const { container } = render(<DerPaletteButton kind="PV" onStart={vi.fn()} />);
    const btn = container.querySelector('[data-testid="der-palette-btn-PV"]') as HTMLButtonElement;
    expect(btn.getAttribute('data-der-active')).toBe('false');
    expect(btn.hasAttribute('aria-pressed')).toBe(false);
    cleanup();
  });
});
