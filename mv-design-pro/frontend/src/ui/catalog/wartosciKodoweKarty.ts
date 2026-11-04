/**
 * WARTOŚCI KODOWE KART KATALOGU — jeden słownik nazw polskich.
 *
 * Serwer katalogu wysyła część pól jako kody wyliczeń (`kind`, `medium`, `device_kind`,
 * `control_mode`, `verification_status`…). Kod nigdy nie trafia na ekran surowo: każde pole
 * kodowe ma tu JEDEN opis — słownik nazw albo jawne uzasadnienie, że wartość jest
 * oznaczeniem normowym, które projektant czyta wprost (grupa połączeń `Dyn11`, typ RCD `A`).
 * Wartość spoza słownika (nowy kod serwera przed aktualizacją frontu) daje uczciwe zdanie
 * po polsku (`etykietaZeSlownika`), nigdy kod.
 *
 * Zbiór pól i ich wartości mierzy wyrocznia `pola_kart_katalogu.json → wartosci_kodowe`
 * (`backend/scripts/eksport_fixtur_harnessu.py::wartosci_kodowe_kart`); test
 * `__tests__/wartosciKodoweKarty.test.ts` przypina iloczyn: każde pole wyroczni × każda jej
 * wartość ma nazwę, a słowniki, których źródłem jest backend, są mu równe.
 *
 * Wcześniejszy stan (pomiar 2026-10-30): siedem rozproszonych słowników tych samych kodów,
 * w tym trzy różne nazwy `ROZLACZNIK_BEZPIECZNIKOWY`, słownik `equipment_kind` z kluczami,
 * których serwer nie wysyła, i odczyty `?? kod` przepisujące kod na ekran.
 */
import { etykietaZeSlownika } from '../../ui2/wyniki/wzorzec/slownikWyliczen';
import { NAZWA_RODZAJU_LACZNIKA_KATALOGU_PL } from './pradZwarciowyKatalogu';

/** Opis pola kodowego karty: słownik nazw albo oznaczenie normowe czytane wprost. */
export type OpisPolaKodowego =
  | { readonly rodzaj: 'nazwy'; readonly nazwy: Readonly<Record<string, string>> }
  | { readonly rodzaj: 'oznaczenie'; readonly uzasadnienie: string };

/** Rodzaj aparatu SN i nN (`device_kind` aparatury, `switch_device_kind` punktu
 *  rozgałęzienia) — nazwy SN równe backendowemu `NAZWY_RODZAJOW_APARATU_PL`
 *  (`network_model/catalog/rodzaje_aparatury.py`, wyrocznia `nazwy_rodzajow_aparatu`). */
export const NAZWA_RODZAJU_APARATU_PL: Readonly<Record<string, string>> = {
  WYLACZNIK: 'wyłącznik',
  ROZLACZNIK: 'rozłącznik',
  ODLACZNIK: 'odłącznik',
  UZIEMNIK: 'uziemnik',
  ROZLACZNIK_BEZPIECZNIKOWY: 'rozłącznik z bezpiecznikami',
  REKLOZER: 'reklozer',
  WYLACZNIK_GLOWNY: 'wyłącznik główny nN',
  WYLACZNIK_ODPLYWOWY: 'wyłącznik odpływowy nN',
};

/** Rodzaje aparatu SN (podzbiór `NAZWA_RODZAJU_APARATU_PL` bez aparatów nN) — kolejność
 *  wyboru w kreatorze pola. */
export const RODZAJE_APARATU_SN = [
  'WYLACZNIK',
  'ROZLACZNIK',
  'ROZLACZNIK_BEZPIECZNIKOWY',
  'ODLACZNIK',
  'REKLOZER',
  'UZIEMNIK',
] as const;

/** Tryb regulacji z karty przekształtnika (`ConverterType.control_mode`). */
export const TRYB_REGULACJI_KATALOGU_PL: Readonly<Record<string, string>> = {
  STALY_COS_PHI: 'stały współczynnik mocy cosφ',
  Q_U_DROOP: 'regulacja Q(U) — charakterystyka opadająca',
  Q_OF_U: 'regulacja Q(U)',
  GRID_FORMING: 'praca formująca sieć (grid forming)',
};

