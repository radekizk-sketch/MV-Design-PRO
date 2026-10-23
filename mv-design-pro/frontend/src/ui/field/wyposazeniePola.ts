/**
 * KARTY W5-C i GPZ-H5-APARATURA — model formularza wyposażenia pola (operacja `set_bay_equipment`).
 *
 * Backend (`enm/wyposazenie_pola.py`, reguły w `enm/sklad_pola.py`) jest jedynym arbitrem reguł:
 * odmawia aparatu bez pozycji katalogowej, pozycji innego rodzaju, pozycji o U_m niewłaściwym
 * dla szyny pola, łącznika spoza pola, gniazda spoza szablonu standardu i rodzaju, którego
 * rodzina rozdzielnicy nie przewiduje — odmowa wraca do formularza z kodem i zdaniem. Ten moduł
 * tylko KSZTAŁTUJE formularz: który rodzaj ma katalog (i jaką przestrzeń), który wskazuje
 * gałąź łącznika, który ma rolę uziemienia. Tablice są lustrem stałych backendu
 * (`PRZESTRZEN_KATALOGU_APARATU`, `RODZAJE_KATALOGOWE_APARATU`, `RODZAJE_BEZ_KATALOGU_SN`,
 * `RODZAJE_Z_GALEZIA`, `RODZAJE_Z_ROLA_UZIEMIENIA`, `NAZWY_RODZAJOW_APARATU_POLA_PL`,
 * `NAZWY_STATUSOW_SKLADU_PL`); zgodność lustra przypina test backendu
 * `tests/enm/test_wyposazenie_pola_lustro_frontu.py`.
 */
import type {
  BayPrimaryDevice,
  BayPrimaryPlacement,
  StatusSkladuPola,
} from '../../types/enm';
import type { RolaUziemnika } from '../../types/uziemienie';

/** Tryby operacji: aparaty z katalogu, szablon pola producenta, szablon pola standardu
 *  (gniazda bez pozycji), obsadzenie wolnych gniazd pozycjami wymagań standardu, usunięcie. */
export type TrybWyposazenia = 'katalog' | 'szablon' | 'standard' | 'wymagania' | 'wyczysc';

export type RodzajAparatuPolaSn =
  | 'CB'
  | 'LOAD_SWITCH'
  | 'DS'
  | 'ES'
  | 'DS_ES'
  | 'CT'
  | 'VT'
  | 'SURGE_ARRESTER'
  | 'VOLTAGE_INDICATOR'
  | 'EARTHING_TRANSFORMER'
  | 'NEUTRAL_REACTOR'
  | 'NEUTRAL_RESISTOR'
  | 'CAPACITOR_BANK'
  | 'FUSE'
  | 'CABLE_HEAD'
  | 'TRANSFORMER_DEVICE';

export type PrzestrzenKatalogu = 'APARAT_SN' | 'CT' | 'VT' | 'OGRANICZNIK_SN' | 'ELEMENT_POLA_SN';

/** Rodzaj aparatu pola → przestrzeń katalogu (`null` = rodzaj bez katalogu aparatów pola). */
export const PRZESTRZEN_KATALOGU_APARATU: Readonly<Record<RodzajAparatuPolaSn, PrzestrzenKatalogu | null>> = {
  CB: 'APARAT_SN',
  LOAD_SWITCH: 'APARAT_SN',
  DS: 'APARAT_SN',
  ES: 'APARAT_SN',
  DS_ES: 'APARAT_SN',
  CT: 'CT',
  VT: 'VT',
  SURGE_ARRESTER: 'OGRANICZNIK_SN',
  VOLTAGE_INDICATOR: 'ELEMENT_POLA_SN',
  EARTHING_TRANSFORMER: 'ELEMENT_POLA_SN',
  NEUTRAL_REACTOR: 'ELEMENT_POLA_SN',
  NEUTRAL_RESISTOR: 'ELEMENT_POLA_SN',
  CAPACITOR_BANK: 'ELEMENT_POLA_SN',
  FUSE: null,
  CABLE_HEAD: null,
  TRANSFORMER_DEVICE: null,
};

/** Rodzaj pozycji katalogu (APARAT_SN: `device_kind`, ELEMENT_POLA_SN: `rodzaj`) dopuszczony
 *  dla rodzaju aparatu pola. */
