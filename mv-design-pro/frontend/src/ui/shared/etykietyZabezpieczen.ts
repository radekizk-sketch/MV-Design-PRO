/**
 * Etykiety zabezpieczeń po polsku — JEDNO źródło dla inspektora (`ui2/adapters/inspectorAdapter`),
 * formularza zabezpieczenia (`ui/topology/modals/ProtectionModal`) i konfiguratora stacji
 * (`ui/network-build/station-configurator/przekaznikiStacji`). Dawniej dwie kopie mapy różniły
 * się brzmieniem tej samej wartości („Nadprądowe kierunkowe” / „Kierunkowe nadprądowe”).
 */
import type { ProtectionAssignment, ProtectionSetting } from '../../types/enm';

export const ETYKIETA_RODZAJU_ZABEZPIECZENIA: Readonly<
  Record<ProtectionAssignment['device_type'], string>
> = {
  overcurrent: 'Nadprądowe',
  earth_fault: 'Ziemnozwarciowe',
  directional_overcurrent: 'Nadprądowe kierunkowe',
  distance: 'Odległościowe',
  differential: 'Różnicowe',
  custom: 'Niestandardowe',
};

/** Kod ANSI/IEC funkcji nastawy (`ProtectionSetting.function_type`) — człon po ostatnim „_”
 *  wartości słownika modelu (`overcurrent_51` → `51`, `directional_67N` → `67N`). */
export function kodFunkcjiZabezpieczenia(funkcja: ProtectionSetting['function_type']): string {
  return funkcja.slice(funkcja.lastIndexOf('_') + 1);
}
