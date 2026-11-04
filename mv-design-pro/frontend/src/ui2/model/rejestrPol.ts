/**
 * Rejestr pól edytowalnych modelu — JEDNA definicja pola dla każdego wejścia edycji.
 *
 * PO CO (karta JEDNA-SCIEZKA-EDYCJI). Model ENM jest jedyną prawdą, operacja domenowa —
 * jedyną drogą zapisu. Te same pola (długość odcinka, nazwa, zaczep transformatora, cos φ
 * odbioru…) edytowało kilka wejść z RÓŻNĄ walidacją: siatka właściwości (długość ≤ 500 km),
 * kreator magistrali (długość > 0 m), karta odcinka SN (bez walidacji i bez zapisu). Każde
 * wejście (siatka właściwości, karta odcinka, konfigurator stacji, kreator edycji parametrów)
 * czyta TEN moduł: etykietę, jednostkę wyświetlania, walidację, odczyt wartości z modelu
 * i budowę zapisu (operacja + ładunek).
 *
 * Klucze zapisu są przypięte do kontraktu backendu: fikstura
 * `harness-fixtures/generated/rejestr_pol_edycji.json` (eksport listy dopuszczonych
 * parametrów `update_element_parameters` i kontraktu pól kolekcji) — test rejestru sprawdza,
 * że żadne pole nie wysyła klucza, który operacja odrzuca kodem `params.key_not_allowed`.
 *
 * ZERO FIZYKI: przeliczenie jednostki wyświetlania (km ↔ m) to zmiana skali, a cos φ odbioru
 * zamienia na moc bierną backend (`update_element_parameters`, Q = P·tg φ).
 */

import kontraktPolEdycji from '../../harness-fixtures/generated/rejestr_pol_edycji.json';
import type { CanonicalOpName } from '../../types/domainOps';

/** Kolekcje modelu ENM, których pola edytuje interfejs. */
export type KolekcjaModelu =
  | 'branches'
  | 'transformers'
  | 'loads'
  | 'sources'
  | 'buses'
  | 'generators'
  | 'substations';

/** Zapis pola: operacja domenowa i jej ładunek (zawsze przez `executeDomainOperation`). */
export interface ZapisPola {
  readonly operacja: CanonicalOpName;
  readonly ladunek: Record<string, unknown>;
}

/** Element modelu w postaci surowego rekordu migawki. */
export type RekordModelu = Readonly<Record<string, unknown>>;

export interface DefinicjaPola {
  /** Identyfikator pola w rejestrze (klucz kontrolki). */
  readonly id: string;
  readonly kolekcja: KolekcjaModelu;
  readonly etykieta: string;
  /** Jednostka wartości na ekranie (np. „m"), `null` = bezwymiarowa. */
  readonly jednostka: string | null;
  /** Klucze `parameters` operacji, które pole może wysłać (przypięte do kontraktu backendu). */
  readonly kluczeZapisu: readonly string[];
  /** Wartość na ekranie z rekordu modelu (`null` = model jej nie niesie). */
  readonly odczyt: (element: RekordModelu) => number | string | null;
  /** Komunikat odmowy wartości ekranu albo `null` (wartość poprawna). */
  readonly waliduj: (wartosc: unknown) => string | null;
  /** Zapis wartości ekranu jako operacja modelu. */
  readonly zapis: (elementRef: string, wartosc: unknown, element: RekordModelu) => ZapisPola;
}

function liczba(wartosc: unknown): number | null {
  return typeof wartosc === 'number' && Number.isFinite(wartosc) ? wartosc : null;
}

function rekord(wartosc: unknown): RekordModelu | null {
  return typeof wartosc === 'object' && wartosc !== null && !Array.isArray(wartosc)
    ? (wartosc as RekordModelu)
    : null;
}

function aktualizacja(elementRef: string, parameters: Record<string, unknown>): ZapisPola {
  return { operacja: 'update_element_parameters', ladunek: { element_ref: elementRef, parameters } };
}

