/**
 * Results Inspector API Client
 *
 * Read-only canonical clients for results, trace and run snapshot audit mode.
 */

import type { EnergyNetworkModel } from '../../types/enm';
import type {
  BranchResults,
  BusResults,
  ExtendedTrace,
  ResultsIndex,
  ShortCircuitResults,
  SldResultOverlay,
} from './types';

const API_BASE = '/api';

export async function fetchResultsIndex(runId: string): Promise<ResultsIndex> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/index`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania indeksu wyników: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchBusResults(runId: string): Promise<BusResults> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/buses`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania wyników węzłowych: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchBranchResults(runId: string): Promise<BranchResults> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/branches`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania wyników gałęziowych: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchShortCircuitResults(runId: string): Promise<ShortCircuitResults> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/short-circuit`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania wyników zwarciowych: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchExtendedTrace(runId: string): Promise<ExtendedTrace> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/results/trace`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania śladu obliczeń: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchRunSnapshot(runId: string): Promise<EnergyNetworkModel> {
  const response = await fetch(`${API_BASE}/analysis-runs/${runId}/snapshot`);
  if (!response.ok) {
    throw new Error(`Błąd pobierania migawki uruchomienia: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchSldOverlay(
  projectId: string,
  diagramId: string,
  runId: string
): Promise<SldResultOverlay> {
  const response = await fetch(
    `${API_BASE}/projects/${projectId}/sld/${diagramId}/overlay?run_id=${runId}`
  );
  if (!response.ok) {
    throw new Error(`Błąd pobierania nakładki SLD: ${response.statusText}`);
  }
  return response.json();
}
