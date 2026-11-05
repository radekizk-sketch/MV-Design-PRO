/**
 * Konfigurator stacji SN/nN.
 *
 * Układ inspirowany makietą "Kreator Stacji KOMPLETNY": pionowy przepływ
 * projektowy, grupy techniczne i krok po kroku od przyłączenia SN do raportu.
 * Warstwa UI tylko prezentuje i zbiera parametry. Mutacje modelu pozostają w
 * operacjach domenowych i API.
 */

import { useState, type ReactNode } from 'react';

import {
  StationConfigBasicCard,
  type StationConfigBasicCardProps,
} from './cards/StationConfigBasicCard';
import {
  StationConfigTopologyCard,
  type StationConfigTopologyCardProps,
} from './cards/StationConfigTopologyCard';
import {
  StationConfigSnSwitchgearCard,
  type StationConfigSnSwitchgearCardProps,
} from './cards/StationConfigSnSwitchgearCard';
import {
  StationConfigBaysCard,
  type StationConfigBaysCardProps,
} from './cards/StationConfigBaysCard';
import {
  StationConfigTransformerCard,
  type StationConfigTransformerCardProps,
} from './cards/StationConfigTransformerCard';
import {
  StationConfigNnSwitchgearCard,
  type StationConfigNnSwitchgearCardProps,
} from './cards/StationConfigNnSwitchgearCard';
import type { LoadRow } from './cards/StationConfigLoadsCard';
import {
  StationConfigDerSourcesCard,
  type StationConfigDerSourcesCardProps,
} from './cards/StationConfigDerSourcesCard';
import {
  StationConfigProtectionCard,
  type StationConfigProtectionCardProps,
} from './cards/StationConfigProtectionCard';
import {
  StationConfigReadinessCard,
  type StationConfigReadinessCardProps,
} from './cards/StationConfigReadinessCard';
import type { MeasurementRow } from './przekladnikiStacji';
import type { UziemienieSekcjiSn } from '../station-der/audit2-api';
import type { DoziemienieSieci } from '../../results-inspector/types';
import { atrybutRoliAkcji, klasaAkcji } from '../../shared/akcjeStanow';
import { wielkoscPl } from '../../../ui2/wyniki/wzorzec/KartaWerdyktu';
import type { PolePomiaroweWiersz } from './polaPomiaroweStacji';
import {
  canonicalFieldRole,
  FIELD_ROLE_LABEL_PL,
  fieldLabelPluralPl,
  fieldRoleLabelPl,
  isSourceFieldRole,
} from '../../sld/v2/station-rozdzielnia/contract';

/** „Pola pomiarowe” — liczba mnoga etykiety roli z kanonu ról pól SN (jedno słownictwo). */
const ETYKIETA_POL_POMIAROWYCH = fieldLabelPluralPl(FIELD_ROLE_LABEL_PL.POMIAROWE);

export type StationConfigVisibleCardId =
  | 'basic'
  | 'sn-switchgear'
  | 'bays'
  | 'apparatus'
  | 'ct'
  | 'vt'
  | 'measurements'
  | 'transformer'
  | 'earthing'
  | 'nn-switchgear'
  | 'der-sources'
  | 'power-quality'
  | 'protection'
  | 'nc-rfg'
  | 'network-analysis'
  | 'readiness';

/** Przekładniki i pola pomiarowe stacji — wszystkie wiersze z modelu (`przekladnikiStacji.ts`,
 *  `polaPomiaroweStacji.ts`). */
export interface StationMeasurementsProps {
  readonly cts: readonly MeasurementRow[];
  readonly vts: readonly MeasurementRow[];
  readonly polaPomiarowe: readonly PolePomiaroweWiersz[];
}

export type StationConfigCardId = StationConfigVisibleCardId | 'topology';

/**
 * Uziemienie punktu neutralnego sieci SN stacji — fakty MODELU z backendu (karta
 * UX-04/POLE-ZU-SKLADOWA-ZEROWA, `enm.uziemienie_sekcji`); konfigurator niczego nie wybiera
 * i niczego nie liczy. `onDodajZespol` otwiera kreator zespołu uziemiającego dla szyn sekcji.
 */
export interface StationEarthingProps {
  readonly stan: 'brak_kontekstu' | 'ladowanie' | 'blad' | 'gotowe';
  readonly sekcje: readonly UziemienieSekcjiSn[];
  readonly przyczynaBraku: string | null;
  readonly bladPl: string | null;
  readonly onDodajZespol?: (szyny: readonly string[]) => void;
}

export interface StationConfiguratorProps {
  readonly basic: StationConfigBasicCardProps;
  readonly topology: StationConfigTopologyCardProps;
  readonly snSwitchgear: StationConfigSnSwitchgearCardProps;
  readonly bays: StationConfigBaysCardProps;
  readonly transformer: StationConfigTransformerCardProps;
  readonly nnSwitchgear: StationConfigNnSwitchgearCardProps;
  readonly derSources: StationConfigDerSourcesCardProps;
  readonly protection: StationConfigProtectionCardProps;
  readonly measurements: StationMeasurementsProps;
  readonly readiness: StationConfigReadinessCardProps;
  /** Brak = konfigurator poza kontekstem projektu (uziemienia nie ma skąd odczytać). */
  readonly earthing?: StationEarthingProps;
  readonly defaultCard?: StationConfigCardId;
  readonly onOpenCalculations?: () => void;
}