/** Długość odcinka: model niesie km, ekran pokazuje metry (skala 1000, bez fizyki). */
const METRY_W_KM = 1000;

export const POLE_DLUGOSC_ODCINKA: DefinicjaPola = {
  id: 'dlugosc_odcinka',
  kolekcja: 'branches',
  etykieta: 'Długość trasy',
  jednostka: 'm',
  kluczeZapisu: ['length_km'],
  odczyt: (element) => {
    const km = liczba(element.length_km);
    return km === null ? null : Math.round(km * METRY_W_KM * 1000) / 1000;
  },
  // Ta sama dziedzina co operacja (`update_element_parameters`, `length_km > 0`) i tworzenie
  // odcinka (`dlugosc_m > 0`) — bez górnej granicy, której model nie zna.
  waliduj: (wartosc) =>
    liczba(wartosc) !== null && (wartosc as number) > 0
      ? null
      : 'Długość odcinka musi być liczbą większą od zera.',
  zapis: (elementRef, wartosc) =>
    aktualizacja(elementRef, { length_km: (wartosc as number) / METRY_W_KM }),
};

/** Ta sama długość w kilometrach (siatka właściwości). Jedna walidacja, jedna operacja. */
export const POLE_DLUGOSC_ODCINKA_KM: DefinicjaPola = {
  ...POLE_DLUGOSC_ODCINKA,
  id: 'dlugosc_odcinka_km',
  etykieta: 'Długość',
  jednostka: 'km',
  odczyt: (element) => liczba(element.length_km),
  zapis: (elementRef, wartosc) => aktualizacja(elementRef, { length_km: wartosc as number }),
};

export function polaNazwy(kolekcja: KolekcjaModelu): DefinicjaPola {
  return {
    id: `nazwa_${kolekcja}`,
    kolekcja,
    etykieta: 'Nazwa',
    jednostka: null,
    kluczeZapisu: ['name'],
    odczyt: (element) => (typeof element.name === 'string' ? element.name : null),
    waliduj: (wartosc) =>
      typeof wartosc === 'string' && wartosc.trim() !== '' ? null : 'Nazwa nie może być pusta.',
    zapis: (elementRef, wartosc) => aktualizacja(elementRef, { name: (wartosc as string).trim() }),
  };
}

/** Stan łączeniowy odcinka linii/kabla (gałąź wyłączona z ruchu = `status: open`). */
export const POLE_STAN_ODCINKA: DefinicjaPola = {
  id: 'stan_odcinka',
  kolekcja: 'branches',
  etykieta: 'Stan łączeniowy',
  jednostka: null,
  kluczeZapisu: ['status'],
  odczyt: (element) => (element.status === 'open' ? 'open' : 'closed'),
  waliduj: (wartosc) =>
    wartosc === 'open' || wartosc === 'closed' ? null : 'Stan odcinka: załączony albo wyłączony.',
  zapis: (elementRef, wartosc) => aktualizacja(elementRef, { status: wartosc }),
};

/**
 * Położenie łącznika — WYŁĄCZNIE operacje otwarcia i zamknięcia (backend odmawia zmiany
 * `status` łącznika korektą parametrów kodem `switch.state_via_operation`).
 */
export const POLE_POLOZENIE_LACZNIKA: DefinicjaPola = {
  id: 'polozenie_lacznika',
  kolekcja: 'branches',
  etykieta: 'Położenie',
  jednostka: null,
  kluczeZapisu: [],
  odczyt: (element) => (element.status === 'open' ? 'open' : 'closed'),
  waliduj: (wartosc) =>
    wartosc === 'open' || wartosc === 'closed' ? null : 'Położenie: zamknięty albo otwarty.',
  zapis: (elementRef, wartosc) => ({
    operacja: wartosc === 'open' ? 'open_switch' : 'close_switch',
    ladunek: { switch_ref: elementRef },
  }),
};

