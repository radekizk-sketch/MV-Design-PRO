/**
 * Zabezpieczenie pola SN z modelu — JEDEN stan prezentacji dla karty technicznej pola K6
 * (`ui/sld/shared/kartaTechnicznaElementu.ts`) i inspektora ui2 (`ui2/adapters/inspectorAdapter.ts`);
 * blok przekaźnika kanwy SLD, lista przekaźników i tabela pól konfiguratora stacji czytają ten sam
 * sterownik tym samym akcesorem `sterownikPola` (parytet: `__tests__/zabezpieczeniePola.test.ts`).
 *
 * Model ma JEDNĄ strukturę zabezpieczeń — sterownik pola (`ProtectionAssignment` z `bay_ref`,
 * karta OCHRONA-JEDNO-ZRODLO, ADR-022); ten moduł czyta go wyłącznie przez akcesory
 * `ui/shared/sterownikZabezpieczen` i nazywa stan pola jednym zdaniem. Zestaw funkcji szablonu
 * pola jedzie przy budowie pola wprost do jego sterownika (`enm.pola.zbuduj_pole`), więc pole bez
 * sterownika nie niesie w modelu żadnych funkcji wymaganych — dawny odczyt „wymagane przez wzorzec”
 * z rekordu pola (skasowane `Bay.protection_codes`) nie ma odpowiednika.
 *
 * Pole bez sterownika to JEDNO zdanie z akcją „dodaj zabezpieczenie” (operacja `add_relay`
 * z `bay_ref`), nigdy „brak danych”.
 */
import type { Bay, EnergyNetworkModel } from '../../types/enm';
import { kodyFunkcjiSterownika, nazwaUrzadzeniaSterownika, sterownikPola as sterownikModelu } from './sterownikZabezpieczen';

/** Sterownik zabezpieczeniowy przypisany do pola (kształt zgodny z opisem pola konfiguratora GPZ). */
export interface SterownikPola {
  readonly ref: string;
  readonly nazwa: string;
  /** Nazwa urządzenia (typ katalogowy albo opis ogólny) — `nazwaUrzadzeniaSterownika`. */
  readonly urzadzenie: string;
  /** Kody włączonych funkcji sterownika (rejestr funkcji EAZ), bez powtórzeń, w kolejności sterownika. */
  readonly kody: readonly string[];
  readonly wlaczone: boolean;
}

export type StanZabezpieczeniaPola =
  /** Sterownik przypisany w modelu. */
  | { readonly rodzaj: 'sterownik'; readonly sterownik: SterownikPola }
  /** Brak sterownika. */
  | { readonly rodzaj: 'brak_sterownika' }
  /** Pole chronione bezpiecznikami aparatu pola (bez sterownika). */
  | { readonly rodzaj: 'bezpieczniki' }
  /** Rola pola bez zabezpieczenia w torze (pole pomiaru napięcia szyn). */
  | { readonly rodzaj: 'nie_dotyczy' };

/** Operacja, która usuwa brak sterownika — kreator zabezpieczenia pola przypięty do pola. */
export const OPERACJA_DODANIA_ZABEZPIECZENIA = 'add_relay' as const;
export const AKCJA_DODANIA_ZABEZPIECZENIA_PL = 'dodaj zabezpieczenie';

/** Sterownik pola z modelu; `null` — brak sterownika. */
export function sterownikPola(model: EnergyNetworkModel | null | undefined, pole: Bay): SterownikPola | null {
  const sterownik = sterownikModelu(model, pole.ref_id);
  if (!sterownik) return null;
  return {
    ref: sterownik.ref_id,
    nazwa: sterownik.name?.trim() || 'sterownik bez nazwy',
    urzadzenie: nazwaUrzadzeniaSterownika(sterownik),
    kody: kodyFunkcjiSterownika(sterownik),
    wlaczone: sterownik.is_enabled !== false,
  };
}

/** Pole, którego aparatem wyłączającym są bezpieczniki (rekord aparatu albo gałąź pola). */
function poleZBezpiecznikami(model: EnergyNetworkModel | null | undefined, pole: Bay): boolean {
  if ((pole.primary_devices ?? []).some((u) => u.kind === 'FUSE')) return true;
  const refy = new Set(pole.equipment_refs ?? []);
  return (model?.branches ?? []).some((g) => refy.has(g.ref_id) && g.type === 'fuse');
}

export function zabezpieczeniePola(model: EnergyNetworkModel | null | undefined, pole: Bay): StanZabezpieczeniaPola {
  const sterownik = sterownikPola(model, pole);
  if (sterownik) return { rodzaj: 'sterownik', sterownik };
  if (pole.bay_role === 'MEASUREMENT') return { rodzaj: 'nie_dotyczy' };
  if (poleZBezpiecznikami(model, pole)) return { rodzaj: 'bezpieczniki' };
  return { rodzaj: 'brak_sterownika' };
}

/** Tekst zabezpieczenia pola — każda informacja raz; brak nazywa, czego brakuje. */
export function tekstZabezpieczeniaPola(stan: StanZabezpieczeniaPola): string | null {
  switch (stan.rodzaj) {
    case 'sterownik': {
      const { sterownik } = stan;
      const nazwa = sterownik.urzadzenie !== sterownik.nazwa ? `${sterownik.nazwa} (${sterownik.urzadzenie})` : sterownik.nazwa;
      const funkcje = sterownik.kody.length > 0 ? sterownik.kody.join(', ') : 'bez funkcji';
      return `${nazwa}: ${funkcje}${sterownik.wlaczone ? '' : ' (wyłączony w modelu)'}`;
    }
    case 'brak_sterownika':
      return 'Brak sterownika zabezpieczeniowego w polu';
    case 'bezpieczniki':
      return 'Bezpieczniki aparatu pola';
    case 'nie_dotyczy':
      return null;
  }
}

/** Czy stan wymaga akcji „dodaj zabezpieczenie” (`add_relay` z `bay_ref`). Sterownik bez nastaw
 *  nie jest brakiem sterownika — jego nastawy zmienia edytor nastaw, nie drugi `add_relay`. */
export function brakZabezpieczenia(stan: StanZabezpieczeniaPola): boolean {
  return stan.rodzaj === 'brak_sterownika';
}
