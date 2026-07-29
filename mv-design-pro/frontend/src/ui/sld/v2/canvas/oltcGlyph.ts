/**
 * Adnotacja glifu OLTC/DETC na SLD (karta koordynacyjna SLD-02, V12K-045).
 *
 * Czysta funkcja mapująca kanoniczny `Transformer.tap_changer` na adnotację
 * prezentacyjną (etykieta OLTC/DETC, pozycja zaczepu, tryb AUTO/MAN, U_zad).
 * READ-ONLY, ZERO fizyki — wartości pochodzą wyłącznie z modelu. Brak regulacji
 * (`NONE` / brak tap_changer) → `null` (renderer nie rysuje adnotacji).
 */

import type { TapChanger } from '../../../../types/enm';
import type { OltcGlyphAnnotation } from '../renderer/GpzSwitchgearTypes';

/** Etykieta pozycji zaczepu: "poz. 0", "poz. +3", "poz. −4" (minus typograficzny). */
export function formatTapPositionLabel(position: number): string {
  if (position === 0) return 'poz. 0';
  const sign = position > 0 ? '+' : '−';
  return `poz. ${sign}${Math.abs(position)}`;
}

export function buildOltcAnnotation(
  tapChanger: TapChanger | null | undefined,
): OltcGlyphAnnotation | null {
  if (!tapChanger || tapChanger.regulation_type === 'NONE') {
    return null;
  }
  const modeLabel: 'AUTO' | 'MAN' = tapChanger.control_mode === 'MANUAL' ? 'MAN' : 'AUTO';
  const setpoint = tapChanger.voltage_setpoint_kv;
  const setpointLabel =
    modeLabel === 'AUTO' && typeof setpoint === 'number' && Number.isFinite(setpoint) && setpoint > 0
      ? `U_zad ${setpoint.toFixed(1)} kV`
      : undefined;
  return {
    kind: tapChanger.regulation_type,
    positionLabel: formatTapPositionLabel(tapChanger.current_position),
    modeLabel,
    setpointLabel,
  };
}
