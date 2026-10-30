/**
 * Fault Scenarios API Client — PR-24
 * ZERO physics, ZERO local interpretation.
 */

import type {
  FaultScenario,
  FaultScenarioListResponse,
  CreateFaultScenarioRequest,
  UpdateFaultScenarioRequest,
  ScenarioEligibilityResult,
  ScenarioSldOverlay,
} from './types';
import { komunikatBleduApi } from './wspolczynnikC';
import { bladZapytania, komunikatZapytania } from '../../ui2/shared/bladZapytania';

const BASE_URL = '/api/execution';

export async function fetchScenarios(studyCaseId: string): Promise<FaultScenarioListResponse> {
  const res = await fetch(`${BASE_URL}/study-cases/${studyCaseId}/fault-scenarios`);
  if (!res.ok) throw bladZapytania(res, 'Błąd pobierania scenariuszy');
  return res.json();
}

export async function fetchScenario(scenarioId: string): Promise<FaultScenario> {
  const res = await fetch(`${BASE_URL}/fault-scenarios/${scenarioId}`);
  if (!res.ok) throw bladZapytania(res, 'Scenariusz nie znaleziony');
  return res.json();
}

export async function createScenario(
  studyCaseId: string,
  data: CreateFaultScenarioRequest,
): Promise<FaultScenario> {
  const res = await fetch(`${BASE_URL}/study-cases/${studyCaseId}/fault-scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(komunikatBleduApi(err, komunikatZapytania(res, 'Błąd tworzenia scenariusza')));
  }
  return res.json();
}

export async function updateScenario(
  scenarioId: string,
  data: UpdateFaultScenarioRequest,
): Promise<FaultScenario> {
  const res = await fetch(`${BASE_URL}/fault-scenarios/${scenarioId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(komunikatBleduApi(err, komunikatZapytania(res, 'Błąd aktualizacji scenariusza')));
  }
  return res.json();
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/fault-scenarios/${scenarioId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(komunikatBleduApi(err, komunikatZapytania(res, 'Błąd usuwania scenariusza')));
  }
}

export async function fetchScenarioEligibility(
  scenarioId: string,
): Promise<ScenarioEligibilityResult> {
  const res = await fetch(`${BASE_URL}/fault-scenarios/${scenarioId}/eligibility`);
  if (!res.ok) throw bladZapytania(res, 'Błąd sprawdzania uprawnień');
  return res.json();
}

export async function fetchScenarioSldOverlay(
  scenarioId: string,
): Promise<ScenarioSldOverlay> {
  const res = await fetch(`${BASE_URL}/fault-scenarios/${scenarioId}/sld-overlay`);
  if (!res.ok) throw bladZapytania(res, 'Błąd pobierania overlay');
  return res.json();
}

export async function createRunFromScenario(
  scenarioId: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/fault-scenarios/${scenarioId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(komunikatBleduApi(err, komunikatZapytania(res, 'Błąd tworzenia przebiegu')));
  }
  return res.json();
}
