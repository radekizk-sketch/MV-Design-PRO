/**
 * REJESTR SYMBOLI nN — ODWZOROWANIE MODELU NA SYMBOLE CAD (R2 §4–§12, §18,
 * §19): JEDNO źródło prawdy „jaki symbol CAD, dla jakiego elementu ENM, jaką
 * niesie klasę oznaczenia i nazwę polską".
 *
 * Geometria symboli żyje WYŁĄCZNIE w `cad/cadSymbolRegistry.ts`
 * (`ELECTRICAL_CAD_SYMBOL_REGISTRY`); ten moduł nie zna prymitywów — mówi,
 * KTÓRY symbol wynika z DANYCH:
 *
 *  • typ gałęzi ENM (`LvDeviceType`) rozstrzyga rodzinę: breaker →
 *    wyłącznik, disconnector → odłącznik, switch → rozłącznik, fuse →
 *    bezpiecznik, cable/line → przewód bez symbolu;
 *  • klasa funkcjonalna wyrobu z katalogu (`device_kind` z
 *    `materialized_params`) DOPRECYZOWUJE: switch + ROZLACZNIK_BEZPIECZNIKOWY
 *    → rozłącznik bezpiecznikowy; bus_coupler + WYLACZNIK/ROZLACZNIK/ODLACZNIK/
 *    ROZLACZNIK_BEZPIECZNIKOWY → symbol REALNEGO aparatu sprzęgła (§6);
 *    bus_coupler bez klasy → łącznik ogólny (audyt NN-AUD-18 z backendu).
 *
 * Stan łączeniowy niesie WYŁĄCZNIE geometria noża symbolu (`nosnikStanu:
 * 'noz'`); wypełnienie jako nośnik stanu jest zakazane (§14). Elementy bez
 * stanu (`'brak'`): wkładka, kabel, linia.
 *
 * Terminologia (§18): nazwy polskie pochodzą z rejestru CAD (WYŁĄCZNIK,
 * ROZŁĄCZNIK, ODŁĄCZNIK, BEZPIECZNIK, ŁĄCZNIK SZYN, PRZEKŁADNIK PRĄDOWY /
 * NAPIĘCIOWY, TRANSFORMATOR, FALOWNIK, MAGAZYN ENERGII, ODBIÓR); QF / QS / FU /
 * QBC / CT / VT są IDENTYFIKATORAMI (klasą oznaczenia), nie nazwami.
 *
 * Pin: `__tests__/symbolRegistry.test.tsx` — iloczyn „typ gałęzi ×
 * device_kind" → symbol, nazwa, klasa; znaki funkcji IEC.
 */
import { ELECTRICAL_CAD_SYMBOL_REGISTRY, type CadSymbolId } from '../cad/cadSymbolRegistry';
import type { LvDeviceType, LvDomainGenerator, LvDomainMeasurement } from './types';

export type NosnikStanu = 'noz' | 'brak';

export type KlasaOznaczenia = 'QF' | 'QS' | 'FU' | 'QBC' | 'W';

export interface WpisRejestruSymbolu {
  /** Symbol CAD; `null` = przewód (bez symbolu). */
  readonly symbolId: CadSymbolId | null;
  /** Klasa oznaczenia (IEC 81346 / zwyczaj polski) — prefiks na tabliczce. */
  readonly klasaOznaczenia: KlasaOznaczenia;
  /** Nazwa polska elementu (z rejestru CAD; przewody — własna). */
  readonly nazwaPl: string;
  /** Zaciski urządzenia (gałąź ma zawsze dwa: A = from_bus, B = to_bus). */
  readonly terminale: readonly ['a', 'b'];
  readonly nosnikStanu: NosnikStanu;
  /** Rodzaj slotu ekranowego — z `visualGrammar.SYMBOL_SLOT_SHARE`. */
  readonly rozmiar: 'aparat' | 'sprzeglo' | 'przewod';
}

/** Klasy funkcjonalne wyrobu z katalogu (`device_kind`) → symbol CAD.
 *  Lista ZAMKNIĘTA — rodzaj spoza listy = „katalog nie klasyfikuje" (bez
 *  domysłu; typ gałęzi rozstrzyga sam). */
const SYMBOL_PO_DEVICE_KIND: Readonly<Record<string, CadSymbolId>> = {
  WYLACZNIK: 'cad.wylacznik',
  WYLACZNIK_GLOWNY: 'cad.wylacznik',
  WYLACZNIK_ODPLYWOWY: 'cad.wylacznik',
  REKLOZER: 'cad.wylacznik',
  ROZLACZNIK: 'cad.rozlacznik',
  ROZLACZNIK_BEZPIECZNIKOWY: 'cad.rozlacznikBezpiecznikowy',
  ODLACZNIK: 'cad.odlacznik',
};

const KLASA_PO_TYPIE: Readonly<Record<LvDeviceType, KlasaOznaczenia>> = {
  breaker: 'QF',
  bus_coupler: 'QBC',
  switch: 'QS',
  disconnector: 'QS',
  fuse: 'FU',
  cable: 'W',
  line_overhead: 'W',
};

