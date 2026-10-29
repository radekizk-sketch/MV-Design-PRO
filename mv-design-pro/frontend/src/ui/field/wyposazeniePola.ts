/**
 * KARTA W5-C — model formularza wyposażenia pola SN (operacja `set_bay_equipment`).
 *
 * Backend (`enm/wyposazenie_pola.py`) jest jedynym arbitrem reguł: odmawia aparatu bez
 * pozycji katalogowej, pozycji innego rodzaju, łącznika spoza pola i rodzaju, którego rodzina
 * rozdzielnicy nie przewiduje — odmowa wraca do formularza z kodem i zdaniem. Ten moduł
 * tylko KSZTAŁTUJE formularz: który rodzaj ma katalog (i jaką przestrzeń), który wskazuje
 * gałąź łącznika, który ma rolę uziemienia. Tablice są lustrem stałych backendu
 * (`PRZESTRZEN_KATALOGU_APARATU`, `RODZAJE_KATALOGOWE_APARATU`, `RODZAJE_BEZ_KATALOGU_SN`,
 * `RODZAJE_Z_GALEZIA`, `RODZAJE_Z_ROLA_UZIEMIENIA`, `NAZWY_RODZAJOW_APARATU_POLA_PL`);
 * zgodność lustra przypina test backendu `tests/enm/test_wyposazenie_pola_lustro_frontu.py`.
 */
import type {
  BayPrimaryDevice,
  BayPrimaryPlacement,
  KlasaPolaLiniowego,
  StanDanychWyposazenia,
  StanObiektu,
} from '../../types/enm';
import type { RolaUziemnika } from '../../types/uziemienie';

export type TrybWyposazenia = 'katalog' | 'szablon' | 'wyczysc';

export type RodzajAparatuPolaSn =
  | 'CB'
  | 'LOAD_SWITCH'
  | 'DS'
  | 'ES'
  | 'CT'
  | 'VT'
  | 'SURGE_ARRESTER'
  | 'FUSE'
  | 'CABLE_HEAD'
  | 'TRANSFORMER_DEVICE'
  | 'THREE_POSITION_SWITCH'
  | 'VOLTAGE_INDICATOR'
  | 'CORE_BALANCE_CT';

export type PrzestrzenKatalogu = 'APARAT_SN' | 'CT' | 'VT' | 'OGRANICZNIK_SN';

/** Rodzaj aparatu pola SN → przestrzeń katalogu (`null` = rodzaj bez katalogu SN). */
export const PRZESTRZEN_KATALOGU_APARATU: Readonly<Record<RodzajAparatuPolaSn, PrzestrzenKatalogu | null>> = {
  CB: 'APARAT_SN',
  LOAD_SWITCH: 'APARAT_SN',
  DS: 'APARAT_SN',
  ES: 'APARAT_SN',
  CT: 'CT',
  VT: 'VT',
  SURGE_ARRESTER: 'OGRANICZNIK_SN',
  FUSE: null,
  CABLE_HEAD: null,
  TRANSFORMER_DEVICE: null,
  THREE_POSITION_SWITCH: null,
  VOLTAGE_INDICATOR: null,
  CORE_BALANCE_CT: null,
};

/** Rodzaj aparatu APARAT_SN (`device_kind` pozycji) dopuszczony dla rodzaju aparatu pola. */
export const RODZAJE_KATALOGOWE_APARATU: Readonly<Partial<Record<RodzajAparatuPolaSn, readonly string[]>>> = {
  CB: ['REKLOZER', 'WYLACZNIK'],
  LOAD_SWITCH: ['ROZLACZNIK', 'ROZLACZNIK_BEZPIECZNIKOWY'],
  DS: ['ODLACZNIK'],
  ES: ['UZIEMNIK'],
};

/** Rodzaje wskazujące gałąź łącznikową modelu (`linked_ref`). */
export const RODZAJE_Z_GALEZIA: readonly RodzajAparatuPolaSn[] = ['CB', 'DS', 'FUSE', 'LOAD_SWITCH'];
/** Rodzaje z rolą uziemienia (`earthing_role`). */
export const RODZAJE_Z_ROLA_UZIEMIENIA: readonly RodzajAparatuPolaSn[] = ['ES', 'SURGE_ARRESTER'];

export const NAZWA_RODZAJU_APARATU_PL: Readonly<Record<RodzajAparatuPolaSn, string>> = {
  CB: 'wyłącznik',
  LOAD_SWITCH: 'rozłącznik',
  DS: 'odłącznik',
  ES: 'uziemnik',
  CT: 'przekładnik prądowy',
  VT: 'przekładnik napięciowy',
  SURGE_ARRESTER: 'ogranicznik przepięć',
  FUSE: 'bezpieczniki',
  CABLE_HEAD: 'głowica kablowa',
  TRANSFORMER_DEVICE: 'transformator pola',
  THREE_POSITION_SWITCH: 'łącznik trójpołożeniowy',
  VOLTAGE_INDICATOR: 'wskaźnik napięcia',
  CORE_BALANCE_CT: 'przekładnik Ferrantiego',
};

