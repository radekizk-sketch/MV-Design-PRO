type SegmentStatusOption = 'closed' | 'open';

interface SegmentReadinessSummary {
  ready: boolean;
  blockerCount: number;
  warningCount: number;
}

export interface SegmentInspectorPanelProps {
  title?: string;
  displayName: string;
  technicalRef: string;
  kindLabel: string;
  fromLabel: string;
  toLabel: string;
  statusLabel: string;
  voltageKv: number | null;
  lengthKm: string;
  branchTypeLabel: string;
  catalogRef: string;
  catalogNamespaceLabel: string;
  catalogVersion: string;
  parameterSourceLabel: string;
  hasMaterializedParams: boolean;
  manualOverrideCount: number;
  readiness: SegmentReadinessSummary;
  fixActionMessages: string[];
  lengthDraft: string;
  statusDraft: SegmentStatusOption;
  catalogDraft: string;
  onLengthDraftChange: (value: string) => void;
  onStatusDraftChange: (value: SegmentStatusOption) => void;
  onSave: () => void;
  onOpenCatalogPicker: () => void;
  onClose: () => void;
}

function formatVoltage(voltageKv: number | null): string {
  if (voltageKv === null || Number.isNaN(voltageKv)) {
    return '—';
  }
  return `${voltageKv} kV`;
}

function formatLength(lengthKm: string): string {
  return lengthKm.trim() ? `${lengthKm} km` : '—';
}

export function SegmentInspectorPanel({
  title = 'Inspektor odcinka',
  displayName,
  technicalRef,
  kindLabel,
  fromLabel,
  toLabel,
  statusLabel,
  voltageKv,
  lengthKm,
  branchTypeLabel,
  catalogRef,
  catalogNamespaceLabel,
  catalogVersion,
  parameterSourceLabel,
  hasMaterializedParams,
  manualOverrideCount,
  readiness,
  fixActionMessages,
  lengthDraft,
  statusDraft,
  catalogDraft,
  onLengthDraftChange,
  onStatusDraftChange,
  onSave,
  onOpenCatalogPicker,
  onClose,
}: SegmentInspectorPanelProps) {
  return (
    <div data-testid="inspector-engineering">
      <aside
        className="w-80 border-l border-gray-200 bg-white p-3 text-sm"
        data-testid="sld-segment-inspector"
      >
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <div className="mt-2 space-y-1 text-xs text-gray-700">
        <div><span className="font-medium">Nazwa odcinka:</span> {displayName}</div>
        <div><span className="font-medium">Identyfikator odcinka:</span> {technicalRef}</div>
        <div><span className="font-medium">Rodzaj odcinka:</span> {kindLabel}</div>
        <div><span className="font-medium">Od węzła początkowego:</span> {fromLabel}</div>
        <div><span className="font-medium">Do węzła końcowego:</span> {toLabel}</div>
        <div data-testid="sld-segment-inspector-status">
          <span className="font-medium">Stan:</span> {statusLabel}
        </div>
        <div data-testid="sld-segment-inspector-voltage">
          <span className="font-medium">Napięcie robocze:</span> {formatVoltage(voltageKv)}
        </div>
        <div data-testid="sld-segment-inspector-length">
          <span className="font-medium">Długość:</span> {formatLength(lengthKm)}
        </div>
        <div data-testid="sld-segment-inspector-type">
          <span className="font-medium">Rodzina odcinka:</span> {branchTypeLabel}
        </div>
        <div data-testid="sld-segment-inspector-catalog">
          <span className="font-medium">Pozycja katalogowa:</span> {catalogRef}
        </div>
        <div data-testid="sld-segment-inspector-kategoria-katalogu">
          <span className="font-medium">Przestrzeń katalogowa:</span>{' '}
          <span data-testid="sld-segment-inspector-namespace">{catalogNamespaceLabel}</span>
        </div>
        <div data-testid="sld-segment-inspector-version">
          <span className="font-medium">Wersja pozycji:</span> {catalogVersion}
        </div>
        <div data-testid="sld-segment-inspector-parameter-source">
          <span className="font-medium">Źródło parametrów:</span> {parameterSourceLabel}
        </div>
        <div data-testid="sld-segment-inspector-materialized">
          <span className="font-medium">Parametry z katalogu wczytane:</span>{' '}
          {hasMaterializedParams ? 'TAK' : 'NIE'}
        </div>
        <div data-testid="sld-segment-inspector-overrides">
          <span className="font-medium">Nadpisania ręczne:</span> {manualOverrideCount}
        </div>
      </div>

        <div className="mt-3 rounded border border-gray-200 p-2">
        <div className="text-xs font-semibold text-gray-700">
          Gotowość obliczeń i szybkie naprawy
        </div>
        <div
          className="mt-1 text-[11px] text-gray-600"
          data-testid="sld-segment-readiness-status"
        >
          Gotowy: {readiness.ready ? 'TAK' : 'NIE'} | Blokery: {readiness.blockerCount} | Ostrzeżenia:{' '}
          {readiness.warningCount}
        </div>
        <ul
          className="mt-1 list-disc pl-4 text-[11px] text-gray-700"
          data-testid="sld-segment-fix-actions"
        >
          {fixActionMessages.length === 0 ? (
            <li>Brak akcji naprawczych dla odcinka.</li>
          ) : (
            fixActionMessages.map((message) => <li key={message}>{message}</li>)
          )}
        </ul>
        </div>

        <div className="mt-3 rounded border border-gray-200 p-2">
        <div className="text-xs font-semibold text-gray-700">Edycja odcinka</div>
        <label className="mt-2 block text-[11px] text-gray-600">
          Długość [km]
          <input
            data-testid="sld-segment-input-length"
            type="number"
            step="0.001"
            value={lengthDraft}
            onChange={(event) => onLengthDraftChange(event.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
          />
        </label>
        <label className="mt-2 block text-[11px] text-gray-600">
          Status
          <select
            data-testid="sld-segment-input-status"
            value={statusDraft}
            onChange={(event) => onStatusDraftChange(event.target.value as SegmentStatusOption)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="closed">zamknięty</option>
            <option value="open">otwarty</option>
          </select>
        </label>
        <button
          data-testid="sld-segment-save-button"
          type="button"
          className="mt-2 w-full rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
          onClick={onSave}
        >
          Zapisz parametry odcinka
        </button>
        </div>

        <div className="mt-3 rounded border border-gray-200 p-2">
        <div className="text-xs font-semibold text-gray-700">Katalog odcinka</div>
        <div
          className="mt-1 text-[11px] text-gray-600"
          data-testid="sld-segment-catalog-status"
        >
          {catalogDraft.trim()
            ? `Przypisano ${catalogRef} (${catalogVersion})`
            : 'Brak przypisanego katalogu odcinka.'}
        </div>
        <button
          data-testid="sld-segment-open-catalog-picker"
          type="button"
          className="mt-2 w-full rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
          onClick={onOpenCatalogPicker}
        >
          {catalogDraft.trim() ? 'Zmień typ z katalogu' : 'Przypisz katalog'}
        </button>
        <input
          data-testid="sld-segment-input-catalog"
          type="text"
          value={catalogDraft}
          readOnly
          disabled
          placeholder="Brak przypisania katalogowego"
          className="mt-1 w-full rounded border border-gray-300 bg-gray-50 px-2 py-1 text-xs"
        />
        </div>

        <button
          type="button"
          className="mt-3 w-full rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
          onClick={onClose}
        >
          Zamknij inspektor odcinka
        </button>
      </aside>
    </div>
  );
}

export default SegmentInspectorPanel;
