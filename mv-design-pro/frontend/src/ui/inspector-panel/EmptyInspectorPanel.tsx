import { useState } from 'react';
import { clsx } from 'clsx';
import type { SelectedElement, ElementType } from '../types';
import { formatDisplayId } from '../shell/displayHelpers';
import { getVisibleInspectorTabs, type InspectorTabId } from './inspectorTabRegistry';

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

const APPARATUS_KIND_LABELS_PL: Record<string, string> = {
  disconnect_bus: 'Odłącznik szynowy',
  breaker: 'Wyłącznik SN',
  ct: 'Przekładnik prądowy',
  vt: 'Przekładnik napięciowy',
  switch_disconnector: 'Rozłącznik',
  earthing_switch: 'Uziemnik boczny',
  fuse: 'Bezpieczniki',
  cable_head: 'Głowica kablowa / port odpływu',
  transformer_symbol: 'Transformator WN/SN',
};

function parseApparatusSelectionId(id: string): { bayRef: string; apparatusKind: string } | null {
  const marker = id.lastIndexOf('#');
  if (marker <= 0 || marker === id.length - 1) return null;
  return { bayRef: id.slice(0, marker), apparatusKind: id.slice(marker + 1) };
}

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
  /** K30-17: callback invoked when user clicks tab z aktywnym elementem.
   *  Caller routes do appropriate config (StationConfigurator, PropertyGrid,
   *  catalog picker, results view). */
  onTabActivated?: (tabId: InspectorTabId, selectedElement: SelectedElement | null) => void;
}

export function EmptyInspectorPanel({
  selectedElement,
  isReadOnly = false,
  className,
  onTabActivated,
}: EmptyInspectorPanelProps) {
  const visibleTabs = getVisibleInspectorTabs(selectedElement?.type ?? null);
  const [activeTabId, setActiveTabId] = useState<InspectorTabId>(
    visibleTabs[0]?.id ?? 'identyfikacja',
  );
  const handleTabClick = (tabId: InspectorTabId) => {
    setActiveTabId(tabId);
    onTabActivated?.(tabId, selectedElement ?? null);
  };

  if (!selectedElement) {
    return (
      <div
        className={clsx('flex h-full flex-col bg-scada-panel text-scada-text', className)}
        data-testid="inspector-panel-empty"
      >
        <InspectorSectionTitle title="Inspektor techniczny" />
        <div className="flex-1 overflow-auto p-3">
          <section className="rounded border border-scada-border bg-scada-surface p-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-scada-border bg-scada-bg text-scada-muted"
              >
                <CursorIcon />
              </span>
              <div className="min-w-0">
                <h3 className="text-[12px] font-semibold uppercase tracking-widest text-scada-text">
                  Wybierz element ze schematu
                </h3>
                <p className="mt-1.5 text-[11px] leading-relaxed text-scada-muted">
                  Kliknij na kanwie SLD: GPZ, pole SN, aparat, odcinek, stację albo
                  wynik analizy. Inspektor pokaże wówczas parametry techniczne, braki
                  danych, ustawienia zabezpieczeń, wyniki obliczeń i dostępne akcje
                  domenowe — bez szumu identyfikatorów programisty.
                </p>
              </div>
            </div>
          </section>

          {!isReadOnly && (
            <section className="mt-3 rounded border border-scada-border bg-scada-surface p-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
                Tryb budowy modelu
              </h4>
              <p className="mt-2 text-[11px] leading-snug text-scada-muted">
                Aby rozpocząć projekt sieci SN: wstaw GPZ z menu kontekstowego kanwy,
                dodaj sekcję rozdzielni, pola SN, wyprowadź odcinek, zakończ stacją
                i kontynuuj ciąg. Każdy krok prowadzi prawy panel inspektora.
              </p>
            </section>
          )}
        </div>
      </div>
    );
  }

  const typeLabel = ELEMENT_TYPE_LABELS_PL[selectedElement.type] ?? selectedElement.type;
  const apparatusSelection = parseApparatusSelectionId(selectedElement.id);
  const apparatusLabel = apparatusSelection
    ? APPARATUS_KIND_LABELS_PL[apparatusSelection.apparatusKind] ?? apparatusSelection.apparatusKind
    : null;

  return (
    <div
      className={clsx('flex h-full flex-col bg-scada-panel text-scada-text', className)}
      data-testid="inspector-panel-preview"
      data-selection-id={selectedElement.id}
    >
      <InspectorHeader readOnly={isReadOnly} />
      <InspectorTabs
        tabs={visibleTabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        activeTabId={activeTabId}
        onTabClick={handleTabClick}
      />

      <div className="flex-1 overflow-auto p-4">
        <section className="rounded border border-scada-border bg-scada-surface p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
            Identyfikacja
          </h3>
          <dl className="mt-3 space-y-2 text-[12px]">
            <InspectorRow
              label="Nazwa"
              value={formatDisplayId(selectedElement.id, selectedElement.name ?? null)}
            />
            <InspectorRow label="Typ obiektu" value={typeLabel} />
            <InspectorRow
              label="Identyfikator techniczny"
              value={formatDisplayId(selectedElement.id, null)}
              mono
            />
          </dl>
        </section>

        {apparatusSelection && (
          <section className="mt-3 rounded border border-scada-border bg-scada-surface p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
              Parametry aparatu
            </h3>
            <dl className="mt-3 space-y-2 text-[12px]">
              <InspectorRow label="Rodzaj aparatu" value={apparatusLabel ?? 'Aparat SN'} />
              <InspectorRow label="Pole powiązane" value={apparatusSelection.bayRef} mono />
              <InspectorRow label="Zakres edycji" value="Aparatura, przekładniki, zabezpieczenia i katalog pola" />
            </dl>
          </section>
        )}

        <section className="mt-3 rounded border border-scada-border bg-scada-surface p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
            Następny krok
          </h3>
          <p className="mt-2 text-[12px] leading-snug text-scada-muted">
            Użyj zakładek inspektora albo menu obiektu na SLD, aby przejść do edycji,
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

function InspectorTabs({
  tabs,
  activeTabId,
  onTabClick,
}: {
  tabs: { id: InspectorTabId; label: string }[];
  activeTabId: InspectorTabId;
  onTabClick: (id: InspectorTabId) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-scada-border px-3 py-2" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTabId}
          data-testid={`inspector-tab-${tab.id}`}
          onClick={() => onTabClick(tab.id)}
          className={clsx(
            'whitespace-nowrap rounded border px-2 py-1 text-[11px] font-semibold',
            tab.id === activeTabId
              ? 'border-scada-sn bg-scada-active text-scada-sn'
              : 'border-scada-border bg-scada-bg text-scada-muted hover:bg-scada-bg-hover',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function InspectorSectionTitle({ title }: { title: string }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-scada-border px-3">
      <div className="flex items-center gap-2">
        <ChevronDown />
        <span className="text-[13px] font-semibold text-scada-text">{title}</span>
      </div>
      <ChevronDown />
    </div>
  );
}

// InspectorField helper removed — 10 placeholder fields ("—") replaced
// przez CTA guided stepper w empty state (Zadanie 7 planu UI/UX 100%).

function ChevronDown() {
  return (
    <svg className="h-3 w-3 shrink-0 text-scada-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.6}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"
      />
    </svg>
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
