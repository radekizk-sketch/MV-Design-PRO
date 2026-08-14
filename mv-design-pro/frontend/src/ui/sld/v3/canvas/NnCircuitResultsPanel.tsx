/**
 * T2-WYNIKI (PLAN_SLD_NN_TOPOLOGIA_2026-08 §T2, §0 pkt 1 „panel wyników
 * odpływu nN") — prezentacja CZYSTA (`NnCircuitResultsSpec`, ZERO fizyki):
 * 8 sekcji Ib/In/Iz′/ΔU/Ik″max/Ik1_min/SWZ/I²t + dobór-selektywność, każda w
 * jednym z trzech stanów (wartość / brak wyników z akcją / nie dotyczy),
 * SWZ dodatkowo niesie WŁASNY trzeci stan werdyktu (nierozstrzygalne).
 *
 * Wpięcie: renderowany przez `SldDetailDrawer.tsx` w zakładce „Wyniki
 * odpływu nN" aparatu `apparatus` (widoczna WYŁĄCZNIE, gdy
 * `SldDetailDrawerData.nnCircuitResultsSpec` jest ustawiony —
 * `SldCanvasV3Workspace.tsx` ustawia je TYLKO dla aparatów rozwiązanych jako
 * obwód nN, `nnCircuitResults.ts::resolveNnCircuitRef`). Zero nowego kanału
 * selekcji — ISTNIEJĄCY mechanizm klik→drawer.
 */
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

import { navigateToResults } from '../../../navigation';
import { pobierzWierszProfiluNapiec } from './nnSwzApi';
import {
  buildDeltaUSection,
  type NnCircuitResultsSpec,
  type NnPercentValue,
  type NnSection,
} from './nnCircuitResults';
import { swzPresentationTone } from './overlay';

