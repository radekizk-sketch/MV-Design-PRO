/**
 * S9-6 — wejścia eksportów SEMANTYCZNYCH (IEC 61850 SCD, IEC 61970/61968 CIM)
 * budowane z REALNEJ migawki ENM.
 *
 * KLASA, NIE INSTANCJA: audyt nazwał pusty DXF (E-2), ale ten sam mechanizm
 * („generator wołany z pustymi tablicami") dotyczył WSZYSTKICH trzech
 * eksportów danych — pomiar przed naprawą: DXF 176 B / SCD 169 B / CIM 220 B,
 * czyli w każdym przypadku sam nagłówek formatu bez ANI JEDNEGO obiektu.
 * Naprawa DXF bez tych dwóch zostawiłaby dwie identyczne pułapki, więc
 * wchodzą do karty razem z nim.
 *
 * ŹRÓDŁEM JEST MIGAWKA ENM (nie scena): SCD i CIM opisują MODEL sieci
 * (stacje, poziomy napięć, pola, aparaty, odcinki, transformatory), a nie
 * rysunek — czytanie ich z geometrii byłoby wywodzeniem danych z obrazka.
 * Rysunek ma własny tor (`svgPrimitives.ts` → DXF/PDF).
 *
 * ZERO FABRYKACJI: żaden identyfikator ani parametr nie jest zmyślany.
 * Elementy bez wymaganych danych (np. pole bez przypisanego aparatu) trafiają
 * do eksportu ze swoją realną, uboższą treścią; nie dorabiamy im wyposażenia.
 * Nazwy własne biorą `designation`/`name` z modelu, identyfikatory — `ref_id`.
 */
import type { Bay, Branch, EnergyNetworkModel, Substation } from '../../../../types/enm';
import { fieldRoleLabelPl } from '../../v2/station-rozdzielnia/contract';
import { szynyStacji } from '../../../shared/szynyStacji';
import { selectStationDistributionTransformers, stationRefOfTransformer } from '../../../shared/transformatoryStacji';
import type { Iec61850Bay, Iec61850Equipment, Iec61850ExportInput, Iec61850VoltageLevel } from '../../v2/export/exportIec61850';
import type {
  CimAcLineSegment,
  CimBay,
  CimBreaker,
  CimExportInput,
  CimPowerTransformer,
  CimSubstation,
  CimVoltageLevel,
} from '../../v2/export/exportCim';


/** Typ aparatu ENM → klasa urządzenia SCL (IEC 61850-6, tabela ConductingEquipment).
 *  `null` = element nie jest aparatem łączeniowym pola (nie trafia do SCD). */
function sclEquipmentType(branch: Branch): Iec61850Equipment['type'] | null {
  switch (branch.type) {
    case 'breaker':
      return 'CBR';
    case 'switch':
    case 'disconnector':
    case 'bus_coupler':
      return 'DIS';
    case 'fuse':
      // IEC 61850-6 nie ma osobnej klasy bezpiecznika — w praktyce OSD
      // opisują go jako rozłącznik (DIS). Zapis jawny zamiast pominięcia:
      // pole z bezpiecznikiem NIE może wyjść z eksportu jako puste.
      return 'DIS';
    default:
      return null;
  }
}

function substationName(substation: Substation): string {
  return substation.designation?.trim() || substation.name || substation.ref_id;
}

function bayName(bay: Bay): string {
  return bay.bay_number?.trim() ? `Pole ${bay.bay_number}` : bay.name || bay.ref_id;
}

/**
 * Migawka ENM → wejście SCD. Grupowanie: stacja → poziom napięcia (z szyn
 * stacji) → pola tej stacji na szynach tego poziomu → aparaty pola.
 */
export function buildIec61850Input(snapshot: EnergyNetworkModel, projectId?: string | null): Iec61850ExportInput {
  const busVoltage = new Map(snapshot.buses.map((bus) => [bus.ref_id, bus.voltage_kv]));
  const branchByRef = new Map(snapshot.branches.map((branch) => [branch.ref_id, branch]));

  const substations = snapshot.substations.map((substation) => {
    const baysOfStation = snapshot.bays.filter((bay) => bay.substation_ref === substation.ref_id);
    // SZYNY-STACJI-LUSTRO: poziomy napięcia z szyn stacji z jednego lustra `szynyStacji`.
    const voltages = Array.from(
      new Set(
        [...szynyStacji(substation, snapshot.branches)]
          .map((ref) => busVoltage.get(ref))
          .filter((kv): kv is number => typeof kv === 'number'),
      ),
    ).sort((a, b) => b - a);

    const voltageLevels: Iec61850VoltageLevel[] = voltages.map((kv) => {
      const bays: Iec61850Bay[] = baysOfStation
        .filter((bay) => busVoltage.get(bay.bus_ref) === kv)
        .map((bay) => {
          const equipment: Iec61850Equipment[] = bay.equipment_refs
            .map((ref) => branchByRef.get(ref))
            .filter((branch): branch is Branch => branch !== undefined)
            .map((branch) => ({ type: sclEquipmentType(branch), branch }))
            .filter((entry): entry is { type: Iec61850Equipment['type']; branch: Branch } => entry.type !== null)
            .map((entry) => ({
              name: entry.branch.ref_id,
              type: entry.type,
              desc: entry.branch.name,
            }));
          // Transformator pola TR jest aparatem stacji, nie gałęzią pola —
          // dokładamy go z listy transformatorów stacji, żeby pole
          // transformatorowe nie wyszło puste.
          // SZYNY-STACJI-LUSTRO: transformatory ROZDZIELCZE stacji z jednej reguły (blokowy
          // transformator źródła DER nie jest aparatem pola TR).
          if (bay.bay_role === 'TR') {
            for (const transformer of selectStationDistributionTransformers(snapshot, substation)) {
              equipment.push({ name: transformer.ref_id, type: 'PTR', desc: transformer.name });
            }
          }
          // Opis (`desc`) obiektu SCD/CIM = nazwa roli z kanonu słownictwa ról pól (karta #141).
          return { name: bayName(bay), desc: fieldRoleLabelPl(bay.bay_role), equipment };
        });
      return { name: `${kv} kV`, voltage_kv: kv, bays };
    });

    return { name: substationName(substation), desc: substation.name, voltageLevels };
  });

  return { substations, projectId: projectId ?? undefined };
}

