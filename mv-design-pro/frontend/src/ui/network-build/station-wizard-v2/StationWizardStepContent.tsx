/**
 * StationWizardStepContent — router treści per krok 1-17 Kreatora.
 *
 * Każdy krok renderuje minimalny widok demonstracyjny zasilany kontraktem
 * inżynierskim z odpowiedniego modułu. Pełne formularze formularzowe to
 * praca dla kolejnych iteracji — tutaj prezentujemy strukturę.
 */
import { clsx } from 'clsx';

import type { StationWizardStepId } from './stationWizardContract';
import { getStationWizardStep } from './stationWizardContract';
import { MiniBaySldPreview } from './MiniBaySldPreview';
import { ReadinessMatrixGrid } from './ReadinessMatrixGrid';
import { VENDOR_SWITCHGEAR_CATALOG, type VendorSwitchgearTemplate } from './vendorSwitchgearCatalog';
import { INTERLOCKING_RULES, buildInterlockMatrix } from './interlockingRules';
import { APPARATUS_REFERENCE_CATALOG } from './apparatusCatalogContract';
import { TRANSFORMER_REFERENCE_CATALOG, computeTransformerNominalCurrents } from './transformerContract';
import { CT_REFERENCE_200_3CORE } from './ctMultiCoreContract';
import { VT_REFERENCE_4WINDING } from './vtMultiWindingContract';
import { METER_REFERENCE_CATALOG } from './metersContract';
import { LV_SWITCHGEAR_STANDARD_630 } from './lvSwitchgearContract';
import { OSD_PROFILES, NC_RFG_REQUIREMENTS } from './ncRfgContract';
import { EN_50160_HARMONIC_LIMITS } from './powerQualityContract';
import { STANDARD_BAY_SCADA_SIGNALS } from './scadaInfrastructureContract';
import {
  buildReadinessMatrix,
  type ReadinessAxisState,
} from './readinessMatrixContract';
import { CABLE_REFERENCE_XRUHAKXS_120 } from './cableSelectionContract';
import { FIELD_PROTECTION_PROFILES } from './protectionContract';

export interface StationWizardStepContentProps {
  readonly activeStep: StationWizardStepId;
  readonly selectedVendorId?: string;
  readonly readinessStates?: readonly ReadinessAxisState[];
}

export function StationWizardStepContent(
  props: StationWizardStepContentProps,
): JSX.Element {
  const { activeStep, selectedVendorId, readinessStates } = props;
  const step = getStationWizardStep(activeStep);

  return (
    <section
      data-testid="station-wizard-step-content"
      data-active-step={activeStep}
      className="flex h-full flex-col overflow-hidden"
    >
      <StepHeader step={step} />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {renderStepBody(activeStep, selectedVendorId, readinessStates)}
      </div>
    </section>
  );
}