type StepGroup = 'SN' | 'Pomiary' | 'Stacja' | 'OZE' | 'Ochrona' | 'Raport';

interface StepDefinition {
  readonly id: StationConfigVisibleCardId;
  readonly n: number;
  readonly label: string;
  readonly sub: string;
  readonly group: StepGroup;
  readonly code: string;
}

const STEPS: readonly StepDefinition[] = [
  { id: 'basic', n: 1, label: 'Przyłączenie SN', sub: 'Miejsce w ciągu, porty i dane stacji', group: 'SN', code: 'SN-1' },
  { id: 'sn-switchgear', n: 2, label: 'Rozdzielnia SN', sub: 'Układ szyn, sekcje, prądy znamionowe', group: 'SN', code: 'SN-2' },
  { id: 'bays', n: 3, label: 'Pola SN i uzależnienia', sub: 'Role pól i sekwencje łączeń', group: 'SN', code: 'SN-3' },
  { id: 'apparatus', n: 4, label: 'Aparatura SN', sub: 'Łączniki, przekładniki i pakiety pól', group: 'SN', code: 'SN-4' },
  { id: 'ct', n: 5, label: 'Przekładniki prądowe', sub: 'Rdzenie, klasy i obciążenia wtórne', group: 'Pomiary', code: 'PM-1' },
  { id: 'vt', n: 6, label: 'Przekładniki napięciowe', sub: 'Układ napięciowy i współczynnik napięciowy', group: 'Pomiary', code: 'PM-2' },
  { id: 'measurements', n: 7, label: ETYKIETA_POL_POMIAROWYCH, sub: 'Układy pomiarowe energii i pomiar napięcia szyn', group: 'Pomiary', code: 'PM-3' },
  { id: 'transformer', n: 8, label: 'Transformator', sub: 'Moc, grupa, zaczepy i poziomy nN', group: 'Stacja', code: 'ST-1' },
  { id: 'earthing', n: 9, label: 'Uziemienie', sub: 'Punkt neutralny sieci SN z modelu', group: 'Stacja', code: 'ST-2' },
  { id: 'nn-switchgear', n: 10, label: 'Strona nN', sub: 'Rozdzielnice, odpływy i odbiory', group: 'Stacja', code: 'ST-3' },
  { id: 'der-sources', n: 11, label: 'PV, BESS i FW', sub: 'Warianty przyłączenia i PCC', group: 'OZE', code: 'OZE-1' },
  { id: 'power-quality', n: 12, label: 'Jakość energii', sub: 'Regulacja, bilans i wpływ źródeł', group: 'OZE', code: 'OZE-2' },
  { id: 'protection', n: 13, label: 'Zabezpieczenia', sub: 'Przekaźniki, nastawy i selektywność', group: 'Ochrona', code: 'ZA-1' },
  { id: 'nc-rfg', n: 14, label: 'NC RfG i PTPiREE', sub: 'Profile źródeł i wymagania przyłączeniowe', group: 'Ochrona', code: 'ZA-2' },
  { id: 'network-analysis', n: 15, label: 'Analiza sieciowa', sub: 'Ciąg SN, moce, napięcia i straty', group: 'Raport', code: 'RP-1' },
  { id: 'readiness', n: 16, label: 'Obliczenia i raport', sub: 'Zakres obliczeń, dowody i eksport', group: 'Raport', code: 'RP-2' },
];

const GROUP_STYLE: Record<StepGroup, { readonly text: string; readonly border: string; readonly bg: string; readonly button: string }> = {
  SN: {
    text: 'text-scada-sn',
    border: 'border-scada-sn',
    bg: 'bg-cyan-950/25',
    button: 'bg-scada-sn text-scada-bg',
  },
  Pomiary: {
    text: 'text-sky-300',
    border: 'border-sky-400',
    bg: 'bg-sky-950/25',
    button: 'bg-sky-400 text-slate-950',
  },
  Stacja: {
    text: 'text-emerald-300',
    border: 'border-emerald-400',
    bg: 'bg-emerald-950/20',
    button: 'bg-emerald-400 text-slate-950',
  },
  OZE: {
    text: 'text-amber-300',
    border: 'border-amber-400',
    bg: 'bg-amber-950/20',
    button: 'bg-amber-400 text-slate-950',
  },
  Ochrona: {
    text: 'text-rose-300',
    border: 'border-rose-400',
    bg: 'bg-rose-950/20',
    button: 'bg-rose-400 text-slate-950',
  },
  Raport: {
    text: 'text-lime-300',
    border: 'border-lime-400',
    bg: 'bg-lime-950/20',
    button: 'bg-lime-400 text-slate-950',
  },
};

function normalizeCardId(cardId: StationConfigCardId): StationConfigVisibleCardId {
  if (cardId === 'topology') return 'basic';
  return cardId;
}

