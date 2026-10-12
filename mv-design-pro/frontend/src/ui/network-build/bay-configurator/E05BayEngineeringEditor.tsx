/**
 * E05 — stanowisko inżynierskie pola SN, pionowy prototyp integracyjny.
 *
 * Dane wyłącznie z:
 *  - useSnapshotStore (kanoniczny ENM, w tym Bay.primary_devices i Bay.ports),
 *  - /api/catalog/switchgear-families + /complete-bay-templates,
 *  - SldCanvasV3(snapshot) — ten sam renderer co globalny schemat.
 *
 * BRAK lokalnej topologii, generowania aparatów, fikcyjnych wyników i zapisu
 * katalogu do ENM. Operacje mutacyjne wymagają istniejących komend domenowych
 * oraz walidacji backendowej; ten etap jest celowo tylko do odczytu.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bay, BayPrimaryDevice, Port } from '../../../types/enm';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { SldCanvasV3 } from '../../sld/v3/canvas/SldCanvasV3';
import type { SldElementClickMeta } from '../../sld/v3/canvas/SldCanvasV3';
import { useMeasuredSize } from '../../sld/shared/useMeasuredSize';
import {
  fetchE05Catalog, fetchE05FactoryConfigurations, isE05CatalogEligible,
  type E05BayTemplate, type E05CatalogSnapshot, type E05FactoryConfiguration,
  type E05SwitchgearFamily,
} from './e05CatalogApi';

type E05Tab = 'sld' | 'apparatus' | 'ports' | 'oem' | 'protection' | 'results';
const TABS: readonly { readonly id: E05Tab; readonly label: string }[] = [
  { id: 'sld', label: 'Schemat SLD V3' },
  { id: 'apparatus', label: 'Aparatura' },
  { id: 'ports', label: 'Zaciski i połączenia' },
  { id: 'oem', label: 'Katalog producenta' },
  { id: 'protection', label: 'Pomiary i EAZ' },
  { id: 'results', label: 'Obliczenia i dowody' },
];
const KINDS: Readonly<Record<string, string>> = {
  CB: 'Wyłącznik', LOAD_SWITCH: 'Rozłącznik', DS: 'Odłącznik',
  ES: 'Uziemnik', CT: 'Przekładnik prądowy', VT: 'Przekładnik napięciowy',
  FUSE: 'Bezpiecznik', CABLE_HEAD: 'Głowica kablowa',
  SURGE_ARRESTER: 'Ogranicznik przepięć', TRANSFORMER_DEVICE: 'Transformator',
  GENERATOR_PV: 'Źródło PV', GENERATOR_BESS: 'Magazyn energii',
  GENERATOR_FW: 'Źródło wiatrowe', PCS: 'Przekształtnik', BATTERY: 'Bateria',
};
const ROLE: Readonly<Record<string, string>> = {
  IN: 'Liniowe dopływowe', OUT: 'Liniowe odpływowe', TR: 'Transformatorowe',
  COUPLER: 'Sprzęgłowe', FEEDER: 'Odpływowe', MEASUREMENT: 'Pomiarowe',
  OZE: 'Źródłowe',
};
const NO_DATA = 'Brak danych';
function name(value: string | null | undefined): string {
  return value && value.trim() ? value : NO_DATA;
}
function formatKv(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toLocaleString('pl-PL')} kV` : NO_DATA;
}
function CatalogState({ family, template }: {
  readonly family?: E05SwitchgearFamily;
  readonly template?: E05BayTemplate;
}): JSX.Element {
  const eligible = isE05CatalogEligible(family, template);
  return (
    <span data-testid="e05-oem-state" className={eligible ? 'text-status-ok' : 'text-status-warn'}>
      {eligible ? 'Dane katalogowe potwierdzone w rejestrze' : 'Niepotwierdzona konfiguracja OEM'}
    </span>
  );
}
function DataRow({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="grid grid-cols-[minmax(110px,1fr)_minmax(120px,1.4fr)] gap-3 border-b border-scada-border/40 py-1.5">
      <dt className="text-scada-muted">{label}</dt>
      <dd className="min-w-0 break-words font-mono text-scada-text">{value}</dd>
    </div>
  );
}
function ApparatusTable({ devices, selectedRef, onSelect }: {
  readonly devices: readonly BayPrimaryDevice[];
  readonly selectedRef: string | null;
  readonly onSelect: (ref: string) => void;
}): JSX.Element {
  if (!devices.length) return <p className="text-status-warn">Brak aparatów pierwotnych w ENM. Nie generuję wyposażenia zastępczego.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] text-left text-[11px]">
        <thead className="border-b border-scada-border text-scada-muted">
          <tr><th className="p-2">Oznaczenie</th><th className="p-2">Funkcja</th><th className="p-2">Ref. katalogowa</th><th className="p-2">Położenie</th><th className="p-2">Stan</th></tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.device_ref} data-testid={`e05-device-${d.device_ref}`}
              className={selectedRef === d.device_ref ? 'bg-scada-sn/10' : 'border-b border-scada-border/40'}>
              <td className="p-2">
                <button type="button" onClick={() => onSelect(d.device_ref)}
                  className="text-left font-mono text-scada-sn underline-offset-2 hover:underline">
                  {name(d.designation) === NO_DATA ? d.device_ref : d.designation}
                </button>
              </td>
              <td className="p-2">{KINDS[d.kind] ?? d.kind}</td>
              <td className="p-2 font-mono">{name(d.catalog_ref)}</td>
              <td className="p-2">{d.placement}</td>
              <td className="p-2">{d.switch_state?.actual_state ?? 'nieznany'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PortTable({ ports }: { readonly ports: readonly Port[] }): JSX.Element {
  if (!ports.length) return <p className="text-status-warn">Brak jawnych portów pola w ENM — nie można potwierdzić toru przyłączenia.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px] text-left text-[11px]">
        <thead className="border-b border-scada-border text-scada-muted">
          <tr><th className="p-2">Port ENM</th><th className="p-2">Funkcja</th><th className="p-2">Napięcie</th><th className="p-2">Powiązany obiekt</th></tr>
        </thead>
        <tbody>
          {ports.map((p) => (
            <tr key={p.id} className="border-b border-scada-border/40">
              <td className="p-2 font-mono">{p.id}</td>
              <td className="p-2">{p.kind}</td>
              <td className="p-2 font-mono">{formatKv(p.nominal_voltage_kv)}</td>
              <td className="p-2 font-mono">{name(p.occupied_by)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function CatalogTable({ templates, family, selectedTemplateRef }: {
  readonly templates: readonly E05BayTemplate[];
  readonly family?: E05SwitchgearFamily;
  readonly selectedTemplateRef: string | null;
}): JSX.Element {
  const subset = family ? templates.filter((t) => t.switchgear_family_ref === family.switchgear_family_ref) : [];
  if (!family) return <p className="text-status-warn">Nie ustalono rodziny pola z jego referencji katalogowej.</p>;
  if (!subset.length) return <p className="text-status-warn">Brak kompletnych szablonów tej rodziny w API.</p>;
  return (
    <div className="space-y-2">
      {subset.map((t) => (
        <div key={t.template_ref} className={`rounded border p-2 ${t.template_ref === selectedTemplateRef ? 'border-scada-sn' : 'border-scada-border'}`}>
          <div className="font-semibold text-scada-text">{name(t.template_name_pl)} · {name(t.template_code)}</div>
          <div className="mt-1 font-mono text-scada-muted">{t.template_ref}</div>
          <div className="mt-1">Funkcja: {t.bay_kind} · wyposażenie katalogowe: {t.device_instances.length} · porty katalogowe: {t.port_definitions.length}</div>
          <div className="mt-1 text-scada-muted">Status źródła: {t.source_status} · wersja {t.version}</div>
          <div className="mt-1"><CatalogState family={family} template={t}/></div>
        </div>
      ))}
    </div>
  );
}

export interface E05BayEngineeringEditorProps {
  readonly bayRef: string | null;
  /** Otwarcie dotychczasowego edytora bez wykonywania pozornych mutacji ENM. */
  readonly onOpenLegacyEditor?: () => void;
}

