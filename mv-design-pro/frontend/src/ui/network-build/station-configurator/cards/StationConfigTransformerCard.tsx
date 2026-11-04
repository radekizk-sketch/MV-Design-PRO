/**
 * Karta 5 — Transformator SN/nN (multi-voltage nN, PR-8a brief §8 karta 5 + §13).
 *
 * Naprawa eng.13: wybór przełącznika zaczepów z katalogu audytu 2
 * (OLTC vs DETC, ±10% / ±5%, AVR support).
 *
 * Karta JEDNA-SCIEZKA-EDYCJI: każde pole czyta model ENM i zapisuje go operacją domenową
 * (rodzic, `StationConfiguratorSurface`, przez definicje rejestru pól). Dawniej Sn, U_DN, u_k,
 * P_k, P_0 i pozycja zaczepu wołały `onChange`, który je GUBIŁ (rodzic obsługiwał tylko typ
 * katalogowy, grupę połączeń i przełącznik zaczepów), a przełącznik zaczepów trafiał do
 * drugiej prawdy (konfiguracja stacji audytu 2) zamiast do podzespołu `tap_changer` modelu.
 * - Dane tabliczkowe (Sn, U_DN, u_k, P_k, P_0) są TYLKO DO ODCZYTU, gdy transformator ma typ
 *   katalogowy (SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW: parametry z typu); bez typu —
 *   edytowalne wprost w modelu.
 * - Pozycja zaczepu jest zawsze edytowalna (stan pracy, nie dana tabliczkowa).
 * - Katalog przełączników zaczepów z backendu (`GET /api/catalog/tap-changers`).
 * Pola liczbowe zapisują przy opuszczeniu pola albo Enter (jedna operacja na wartość,
 * nie na każdy znak).
 */

import { useEffect, useState } from 'react';

import {
  getTapChanger,
  klasaTransformatoraPrzelacznika,
  selectTapChangersForTransformer,
} from '../../station-der/catalogs';
import type { TapChangerCatalogType } from '../../../catalog/types';

export interface StationTransformerCatalogOption {
  readonly id: string;
  readonly name: string;
  readonly manufacturer?: string;
  readonly summary: string;
  readonly ratedPowerMva: number;
  readonly voltageHvKv: number;
  readonly voltageLvKv: number;
  readonly ukPercent: number;
  readonly pkKw: number;
  readonly p0Kw: number;
  readonly vectorGroup: string;
  readonly adequatePower: boolean;
  readonly recommended: boolean;
}

export interface StationConfigTransformerRow {
  readonly transformerId: string;
  readonly designation: string;
  readonly catalogRef?: string | null;
  readonly snMva: number | null;
  readonly uhvKv: number;
  readonly ulvKv: number;
  readonly vectorGroup?: string | null;
  readonly ukPercent?: number | null;
  readonly pkKw?: number | null;
  readonly p0Kw?: number | null;
  /** Pozycja zaczepu z modelu (podzespół `tap_changer`, inaczej `tap_position`). */
  readonly tapPosition?: number | null;
  readonly tapMin?: number | null;
  readonly tapMax?: number | null;
  /** Przełącznik zaczepów z katalogu — `tap_changer.catalog_ref` modelu. */
  readonly tapChangerCatalogRef?: string | null;
  readonly hvNeutralLabelPl?: string | null;
  readonly lvNeutralLabelPl?: string | null;
  readonly statusForSc: 'gotowe' | 'częściowe' | 'brak danych';
  readonly statusForPf: 'gotowe' | 'częściowe' | 'brak danych';
  readonly statusForAsymmetry: 'gotowe' | 'częściowe' | 'brak danych';
}

export interface StationConfigTransformerCardProps {
  readonly transformers: readonly StationConfigTransformerRow[];
  readonly availableLvVoltages: readonly number[];  // Multi-voltage briefa §13
  readonly transformerCatalogOptions?: Readonly<Record<string, readonly StationTransformerCatalogOption[]>>;
  readonly transformerCatalogLoading?: boolean;
  readonly transformerCatalogError?: string | null;
  /** W5-A (F-4): słownik grup połączeń IEC 60076-1 z backendu (`useGrupyPolaczen`); `null` = niedostępny. */
  readonly vectorGroupOptions?: readonly string[] | null;
  /** Katalog przełączników zaczepów z backendu (`fetchTapChangers`). */
  readonly tapChangers: readonly TapChangerCatalogType[];
  readonly onChange?: (transformerId: string, changes: Partial<StationConfigTransformerRow>) => void;
  readonly onAddTransformer?: () => void;
}

