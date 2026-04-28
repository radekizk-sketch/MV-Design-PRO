import { clsx } from 'clsx';
import type { SelectedElement, ElementType } from '../types';
import { getVisibleInspectorTabs } from './inspectorTabRegistry';

const ELEMENT_TYPE_LABELS_PL: Record<ElementType, string> = {
  Bus: 'Szyna zbiorcza',
  LineBranch: 'Odcinek sieci SN',
  TransformerBranch: 'Transformator SN/nN',
  Switch: 'Aparat łączeniowy',
  Source: 'Główny Punkt Zasilający',
  Load: 'Odbiór',
  Generator: 'Źródło wytwórcze',
  Measurement: 'Układ pomiarowy',
  ProtectionAssignment: 'Przypisanie zabezpieczenia',
  Terminal: 'Terminal sieci SN',
  PortBranch: 'Port odgałęzienia',
  Station: 'Stacja transformatorowa SN/nN',
  BranchPole: 'Słup rozgałęźny',
  ZKSN: 'Złącze kablowe SN',
  BaySN: 'Pole SN',
  Relay: 'Przekaźnik zabezpieczeniowy',
  SecondaryLink: 'Połączenie wtórne',
  NOP: 'Punkt normalnie otwarty',
  BusNN: 'Szyna nN',
  MainBreakerNN: 'Wyłącznik główny nN',
  FeederNN: 'Odpływ nN',
  SegmentNN: 'Segment nN',
  LoadNN: 'Obciążenie nN',
  SwitchboardNN: 'Rozdzielnica nN',
  SourceFieldNN: 'Pole źródłowe nN',
  PVInverter: 'Źródło fotowoltaiczne',
  BESSInverter: 'Magazyn energii z falownikiem',
  EnergyStorage: 'Magazyn energii',
  Genset: 'Agregat prądotwórczy',
  UPS: 'Zasilacz gwarantowany',
  EnergyMeter: 'Licznik energii',
  PowerQualityMeter: 'Analizator jakości energii',
  SurgeArresterNN: 'Ogranicznik przepięć',
  Earthing: 'Uziemienie',
  MeasurementNN: 'Pomiar nN',
  AuxBus: 'Szyna pomocnicza',
  ConnectionPoint: 'Punkt przyłączenia',
  SwitchNN: 'Aparat łączeniowy nN',
  ProtectionNN: 'Zabezpieczenie nN',
  SourceController: 'Sterownik źródła',
  InternalJunction: 'Węzeł wewnętrzny',
  CableJointNN: 'Złącze kablowe nN',
  FaultCurrentLimiter: 'Ogranicznik prądu zwarciowego',
  FilterCompensator: 'Filtr lub kompensator',
  TelecontrolDevice: 'Urządzenie telesterowania',
  BusSectionNN: 'Sekcja szyn nN',
  BusCouplerNN: 'Sprzęgło szyn nN',
  ReserveLink: 'Łącznik rezerwowy',
  SourceDisconnect: 'Odłącznik źródła',
  PowerLimit: 'Ograniczenie mocy',
  WorkProfile: 'Profil pracy',
  OperatingMode: 'Tryb pracy źródła',
  ConnectionConstraints: 'Warunki przyłączenia',
  MeteringBlock: 'Blok pomiarowy',
  SyncPoint: 'Punkt synchronizacji',
  DescriptiveElement: 'Element opisowy',
};

export interface EmptyInspectorPanelProps {
  selectedElement?: SelectedElement | null;
  isReadOnly?: boolean;
  networkStats?: {
    nodeCount?: number;
    branchCount?: number;
    transformerCount?: number;
    loadCount?: number;
    sourceCount?: number;
  };
  className?: string;
}