/** Migawka ENM → wejście CIM. */
export function buildCimInput(snapshot: EnergyNetworkModel): CimExportInput {
  const busVoltage = new Map(snapshot.buses.map((bus) => [bus.ref_id, bus.voltage_kv]));
  const substations: CimSubstation[] = snapshot.substations.map((substation) => ({
    mrid: substation.ref_id,
    name: substationName(substation),
  }));

  const voltageLevels: CimVoltageLevel[] = [];
  const voltageLevelMridByBus = new Map<string, string>();
  for (const substation of snapshot.substations) {
    // SZYNY-STACJI-LUSTRO: kontener poziomu napięcia obejmuje KAŻDĄ szynę stacji z lustra
    // `szynyStacji` (pole na zacisku pola trafia do poziomu swojej stacji); szyna wspólna
    // dwóch stacji należy do pierwszej w kolejności modelu (jak `stacjaSzyn`).
    const szyny = [...szynyStacji(substation, snapshot.branches)].sort();
    const voltages = Array.from(
      new Set(
        szyny
          .map((ref) => busVoltage.get(ref))
          .filter((kv): kv is number => typeof kv === 'number'),
      ),
    ).sort((a, b) => b - a);
    for (const kv of voltages) {
      const mrid = `${substation.ref_id}_${String(kv).replace('.', '-')}kV`;
      voltageLevels.push({
        mrid,
        name: `${substationName(substation)} — ${kv} kV`,
        substation_mrid: substation.ref_id,
        baseVoltage_kv: kv,
      });
      for (const busRef of szyny) {
        if (busVoltage.get(busRef) === kv && !voltageLevelMridByBus.has(busRef)) {
          voltageLevelMridByBus.set(busRef, mrid);
        }
      }
    }
  }

  const bays: CimBay[] = snapshot.bays
    .map((bay) => ({ bay, vl: voltageLevelMridByBus.get(bay.bus_ref) }))
    .filter((entry): entry is { bay: Bay; vl: string } => entry.vl !== undefined)
    .map((entry) => ({ mrid: entry.bay.ref_id, name: bayName(entry.bay), voltageLevel_mrid: entry.vl }));

  const acLineSegments: CimAcLineSegment[] = snapshot.branches
    .filter((branch): branch is Extract<Branch, { type: 'cable' | 'line_overhead' }> =>
      branch.type === 'cable' || branch.type === 'line_overhead',
    )
    .map((branch) => ({
      mrid: branch.ref_id,
      name: branch.name || branch.ref_id,
      length_m: branch.length_km * 1000,
      r_ohm: branch.r_ohm_per_km * branch.length_km,
      x_ohm: branch.x_ohm_per_km * branch.length_km,
      ...(typeof branch.b_siemens_per_km === 'number'
        ? { b_us: branch.b_siemens_per_km * branch.length_km * 1e6 }
        : {}),
    }));

  // SZYNY-STACJI-LUSTRO: kontener transformatora = stacja z jednej reguły „transformatory
  // stacji” (deklaracja, przy jej braku koniec na szynie stacji; blokowy DER też ma stację).
  const powerTransformers: CimPowerTransformer[] = snapshot.transformers.map((transformer) => ({
    mrid: transformer.ref_id,
    name: transformer.name || transformer.ref_id,
    substation_mrid: stationRefOfTransformer(snapshot, transformer.ref_id) ?? '',
    ratedS_mva: transformer.sn_mva,
    hv_kv: transformer.uhv_kv,
    lv_kv: transformer.ulv_kv,
  }));

  const bayOfEquipment = new Map<string, string>();
  for (const bay of snapshot.bays) {
    for (const ref of bay.equipment_refs) bayOfEquipment.set(ref, bay.ref_id);
  }
  const breakers: CimBreaker[] = snapshot.branches
    .filter((branch) => sclEquipmentType(branch) !== null)
    .map((branch) => ({
      mrid: branch.ref_id,
      name: branch.name || branch.ref_id,
      bay_mrid: bayOfEquipment.get(branch.ref_id) ?? '',
      normalOpen: branch.status === 'open',
    }));

  return {
    substations,
    voltageLevels,
    bays,
    acLineSegments,
    powerTransformers,
    breakers,
    modelMrid: snapshot.header.hash_sha256 || undefined,
  };
}

/** Liczba obiektów niesionych przez wejście SCD — podstawa bramki. */
export function iec61850ObjectCount(input: Iec61850ExportInput): number {
  return input.substations.reduce(
    (total, substation) =>
      total +
      1 +
      substation.voltageLevels.reduce(
        (levelTotal, level) =>
          levelTotal + 1 + level.bays.reduce((bayTotal, bay) => bayTotal + 1 + bay.equipment.length, 0),
        0,
      ),
    0,
  );
}

/** Liczba obiektów niesionych przez wejście CIM — podstawa bramki. */
export function cimObjectCount(input: CimExportInput): number {
  return (
    input.substations.length +
    input.voltageLevels.length +
    input.bays.length +
    input.acLineSegments.length +
    input.powerTransformers.length +
    input.breakers.length
  );
}
