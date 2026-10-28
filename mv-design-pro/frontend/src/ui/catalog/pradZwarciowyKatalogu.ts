/**
 * Zapis prądu zwarciowego pozycji katalogu aparatury [kA] w podsumowaniach, listach
 * i kartach — z rozróżnieniem DWÓCH braków liczby:
 *
 * - „nie dotyczy” — rodzaj aparatu z definicji normy tej wielkości nie ma (zdolność
 *   wyłączania zwarć rozłącznika, odłącznika i uziemnika; prąd krótkotrwały wytrzymywany
 *   bezpiecznika). Rozstrzyga RODZAJ, nie wartość.
 * - „brak danych” — wielkość jest właściwa rodzajowi, a karta katalogowa jej nie podaje.
 *
 * Backend zapisuje oba jako `null`; zero nie jest żadnym z nich (bramka rekordu KAT-T-050
 * odrzuca 0 kA w każdej wielkości). Zbiory poniżej są ODBICIEM jednego źródła backendu
 * (`network_model/catalog/rodzaje_aparatury.py`) — test
 * `__tests__/pradZwarciowyKatalogu.test.ts` porównuje je z fikstura generowaną z tych
 * predykatów (`harness-fixtures/generated/rodzaje_wielkosci_zwarciowych_aparatury.json`),
 * więc rozjazd warstw zapala czerwień.
 */
export const BRAK_DANYCH_PL = 'brak danych';
export const NIE_DOTYCZY_PL = 'nie dotyczy';

/** Wielkości zwarciowe rekordu łącznika SN (`SwitchEquipmentType`). */
export type WielkoscZwarciowaLacznika = 'ik_ka' | 'icw_ka' | 'i_cu_ka';
/** Wielkości zwarciowe pozycji aparatu SN (`MVApparatusType`). */
export type WielkoscZwarciowaAparatuSn =
  | 'breaking_capacity_ka'
  | 'making_capacity_ka'
  | 'i_th_ka'
  | 'i_dyn_ka';

/** Rodzaje łącznika SN ze znamionową zdolnością wyłączania zwarć (I_k, I_cu). */
export const RODZAJE_LACZNIKA_ZE_ZDOLNOSCIA_WYLACZANIA: ReadonlySet<string> = new Set([
  'CIRCUIT_BREAKER',
  'RECLOSER',
  'FUSE',
]);
/** Rodzaje łącznika SN bez prądu krótkotrwałego wytrzymywanego (I_cw). */
export const RODZAJE_LACZNIKA_BEZ_PRADU_KROTKOTRWALEGO: ReadonlySet<string> = new Set(['FUSE']);
/** Rodzaj aparatu SN projekcji `APARAT_SN` (`device_kind`) z rodzaju rekordu łącznika. */
export const RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA: Readonly<Record<string, string>> = {
  CIRCUIT_BREAKER: 'WYLACZNIK',
  LOAD_SWITCH: 'ROZLACZNIK',
  DISCONNECTOR: 'ODLACZNIK',
  EARTH_SWITCH: 'UZIEMNIK',
  FUSE: 'ROZLACZNIK_BEZPIECZNIKOWY',
  RECLOSER: 'REKLOZER',
};
const POLE_LACZNIKA_Z_POLA_APARATU_SN: Readonly<
  Partial<Record<WielkoscZwarciowaAparatuSn, WielkoscZwarciowaLacznika>>
> = {
  breaking_capacity_ka: 'ik_ka',
  i_th_ka: 'icw_ka',
};
const RODZAJ_LACZNIKA_Z_RODZAJU_APARATU_SN: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA).map(([lacznik, aparat]) => [aparat, lacznik]),
);

/** Czy wielkość zwarciowa jest właściwa rodzajowi łącznika SN (`equipment_kind`). */
export function wielkoscLacznikaDotyczy(
  equipmentKind: string,
  pole: WielkoscZwarciowaLacznika,
): boolean {
  if (pole === 'icw_ka') {
    return !RODZAJE_LACZNIKA_BEZ_PRADU_KROTKOTRWALEGO.has(equipmentKind);
  }
  return RODZAJE_LACZNIKA_ZE_ZDOLNOSCIA_WYLACZANIA.has(equipmentKind);
}

/**
 * Czy wielkość zwarciowa jest właściwa rodzajowi aparatu SN (`device_kind`). Rodzaj spoza
 * odwzorowania i pole bez odpowiednika w rekordzie łącznika nie mają rozstrzygnięcia
 * „nie dotyczy” — wielkość traktowana jako właściwa (brak liczby = „brak danych”).
 */
export function wielkoscAparatuSnDotyczy(
  deviceKind: string,
  pole: WielkoscZwarciowaAparatuSn,
): boolean {
  const poleLacznika = POLE_LACZNIKA_Z_POLA_APARATU_SN[pole];
  const rodzajLacznika = RODZAJ_LACZNIKA_Z_RODZAJU_APARATU_SN[deviceKind];
  if (poleLacznika === undefined || rodzajLacznika === undefined) {
    return true;
  }
  return wielkoscLacznikaDotyczy(rodzajLacznika, poleLacznika);
}

function liczbaKa(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, '');
}

/**
 * Liczba [kA] albo — gdy liczby nie ma — „nie dotyczy” (wielkość niewłaściwa rodzajowi)
 * lub „brak danych” (wielkość właściwa, karta jej nie podaje). Liczba jest pokazywana
 * zawsze, gdy jest: rozstrzygnięcie rodzaju nigdy nie ukrywa danej.
 */
export function pradKaWgRodzaju(value: unknown, dotyczy: boolean): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${liczbaKa(value)} kA`;
  }
  return dotyczy ? BRAK_DANYCH_PL : NIE_DOTYCZY_PL;
}

/**
 * Zapis prądu [kA] pozycji bez rozstrzygnięcia rodzaju (aparatura nN) — brak liczby to
 * „brak danych”, nigdy „0 kA” ani „- kA”.
 */
export function pradKaLubBrakDanych(value: unknown): string {
  return pradKaWgRodzaju(value, true);
}

/** Wielkość zwarciowa rekordu łącznika SN z listy katalogu (rodzaj z `equipment_kind`). */
export function pradLacznikaKatalogu(
  record: Readonly<Record<string, unknown>>,
  pole: WielkoscZwarciowaLacznika,
): string {
  return pradKaWgRodzaju(record[pole], wielkoscLacznikaDotyczy(String(record.equipment_kind ?? ''), pole));
}

/** Wielkość zwarciowa pozycji aparatu SN z listy katalogu (rodzaj z `device_kind`). */
export function pradAparatuSnKatalogu(
  record: Readonly<Record<string, unknown>>,
  pole: WielkoscZwarciowaAparatuSn,
): string {
  return pradKaWgRodzaju(record[pole], wielkoscAparatuSnDotyczy(String(record.device_kind ?? ''), pole));
}
