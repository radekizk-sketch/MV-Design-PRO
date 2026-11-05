/**
 * Zespół uziemiający pola ZU (ENEA Operator „Stacje elektroenergetyczne 110 kV. Zeszyt 1”,
 * wersja 02.2023 – 2, §16 s.30, Z.13–Z.15 s.93–95) — dane rysunku pola z NOŚNIKA modelu.
 *
 * Powiązanie transformatora uziemiającego z polem jest JEDNO i to samo co w backendzie: zapis
 * pary przeniesienia punktu neutralnego `Transformer.meta.zespol_uziemiajacy.bay_ref`
 * (`ui/shared/transformatoryStacji.ts::poleZespoluTransformatora`, lustro
 * `enm.pole_transformatorowe.pole_zespolu_transformatora`). Ta sama funkcja wyklucza
 * transformator z transformatorów rozdzielczych stacji (W041, marker braku pola TR) i dokłada
 * go do rysunku pola ZU — predykaty parami z jednego źródła.
 *
 * Sposób uziemienia z modelu: wariant rysunku z zapisu pary (`wariant`), typ i wartości z nośnika
 * `Transformer.hv_neutral` (`petersen_coil` — dławik, `resistor_grounded` — rezystor). Wariant
 * Z.14 to dławik i rezystor równolegle; Z.13 — dławik z AWSC. Brak danej = `null` (glif pisze
 * „nieokreślony”), nigdy domysł.
 */
import type { EnergyNetworkModel, Transformer } from '../../../../types/enm';
import {
  poleZespoluTransformatora,
  zapisZespoluUziemiajacego,
} from '../../../shared/transformatoryStacji';

export type WariantZespoluUziemiajacego = 'Z13' | 'Z14' | 'Z15';

/** Dane rysunku zespołu uziemiającego na końcu toru pola ZU. */
export interface ZespolUziemiajacyPolaView {
  /** `Transformer.ref_id` transformatora uziemiającego. */
  readonly transformatorRef: string;
  /** Grupa połączeń z modelu (`ZNyn11`); `null` — model jej nie niesie. */
  readonly vectorGroup: string | null;
  readonly snKva: number | null;
  readonly uhvKv: number | null;
  readonly ulvKv: number | null;
  /** Wariant rysunku z zapisu pary; `null` — zapis go nie niesie. */
  readonly wariant: WariantZespoluUziemiajacego | null;
  /** Gałąź dławika (Z.13, Z.14 albo nośnik `petersen_coil`). */
  readonly dlawik: boolean;
  /** Gałąź rezystora (Z.14, Z.15 albo nośnik `resistor_grounded`). */
  readonly rezystor: boolean;
  /** AWSC po stronie wtórnej dławika (Z.13). */
  readonly awsc: boolean;
  readonly rOhm: number | null;
  readonly xOhm: number | null;
  readonly awscA: number | null;
  /** Szyna potrzeb własnych (`Transformer.lv_bus_ref`) i jej napięcie. */
  readonly szynaPotrzebWlasnychRef: string | null;
  readonly napieciePotrzebWlasnychKv: number | null;
}

function liczba(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function wariantZapisu(value: unknown): WariantZespoluUziemiajacego | null {
  return value === 'Z13' || value === 'Z14' || value === 'Z15' ? value : null;
}

/** Zespół uziemiający pola ZU z modelu albo `null` (pole bez transformatora uziemiającego). */
export function zespolUziemiajacyPola(
  bay: { readonly ref_id: string; readonly bay_role?: string | null },
  snapshot: Pick<EnergyNetworkModel, 'transformers' | 'buses'> & Partial<Pick<EnergyNetworkModel, 'bays'>>,
): ZespolUziemiajacyPolaView | null {
  const bays = snapshot.bays ?? [bay];
  const transformator: Transformer | undefined = (snapshot.transformers ?? [])
    .filter((tr) => poleZespoluTransformatora(bays, tr)?.ref_id === bay.ref_id)
    .sort((a, b) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0))[0];
  if (!transformator) return null;
  const zapis = zapisZespoluUziemiajacego(transformator);
  const wariant = wariantZapisu(zapis?.wariant);
  const nosnik = transformator.hv_neutral ?? null;
  const dlawik = wariant === 'Z13' || wariant === 'Z14' || (wariant === null && nosnik?.type === 'petersen_coil');
  const rezystor = wariant === 'Z14' || wariant === 'Z15' || (wariant === null && nosnik?.type === 'resistor_grounded');
  const szyna = (snapshot.buses ?? []).find((b) => b.ref_id === transformator.lv_bus_ref);
  return {
    transformatorRef: transformator.ref_id,
    vectorGroup: typeof transformator.vector_group === 'string' ? transformator.vector_group : null,
    snKva: liczba(transformator.sn_mva) !== null ? transformator.sn_mva * 1000 : null,
    uhvKv: liczba(transformator.uhv_kv),
    ulvKv: liczba(transformator.ulv_kv),
    wariant,
    dlawik,
    rezystor,
    awsc: wariant === 'Z13',
    rOhm: liczba(nosnik?.r_ohm),
    xOhm: liczba(nosnik?.x_ohm),
    awscA: liczba(nosnik?.awsc_prad_wymuszenia_a),
    szynaPotrzebWlasnychRef: transformator.lv_bus_ref ?? null,
    napieciePotrzebWlasnychKv: liczba(szyna?.voltage_kv),
  };
}

/** Pole widoku pola z zespołem (`CanonicalGpzBay.zespolUziemiajacy`) — brak → brak klucza. */
export function zespolWidokuPola(
  bay: { readonly ref_id: string; readonly bay_role?: string | null },
  snapshot: Pick<EnergyNetworkModel, 'transformers' | 'buses'> & Partial<Pick<EnergyNetworkModel, 'bays'>>,
): { readonly zespolUziemiajacy?: ZespolUziemiajacyPolaView } {
  const zespol = zespolUziemiajacyPola(bay, snapshot);
  return zespol ? { zespolUziemiajacy: zespol } : {};
}
