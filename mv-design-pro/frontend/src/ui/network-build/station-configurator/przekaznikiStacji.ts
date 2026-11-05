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
import type { Bay, ProtectionAssignment } from '../../../types/enm';
import { ETYKIETA_RODZAJU_ZABEZPIECZENIA } from '../../shared/etykietyZabezpieczen';
import type { ProtectionRow } from './cards/StationConfigProtectionCard';
import { kodyFunkcjiSterownika, przypisanieZabezpieczeniaPola } from '../../shared/zabezpieczeniePola';

export interface PoleZabezpieczenia {
  readonly oznaczenie: string;
  readonly pole: Bay;
}

export function przekaznikiStacji(
  zabezpieczenia: readonly ProtectionAssignment[],
  pola: readonly PoleZabezpieczenia[],
): readonly ProtectionRow[] {
  const wiersze: ProtectionRow[] = [];
  for (const pole of pola) {
    // Predykat powiązania pola ze sterownikiem z JEDNEGO źródła (`ui/shared/zabezpieczeniePola`).
    const zabezpieczenie = przypisanieZabezpieczeniaPola({ protection_assignments: [...zabezpieczenia] }, pole.pole);
    if (!zabezpieczenie) continue;
    wiersze.push({
      relayId: zabezpieczenie.ref_id,
      bayDesignation: pole.oznaczenie,
      typePl: ETYKIETA_RODZAJU_ZABEZPIECZENIA[zabezpieczenie.device_type],
      functionsPl: kodyFunkcjiSterownika(zabezpieczenie),
      settingsCount: zabezpieczenie.settings.length,
      enabled: zabezpieczenie.is_enabled,
    });
  }
  return wiersze;
}
