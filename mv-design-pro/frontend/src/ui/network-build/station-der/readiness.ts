/**
 * Readiness aggregation Station ↔ DER (Faza F + iteracja eksperckiego audytu).
 *
 * Funkcje pure agregujące macierz gotowości obliczeń (DerReadinessMatrix)
 * + globalne dane stacji do jednolitego widoku w E-04, E-25/E-37, E-36.
 *
 * Zasada: nie wykonujemy fizyki — patrzymy na obecność `catalog_refs` /
 * `profile_refs` / `pcc_ref` i mapujemy na status osi.
 *
 * Naprawy z drugiego audytu eksperckiego:
 *  - eng.5: CT klasa 5P/10P wymagana dla zabezpieczeń (IEC 61869-2)
 *  - eng.6: CT dwurdzeniowy (5P + 0,5) wymagany dla 87T (różnicowe transformatora)
 *  - eng.11: anti-islanding (27/59/81U/81O) wymagane dla DER po stronie nN
 */

import { CT_CATALOG, isCtClassValidForProtection, type CtClass } from './protection-catalogs';
import {
  EMPTY_DER_READINESS,
  type DerReadinessMatrix,
  type ReadinessAxisStatus,
  type StationDerConnection,
} from './types';

export interface AggregatedReadinessAxis {
  readonly axis: keyof DerReadinessMatrix;
  readonly label_pl: string;
  readonly status: ReadinessAxisStatus;
  readonly blockers: ReadonlyArray<{
    readonly code: string;
    readonly message_pl: string;
    readonly object_ref: string;
    readonly target_screen: string;
    readonly target_tab: string;
  }>;
}

/** Polskie etykiety osi macierzy. */
export const READINESS_AXIS_LABELS_PL: Record<keyof DerReadinessMatrix, string> = {
  sc_3f: 'Zwarcie 3-fazowe (SC3F)',
  sc_1f: 'Zwarcie 1-fazowe doziemne (SC1F)',
  sc_2f: 'Zwarcie 2-fazowe (SC2F)',
  sc_2fg: 'Zwarcie 2-fazowe z ziemią (SC2FG)',
  vdrop: 'Spadek napięcia (VDROP)',
  q_u: 'Regulacja Q(U)',
  equipment: 'Dowód aparatury',
  protection: 'Zabezpieczenia',
  protection_selectivity: 'Selektywność zabezpieczeń',
  frt: 'FRT / LVRT',
  hvrt: 'HVRT',
  nc_rfg: 'Zgodność przyłączeniowa (NC RfG)',
  report_osd: 'Raport OSD',
  report_technical: 'Raport techniczny',
};

// =============================================================================
// Naprawa B.3 + B.4 — walidacje hosting capacity + min Sk w PCC
// =============================================================================

export interface HostingCapacityValidationResult {
  readonly station_id: string;
  readonly busbar_kind: 'mv_section' | 'lv_busbar';
  readonly busbar_ref: string;
  readonly p_total_der_kw: number;
  readonly capacity_limit_kw: number;
  readonly utilization_percent: number;
  readonly status: 'ok' | 'warning' | 'exceeded';
  readonly message_pl: string;
}

/**
 * Naprawa B.3: walidacja hosting capacity szyny.
 * Reguła operatora: Σ P_DER ≤ 1.0 × Sn_transformer (transformator zasilający
 * szynę nN) lub Σ P_DER ≤ 0.5 × Sk_busbar (dla szyny SN).
 *
 * Zwraca status:
 *   - ok: utilizacja ≤ 80%
 *   - warning: utilizacja 80-100%
 *   - exceeded: utilizacja > 100%
 */