function getStepIndex(cardId: StationConfigVisibleCardId): number {
  return Math.max(0, STEPS.findIndex((step) => step.id === cardId));
}

export function StationConfigurator(props: StationConfiguratorProps): JSX.Element {
  const {
    basic,
    topology,
    snSwitchgear,
    bays,
    transformer,
    nnSwitchgear,
    derSources,
    protection,
    measurements,
    readiness,
    earthing,
    defaultCard = 'basic',
    onOpenCalculations,
  } = props;
  const [activeCard, setActiveCard] = useState<StationConfigVisibleCardId>(
    normalizeCardId(defaultCard),
  );
  const activeStepIndex = getStepIndex(activeCard);
  const activeStep = STEPS[activeStepIndex];
  const nextStep = STEPS[activeStepIndex + 1] ?? null;
  const prevStep = STEPS[activeStepIndex - 1] ?? null;
  const groupStyle = GROUP_STYLE[activeStep.group];

  const loadRows = nnSwitchgear.loads;
  const progressLabel = `${activeStep.n} / ${STEPS.length}`;

  return (
    <div data-testid="station-configurator" className="flex h-full min-h-0 flex-col bg-scada-panel text-scada-text">
      <header className="shrink-0 border-b border-scada-border bg-scada-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded border border-scada-border bg-scada-panel-raised text-[11px] font-black tracking-wider text-scada-sn">
            SN
          </div>
          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-scada-muted">
                Konfigurator stacji
              </span>
              <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${groupStyle.border} ${groupStyle.text}`}>
                {progressLabel}
              </span>
              <span className="rounded border border-scada-border bg-scada-bg px-2 py-0.5 text-[10px] text-scada-muted">
                {activeStep.group}
              </span>
            </div>
            <div className="mt-1 text-sm font-semibold text-scada-text">
              {basic.stationName} · {activeStep.label}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <Metric label="Pola SN" value={String(bays.bays.length)} />
            <Metric label="TR" value={String(transformer.transformers.length)} />
            <Metric label="DER" value={String(derSources.ders.length)} />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          data-testid="station-config-nav"
          role="tablist"
          aria-label="Przepływ konfiguracji stacji"
          className="w-[250px] shrink-0 overflow-y-auto border-r border-scada-border bg-scada-surface py-2"
        >
          <StationStepNav activeCard={activeCard} onSelect={setActiveCard} />
        </nav>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-scada-border bg-scada-bg px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${groupStyle.text}`}>
                  {activeStep.code} · {activeStep.group}
                </div>
                <h3 className="mt-1 text-base font-semibold text-scada-text">{activeStep.label}</h3>
                <p className="mt-1 text-xs text-scada-muted">{activeStep.sub}</p>
              </div>
              <div className="rounded border border-scada-border bg-scada-panel-raised px-3 py-2 text-[11px] text-scada-muted">
                Następny krok:{' '}
                <span className="font-semibold text-scada-text">
                  {nextStep ? nextStep.label : 'Obliczenie'}
                </span>
              </div>
            </div>
          </div>

          <div
            data-testid={`station-config-content-${activeCard}`}
            role="tabpanel"
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            {activeCard === 'basic' && (
              <StationConnectionPanel basic={basic} topology={topology} />
            )}
            {activeCard === 'sn-switchgear' && <StationConfigSnSwitchgearCard {...snSwitchgear} />}
            {activeCard === 'bays' && <StationBayTechnicalPanel bays={bays} />}
            {activeCard === 'apparatus' && <StationApparatusPanel bays={bays} protection={protection} />}
            {activeCard === 'ct' && <MeasurementPackagePanel mode="ct" measurements={measurements} />}
            {activeCard === 'vt' && <MeasurementPackagePanel mode="vt" measurements={measurements} />}
            {activeCard === 'measurements' && <MeasurementPackagePanel mode="meters" measurements={measurements} />}
            {activeCard === 'transformer' && <StationConfigTransformerCard {...transformer} />}
            {activeCard === 'earthing' && <StationEarthingPanel earthing={earthing} />}
            {activeCard === 'nn-switchgear' && <StationConfigNnSwitchgearCard {...nnSwitchgear} />}
            {activeCard === 'der-sources' && <StationConfigDerSourcesCard {...derSources} />}
            {activeCard === 'power-quality' && (
              <StationPowerQualityPanel ders={derSources.ders} loads={loadRows} />
            )}
            {activeCard === 'protection' && <StationConfigProtectionCard {...protection} />}
            {activeCard === 'nc-rfg' && <StationNcRfgPanel ders={derSources.ders} protection={protection} />}
            {activeCard === 'network-analysis' && (
              <StationNetworkAnalysisPanel
                topology={topology}
                snSwitchgear={snSwitchgear}
                transformer={transformer}
                nnSwitchgear={nnSwitchgear}
                ders={derSources.ders}
                loads={loadRows}
              />
            )}
            {activeCard === 'readiness' && <StationConfigReadinessCard {...readiness} />}
          </div>
        </main>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-scada-border bg-scada-surface px-4 py-2">
        <button
          type="button"
          disabled={!prevStep}
          onClick={() => prevStep && setActiveCard(prevStep.id)}
          className="rounded border border-scada-border px-3 py-1.5 text-xs text-scada-muted transition hover:bg-scada-hover-nav disabled:cursor-default disabled:opacity-40"
        >
          Wstecz
        </button>
        <div className="min-w-0 flex-1 text-center text-[11px] text-scada-muted">
          {activeStep.n} / {STEPS.length} · {activeStep.group} · {activeStep.label}
        </div>
        <button
          type="button"
          disabled={!nextStep && !onOpenCalculations}
          onClick={() => (nextStep ? setActiveCard(nextStep.id) : onOpenCalculations?.())}
          className={`rounded px-4 py-1.5 text-xs font-bold transition disabled:cursor-default disabled:opacity-40 ${groupStyle.button}`}
        >
          {nextStep ? `Dalej: ${nextStep.label}` : 'Obliczenia'}
        </button>
      </footer>
    </div>
  );
}