const STATUS_CLASS: Record<'gotowe' | 'częściowe' | 'brak danych', string> = {
  gotowe: 'text-status-ok',
  'częściowe': 'text-status-warn',
  'brak danych': 'text-status-error',
};

const STATUS_LABEL: Record<'gotowe' | 'częściowe' | 'brak danych', string> = {
  gotowe: 'gotowe',
  'częściowe': 'do konfiguracji',
  'brak danych': 'do konfiguracji',
};

/**
 * Przełączniki zaczepów oferowane transformatorowi — klasa z napięć pierwotnego/wtórnego
 * wg JEDNEJ reguły z backendem (`klasaTransformatoraPrzelacznika`, karta PROOFPACK-KONTRAKT).
 * Transformator spoza klas nie dostaje oferty (dawniej: domysł „blokowy").
 */
function selectTapChangersForTransformerByVoltage(
  tapChangers: readonly TapChangerCatalogType[],
  hvKv: number,
  lvKv: number,
): readonly TapChangerCatalogType[] {
  const klasa = klasaTransformatoraPrzelacznika(hvKv, lvKv);
  return klasa === null ? [] : selectTapChangersForTransformer(tapChangers, klasa);
}

interface PoleLiczboweProps {
  readonly label: string;
  readonly value: number | null | undefined;
  readonly testId: string;
  readonly readOnly: boolean;
  readonly onCommit: (value: number) => void;
  readonly step?: string;
}

/** Pole liczbowe modelu: wartość z modelu, zapis przy opuszczeniu pola albo Enter. */
function PoleLiczbowe({ label, value, testId, readOnly, onCommit, step }: PoleLiczboweProps): JSX.Element {
  const zModelu = typeof value === 'number' ? String(value) : '';
  const [szkic, setSzkic] = useState(zModelu);
  useEffect(() => setSzkic(zModelu), [zModelu]);
  const zatwierdz = () => {
    if (szkic === zModelu || szkic.trim() === '') return;
    const liczba = Number(szkic.replace(',', '.'));
    if (Number.isFinite(liczba)) onCommit(liczba);
    else setSzkic(zModelu);
  };
  return (
    <label className="flex flex-col">
      <span className="text-scada-muted">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        step={step}
        data-testid={testId}
        value={szkic}
        readOnly={readOnly}
        aria-readonly={readOnly}
        title={readOnly ? 'Wartość z typu katalogowego — zmień typ, aby zmienić dane tabliczkowe.' : undefined}
        onChange={(e) => setSzkic(e.target.value)}
        onBlur={zatwierdz}
        onKeyDown={(e) => {
          if (e.key === 'Enter') zatwierdz();
        }}
        className={`rounded border border-scada-border px-1 py-0.5 ${readOnly ? 'bg-scada-panel-raised text-scada-muted' : 'bg-scada-bg'}`}
      />
    </label>
  );
}

function optionLabel(option: StationTransformerCatalogOption): string {
  const kva = Math.round(option.ratedPowerMva * 1000).toLocaleString('pl-PL');
  return `${option.name} - ${kva} kVA, ${option.voltageHvKv}/${option.voltageLvKv} kV, ${option.vectorGroup}, uk ${option.ukPercent}%`;
}

