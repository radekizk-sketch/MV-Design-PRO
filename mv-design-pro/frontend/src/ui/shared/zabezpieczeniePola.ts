/**
 * Zabezpieczenie pola SN z modelu — JEDNA funkcja odczytu dla każdego miejsca prezentacji:
 * karty technicznej pola K6 (`ui/sld/shared/kartaTechnicznaElementu.ts`), oznaczenia
 * zabezpieczeń na kanwie SLD (`ui/sld/v2/canvas/enmToSldAdapter.ts`), inspektora ui2
 * (`ui2/adapters/inspectorAdapter.ts`) i tabeli pól konfiguratora GPZ.
 *
 * Model niesie DWIE różne informacje, które dawniej stały obok siebie jako dwie prawdy
 * („Zabezpieczenie: brak danych” obok „Funkcje zabezpieczeniowe: 51, 50, 51N, 67N”):
 *  - funkcje WYMAGANE przez wzorzec pola — `Bay.protection_codes` (kody ANSI/IEC z szablonu pola,
 *    `protection_codes_for_bay_role` w katalogu szablonów); to wymaganie, nie urządzenie;
 *  - sterownik PRZYPISANY z nastawami — `Bay.protection_ref` → `ProtectionAssignment` (zapisuje go
 *    operacja `add_relay` z `bay_ref`; ten sam tor czyta tor wyzwalania na kanwie i lista
 *    przekaźników konfiguratora stacji); kody funkcji sterownika pochodzą z jego nastaw.
 *
 * Pole z funkcjami wymaganymi i bez sterownika to JEDNO zdanie z akcją „dodaj zabezpieczenie”
 * (operacja `add_relay` z `bay_ref`), nigdy „brak danych”.
 */
import type { Bay, EnergyNetworkModel, ProtectionAssignment } from '../../types/enm';
import { kodFunkcjiZabezpieczenia } from './etykietyZabezpieczen';

/** Sterownik zabezpieczeniowy przypisany do pola (kształt zgodny z opisem pola konfiguratora GPZ). */
export interface SterownikPola {
  readonly ref: string;
  readonly nazwa: string;
  /** Kody funkcji z nastaw sterownika (ANSI/IEC), bez powtórzeń, w kolejności nastaw. */
  readonly kody: readonly string[];
  readonly wlaczone: boolean;
}

export type StanZabezpieczeniaPola =
  /** Sterownik przypisany w modelu. */
  | { readonly rodzaj: 'sterownik'; readonly sterownik: SterownikPola; readonly wymagane: readonly string[] }
  /** Brak sterownika; `wymagane` — funkcje wzorca pola (pusta lista: wzorzec ich nie podaje). */
  | { readonly rodzaj: 'brak_sterownika'; readonly wymagane: readonly string[] }
  /** Pole chronione bezpiecznikami aparatu pola (bez sterownika i bez funkcji wymaganych). */
  | { readonly rodzaj: 'bezpieczniki' }
  /** Rola pola bez zabezpieczenia w torze (pole pomiaru napięcia szyn). */
  | { readonly rodzaj: 'nie_dotyczy' };

/** Operacja, która usuwa brak sterownika — kreator zabezpieczenia pola przypięty do pola. */
export const OPERACJA_DODANIA_ZABEZPIECZENIA = 'add_relay' as const;
export const AKCJA_DODANIA_ZABEZPIECZENIA_PL = 'dodaj zabezpieczenie';

/** Aparaty pola, które sterownik może wyzwalać: gałęzie i rekordy aparatów pola. */
function aparatyPola(pole: Bay): Set<string> {
  const refy = new Set<string>(pole.equipment_refs ?? []);
  for (const u of pole.primary_devices ?? []) {
    refy.add(u.device_ref);
    if (u.linked_ref) refy.add(u.linked_ref);
  }
  return refy;
}

/**
 * Rekord sterownika pola — JEDYNY predykat powiązania pola ze sterownikiem (karta pola, tor
 * wyzwalania na kanwie, inspektor ui2, lista przekaźników konfiguratora stacji):
 *  1. `Bay.protection_ref` → `ProtectionAssignment` (po `ref_id`, a dla rekordów zastanych — po
 *     `id`) — powiązanie zapisywane przez `add_relay` z `bay_ref`;
 *  2. bez niego — sterownik, którego wyłącznik wykonawczy (`breaker_ref`) jest aparatem tego pola
 *     (sterownik dodany wskazaniem wyłącznika, zabezpieczenie źródła nN budowane z kreatorem
 *     stacji — oba zapisują tylko `breaker_ref`).
 * `null` — pole bez sterownika.
 */
