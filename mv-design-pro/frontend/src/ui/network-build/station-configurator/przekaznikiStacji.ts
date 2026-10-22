/**
 * Przekaźniki pól SN stacji — wiersze listy „Przekaźniki” karty zabezpieczeń konfiguratora
 * stacji, wprost z modelu. Tor jest TEN SAM co znakowanie zabezpieczeń na SLD
 * (`ui/sld/v3/compose/protectionMarking.ts`): `Bay.protection_ref` → `ProtectionAssignment`.
 * Dawniej karta dostawała wyłącznie pustą listę bazową i mówiła „Zabezpieczenia dodaje się…”
 * także wtedy, gdy pola stacji miały przypięte zabezpieczenia.
 *
 * Kolejność deterministyczna: kolejność pól stacji. Funkcje to kody ANSI/IEC nastaw
 * (`settings[].function_type`) bez powtórzeń, w kolejności nastaw.
 */
import type { ProtectionAssignment } from '../../../types/enm';
import {
  ETYKIETA_RODZAJU_ZABEZPIECZENIA,
  kodFunkcjiZabezpieczenia,
} from '../../shared/etykietyZabezpieczen';
import type { ProtectionRow } from './cards/StationConfigProtectionCard';

export interface PoleZabezpieczenia {
  readonly oznaczenie: string;
  readonly protectionRef: string | null | undefined;
}

export function przekaznikiStacji(
  zabezpieczenia: readonly ProtectionAssignment[],
  pola: readonly PoleZabezpieczenia[],
): readonly ProtectionRow[] {
  const poRef = new Map(zabezpieczenia.map((z) => [z.ref_id, z] as const));
  const wiersze: ProtectionRow[] = [];
  for (const pole of pola) {
    const zabezpieczenie = pole.protectionRef ? poRef.get(pole.protectionRef) : undefined;
    if (!zabezpieczenie) continue;
    wiersze.push({
      relayId: zabezpieczenie.ref_id,
      bayDesignation: pole.oznaczenie,
      typePl: ETYKIETA_RODZAJU_ZABEZPIECZENIA[zabezpieczenie.device_type],
      functionsPl: [
        ...new Set(zabezpieczenie.settings.map((n) => kodFunkcjiZabezpieczenia(n.function_type))),
      ],
      settingsCount: zabezpieczenie.settings.length,
      enabled: zabezpieczenie.is_enabled,
    });
  }
  return wiersze;
}