/**
 * Pozycja zaczepu transformatora — kanonem jest podzespół `tap_changer` (V12K-045); gdy
 * transformator go nie ma, pozycja żyje w polu `tap_position`. Jedno pole na ekranie,
 * zapis tam, gdzie model ją trzyma (backend sprawdza zakres bramą `_blad_zaczepow`).
 */
export const POLE_ZACZEP_TRANSFORMATORA: DefinicjaPola = {
  id: 'zaczep_transformatora',
  kolekcja: 'transformers',
  etykieta: 'Pozycja zaczepu',
  jednostka: null,
  kluczeZapisu: ['tap_changer', 'tap_position'],
  odczyt: (element) => {
    const zaczepy = rekord(element.tap_changer);
    return zaczepy ? liczba(zaczepy.current_position) : liczba(element.tap_position);
  },
  waliduj: (wartosc) =>
    Number.isInteger(wartosc) ? null : 'Pozycja zaczepu musi być liczbą całkowitą.',
  zapis: (elementRef, wartosc, element) => {
    const zaczepy = rekord(element.tap_changer);
    return zaczepy
      ? aktualizacja(elementRef, { tap_changer: { ...zaczepy, current_position: wartosc } })
      : aktualizacja(elementRef, { tap_position: wartosc });
  },
};

/** Przełącznik zaczepów z katalogu — backend materializuje podzespół z pozycji katalogu. */
export const POLE_PRZELACZNIK_ZACZEPOW: DefinicjaPola = {
  id: 'przelacznik_zaczepow',
  kolekcja: 'transformers',
  etykieta: 'Przełącznik zaczepów (z katalogu)',
  jednostka: null,
  kluczeZapisu: ['tap_changer'],
  odczyt: (element) => {
    const zaczepy = rekord(element.tap_changer);
    return zaczepy && typeof zaczepy.catalog_ref === 'string' ? zaczepy.catalog_ref : null;
  },
  waliduj: () => null,
  zapis: (elementRef, wartosc, element) => {
    if (typeof wartosc !== 'string' || wartosc === '') {
      return aktualizacja(elementRef, { tap_changer: null });
    }
    // Pozycja bieżąca zostaje (gdy mieści się w zakresie nowego przełącznika — sprawdza backend).
    const zaczepy = rekord(element.tap_changer);
    const pozycja = zaczepy ? liczba(zaczepy.current_position) : null;
    return aktualizacja(elementRef, {
      tap_changer: pozycja === null ? { catalog_ref: wartosc } : { catalog_ref: wartosc, current_position: pozycja },
    });
  },
};

/** Opis warunków ułożenia kabla SN w modelu (`meta.cable_laying_conditions`). */
export interface WarunkiUlozeniaKabla {
  readonly set_name: string;
  readonly f_grunt?: number;
  readonly f_wiazka?: number;
  readonly f_grupa?: number;
  readonly opis_pl?: string;
}

/** Warunki ułożenia zapisane w modelu odcinka albo `null` (warunki katalogowe). */
export function warunkiUlozeniaZModelu(element: RekordModelu): WarunkiUlozeniaKabla | null {
  const meta = rekord(element.meta);
  const warunki = meta ? rekord(meta.cable_laying_conditions) : null;
  return warunki && typeof warunki.set_name === 'string'
    ? (warunki as unknown as WarunkiUlozeniaKabla)
    : null;
}

/**
 * Warunki ułożenia kabla SN (nazwany zestaw albo współczynniki własne z opisem) — backend
 * waliduje zestaw tym samym parserem co kreator źródła OZE, odmawia dla linii napowietrznej
 * i odcinka nN (`cable.laying_conditions_*`). Wartość ekranu: obiekt opisu albo `null`
 * (warunki katalogowe — model nie niesie wartości domyślnej).
 */
