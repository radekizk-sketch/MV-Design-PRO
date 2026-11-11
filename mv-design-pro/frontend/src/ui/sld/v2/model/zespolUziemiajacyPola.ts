/**
 * Zespół uziemiający pola ZU (ENEA Operator „Stacje elektroenergetyczne 110 kV. Zeszyt 1”,
 * wersja 02.2023 – 2, §16 s.30, Z.13–Z.15 s.93–95) — dane rysunku pola z JEDYNEGO nośnika
 * modelu: transformatora uziemiającego ZNyn11 (karta ZU-JEDEN-NOSNIK).
 *
 * Powiązanie transformatora uziemiającego z polem jest JEDNO i to samo co w backendzie:
 * transformator uziemiający wskazany w wyposażeniu pola roli `ZU` (`Bay.equipment_refs`;
 * `ui/shared/transformatoryStacji.ts::poleZespoluTransformatora`, lustro
 * `enm.zespol_uziemiajacy.pole_zespolu_transformatora`). Ta sama funkcja wyklucza transformator
 * z transformatorów rozdzielczych stacji (W041, marker braku pola TR) i dokłada go do rysunku
 * pola ZU — predykaty parami z jednego źródła.
 *
 * Wyposażenie punktu neutralnego z typowanego `Transformer.hv_neutral`: dławik gaszący
 * (`dlawik`, z AWSC `dlawik.awsc`) i rezystor (`rezystor`); wariant rysunku wynika z wyposażenia
 * (lustro `enm.zespol_uziemiajacy.wariant_zespolu`: Z.13 — dławik, Z.14 — dławik i rezystor
 * równolegle, Z.15 — rezystor), nie jest zapisem. Brak danej = `null` (glif pisze sam rodzaj
 * aparatu), nigdy domysł ani wartość liczona we froncie.
 */
import type { EnergyNetworkModel, GroundingConfig, Transformer } from '../../../../types/enm';
import { poleZespoluTransformatora } from '../../../shared/transformatoryStacji';

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
  /** Wariant rysunku z wyposażenia punktu neutralnego (`wariantZespolu`); `null` — inny opis
   *  (uziemienie bezpośrednie, brak wyposażenia, opis niespójny). */
  readonly wariant: WariantZespoluUziemiajacego | null;
  /** Gałąź dławika gaszącego (`hv_neutral.dlawik`). */
  readonly dlawik: boolean;
  /** Gałąź rezystora uziemiającego (`hv_neutral.rezystor`). */
  readonly rezystor: boolean;
  /** AWSC dławika (`hv_neutral.dlawik.awsc`, Z.13). */
  readonly awsc: boolean;
  /** Rezystancja rezystora [Ω] — wartość rekordu albo pozycji katalogu zmaterializowanej. */
  readonly rOhm: number | null;
  /** Nastawa dławika gaszącego [A] (`dlawik.i_nastawy_a`); brak = wartość robocza backendu. */
  readonly iNastawyDlawikaA: number | null;
  /** Prąd czynny wymuszany przez AWSC [A] (`dlawik.awsc.i_wymuszany_a`). */
  readonly awscA: number | null;
  /** Szyna potrzeb własnych (`Transformer.lv_bus_ref`) i jej napięcie. */
  readonly szynaPotrzebWlasnychRef: string | null;
  readonly napieciePotrzebWlasnychKv: number | null;
}

function liczba(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Wariant rysunku z wyposażenia — lustro `enm.zespol_uziemiajacy.wariant_zespolu`. */
export function wariantZespolu(cfg: GroundingConfig | null | undefined): WariantZespoluUziemiajacego | null {
  if (!cfg) return null;
  const dlawik = cfg.dlawik ?? null;
  const rezystor = cfg.rezystor ?? null;
  if (cfg.type === 'petersen_coil' && dlawik !== null) return rezystor !== null ? 'Z14' : 'Z13';
  if (cfg.type === 'resistor_grounded' && rezystor !== null && dlawik === null) return 'Z15';
  return null;
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
  const nosnik = transformator.hv_neutral ?? null;
  const dlawik = nosnik?.dlawik ?? null;
  const rezystor = nosnik?.rezystor ?? null;
  const szyna = (snapshot.buses ?? []).find((b) => b.ref_id === transformator.lv_bus_ref);
  return {
    transformatorRef: transformator.ref_id,
    vectorGroup: typeof transformator.vector_group === 'string' ? transformator.vector_group : null,
    snKva: liczba(transformator.sn_mva) !== null ? transformator.sn_mva * 1000 : null,
    uhvKv: liczba(transformator.uhv_kv),
    ulvKv: liczba(transformator.ulv_kv),
    wariant: wariantZespolu(nosnik),
    dlawik: dlawik !== null,
    rezystor: rezystor !== null,
    awsc: (dlawik?.awsc ?? null) !== null,
    rOhm: liczba(rezystor?.r_ohm) ?? liczba(rezystor?.materialized_params?.r_ohm),
    iNastawyDlawikaA: liczba(dlawik?.i_nastawy_a),
    awscA: liczba(dlawik?.awsc?.i_wymuszany_a),
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