export function przypisanieZabezpieczeniaPola(
  model: Pick<EnergyNetworkModel, 'protection_assignments'> | null | undefined,
  pole: Bay,
): ProtectionAssignment | null {
  const zabezpieczenia = model?.protection_assignments ?? [];
  const ref = pole.protection_ref;
  if (ref) {
    const wskazany = zabezpieczenia.find((z) => z.ref_id === ref || z.id === ref);
    if (wskazany) return wskazany;
  }
  const aparaty = aparatyPola(pole);
  return zabezpieczenia.find((z) => aparaty.has(z.breaker_ref)) ?? null;
}

/** Kody funkcji sterownika z jego nastaw (ANSI/IEC), bez powtórzeń, w kolejności nastaw. */
export function kodyFunkcjiSterownika(przypisanie: ProtectionAssignment): string[] {
  return [...new Set((przypisanie.settings ?? []).map((n) => kodFunkcjiZabezpieczenia(n.function_type)))];
}

/** Sterownik pola z modelu; `null` — brak sterownika. */
export function sterownikPola(model: EnergyNetworkModel | null | undefined, pole: Bay): SterownikPola | null {
  const przypisanie = przypisanieZabezpieczeniaPola(model, pole);
  if (!przypisanie) return null;
  return {
    ref: przypisanie.ref_id,
    nazwa: przypisanie.name?.trim() || 'sterownik bez nazwy',
    kody: kodyFunkcjiSterownika(przypisanie),
    wlaczone: przypisanie.is_enabled !== false,
  };
}

/** Funkcje wymagane przez wzorzec pola (`Bay.protection_codes`), bez pustych i powtórzeń. */
export function funkcjeWymaganePola(pole: Bay): string[] {
  return [...new Set((pole.protection_codes ?? []).map((k) => k.trim()).filter((k) => k.length > 0))];
}

/** Pole, którego aparatem wyłączającym są bezpieczniki (rekord aparatu albo gałąź pola). */
function poleZBezpiecznikami(model: EnergyNetworkModel | null | undefined, pole: Bay): boolean {
  if ((pole.primary_devices ?? []).some((u) => u.kind === 'FUSE')) return true;
  const refy = new Set(pole.equipment_refs ?? []);
  return (model?.branches ?? []).some((g) => refy.has(g.ref_id) && g.type === 'fuse');
}

export function zabezpieczeniePola(model: EnergyNetworkModel | null | undefined, pole: Bay): StanZabezpieczeniaPola {
  const wymagane = funkcjeWymaganePola(pole);
  const sterownik = sterownikPola(model, pole);
  if (sterownik) return { rodzaj: 'sterownik', sterownik, wymagane };
  if (wymagane.length > 0) return { rodzaj: 'brak_sterownika', wymagane };
  if (pole.bay_role === 'MEASUREMENT') return { rodzaj: 'nie_dotyczy' };
  if (poleZBezpiecznikami(model, pole)) return { rodzaj: 'bezpieczniki' };
  return { rodzaj: 'brak_sterownika', wymagane };
}

/** Tekst zabezpieczenia pola — każda informacja raz; brak nazywa, czego brakuje. */
export function tekstZabezpieczeniaPola(stan: StanZabezpieczeniaPola): string | null {
  switch (stan.rodzaj) {
    case 'sterownik': {
      const { sterownik } = stan;
      const funkcje = sterownik.kody.length > 0 ? sterownik.kody.join(', ') : 'bez nastaw funkcji';
      return `${sterownik.nazwa}: ${funkcje}${sterownik.wlaczone ? '' : ' (wyłączony w modelu)'}`;
    }
    case 'brak_sterownika':
      return stan.wymagane.length > 0
        ? `Brak sterownika — wzorzec pola wymaga funkcji ${stan.wymagane.join(', ')}`
        : 'Brak sterownika zabezpieczeniowego w polu';
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
