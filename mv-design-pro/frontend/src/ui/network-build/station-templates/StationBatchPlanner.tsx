import { useEffect, useState } from 'react';

import {
  applyStationTemplate,
  fetchStationTemplates,
  type StationTemplateSummary,
} from './api';

type BatchMedium = 'KABEL_SN' | 'LINIA_NAPOWIETRZNA_SN';
type BatchRowStatus = 'gotowe' | 'brak_segmentu' | 'brak_szablonu' | 'brak_dlugosci';

export interface StationBatchPlanRow {
  readonly rowId: string;
  readonly index: number;
  readonly templateId: string | null;
  readonly templateName: string;
  readonly category: string;
  readonly stationRole: string;
  readonly targetSegmentRef: string | null;
  readonly medium: BatchMedium;
  readonly lengthM: number | null;
  readonly catalogProfile: string;
  readonly status: BatchRowStatus;
  readonly missingFields: readonly string[];
}

const CATEGORY_PRIORITY = [
  'typowa_sn_nn',
  'typowa_sn_nn',
  'typowa_sn_nn',
  'slupowa',
  'zksn_wnetrzowa',
  'przemyslowa',
  'sekcyjna',
  'prosument_pv',
  'farma_pv',
  'bess',
  'wiatrowa',
  'hybrydowa',
] as const;

const CATALOG_PROFILES = [
  'ZPUE_WLOSZCZOWA',
  'ELEKTROMETAL',
  'ABB',
  'SIEMENS',
] as const;

function stationRoleFromCategory(category: string, index: number): string {
  if (category.includes('pv') || category === 'farma_pv' || category === 'prosument_pv') return 'stacja z PV';
  if (category.includes('bess')) return 'stacja z BESS';
  if (category.includes('wiatr')) return 'stacja z FW';
  if (category.includes('sekcyj')) return 'stacja sekcyjna';
  if (category.includes('zksn')) return 'ZKSN / punkt rozgałęźny';
  if (category.includes('slup')) return 'stacja słupowa';
  if (index % 10 === 0) return 'stacja końcowa';
  if (index % 6 === 0) return 'stacja odgałęźna';
  return 'stacja przelotowa';
}

function selectTemplatesForBatch(
  templates: readonly StationTemplateSummary[],
  targetCount: number,
): Array<StationTemplateSummary | null> {
  if (targetCount <= 0) return [];
  const selected: StationTemplateSummary[] = [];
  const used = new Set<string>();

  for (const category of CATEGORY_PRIORITY) {
    const candidate = templates.find((template) => template.category === category && !used.has(template.id));
    if (candidate) {
      selected.push(candidate);
      used.add(candidate.id);
    }
    if (selected.length >= targetCount) break;
  }

  for (const template of templates) {
    if (selected.length >= targetCount) break;
    if (!used.has(template.id)) {
      selected.push(template);
      used.add(template.id);
    }
  }

  return Array.from({ length: targetCount }, (_, index) => selected[index] ?? null);
}

function deterministicLengthM(index: number): number {
  return 120 + ((index * 37) % 680);
}

function rowStatus(
  template: StationTemplateSummary | null,
  targetSegmentRef: string | null,
  lengthM: number | null,
): { status: BatchRowStatus; missingFields: string[] } {
  const missingFields: string[] = [];
  if (!template) missingFields.push('szablon stacji');
  if (!targetSegmentRef) missingFields.push('odcinek docelowy');
  if (typeof lengthM !== 'number' || !Number.isFinite(lengthM) || lengthM <= 0) missingFields.push('długość odcinka');
  if (missingFields.includes('szablon stacji')) return { status: 'brak_szablonu', missingFields };
  if (missingFields.includes('odcinek docelowy')) return { status: 'brak_segmentu', missingFields };
  if (missingFields.includes('długość odcinka')) return { status: 'brak_dlugosci', missingFields };
  return { status: 'gotowe', missingFields };
}

