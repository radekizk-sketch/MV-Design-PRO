/**
 * ReferencePanel — zakładka „Referencje" Inspektora ENM (Reference Engine V1,
 * REFERENCE_ENGINE_SPEC_V1.md §9, V12K-060).
 *
 * Tabela Reference Score per pakiet referencyjny (pkt 8 dyrektywy) + lista
 * sprawdzeń ✓/✗ z powodem PL (pkt 7). Read-only, 100% PL, zero fizyki.
 * `score_percent = null` ⇒ „nie dotyczy" (zero sprawdzeń stosowalnych —
 * uczciwy raport, bez sztucznych 100%).
 *
 * ZAKRES OCENY (karta REF-PAKIET): panel jest TRZECIM miejscem oceny zgodności
 * (osiągalnym z ui2: „Model → Diagnostyka" w trybie eksperckim), więc korzysta
 * z TEJ SAMEJ kontrolki i tego samego stanu wyboru referencji co przestrzenie
 * „Model" i „Gotowość" — trzy miejsca pokazują jeden zakres, nie trzy własne.
 */

import { Fragment, useEffect, useState } from 'react';

import { WyborPakietuReferencyjnego } from '../../ui2/referencje/WyborPakietuReferencyjnego';
import { useWyborPakietu, zawezenieDlaWyboru } from '../../ui2/referencje/wyborPakietu';
import { fetchReferenceCompliance } from './api';
import type {
  ReferenceComplianceReport,
  ReferencePackComplianceReport,
} from './types';
import { REFERENCE_PACK_KIND_LABELS_PL } from './types';

interface ReferencePanelProps {
  caseId: string | null;
}

function scoreLabel(pack: ReferencePackComplianceReport): string {
  if (pack.score_percent == null) return 'nie dotyczy';
  return `${pack.score_percent}%`;
}

function scoreClass(pack: ReferencePackComplianceReport): string {
  if (pack.score_percent == null) return 'text-slate-400';
  if (pack.score_percent === 100) return 'text-emerald-600';
  if (pack.score_percent >= 80) return 'text-amber-600';
  return 'text-rose-600';
}

export function ReferencePanel({ caseId }: ReferencePanelProps) {
  const packId = useWyborPakietu((s) => s.pakietId);
  const [report, setReport] = useState<ReferenceComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPackId, setExpandedPackId] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchReferenceCompliance(caseId, zawezenieDlaWyboru(packId))
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Nieznany błąd ładowania zgodności referencyjnej',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, packId]);

  // Kontrolka zakresu jest NAD stanami: projektant musi widzieć (i móc zmienić)
  // wybraną referencję także wtedy, gdy raportu jeszcze nie ma albo się nie udał.
  const wybor = (
    <div className="mb-2">
      <WyborPakietuReferencyjnego idKontrolki="reference-panel-wybor-pakietu" />
    </div>
  );

  if (!caseId) {
    return (
      <div className="p-4 text-xs text-slate-500" data-testid="reference-panel-empty">
        {wybor}
        Wybierz wariant pracy, aby zobaczyć zgodność referencyjną.
      </div>
    );
  }
  if (loading) {
    return (
      <div className="p-4 text-xs text-slate-500" data-testid="reference-panel-loading">
        {wybor}
        Ładowanie zgodności referencyjnej…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-xs text-rose-600" data-testid="reference-panel-error">
        {wybor}
        {error}
      </div>
    );
  }
  if (!report) return null;

  return (
    <div className="h-full overflow-auto p-3" data-testid="reference-panel">
      {wybor}
      <p className="mb-2 text-[11px] text-slate-500">
        Zgodność projektu z referencjami (normy IEC, rodziny rozdzielnic,
        standardy OSD). Ocena obejmuje wyłącznie pola z danymi aparatów —
        „nie dotyczy" oznacza brak sprawdzeń stosowalnych.
      </p>
      <table className="w-full text-xs" data-testid="reference-score-table">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
            <th className="py-1 pr-2 font-medium">Referencja</th>
            <th className="py-1 pr-2 font-medium">Rodzaj</th>
            <th className="py-1 pr-2 font-medium">Wersja</th>
            <th className="py-1 pr-2 text-right font-medium">Wynik</th>
            <th className="py-1 text-right font-medium">Sprawdzenia</th>
          </tr>
        </thead>
        <tbody>
          {report.packs.map((pack) => (
            <Fragment key={pack.pack_id}>
              <tr
                className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                onClick={() =>
                  setExpandedPackId(expandedPackId === pack.pack_id ? null : pack.pack_id)
                }
                data-testid={`reference-score-row-${pack.pack_id}`}
              >
                <td className="py-1.5 pr-2 text-slate-700">{pack.name_pl}</td>
                <td className="py-1.5 pr-2 text-slate-500">
                  {REFERENCE_PACK_KIND_LABELS_PL[pack.kind]}
                </td>
                <td className="py-1.5 pr-2 text-slate-500">{pack.version}</td>
                <td
                  className={`py-1.5 pr-2 text-right font-semibold ${scoreClass(pack)}`}
                  data-testid={`reference-score-value-${pack.pack_id}`}
                >
                  {scoreLabel(pack)}
                </td>
                <td className="py-1.5 text-right text-slate-500">
                  {pack.passed}/{pack.applicable}
                </td>
              </tr>
              {expandedPackId === pack.pack_id && pack.checks.length > 0 && (
                <tr>
                  <td colSpan={5} className="bg-slate-50 px-2 py-1">
                    <ul
                      className="space-y-0.5"
                      data-testid={`reference-checks-${pack.pack_id}`}
                    >
                      {pack.checks.map((check, index) => (
                        <li
                          key={`${check.element_ref}-${check.rule_code}-${index}`}
                          className="flex gap-1.5 text-[11px]"
                        >
                          <span
                            className={
                              check.status === 'pass'
                                ? 'text-emerald-600'
                                : 'text-rose-600'
                            }
                            aria-label={
                              check.status === 'pass' ? 'zgodne' : 'niezgodne'
                            }
                          >
                            {check.status === 'pass' ? '✓' : '✗'}
                          </span>
                          <span className="text-slate-500">{check.element_ref}:</span>
                          <span className="text-slate-700">{check.message_pl}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
