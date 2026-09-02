/**
 * REJESTR SYMBOLI nN (mandat „profesjonalizacja SLD nN" §4) — JEDNO źródło
 * prawdy „jaki symbol, dla jakiego urządzenia, jak niesie stan".
 *
 * Klucz = TYP URZĄDZENIA z modelu (`LvDeviceType` = typ gałęzi ENM,
 * `graph.devices[].device_type`) — rola (`device_role`: incomer/odpływ/
 * sprzęgło/granica) i stan (`device_state`) są ODRĘBNYMI osiami tego samego
 * wpisu, nie osobnymi symbolami. Rejestr NIE zna geometrii glifów (żyje w
 * `symbols/glyphs.tsx`) — mówi, KTÓRY glif, jaką klasę oznaczenia (QF/QS/FU/
 * QBC/W) i JAK glif wyraża OPEN/CLOSED geometrycznie (mono-safe):
 *
 *  • `wypelnienie` — korpus wypełniony = zamknięty, pusty = otwarty
 *    (wyłącznik nN/MCB i sprzęgło: konwencja PowerFactory/ABB);
 *  • `noz` — nóż w osi = zamknięty, odchylony 45° = otwarty (IEC 60617
 *    rozłącznik/odłącznik);
 *  • `brak` — element bez stanu łączeniowego (wkładka, kabel, linia).
 *
 * Elementy NIE-gałęziowe (transformator, źródła rozproszone, odbiór, pomiar,
 * zabezpieczenie) mają własne tabele niżej — te same zasady: symbol z DANYCH
 * (typ, `gen_type`, `measurement_type`), zero sylwetki „domyślnej na oko".
 *
 * Pin: `__tests__/symbolRegistry.test.tsx` — snapshot glifu per typ × stan
 * (OPEN/CLOSED/UNKNOWN), różnica geometryczna między stanami, zakaz koloru
 * jako jedynego nośnika.
 */
import type { SymbolId } from '../symbols/defs';
import type { LvDeviceType, LvDomainGenerator, LvDomainMeasurement } from './types';

export type NosnikStanu = 'wypelnienie' | 'noz' | 'brak';

export interface WpisRejestruSymbolu {
  /** Glif biblioteki (`symbols/defs.ts`); `null` = przewód (bez symbolu). */
  readonly symbolId: SymbolId | null;
  /** Klasa oznaczenia (IEC 81346 / zwyczaj polski) — prefiks na tabliczce. */
  readonly klasaOznaczenia: 'QF' | 'QS' | 'FU' | 'QBC' | 'W';
  readonly nazwaPl: string;
  /** Zaciski urządzenia (gałąź ma zawsze dwa: A = from_bus, B = to_bus). */
  readonly terminale: readonly ['a', 'b'];
  readonly nosnikStanu: NosnikStanu;
  /** Cel EKRANOWY wysokości glifu [px] — z `visualGrammar.SYMBOL_SCREEN_PX`. */
  readonly rozmiar: 'aparat' | 'sprzeglo' | 'przewod';
}

