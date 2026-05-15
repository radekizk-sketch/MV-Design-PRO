/**
 * Operational Mode Store — K30-17 SLD click-to-config gaps fix.
 *
 * Tracks the current operational mode of the SLD viewer, controlling how
 * clicks are interpreted:
 *
 *   - NORMALNY     — standard selection + property editing flow
 *   - SERVICE      — clicking switches toggles in-service state
 *   - FAULT        — clicking bus sets fault location for SC analysis
 *   - REVIEW       — read-only inspection (results view)
 *
 * Plus mode metadata used by EngineeringContextMenu + SldModeInteractionHandler.
 */

import { create } from 'zustand';

export type OperationalMode = 'NORMALNY' | 'SERVICE' | 'FAULT' | 'REVIEW';

interface OperationalModeState {
  readonly mode: OperationalMode;
  setMode: (mode: OperationalMode) => void;
  reset: () => void;
}

export const useOperationalModeStore = create<OperationalModeState>((set) => ({
  mode: 'NORMALNY',
  setMode: (mode) => set({ mode }),
  reset: () => set({ mode: 'NORMALNY' }),
}));

export const OPERATIONAL_MODE_LABELS_PL: Record<OperationalMode, string> = {
  NORMALNY: 'Tryb normalny (edycja)',
  SERVICE: 'Tryb przełączania (toggle service)',
  FAULT: 'Tryb zwarcia (wybór bus)',
  REVIEW: 'Tryb przeglądu (read-only)',
};