export function EmptyInspectorPanel({
  selectedElement,
  isReadOnly = false,
  networkStats,
  className,
}: EmptyInspectorPanelProps) {
  const visibleTabs = getVisibleInspectorTabs(selectedElement?.type ?? null);

  if (!selectedElement) {
    return (
      <div
        className={clsx('flex h-full flex-col bg-scada-panel text-scada-text', className)}
        data-testid="inspector-panel-empty"
      >
        <InspectorHeader readOnly={isReadOnly} />
        <InspectorTabs labels={visibleTabs.map((tab) => tab.label)} />

        <div className="flex-1 space-y-3 overflow-auto p-4">
          <section className="rounded border border-scada-border bg-scada-surface p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
              Wybierz obiekt techniczny
            </h3>
            <p className="mt-2 text-sm text-scada-text">Inspektor czeka na wskazanie elementu SLD albo wyniku analizy.</p>
            <p className="mt-1 text-[12px] leading-snug text-scada-muted">
              Kliknij GPZ, pole SN, odcinek, stację albo element w drzewie modelu.
              Brak zaznaczenia nie oznacza braku modelu.
            </p>
          </section>

          <section className="rounded border border-scada-border bg-scada-surface p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
              Stan modelu
            </h3>
            <NetworkStats stats={networkStats} />
          </section>
        </div>
      </div>
    );
  }

  const typeLabel = ELEMENT_TYPE_LABELS_PL[selectedElement.type] ?? selectedElement.type;

  return (
    <div
      className={clsx('flex h-full flex-col bg-scada-panel text-scada-text', className)}
      data-testid="inspector-panel-preview"
      data-selection-id={selectedElement.id}
    >
      <InspectorHeader readOnly={isReadOnly} />
      <InspectorTabs labels={visibleTabs.map((tab) => tab.label)} />

      <div className="flex-1 overflow-auto p-4">
        <section className="rounded border border-scada-border bg-scada-surface p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
            Identyfikacja
          </h3>
          <dl className="mt-3 space-y-2 text-[12px]">
            <InspectorRow label="Nazwa" value={selectedElement.name || selectedElement.id} />
            <InspectorRow label="Typ obiektu" value={typeLabel} />
            <InspectorRow label="Identyfikator techniczny" value={selectedElement.id} mono />
          </dl>
        </section>

        <section className="mt-3 rounded border border-scada-border bg-scada-surface p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
            Warunek przejścia
          </h3>
          <p className="mt-2 text-[12px] leading-snug text-scada-muted">
            Otwórz kanoniczną zakładkę inspektora albo menu obiektu na SLD, aby przejść do edycji,
            wyników, uzasadnienia lub raportu dla tego elementu.
          </p>
        </section>
      </div>
    </div>
  );
}

function InspectorHeader({ readOnly }: { readOnly: boolean }) {
  return (
    <div className="border-b border-scada-border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-scada-text">Inspektor techniczny</h2>
        {readOnly && (
          <span className="rounded-full border border-scada-border px-2 py-0.5 text-[10px] text-scada-muted">
            Tryb audytowy
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-scada-muted">
        Podgląd wyboru, parametrów, gotowości, wyników i śladu audytu.
      </p>
    </div>
  );
}

function InspectorTabs({ labels }: { labels: string[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-scada-border px-3 py-2" role="tablist">
      {labels.map((label, index) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={index === 0}
          className={clsx(
            'whitespace-nowrap rounded border px-2 py-1 text-[11px] font-semibold',
            index === 0
              ? 'border-scada-sn bg-scada-active text-scada-sn'
              : 'border-scada-border bg-scada-bg text-scada-muted',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function NetworkStats({ stats }: { stats?: EmptyInspectorPanelProps['networkStats'] }) {
  const rows = [
    ['Węzły', stats?.nodeCount],
    ['Gałęzie', stats?.branchCount],
    ['Transformatory', stats?.transformerCount],
    ['Obciążenia', stats?.loadCount],
    ['Źródła', stats?.sourceCount],
  ] as const;

  if (!stats || rows.every(([, value]) => value === undefined)) {
    return (
      <p className="mt-2 text-[12px] leading-snug text-scada-muted">
        Statystyki modelu nie zostały przekazane do Inspektora technicznego. Warunek przejścia:
        wybierz Główny Punkt Zasilający, pole SN albo odcinek sieci na kanwie SLD.
      </p>
    );
  }

  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
      {rows
        .filter(([, value]) => value !== undefined)
        .map(([label, value]) => (
          <div key={label} className="rounded border border-scada-border bg-scada-bg px-2 py-1.5">
            <dt className="text-[10px] uppercase tracking-widest text-scada-muted">{label}</dt>
            <dd className="mt-0.5 font-semibold text-scada-text">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function InspectorRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
      <dt className="text-scada-muted">{label}</dt>
      <dd className={clsx('truncate text-right text-scada-text', mono && 'font-mono')} title={value}>
        {value}
      </dd>
    </div>
  );
}

export default EmptyInspectorPanel;
