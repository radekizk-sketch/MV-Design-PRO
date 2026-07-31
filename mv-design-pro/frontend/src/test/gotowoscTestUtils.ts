/*
 * Pomocnik testowy: zasilenie JEDYNEJ prawdy gotowości (KD-1 / dług V12K-286).
 *
 * Po usunięciu `readinessLiveStore` każdy czytelnik gotowości (paski budowy
 * sieci, inspektor, przegląd blokad, pasek operacyjny, panel braków danych,
 * drzewo topologii, chrom powłoki) czyta `useSnapshotStore.readiness` +
 * `fixActions` przez `gotowoscAdapter`. Testy muszą więc zasilać TO samo
 * źródło, którym żyje produkcja — inaczej znów mierzyłyby atrapę.
 *
 * Uwaga na wagi: odpowiedź domenowa niesie wyłącznie `blockers` (→ `BLOCKER`)
 * i `warnings` (→ `IMPORTANT`). Wagi `INFO` backend nie zwraca — testy, które
 * kiedyś ją podstawiały do atrapy store'u, opisują „problem niebędący blokadą",
 * czyli ostrzeżenie.
 */

import type { FixAction, ReadinessInfo } from '../types/enm';
import { useSnapshotStore } from '../ui/topology/snapshotStore';

export interface WpisGotowosciTestowy {
  code: string;
  message_pl: string;
  element_ref?: string | null;
}

export interface GotowoscTestowa {
  ready?: boolean;
  blockers?: WpisGotowosciTestowy[];
  warnings?: WpisGotowosciTestowy[];
  fixActions?: FixAction[];
}

function wpis(w: WpisGotowosciTestowy, severity: 'BLOCKER' | 'IMPORTANT') {
  return {
    code: w.code,
    message_pl: w.message_pl,
    element_ref: w.element_ref ?? null,
    severity,
  };
}

/** Buduje `ReadinessInfo` w kształcie odpowiedzi domenowej (bez zgadywania pól). */
export function readinessInfoTestowe(gotowosc: GotowoscTestowa): ReadinessInfo {
  const blockers = (gotowosc.blockers ?? []).map((w) => wpis(w, 'BLOCKER'));
  const warnings = (gotowosc.warnings ?? []).map((w) => wpis(w, 'IMPORTANT'));
  return {
    ready: gotowosc.ready ?? blockers.length === 0,
    blockers,
    warnings,
  };
}

/**
 * Ustawia gotowość w migawce — jedynym źródle prawdy czytanym przez UI.
 * `fixActions` nadpisywane WYŁĄCZNIE, gdy podane (część scen zasila je osobno
 * przez `useSnapshotStore.setState`, razem z całą migawką).
 */
export function ustawGotowoscMigawki(gotowosc: GotowoscTestowa): void {
  useSnapshotStore.setState(
    gotowosc.fixActions === undefined
      ? { readiness: readinessInfoTestowe(gotowosc) }
      : { readiness: readinessInfoTestowe(gotowosc), fixActions: gotowosc.fixActions },
  );
}

/** Czyści gotowość migawki (odpowiednik dawnego `readinessLiveStore.clear()`). */
export function wyczyscGotowoscMigawki(): void {
  useSnapshotStore.setState({ readiness: null, fixActions: [] });
}

/**
 * Wersja dla scen, które zaślepiają CAŁY `snapshotStore` fabryką `vi.mock`:
 * płaska lista problemów (jak w dawnej atrapie `readinessLiveStore.issues`)
 * przełożona na `ReadinessInfo`. Waga inna niż `BLOCKER` ląduje w `warnings`.
 */
export function readinessZListy(
  wpisy: Array<{
    code?: string;
    severity: string;
    message_pl: string;
    element_ref: string | null;
  }>,
): ReadinessInfo {
  return readinessInfoTestowe({
    blockers: wpisy
      .filter((w) => w.severity === 'BLOCKER')
      .map((w) => ({ code: w.code ?? '', message_pl: w.message_pl, element_ref: w.element_ref })),
    warnings: wpisy
      .filter((w) => w.severity !== 'BLOCKER')
      .map((w) => ({ code: w.code ?? '', message_pl: w.message_pl, element_ref: w.element_ref })),
  });
}