export function StationConfigTransformerCard(
  props: StationConfigTransformerCardProps,
): JSX.Element {
  const {
    transformers,
    availableLvVoltages,
    transformerCatalogOptions = {},
    transformerCatalogLoading = false,
    transformerCatalogError = null,
    vectorGroupOptions = null,
    tapChangers,
    onChange,
    onAddTransformer,
  } = props;

  return (
    <div data-testid="station-config-transformer" className="flex flex-col gap-3 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Transformatory SN/nN ({transformers.length})
      </div>

      {availableLvVoltages.length > 1 && (
        <div data-testid="multi-voltage-info" className="rounded border border-scada-border bg-scada-panel-raised px-2 py-1">
          <span className="text-status-ok">● Multi-voltage nN aktywny:</span>{' '}
          dostępne poziomy {availableLvVoltages.join(' / ')} kV (briefa §13).
        </div>
      )}

      {transformers.length === 0 ? (
        <div
          data-testid="station-transformer-empty-state"
          className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-amber-100"
        >
          <div className="font-semibold text-amber-50">Brak transformatora SN/nN w modelu stacji.</div>
          <p className="mt-1 leading-5">
            Transformator musi zostać dodany jako element ENM z pozycji katalogowej. Bez tego obliczenia zwarciowe,
            rozpływ mocy, dobór zabezpieczeń i raport pozostają zablokowane dla toru nN.
          </p>
          {onAddTransformer ? (
            <button
              type="button"
              data-testid="station-add-transformer-from-catalog"
              onClick={onAddTransformer}
              className="mt-3 rounded border border-amber-300 bg-amber-300 px-3 py-1.5 font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Dodaj transformator z katalogu
            </button>
          ) : null}
        </div>
      ) : (
        transformers.map((tr) => (
          <div
            key={tr.transformerId}
            data-testid={`transformer-row-${tr.transformerId}`}
            className="rounded border border-scada-border bg-scada-bg p-2"
          >
            <div className="font-medium text-scada-text">{tr.designation}</div>
            {(() => {
              const catalogOptions = transformerCatalogOptions[tr.transformerId] ?? [];
              const selectedCatalog = catalogOptions.find((option) => option.id === tr.catalogRef) ?? null;
              const recommendedCatalog =
                catalogOptions.find((option) => option.recommended) ?? catalogOptions[0] ?? null;
              return (
                <div className="mt-2 rounded border border-scada-border bg-scada-panel-raised p-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
                      Pozycja katalogowa transformatora
                    </span>
                    <select
                      data-testid={`tr-catalog-${tr.transformerId}`}
                      value={tr.catalogRef ?? ''}
                      disabled={transformerCatalogLoading || catalogOptions.length === 0}
                      onChange={(event) => {
                        if (event.target.value) {
                          onChange?.(tr.transformerId, { catalogRef: event.target.value });
                        }
                      }}
                      className="rounded border border-scada-border bg-scada-bg px-1 py-1 text-scada-text"
                    >
                      <option value="">
                        {transformerCatalogLoading
                          ? 'ładowanie katalogu...'
                          : 'wybierz transformator z katalogu'}
                      </option>
                      {catalogOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.recommended ? 'Rekomendowany: ' : ''}
                          {optionLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                    {tr.catalogRef ? (
                      <span className="rounded border border-status-ok/40 bg-emerald-950/30 px-2 py-1 text-status-ok">
                        katalog: {selectedCatalog?.name ?? tr.catalogRef}
                      </span>
                    ) : recommendedCatalog ? (
                      <button
                        type="button"
                        data-testid={`tr-catalog-apply-${tr.transformerId}`}
                        onClick={() => onChange?.(tr.transformerId, { catalogRef: recommendedCatalog.id })}
                        className="rounded border border-sygnal-ok px-2 py-1 font-semibold text-sygnal-ok-tusz transition hover:bg-sygnal-ok-tlo"
                      >
                        Zastosuj rekomendację: {recommendedCatalog.name}
                      </button>
                    ) : null}
                    {selectedCatalog && !selectedCatalog.adequatePower && (
                      <span className="rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo px-2 py-1 text-sygnal-uwaga-tusz">
                        moc poniżej aktualnego zapotrzebowania
                      </span>
                    )}
                    {transformerCatalogError && (
                      <span className="rounded border border-sygnal-blokada bg-sygnal-blokada-tlo px-2 py-1 text-sygnal-blokada-tusz">
                        {transformerCatalogError}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              <PoleLiczbowe
                label="Sn [MVA]"
                testId={`tr-sn-${tr.transformerId}`}
                value={tr.snMva}
                readOnly={Boolean(tr.catalogRef)}
                onCommit={(v) => onChange?.(tr.transformerId, { snMva: v })}
              />
              <div>
                <span className="text-scada-muted">U_HV / U_LV: </span>
                <span className="font-mono">{tr.uhvKv} / {tr.ulvKv} kV</span>
              </div>
              <label className="flex flex-col">
                <span className="text-scada-muted">U_LV (multi-voltage)</span>
                <select
                  data-testid={`tr-ulv-${tr.transformerId}`}
                  value={tr.ulvKv}
                  disabled={Boolean(tr.catalogRef)}
                  title={tr.catalogRef ? 'Wartość z typu katalogowego.' : undefined}
                  onChange={(e) => onChange?.(tr.transformerId, { ulvKv: Number(e.target.value) })}
                  className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
                >
                  {!availableLvVoltages.includes(tr.ulvKv) && <option value={tr.ulvKv}>{tr.ulvKv} kV</option>}
                  {availableLvVoltages.map((v) => (
                    <option key={v} value={v}>{v} kV</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col">
                <span className="text-scada-muted">Grupa połączeń (IEC 60076-1)</span>
                <select
                  data-testid={`tr-vector-${tr.transformerId}`}
                  value={tr.vectorGroup ?? ''}
                  onChange={(e) => onChange?.(tr.transformerId, { vectorGroup: e.target.value || null })}
                  className="rounded border border-scada-border bg-scada-bg px-1 py-0.5 font-mono"
                >
                  {!tr.vectorGroup ? <option value="">— brak grupy —</option> : null}
                  {tr.vectorGroup && !(vectorGroupOptions ?? []).includes(tr.vectorGroup) ? (
                    <option value={tr.vectorGroup}>{tr.vectorGroup}</option>
                  ) : null}
                  {(vectorGroupOptions ?? []).map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
              <PoleLiczbowe
                label="u_k [%]"
                testId={`tr-uk-${tr.transformerId}`}
                value={tr.ukPercent}
                readOnly={Boolean(tr.catalogRef)}
                onCommit={(v) => onChange?.(tr.transformerId, { ukPercent: v })}
              />
              <PoleLiczbowe
                label="P_k [kW]"
                testId={`tr-pk-${tr.transformerId}`}
                value={tr.pkKw}
                readOnly={Boolean(tr.catalogRef)}
                onCommit={(v) => onChange?.(tr.transformerId, { pkKw: v })}
              />
              <PoleLiczbowe
                label="P_0 [kW]"
                testId={`tr-p0-${tr.transformerId}`}
                value={tr.p0Kw}
                readOnly={Boolean(tr.catalogRef)}
                onCommit={(v) => onChange?.(tr.transformerId, { p0Kw: v })}
              />
              <PoleLiczbowe
                label={
                  typeof tr.tapMin === 'number' && typeof tr.tapMax === 'number'
                    ? `Pozycja zaczepu (${tr.tapMin}…${tr.tapMax})`
                    : 'Pozycja zaczepu'
                }
                testId={`tr-tap-${tr.transformerId}`}
                value={tr.tapPosition}
                readOnly={false}
                onCommit={(v) => onChange?.(tr.transformerId, { tapPosition: v })}
              />
              <label className="col-span-2 flex flex-col">
                <span className="text-scada-muted">Przełącznik zaczepów (z katalogu)</span>
                <select
                  data-testid={`tr-tap-changer-${tr.transformerId}`}
                  value={tr.tapChangerCatalogRef ?? ''}
                  onChange={(e) =>
                    onChange?.(tr.transformerId, { tapChangerCatalogRef: e.target.value || null })
                  }
                  className="rounded border border-scada-border bg-scada-bg px-1 py-0.5"
                >
                  <option value="">{tr.tapChangerCatalogRef ? 'bez przełącznika zaczepów' : '— wybierz z katalogu —'}</option>
                  {selectTapChangersForTransformerByVoltage(tapChangers, tr.uhvKv, tr.ulvKv).map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.label_pl}
                    </option>
                  ))}
                </select>
                {tr.tapChangerCatalogRef && (() => {
                  const tc = getTapChanger(tapChangers, tr.tapChangerCatalogRef);
                  if (!tc) return null;
                  return (
                    <div className="mt-1 rounded bg-scada-panel-raised px-2 py-1 text-[10px]">
                      {tc.tap_count} zaczepów · krok {tc.step_percent.toFixed(2)}% · zakres ±
                      {tc.range_percent.toFixed(1)}%{' '}
                      {tc.supports_avr && <span className="text-status-ok">· AVR</span>}{' '}
                      {tc.type === 'oltc' ? '· OLTC (pod obciążeniem)' : '· DETC (off-load)'}
                    </div>
                  );
                })()}
              </label>
              <div className="col-span-2 mt-1 grid grid-cols-3 gap-1 text-[10px]">
                <div>
                  <span className="text-scada-muted">Zwarcia: </span>
                  <span className={STATUS_CLASS[tr.statusForSc]}>{STATUS_LABEL[tr.statusForSc]}</span>
                </div>
                <div>
                  <span className="text-scada-muted">Rozpływ: </span>
                  <span className={STATUS_CLASS[tr.statusForPf]}>{STATUS_LABEL[tr.statusForPf]}</span>
                </div>
                <div>
                  <span className="text-scada-muted">Asymetria: </span>
                  <span className={STATUS_CLASS[tr.statusForAsymmetry]}>
                    {STATUS_LABEL[tr.statusForAsymmetry]}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
