/**
 * Przekaźniki pól SN stacji — wiersze listy „Przekaźniki” karty zabezpieczeń konfiguratora
 * stacji, wprost z modelu. Tor jest TEN SAM co blok przekaźnika na schemacie i karta pola:
 * sterownik pola (`ProtectionAssignment` z `bay_ref` pola, karta OCHRONA-JEDNO-ZRODLO) czytany
 * akcesorami `ui/shared/sterownikZabezpieczen`.
 *
 * Kolejność deterministyczna: kolejność pól stacji. Funkcje to kody rejestru funkcji
 * sterownika (włączone), bez powtórzeń, w kolejności sterownika; nastawy — liczba nastaw
 * grupy efektywnej.
 */
import type { EnergyNetworkModel } from '../../../types/enm';
import {
  kodyFunkcjiSterownika,
  liczbaNastawGrupyEfektywnej,
  nazwaUrzadzeniaSterownika,
  sterownikPola,
} from '../../shared/sterownikZabezpieczen';
import type { ProtectionRow } from './cards/StationConfigProtectionCard';

export interface PoleZabezpieczenia {
  readonly oznaczenie: string;
  readonly bayRef: string;
}

export function przekaznikiStacji(
  model: Partial<Pick<EnergyNetworkModel, 'protection_assignments'>> | null | undefined,
  pola: readonly PoleZabezpieczenia[],
): readonly ProtectionRow[] {
  const wiersze: ProtectionRow[] = [];
  for (const pole of pola) {
    const sterownik = sterownikPola(model, pole.bayRef);
    if (!sterownik) continue;
    wiersze.push({
      relayId: sterownik.ref_id,
      bayDesignation: pole.oznaczenie,
      typePl: nazwaUrzadzeniaSterownika(sterownik),
      functionsPl: kodyFunkcjiSterownika(sterownik),
      settingsCount: liczbaNastawGrupyEfektywnej(sterownik),
      enabled: sterownik.is_enabled,
    });
  }
  return wiersze;
}