const NAZWA_PRZEWODU: Readonly<Record<'cable' | 'line_overhead', string>> = {
  cable: 'Kabel',
  line_overhead: 'Linia napowietrzna',
};

function normalizujKind(deviceKind: string | null | undefined): string | null {
  const k = (deviceKind ?? '').trim().toUpperCase();
  return k.length > 0 ? k : null;
}

/** Symbol CAD aparatu z DANYCH (typ gałęzi × klasa funkcjonalna wyrobu). */
export function symbolAparatu(deviceType: LvDeviceType, deviceKind: string | null | undefined): CadSymbolId | null {
  const kind = normalizujKind(deviceKind);
  switch (deviceType) {
    case 'breaker':
      return 'cad.wylacznik';
    case 'disconnector':
      return 'cad.odlacznik';
    case 'switch':
      return kind === 'ROZLACZNIK_BEZPIECZNIKOWY' ? 'cad.rozlacznikBezpiecznikowy' : 'cad.rozlacznik';
    case 'fuse':
      return 'cad.bezpiecznik';
    case 'bus_coupler':
      return kind !== null ? SYMBOL_PO_DEVICE_KIND[kind] ?? 'cad.lacznik' : 'cad.lacznik';
    default:
      return null;
  }
}

/** Wpis rejestru dla urządzenia (typ gałęzi × device_kind). */
export function wpisAparatu(deviceType: LvDeviceType, deviceKind: string | null | undefined): WpisRejestruSymbolu {
  const symbolId = symbolAparatu(deviceType, deviceKind);
  const klasaOznaczenia = KLASA_PO_TYPIE[deviceType];
  if (symbolId === null) {
    return {
      symbolId: null,
      klasaOznaczenia,
      nazwaPl: NAZWA_PRZEWODU[deviceType as 'cable' | 'line_overhead'] ?? 'Przewód',
      terminale: ['a', 'b'],
      nosnikStanu: 'brak',
      rozmiar: 'przewod',
    };
  }
  const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[symbolId];
  return {
    symbolId,
    klasaOznaczenia,
    nazwaPl: def.polishName,
    terminale: ['a', 'b'],
    nosnikStanu: def.states ? 'noz' : 'brak',
    rozmiar: deviceType === 'bus_coupler' ? 'sprzeglo' : 'aparat',
  };
}

/** Rejestr per typ gałęzi BEZ klasy funkcjonalnej (fallback = sam typ). */
export const REJESTR_SYMBOLI_NN: Readonly<Record<LvDeviceType, WpisRejestruSymbolu>> = {
  breaker: wpisAparatu('breaker', null),
  bus_coupler: wpisAparatu('bus_coupler', null),
  switch: wpisAparatu('switch', null),
  disconnector: wpisAparatu('disconnector', null),
  fuse: wpisAparatu('fuse', null),
  cable: wpisAparatu('cable', null),
  line_overhead: wpisAparatu('line_overhead', null),
};

/** Transformator — jedyny symbol źródła sieciowego domeny (zaciski hv/lv jawne). */
export const SYMBOL_TRANSFORMATORA: CadSymbolId = 'cad.transformator2u';

/** Odbiór zagregowany (strzałka przepływu od szyn, IEC 60617 S00104). */
export const SYMBOL_ODBIORU: CadSymbolId = 'cad.odplywOdbior';

/** Zacisk toru (stopień ≠ 2) i węzeł połączenia (stopień ≥ 3). */
export const SYMBOL_ZACISKU: CadSymbolId = 'cad.zacisk';
export const SYMBOL_WEZLA: CadSymbolId = 'cad.wezel';

/** Symbol punktu toru wg STOPNIA zacisku: ≥ 3 = węzeł (kropka), inaczej zacisk. */
export function symbolPunktuToru(degree: number): CadSymbolId {
  return degree >= 3 ? SYMBOL_WEZLA : SYMBOL_ZACISKU;
}

/** Źródło rozproszone WEDŁUG `gen_type` z modelu — bez domyślnej sylwetki
 *  „na oko": PV i magazyn to złożenia źródło+przekształtnik JEDNEGO elementu
 *  ENM; maszyny (synchroniczna, wiatrowe) = symbol maszyny G~; typ nieznany
 *  dostaje maszynę, bo to jedyny symbol, który nie twierdzi niczego o
 *  technologii przekształtnikowej. */
export function symbolZrodlaDer(genType: LvDomainGenerator['gen_type']): CadSymbolId {
  switch (genType) {
    case 'pv_inverter':
      return 'cad.zrodloPvZPrzeksztaltnikiem';
    case 'bess':
      return 'cad.magazynZPrzeksztaltnikiem';
    default:
      return 'cad.generator';
  }
}

/** Technologia źródła po polsku (opis obok symbolu, §10/§11): PV jest
 *  TECHNOLOGIĄ, falownik ELEMENTEM — opis mówi o technologii, symbol o torze. */