export function validateHostingCapacity(args: {
  readonly station_id: string;
  readonly busbar_kind: 'mv_section' | 'lv_busbar';
  readonly busbar_ref: string;
  readonly ders: readonly StationDerConnection[];
  readonly capacity_limit_kw: number;
}): HostingCapacityValidationResult {
  const dersOnBusbar = args.ders.filter((d) => {
    if (args.busbar_kind === 'lv_busbar') return d.lv_busbar_ref === args.busbar_ref;
    return d.bay_ref === args.busbar_ref || d.connection_node_ref === args.busbar_ref;
  });
  const p_total = dersOnBusbar.reduce((sum, d) => sum + (d.nominal_power_kw ?? 0), 0);
  const utilization = args.capacity_limit_kw > 0 ? (p_total / args.capacity_limit_kw) * 100 : 0;

  let status: 'ok' | 'warning' | 'exceeded';
  let message_pl: string;
  if (utilization > 100) {
    status = 'exceeded';
    message_pl =
      `Przekroczona zdolność szyny: ${p_total.toFixed(0)} kW DER vs limit `
      + `${args.capacity_limit_kw.toFixed(0)} kW (${utilization.toFixed(0)}%). `
      + `Wymagane: dodatkowy transformator albo redukcja mocy DER.`;
  } else if (utilization > 80) {
    status = 'warning';
    message_pl =
      `Wysoka utylizacja szyny: ${p_total.toFixed(0)} / ${args.capacity_limit_kw.toFixed(0)} kW `
      + `(${utilization.toFixed(0)}%). Sprawdź margines pracy szczytowej.`;
  } else {
    status = 'ok';
    message_pl =
      `OK: ${p_total.toFixed(0)} / ${args.capacity_limit_kw.toFixed(0)} kW `
      + `(${utilization.toFixed(0)}% utylizacja).`;
  }

  return {
    station_id: args.station_id,
    busbar_kind: args.busbar_kind,
    busbar_ref: args.busbar_ref,
    p_total_der_kw: p_total,
    capacity_limit_kw: args.capacity_limit_kw,
    utilization_percent: utilization,
    status,
    message_pl,
  };
}

/**
 * Wylicza macierz readiness dla DER na podstawie obecności catalog_refs
 * i profile_refs. Brak danych → 'blocked', częściowy → 'partial', kompletny
 * → 'ready'. Reguły:
 *
 *  - SC3F: wymaga device_catalog_ref + pcc_ref.
 *  - SC1F/SC2FG: dodatkowo wymaga fault_current_data_ref (R₀/X₀/Z₀Z₁ —
 *    Naprawa A.1, IEC 60909-3).
 *  - VDROP: device_catalog_ref + pcc_ref + nominal_power_kw.
 *  - Q_U: nc_rfg_profile_ref.
 *  - EQUIPMENT: device_catalog_ref + (transformer_catalog_ref jeśli
 *    dedicated_transformer).
 *  - PROTECTION: protection_catalog_ref + ct_catalog_ref + vt_catalog_ref.
 *  - PROTECTION_SELECTIVITY: protection + ≥1 inny DER w tej samej stacji.
 *  - FRT: nc_rfg_profile_ref + lvrt_curve_ref + dynamic_model_ref (Naprawa A.5).
 *  - HVRT: nc_rfg_profile_ref + hvrt_curve_ref + dynamic_model_ref.
 *  - NC_RFG: nc_rfg_profile_ref + lvrt_curve_ref + hvrt_curve_ref.
 *  - REPORT_OSD/TECHNICAL: pełna kompletność (wszystkie powyższe ≥ partial).
 *
 * Uwaga: jeśli connection_side jest pozastacjonarne (at_zksn / at_branch_pole /
 * at_cable_joint), zabezpieczenia kierunkowe (67/67N) są wymagane —
 * sprawdzane jako warning w protection axis (Naprawa B.2).
 */
/**
 * Klasa dokladnosci przekladnika prądowego przypisanego do wytwórcy, albo `null`.
 *
 * KOLEJNOSC ZRODEL (V12K-232). (1) DANA z modelu — pole `ct_accuracy_class` na
 * rekordzie wytwórcy, wypełniane przez warstwę, która zna PRAWDZIWY katalog
 * (`/api/catalog/ct-types`). (2) Przejściowo katalog lokalny frontu — ma tylko pięć
 * wpisów i ZEROWE pokrycie identyfikatorów z katalogiem backendu, więc dla realnych
 * przekładników nic nie znajdzie; zostaje wyłącznie po to, żeby nie zepsuć ścieżek,
 * które nadal używają tamtych identyfikatorów. Docelowo (F-K8 faza 2) źródłem jest
 * wyłącznie dana, a katalog lokalny znika razem z relokacją oceny do backendu.
 *
 * `null` przy PODANYM `ct_catalog_ref` znaczy „klasy nie da się ustalić" — i to jest
 * inny fakt niż „klasa nie jest zabezpieczeniowa". Pierwszy to brak danej, drugi to
 * werdykt; mieszanie ich dało milczące „częściowo" bez powodu.
 */
