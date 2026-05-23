/**
 * WorkProfileForm — edytor profilu pracy (Pakiet D).
 *
 * Resolutions: 24h / 168h / 8760h.
 * Dla 8760h:
 *   - WIRTUALIZACJA: render tylko widocznego okna (page-based, 100 wierszy)
 *   - CSV import (parseWorkProfileCsv)
 *   - Widoki agregowane: dobowy / tygodniowy / miesięczny
 */

import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { clsx } from 'clsx';

import {
  WORK_PROFILE_LENGTH,
  aggregateTo168h,
  aggregateTo24h,
  aggregateToMonthly,
  parseWorkProfileCsv,
  validateWorkProfileLength,
} from './profileTypes';
import type { WorkProfile, WorkProfileResolution } from './profileTypes';

const PAGE_SIZE = 100;
const MONTHS_PL = [
  'Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze',
  'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru',
];

type AggregateView = 'none' | 'daily' | 'weekly' | 'monthly';

export interface WorkProfileFormProps {
  initial?: WorkProfile;
  onSubmit: (profile: WorkProfile) => void;
  onCancel?: () => void;
}

export function WorkProfileForm({ initial, onSubmit, onCancel }: WorkProfileFormProps) {
  const [resolution, setResolution] = useState<WorkProfileResolution>(
    initial?.resolution ?? 'hourly_24',
  );
  const [values, setValues] = useState<number[]>(() => {
    if (initial && initial.values.length === WORK_PROFILE_LENGTH[initial.resolution]) {
      return [...initial.values];
    }
    return new Array(WORK_PROFILE_LENGTH[resolution]).fill(1.0);
  });
  const [seasonLabel, setSeasonLabel] = useState<string>(initial?.season_label ?? '');
  const [page, setPage] = useState<number>(0);
  const [aggregateView, setAggregateView] = useState<AggregateView>('none');
  const [importError, setImportError] = useState<string | null>(null);

  const handleResolutionChange = useCallback((next: WorkProfileResolution) => {
    setResolution(next);
    setValues(new Array(WORK_PROFILE_LENGTH[next]).fill(1.0));
    setPage(0);
    setAggregateView('none');
  }, []);

  const updateValue = useCallback((idx: number, v: number) => {
    setValues((prev) => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
  }, []);

  const handleCsvFile = useCallback(
    async (file: File) => {
      setImportError(null);
      try {
        const text = await file.text();
        const parsed = parseWorkProfileCsv(text);
        const expected = WORK_PROFILE_LENGTH[resolution];
        if (parsed.length !== expected) {
          setImportError(`CSV zawiera ${parsed.length} wartości, oczekiwano ${expected}.`);
          return;
        }
        setValues(parsed);
        setPage(0);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : String(err));
      }
    },
    [resolution],
  );

  const onCsvInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleCsvFile(file);
    },
    [handleCsvFile],
  );

  const totalPages = Math.max(1, Math.ceil(values.length / PAGE_SIZE));
  const visibleStart = page * PAGE_SIZE;
  const visibleEnd = Math.min(visibleStart + PAGE_SIZE, values.length);

  const aggregatedDaily = useMemo(() => {
    if (aggregateView !== 'daily' || resolution !== 'hourly_8760') return null;
    return aggregateTo24h(values);
  }, [aggregateView, resolution, values]);

  const aggregatedWeekly = useMemo(() => {
    if (aggregateView !== 'weekly' || resolution !== 'hourly_8760') return null;
    return aggregateTo168h(values);
  }, [aggregateView, resolution, values]);

  const aggregatedMonthly = useMemo(() => {
    if (aggregateView !== 'monthly' || resolution !== 'hourly_8760') return null;
    return aggregateToMonthly(values);
  }, [aggregateView, resolution, values]);

  const validationError = useMemo(() => {
    return validateWorkProfileLength({
      kind: 'work',
      resolution,
      values,
      season_label: seasonLabel || undefined,
    });
  }, [resolution, values, seasonLabel]);

  const canSubmit = validationError === null;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit({
      kind: 'work',
      resolution,
      values: [...values],
      season_label: seasonLabel || undefined,
    });
  }, [canSubmit, resolution, values, seasonLabel, onSubmit]);

  return (
    <form
      data-testid="work-profile-form"
      className="flex flex-col gap-3 p-3 bg-scada-surface text-scada-text"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <h3 className="text-sm font-semibold">Profil pracy</h3>

      <div className="flex gap-3 items-center">
        <label className="text-xs flex items-center gap-2">
          Rozdzielczość:
          <select title="Rozdzielczość:"
            value={resolution}
            onChange={(e) => handleResolutionChange(e.target.value as WorkProfileResolution)}
            className="bg-scada-bg border border-scada-border px-1"
            data-testid="work-resolution"
          >
            <option value="hourly_24">Dobowy (24h)</option>
            <option value="hourly_168">Tygodniowy (168h)</option>
            <option value="hourly_8760">Roczny (8760h)</option>
          </select>
        </label>
        <label className="text-xs flex items-center gap-2 ml-auto">
          Etykieta sezonowa:
          <input title="Etykieta sezonowa:"
            type="text"
            value={seasonLabel}
            onChange={(e) => setSeasonLabel(e.target.value)}
            className="w-32 bg-scada-bg border border-scada-border px-1"
            data-testid="work-season-label"
          />
        </label>
      </div>

      {resolution === 'hourly_8760' && (
        <div className="flex flex-col gap-2 border border-scada-border p-2">
          <div className="flex gap-2 items-center text-xs">
            <span className="font-semibold">Import CSV:</span>
            <input title="Import CSV:"
              type="file"
              accept=".csv,text/csv"
              onChange={onCsvInput}
              className="text-xs"
              data-testid="work-csv-input"
            />
            {importError && (
              <span className="text-red-400" data-testid="work-csv-error">
                {importError}
              </span>
            )}
          </div>
          <div className="flex gap-1 text-xs" data-testid="work-aggregate-tabs">
            {(['none', 'daily', 'weekly', 'monthly'] as AggregateView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAggregateView(v)}
                className={clsx(
                  'px-2 py-0.5 border',
                  aggregateView === v
                    ? 'bg-scada-active border-scada-active text-scada-sn'
                    : 'border-scada-border hover:bg-scada-hover-nav',
                )}
                data-testid={`work-view-${v}`}
              >
                {v === 'none' ? 'Surowe' : v === 'daily' ? 'Dobowy' : v === 'weekly' ? 'Tygodniowy' : 'Miesięczny'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Aggregated views (read-only) */}
      {aggregatedDaily && (
        <table className="text-xs" data-testid="work-aggregated-daily">
          <thead>
            <tr><th>Godzina doby</th><th>Średnia P [pu]</th></tr>
          </thead>
          <tbody>
            {aggregatedDaily.map((v, h) => (
              <tr key={h}>
                <td>{h}</td>
                <td>{v.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {aggregatedWeekly && (
        <p className="text-xs" data-testid="work-aggregated-weekly">
          168h tygodniowych — pierwszych 24 wartości: {aggregatedWeekly.slice(0, 24).map((v) => v.toFixed(2)).join(', ')}
        </p>
      )}

      {aggregatedMonthly && (
        <table className="text-xs" data-testid="work-aggregated-monthly">
          <thead>
            <tr><th>Miesiąc</th><th>Średnia P [pu]</th></tr>
          </thead>
          <tbody>
            {aggregatedMonthly.map((v, m) => (
              <tr key={m}>
                <td>{MONTHS_PL[m]}</td>
                <td>{v.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Raw values (paginated for 8760, full for 24/168) */}
      {aggregateView === 'none' && (
        <div className="flex flex-col gap-1">
          <div className="flex gap-2 items-center text-xs">
            <span data-testid="work-page-info">
              Wiersze {visibleStart + 1}–{visibleEnd} z {values.length}
            </span>
            {totalPages > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-2 py-0.5 border border-scada-border disabled:opacity-30"
                  data-testid="work-page-prev"
                >
                  ←
                </button>
                <span data-testid="work-page-num">
                  Strona {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page === totalPages - 1}
                  className="px-2 py-0.5 border border-scada-border disabled:opacity-30"
                  data-testid="work-page-next"
                >
                  →
                </button>
              </>
            )}
          </div>
          <table className="text-xs" data-testid="work-values-table">
            <thead>
              <tr><th>h</th><th>P [pu]</th></tr>
            </thead>
            <tbody>
              {values.slice(visibleStart, visibleEnd).map((v, idx) => {
                const realIdx = visibleStart + idx;
                return (
                  <tr key={realIdx} data-testid={`work-row-${realIdx}`}>
                    <td>{realIdx}</td>
                    <td>
                      <input title="h"
                        type="number"
                        step="0.01"
                        value={v}
                        onChange={(e) => updateValue(realIdx, Number(e.target.value))}
                        className="w-20 bg-scada-bg px-1 border border-scada-border"
                        data-testid={`work-input-${realIdx}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {validationError && (
        <p className="text-xs text-red-400" data-testid="work-validation-error">
          {validationError}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1 border border-scada-border hover:bg-scada-hover-nav"
            data-testid="work-cancel"
          >
            Anuluj
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className={clsx(
            'text-xs px-3 py-1 border',
            canSubmit
              ? 'bg-scada-active border-scada-active text-scada-sn'
              : 'border-scada-border text-scada-muted cursor-not-allowed',
          )}
          data-testid="work-submit"
        >
          Zapisz profil
        </button>
      </div>
    </form>
  );
}
