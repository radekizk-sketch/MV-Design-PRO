/**
 * Kontener zakładki „Dowód obliczeń" (scalenie U3 #3, zarządca) — spina okno
 * E9.1 (`PrzegladDowodu`, sterowane propsami) ze źródłem śladu WHITE BOX:
 * `useResultsInspectorStore` (`extendedTrace.white_box_trace`, `input_hash`,
 * akcje `selectRun`/`loadExtendedTrace` — `ui/results-inspector/store.ts:191,340`).
 * Ładowanie LENIWE: dopiero przy otwarciu zakładki; działa dla każdego rodzaju
 * przebiegu (ślad rozszerzony jest per analysis-run). Zero fizyki, read-only.
 *
 * R3-C: opcjonalny `wskazanyRunId` wybiera KONKRETNY przebieg (deep-link
 * z kontekstem `setWynikiTab('dowod', runId)` — np. kolumna A/B porównania);
 * brak wskazania = aktywny przebieg (zachowanie 1:1). Ślad wskazanego przebiegu
 * jest realnie pobieralny po run_id (`GET /analysis-runs/{id}/results/trace`,
 * `ui/results-inspector/api.ts:115`). Przebieg spoza rejestru aktywnego
 * przypadku dostaje uczciwą etykietę ogólną (zero zgadywania nazwy analizy).
 *
 * KD-4 (ZAMKNIĘCIE luki L-11): fokus wywodu na WSKAZANYM elemencie. Wskazanie
 * przychodzi z realnej ścieżki użytkownika — 2× klik na wartości z dowodem
 * (`onOtworzDowod(ref)` warsztatu) albo, gdy wskazania nie było, z bieżącej
 * selekcji na schemacie. Kroki elementu WYBIERA `resolveTraceStepsForElement`
 * (`selection_index` + referencje kroku) — ten sam dostawca, którego używał
 * panel dowodu elementu w moście; zero własnej heurystyki dopasowania.
 */
import { useEffect, useMemo } from 'react';

import type { AdvancementMode } from '../../shell/modeModel';
import { PakietDowodowy, PrzegladDowodu, ZrodloLatex } from '../../wyniki/dowod';
import { useAkcjaUruchomObliczenie } from '../../wyniki/wzorzec';
import { useAppStateStore } from '../../../ui/app-state';
import { resolveTraceStepsForElement } from '../../../ui/proof/ElementCalculationProofPanel';
import { useResultsInspectorStore } from '../../../ui/results-inspector/store';
import { useSelectionStore } from '../../../ui/selection';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { ANALYSIS_TYPE_LABELS } from '../../../ui/study-cases/types';
import { WYNIKI_WARSZTAT_STRINGS as T } from './strings';

export interface DowodPrzebieguProps {
  trybZaawansowania: AdvancementMode;
  /**
   * Konkretny przebieg do wywodu (R3-C — dowód kolumny A/B porównania).
   * `null`/pominięty = aktywny przebieg (dotychczasowe zachowanie 1:1).
   */
  wskazanyRunId?: string | null;
  /**
   * Element wskazany przez użytkownika (L-11): ref z 2× klika na wartości
   * z dowodem. `null` = bierzemy bieżącą selekcję (schemat/drzewo), a gdy i jej
   * nie ma — wywód całego przebiegu jak dotąd.
   */
  wskazanyElementRef?: string | null;
}