function ctKlasaZDanychAlboKatalogu(der: StationDerConnection): CtClass | null {
  const zModelu = der.ct_accuracy_class;
  if (zModelu) return zModelu;
  const ref = der.catalogs.ct_catalog_ref;
  if (!ref) return null;
  return CT_CATALOG.find((c) => c.id === ref)?.accuracy_class ?? null;
}

/** Zastosowanie przekładnika (zabezpieczenia / pomiar / dwurdzeniowy) — jak wyżej. */
function ctZastosowanieZDanychAlboKatalogu(
  der: StationDerConnection,
): 'protection' | 'metering' | 'dual' | null {
  const zModelu = der.ct_application;
  if (zModelu) return zModelu;
  const ref = der.catalogs.ct_catalog_ref;
  if (!ref) return null;
  return CT_CATALOG.find((c) => c.id === ref)?.application ?? null;
}

export function computeDerReadinessMatrix(
  der: StationDerConnection,
  context?: { readonly otherDersInStation?: number },
): DerReadinessMatrix {
  const otherDers = context?.otherDersInStation ?? 0;
  const hasDevice = der.catalogs.device_catalog_ref !== null;
  const hasPcc = der.pcc_ref !== null;
  const hasNcRfg = der.profiles.nc_rfg_profile_ref !== null;
  const hasLvrt = der.profiles.lvrt_curve_ref !== null;
  const hasHvrt = der.profiles.hvrt_curve_ref !== null;
  const hasProtection = der.catalogs.protection_catalog_ref !== null;
  const hasCtVt =
    der.catalogs.ct_catalog_ref !== null && der.catalogs.vt_catalog_ref !== null;
  const hasPower = der.nominal_power_kw !== null;
  const requiresDedicatedTrafo = der.connection_side === 'dedicated_transformer';
  const hasDedicatedTrafo = der.catalogs.transformer_catalog_ref !== null;
  // Naprawa A.1: dane zwarciowe składowych zerowej/ujemnej dla SC1F/SC2FG.
  const hasFaultCurrentData = der.catalogs.fault_current_data_ref !== null;
  // Naprawa A.5: model dynamiczny dla FRT/HVRT.
  const hasDynamicModel = der.catalogs.dynamic_model_ref !== null;
  // Naprawa eng.5: klasa CT musi byc zabezpieczeniowa (5P/10P) dla protection axis.
  //
  // V12K-232: klasa przekladnika jest DANA, nie wynikiem szukania w katalogu wewnatrz
  // reguly. Poprzednia wersja rozwiazywala `ct_catalog_ref` w LOKALNYM, piecio-wpisowym
  // `CT_CATALOG` frontu, ktory ma ZEROWE pokrycie identyfikatorow z prawdziwym
  // katalogiem backendu (`/api/catalog/ct-types`, 12 typow producenckich) — a to
  // wlasnie z niego kreator pomiaru dodaje przekladnik do modelu. POMIAR: dla realnego
  // `ct_200_5_5p10_10va_abb` (klasa 5P10, w pelni poprawna zabezpieczeniowo wg
  // IEC 61869-2) os zabezpieczen konczyla sie stanem „czesciowo" z PUSTA lista
  // powodow; dla syntetycznego `ct_200_5_5p20` z piatki frontu — „gotowa".
  //
  // `ctKlasaNieznana` odroznia „klasa nie jest zabezpieczeniowa" od „klasy nie da sie
  // ustalic". Pierwsze jest werdyktem, drugie brakiem danej — i musi byc NAZWANE
  // (patrz `buildBlockersForAxis`), nigdy milczacym „czesciowo".
  // Nierozstrzygnieta klasa NIE spelnia warunku (bezpieczniej: „nie wiem" nie jest
  // „spelnione"), ale powod jest NAZWANY w `buildBlockersForAxis` — os nie moze byc
  // niegotowa w milczeniu.
  const ctKlasa = ctKlasaZDanychAlboKatalogu(der);
  const ctValidForProtection = ctKlasa !== null && isCtClassValidForProtection(ctKlasa);
  // Naprawa eng.6: CT dual-core wymagany jeśli mamy dedicated_transformer
  // o mocy ≥ 1.6 MVA (próg dla 87T per IEC 60255-13). Dual-core = klasa 5P/10P
  // + 0,5/0,2 łączone (oznaczone application='dual' w katalogu CT).
  const requires87T =
    der.connection_side === 'dedicated_transformer' &&
    (der.nominal_power_kw ?? 0) >= 1600;
  const ctIsDualCore = ctZastosowanieZDanychAlboKatalogu(der) === 'dual';
  // Naprawa eng.11: anti-islanding (27/59/81U/81O) — egzekwowane przez
  // buildBlockersForAxis dla protection axis (po nN/ZK/słupie/mufie).

  // Krótkie helpery.
  const allOk = (...flags: boolean[]) =>
    flags.every(Boolean) ? ('ready' as const) : ('blocked' as const);
  const partialOk = (full: boolean, any: boolean): ReadinessAxisStatus =>
    full ? 'ready' : any ? 'partial' : 'blocked';

  const sc3f = allOk(hasDevice, hasPcc);
  // Naprawa A.1: SC1F/SC2FG wymagają składowych Z₀ — bez fault_current_data
  // status partial nawet z pełnym device + pcc.
  const sc_asymmetric: ReadinessAxisStatus = (() => {
    if (!hasDevice || !hasPcc) return 'blocked';
    if (!hasFaultCurrentData) return 'partial';
    return 'ready';
  })();
  const sc2f = sc3f; // 2-fazowe nie wymaga Z₀
  const vdrop = partialOk(hasDevice && hasPcc && hasPower, hasDevice || hasPcc);
  const q_u = hasNcRfg ? 'ready' : 'blocked';
  const equipment = (() => {
    if (!hasDevice) return 'blocked' as const;
    if (requiresDedicatedTrafo && !hasDedicatedTrafo) return 'partial' as const;
    return 'ready' as const;
  })();
  // Naprawy eng.5 + eng.6 + eng.11: rozszerzona logika protection.
  const protectionStatus: ReadinessAxisStatus = (() => {
    if (!hasProtection && !hasCtVt) return 'blocked';
    if (!hasProtection || !hasCtVt) return 'partial';
    // eng.5: CT klasa musi być zabezpieczeniowa (5P/10P).
    if (!ctValidForProtection) return 'partial';
    // eng.6: jeśli DER po dedicated_transformer ≥ 1.6 MVA, wymagany dual-core CT.
    if (requires87T && !ctIsDualCore) return 'partial';
    // eng.11: anti-islanding — sprawdzane jako dodatkowy warunek
    // (sygnalizujemy 'partial' jeśli brak antyislandowych funkcji 27/59/81U/81O).
    // Tę walidację rozszerza buildBlockersForAxis poniżej.
    return 'ready';
  })();
  const protectionSelectivity: ReadinessAxisStatus = (() => {
    if (!hasProtection) return 'blocked';
    if (otherDers === 0) return 'partial'; // tylko jeden DER — selektywność wewnętrzna
    return 'ready';
  })();
  // Naprawa A.5: FRT/HVRT wymaga modelu dynamicznego dla solvera RMS.
  const frt = (() => {
    if (!hasNcRfg || !hasLvrt) return 'blocked' as ReadinessAxisStatus;
    if (!hasDynamicModel) return 'partial' as ReadinessAxisStatus;
    return 'ready' as ReadinessAxisStatus;
  })();
  const hvrt = (() => {
    if (!hasNcRfg || !hasHvrt) return 'blocked' as ReadinessAxisStatus;
    if (!hasDynamicModel) return 'partial' as ReadinessAxisStatus;
    return 'ready' as ReadinessAxisStatus;
  })();
  const nc_rfg = allOk(hasNcRfg, hasLvrt, hasHvrt);

  const reportInputsOk =
    sc3f === 'ready' && vdrop !== 'blocked' && nc_rfg === 'ready' && equipment === 'ready';
  const report: ReadinessAxisStatus = reportInputsOk
    ? 'ready'
    : (sc3f === 'ready' || nc_rfg === 'ready')
      ? 'partial'
      : 'blocked';

  return {
    sc_3f: sc3f,
    sc_1f: sc_asymmetric,
    sc_2f: sc2f,
    sc_2fg: sc_asymmetric,
    vdrop,
    q_u,
    equipment,
    protection: protectionStatus,
    protection_selectivity: protectionSelectivity,
    frt,
    hvrt,
    nc_rfg,
    report_osd: report,
    report_technical: report,
  };
}