export const POLE_WARUNKI_ULOZENIA_KABLA: DefinicjaPola = {
  id: 'warunki_ulozenia_kabla',
  kolekcja: 'branches',
  etykieta: 'Warunki ułożenia kabla',
  jednostka: null,
  kluczeZapisu: ['cable_laying_conditions'],
  odczyt: (element) => warunkiUlozeniaZModelu(element)?.set_name ?? null,
  waliduj: (wartosc) => {
    if (wartosc === null) return null;
    const opis = rekord(wartosc);
    if (!opis || typeof opis.set_name !== 'string' || opis.set_name === '') {
      return 'Wybierz zestaw warunków ułożenia.';
    }
    for (const klucz of ['f_grunt', 'f_wiazka', 'f_grupa'] as const) {
      if (opis[klucz] !== undefined && !(liczba(opis[klucz]) !== null && (opis[klucz] as number) > 0)) {
        return 'Współczynnik obciążalności musi być liczbą większą od zera.';
      }
    }
    return null;
  },
  zapis: (elementRef, wartosc) => aktualizacja(elementRef, { cable_laying_conditions: wartosc }),
};

/** cos φ odbioru — parametr operacji (backend wyznacza Q z P), nie pole modelu. */
export const POLE_COS_PHI_ODBIORU: DefinicjaPola = {
  id: 'cos_phi_odbioru',
  kolekcja: 'loads',
  etykieta: 'Współczynnik mocy cos φ',
  jednostka: null,
  kluczeZapisu: ['cos_phi'],
  // Model nie niesie cos φ; obliczenie go z P i Q w interfejsie byłoby fizyką.
  odczyt: () => null,
  waliduj: (wartosc) =>
    liczba(wartosc) !== null && (wartosc as number) > 0 && (wartosc as number) <= 1
      ? null
      : 'cos φ musi być liczbą z przedziału (0; 1].',
  zapis: (elementRef, wartosc) => aktualizacja(elementRef, { cos_phi: wartosc }),
};

/** Pole liczbowe zapisywane wprost pod kluczem modelu (wartość ekranu = wartość modelu). */
export function poleLiczbowe(
  kolekcja: KolekcjaModelu,
  klucz: string,
  etykieta: string,
  jednostka: string | null,
  waliduj: (wartosc: unknown) => string | null,
): DefinicjaPola {
  return {
    id: `${kolekcja}.${klucz}`,
    kolekcja,
    etykieta,
    jednostka,
    kluczeZapisu: [klucz],
    odczyt: (element) => liczba(element[klucz]),
    waliduj,
    zapis: (elementRef, wartosc) => aktualizacja(elementRef, { [klucz]: wartosc }),
  };
}

const dodatnia = (opis: string) => (wartosc: unknown): string | null =>
  liczba(wartosc) !== null && (wartosc as number) > 0 ? null : `${opis} musi być liczbą większą od zera.`;
const dodatniaAlboBrak = (opis: string) => (wartosc: unknown): string | null =>
  wartosc === null || (liczba(wartosc) !== null && (wartosc as number) > 0)
    ? null
    : `${opis} musi być liczbą większą od zera albo pozostać pusta.`;
const dowolnaLiczba = (opis: string) => (wartosc: unknown): string | null =>
  liczba(wartosc) !== null ? null : `${opis} musi być liczbą.`;

/**
 * Pola siatki właściwości wg typu elementu siatki → definicja rejestru. Klucz kontrolki
 * siatki jest identyfikatorem w tej mapie; pole spoza mapy jest odczytem (nie da się go
 * zmienić z siatki — test siatki to pilnuje).
 */