function StationStepNav({
  activeCard,
  onSelect,
}: {
  readonly activeCard: StationConfigVisibleCardId;
  readonly onSelect: (cardId: StationConfigVisibleCardId) => void;
}): JSX.Element {
  let lastGroup: StepGroup | null = null;
  return (
    <>
      {STEPS.map((step) => {
        const active = step.id === activeCard;
        const showGroup = step.group !== lastGroup;
        lastGroup = step.group;
        const style = GROUP_STYLE[step.group];
        return (
          <div key={step.id}>
            {showGroup && (
              <div className={`px-4 pb-1 pt-3 text-[9px] font-black uppercase tracking-[0.18em] ${style.text}`}>
                {step.group}
              </div>
            )}
            <button
              type="button"
              role="tab"
              data-testid={`station-config-tab-${step.id}`}
              data-active={active}
              aria-selected={active}
              onClick={() => onSelect(step.id)}
              className={
                'flex w-full items-start gap-2 border-l-2 px-3 py-2 text-left transition '
                + (active
                  ? `${style.border} ${style.bg} text-scada-text`
                  : 'border-transparent text-scada-muted hover:bg-scada-hover-nav hover:text-scada-text')
              }
            >
              <span
                aria-hidden="true"
                className={
                  'mt-0.5 grid h-6 w-7 shrink-0 place-items-center rounded border font-mono text-[10px] font-bold '
                  + (active
                    ? `${style.border} ${style.text}`
                    : 'border-scada-border text-scada-muted')
                }
              >
                {step.n}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold">{step.label}</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-scada-muted">{step.sub}</span>
              </span>
            </button>
          </div>
        );
      })}
    </>
  );
}

function StationConnectionPanel({
  basic,
  topology,
}: {
  readonly basic: StationConfigBasicCardProps;
  readonly topology: StationConfigTopologyCardProps;
}): JSX.Element {
  return (
    <TwoColumn>
      <TechnicalPanel title="Identyfikacja i wariant stacji" subtitle="Dane ruchowe i wariant katalogowy stacji SN/nN.">
        <StationConfigBasicCard {...basic} />
      </TechnicalPanel>
      <TechnicalPanel title="Wpięcie w ciąg SN" subtitle="Porty, pola liniowe wejściowe i wyjściowe oraz ciągłość terminali.">
        <StationConfigTopologyCard {...topology} />
      </TechnicalPanel>
    </TwoColumn>
  );
}

function StationBayTechnicalPanel({ bays }: { readonly bays: StationConfigBaysCardProps }): JSX.Element {
  return (
    <div className="space-y-4">
      <TechnicalPanel title="Mini-SLD rozdzielnicy SN" subtitle="Kolejność pól i role aparatury dla układu stacji.">
        {bays.bays.length > 0 ? (
          <div className="overflow-x-auto rounded border border-scada-border bg-scada-bg p-3">
            <div className="flex min-w-max items-start gap-3">
              {bays.bays.map((bay) => <BayMiniSld key={bay.bayId} bay={bay} />)}
            </div>
          </div>
        ) : (
          <GuidanceBox>
            Wybierz wariant rozdzielni SN z katalogu stacji. Pakiet powinien zawierać pola liniowe
            wejściowe i wyjściowe, transformatorowe i pomiarowe zgodnie z typem stacji.
          </GuidanceBox>
        )}
      </TechnicalPanel>
      <TechnicalPanel title="Tabela pól SN" subtitle="Oznaczenia, powiązane obiekty, aparatura, zabezpieczenia i pomiary.">
        <StationConfigBaysCard {...bays} />
      </TechnicalPanel>
    </div>
  );
}