/**
 * Buduje listę osi readiness z polskimi etykietami i blokerami per oś.
 * Używana przez E-04 ModelGapsSurface i Karta 10 E-13.
 */
export function buildAggregatedReadiness(
  der: StationDerConnection,
  context?: { readonly otherDersInStation?: number },
): readonly AggregatedReadinessAxis[] {
  const matrix = computeDerReadinessMatrix(der, context);
  const axes = Object.keys(READINESS_AXIS_LABELS_PL) as (keyof DerReadinessMatrix)[];
  return axes.map((axis) => ({
    axis,
    label_pl: READINESS_AXIS_LABELS_PL[axis],
    status: matrix[axis],
    blockers: buildBlockersForAxis(axis, der, matrix[axis]),
  }));
}

interface MutableBlocker {
  code: string;
  message_pl: string;
  object_ref: string;
  target_screen: string;
  target_tab: string;
}

function buildBlockersForAxis(
  axis: keyof DerReadinessMatrix,
  der: StationDerConnection,
  status: ReadinessAxisStatus,
): AggregatedReadinessAxis['blockers'] {
  if (status === 'ready' || status === 'not_applicable' || status === 'no_module') return [];
  const blockers: MutableBlocker[] = [];

  switch (axis) {
    case 'sc_3f':
    case 'sc_1f':
    case 'sc_2f':
    case 'sc_2fg':
      if (!der.catalogs.device_catalog_ref) {
        blockers.push({
          code: 'der.device_catalog.missing',
          message_pl: 'Brak katalogu urządzenia (falownik / PCS / turbina).',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'inverters',
        });
      }
      if (!der.pcc_ref) {
        blockers.push({
          code: 'der.pcc.missing',
          message_pl: 'Brak punktu przyłączenia PCC.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'topology',
        });
      }
      // V12K-226: osie NIESYMETRYCZNE potrzebują składowej zerowej (Naprawa A.1,
      // IEC 60909-3), a status to uwzględniał — brakowało tylko POWODU na liście.
      // Skutek: oś SC1F/SC2F/SC2FG z kompletnym urządzeniem i PWP kończyła się
      // stanem „częściowo" z PUSTĄ listą blokerów, czyli projektant widział
      // „niegotowe" bez żadnej akcji naprawczej (ślepy zaułek w torze pracy).
      // Tylko zwarcia Z UDZIAŁEM ZIEMI potrzebują składowej zerowej. Zwarcie
      // dwufazowe bez ziemi rozkłada się na składową zgodną i przeciwną (Z₁, Z₂),
      // więc żądanie od niego danych Z₀ byłoby FAŁSZYWYM BRAKIEM — status w tym
      // pliku ma to poprawnie (`sc2f = sc3f`), lista blokerów musi się zgadzać.
      if ((axis === 'sc_1f' || axis === 'sc_2fg') && !der.catalogs.fault_current_data_ref) {
        blockers.push({
          code: 'der.fault_current_data.missing',
          message_pl:
            'Brak modelu zwarciowego urządzenia (R₀/X₀/Z₀·Z₁⁻¹) — bez składowej '
            + 'zerowej zwarcia niesymetrycznego nie da się policzyć.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'ncrfg',
        });
      }
      break;
    case 'vdrop':
      if (der.nominal_power_kw === null) {
        blockers.push({
          code: 'der.power.missing',
          message_pl: 'Brak mocy znamionowej (z katalogu urządzenia).',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'inverters',
        });
      }
      break;
    case 'q_u':
      if (!der.profiles.nc_rfg_profile_ref) {
        blockers.push({
          code: 'der.nc_rfg.missing',
          message_pl: 'Brak profilu NC RfG operatora.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'ncrfg',
        });
      }
      break;
    case 'equipment':
      if (!der.catalogs.device_catalog_ref) {
        blockers.push({
          code: 'der.device_catalog.missing',
          message_pl: 'Brak katalogu urządzenia.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'inverters',
        });
      }
      if (
        der.connection_side === 'dedicated_transformer' &&
        !der.catalogs.transformer_catalog_ref
      ) {
        blockers.push({
          code: 'der.dedicated_trafo.missing',
          message_pl: 'Brak transformatora dedykowanego (z katalogu).',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'topology',
        });
      }
      break;
    case 'protection':
    case 'protection_selectivity':
      if (!der.catalogs.protection_catalog_ref) {
        blockers.push({
          code: 'der.protection.missing',
          message_pl: 'Brak zabezpieczenia z katalogu.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'topology',
        });
      }
      if (!der.catalogs.ct_catalog_ref || !der.catalogs.vt_catalog_ref) {
        blockers.push({
          code: 'der.ct_vt.missing',
          message_pl: 'Brak przekładników CT/VT z katalogu.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'topology',
        });
      }
      // Naprawa eng.5: CT klasa musi być zabezpieczeniowa.
      if (der.catalogs.ct_catalog_ref) {
        const klasa = ctKlasaZDanychAlboKatalogu(der);
        if (klasa === null) {
          // V12K-232: brak rozstrzygnięcia klasy MUSI być nazwany. Wcześniej ta gałąź
          // milczała, więc oś kończyła się stanem „częściowo" z PUSTĄ listą powodów —
          // dokładnie dla przekładników z PRAWDZIWEGO katalogu, bo reguła szukała ich
          // identyfikatorów w równoległym katalogu frontu (zerowe pokrycie ID).
          blockers.push({
            code: 'der.ct_class.unresolved',
            message_pl:
              'Nie ustalono klasy dokładności przypisanego przekładnika prądowego, '
              + 'więc warunku klasy zabezpieczeniowej 5P/10P (IEC 61869-2) nie da się '
              + 'sprawdzić. Uzupełnij dane katalogowe przekładnika w modelu.',
            object_ref: der.id,
            target_screen: derKindToScreen(der.der_kind),
            target_tab: 'topology',
          });
        } else if (!isCtClassValidForProtection(klasa)) {
          blockers.push({
            code: 'der.ct_class.invalid',
            message_pl:
              `Klasa CT "${klasa}" jest pomiarowa, nie zabezpieczeniowa. `
              + `Wymagana klasa 5P/10P (IEC 61869-2). Wybierz przekładnik typu protection.`,
            object_ref: der.id,
            target_screen: derKindToScreen(der.der_kind),
            target_tab: 'topology',
          });
        }
      }
      // Naprawa eng.6: 87T wymaga CT dual-core dla transformatora ≥ 1.6 MVA.
      if (
        der.connection_side === 'dedicated_transformer' &&
        (der.nominal_power_kw ?? 0) >= 1600
      ) {
        if (der.catalogs.ct_catalog_ref) {
          const zastosowanie = ctZastosowanieZDanychAlboKatalogu(der);
          if (zastosowanie !== null && zastosowanie !== 'dual') {
            blockers.push({
              code: 'der.ct_87t_dual_core.required',
              message_pl:
                `Transformator dedykowany ≥ 1,6 MVA wymaga zabezpieczenia różnicowego 87T `
                + `(IEC 60255-13). Wybierz przekładnik dwurdzeniowy (5P + 0,5 łączony).`,
              object_ref: der.id,
              target_screen: derKindToScreen(der.der_kind),
              target_tab: 'topology',
            });
          }
        }
      }
      // Naprawa eng.11: anti-islanding (27/59/81U/81O) dla DER po nN/ZK/słupie.
      if (
        (der.connection_side === 'nN' || der.connection_side === 'at_zksn'
          || der.connection_side === 'at_branch_pole' || der.connection_side === 'at_cable_joint')
        && (der.der_kind === 'PV' || der.der_kind === 'FW')
        && !der.catalogs.protection_catalog_ref
      ) {
        blockers.push({
          code: 'der.anti_islanding.required',
          message_pl:
            `DER ${der.der_kind} po stronie ${der.connection_side} wymaga zabezpieczeń `
            + `anti-islanding (27/59/81U/81O — IEEE 1547 / NC RfG Art. 14). `
            + `Brak zabezpieczeń uniemożliwia ochronę przed pracą wyspową.`,
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'topology',
        });
      }
      break;
    case 'frt':
      if (!der.profiles.nc_rfg_profile_ref) {
        blockers.push({
          code: 'der.nc_rfg.missing',
          message_pl: 'Brak profilu NC RfG (LVRT wymaga operatora).',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'ncrfg',
        });
      }
      if (!der.profiles.lvrt_curve_ref) {
        blockers.push({
          code: 'der.lvrt.missing',
          message_pl: 'Brak krzywej LVRT z katalogu.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'frt-hvrt',
        });
      }
      break;
    case 'hvrt':
      if (!der.profiles.hvrt_curve_ref) {
        blockers.push({
          code: 'der.hvrt.missing',
          message_pl: 'Brak krzywej HVRT z katalogu.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'frt-hvrt',
        });
      }
      break;
    case 'nc_rfg':
      if (!der.profiles.nc_rfg_profile_ref) {
        blockers.push({
          code: 'der.nc_rfg.missing',
          message_pl: 'Brak profilu NC RfG operatora.',
          object_ref: der.id,
          target_screen: derKindToScreen(der.der_kind),
          target_tab: 'ncrfg',
        });
      }
      break;
    case 'report_osd':
    case 'report_technical':
      blockers.push({
        code: 'der.report.upstream_missing',
        message_pl:
          'Raport wymaga kompletu wyników wcześniejszych obliczeń (SC/VDROP/NC RfG/EQUIPMENT).',
        object_ref: der.id,
        target_screen: 'E-04',
        target_tab: 'list',
      });
      break;
  }
  return blockers;
}