export function buildStationBatchPlan(
  templates: readonly StationTemplateSummary[],
  segmentRefs: readonly string[],
  targetCount = 50,
): StationBatchPlanRow[] {
  const selectedTemplates = selectTemplatesForBatch(templates, targetCount);
  return selectedTemplates.map((template, index) => {
    const rowIndex = index + 1;
    const targetSegmentRef = segmentRefs[index] ?? null;
    const medium: BatchMedium = rowIndex % 7 === 0 ? 'LINIA_NAPOWIETRZNA_SN' : 'KABEL_SN';
    const lengthM = deterministicLengthM(rowIndex);
    const statusInfo = rowStatus(template, targetSegmentRef, lengthM);
    return {
      rowId: `batch-station-${rowIndex}`,
      index: rowIndex,
      templateId: template?.id ?? null,
      templateName: template?.name_pl ?? 'brak szablonu',
      category: template?.category ?? 'brak',
      stationRole: stationRoleFromCategory(template?.category ?? '', rowIndex),
      targetSegmentRef,
      medium,
      lengthM,
      catalogProfile: CATALOG_PROFILES[index % CATALOG_PROFILES.length],
      status: statusInfo.status,
      missingFields: statusInfo.missingFields,
    };
  });
}

function statusLabel(status: BatchRowStatus): string {
  switch (status) {
    case 'gotowe':
      return 'gotowe';
    case 'brak_segmentu':
      return 'brak odcinka';
    case 'brak_szablonu':
      return 'brak szablonu';
    case 'brak_dlugosci':
      return 'brak długości';
  }
}

function statusClass(status: BatchRowStatus): string {
  return status === 'gotowe'
    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
    : 'border-amber-300 bg-amber-50 text-amber-800';
}

export interface StationBatchPlannerProps {
  readonly caseId: string | null;
  readonly segmentRefs: readonly string[];
  readonly targetCount?: number;
  readonly onApplied?: () => void;
}

