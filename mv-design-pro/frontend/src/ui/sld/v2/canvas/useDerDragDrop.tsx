/**
 * K30-77 — useDerDragDrop: hook do drag-and-drop DER (PV/BESS/FW) onto stations.
 *
 * Goal: konfiguracja PV/FW/BESS end-to-end. User przeciąga DER ikon z
 * palette na station mini-block → opens SldDetailDrawer w DER tab z
 * pre-filled connection_variant.
 *
 * Hook zarządza:
 * - Drag start z palette (palette button → drag image)
 * - Drag over station (visual highlight)
 * - Drop on station → callback {stationId, derKind}
 * - Cancel via Escape
 */

import { useCallback, useState } from 'react';

export type DerDragKind = 'PV' | 'BESS' | 'FW';

export interface DerDragState {
  readonly kind: DerDragKind;
  readonly hoverStationId: string | null;
}

export interface DerDragHandlers {
  readonly state: DerDragState | null;
  readonly startDrag: (kind: DerDragKind) => void;
  readonly hoverStation: (stationId: string | null) => void;
  readonly dropOnStation: (stationId: string) => { stationId: string; kind: DerDragKind } | null;
  readonly cancel: () => void;
}

export function useDerDragDrop(): DerDragHandlers {
  const [state, setState] = useState<DerDragState | null>(null);

  const startDrag = useCallback((kind: DerDragKind) => {
    setState({ kind, hoverStationId: null });
  }, []);

  const hoverStation = useCallback((stationId: string | null) => {
    setState((prev) => (prev ? { ...prev, hoverStationId: stationId } : prev));
  }, []);

  const dropOnStation = useCallback((stationId: string) => {
    if (!state) return null;
    const result = { stationId, kind: state.kind };
    setState(null);
    return result;
  }, [state]);

  const cancel = useCallback(() => setState(null), []);

  return { state, startDrag, hoverStation, dropOnStation, cancel };
}

export interface DerPaletteButtonProps {
  readonly kind: DerDragKind;
  readonly onStart: (kind: DerDragKind) => void;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  /** K30-92: active stan (drag w toku z tym kind) → invert color scheme. */
  readonly active?: boolean;
}

/** Klikalne palette button — start drag akcji dla danego DER kind. */
export function DerPaletteButton(props: DerPaletteButtonProps): JSX.Element {
  const { kind, onStart, disabled, disabledReason, active } = props;
  const label = kind === 'PV' ? 'PV (fotowoltaika)' : kind === 'BESS' ? 'BESS (magazyn)' : 'FW (wiatr)';
  const color = kind === 'PV' ? '#FFD166' : kind === 'BESS' ? '#7DD3FC' : '#7EE0B5';
  const title = disabled
    ? disabledReason ?? 'Zakończ bieżące wskazanie układu.'
    : `Wstaw układ ${label} na wybraną stację SN/nN.`;
  return (
    <button
      type="button"
      data-testid={`der-palette-btn-${kind}`}
      data-der-kind={kind}
      data-der-active={active ? 'true' : 'false'}
      aria-pressed={active ? true : undefined}
      title={title}
      disabled={disabled}
      onClick={() => !disabled && onStart(kind)}
      style={{
        // KD-8 poz. 1: powierzchnia i tusz z tokenów MOTYWU; barwa rodzaju
        // (PV/BESS/FW) zostaje na obrysie i na wypełnieniu stanu aktywnego —
        // tam niesie tożsamość, a nie czytelność. Tusz na aktywnym (jasnym)
        // wypełnieniu jest ŚWIADOMIE stały w obu motywach: wypełnienie jest
        // jasne niezależnie od motywu, więc tusz musi być ciemny zawsze.
        background: active ? color : disabled ? 'rgb(var(--scada-surface))' : 'rgb(var(--scada-panel))',
        color: active ? '#0B1014' : 'rgb(var(--scada-text))',
        border: `1.5px solid ${color}`,
        padding: '6px 10px',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : active ? 'grabbing' : 'grab',
        marginRight: 4,
        opacity: disabled ? 0.5 : 1,
        boxShadow: active ? `0 0 8px ${color}` : 'none',
      }}
    >
      {active ? '◉' : '＋'} {label}
    </button>
  );
}