function derKindToScreen(kind: 'PV' | 'BESS' | 'FW'): string {
  switch (kind) {
    case 'PV':
      return 'E-21';
    case 'BESS':
      return 'E-22';
    case 'FW':
      return 'E-23';
  }
}

/** Pomocnicza ekstrakcja "ready"/"partial" do badge'ów. */
export function summarizeReadiness(matrix: DerReadinessMatrix): {
  readonly ready: number;
  readonly partial: number;
  readonly blocked: number;
  readonly total: number;
} {
  const axes = Object.values(matrix);
  return {
    ready: axes.filter((s) => s === 'ready').length,
    partial: axes.filter((s) => s === 'partial').length,
    blocked: axes.filter((s) => s === 'blocked').length,
    total: axes.length,
  };
}

/** Pomocnicza projekcja na pełen empty matrix. */
export function emptyReadinessMatrix(): DerReadinessMatrix {
  return { ...EMPTY_DER_READINESS };
}

// =============================================================================
// Import mocy stacji — dana wejściowa oceny kierunku przepływu (V12K-226)
// =============================================================================

/**
 * Suma mocy czynnej ODBIORÓW przypisanych do stacji [kW], albo `null`, gdy
 * przypisania nie da się ustalić.
 *
 * DLACZEGO TA FUNKCJA ISTNIEJE (defekt, który ją wymusił). Ekran liczył import
 * stacji w miejscu wywołania, dwoma ZGADNIĘTYMI nazwami pól pod rzutowaniem
 * `as`, które wyłączyło kontrolę typów: filtrował odbiory po `station_ref`
 * (tego pola `Load` nie ma — należy do źródła z wariantem `nn_side`) i sumował
 * `nominal_power_kw ?? 0` (tego pola `Load` też nie ma — niesie `p_mw`).
 * Oba rzutowania dawały `undefined`, więc lista odbiorów była ZAWSZE pusta,
 * a import ZAWSZE zerowy. Ocena kierunku przepływu dzieli eksport przez import,
 * a przy imporcie zerowym stosunek jest nieskończony — więc KAŻDA stacja z DER
 * dostawała werdykt „krytyczny eksport" z żądaniem studium NC RfG ramp-down
 * i uzgodnienia z OSD, niezależnie od rzeczywistych odbiorów.
 *
 * PRZYPISANIE ODBIORU DO STACJI idzie prawdziwą drogą modelu: `Substation`
 * niesie `bus_refs`, a `Load` niesie `bus_ref` — odbiór należy do stacji, gdy
 * jego szyna jest jedną z szyn tej stacji.
 *
 * `null` ZNACZY „NIE WIEM", NIE „ZERO". Brak snapshotu albo stacja nieobecna w
 * modelu daje `null`, a wtedy oceny kierunku przepływu NIE WOLNO policzyć:
 * zero importu jest twierdzeniem o sieci (stacja bez odbiorów, cała generacja
 * idzie na eksport), a nie zapisem braku wiedzy.
 */
