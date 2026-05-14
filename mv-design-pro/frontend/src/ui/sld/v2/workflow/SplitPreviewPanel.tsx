/**
 * SplitPreviewPanel — Wizard K7: panel potwierdzenia podziału odcinka SN.
 *
 * Pokazywany gdy ConsciousSplitController jest w stanie `preview_ready`.
 * Operator widzi skutki elektryczne przed zatwierdzeniem (Conscious Split).
 *
 * Wymagania K7:
 *  - Wyświetl wstawioną stację, długości półodcinków, liczbę dotkniętych obiektów.
 *  - Ostrzeż jeśli topologia zmienia typ lub są unieważnione wyniki.
 *  - "Potwierdź" i "Anuluj" — oba wymagane per AC-K7.
 */

import type { SplitElectricalImpact, SplitPreview } from './ConsciousSplitController';

export interface SplitPreviewPanelProps {
  readonly preview: SplitPreview;
  readonly segmentName?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly confirming?: boolean;
}

function ImpactRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0 text-scada-text/70">{label}</span>
      <span
        className={`text-right font-mono-eng text-[10px] ${warn ? 'text-amber-400' : 'text-scada-text'}`}
      >
        {value}
      </span>
    </div>
  );
}

function ImpactSection({ impact }: { impact: SplitElectricalImpact }) {
  const { halves, affectedObjectRefs, invalidatedResults, missingDataAfter } = impact;
  const hasWarnings =
    impact.topologyTypeChanged || invalidatedResults.length > 0 || missingDataAfter.length > 0;

  return (
    <div className="space-y-1">
      <div
        className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-scada-text/50"
        data-testid="split-preview-impact-header"
      >
        Skutki elektryczne
      </div>
      <ImpactRow
        label="Odcinek 1"
        value={`${halves.firstLengthKm.toFixed(3)} km`}
      />
      <ImpactRow
        label="Odcinek 2"
        value={`${halves.secondLengthKm.toFixed(3)} km`}
      />
      <ImpactRow
        label="Podział"
        value={`${(halves.splitRatio * 100).toFixed(1)}% / ${((1 - halves.splitRatio) * 100).toFixed(1)}%`}
      />
      {affectedObjectRefs.length > 0 && (
        <ImpactRow
          label="Dotknięte obiekty"
          value={String(affectedObjectRefs.length)}
        />
      )}
      {hasWarnings && (
        <div
          className="mt-1 rounded border border-amber-500/30 bg-amber-900/20 px-2 py-1 text-[9px] text-amber-400"
          data-testid="split-preview-warnings"
        >
          {impact.topologyTypeChanged && <div>⚠ Zmiana topologii sieci</div>}
          {invalidatedResults.length > 0 && (
            <div>⚠ Unieważni {invalidatedResults.length} wynik(ów) obliczeń</div>
          )}
          {missingDataAfter.length > 0 && (
            <div>⚠ Brakujące dane po podziale: {missingDataAfter.length}</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Panel potwierdzenia Wizard K7 — renderowany absolutnie nad canvas.
 * Montowany przez SldWorkspaceContainer gdy split_state === 'preview_ready'.
 */
export function SplitPreviewPanel({
  preview,
  segmentName,
  onConfirm,
  onCancel,
  confirming = false,
}: SplitPreviewPanelProps): JSX.Element {
  return (
    <div
      data-testid="split-preview-panel"
      className="pointer-events-auto absolute bottom-16 left-1/2 z-30 w-[340px] -translate-x-1/2 rounded border border-scada-border bg-scada-panel/95 px-4 py-3 text-[11px] text-scada-text shadow-2xl"
    >
      {/* Nagłówek */}
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-scada-text">Podział odcinka SN</span>
        <button
          type="button"
          onClick={onCancel}
          disabled={confirming}
          data-testid="split-preview-cancel"
          className="rounded px-1.5 py-0.5 text-[10px] text-scada-text/60 hover:text-scada-text"
          aria-label="Anuluj podział"
        >
          ✕ Anuluj
        </button>
      </div>

      {/* Segment info */}
      {segmentName && (
        <div className="mb-2 text-scada-text/60" data-testid="split-preview-segment">
          Odcinek: <span className="text-scada-text">{segmentName}</span>
        </div>
      )}

      {/* Nowa stacja */}
      <div className="mb-2" data-testid="split-preview-station">
        <span className="text-scada-text/60">Wstawia: </span>
        <span className="font-semibold">{preview.stationType}</span>
        <span className="ml-1 text-scada-text/40 font-mono-eng text-[9px]">
          [{preview.insertedStationId}]
        </span>
      </div>

      {/* Skutki elektryczne */}
      <ImpactSection impact={preview.electricalImpact} />

      {/* Przyciski akcji */}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={confirming}
          data-testid="split-preview-cancel-btn"
          className="rounded border border-scada-border px-3 py-1 text-[11px] text-scada-text hover:bg-scada-hover-nav disabled:opacity-50"
        >
          Anuluj
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          data-testid="split-preview-confirm"
          className="rounded border border-emerald-600 bg-emerald-700/80 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {confirming ? 'Zatwierdzanie…' : 'Potwierdź podział'}
        </button>
      </div>
    </div>
  );
}
