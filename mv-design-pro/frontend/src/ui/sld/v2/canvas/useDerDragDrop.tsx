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
}

/** Klikalne palette button — start drag akcji dla danego DER kind. */
export function DerPaletteButton(props: DerPaletteButtonProps): JSX.Element {
  const { kind, onStart, disabled } = props;
  const label = kind === 'PV' ? 'PV (fotowoltaika)' : kind === 'BESS' ? 'BESS (magazyn)' : 'FW (wiatr)';
  const color = kind === 'PV' ? '#FFD166' : kind === 'BESS' ? '#7DD3FC' : '#7EE0B5';
  return (
    <button
      type="button"
      data-testid={`der-palette-btn-${kind}`}
      data-der-kind={kind}
      disabled={disabled}
      onClick={() => !disabled && onStart(kind)}
      style={{
        background: disabled ? '#2A3441' : '#0A1018',
        color,
        border: `1.5px solid ${color}`,
        padding: '6px 10px',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'grab',
        marginRight: 4,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      ＋ {label}
    </button>
  );
}