export function sumStationLoadImportKw(
  snapshot: {
    readonly substations?: ReadonlyArray<{ readonly ref_id?: string; readonly bus_refs?: readonly string[] }>;
    readonly loads?: ReadonlyArray<{ readonly bus_ref?: string; readonly p_mw?: number }>;
  } | null,
  stationId: string,
): number | null {
  if (!snapshot) return null;
  const stacja = (snapshot.substations ?? []).find((s) => s.ref_id === stationId);
  if (!stacja) return null;
  const szyny = new Set(stacja.bus_refs ?? []);
  if (szyny.size === 0) return null;

  let sumaMw = 0;
  for (const odbior of snapshot.loads ?? []) {
    if (odbior.bus_ref === undefined || !szyny.has(odbior.bus_ref)) continue;
    // `p_mw` jest w kontrakcie wymagane; brak wartości oznacza model niezgodny z
    // kontraktem, więc nie zgadujemy zera — cały import staje się nieznany.
    if (typeof odbior.p_mw !== 'number' || !Number.isFinite(odbior.p_mw)) return null;
    sumaMw += odbior.p_mw;
  }
  return sumaMw * 1000;
}

// =============================================================================
// Złożenie oceny DER z bramką MODELU (V12K-231, karta F-K8 faza 1)
// =============================================================================