export function StationBatchPlanner({
  caseId,
  segmentRefs,
  targetCount = 50,
  onApplied,
}: StationBatchPlannerProps) {
  const [templates, setTemplates] = useState<readonly StationTemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<StationBatchPlanRow[]>([]);
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchStationTemplates()
      .then((payload) => {
        if (cancelled) return;
        setTemplates(payload.templates);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setTemplates([]);
        setError(caught instanceof Error ? caught.message : 'Nie pobrano szablonów stacji.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setRows(buildStationBatchPlan(templates, segmentRefs, targetCount));
  }, [segmentRefs, targetCount, templates]);

  const readyRows = rows.filter((row) => row.status === 'gotowe');
  const missingRows = rows.length - readyRows.length;
  const canApply = Boolean(caseId) && rows.length > 0 && missingRows === 0 && !applying;
  const applyDisabledReason = !caseId
    ? 'Brak aktywnego zakresu obliczeń.'
    : rows.length === 0
      ? 'Najpierw pobierz szablony stacji.'
      : missingRows > 0
        ? `Plan ma ${missingRows} wierszy z brakami. Uzupełnij odcinki docelowe i długości.`
        : null;

  const updateLength = (rowId: string, value: string) => {
    const parsed = Number(value);
    setRows((current) => current.map((row) => {
      if (row.rowId !== rowId) return row;
      const lengthM = Number.isFinite(parsed) ? parsed : null;
      const statusInfo = rowStatus(row.templateId ? {
        id: row.templateId,
        name_pl: row.templateName,
        category: row.category,
        description_pl: '',
        use_case_pl: '',
        nc_rfg_type: null,
        tags: [],
        icon: '',
      } : null, row.targetSegmentRef, lengthM);
      return { ...row, lengthM, status: statusInfo.status, missingFields: statusInfo.missingFields };
    }));
  };

  const updateMedium = (rowId: string, medium: BatchMedium) => {
    setRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, medium } : row)));
  };

  const updateCatalogProfile = (rowId: string, catalogProfile: string) => {
    setRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, catalogProfile } : row)));
  };

  const applyPlan = async () => {
    if (!caseId || !canApply) return;
    setApplying(true);
    setAppliedCount(0);
    setError(null);
    try {
      for (const row of rows) {
        if (!row.templateId || !row.targetSegmentRef) {
          throw new Error(`Wiersz ${row.index}: brak szablonu albo odcinka docelowego.`);
        }
        await applyStationTemplate(row.templateId, {
          case_id: caseId,
          target_segment_id: row.targetSegmentRef,
          insert_at_ratio: 0.5,
          params_override: {
            planned_length_m: row.lengthM,
            planned_medium: row.medium,
          },
          catalog_profile: row.catalogProfile,
        });
        setAppliedCount((current) => current + 1);
      }
      onApplied?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Zapis planu masowego nie powiódł się.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <section
      data-testid="station-batch-planner"
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Etap 3 - plan ciągu SN 50+
          </h4>
          <p className="mt-1 text-xs text-slate-600">
            Plan wybiera szablony stacji z katalogu, przypisuje je do odcinków docelowych i pozwala
            skorygować długość, medium oraz profil katalogowy przed zapisem.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
            Szablony: {templates.length}
          </span>
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
            Odcinki docelowe: {segmentRefs.length}
          </span>
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
            Gotowe wiersze: {readyRows.length}/{targetCount}
          </span>
        </div>
      </div>

      {loading && <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">Pobieranie szablonów stacji...</div>}
      {error && <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">{error}</div>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          onClick={() => setRows(buildStationBatchPlan(templates, segmentRefs, targetCount))}
        >
          Odtwórz plan {targetCount} stacji
        </button>
        <button
          type="button"
          data-testid="station-batch-apply"
          disabled={!canApply}
          title={applyDisabledReason ?? 'Zapisz plan masowy przez szablony stacji.'}
          className={
            'rounded px-3 py-1.5 text-xs font-semibold '
            + (canApply
              ? 'bg-slate-900 text-white hover:bg-slate-800'
              : 'cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400')
          }
          onClick={() => void applyPlan()}
        >
          {applying ? `Zapis ${appliedCount}/${rows.length}` : 'Zastosuj plan do modelu'}
        </button>
        {applyDisabledReason && (
          <span data-testid="station-batch-disabled-reason" className="self-center text-xs text-slate-500">
            {applyDisabledReason}
          </span>
        )}
      </div>

      <div className="max-h-[440px] overflow-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Lp.</th>
              <th className="px-3 py-2 font-semibold">Funkcja</th>
              <th className="px-3 py-2 font-semibold">Szablon</th>
              <th className="px-3 py-2 font-semibold">Odcinek</th>
              <th className="px-3 py-2 font-semibold">Medium</th>
              <th className="px-3 py-2 font-semibold">Długość [m]</th>
              <th className="px-3 py-2 font-semibold">Profil katalogowy</th>
              <th className="px-3 py-2 font-semibold">Stan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.rowId} data-testid={`station-batch-row-${row.index}`}>
                <td className="px-3 py-2 font-semibold text-slate-900">{row.index}</td>
                <td className="px-3 py-2 text-slate-700">{row.stationRole}</td>
                <td className="max-w-[240px] px-3 py-2 text-slate-700">
                  <div className="font-medium text-slate-900">{row.templateName}</div>
                  <div className="text-[10px] text-slate-500">{row.category}</div>
                </td>
                <td className="max-w-[180px] px-3 py-2 font-mono text-[10px] text-slate-600">
                  {row.targetSegmentRef ?? 'brak odcinka'}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.medium}
                    onChange={(event) => updateMedium(row.rowId, event.target.value as BatchMedium)}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                    aria-label={`Medium wiersza ${row.index}`}
                  >
                    <option value="KABEL_SN">Kabel SN</option>
                    <option value="LINIA_NAPOWIETRZNA_SN">Linia napowietrzna SN</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={1}
                    value={row.lengthM ?? ''}
                    onChange={(event) => updateLength(row.rowId, event.target.value)}
                    className="w-24 rounded border border-slate-200 px-2 py-1 text-xs"
                    aria-label={`Długość odcinka wiersza ${row.index}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.catalogProfile}
                    onChange={(event) => updateCatalogProfile(row.rowId, event.target.value)}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                    aria-label={`Profil katalogowy wiersza ${row.index}`}
                  >
                    {CATALOG_PROFILES.map((profile) => (
                      <option key={profile} value={profile}>{profile}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(row.status)}`}>
                    {statusLabel(row.status)}
                  </span>
                  {row.missingFields.length > 0 && (
                    <div className="mt-1 max-w-[220px] text-[10px] text-slate-500">
                      {row.missingFields.join(', ')}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
