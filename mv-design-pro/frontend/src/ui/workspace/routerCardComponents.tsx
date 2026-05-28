/**
 * routerCardComponents - drobne komponenty UI z WorkspaceSurfaceRouter.
 *
 * Pure presentational components bez side-effects / store dependencies.
 */

import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}

export function SectionCard({ title, eyebrow, children }: SectionCardProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {eyebrow && (
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</div>
      )}
      <h3 className="mt-1 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

interface KeyValueRow {
  label: string;
  value: string;
}

interface KeyValueGridProps {
  rows: KeyValueRow[];
  columns?: 2 | 3;
}

export function KeyValueGrid({ rows, columns = 2 }: KeyValueGridProps) {
  return (
    <div className={`grid gap-3 ${columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{row.label}</div>
          <div className="mt-1 text-sm text-slate-800">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

export type EngineeringWorkflowStage =
  | 'project'
  | 'gpz'
  | 'trunk'
  | 'stations'
  | 'branches'
  | 'catalogs'
  | 'calculations'
  | 'protection'
  | 'ncrfg'
  | 'proof'
  | 'report';

export type EngineeringStageStatus =
  | 'gotowe'
  | 'brak_danych'
  | 'wynik_zablokowany'
  | 'czesciowy'
  | 'do_sprawdzenia';

export interface EngineeringStageRow {
  id: string;
  stage: EngineeringWorkflowStage;
  objectRef?: string | null;
  label: string;
  status: EngineeringStageStatus;
  dataSummary: string;
  missingFields?: readonly string[];
  fixAction?: {
    label: string;
    onClick?: () => void;
    disabledReason?: string | null;
  };
  sourceRef?: string | null;
}

export interface ReportChapterStatus {
  chapterId: string;
  titlePl: string;
  status: EngineeringStageStatus;
  objectCount: number;
  sourceKind: string;
  missingCount: number;
  exportIncluded: boolean;
  fixAction?: {
    label: string;
    onClick?: () => void;
    disabledReason?: string | null;
  };
}

const STATUS_LABELS: Record<EngineeringStageStatus, string> = {
  gotowe: 'gotowe',
  brak_danych: 'brak danych',
  wynik_zablokowany: 'wynik zablokowany',
  czesciowy: 'częściowo',
  do_sprawdzenia: 'do sprawdzenia',
};

const STATUS_CLASSES: Record<EngineeringStageStatus, string> = {
  gotowe: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  brak_danych: 'border-amber-200 bg-amber-50 text-amber-800',
  wynik_zablokowany: 'border-rose-200 bg-rose-50 text-rose-800',
  czesciowy: 'border-sky-200 bg-sky-50 text-sky-800',
  do_sprawdzenia: 'border-slate-200 bg-slate-50 text-slate-700',
};

function StatusPill({ status }: { status: EngineeringStageStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function missingFieldsLabel(fields: readonly string[] | undefined): string {
  if (!fields || fields.length === 0) {
    return 'brak';
  }
  return fields.join(', ');
}

export function EngineeringFixActionButton({
  label,
  onClick,
  disabledReason,
  testId,
}: {
  label: string;
  onClick?: () => void;
  disabledReason?: string | null;
  testId?: string;
}) {
  const disabled = !onClick || Boolean(disabledReason);
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        data-testid={testId}
        disabled={disabled}
        title={disabledReason ?? (disabled ? 'Akcja niedostępna dla bieżącego stanu.' : label)}
        onClick={onClick}
        className={
          'rounded border px-2.5 py-1 text-[11px] font-semibold '
          + (disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50')
        }
      >
        {label}
      </button>
      {disabledReason && (
        <span className="max-w-[220px] text-[10px] leading-snug text-slate-500">{disabledReason}</span>
      )}
    </div>
  );
}

export function ActionableEngineeringTable({
  title,
  description,
  rows,
  testId = 'actionable-engineering-table',
}: {
  title: string;
  description?: string;
  rows: readonly EngineeringStageRow[];
  testId?: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h4>
        {description && <p className="mt-1 text-xs text-slate-600">{description}</p>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table data-testid={testId} className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Obszar</th>
              <th scope="col" className="px-3 py-2 font-semibold">Stan</th>
              <th scope="col" className="px-3 py-2 font-semibold">Dane</th>
              <th scope="col" className="px-3 py-2 font-semibold">Braki</th>
              <th scope="col" className="px-3 py-2 font-semibold">Źródło</th>
              <th scope="col" className="px-3 py-2 font-semibold">Akcja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {rows.map((row) => (
              <tr key={row.id} data-stage={row.stage} data-object-ref={row.objectRef ?? undefined}>
                <td className="px-3 py-2 align-top font-semibold text-slate-900">{row.label}</td>
                <td className="px-3 py-2 align-top"><StatusPill status={row.status} /></td>
                <td className="max-w-[280px] px-3 py-2 align-top">{row.dataSummary}</td>
                <td className="max-w-[260px] px-3 py-2 align-top">{missingFieldsLabel(row.missingFields)}</td>
                <td className="px-3 py-2 align-top text-slate-500">{row.sourceRef ?? 'model / ślad'}</td>
                <td className="px-3 py-2 align-top">
                  {row.fixAction ? (
                    <EngineeringFixActionButton
                      label={row.fixAction.label}
                      onClick={row.fixAction.onClick}
                      disabledReason={row.fixAction.disabledReason}
                      testId={`engineering-fix-action-${row.id}`}
                    />
                  ) : (
                    <span className="text-[11px] text-slate-500">nie wymaga akcji</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReportChapterChecklist({
  rows,
}: {
  rows: readonly ReportChapterStatus[];
}) {
  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Drzewo raportu</h4>
        <p className="mt-1 text-xs text-slate-600">
          Każdy rozdział ma jawne źródło danych, kompletność i akcję naprawczą.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table data-testid="report-chapter-checklist" className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Rozdział</th>
              <th scope="col" className="px-3 py-2 font-semibold">Status</th>
              <th scope="col" className="px-3 py-2 font-semibold">Obiekty</th>
              <th scope="col" className="px-3 py-2 font-semibold">Źródło danych</th>
              <th scope="col" className="px-3 py-2 font-semibold">Braki</th>
              <th scope="col" className="px-3 py-2 font-semibold">Eksport</th>
              <th scope="col" className="px-3 py-2 font-semibold">Akcja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {rows.map((row) => (
              <tr key={row.chapterId}>
                <td className="px-3 py-2 align-top font-semibold text-slate-900">{row.titlePl}</td>
                <td className="px-3 py-2 align-top"><StatusPill status={row.status} /></td>
                <td className="px-3 py-2 align-top">{row.objectCount}</td>
                <td className="px-3 py-2 align-top text-slate-500">{row.sourceKind}</td>
                <td className="px-3 py-2 align-top">{row.missingCount}</td>
                <td className="px-3 py-2 align-top">{row.exportIncluded ? 'tak' : 'nie'}</td>
                <td className="px-3 py-2 align-top">
                  {row.fixAction ? (
                    <EngineeringFixActionButton
                      label={row.fixAction.label}
                      onClick={row.fixAction.onClick}
                      disabledReason={row.fixAction.disabledReason}
                      testId={`report-chapter-action-${row.chapterId}`}
                    />
                  ) : (
                    <span className="text-[11px] text-slate-500">nie wymaga akcji</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EmptyEngineeringState({
  title,
  reason,
  requiredData,
  actionLabel,
  onAction,
}: {
  title: string;
  reason: string;
  requiredData: string;
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <div data-testid="empty-engineering-state" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <div className="font-semibold">{title}</div>
      <p className="mt-1">{reason}</p>
      <p className="mt-1"><span className="font-semibold">Wymagane dane:</span> {requiredData}</p>
      <div className="mt-2">
        <EngineeringFixActionButton label={actionLabel} onClick={onAction} />
      </div>
    </div>
  );
}