export const POLA_SIATKI: Readonly<Record<string, Readonly<Record<string, DefinicjaPola>>>> = {
  Bus: {
    name: polaNazwy('buses'),
    voltage_kv: poleLiczbowe('buses', 'voltage_kv', 'Napięcie znamionowe', 'kV', dodatnia('Napięcie znamionowe')),
  },
  LineBranch: {
    name: polaNazwy('branches'),
    status: POLE_STAN_ODCINKA,
    length_km: POLE_DLUGOSC_ODCINKA_KM,
  },
  TransformerBranch: {
    name: polaNazwy('transformers'),
    tap_position: POLE_ZACZEP_TRANSFORMATORA,
  },
  Switch: {
    name: polaNazwy('branches'),
    status: POLE_POLOZENIE_LACZNIKA,
  },
  Source: {
    name: polaNazwy('sources'),
    sk3_mva: poleLiczbowe('sources', 'sk3_mva', 'Moc zwarciowa Sk"', 'MVA', dodatnia('Moc zwarciowa')),
    rx_ratio: poleLiczbowe('sources', 'rx_ratio', 'Stosunek R/X', null, dodatnia('Stosunek R/X')),
    sn_voltage_kv: poleLiczbowe('sources', 'sn_voltage_kv', 'Napięcie znamionowe Un', 'kV', dodatnia('Napięcie znamionowe')),
    sk3_min_mva: poleLiczbowe('sources', 'sk3_min_mva', 'Moc zwarciowa Sk"min', 'MVA', dodatniaAlboBrak('Moc zwarciowa MIN')),
    ik3_min_ka: poleLiczbowe('sources', 'ik3_min_ka', 'Prąd zwarciowy Ik"min', 'kA', dodatniaAlboBrak('Prąd zwarciowy MIN')),
    rx_ratio_min: poleLiczbowe('sources', 'rx_ratio_min', 'Stosunek R/X (MIN)', null, dodatniaAlboBrak('Stosunek R/X MIN')),
    u_set_pu: poleLiczbowe('sources', 'u_set_pu', 'Napięcie zadane szyny bilansującej', 'pu', (wartosc) =>
      wartosc === null || (liczba(wartosc) !== null && (wartosc as number) >= 0.8 && (wartosc as number) <= 1.2)
        ? null
        : 'Napięcie zadane musi leżeć w paśmie 0,8–1,2 p.u.'),
  },
  Load: {
    name: polaNazwy('loads'),
    p_mw: poleLiczbowe('loads', 'p_mw', 'Moc czynna P', 'MW', dowolnaLiczba('Moc czynna')),
    q_mvar: poleLiczbowe('loads', 'q_mvar', 'Moc bierna Q', 'Mvar', dowolnaLiczba('Moc bierna')),
    cos_phi: POLE_COS_PHI_ODBIORU,
  },
};

/** Definicja pola siatki albo `null` (pole tylko do odczytu). */
export function definicjaPolaSiatki(typElementu: string, klucz: string): DefinicjaPola | null {
  return POLA_SIATKI[typElementu]?.[klucz] ?? null;
}

/**
 * Klucze, które `update_element_parameters` przyjmuje dla kolekcji — z eksportu backendu
 * (`rejestr_pol_edycji.json`: lista dopuszczonych parametrów, kontrakt pól kolekcji
 * i parametry samej operacji), bez kluczy tożsamości (`id`, `ref_id`), których zmiana
 * nie jest edycją parametru.
 */
export function kluczeDopuszczoneKolekcji(kolekcja: string): readonly string[] {
  const kontrakt = kontraktPolEdycji as {
    kolekcje_z_lista: Record<string, readonly string[]>;
    kolekcje_z_kontraktem: Record<string, readonly string[]>;
    parametry_operacji: Record<string, readonly string[]>;
  };
  const klucze = new Set([
    ...(kontrakt.kolekcje_z_lista[kolekcja] ?? []),
    ...(kontrakt.kolekcje_z_kontraktem[kolekcja] ?? []),
    ...(kontrakt.parametry_operacji[kolekcja] ?? []),
  ]);
  klucze.delete('id');
  klucze.delete('ref_id');
  return [...klucze].sort();
}

/** Kolekcja modelu, w której leży element (`ref_id`), albo `null` — elementu nie ma w modelu. */
export function kolekcjaElementu(model: unknown, elementRef: string): string | null {
  const migawka = rekord(model);
  if (!migawka || !elementRef) return null;
  for (const kolekcja of Object.keys(migawka).sort()) {
    const lista = migawka[kolekcja];
    if (!Array.isArray(lista)) continue;
    if (lista.some((el) => rekord(el)?.ref_id === elementRef)) return kolekcja;
  }
  return null;
}