/** Rodzaj generatora turbiny (`generator_machine_type`). */
export const RODZAJ_GENERATORA_PL: Readonly<Record<'PMSG' | 'SCIG' | 'DFIG', string>> = {
  PMSG: 'synchroniczny z magnesami trwałymi (PMSG)',
  SCIG: 'asynchroniczny klatkowy (SCIG)',
  DFIG: 'asynchroniczny dwustronnie zasilany (DFIG)',
};

/** Topologia przekształtnika turbiny (`converter_topology`). */
export const TOPOLOGIA_PRZEKSZTALTNIKA_PL: Readonly<
  Record<'FULL_CONVERTER' | 'DFIG_ROTOR_CONVERTER', string>
> = {
  FULL_CONVERTER: 'pełnej mocy (generator odsprzężony od sieci)',
  DFIG_ROTOR_CONVERTER: 'w obwodzie wirnika (DFIG)',
};

/** Stan weryfikacji pozycji (`verification_status`). */
export const STAN_WERYFIKACJI_PL: Readonly<Record<string, string>> = {
  ZWERYFIKOWANY: 'zweryfikowany',
  CZESCIOWO_ZWERYFIKOWANY: 'częściowo zweryfikowany',
  NIEWERYFIKOWANY: 'niezweryfikowany',
  REFERENCYJNY: 'referencyjny',
};

/** Status katalogu (`catalog_status`, backend `CatalogStatus` — pełna dziedzina). */
export const STATUS_KATALOGU_PL: Readonly<Record<string, string>> = {
  PRODUKCYJNY_V1: 'produkcyjny',
  REFERENCYJNY_V1: 'referencyjny',
  ANALITYCZNY_V1: 'analityczny',
  TESTOWY: 'testowy',
  PROJEKTOWY_V1: 'projektowy (dane z arkusza)',
};

/** Rodzaj pozycji (`kind`): źródło przekształtnikowe albo punkt rozgałęzienia. */
export const RODZAJ_POZYCJI_PL: Readonly<Record<string, string>> = {
  PV: 'fotowoltaika',
  WIND: 'farma wiatrowa',
  BESS: 'magazyn energii',
  BRANCH_POLE: 'słup rozgałęźny SN',
  ZKSN: 'złącze kablowe SN (ZKSN)',
};

/** Układ połączeń baterii kondensatorów (`uklad_polaczen`) — backend
 *  `network_model/core/bateria_kondensatorow.py::NAZWY_UKLADOW_POLACZEN_BATERII_PL`. */
export const UKLAD_POLACZEN_BATERII_PL: Readonly<Record<string, string>> = {
  PODWOJNA_GWIAZDA_IZOLOWANA: 'podwójna gwiazda z izolowanymi punktami gwiazd',
  GWIAZDA_IZOLOWANA: 'gwiazda z izolowanym punktem gwiazdy',
  GWIAZDA_UZIEMIONA: 'gwiazda z uziemionym punktem gwiazdy',
  TROJKAT: 'trójkąt',
};

/** Symbol materiału przewodu w zwięzłym opisie odcinka („Al 120 mm²”) — z tego samego
 *  słownika co pełna nazwa. */
export const SYMBOL_MATERIALU_PRZEWODU: Readonly<Record<string, string>> = {
  AL: 'Al',
  AL_ST: 'AFL',
  CU: 'Cu',
};

const MATERIAL_PRZEWODU_PL: Readonly<Record<string, string>> = {
  AL: `aluminium (${SYMBOL_MATERIALU_PRZEWODU.AL})`,
  AL_ST: `aluminium ze stalą (${SYMBOL_MATERIALU_PRZEWODU.AL_ST})`,
  CU: `miedź (${SYMBOL_MATERIALU_PRZEWODU.CU})`,
};

const nazwy = (n: Readonly<Record<string, string>>): OpisPolaKodowego => ({
  rodzaj: 'nazwy',
  nazwy: n,
});

