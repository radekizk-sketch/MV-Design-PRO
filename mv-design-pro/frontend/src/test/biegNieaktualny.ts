/**
 * Pomocnik testów (karta K8 KONTEKST-WYNIKU): stan „model zmieniony po biegu" ustawiony
 * tak, jak ustawia go produkcja — rejestr biegów przypadku zna bieg z rewizją modelu
 * z chwili liczenia (`ExecutionRun.model_revision`), a bieżąca rewizja modelu
 * (`useSnapshotStore.rewizjaBiezacegoModelu`, jedyny dostawca: odpowiedź backendu)
 * jest już NOWSZA. Jeden predykat świeżości (`swiezoscBiegu`) uznaje wtedy bieg za
 * nieaktualny — dawny skrót testów (`activeCaseResultStatus: 'OUTDATED'`) nie jest
 * już źródłem świeżości schematu, panelu ani ekranów.
 */
import { useExecutionRunsStore } from '../ui/study-cases/runStore';
import type { ExecutionAnalysisType, ExecutionRun } from '../ui/study-cases/types';
import { useSnapshotStore } from '../ui/topology/snapshotStore';

/** Rewizja modelu, na której „policzono" biegi pomocnika. */
export const REWIZJA_BIEGU = 1;

/** Zakończony bieg rejestru (minimalny rekord `GET …/runs`). */
export function biegRejestru(
  id: string,
  analysisType: ExecutionAnalysisType,
  modelRevision: number | null = REWIZJA_BIEGU,
): ExecutionRun {
  return {
    id,
    study_case_id: 'case-test',
    analysis_type: analysisType,
    solver_input_hash: `hash-${id}`,
    status: 'DONE',
    started_at: '2026-10-21T10:00:00Z',
    finished_at: '2026-10-21T10:00:05Z',
    error_message: null,
    model_revision: modelRevision,
  };
}

/** Biegi w rejestrze policzone na `REWIZJA_BIEGU`; model na rewizji `REWIZJA_BIEGU + 1`. */
export function zasiejBiegiNieaktualne(
  biegi: ReadonlyArray<{ readonly id: string; readonly analysisType: ExecutionAnalysisType }>,
): void {
  const istniejace = useExecutionRunsStore.getState().runs.filter((r) => !biegi.some((b) => b.id === r.id));
  useExecutionRunsStore.setState({
    runs: [...istniejace, ...biegi.map((b) => biegRejestru(b.id, b.analysisType))],
  });
  useSnapshotStore.setState({ rewizjaBiezacegoModelu: REWIZJA_BIEGU + 1 });
}

/** Czysty rejestr biegów (izolacja testów korzystających z `zasiejBiegiNieaktualne`). */
export function wyczyscRejestrBiegow(): void {
  useExecutionRunsStore.getState().reset();
}