export function E05BayEngineeringEditor({
  bayRef, onOpenLegacyEditor,
}: E05BayEngineeringEditorProps): JSX.Element {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const caseId = useSnapshotStore((s) => s.caseId);
  const currentRevision = useSnapshotStore((s) => s.rewizjaBiezacegoModelu);
  const readiness = useSnapshotStore((s) => s.readiness);
  const [tab, setTab] = useState<E05Tab>('sld');
  const [catalog, setCatalog] = useState<E05CatalogSnapshot | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDeviceRef, setSelectedDeviceRef] = useState<string | null>(null);
  const [factoryConfigurations, setFactoryConfigurations] = useState<readonly E05FactoryConfiguration[]>([]);
  const [factoryError, setFactoryError] = useState<string | null>(null);
  const [selectedFamilyRef, setSelectedFamilyRef] = useState<string>('');
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasSize = useMeasuredSize(canvasRef, 760, 400, undefined, 320, 240);
  const bay: Bay | undefined = useMemo(
    () => snapshot?.bays.find((b) => b.ref_id === bayRef), [snapshot, bayRef],
  );
  const station = useMemo(
    () => snapshot?.substations.find((s) => s.ref_id === bay?.substation_ref),
    [snapshot, bay?.substation_ref],
  );
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setCatalog(null);
    setCatalogError(null);
    fetchE05Catalog(controller.signal)
      .then((data) => { if (!controller.signal.aborted) setCatalog(data); })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setCatalogError(e instanceof Error ? e.message : 'Błąd odczytu katalogu OEM.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  const selectedTemplate = catalog?.templates.find((t) => t.template_ref === bay?.bay_template_ref);
  const linkedFamily = catalog?.families.find((f) => f.switchgear_family_ref === selectedTemplate?.switchgear_family_ref);
  useEffect(() => {
    setSelectedFamilyRef(linkedFamily?.switchgear_family_ref ?? '');
  }, [linkedFamily?.switchgear_family_ref, bayRef]);
  const family = catalog?.families.find((f) => f.switchgear_family_ref === selectedFamilyRef);
  useEffect(() => {
    const controller = new AbortController();
    setFactoryConfigurations([]);
    setFactoryError(null);
    if (family?.tor_konfiguracji === 'BLOK_RMU') {
      fetchE05FactoryConfigurations(family.switchgear_family_ref, controller.signal)
        .then((data) => { if (!controller.signal.aborted) setFactoryConfigurations(data); })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setFactoryError(e instanceof Error ? e.message : 'Błąd katalogu bloków RMU.');
        });
    }
    return () => controller.abort();
  }, [family?.switchgear_family_ref, family?.tor_konfiguracji]);

  const selectedDevice = bay?.primary_devices?.find((d) => d.device_ref === selectedDeviceRef);
  const ports = bay?.ports ?? [];
  const devices = bay?.primary_devices ?? [];
  const unresolved = [
    ...(!bay?.bay_template_ref ? ['Brak powiązania pola z szablonem katalogowym'] : []),
    ...(bay?.bay_template_ref && !selectedTemplate && !loading && !catalogError ? ['Nie znaleziono szablonu w katalogu'] : []),
    ...(!loading && !catalogError && !isE05CatalogEligible(linkedFamily, selectedTemplate) ? ['Brak potwierdzonej konfiguracji OEM'] : []),
    ...(!devices.length ? ['Brak aparatury pierwotnej w ENM'] : []),
    ...(!ports.length ? ['Brak jawnych portów pola w ENM'] : []),
    ...(currentRevision !== null && snapshot && currentRevision !== snapshot.header.revision
      ? ['Wyświetlana migawka nie jest bieżącą rewizją modelu'] : []),
  ];

  const onSldClick = (_testId: string, meta?: SldElementClickMeta): void => {
    if (meta?.deviceRef && devices.some((d) => d.device_ref === meta.deviceRef)) {
      setSelectedDeviceRef(meta.deviceRef);
      setTab('apparatus');
    } else if (meta?.ownerRef === bayRef) {
      setTab('apparatus');
    }
  };

  return (
    <div data-testid="e05-engineering-editor" className="flex h-full min-h-0 flex-col bg-scada-bg text-xs text-scada-text">
      <header className="shrink-0 border-b border-scada-border bg-scada-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-scada-sn">E05 · Stanowisko inżynierskie pola SN</div>
            <h2 className="mt-1 text-base font-semibold">{bay ? name(bay.name) : 'Nie wybrano pola'}</h2>
            <p className="mt-1 font-mono text-[11px] text-scada-muted">
              {name(station?.name)} · {bay ? ROLE[bay.bay_role] ?? bay.bay_role : NO_DATA} · {name(bay?.ref_id)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span>Rewizja: <b className="font-mono">{snapshot?.header.revision ?? '—'}</b></span>
            <span>Przypadek: <b className="font-mono">{caseId ?? '—'}</b></span>
            <span className="text-status-warn">Odczyt / brak mutacji</span>
            {onOpenLegacyEditor && <button type="button" onClick={onOpenLegacyEditor}
              className="rounded border border-scada-border px-3 py-1.5 hover:bg-scada-hover-nav">
              Dotychczasowy edytor
            </button>}
          </div>
        </div>
      </header>
      {!bay || !snapshot ? (
        <div data-testid="e05-no-bay" className="m-4 rounded border border-status-error p-4 text-status-error">
          {snapshot ? 'Wskazane pole nie występuje w kanonicznym ENM. Wybierz rzeczywiste pole z modelu.'
            : 'Brak migawki ENM. Nie można wygenerować schematu ani danych urządzeń.'}
        </div>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-auto p-2 xl:grid-cols-[230px_minmax(360px,1fr)_320px]">
            <aside aria-label="Struktura pola" className="min-h-0 overflow-auto rounded border border-scada-border bg-scada-panel p-3">
              <h3 className="font-semibold uppercase tracking-wide text-scada-sn">Struktura ENM</h3>
              <dl className="mt-2"><DataRow label="Sekcja szyn" value={name(bay.gpz_section_id)}/><DataRow label="Szyna ENM" value={name(bay.bus_ref)}/><DataRow label="Pole" value={name(bay.bay_number ?? bay.name)}/></dl>
              <h4 className="mt-4 font-semibold">Aparaty pierwotne ({devices.length})</h4>
              <div className="mt-2 space-y-1">
                {devices.length === 0 && <p className="text-status-warn">Brak danych.</p>}
                {devices.map((d) => (
                  <button key={d.device_ref} type="button" onClick={() => { setSelectedDeviceRef(d.device_ref); setTab('apparatus'); }}
                    className={`block w-full rounded border px-2 py-2 text-left ${selectedDeviceRef === d.device_ref ? 'border-scada-sn bg-scada-sn/10' : 'border-scada-border hover:bg-scada-hover-nav'}`}>
                    <span className="block font-semibold">{name(d.designation) === NO_DATA ? d.device_ref : d.designation}</span>
                    <span className="text-scada-muted">{KINDS[d.kind] ?? d.kind}</span>
                  </button>
                ))}
              </div>
              <h4 className="mt-4 font-semibold">Porty fizyczne ({ports.length})</h4>
              <div className="mt-2 space-y-1 font-mono text-[11px]">
                {ports.map((p) => <div key={p.id} className="rounded border border-scada-border p-2">{p.id}<div className="text-scada-muted">{p.kind}</div></div>)}
                {ports.length === 0 && <p className="text-status-warn">Brak jawnych portów.</p>}
              </div>
            </aside>
            <main className="min-h-[420px] min-w-0 overflow-hidden rounded border border-scada-border bg-scada-panel">
              <nav role="tablist" aria-label="Sekcje techniczne pola" className="flex flex-wrap gap-1 border-b border-scada-border p-2">
                {TABS.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                    data-testid={`e05-tab-${t.id}`} onClick={() => setTab(t.id)}
                    className={`rounded px-2 py-1.5 text-[11px] ${tab === t.id ? 'bg-scada-sn text-scada-bg' : 'text-scada-muted hover:bg-scada-hover-nav'}`}>{t.label}</button>
                ))}
              </nav>
              <div role="tabpanel" className="h-[min(62vh,650px)] min-h-[320px] overflow-auto p-2">
                {tab === 'sld' && (
                  <div ref={canvasRef} data-testid="e05-canonical-sld" className="h-full min-h-[300px] w-full">
                    <SldCanvasV3 snapshot={snapshot} width={canvasSize.width} height={canvasSize.height}
                      onElementClick={onSldClick}/>
                  </div>
                )}
                {tab === 'apparatus' && <ApparatusTable devices={devices} selectedRef={selectedDeviceRef} onSelect={setSelectedDeviceRef}/>}
                {tab === 'ports' && <PortTable ports={ports}/>}
                {tab === 'oem' && <CatalogTable templates={catalog?.templates ?? []} family={family}
                  selectedTemplateRef={bay.bay_template_ref ?? null}/>}
                {tab === 'protection' && (
                  <div className="space-y-3 p-2">
                    <h3 className="font-semibold">Powiązania zabezpieczeniowe ENM</h3>
                    <dl><DataRow label="Referencja EAZ" value={name(bay.protection_ref)}/>
                      <DataRow label="Kody funkcji" value={bay.protection_codes?.length ? bay.protection_codes.join(', ') : NO_DATA}/>
                      <DataRow label="Przekładniki CT" value={String(devices.filter((d) => d.kind === 'CT').length)}/>
                      <DataRow label="Przekładniki VT" value={String(devices.filter((d) => d.kind === 'VT').length)}/></dl>
                    <p className="text-status-warn">Brak obliczonego dowodu odwzorowania CT/VT i koordynacji EAZ w tym widoku. Nie oznaczono zgodności.</p>
                  </div>
                )}
                {tab === 'results' && (
                  <div className="space-y-3 p-2">
                    <h3 className="font-semibold">Stan obliczeń</h3>
                    <DataRow label="Bieżąca rewizja ENM" value={currentRevision === null ? NO_DATA : String(currentRevision)}/>
                    <DataRow label="Rewizja migawki" value={String(snapshot.header.revision)}/>
                    <DataRow label="Gotowość modelu" value={readiness ? 'Dane gotowości dostępne w store' : NO_DATA}/>
                    <p className="text-status-warn">Ik″, ip, Ith, ΔU, I²t i nastawy EAZ: brak zweryfikowanego przebiegu przypisanego do tego pola. Nie obliczam ich w przeglądarce.</p>
                  </div>
                )}
              </div>
            </main>
            <aside aria-label="Inspektor katalogowy i techniczny" className="min-h-0 overflow-auto rounded border border-scada-border bg-scada-panel p-3">
              <h3 className="font-semibold uppercase tracking-wide text-scada-sn">Inspektor OEM</h3>
              {loading && <p role="status" className="mt-2">Pobieranie katalogu producentów…</p>}
              {catalogError && <div role="alert" className="mt-2 text-status-error">{catalogError}
                <button type="button" onClick={() => setRetry((n) => n + 1)} className="ml-2 underline">Ponów</button>
              </div>}
              {!loading && catalog && (
                <>
                  <div className="mt-3">
                    <label htmlFor="e05-family" className="text-scada-muted">Rodzina do przeglądu</label>
                    <select id="e05-family" data-testid="e05-family-select" value={selectedFamilyRef}
                      onChange={(e) => { setSelectedFamilyRef(e.target.value); setTab('oem'); }}
                      className="mt-1 w-full rounded border border-scada-border bg-scada-bg p-2 text-scada-text">
                      <option value="">Nieustalona</option>
                      {catalog.families.map((f) => <option key={f.switchgear_family_ref} value={f.switchgear_family_ref}>
                        {f.family_name} · {f.manufacturer_ref}
                      </option>)}
                    </select>
                    <p className="mt-1 text-[10px] text-scada-muted">Zmiana wyboru służy tylko do przeglądu. Nie zmienia ENM.</p>
                  </div>
                  <dl className="mt-3">
                    <DataRow label="Rodzina ENM" value={name(linkedFamily?.family_name)}/>
                    <DataRow label="Szablon ENM" value={name(bay.bay_template_ref)}/>
                    <DataRow label="Producent" value={name(family?.manufacturer_ref)}/>
                    <DataRow label="Tor konfiguracji" value={name(family?.tor_konfiguracji)}/>
                    <DataRow label="Napięcia sieci" value={family?.network_voltages_kv.length ? family.network_voltages_kv.map(formatKv).join(', ') : NO_DATA}/>
                    <DataRow label="Klasy urządzeń" value={family?.um_classes_kv.length ? family.um_classes_kv.map(formatKv).join(', ') : NO_DATA}/>
                    <DataRow label="Wersja źródła" value={name(family?.source_version)}/>
                  </dl>
                  <div className="mt-3"><CatalogState family={linkedFamily} template={selectedTemplate}/></div>
                  {family?.tor_konfiguracji === 'BLOK_RMU' && (
                    <section className="mt-4 border-t border-scada-border pt-3">
                      <h4 className="font-semibold">Bloki fabryczne RMU</h4>
                      {factoryError && <p role="alert" className="text-status-error">{factoryError}</p>}
                      {!factoryError && factoryConfigurations.length === 0 && <p className="text-scada-muted">Brak udostępnionych konfiguracji fabrycznych.</p>}
                      {factoryConfigurations.map((c) => (
                        <div key={c.configuration_ref} className="mt-2 rounded border border-scada-border p-2">
                          <div className="font-semibold">{c.code} · {c.name_pl}</div>
                          <div className="text-scada-muted">{c.units.map((u) => u.unit_code).join('–')} · szerokość: {c.total_width_mm === null ? NO_DATA : `${c.total_width_mm} mm`}</div>
                        </div>
                      ))}
                    </section>
                  )}
                </>
              )}
              <section className="mt-4 border-t border-scada-border pt-3">
                <h4 className="font-semibold">Wybrany aparat</h4>
                {selectedDevice ? (
                  <dl><DataRow label="Ref ENM" value={selectedDevice.device_ref}/>
                    <DataRow label="Rodzaj" value={KINDS[selectedDevice.kind] ?? selectedDevice.kind}/>
                    <DataRow label="Ref katalogowa" value={name(selectedDevice.catalog_ref)}/>
                    <DataRow label="Stan ruchowy" value={selectedDevice.switch_state?.actual_state ?? 'nieznany'}/></dl>
                ) : <p className="mt-2 text-scada-muted">Wskaż aparat w drzewie lub na rzeczywistym SLD.</p>}
              </section>
            </aside>
          </div>
          <footer data-testid="e05-readiness" className="shrink-0 border-t border-scada-border bg-scada-surface p-3">
            <h3 className="font-semibold">Kontrola kompletności odczytu · {unresolved.length} pozycji</h3>
            {unresolved.length ? (
              <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-status-warn">
                {unresolved.map((s) => <li key={s}>• {s}</li>)}
              </ul>
            ) : <p className="mt-1 text-status-warn">Podstawowe dane widoku obecne. To nie jest werdykt gotowości elektrycznej ani odbiór katalogowy.</p>}
          </footer>
        </>
      )}
    </div>
  );
}