export function DowodPrzebiegu({
  trybZaawansowania,
  wskazanyRunId = null,
  wskazanyElementRef = null,
}: DowodPrzebieguProps) {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const selectedRunId = useResultsInspectorStore((s) => s.selectedRunId);
  const slad = useResultsInspectorStore((s) => s.extendedTrace);
  const ladowanie = useResultsInspectorStore((s) => s.isLoadingTrace || s.isLoadingIndex);
  const selekcja = useSelectionStore((s) => s.selectedElement);

  // Przebieg wywodu: wskazany (deep-link R3-C) przed aktywnym.
  const runId = wskazanyRunId ?? activeRunId;

  // Leniwe ładowanie śladu przy otwarciu zakładki (idempotentnie).
  useEffect(() => {
    if (!runId) return;
    const store = useResultsInspectorStore.getState();
    void (async () => {
      if (store.selectedRunId !== runId) {
        await store.selectRun(runId);
      }
      const stan = useResultsInspectorStore.getState();
      if (stan.extendedTrace == null && !stan.isLoadingTrace) {
        await stan.loadExtendedTrace();
      }
    })();
  }, [runId]);

  const przebieg = runId ? przebiegi.find((r) => r.id === runId) : undefined;
  const analizaPL = przebieg ? ANALYSIS_TYPE_LABELS[przebieg.analysis_type] : T.dowodBezPrzebiegu;
  const kroki = selectedRunId === runId ? slad?.white_box_trace ?? [] : [];
  // K6 / H-5: bez przebiegu nie ma czego dowodzić — stan zerowy uruchamia bieg
  // rodzaju aktywnego przebiegu (a bez przebiegu: zwarciowy, jak domyślna
  // analiza powłoki), zamiast zostawiać puste okno bez wyjścia.
  const akcjaPusty = useAkcjaUruchomObliczenie(
    przebieg?.analysis_type === 'LOAD_FLOW' ? 'LOAD_FLOW' : 'SC_3F',
  );

  // L-11: wskazanie jawne (2× klik) przed selekcją na schemacie. Nazwa
  // pierwszoplanowa z selekcji, gdy dotyczy tego samego elementu; inaczej sam
  // ref (zero zgadywania nazwy nieznanego elementu).
  const wskazanyElement = useMemo(() => {
    const jawne = wskazanyElementRef !== null;
    const ref = wskazanyElementRef ?? selekcja?.id ?? null;
    if (!ref || selectedRunId !== runId || !slad) return null;
    const nazwa = selekcja?.id === ref ? selekcja.name ?? ref : ref;
    const krokiElementu = resolveTraceStepsForElement(slad, { id: ref, name: nazwa });
    // Selekcja to KONTEKST, nie żądanie: gdy ślad nie wiąże z nią kroków,
    // okno milczy zamiast pokazywać wyłączony przełącznik z ostrzeżeniem przy
    // każdym wejściu. Wskazanie JAWNE (użytkownik kliknął wartość) zasługuje
    // na odpowiedź także wtedy, gdy jest ona negatywna.
    if (!jawne && krokiElementu.length === 0) return null;
    return { nazwa, kroki: krokiElementu };
  }, [wskazanyElementRef, selekcja, selectedRunId, runId, slad]);

  return (
    <>
      <PrzegladDowodu
        analizaPL={analizaPL}
        kroki={kroki}
        wskazanyElement={wskazanyElement}
        inputHash={selectedRunId === runId ? slad?.input_hash : undefined}
        trybZaawansowania={trybZaawansowania}
        ladowanie={ladowanie}
        akcjaPusty={akcjaPusty}
      />
      {/* L-10: źródło `.tex` wywodu — dostawca ten sam co w moście. Bez kroków
          śladu nie ma czego pobierać (okno pokazuje wtedy stan zerowy wywodu). */}
      {kroki.length > 0 && <ZrodloLatex runId={runId} />}
      {/* PACK-DOWODY: zamknięty pakiet dowodowy przebiegu. Sekcja pyta SERWER,
          czy pakiet się należy (rodzaj wynika z danych biegu) — dlatego stoi tu
          niezależnie od tego, czy ślad ma kroki: bieg bez śladu może mieć pakiet,
          a bieg ze śladem może pakietu nie mieć (wtedy sekcja poda powód). */}
      <PakietDowodowy runId={runId} akcjaBrak={akcjaPusty} />
    </>
  );
}