function BayMiniSld({ bay }: { readonly bay: StationConfigBaysCardProps['bays'][number] }): JSX.Element {
  // Barwa pola z ROLI (kanon ról pól, karta #141), nie z tekstu etykiety.
  const tone = canonicalFieldRole(bay.bayRole) === 'TRANSFORMATOROWE'
    ? 'border-emerald-400 text-emerald-200'
    : isSourceFieldRole(bay.bayRole)
      ? 'border-amber-400 text-amber-200'
      : 'border-scada-sn text-scada-sn';
  return (
    <div className={`w-28 shrink-0 rounded border bg-scada-panel p-2 ${tone}`} data-testid={`station-bay-mini-${bay.bayId}`}>
      <div className="text-center font-mono text-[11px] font-bold">{bay.designation}</div>
      <div className="mx-auto mt-2 h-12 w-px bg-current" />
      <div className="mx-auto h-4 w-4 rotate-45 border border-current bg-scada-bg" />
      <div className="mx-auto h-8 w-px bg-current" />
      <div className="border-t border-current pt-1 text-center text-[10px] leading-tight text-scada-text">
        {fieldRoleLabelPl(bay.bayRole)}
      </div>
      <div className="mt-1 truncate text-center text-[9px] text-scada-muted">
        {bay.attachedObjectPl ?? 'rezerwa katalogowa'}
      </div>
    </div>
  );
}

function StationApparatusPanel({
  bays,
  protection,
}: {
  readonly bays: StationConfigBaysCardProps;
  readonly protection: StationConfigProtectionCardProps;
}): JSX.Element {
  const equipmentCount = bays.bays.filter((bay) => bay.hasEquipment).length;
  const protectionCount = bays.bays.filter((bay) => bay.hasProtection).length;
  const measurementCount = bays.bays.filter((bay) => bay.hasMeasurements).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Aparatura pól" value={`${equipmentCount}/${bays.bays.length}`} />
        <MetricCard label="Zabezpieczenia pól" value={`${protectionCount}/${bays.bays.length}`} />
        <MetricCard label="Pomiary pól" value={`${measurementCount}/${bays.bays.length}`} />
      </div>
      <TechnicalPanel title="Pakiety aparatów SN" subtitle="Lista pól pokazuje, które pola mają urządzenia, zabezpieczenia i pomiary.">
        <StationConfigBaysCard {...bays} />
      </TechnicalPanel>
      <TechnicalPanel title="Powiązanie z zabezpieczeniami" subtitle="Przekaźniki i funkcje przypisane do pól rozdzielnicy SN.">
        <StationConfigProtectionCard {...protection} />
      </TechnicalPanel>
    </div>
  );
}