export function technologiaZrodlaPl(genType: LvDomainGenerator['gen_type']): string {
  switch (genType) {
    case 'pv_inverter':
      return 'fotowoltaika (PV) z falownikiem';
    case 'bess':
      return 'magazyn energii z przekształtnikiem';
    case 'synchronous':
      return 'generator synchroniczny';
    case 'wind_inverter':
      return 'turbina wiatrowa z przekształtnikiem';
    case 'fw_pmsg':
      return 'turbina wiatrowa (PMSG, pełny przekształtnik)';
    case 'fw_dfig':
      return 'turbina wiatrowa (DFIG)';
    case 'fw_scig':
      return 'turbina wiatrowa (SCIG)';
    default:
      return 'źródło o nieokreślonej technologii';
  }
}

/** Pomiar: przekładnik prądowy w torze / napięciowy na odgałęzieniu. */
export function symbolPomiaru(kind: LvDomainMeasurement['measurement_type']): CadSymbolId {
  return kind === 'VT' ? 'cad.przekladnikNapieciowy' : 'cad.przekladnikPradowy';
}

/** Zabezpieczenie (urządzenie wtórne przy aparacie) — prostokąt ze znakami IEC. */
export const SYMBOL_ZABEZPIECZENIA: CadSymbolId = 'cad.zabezpieczenie';

/** Kody funkcji ENM → numer ANSI/IEEE C37.2 (panel, podpowiedź) i ZNAK
 *  wielkości charakterystycznej w notacji IEC (wnętrze prostokąta
 *  zabezpieczenia — praktyka polskiej dokumentacji zabezpieczeń). */
const FUNKCJA_ZABEZPIECZENIA: Readonly<Record<string, { readonly ansi: string; readonly iec: string; readonly nazwaPl: string }>> = {
  overcurrent_50: { ansi: '50', iec: 'I>>', nazwaPl: 'nadprądowe bezzwłoczne' },
  overcurrent_51: { ansi: '51', iec: 'I>', nazwaPl: 'nadprądowe zwłoczne' },
  earth_fault_50N: { ansi: '50N', iec: 'I0>>', nazwaPl: 'ziemnozwarciowe bezzwłoczne' },
  earth_fault_51N: { ansi: '51N', iec: 'I0>', nazwaPl: 'ziemnozwarciowe zwłoczne' },
  directional_67: { ansi: '67', iec: 'I>→', nazwaPl: 'nadprądowe kierunkowe' },
  directional_67N: { ansi: '67N', iec: 'I0>→', nazwaPl: 'ziemnozwarciowe kierunkowe' },
  rocof_81R: { ansi: '81R', iec: 'df/dt', nazwaPl: 'pochodna częstotliwości (LoM)' },
  vector_shift_78: { ansi: '78', iec: 'Δφ', nazwaPl: 'skok wektora (LoM)' },
  underfrequency_81U: { ansi: '81U', iec: 'f<', nazwaPl: 'podczęstotliwościowe' },
  overfrequency_81O: { ansi: '81O', iec: 'f>', nazwaPl: 'nadczęstotliwościowe' },
  undervoltage_27: { ansi: '27', iec: 'U<', nazwaPl: 'podnapięciowe' },
  overvoltage_59: { ansi: '59', iec: 'U>', nazwaPl: 'nadnapięciowe' },
};

/** Pełna lista numerów ANSI (panel odpływu, podpowiedź). */
export function kodyAnsiPelne(functionCodes: readonly string[]): readonly string[] {
  return functionCodes.map((code) => FUNKCJA_ZABEZPIECZENIA[code]?.ansi ?? code);
}

/** Pełna lista znaków IEC (podpowiedź, panel). */
export function znakiIecPelne(functionCodes: readonly string[]): readonly string[] {
  return functionCodes.map((code) => FUNKCJA_ZABEZPIECZENIA[code]?.iec ?? code);
}

/** Nazwy polskie funkcji (panel odpływu). */
export function nazwyFunkcjiPl(functionCodes: readonly string[]): readonly string[] {
  return functionCodes.map((code) => FUNKCJA_ZABEZPIECZENIA[code]?.nazwaPl ?? code);
}

/** Znaki IEC do WNĘTRZA prostokąta zabezpieczenia: maks. 2 wiersze; przy
 *  większej liczbie funkcji — pierwszy znak + licznik pozostałych (pełna
 *  lista w podpowiedzi i w panelu odpływu). */
export function znakiIec(functionCodes: readonly string[]): readonly string[] {
  const znaki = znakiIecPelne(functionCodes);
  if (znaki.length <= 2) return znaki;
  return [znaki[0], `+${znaki.length - 1}`];
}

/** Etykieta stanu łączeniowego po polsku (drugorzędne potwierdzenie symbolu). */
export function stanSlowny(state: 'OPEN' | 'CLOSED' | 'UNKNOWN'): string {
  switch (state) {
    case 'OPEN':
      return 'OTWARTY';
    case 'CLOSED':
      return 'ZAMKNIĘTY';
    default:
      return 'STAN NIEZNANY';
  }
}