export const REJESTR_SYMBOLI_NN: Readonly<Record<LvDeviceType, WpisRejestruSymbolu>> = {
  breaker: {
    symbolId: 'nnBreaker',
    klasaOznaczenia: 'QF',
    nazwaPl: 'Wyłącznik nN',
    terminale: ['a', 'b'],
    nosnikStanu: 'wypelnienie',
    rozmiar: 'aparat',
  },
  bus_coupler: {
    symbolId: 'nnBreaker',
    klasaOznaczenia: 'QBC',
    nazwaPl: 'Sprzęgło sekcji',
    terminale: ['a', 'b'],
    nosnikStanu: 'wypelnienie',
    rozmiar: 'sprzeglo',
  },
  switch: {
    symbolId: 'loadBreakSwitch',
    klasaOznaczenia: 'QS',
    nazwaPl: 'Rozłącznik',
    terminale: ['a', 'b'],
    nosnikStanu: 'noz',
    rozmiar: 'aparat',
  },
  disconnector: {
    symbolId: 'disconnector',
    klasaOznaczenia: 'QS',
    nazwaPl: 'Odłącznik',
    terminale: ['a', 'b'],
    nosnikStanu: 'noz',
    rozmiar: 'aparat',
  },
  fuse: {
    symbolId: 'nnFuseSwitch',
    klasaOznaczenia: 'FU',
    nazwaPl: 'Rozłącznik bezpiecznikowy / wkładka',
    terminale: ['a', 'b'],
    nosnikStanu: 'brak',
    rozmiar: 'aparat',
  },
  cable: {
    symbolId: null,
    klasaOznaczenia: 'W',
    nazwaPl: 'Kabel',
    terminale: ['a', 'b'],
    nosnikStanu: 'brak',
    rozmiar: 'przewod',
  },
  line_overhead: {
    symbolId: null,
    klasaOznaczenia: 'W',
    nazwaPl: 'Linia napowietrzna',
    terminale: ['a', 'b'],
    nosnikStanu: 'brak',
    rozmiar: 'przewod',
  },
};

/** Transformator — jedyny symbol źródła sieciowego domeny (zaciski HV/LV jawne). */
export const SYMBOL_TRANSFORMATORA: SymbolId = 'transformer2W';

/** Odbiór (strzałka IEC 60617). */
export const SYMBOL_ODBIORU: SymbolId = 'loadArrow';

/** Źródło rozproszone WEDŁUG `gen_type` z modelu — bez domyślnej sylwetki
 *  „na oko": typ nieznany dostaje generator ogólny (G w okręgu), bo to jest
 *  jedyna sylwetka, która nie twierdzi niczego o technologii. */
export function symbolZrodlaDer(genType: LvDomainGenerator['gen_type']): SymbolId {
  switch (genType) {
    case 'pv_inverter':
      return 'derPv';
    case 'bess':
      return 'derBess';
    case 'wind_inverter':
    case 'fw_pmsg':
    case 'fw_dfig':
    case 'fw_scig':
      return 'derWind';
    default:
      return 'derGenerator';
  }
}

/** Pomiar: przekładnik prądowy w torze / napięciowy na odgałęzieniu. */
export function symbolPomiaru(kind: LvDomainMeasurement['measurement_type']): SymbolId {
  return kind === 'VT' ? 'voltageTransformer' : 'currentTransformer';
}

/** Zabezpieczenie (adnotacja przy aparacie) — okrąg z kodami funkcji. */
export const SYMBOL_ZABEZPIECZENIA: SymbolId = 'protectionRelay';

const KOD_ANSI_PO_FUNKCJI: Readonly<Record<string, string>> = {
  overcurrent_50: '50',
  overcurrent_51: '51',
  earth_fault_50N: '50N',
  earth_fault_51N: '51N',
  directional_67: '67',
  directional_67N: '67N',
  rocof_81R: '81R',
  vector_shift_78: '78',
  underfrequency_81U: '81U',
  overfrequency_81O: '81O',
  undervoltage_27: '27',
  overvoltage_59: '59',
};

/** Pełna lista kodów ANSI (podpowiedź glifu, panel odpływu). */
export function kodyAnsiPelne(functionCodes: readonly string[]): readonly string[] {
  return functionCodes.map((code) => KOD_ANSI_PO_FUNKCJI[code] ?? code);
}

/** Kody funkcji ENM → skrót ANSI na glifie przekaźnika (maks. 2 linie). */
export function kodyAnsi(functionCodes: readonly string[]): readonly string[] {
  const kody = kodyAnsiPelne(functionCodes);
  if (kody.length <= 2) return kody;
  // Glif mieści DWA wiersze po ≤4 znaki: pierwszy kod + licznik pozostałych;
  // pełna lista funkcji jest w podpowiedzi glifu i w panelu odpływu.
  return [kody[0], `+${kody.length - 1}`];
}

/** Etykieta stanu łączeniowego po polsku (drugorzędne potwierdzenie glifu). */
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