function MeasurementPackagePanel({
  mode,
  measurements,
}: {
  readonly mode: 'ct' | 'vt' | 'meters';
  readonly measurements: StationMeasurementsProps;
}): JSX.Element {
  if (mode === 'ct') {
    return (
      <TechnicalPanel title="Przekładniki prądowe CT" subtitle="Przekładnie, klasy dokładności i obciążenia wtórne dla pól SN.">
        <MeasurementTable
          rows={measurements.cts.map((row) => ({
            id: row.id,
            bay: row.bayDesignation,
            ratio: `${row.ratioPrimary} / ${row.ratioSecondary} A`,
            classPl: row.accuracyClassPl,
            extra: row.burdenVa != null ? `${row.burdenVa} VA` : 'moc znamionowa nieustalona w modelu',
          }))}
          emptyText="Dobierz przekładniki CT z pakietu pola SN albo z katalogu pomiarowego."
        />
      </TechnicalPanel>
    );
  }
  if (mode === 'vt') {
    return (
      <TechnicalPanel title="Przekładniki napięciowe VT" subtitle="Układ napięciowy, klasa i moc; zgodność ze sposobem uziemienia sieci SN sprawdza karta zabezpieczeń.">
        <MeasurementTable
          rows={measurements.vts.map((row) => ({
            id: row.id,
            bay: row.bayDesignation,
            ratio: `${row.ratioPrimary} / ${row.ratioSecondary} V`,
            classPl: row.accuracyClassPl,
            extra: row.burdenVa != null ? `${row.burdenVa} VA` : 'moc znamionowa nieustalona w modelu',
          }))}
          emptyText="Dobierz przekładniki VT z wariantu rozdzielni albo pakietu zabezpieczeniowego."
        />
      </TechnicalPanel>
    );
  }
  return (
    <TechnicalPanel
      title={`${ETYKIETA_POL_POMIAROWYCH} SN`}
      subtitle="Deklaracja pomiaru pola (układ pomiarowy energii albo pomiar napięcia szyn) i przekładniki w polu."
    >
      {measurements.polaPomiarowe.length === 0 ? (
        <GuidanceBox>
          Stacja nie ma pola pomiarowego SN — dodaj pole z rolą „Tor pomiarowy” w kreatorze pola SN
          i zadeklaruj układ pomiarowy energii albo pomiar napięcia szyn.
        </GuidanceBox>
      ) : (
        <table data-testid="station-metering-bays" className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-scada-border text-scada-muted">
              <th className="text-left">Pole</th>
              <th className="text-left">Pomiar</th>
              <th className="text-right">Przekładniki prądowe</th>
              <th className="text-right">Przekładniki napięciowe</th>
            </tr>
          </thead>
          <tbody>
            {measurements.polaPomiarowe.map((pole) => (
              <tr key={pole.bayId} data-testid={`station-metering-bay-${pole.bayId}`} className="border-b border-scada-border/40">
                <td className="font-mono">{pole.designation}</td>
                <td>{pole.pomiarPl}</td>
                <td className="text-right font-mono">{pole.przekladnikiCt}</td>
                <td className="text-right font-mono">{pole.przekladnikiVt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TechnicalPanel>
  );
}

function MeasurementTable({
  rows,
  emptyText,
}: {
  readonly rows: readonly {
    readonly id: string;
    readonly bay: string;
    readonly ratio: string;
    readonly classPl: string;
    readonly extra: string;
  }[];
  readonly emptyText: string;
}): JSX.Element {
  if (rows.length === 0) return <GuidanceBox>{emptyText}</GuidanceBox>;
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-scada-border text-scada-muted">
          <th className="text-left">Pole</th>
          <th className="text-right">Przekładnia</th>
          <th className="text-left">Klasa</th>
          <th className="text-left">Parametr</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-scada-border/40">
            <td className="font-mono">{row.bay}</td>
            <td className="text-right font-mono">{row.ratio}</td>
            <td>{row.classPl}</td>
            <td className="text-scada-muted">{row.extra}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const ETYKIETA_KOMPLETNOSCI: Record<UziemienieSekcjiSn['kompletnosc'], string> = {
  PELNY: 'dane potwierdzone',
  NIEPELNY: 'część danych to wartości robocze (do potwierdzenia kartą producenta)',
};

function fmtPrad(wartosc: number | null): string {
  return wartosc === null ? 'brak danych susceptancji zerowej gałęzi' : `${wartosc.toFixed(1)} A`;
}

function fmtA(wartosc: number | null): string | null {
  return wartosc === null ? null : `${wartosc.toFixed(1)} A`;
}

function fmtV(wartosc: number | null): string | null {
  return wartosc === null ? null : `${wartosc.toFixed(0)} V`;
}

/** Doziemienie metaliczne sieci SN wg sposobu pracy punktu neutralnego (solver `doziemienie_sn`). */
function DoziemienieSekcji({
  doziemienie,
  stan,
}: {
  readonly doziemienie: DoziemienieSieci;
  readonly stan: 'spoczynek' | 'zalaczony';
}): JSX.Element {
  const wartosci: [string, string | null][] = [
    [`Prąd doziemienia (${doziemienie.charakter_pl})`, fmtA(doziemienie.prad_a)],
    ['Prąd pojemnościowy I_C', fmtA(doziemienie.i_c_a)],
    ['Prąd indukcyjny I_L', fmtA(doziemienie.i_l_a)],
    ['Składowa czynna I_w', fmtA(doziemienie.i_w_a)],
    ['Napięcie składowej zerowej U0', fmtV(doziemienie.u0_v)],
    ['Współczynnik zwarcia doziemnego k', doziemienie.wspolczynnik_k === null ? null : doziemienie.wspolczynnik_k.toFixed(3)],
  ];
  return (
    <div className="space-y-1" data-testid={`station-earthing-doziemienie-${stan}`}>
      <div className="text-scada-text">
        {`Doziemienie sieci${stan === 'zalaczony' ? ' po załączeniu AWSC' : ''}: ${doziemienie.tryb_pl}`}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {wartosci
          .filter((w): w is [string, string] => w[1] !== null)
          .map(([etykieta, wartosc]) => (
            <Fact key={etykieta} label={etykieta} value={wartosc} />
          ))}
      </div>
      {doziemienie.brak_pl ? <div className="text-scada-grounded">{doziemienie.brak_pl}</div> : null}
      <div className="text-scada-muted" title={doziemienie.zastrzezenia_pl.join(' ')}>
        {doziemienie.podstawa_pl}
      </div>
    </div>
  );
}

function StationEarthingPanel({
  earthing,
}: {
  readonly earthing: StationEarthingProps | undefined;
}): JSX.Element {
  const tytul = 'Uziemienie punktu neutralnego SN';
  const podtytul =
    'Z modelu sieci: zespół uziemiający sekcji albo uziemiony punkt neutralny uzwojenia transformatora.';
  if (!earthing || earthing.stan === 'brak_kontekstu') {
    return (
      <TechnicalPanel title={tytul} subtitle={podtytul}>
        <GuidanceBox>Wybierz aktywny projekt i stację — sposób uziemienia czytany jest z modelu projektu.</GuidanceBox>
      </TechnicalPanel>
    );
  }
  if (earthing.stan === 'ladowanie') {
    return (
      <TechnicalPanel title={tytul} subtitle={podtytul}>
        <GuidanceBox>Odczyt uziemienia sieci SN z modelu…</GuidanceBox>
      </TechnicalPanel>
    );
  }
  if (earthing.stan === 'blad') {
    return (
      <TechnicalPanel title={tytul} subtitle={podtytul}>
        <div data-testid="station-earthing-blad" className="text-xs text-scada-alarm">
          {earthing.bladPl ?? 'Nie udało się odczytać uziemienia sieci SN z modelu.'}
        </div>
      </TechnicalPanel>
    );
  }
  return (
    <div className="space-y-4" data-testid="station-earthing">
      {earthing.sekcje.length === 0 ? (
        <TechnicalPanel title={tytul} subtitle={podtytul}>
          <GuidanceBox>{earthing.przyczynaBraku ?? 'Stacja nie ma sieci SN w modelu.'}</GuidanceBox>
        </TechnicalPanel>
      ) : null}
      {earthing.sekcje.map((sekcja) => (
        <TechnicalPanel key={sekcja.szyny.join('|')} title={tytul} subtitle={podtytul}>
          <div data-testid="station-earthing-sekcja" data-wariant={sekcja.wariant} className="space-y-2 text-xs">
            <div className="font-semibold text-scada-text">{sekcja.opis_pl}</div>
            <div className="grid gap-2 md:grid-cols-2">
              <Fact label="Prąd pojemnościowy sieci" value={fmtPrad(sekcja.prad_pojemnosciowy_a)} />
              <Fact
                label="Suma nastaw dławików w ruchu"
                value={sekcja.prad_dlawikow_a === null ? 'brak dławika w ruchu' : `${sekcja.prad_dlawikow_a.toFixed(1)} A`}
              />
              <Fact
                label="Rozstrojenie kompensacji v = (I_C − I_L)/I_C (dodatnie — niedokompensowanie)"
                value={sekcja.rozstrojenie === null ? 'nie dotyczy' : `${(sekcja.rozstrojenie * 100).toFixed(1)} %`}
              />
              <Fact label="Kompletność danych" value={ETYKIETA_KOMPLETNOSCI[sekcja.kompletnosc]} />
            </div>
            <DoziemienieSekcji doziemienie={sekcja.doziemienie} stan="spoczynek" />
            {sekcja.ma_awsc ? (
              <div className="text-scada-muted" data-testid="station-earthing-awsc">
                Po załączeniu automatyki AWSC rezystor wymuszający dodaje składową czynną prądu
                doziemnego — sieć pozostaje skompensowana; doziemienie pokazano w obu stanach automatyki.
              </div>
            ) : null}
            {sekcja.doziemienie_awsc_zalaczony ? (
              <DoziemienieSekcji doziemienie={sekcja.doziemienie_awsc_zalaczony} stan="zalaczony" />
            ) : null}
            {sekcja.galezie_bez_b0.length > 0 ? (
              <div className="text-scada-grounded" data-testid="station-earthing-bez-b0">
                {`Gałęzie bez susceptancji zerowej B′0 (prąd pojemnościowy niewyznaczony — uzupełnij B′0 albo typ katalogowy odcinka): ${sekcja.galezie_bez_b0.length}.`}
              </div>
            ) : null}
            {sekcja.dane_przyjete_pojemnosci.length > 0 ? (
              <ul className="text-scada-muted" data-testid="station-earthing-b0-robocze">
                {sekcja.dane_przyjete_pojemnosci.map((dana) => (
                  <li key={dana.nazwa_pl} title={dana.powod_pl}>
                    {dana.wartosc === null
                      ? dana.nazwa_pl
                      : `${dana.nazwa_pl}: ${wielkoscPl(dana.wartosc)}`}
                  </li>
                ))}
              </ul>
            ) : null}
            {[...sekcja.odmowy, ...sekcja.ostrzezenia].map((tekst) => (
              <div key={tekst} className="text-scada-alarm">{tekst}</div>
            ))}
            {earthing.onDodajZespol ? (
              <button
                type="button"
                data-testid="station-earthing-dodaj-zespol"
                onClick={() => earthing.onDodajZespol?.(sekcja.szyny)}
                {...atrybutRoliAkcji('drugorzedna')}
                className={klasaAkcji('drugorzedna')}
              >
                Dodaj zespół uziemiający
              </button>
            ) : null}
          </div>
        </TechnicalPanel>
      ))}
    </div>
  );
}

function StationPowerQualityPanel({
  ders,
  loads,
}: {
  readonly ders: StationConfigDerSourcesCardProps['ders'];
  readonly loads: readonly LoadRow[];
}): JSX.Element {
  // Brak mocy NIE jest zerem (karta PROOFPACK-KONTRAKT): suma z pominiętym brakiem
  // zaniżałaby wartość bez ostrzeżenia, więc wartość niesie liczbę pozycji bez danej.
  // Bilans eksportu wobec importu (ocena) liczy wyłącznie backend w pakiecie dowodów.
  const derBezMocy = ders.filter((der) => der.nominal_power_kw === null).length;
  const totalDerKw = ders.reduce((sum, der) => sum + (der.nominal_power_kw ?? 0), 0);
  const totalLoadMw = loads.reduce((sum, load) => sum + load.pMw, 0);
  const profiles = new Set(ders.map((der) => der.profiles.nc_rfg_profile_ref).filter(Boolean));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="Moc DER"
          value={
            derBezMocy === 0
              ? `${totalDerKw.toFixed(0)} kW`
              : `${totalDerKw.toFixed(0)} kW + ${derBezMocy} bez mocy z katalogu`
          }
        />
        <MetricCard label="Odbiory nN" value={`${totalLoadMw.toFixed(3)} MW`} />
        <MetricCard label="Profile NC RfG" value={String(profiles.size)} />
      </div>
      <TechnicalPanel title="Bilans i jakość energii" subtitle="Dane wejściowe do oceny napięcia, cosφ, profili Q(U) i wpływu źródeł.">
        {ders.length > 0 || loads.length > 0 ? (
          <div className="grid gap-2 text-xs md:grid-cols-2">
            <Fact label="Źródła i magazyny" value={ders.length > 0 ? ders.map((der) => der.der_kind).join(', ') : 'do wyboru z wariantu OZE'} />
            <Fact label="Odbiory nN/SN" value={loads.length > 0 ? `${loads.length} odbiorów` : 'dobór z wariantu stacji'} />
            <Fact label="Regulacja mocy biernej" value={profiles.size > 0 ? 'profil katalogowy' : 'profil operatora do wyboru'} />
            <Fact label="Punkt oceny jakości" value="PCC stacji albo pole SN źródła" />
          </div>
        ) : (
          <GuidanceBox>
            Dodaj odbiory albo układ PV/BESS/FW, aby ocenić bilans mocy, regulację cosφ i wpływ na napięcie.
          </GuidanceBox>
        )}
      </TechnicalPanel>
    </div>
  );
}

function StationNcRfgPanel({
  ders,
  protection,
}: {
  readonly ders: StationConfigDerSourcesCardProps['ders'];
  readonly protection: StationConfigProtectionCardProps;
}): JSX.Element {
  return (
    <div className="space-y-4">
      <TechnicalPanel title="Profile NC RfG / PTPiREE" subtitle="Każde źródło ma wariant przyłączenia, PCC, profil operatora i wymagane zabezpieczenia.">
        {ders.length > 0 ? (
          <div className="space-y-2">
            {ders.map((der) => (
              <div key={der.id} className="rounded border border-scada-border bg-scada-bg p-2 text-xs">
                <div className="font-semibold text-scada-text">{der.name}</div>
                <div className="mt-1 grid gap-1 text-scada-muted md:grid-cols-3">
                  <span>Rodzaj: {der.der_kind}</span>
                  <span>PCC: {der.connection_side}</span>
                  <span>Profil: {der.profiles.nc_rfg_profile_ref ?? 'operator'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <GuidanceBox>Wybierz wariant PV, BESS albo FW, aby skonfigurować wymagania przyłączeniowe.</GuidanceBox>
        )}
      </TechnicalPanel>
      <TechnicalPanel title="Ochrona przyłączeniowa" subtitle="Przekaźniki przypięte do pól SN tej stacji (z modelu).">
        <MetricCard label="Przekaźniki" value={String(protection.relays.length)} />
      </TechnicalPanel>
    </div>
  );
}

function StationNetworkAnalysisPanel({
  topology,
  snSwitchgear,
  transformer,
  nnSwitchgear,
  ders,
  loads,
}: {
  readonly topology: StationConfigTopologyCardProps;
  readonly snSwitchgear: StationConfigSnSwitchgearCardProps;
  readonly transformer: StationConfigTransformerCardProps;
  readonly nnSwitchgear: StationConfigNnSwitchgearCardProps;
  readonly ders: StationConfigDerSourcesCardProps['ders'];
  readonly loads: readonly LoadRow[];
}): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Porty SN" value={String(topology.externalPorts.length)} />
        <MetricCard label="Pola SN" value={String(snSwitchgear.baysCount)} />
        <MetricCard label="Transformatory" value={String(transformer.transformers.length)} />
        <MetricCard label="Rozdzielnice nN" value={String(nnSwitchgear.switchgears.length)} />
      </div>
      <TechnicalPanel title="Dane do analiz sieciowych" subtitle="Ten widok zbiera parametry, które backendowe solvery wykorzystują do obliczeń.">
        <div className="grid gap-2 text-xs md:grid-cols-2">
          <Fact label="Ciąg SN" value={topology.endToEndConnectionsCount > 0 ? 'połączony terminalami' : 'wybierz terminale w SLD'} />
          <Fact label="Rozdzielnia SN" value={`${snSwitchgear.sectionsCount} sekcji, ${snSwitchgear.baysCount} pól`} />
          <Fact label="Odbiory nN" value={`${loads.length} odbiorów`} />
          <Fact label="Źródła OZE/BESS/FW" value={`${ders.length} układów`} />
        </div>
      </TechnicalPanel>
    </div>
  );
}

function TwoColumn({ children }: { readonly children: ReactNode }): JSX.Element {
  return <div className="grid gap-4 xl:grid-cols-2">{children}</div>;
}

function TechnicalPanel({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <section className="rounded border border-scada-border bg-scada-surface p-3">
      <div className="mb-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-scada-muted">{title}</div>
        {subtitle && <div className="mt-1 text-[11px] text-scada-muted">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-center">
      <div className="font-mono text-sm font-bold text-scada-text">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-scada-muted">{label}</div>
    </div>
  );
}

function MetricCard({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="rounded border border-scada-border bg-scada-bg p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-scada-muted">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-scada-text">{value}</div>
    </div>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="rounded border border-scada-border/70 bg-scada-bg px-2 py-1.5">
      <span className="text-scada-muted">{label}: </span>
      <span className="text-scada-text">{value}</span>
    </div>
  );
}

function GuidanceBox({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <div className="rounded border border-dashed border-scada-border bg-scada-bg p-3 text-xs text-scada-muted">
      {children}
    </div>
  );
}