export const RODZAJE_APARATU_POLA_SN: readonly RodzajAparatuPolaSn[] = [
  'CB',
  'LOAD_SWITCH',
  'DS',
  'ES',
  'CT',
  'VT',
  'SURGE_ARRESTER',
  'FUSE',
  'CABLE_HEAD',
  'TRANSFORMER_DEVICE',
  'THREE_POSITION_SWITCH',
  'VOLTAGE_INDICATOR',
  'CORE_BALANCE_CT',
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

export const STAN_DANYCH_WYPOSAZENIA_PL: Readonly<Record<StanDanychWyposazenia, string>> = {
  MODEL: 'Dane z katalogu — każdy aparat ma pozycję katalogową',
  PROPOZYCJA: 'Propozycja — część aparatów to wartości robocze (jakość: szacowana)',
  BRAK_DANYCH: 'Brak danych — pole nie ma aparatów w modelu',
};

/** Wiersz formularza trybu „z katalogu" (puste napisy = pole niewypełnione). */
export interface WierszAparatu {
  kind: RodzajAparatuPolaSn | '';
  placement: BayPrimaryPlacement | '';
  catalog_ref: string;
  linked_ref: string;
  designation: string;
  earthing_role: RolaUziemnika | '';
  /**
   * Stan obiektu instancji podany JAWNIE (decyzja projektanta: inwentaryzacja aparatu zastanego
   * w polu istniejącym). `''` = reguła backendu (`enm.pola.aparaty_po_wymianie`): aparat
   * niezmieniony zachowuje stan, nowy albo wymieniony jest projektowany.
   */
  stan_obiektu: StanObiektu | '';
  /**
   * Odgałęzienie toru (`BayPrimaryDevice.odgalezienie`, np. 'pn'); `''` = aparat toru głównego.
   * Porty aparatu wyprowadza z niego backend (`rodzaje_aparatury.porty_toru_pola`) — ponowny
   * zapis pola z odgałęzieniem przekładnika napięciowego odtwarza te same porty.
   */
  odgalezienie: string;
}

export const WIERSZ_PUSTY: WierszAparatu = {
  kind: '',
  placement: '',
  catalog_ref: '',
  linked_ref: '',
  designation: '',
  earthing_role: '',
  stan_obiektu: '',
  odgalezienie: '',
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
      // Stan rekordu NIE wraca do ładunku jawnie — aparat niezmieniony zachowuje go po stronie
      // backendu, a zmieniony (wymieniony) musi stać się projektowany.
      stan_obiektu: '',
      odgalezienie: a.odgalezienie ?? '',
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

/** Zmiana klasy pola liniowego w ładunku: `zmien=false` — klucz pominięty (klasa bez zmian). */
export interface ZmianaKlasyPola {
  readonly zmien: boolean;
  readonly wartosc: KlasaPolaLiniowego | null;
}

export const BEZ_ZMIANY_KLASY: ZmianaKlasyPola = { zmien: false, wartosc: null };

/** Klasy pola liniowego SN — lustro `bay_templates.KLASY_POLA_LINIOWEGO` / `NAZWY_KLASY_POLA_PL`
 *  (parytet przypina `tests/enm/test_wyposazenie_pola_lustro_frontu.py`). */
export const KLASY_POLA_LINIOWEGO: readonly KlasaPolaLiniowego[] = ['ODBIORCZE', 'MIESZANE', 'DEDYKOWANE_WYTWORCY'];

export const NAZWA_KLASY_POLA_PL: Readonly<Record<KlasaPolaLiniowego, string>> = {
  ODBIORCZE: 'pole odbiorcze (bez modułów wytwarzania)',
  MIESZANE: 'pole linii mieszanej (moduły wytwarzania i odbiorcy)',
  DEDYKOWANE_WYTWORCY: 'pole dedykowane modułom wytwarzania',
};

/** Ładunek `set_bay_equipment` — pola puste pomijane (backend: brak = dana niedostarczona). */
export function zbudujPayloadWyposazenia(
  bayRef: string,
  tryb: TrybWyposazenia,
  wiersze: readonly WierszAparatu[],
  szablonRef: string,
  klasa: ZmianaKlasyPola = BEZ_ZMIANY_KLASY,
): Record<string, unknown> {
  // Klasa pola liniowego (`Bay.klasa_pola`): klucz obecny = ustaw (null = wyczyść), brak = bez
  // zmiany — ten sam kontrakt co operacja `set_bay_equipment`.
  const zKlasa = klasa.zmien ? { klasa_pola: klasa.wartosc } : {};
  if (tryb === 'wyczysc') return { bay_ref: bayRef, mode: 'wyczysc', ...zKlasa };
  if (tryb === 'szablon') {
    const ref = szablonRef.trim();
    return { bay_ref: bayRef, mode: 'szablon', ...(ref ? { bay_template_ref: ref } : {}), ...zKlasa };
  }
  return {
    bay_ref: bayRef,
    mode: 'katalog',
    ...zKlasa,
    devices: wiersze.map((w) => {
      const aparat: Record<string, unknown> = { kind: w.kind, placement: w.placement };
      if (w.catalog_ref.trim()) aparat.catalog_ref = w.catalog_ref.trim();
      if (w.linked_ref.trim()) aparat.linked_ref = w.linked_ref.trim();
      if (w.designation.trim()) aparat.designation = w.designation.trim();
      if (w.earthing_role) aparat.earthing_role = w.earthing_role;
      if (w.stan_obiektu) aparat.stan_obiektu = w.stan_obiektu;
      if (w.odgalezienie.trim()) aparat.odgalezienie = w.odgalezienie.trim();
      return aparat;
    }),
  };
}

/** Wiersz kompletny w sensie KSZTAŁTU (rodzaj + umiejscowienie); reguły ocenia backend. */
export function czyWierszKompletny(w: WierszAparatu): boolean {
  return w.kind !== '' && w.placement !== '';
}