function StepHeader({ step }: { step: ReturnType<typeof getStationWizardStep> }) {
  return (
    <header
      data-testid="step-header"
      className="flex shrink-0 items-center gap-3 border-b border-[#1a2a3a] bg-[#080e18] px-4 py-3"
    >
      <span className="grid h-8 w-8 place-items-center rounded bg-[#00d4ff10] text-sm font-bold text-[#00d4ff]">
        {step.n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-base">{step.icon}</span>
          <h2 className="text-sm font-bold text-scada-text">{step.label}</h2>
        </div>
        <p className="mt-0.5 text-[11px] text-[#8a9aaa]">{step.sub}</p>
      </div>
      <span className="rounded border border-[#1a2a3a] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#4a6a8a]">
        {step.group}
      </span>
    </header>
  );
}

function renderStepBody(
  stepId: StationWizardStepId,
  selectedVendorId: string | undefined,
  readinessStates: readonly ReadinessAxisState[] | undefined,
): JSX.Element {
  switch (stepId) {
    case 'cable':       return <StepCable />;
    case 'switchgear':  return <StepSwitchgear selectedVendorId={selectedVendorId} />;
    case 'bays':        return <StepBays selectedVendorId={selectedVendorId} />;
    case 'apparatus':   return <StepApparatus />;
    case 'ct':          return <StepCt />;
    case 'vt':          return <StepVt />;
    case 'meters':      return <StepMeters />;
    case 'trafo':       return <StepTrafo />;
    case 'earthing':    return <StepEarthing />;
    case 'nn':          return <StepNn />;
    case 'sources':     return <StepSources />;
    case 'pq':          return <StepPq />;
    case 'protection':  return <StepProtection />;
    case 'ncrfg':       return <StepNcrfg />;
    case 'infra':       return <StepInfra />;
    case 'network':     return <StepNetwork />;
    case 'readiness':   return <StepReadiness readinessStates={readinessStates} />;
  }
}

// ============================================================================
// Krok 1 — Cable
// ============================================================================
function StepCable() {
  const c = CABLE_REFERENCE_XRUHAKXS_120;
  return (
    <CardSection label="Kabel referencyjny SN" testId="step-body-cable">
      <DataGrid rows={[
        { k: 'Typ', v: c.catalogRef },
        { k: 'Materiał', v: `${c.conductor} + ${c.insulation}` },
        { k: 'Przekrój żyły', v: `${c.conductorCrossSectionMm2} mm²` },
        { k: 'Przekrój powrotu', v: `${c.screenCrossSectionMm2} mm²` },
        { k: 'Napięcie znamionowe', v: `${c.voltageKv} kV` },
        { k: 'Prąd dopuszczalny Idd', v: `${c.ratedAmpacityA} A` },
        { k: 'R₀', v: `${c.resistanceOhmPerKm.toFixed(3)} Ω/km` },
        { k: 'X₀', v: `${c.reactanceOhmPerKm.toFixed(3)} Ω/km` },
        { k: 'Izw (żyły robocze)', v: `${c.shortCircuitConductor1sKa} kA · 1 s` },
        { k: 'Izw (żyły powrotne)', v: `${c.shortCircuitScreen1sKa} kA · 1 s` },
      ]} />
    </CardSection>
  );
}

// ============================================================================
// Krok 2 — Switchgear (vendor templates)
// ============================================================================
function StepSwitchgear({ selectedVendorId }: { selectedVendorId?: string }) {
  return (
    <CardSection label="Wybór rozdzielnicy producenta" testId="step-body-switchgear">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {VENDOR_SWITCHGEAR_CATALOG.map((t) => (
          <VendorCard key={t.id} template={t} selected={selectedVendorId === t.id} />
        ))}
      </div>
    </CardSection>
  );
}

function VendorCard({ template, selected }: { template: VendorSwitchgearTemplate; selected: boolean }) {
  return (
    <div
      data-testid={`vendor-card-${template.id}`}
      data-selected={selected ? 'true' : 'false'}
      className={clsx(
        'rounded border p-2.5 transition-colors',
        selected ? 'border-[#00d4ff] bg-[#00d4ff08]' : 'border-[#1a2a3a] bg-[#0a1420]',
      )}
    >
      <div className="text-[11px] font-bold text-scada-text">{template.fullName}</div>
      <div className="text-[10px] text-[#8a9aaa]">
        Producent: <span className="text-scada-text">{template.manufacturerRef}</span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-[#8a9aaa]">
        <div>U: {template.voltageLevels.join('/')} kV</div>
        <div>In szyny: {template.ratedBusbarCurrent} A</div>
        <div>Ik 1s: {template.shortTimeCurrent} kA</div>
        <div>Izolacja: {template.insulation}</div>
        <div>IAC: {template.arcClass}</div>
        <div>IP: {template.ipRating}</div>
        <div>LSC: {template.lscCategory}</div>
        <div>Pól: {template.defaultBays.length}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Krok 3 — Bays + interlocking
// ============================================================================
function StepBays({ selectedVendorId }: { selectedVendorId?: string }) {
  const template = selectedVendorId
    ? VENDOR_SWITCHGEAR_CATALOG.find((t) => t.id === selectedVendorId)
    : VENDOR_SWITCHGEAR_CATALOG[0];
  if (!template) {
    return <EmptyHint message="Najpierw wybierz rozdzielnicę w kroku 2." />;
  }
  const matrix = buildInterlockMatrix();
  return (
    <div className="flex flex-col gap-4" data-testid="step-body-bays">
      <CardSection label={`Mini-SLD pól dla ${template.seriesName}`}>
        <div className="h-[280px]">
          <MiniBaySldPreview template={template} />
        </div>
      </CardSection>
      <CardSection label="Matryca blokad BHP (PN-EN 62271-200 §5.10)">
        <table className="w-full text-[11px]" data-testid="interlock-matrix-table">
          <thead>
            <tr className="border-b border-[#1a2a3a] text-[10px] uppercase tracking-wider text-[#4a6a8a]">
              <th className="py-1 text-left">Akcja</th>
              <th className="text-left">Warunek blokady</th>
              <th className="text-left">Norma</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((cell, i) => (
              <tr key={i} className="border-b border-[#0a1420]">
                <td className="py-1 font-mono text-scada-text">{cell.action} {cell.target}</td>
                <td className="text-red-300">{cell.condition}</td>
                <td className="text-[#8a9aaa]">{cell.normRef}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-[10px] text-[#4a6a8a]">
          Łącznie {INTERLOCKING_RULES.length} reguł kanonicznych.
        </div>
      </CardSection>
    </div>
  );
}

// ============================================================================
// Krok 4 — Apparatus catalog
// ============================================================================
function StepApparatus() {
  return (
    <CardSection label="Aparaty Q1/Q2/Q3 z katalogu" testId="step-body-apparatus">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[#1a2a3a] text-[10px] uppercase tracking-wider text-[#4a6a8a]">
            <th className="py-1 text-left">Designacja</th>
            <th className="text-left">Typ</th>
            <th className="text-right">Ur [kV]</th>
            <th className="text-right">Ir [A]</th>
            <th className="text-right">Ik 1s [kA]</th>
          </tr>
        </thead>
        <tbody>
          {APPARATUS_REFERENCE_CATALOG.map((a) => (
            <tr key={a.catalogRef} className="border-b border-[#0a1420]">
              <td className="py-1 text-scada-text">{a.designation}</td>
              <td className="text-[#8a9aaa]">{a.type}</td>
              <td className="text-right font-mono">{a.ratedVoltageKv}</td>
              <td className="text-right font-mono">{a.ratedCurrentA}</td>
              <td className="text-right font-mono">{a.ratedShortTimeCurrentKa}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardSection>
  );
}

// ============================================================================
// Krok 5 — CT 3-rdzeniowy
// ============================================================================
function StepCt() {
  return (
    <CardSection label="CT 200/5/5/5A — 3-rdzeniowy (Excel MT880)" testId="step-body-ct">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[#1a2a3a] text-[10px] uppercase tracking-wider text-[#4a6a8a]">
            <th className="py-1 text-left">Rdzeń</th>
            <th className="text-left">Klasa</th>
            <th className="text-right">Sn [VA]</th>
            <th className="text-right">FS/ALF</th>
            <th className="text-left">Odbiornik</th>
          </tr>
        </thead>
        <tbody>
          {CT_REFERENCE_200_3CORE.map((c) => (
            <tr key={c.id} className="border-b border-[#0a1420]">
              <td className="py-1 font-bold text-scada-text">{c.id}</td>
              <td className="text-scada-text">{c.accuracyClass}</td>
              <td className="text-right font-mono">{c.ratedBurdenVa}</td>
              <td className="text-right font-mono">{c.fsOrAlf}</td>
              <td className="text-[#8a9aaa]">{c.destinationPl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardSection>
  );
}

// ============================================================================
// Krok 6 — VT 4-uzwojeniowy
// ============================================================================
function StepVt() {
  return (
    <CardSection label="VT 15:√3/0.1:√3 kV — 4-uzwojeniowy" testId="step-body-vt">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[#1a2a3a] text-[10px] uppercase tracking-wider text-[#4a6a8a]">
            <th className="py-1 text-left">Uzwojenie</th>
            <th className="text-left">Klasa</th>
            <th className="text-right">Sn [VA]</th>
            <th className="text-left">Odbiornik</th>
          </tr>
        </thead>
        <tbody>
          {VT_REFERENCE_4WINDING.map((w) => (
            <tr key={w.id} className="border-b border-[#0a1420]">
              <td className="py-1 font-bold text-scada-text">{w.id}</td>
              <td className="text-scada-text">{w.accuracyClass}</td>
              <td className="text-right font-mono">{w.ratedBurdenVa}</td>
              <td className="text-[#8a9aaa]">{w.destinationPl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardSection>
  );
}

// ============================================================================
// Krok 7 — Meters
// ============================================================================
function StepMeters() {
  return (
    <CardSection label="Liczniki LZQJ / ZMD / MT880" testId="step-body-meters">
      <div className="grid gap-2 sm:grid-cols-3">
        {METER_REFERENCE_CATALOG.map((m) => (
          <div key={m.modelRef} className="rounded border border-[#1a2a3a] bg-[#0a1420] p-2 text-[11px]">
            <div className="font-bold text-scada-text">{m.modelRef}</div>
            <div className="text-[#8a9aaa]">{m.manufacturerRef}</div>
            <div className="mt-1 text-[10px]">
              <div>Klasa: {m.accuracyClass}</div>
              <div>Typ: {m.type}</div>
              <div>4Q: {m.fourQuadrant ? 'Tak' : 'Nie'}</div>
              <div>Burden: {m.burdenVa} VA</div>
            </div>
          </div>
        ))}
      </div>
    </CardSection>
  );
}

// ============================================================================
// Krok 8 — Transformator
// ============================================================================
function StepTrafo() {
  const t = TRANSFORMER_REFERENCE_CATALOG[0];
  const { primaryNominalA, secondaryNominalA } = computeTransformerNominalCurrents(t);
  return (
    <CardSection label="Transformator SN/nN" testId="step-body-trafo">
      <DataGrid rows={[
        { k: 'Model', v: t.catalogRef },
        { k: 'Sn', v: `${t.ratedPowerKva} kVA` },
        { k: 'U1/U2', v: `${t.primaryVoltageKv} / ${t.secondaryVoltageKv} kV` },
        { k: 'Grupa', v: t.vectorGroup },
        { k: 'uk', v: `${t.shortCircuitVoltagePct}%` },
        { k: 'Straty jałowe', v: `${t.noLoadLossW} W` },
        { k: 'Straty obciążeniowe', v: `${t.loadLossW} W` },
        { k: 'Chłodzenie', v: t.cooling },
        { k: 'Inrush factor', v: `${t.inrushFactor} × In` },
        { k: 'I1n (15 kV)', v: `${primaryNominalA.toFixed(2)} A` },
        { k: 'I2n (0.4 kV)', v: `${secondaryNominalA.toFixed(2)} A` },
      ]} />
    </CardSection>
  );
}

// ============================================================================
// Krok 9 — Earthing
// ============================================================================
function StepEarthing() {
  return (
    <CardSection label="Uziemienie stacji (PN-EN 50522)" testId="step-body-earthing">
      <DataGrid rows={[
        { k: 'Standard', v: 'PN-EN 50522 + ENEA "Dobór środków ochrony" 2021-06-30' },
        { k: 'Wymaganie', v: 'RB ≤ min(UF/IK1, U0·RE/(Un-U0))' },
        { k: 'Typowo dla tF=3.1s', v: 'UF = 87 V' },
        { k: 'Składowe IK1', v: 'ICs sekcji A + B + IAWSCz × n' },
        { k: 'Typy uziomów', v: 'otokowy + pionowy (kombinowane)' },
      ]} />
    </CardSection>
  );
}

// ============================================================================
// Krok 10 — Strona nN
// ============================================================================
function StepNn() {
  const sg = LV_SWITCHGEAR_STANDARD_630;
  return (
    <CardSection label={`Rozdzielnica nN: ${sg.catalogRef}`} testId="step-body-nn">
      <DataGrid rows={[
        { k: 'Producent', v: sg.manufacturerRef },
        { k: 'In szyny', v: `${sg.busbarRatedCurrentA} A` },
        { k: 'Ik 1s', v: `${sg.busbarShortTimeCurrentKa} kA` },
        { k: 'Form', v: sg.form },
        { k: 'IP', v: sg.ipRating },
        { k: 'Pól', v: `${sg.bays.length} / ${sg.maxBays} max` },
      ]} />
    </CardSection>
  );
}

// ============================================================================
// Krok 11 — Źródła OZE
// ============================================================================
function StepSources() {
  return (
    <CardSection label="Źródła OZE — PV / BESS / FW" testId="step-body-sources">
      <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
        <SourceTypeCard kind="PV" desc="Strings DC + MPPT + Voc temp correction" />
        <SourceTypeCard kind="BESS" desc="SOC range + RT efficiency + degradation" />
        <SourceTypeCard kind="FW" desc="P(v) curve cubic, cut-in/rated/cut-out" />
      </div>
    </CardSection>
  );
}

function SourceTypeCard({ kind, desc }: { kind: string; desc: string }) {
  return (
    <div className="rounded border border-[#1a2a3a] bg-[#0a1420] p-2">
      <div className="text-base font-bold text-[#00d4ff]">{kind}</div>
      <div className="text-[10px] text-[#8a9aaa]">{desc}</div>
    </div>
  );
}

// ============================================================================
// Krok 12 — Jakość energii
// ============================================================================
function StepPq() {
  return (
    <CardSection label="Limity harmonicznych PN-EN 50160" testId="step-body-pq">
      <div className="grid grid-cols-5 gap-1 text-[10px]">
        {EN_50160_HARMONIC_LIMITS.map((h) => (
          <div key={h.order} className="rounded border border-[#1a2a3a] bg-[#0a1420] p-1.5 text-center">
            <div className="text-[#4a6a8a]">Rząd {h.order}</div>
            <div className="font-bold text-scada-text">{h.voltageLimitPct.toFixed(1)}%</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-[#8a9aaa]">
        THDu limit = 8% · PST limit = 1.0 · PLT limit = 0.8
      </div>
    </CardSection>
  );
}

// ============================================================================
// Krok 13 — Zabezpieczenia
// ============================================================================
function StepProtection() {
  return (
    <div className="flex flex-col gap-3" data-testid="step-body-protection">
      {(['LINE', 'TRANSFORMER', 'DER'] as const).map((profileName) => (
        <CardSection key={profileName} label={`Profil ${profileName}`}>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[#1a2a3a] text-[10px] uppercase text-[#4a6a8a]">
                <th className="text-left">ANSI</th>
                <th className="text-left">Funkcja</th>
                <th className="text-right">Pickup</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_PROTECTION_PROFILES[profileName].map((f) => (
                <tr key={f.ansi} className="border-b border-[#0a1420]">
                  <td className="py-1 font-mono text-scada-text">{f.ansi}</td>
                  <td className="text-[#8a9aaa]">{f.labelPl}</td>
                  <td className="text-right font-mono">{f.pickup} {f.pickupUnit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardSection>
      ))}
    </div>
  );
}

// ============================================================================
// Krok 14 — NC RfG
// ============================================================================
function StepNcrfg() {
  return (
    <div className="flex flex-col gap-3" data-testid="step-body-ncrfg">
      <CardSection label="Profile polskich OSD">
        <div className="grid grid-cols-5 gap-2">
          {OSD_PROFILES.map((p) => (
            <div key={p.operatorRef} className="rounded border border-[#1a2a3a] bg-[#0a1420] p-2 text-[10px]">
              <div className="font-bold text-scada-text">{p.operatorRef}</div>
              <div className="text-[#8a9aaa]">droop {p.pfDroop.droopPct}%</div>
              <div className="text-[#8a9aaa]">LVRT {p.lvrtZeroVoltageMs} ms</div>
            </div>
          ))}
        </div>
      </CardSection>
      <CardSection label="Wymagania NC RfG (UE 2016/631)">
        <ul className="text-[11px]">
          {NC_RFG_REQUIREMENTS.slice(0, 8).map((r) => (
            <li key={r.article} className="border-b border-[#0a1420] py-1">
              <span className="font-mono text-[#00d4ff]">{r.article}</span>{' '}
              <span className="text-scada-text">{r.title}</span>{' '}
              <span className="text-[10px] text-[#4a6a8a]">
                · {r.appliesToModules.join('/')} · {r.mandatory ? 'mandatory' : 'optional'}
              </span>
            </li>
          ))}
        </ul>
      </CardSection>
    </div>
  );
}

// ============================================================================
// Krok 15 — SCADA / Infrastructure
// ============================================================================
function StepInfra() {
  return (
    <CardSection label="Sygnały SCADA IEC 61850 (typowe pole SN)" testId="step-body-infra">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[#1a2a3a] text-[10px] uppercase text-[#4a6a8a]">
            <th className="text-left">Node ID</th>
            <th className="text-left">LN</th>
            <th className="text-left">Typ</th>
            <th className="text-left">Opis</th>
          </tr>
        </thead>
        <tbody>
          {STANDARD_BAY_SCADA_SIGNALS.slice(0, 10).map((s) => (
            <tr key={s.nodeId} className="border-b border-[#0a1420]">
              <td className="py-1 font-mono text-[10px] text-scada-text">{s.nodeId}</td>
              <td className="font-mono text-[#00d4ff]">{s.logicalNode}</td>
              <td className="text-[#8a9aaa]">{s.signalType}</td>
              <td className="text-[#8a9aaa]">{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardSection>
  );
}

// ============================================================================
// Krok 16 — Analiza sieciowa
// ============================================================================
function StepNetwork() {
  return (
    <CardSection label="Obliczenia zwarciowe (IEC 60909-0)" testId="step-body-network">
      <DataGrid rows={[
        { k: 'Metoda', v: 'IEC 60909-0 (c·U / √3·Z)' },
        { k: 'Współczynnik c', v: '1.10 (max) / 1.00 (min)' },
        { k: 'Składowe Z', v: 'Z_system + Z_cable_line' },
        { k: 'Reguła κ', v: 'κ = 1.02 + 0.98·exp(-3·R/X)' },
        { k: 'Udarowy ip', v: 'ip = κ·√2·Ik"' },
        { k: 'Cieplny Ith', v: 'Ith = Ik"·√(m+n)' },
      ]} />
    </CardSection>
  );
}

// ============================================================================
// Krok 17 — Macierz gotowości (FINAL)
// ============================================================================
function StepReadiness({ readinessStates }: { readinessStates?: readonly ReadinessAxisState[] }) {
  // Default: wszystkie partial — operator widzi co domknąć.
  const defaultStates: readonly ReadinessAxisState[] = readinessStates ??
    buildReadinessMatrix().map((a) => ({ axisId: a.id, status: 'partial' as const }));
  return (
    <div data-testid="step-body-readiness" className="h-full">
      <ReadinessMatrixGrid states={defaultStates} />
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function CardSection({
  label,
  children,
  testId,
}: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-[#1a2a3a] bg-[#080e18] p-3"
    >
      <div className="mb-2 border-b border-[#1a2a3a] pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#4a6a8a]">
        {label}
      </div>
      {children}
    </div>
  );
}

function DataGrid({ rows }: { rows: ReadonlyArray<{ k: string; v: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
      {rows.map((row, i) => (
        <div key={i} className="contents">
          <div className="text-[#8a9aaa]">{row.k}</div>
          <div className="text-scada-text">{row.v}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-[12px] text-[#8a9aaa]">
      {message}
    </div>
  );
}