/**
 * Pola kodowe kart katalogu — rejestr ZAMKNIĘTY względem wyroczni (test). Klucz = nazwa pola
 * w serializacji serwera (także wewnątrz `params`, `route_ports`, `apparatus_specs`).
 */
export const POLA_KODOWE_KARTY: Readonly<Record<string, OpisPolaKodowego>> = {
  apparatus_role: nazwy({ BRANCH_SWITCH: 'łącznik odgałęzienia' }),
  application: nazwy({
    MV_CABLE_TERMINATION: 'zakończenie kabla SN',
    MV_FEEDER: 'pole liniowe SN',
    MV_SUBSTATION: 'stacja SN',
    metering: 'pomiarowy',
    protection: 'zabezpieczeniowy',
    dual: 'pomiarowo-zabezpieczeniowy',
  }),
  catalog_namespace: nazwy({ mv_branch_points: 'punkty rozgałęzienia SN' }),
  catalog_status: nazwy(STATUS_KATALOGU_PL),
  conductor_material: nazwy(MATERIAL_PRZEWODU_PL),
  control_mode: nazwy(TRYB_REGULACJI_KATALOGU_PL),
  converter_topology: nazwy(TOPOLOGIA_PRZEKSZTALTNIKA_PL),
  cos_phi_mode: nazwy({ IND: 'indukcyjny', POJ: 'pojemnościowy', BRAK: 'bez mocy biernej' }),
  // Rodzaj krzywej biblioteki zabezpieczeń — te same nazwy rodzin co słownik nastaw
  // (`protection-coordination/types.ts::curveTypes`), małą literą.
  curve_kind: nazwy({
    definite_time: 'czas niezależny (DT)',
    inverse: 'normalna odwrotna (SI)',
    very_inverse: 'bardzo odwrotna (VI)',
    extremely_inverse: 'ekstremalnie odwrotna (EI)',
    long_time_inverse: 'odwrotna długoczasowa (LTI)',
    moderately_inverse: 'umiarkowanie odwrotna (MI)',
  }),
  device_kind: nazwy(NAZWA_RODZAJU_APARATU_PL),
  equipment_kind: nazwy(NAZWA_RODZAJU_LACZNIKA_KATALOGU_PL),
  generator_machine_type: nazwy(RODZAJ_GENERATORA_PL),
  grid_code: nazwy({
    NC_RfG: 'NC RfG (typ modułu nieokreślony w karcie)',
    NC_RfG_typ_A: 'NC RfG — moduł typu A',
    NC_RfG_typ_B: 'NC RfG — moduł typu B',
    NC_RfG_typ_C: 'NC RfG — moduł typu C',
    NC_RfG_typ_D: 'NC RfG — moduł typu D',
  }),
  i_th_pochodzenie: nazwy({ producent: 'dana producenta', referencyjny: 'wartość referencyjna' }),
  insulation_type: nazwy({
    XLPE: 'polietylen usieciowany (XLPE)',
    PVC: 'polwinit (PVC)',
    EPR: 'guma etylenowo-propylenowa (EPR)',
    PAPER: 'papier przesycany (kable istniejące)',
  }),
  kind: nazwy(RODZAJ_POZYCJI_PL),
  medium: nazwy({
    AIR: 'powietrze',
    SF6: 'gaz SF6',
    VACUUM: 'próżnia',
    CABLE: 'sieć kablowa',
    LINE_OVERHEAD: 'linia napowietrzna',
  }),
  neutral_system: nazwy({
    COMPENSATED_OR_RESISTIVE: 'punkt neutralny skompensowany lub uziemiony przez rezystor',
    RESISTIVE_OR_EFFECTIVE: 'punkt neutralny uziemiony przez rezystor lub skutecznie',
  }),
  object_role: nazwy({
    MV_SWITCHGEAR_BRANCH_NODE: 'węzeł odgałęźny rozdzielnicy SN',
    OVERHEAD_BRANCH_POLE: 'słup rozgałęźny linii napowietrznej',
  }),
  operator_name: nazwy({ OSD: 'operator systemu dystrybucyjnego (OSD)' }),
  przeznaczenie: nazwy({ FAZOWY: 'przewód fazowy', ODGROMOWY: 'przewód odgromowy' }),
  ptpiree_status: nazwy({
    POWIAZANY: 'powiązany z wykazem PTPiREE',
    NIEPOWIAZANY: 'bez powiązania z wykazem PTPiREE',
  }),
  rcd_type: {
    rodzaj: 'oznaczenie',
    uzasadnienie:
      'typ wyłącznika różnicowoprądowego wg PN-EN 61008-1 (AC, A, F, B) — oznaczenie normowe',
  },
  return_conductor_material: nazwy(MATERIAL_PRZEWODU_PL),
  role: nazwy({
    ciag_wejscie: 'wejście ciągu głównego',
    ciag_wyjscie: 'wyjście ciągu głównego',
    odgalezienie: 'odgałęzienie',
  }),
  short_circuit_model: nazwy({ short_circuit_power: 'moc zwarciowa sieci zasilającej' }),
  standard_topology: nazwy({
    OVERHEAD_LINE_POLE_WITH_BRANCH_SWITCH: 'słup linii napowietrznej z łącznikiem odgałęzienia',
    ZKSN_WITH_LINE_AND_BRANCH_FIELDS: 'złącze kablowe z polami liniowymi i odgałęźnymi',
  }),
  supply_role: nazwy({ ZASILANIE_SYSTEMOWE: 'zasilanie systemowe' }),
  switch_device_kind: nazwy(NAZWA_RODZAJU_APARATU_PL),
  switchgear_kind: nazwy({ ROZDZIELNIA_SN_BEZ_TRANSFORMATORA: 'rozdzielnica SN bez transformatora' }),
  topology_role: nazwy({ BRANCH_POINT: 'punkt rozgałęzienia' }),
  uklad_polaczen: nazwy(UKLAD_POLACZEN_BATERII_PL),
  vector_group: {
    rodzaj: 'oznaczenie',
    uzasadnienie: 'grupa połączeń transformatora wg PN-EN 60076-1 — oznaczenie normowe',
  },
  verification_status: nazwy(STAN_WERYFIKACJI_PL),
};