export const RODZAJE_KATALOGOWE_APARATU: Readonly<Partial<Record<RodzajAparatuPolaSn, readonly string[]>>> = {
  CB: ['REKLOZER', 'WYLACZNIK'],
  LOAD_SWITCH: ['ROZLACZNIK', 'ROZLACZNIK_BEZPIECZNIKOWY'],
  DS: ['ODLACZNIK'],
  ES: ['UZIEMNIK'],
  DS_ES: ['ODLACZNIK_TROJPOLOZENIOWY'],
  VOLTAGE_INDICATOR: ['WSKAZNIK_NAPIECIA'],
  EARTHING_TRANSFORMER: ['TRANSFORMATOR_UZIEMIAJACY'],
  NEUTRAL_REACTOR: ['DLAWIK_GASZACY'],
  NEUTRAL_RESISTOR: ['REZYSTOR_UZIEMIAJACY', 'REZYSTOR_WYMUSZAJACY'],
  CAPACITOR_BANK: ['BATERIA_KONDENSATOROW'],
};

/** Rodzaje wskazujące gałąź łącznikową modelu (`linked_ref`). */
export const RODZAJE_Z_GALEZIA: readonly RodzajAparatuPolaSn[] = ['CB', 'DS', 'DS_ES', 'FUSE', 'LOAD_SWITCH'];
/** Rodzaje z rolą uziemienia (`earthing_role`). */
export const RODZAJE_Z_ROLA_UZIEMIENIA: readonly RodzajAparatuPolaSn[] = ['DS_ES', 'ES', 'SURGE_ARRESTER'];

export const NAZWA_RODZAJU_APARATU_PL: Readonly<Record<RodzajAparatuPolaSn, string>> = {
  CB: 'wyłącznik',
  LOAD_SWITCH: 'rozłącznik',
  DS: 'odłącznik',
  ES: 'uziemnik',
  DS_ES: 'odłącznik trójpołożeniowy (zamknięty / otwarty / uziemiony)',
  CT: 'przekładnik prądowy',
  VT: 'przekładnik napięciowy',
  SURGE_ARRESTER: 'ogranicznik przepięć',
  VOLTAGE_INDICATOR: 'wskaźnik obecności napięcia',
  EARTHING_TRANSFORMER: 'transformator uziemiający',
  NEUTRAL_REACTOR: 'dławik gaszący',
  NEUTRAL_RESISTOR: 'rezystor uziemiający',
  CAPACITOR_BANK: 'bateria kondensatorów',
  FUSE: 'bezpieczniki',
  CABLE_HEAD: 'głowica kablowa',
  TRANSFORMER_DEVICE: 'transformator pola',
};

export const RODZAJE_APARATU_POLA_SN: readonly RodzajAparatuPolaSn[] = [
  'CB',
  'LOAD_SWITCH',
  'DS',
  'ES',
  'DS_ES',
  'CT',
  'VT',
  'SURGE_ARRESTER',
  'VOLTAGE_INDICATOR',
  'EARTHING_TRANSFORMER',
  'NEUTRAL_REACTOR',
  'NEUTRAL_RESISTOR',
  'CAPACITOR_BANK',
  'FUSE',
  'CABLE_HEAD',
  'TRANSFORMER_DEVICE',
];

export const UMIEJSCOWIENIE_PL: Readonly<Record<BayPrimaryPlacement, string>> = {
  UPSTREAM: 'od szyny',
  MIDSTREAM: 'w torze',
  DOWNSTREAM: 'od strony linii',
  OFF_PATH: 'poza torem',
  GROUND_BRANCH: 'odgałęzienie do ziemi',
};

export const UMIEJSCOWIENIA: readonly BayPrimaryPlacement[] = [
  'UPSTREAM',
  'MIDSTREAM',
  'DOWNSTREAM',
  'OFF_PATH',
  'GROUND_BRANCH',
];

/** Status wiersza składu pola — etykieta dla projektanta (lustro `NAZWY_STATUSOW_SKLADU_PL`).
 *  Status nie jest samodzielnym komunikatem: wiersz składu niesie zdanie `opis_pl`. */
export const STATUS_SKLADU_POLA_PL: Readonly<Record<StatusSkladuPola, string>> = {
  ZAPROJEKTOWANE: 'zaprojektowane',
  WYMAGANE_STANDARDEM_BRAK: 'wymagane standardem — brak aparatu z katalogu',
  BRAK_POZYCJI_KATALOGU: 'aparat bez pozycji katalogowej',
  RODZAJ_BEZ_KATALOGU: 'rodzaj bez katalogu (dane elementu modelu)',
  BRAK_TYPU_GRANICA_WN: 'brak typu — łącznik pola 110 kV (granica zasilania sieci SN)',
};

