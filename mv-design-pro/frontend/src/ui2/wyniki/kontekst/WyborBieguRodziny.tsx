/*
 * Wybór aktywnego biegu RODZINY analizy (karta K8) — jedna kontrolka dla paska stanu
 * i nagłówka ekranu pełnego wyników. Czyta i zapisuje WYŁĄCZNIE magazyn kontekstu
 * wyniku: wybór tutaj zmienia bieg na schemacie, w panelu dolnym, w inspektorze,
 * w „Dowodach" i na pasku stanu jednocześnie.
 *
 * Atrybuty DOM (`data-run-id`, `data-rodzina`, `data-swiezosc`, `data-ogladana`) są
 * kontraktem testów odbiorczych: każda powierzchnia wystawia identyfikator biegu,
 * który pokazuje, i jego świeżość — porównanie odbywa się na tych samych danych.
 */
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import {
  ETYKIETA_RODZINY,
  ETYKIETA_SWIEZOSCI,
  aktywnyBiegRodziny,
  biegiRodziny,
  rodzinaOgladana,
  swiezoscBiegu,
  useKontekstWynikuStore,
  zdanieSwiezosci,
  type RodzinaAnalizy,
  type ZrodloWyboru,
} from './kontekstWyniku';
import './kontekst.css';

const SKROT_RODZAJU: Readonly<Record<string, string>> = {
  SC_3F: '3F',
  SC_1F: '1F',
  SC_2F: '2F',
  SC_2F_G: '2F+Z',
  PHASE_STATE_SN: 'stan fazowy SN',
  PF_UNBALANCED: 'niesymetryczny',
};

/** Etykieta biegu w polu wyboru: „[3F · ]2026-10-21 14:02 · rew. 12". */
export function etykietaOpcjiBiegu(run: ExecutionRun): string {
  const iso = run.finished_at ?? run.started_at;
  const dopasowanie = iso ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso) : null;
  const czas = dopasowanie ? `${dopasowanie[1]} ${dopasowanie[2]}` : (iso ?? '—');
  const skrot = SKROT_RODZAJU[run.analysis_type];
  const rewizja = typeof run.model_revision === 'number' ? ` · rew. ${run.model_revision}` : '';
  return `${skrot ? `${skrot} · ` : ''}${czas}${rewizja}`;
}

export interface WyborBieguRodzinyProps {
  rodzina: RodzinaAnalizy;
  /** Skąd przychodzi wybór (pasek stanu albo ekran pełny). */
  zrodlo: Extract<ZrodloWyboru, 'pasek' | 'ekran'>;
  testid: string;
}

export function WyborBieguRodziny({ rodzina, zrodlo, testid }: WyborBieguRodzinyProps) {
  const runs = useExecutionRunsStore((s) => s.runs);
  const wybrane = useKontekstWynikuStore((s) => s.wybrane);
  const zrodla = useKontekstWynikuStore((s) => s.zrodla);
  const ogladanaJawna = useKontekstWynikuStore((s) => s.ogladana);
  const oczekujacy = useKontekstWynikuStore((s) => s.oczekujacy);
  const wybierzBieg = useKontekstWynikuStore((s) => s.wybierzBieg);
  const rewizjaModelu = useSnapshotStore((s) => s.rewizjaBiezacegoModelu);
  const przypadek = useStudyCasesStore((s) => s.activeCase);

  const stan = { wybrane, zrodla, ogladana: ogladanaJawna, oczekujacy };
  const bieg = aktywnyBiegRodziny(runs, stan, rodzina);
  if (!bieg) return null;
  const biegi = biegiRodziny(runs, rodzina);
  const ogladana = rodzinaOgladana(runs, stan) === rodzina;
  const swiezosc = swiezoscBiegu(bieg, rewizjaModelu, przypadek);
  const etykieta = ETYKIETA_RODZINY[rodzina];
  const opisSwiezosci = zdanieSwiezosci(swiezosc);
  return (
    <span
      className={`mvd-kontekst-rodziny mvd-kontekst-${zrodlo}`}
      data-testid={testid}
      data-rodzina={rodzina}
      data-run-id={bieg.id}
      data-swiezosc={swiezosc.stan}
      data-ogladana={ogladana ? 'true' : 'false'}
    >
      <button
        type="button"
        className={ogladana ? 'mvd-kontekst-rodzina mvd-on' : 'mvd-kontekst-rodzina'}
        aria-pressed={ogladana}
        title={
          ogladana
            ? `${etykieta}: ten bieg jest na schemacie, w panelu dolnym i w „Dowodach".`
            : `Pokaż bieg rodziny „${etykieta}" na schemacie, w panelu dolnym i w „Dowodach".`
        }
        onClick={() => wybierzBieg(bieg.id, zrodlo)}
        data-testid={`${testid}-pokaz`}
      >
        {etykieta}:
      </button>
      <select
        className="mvd-kontekst-bieg"
        aria-label={`Bieg: ${etykieta}`}
        value={bieg.id}
        onChange={(e) => wybierzBieg(e.target.value, zrodlo)}
        data-testid={`${testid}-bieg`}
      >
        {biegi.map((run) => (
          <option key={run.id} value={run.id}>
            {etykietaOpcjiBiegu(run)}
          </option>
        ))}
      </select>
      <span
        className={`mvd-kontekst-swiezosc mvd-kontekst-swiezosc-${swiezosc.stan}`}
        title={opisSwiezosci}
        data-testid={`${testid}-swiezosc`}
      >
        {ETYKIETA_SWIEZOSCI[swiezosc.stan]}
      </span>
    </span>
  );
}