/** Czy pole serializacji jest polem kodowym karty. */
export function jestPolemKodowym(pole: string): boolean {
  return Object.prototype.hasOwnProperty.call(POLA_KODOWE_KARTY, pole);
}

/**
 * Wartość pola kodowego dla projektanta: nazwa ze słownika pola, oznaczenie normowe wprost,
 * a kod spoza słownika — jawne zdanie „wartość spoza słownika aplikacji”, nigdy kod.
 * Pole spoza rejestru zwraca wartość bez zmian (to nie jest kod wyliczenia).
 */
export function nazwaWartosciKodowej(pole: string, wartosc: string): string {
  if (!jestPolemKodowym(pole)) return wartosc;
  const opis = POLA_KODOWE_KARTY[pole];
  return opis.rodzaj === 'oznaczenie' ? wartosc : etykietaZeSlownika(opis.nazwy, wartosc);
}

/** Nazwa na początku zdania, etykiety albo plakietki: pierwsza litera wielka (słownik trzyma
 *  nazwy małą literą — tak czyta się je w środku zdania, np. „nie dotyczy (wyłącznik)”). */
export function zWielkiejLitery(tekst: string): string {
  return tekst.charAt(0).toLocaleUpperCase('pl-PL') + tekst.slice(1);
}

/** Symbol materiału przewodu (`Al`, `Cu`, `AFL`) z kodu katalogu (wielkość liter bez
 *  znaczenia — model mógł przyjąć `Al`); kod spoza słownika — jawne zdanie, nie kod. */
export function symbolMaterialuPrzewodu(kod: string): string {
  return etykietaZeSlownika(SYMBOL_MATERIALU_PRZEWODU, kod.trim().toUpperCase());
}