/** Wiersz formularza trybu „z katalogu" (puste napisy = pole niewypełnione). */
export interface WierszAparatu {
  kind: RodzajAparatuPolaSn | '';
  placement: BayPrimaryPlacement | '';
  catalog_ref: string;
  linked_ref: string;
  designation: string;
  earthing_role: RolaUziemnika | '';
  /** Gniazdo szablonu pola standardu (puste = aparat spoza gniazd). */
  gniazdo_ref: string;
}

export const WIERSZ_PUSTY: WierszAparatu = {
  kind: '',
  placement: '',
  catalog_ref: '',
  linked_ref: '',
  designation: '',
  earthing_role: '',
  gniazdo_ref: '',
};

function czyRodzajPolaSn(kind: string): kind is RodzajAparatuPolaSn {
  return (RODZAJE_APARATU_POLA_SN as readonly string[]).includes(kind);
}

/**
 * Wiersze startowe z rekordu pola (`Bay.primary_devices` migawki) — projektant poprawia
 * istniejące wyposażenie zamiast wpisywać je od nowa. Aparat rodzaju spoza pola SN
 * (źródła OZE pola) nie wchodzi do formularza SN.
 */
export function wierszeZAparatow(aparaty: readonly BayPrimaryDevice[] | null | undefined): WierszAparatu[] {
  return (aparaty ?? [])
    .filter((a) => czyRodzajPolaSn(a.kind))
    .map((a) => ({
      kind: a.kind as RodzajAparatuPolaSn,
      placement: a.placement,
      catalog_ref: a.catalog_ref ?? '',
      linked_ref: a.linked_ref ?? '',
      designation: a.designation ?? '',
      earthing_role: a.earthing_role ?? '',
      gniazdo_ref: a.gniazdo_ref ?? '',
    }));
}

/** Zmiana rodzaju czyści pola, których nowy rodzaj nie ma (zero przeniesionych fantomów). */
export function zmienRodzaj(wiersz: WierszAparatu, kind: RodzajAparatuPolaSn | ''): WierszAparatu {
  // Pozycja katalogowa opisuje konkretny rodzaj aparatu — po zmianie rodzaju nie pasuje.
  return {
    ...wiersz,
    kind,
    catalog_ref: kind === wiersz.kind ? wiersz.catalog_ref : '',
    linked_ref: kind && RODZAJE_Z_GALEZIA.includes(kind) ? wiersz.linked_ref : '',
    earthing_role: kind && RODZAJE_Z_ROLA_UZIEMIENIA.includes(kind) ? wiersz.earthing_role : '',
  };
}

/** Ładunek `set_bay_equipment` — pola puste pomijane (backend: brak = dana niedostarczona). */
export function zbudujPayloadWyposazenia(
  bayRef: string,
  tryb: TrybWyposazenia,
  wiersze: readonly WierszAparatu[],
  szablonRef: string,
  szablonStandarduRef = '',
): Record<string, unknown> {
  if (tryb === 'wyczysc') return { bay_ref: bayRef, mode: 'wyczysc' };
  if (tryb === 'wymagania') return { bay_ref: bayRef, mode: 'wymagania' };
  if (tryb === 'szablon') {
    const ref = szablonRef.trim();
    return { bay_ref: bayRef, mode: 'szablon', ...(ref ? { bay_template_ref: ref } : {}) };
  }
  if (tryb === 'standard') {
    const ref = szablonStandarduRef.trim();
    return { bay_ref: bayRef, mode: 'standard', ...(ref ? { szablon_standardu_ref: ref } : {}) };
  }
  return {
    bay_ref: bayRef,
    mode: 'katalog',
    devices: wiersze.map((w) => {
      // Puste umiejscowienie pomijane: aparat w gnieździe standardu bierze je z gniazda.
      const aparat: Record<string, unknown> = { kind: w.kind };
      if (w.placement) aparat.placement = w.placement;
      if (w.catalog_ref.trim()) aparat.catalog_ref = w.catalog_ref.trim();
      if (w.linked_ref.trim()) aparat.linked_ref = w.linked_ref.trim();
      if (w.designation.trim()) aparat.designation = w.designation.trim();
      if (w.earthing_role) aparat.earthing_role = w.earthing_role;
      if (w.gniazdo_ref.trim()) aparat.gniazdo_ref = w.gniazdo_ref.trim();
      return aparat;
    }),
  };
}

/** Wiersz kompletny w sensie KSZTAŁTU (rodzaj + umiejscowienie); reguły ocenia backend. */
export function czyWierszKompletny(w: WierszAparatu): boolean {
  // Aparat w gnieździe standardu bierze umiejscowienie z gniazda (dana standardu, backend).
  return w.kind !== '' && (w.placement !== '' || w.gniazdo_ref !== '');
}
