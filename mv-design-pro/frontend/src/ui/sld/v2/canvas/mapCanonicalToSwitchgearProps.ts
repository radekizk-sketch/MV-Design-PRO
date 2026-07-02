/**
 * Mapuje kanoniczne propsy GPZ (`GpzCanonicalRendererProps`) na propsy
 * `GpzSwitchgearRenderer`. Czysta funkcja — bez efektów ubocznych, bez fizyki.
 *
 * Cel: `SldCanvasV2` może renderować `GpzSwitchgearRenderer` zamiast
 * `GpzCanonicalRenderer`, zachowując IDENTYCZNY kontrakt callbacków (aparaty
 * emitują te same `${bayRef}#${kind}` apparatusId).
 *
 * Decyzja produktowa: NIE przenosimy badge'y stanu (SPZ/SCO/OWG/NZ/...) ani
 * pomiarów transformatora typu temperatura oleju / UARN / NZACZ — pozostają
 * niezmapowane. Pomiary P/Q/I pola są przepuszczane (na razie puste; w
 * kolejnej fazie wypełniane z solwerów).
 */

import type {
  BayMeasurements as CanonicalBayMeasurements,
  CanonicalGpzBay,
  CanonicalGpzCoupler,
  CanonicalGpzHvSection,
  CanonicalGpzSection,
  GpzCanonicalRendererProps,
} from '../renderer/GpzCanonicalRenderer';
import type {
  BayMeasurements as SwitchgearBayMeasurements,
  GpzBayDescriptor,
  GpzCouplerDescriptor,
  GpzSectionDescriptor,
  GpzSwitchgearRendererProps,
} from '../renderer/GpzSwitchgearTypes';
import type { FieldRole } from '../domain/apparatusContracts';

/** Zwraca `v`, jeśli jest skończoną liczbą; w przeciwnym razie `undefined`. */
const nn = (v: number | null | undefined): number | undefined =>
  typeof v === 'number' ? v : undefined;

function mapMeasurements(
  m: CanonicalBayMeasurements | null | undefined,
): SwitchgearBayMeasurements | undefined {
  if (m === null || m === undefined) return undefined;
  const raw: SwitchgearBayMeasurements = {
    p: nn(m.pMw),
    q: nn(m.qMvar),
    i1: nn(m.i1A),
    i2: nn(m.i2A),
    i3: nn(m.i3A),
    f: nn(m.fHz),
    u12: nn(m.u12Kv),
    u23: nn(m.u23Kv),
    u31: nn(m.u31Kv),
  };
  const cleaned: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined) cleaned[key] = value;
  }
  if (Object.keys(cleaned).length === 0) return undefined;
  return cleaned as SwitchgearBayMeasurements;
}

function mapBay(b: CanonicalGpzBay): GpzBayDescriptor {
  return {
    bayRef: b.bayRef,
    fieldRole: b.fieldRole as FieldRole,
    designation: b.feederName ?? b.bayNumber ?? b.bayRef,
    bayNumber: b.bayNumber ?? undefined,
    feederName: b.feederName ?? undefined,
    hasMissingRequiredDevice: false,
    cbState: b.cbState,
    dsState: b.dsState,
    esState: b.esState,
    qDesignations: b.qDesignations
      ? {
          cb: b.qDesignations.cb,
          // Switchgear legacy `ds` = canonical `dsLin`.
          ds: b.qDesignations.dsLin,
          dsLin: b.qDesignations.dsLin,
          dsBus: b.qDesignations.dsBus,
          es: b.qDesignations.es,
          ct: b.qDesignations.ct,
        }
      : undefined,
    measurements: mapMeasurements(b.measurements),
    inManipulation: b.inManipulation,
    protectionCodes: b.protectionCodes,
    outgoingFeeder: b.destinationLabel ? { destination: b.destinationLabel } : undefined,
  };
}

function mapSection(s: CanonicalGpzSection): GpzSectionDescriptor {
  return {
    sectionId: s.sectionId,
    order: s.order,
    name: s.label,
    busVoltageKv: s.busVoltageKv,
    bays: s.bays.map(mapBay),
    sectionLabel: s.label,
  };
}

function mapHvSection(h: CanonicalGpzHvSection): GpzSectionDescriptor {
  return {
    sectionId: h.sectionId,
    order: h.order,
    name: h.label,
    busVoltageKv: h.busVoltageKv,
    bays: h.bays.map(mapBay),
    sectionLabel: h.label,
  };
}

function mapCoupler(c: CanonicalGpzCoupler): GpzCouplerDescriptor {
  return {
    couplerId: c.couplerId,
    leftSectionId: c.leftSectionId,
    rightSectionId: c.rightSectionId,
    designation: c.designation,
    closed: c.closedState,
  };
}

export function mapCanonicalToSwitchgearProps(
  c: GpzCanonicalRendererProps,
): GpzSwitchgearRendererProps {
  const hvKvLookup = c.transformers[0]?.uhvKv ?? c.hvSections?.[0]?.busVoltageKv;
  return {
    id: c.id,
    x: c.x,
    y: c.y,
    name: c.name,
    voltageHighKv: hvKvLookup ?? 110,
    voltageHighKvKnown: typeof hvKvLookup === 'number',
    voltageLowKv: c.sections[0]?.busVoltageKv ?? c.transformers[0]?.ulvKv ?? 15,
    sections: c.sections.map(mapSection),
    couplers: c.couplers.map(mapCoupler),
    hvSections: c.hvSections?.map(mapHvSection),
    transformerCount: c.transformers.length,
    transformerMeasurements: c.transformers.map((t) => ({ apparentMva: t.snMva })),
    transformerRefs: c.transformers.map((t) => t.transformerRef),
  };
}
