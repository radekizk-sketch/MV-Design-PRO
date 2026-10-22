/*
 * Świeżość wyniku biegu — JEDEN predykat aplikacji (karta K8 §0 pkt 3), wydzielony
 * jako liść bez magazynów: czysty moduł, z którego korzysta magazyn kontekstu wyniku
 * (`kontekstWyniku.ts`) i model inspektora (`ui2/inspector/inspectorModel.ts`, który
 * z założenia nie czyta żadnych magazynów). Brak danej zostaje brakiem (`nieznany`).
 */
import type { ExecutionRun, StudyCase } from '../../../ui/study-cases/types';

export type StanSwiezosciBiegu = 'aktualny' | 'nieaktualny' | 'nieznany';

export interface SwiezoscBiegu {
  readonly stan: StanSwiezosciBiegu;
  /** Rewizja modelu, na której policzono bieg (`null` = bieg sprzed koperty rewizji). */
  readonly rewizjaBiegu: number | null;
  /** Bieżąca rewizja modelu (`null` = nieznana). */
  readonly rewizjaModelu: number | null;
  /** Dlaczego nieaktualny: rewizje się rozjechały albo serwer ocenił ten bieg jako nieaktualny. */
  readonly przyczyna: 'model-zmieniony' | 'werdykt-serwera' | null;
  /** Zdanie przyczyny po polsku z serwera (werdykt przypadku), gdy rozstrzyga serwer. */
  readonly przyczynaPl: string | null;
}

/** Werdykt serwera o przypadku — dana wejściowa predykatu (CV-2-W). */
export type WerdyktPrzypadku = Pick<StudyCase, 'result_status' | 'rewizja_biegu' | 'result_status_reason_pl'>;

/**
 * Świeżość wyniku JEDNEGO biegu — jedyny predykat w aplikacji (pasek stanu, panel
 * dolny, nakładka schematu, inspektor, ekrany pełne, „Dowody").
 *
 * 1. Obie rewizje znane i różne ⇒ nieaktualny (model zmieniony po biegu).
 * 2. Serwer ocenił przypadek jako nieaktualny na rewizji TEGO biegu (np. zmiana
 *    biblioteki typów przy tej samej rewizji modelu albo rewizja bieżąca nieznana
 *    w przeglądarce) ⇒ nieaktualny z przyczyną serwera.
 * 3. Obie rewizje znane i równe ⇒ aktualny.
 * 4. Inaczej ⇒ nieznany (brak danej zostaje brakiem — nie „aktualny").
 */
export function swiezoscBiegu(
  run: Pick<ExecutionRun, 'model_revision'>,
  rewizjaModelu: number | null,
  przypadek: WerdyktPrzypadku | null,
): SwiezoscBiegu {
  const rewizjaBiegu = typeof run.model_revision === 'number' ? run.model_revision : null;
  const rm = typeof rewizjaModelu === 'number' ? rewizjaModelu : null;
  if (rewizjaBiegu !== null && rm !== null && rewizjaBiegu !== rm) {
    return { stan: 'nieaktualny', rewizjaBiegu, rewizjaModelu: rm, przyczyna: 'model-zmieniony', przyczynaPl: null };
  }
  if (
    rewizjaBiegu !== null
    && przypadek?.result_status === 'OUTDATED'
    && przypadek.rewizja_biegu === rewizjaBiegu
  ) {
    return {
      stan: 'nieaktualny',
      rewizjaBiegu,
      rewizjaModelu: rm,
      przyczyna: 'werdykt-serwera',
      przyczynaPl: przypadek.result_status_reason_pl || null,
    };
  }
  if (rewizjaBiegu !== null && rm !== null) {
    return { stan: 'aktualny', rewizjaBiegu, rewizjaModelu: rm, przyczyna: null, przyczynaPl: null };
  }
  return { stan: 'nieznany', rewizjaBiegu, rewizjaModelu: rm, przyczyna: null, przyczynaPl: null };
}

export const ETYKIETA_SWIEZOSCI: Readonly<Record<StanSwiezosciBiegu, string>> = {
  aktualny: 'aktualny',
  nieaktualny: 'nieaktualny',
  nieznany: 'świeżość nieznana',
};

/** Zdanie świeżości po polsku — jedno dla paska stanu, panelu dolnego i ekranów pełnych. */
export function zdanieSwiezosci(swiezosc: SwiezoscBiegu): string {
  if (swiezosc.stan === 'nieaktualny') {
    return (
      swiezosc.przyczynaPl
      ?? `Policzony na rewizji modelu ${swiezosc.rewizjaBiegu ?? '—'}, model jest na rewizji ${swiezosc.rewizjaModelu ?? '—'}.`
    );
  }
  if (swiezosc.stan === 'aktualny') {
    return `Policzony na bieżącej rewizji modelu (${swiezosc.rewizjaModelu}).`;
  }
  return 'Świeżości nie da się ocenić — przebieg nie niesie rewizji modelu albo bieżąca rewizja nie jest znana.';
}