/**
 * Bramka modelu dla jednego typu analizy — wycinek odpowiedzi
 * `GET /api/cases/{id}/analysis-eligibility` potrzebny do złożenia.
 */
export interface BramkaModelu {
  readonly eligible: boolean;
  readonly powody_pl: readonly string[];
}

/** Osie macierzy DER, dla których backend ma ODPOWIADAJĄCY gate modelu. */
const OS_DO_TYPU_ANALIZY: Partial<Record<keyof DerReadinessMatrix, 'SC_3F' | 'SC_2F' | 'SC_1F'>> = {
  sc_3f: 'SC_3F',
  sc_2f: 'SC_2F',
  sc_1f: 'SC_1F',
};

/**
 * Złóż ocenę per-DER z bramką MODELU. Zwraca osie o statusie nie lepszym niż
 * gorsza z dwóch ocen, z powodami z obu poziomów.
 *
 * DLACZEGO SKŁADAMY, A NIE PODMIENIAMY (rozstrzygnięcie karty F-K8). Obie oceny
 * odpowiadają na RÓŻNE pytania i żadna nie zastępuje drugiej:
 *
 *  - macierz DER: „czy TEN wytwórca ma dane potrzebne do analizy" (katalog
 *    urządzenia, punkt przyłączenia, model zwarciowy),
 *  - bramka modelu (`analysis-eligibility`): „czy analiza da się policzyć na CAŁEJ
 *    sieci" (np. SC_1F wymaga składowej zerowej gałęzi ORAZ modelu uziemienia
 *    punktu neutralnego — bez tego prąd doziemny jest nieokreślony).
 *
 * DEFEKT, KTÓRY TO WYMUSIŁ: oś nazwana „SC1F" świeciła `ready` wyłącznie na
 * podstawie danych per-DER, więc projektant czytał „analiza gotowa", a uruchomienie
 * biegu było odrzucane bramką modelu. Rozjazd pogłębiła zmiana z tej doby, która
 * podniosła brak modelu uziemienia z INFO do BLOKERA — słusznie fizycznie, ale
 * macierz DER o tym nie wiedziała.
 *
 * Osie BEZ odpowiednika w bramce (`sc_2fg`, spadek napięcia, zabezpieczenia, FRT,
 * raporty) zostają nietknięte — dopisanie im mapowania „po podobieństwie" byłoby
 * zgadywaniem, a nie złożeniem faktów.
 *
 * `bramki` puste (ocena modelu jeszcze nie pobrana) NIE zmienia niczego: brak
 * wiedzy o bramce nie może ani pogorszyć, ani polepszyć oceny per-DER.
 */
export function zlozZBramkaModelu(
  osie: readonly AggregatedReadinessAxis[],
  bramki: Readonly<Partial<Record<'SC_3F' | 'SC_2F' | 'SC_1F', BramkaModelu>>>,
): AggregatedReadinessAxis[] {
  return osie.map((os) => {
    const typ = OS_DO_TYPU_ANALIZY[os.axis];
    if (!typ) return os;
    const bramka = bramki[typ];
    if (!bramka || bramka.eligible) return os;

    const powodyModelu = bramka.powody_pl.map((message_pl) => ({
      code: 'model.analysis_ineligible',
      message_pl: `Model: ${message_pl}`,
      object_ref: '',
      target_screen: 'engineering-readiness',
      target_tab: 'list',
    }));
    return {
      ...os,
      // Gorsza z dwóch ocen. `not_applicable` / `no_module` zostawiamy — bramka
      // modelu nie czyni analizy DOTYCZĄCĄ wytwórcy, którego ona nie dotyczy.
      status:
        os.status === 'not_applicable' || os.status === 'no_module' ? os.status : 'blocked',
      blockers: [...os.blockers, ...powodyModelu],
    };
  });
}