function formatNumberPl(value: number, digits: number): string {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

const ROW_STYLE = { padding: '6px 0', borderBottom: '1px solid rgb(var(--scada-panel-raised))' } as const;
const LABEL_STYLE = { fontSize: 10, color: 'rgb(var(--scada-muted))', fontWeight: 700, marginBottom: 2 } as const;
const VALUE_STYLE = { fontSize: 12, color: 'rgb(var(--scada-text))', fontFamily: 'monospace', fontWeight: 700 } as const;
const SOURCE_STYLE = { fontSize: 9, color: 'rgb(var(--scada-muted))', fontStyle: 'italic', marginTop: 2 } as const;
const REASON_STYLE = { fontSize: 10, color: 'rgb(var(--scada-status-warn-ink))' } as const;
const NIE_DOTYCZY_STYLE = { fontSize: 10, color: 'rgb(var(--scada-muted))', fontStyle: 'italic' } as const;

function AkcjaPrzejdzDoWynikow(props: { readonly testId: string }): JSX.Element {
  return (
    <button
      type="button"
      data-testid={props.testId}
      onClick={() => navigateToResults()}
      style={{
        marginTop: 4,
        fontSize: 9,
        fontWeight: 700,
        color: 'rgb(var(--scada-status-info))',
        background: 'transparent',
        border: '1px solid rgb(var(--scada-status-info))',
        borderRadius: 3,
        padding: '2px 8px',
        cursor: 'pointer',
      }}
    >
      Przejdź do wyników →
    </button>
  );
}

/**
 * Wiersz sekcji generyczny — dyspozytor stanu czterowartościowego. `render`
 * formatuje WYŁĄCZNIE stan `wartosc` (per-sekcja, bo jednostki i pola różnią
 * się); stany zerowe (`brak_wynikow`/`nie_dotyczy`) mają WSPÓLNĄ prezentację
 * tu, zero powielania per sekcja.
 */
function SectionRow<T>(props: {
  readonly testId: string;
  readonly labelPl: string;
  readonly section: NnSection<T>;
  readonly render: (wartosc: T) => JSX.Element;
}): JSX.Element {
  const { testId, labelPl, section, render } = props;
  return (
    <div style={ROW_STYLE} data-testid={testId} data-stan={section.stan}>
      <div style={LABEL_STYLE}>{labelPl}</div>
      {section.stan === 'wartosc' && (
        <>
          {render(section.wartosc)}
          <div style={SOURCE_STYLE} data-testid={`${testId}-zrodlo`}>źródło: {section.zrodloPl}</div>
        </>
      )}
      {section.stan === 'brak_wynikow' && (
        <div data-testid={`${testId}-brak`}>
          <div style={REASON_STYLE}>{section.powodPl}</div>
          {section.akcja === 'przejdz-do-wynikow' && <AkcjaPrzejdzDoWynikow testId={`${testId}-akcja`} />}
        </div>
      )}
      {section.stan === 'nie_dotyczy' && (
        <div style={NIE_DOTYCZY_STYLE} data-testid={`${testId}-nie-dotyczy`}>nie dotyczy — {section.powodPl}</div>
      )}
    </div>
  );
}

const SWZ_TONE_COLOR: Readonly<Record<'ok' | 'fail' | 'unknown', string>> = {
  ok: 'rgb(var(--scada-status-ok-ink))',
  fail: 'rgb(var(--scada-status-err-ink))',
  unknown: 'rgb(var(--scada-status-warn-ink))',
};

export interface NnCircuitResultsPanelProps {
  readonly spec: NnCircuitResultsSpec;
  /** Id przebiegu rozpływu mocy AKTUALNIE załadowanego w overlay (`null` gdy
   *  załadowany przebieg nie jest rozpływem mocy / brak przebiegu) — panel
   *  pobiera ΔU NA ŻĄDANIE po otwarciu (jedyna sekcja, której backend nie
   *  daje z JUŻ posiadanego payloadu, patrz nagłówek `nnCircuitResults.ts`),
   *  zamiast blokować otwarcie drawera na fetch przy KAŻDYM kliku aparatu. */
  readonly loadFlowRunId: string | null;
}

/**
 * Panel wyników odpływu nN — komplet 8 sekcji werdyktu §0 pkt 1. Prezentacja
 * WIĘKSZOŚCIOWO CZYSTA (żadna wartość nie jest przeliczana, WYŁĄCZNIE
 * formatowanie gotowych liczb) — WYJĄTEK: sekcja ΔU pobierana lokalnie na
 * żądanie (`useEffect` niżej), bo backend nie ma jej w JUŻ posiadanym
 * payloadzie overlay (inny endpoint, `voltage-profile`, wymaga osobnego
 * zapytania — dokumentacja wyboru w nagłówku `nnCircuitResults.ts`).
 */
export function NnCircuitResultsPanel(props: NnCircuitResultsPanelProps): JSX.Element {
  const { spec, loadFlowRunId } = props;
  const [deltaUOverride, setDeltaUOverride] = useState<NnSection<NnPercentValue> | null>(null);
  const busRef = spec.ref.busRef;

  useEffect(() => {
    setDeltaUOverride(null);
    if (!loadFlowRunId) return;
    let cancelled = false;
    const controller = new AbortController();
    pobierzWierszProfiluNapiec(loadFlowRunId, busRef, controller.signal)
      .then((row) => {
        if (cancelled) return;
        setDeltaUOverride(buildDeltaUSection(row, loadFlowRunId));
      })
      .catch(() => {
        if (cancelled) return;
        setDeltaUOverride({ stan: 'brak_wynikow', powodPl: 'Nie udało się pobrać profilu napięć dla tej szyny.' });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [busRef, loadFlowRunId]);

  const effectiveSpec: NnCircuitResultsSpec = deltaUOverride ? { ...spec, deltaU: deltaUOverride } : spec;

  return (
    <div data-testid="nn-circuit-results-panel">
      {effectiveSpec.resultsStale && (
        <div
          data-testid="nn-circuit-results-stale-banner"
          style={{
            marginBottom: 8,
            padding: '4px 8px',
            fontSize: 10,
            fontWeight: 700,
            color: 'rgb(var(--scada-status-warn-ink))',
            background: 'rgb(var(--scada-bg))',
            border: '1px solid rgb(var(--scada-status-warn))',
            borderRadius: 3,
          }}
        >
          ⚠ wyniki nieaktualne — model zmienił się od ostatniego biegu
        </div>
      )}

      <SectionRow
        testId="nn-circuit-section-ib"
        labelPl="Ib — prąd obliczeniowy obwodu"
        section={effectiveSpec.ib}
        render={(v) => <div style={VALUE_STYLE} data-testid="nn-circuit-value-ib">{formatNumberPl(v.amperow, 1)} A</div>}
      />
      <SectionRow
        testId="nn-circuit-section-in"
        labelPl="In — prąd znamionowy aparatu"
        section={effectiveSpec.inRated}
        render={(v) => <div style={VALUE_STYLE} data-testid="nn-circuit-value-in">{formatNumberPl(v.amperow, 1)} A · {v.typPl}</div>}
      />
      <SectionRow
        testId="nn-circuit-section-iz-prime"
        labelPl="Iz′ — obciążalność kabla po korekcji"
        section={effectiveSpec.izPrime}
        render={(v) => <div style={VALUE_STYLE} data-testid="nn-circuit-value-iz-prime">{formatNumberPl(v.amperow, 1)} A</div>}
      />
      <SectionRow
        testId="nn-circuit-section-delta-u"
        labelPl="ΔU — odchylenie napięcia"
        section={effectiveSpec.deltaU}
        render={(v) => <div style={VALUE_STYLE} data-testid="nn-circuit-value-delta-u">{formatNumberPl(v.procent, 2)} %</div>}
      />
      <SectionRow
        testId="nn-circuit-section-ik-max"
        labelPl="Ik″max — zwarcie 3-fazowe (bieg SC)"
        section={effectiveSpec.ikMax}
        render={(v) => <div style={VALUE_STYLE} data-testid="nn-circuit-value-ik-max">{formatNumberPl(v.kiloamperow, 2)} kA</div>}
      />
      <SectionRow
        testId="nn-circuit-section-ik-min"
        labelPl="Ik1_min — pętla zwarcia (IEC 60364)"
        section={effectiveSpec.ikMin}
        render={(v) => <div style={VALUE_STYLE} data-testid="nn-circuit-value-ik-min">{formatNumberPl(v.kiloamperow, 3)} kA</div>}
      />
      <SectionRow
        testId="nn-circuit-section-swz"
        labelPl="SWZ — samoczynne wyłączenie zasilania"
        section={effectiveSpec.swz}
        render={(v) => {
          const tone = swzPresentationTone(v.werdykt);
          return (
            <div data-testid="nn-circuit-value-swz">
              <div style={{ ...VALUE_STYLE, color: SWZ_TONE_COLOR[tone] }} data-testid="nn-circuit-swz-werdykt" data-tone={tone}>
                {v.werdykt}
              </div>
              <div style={{ fontSize: 10, color: 'rgb(var(--scada-muted))' }}>{v.przyczynaPl}</div>
              {v.marginesProcent != null && (
                <div style={{ fontSize: 10, color: 'rgb(var(--scada-muted))' }} data-testid="nn-circuit-swz-margines">
                  margines: {formatNumberPl(v.marginesProcent, 0)} %
                </div>
              )}
            </div>
          );
        }}
      />
      <SectionRow
        testId="nn-circuit-section-i2t"
        labelPl="I²t — wytrzymałość cieplna przewodu"
        section={effectiveSpec.iSquaredT}
        render={() => <div style={VALUE_STYLE} />}
      />
      <SectionRow
        testId="nn-circuit-section-dobor"
        labelPl="Dobór i selektywność"
        section={effectiveSpec.doborSelektywnosc}
        render={(v) => <div style={VALUE_STYLE} data-testid="nn-circuit-value-dobor">{v.rekomendacjaPl}</div>}
      />
    </div>
  );
}
