/**
 * Obwód wtórny przekładnika CT/VT pola SN — model edytora karty pola (ekran E-11).
 *
 * Moduł CZYSTY (zero DOM, zero fizyki). Przekładniki pola to `Measurement` z `bay_ref` pola;
 * obwód wtórny (`Measurement.obwod_wtorny`, kształt `ObwodWtorny` z `enm/models.py`) zapisuje
 * WYŁĄCZNIE operacja `set_measurement_secondary_circuit` — `add_ct`/`add_vt` ustawiają go tylko
 * przy tworzeniu przekładnika, a `update_element_parameters` odrzuca kolekcję `measurements`.
 *
 * Każda kontrolka edytora mapuje na pole operacji (reguła phantom): długość przewodu w jedną
 * stronę, przekrój, lista obciążeń aparatów (nazwa, moc), moc styków i zacisków, a dla VT —
 * uzwojenie, którego obwód dotyczy. Pole puste = brak danej (nie zero): wielkość nie wchodzi do
 * ładunku i kryterium bilansu kończy się kodem gotowości, nie wartością zastępczą.
 */
import type { EnergyNetworkModel, Measurement, ObwodWtorny } from '../../types/enm';

export type UzwojenieVt = 'POMIAROWE' | 'ZABEZPIECZENIOWE';

export interface WierszObciazenia {
  readonly nazwa: string;
  readonly moc_va: number | null;
}

export interface FormularzObwodu {
  readonly dlugosc_m: number | null;
  readonly przekroj_mm2: number | null;
  readonly obciazenia: readonly WierszObciazenia[];
  readonly moc_stykow_va: number | null;
  /** Tylko VT; `null` = projektant nie wskazał (operacja nie dotyka zapisanego uzwojenia). */
  readonly vt_uzwojenie: UzwojenieVt | null;
}

export const UZWOJENIE_VT_PL: Readonly<Record<UzwojenieVt, string>> = {
  POMIAROWE: 'uzwojenie pomiarowe',
  ZABEZPIECZENIOWE: 'uzwojenie zabezpieczeniowe',
};

/** Przekładniki pola (CT i VT z `bay_ref` pola), deterministycznie: CT przed VT, potem ref. */
export function przekladnikiPola(snapshot: EnergyNetworkModel | null, bayRef: string): Measurement[] {
  return (snapshot?.measurements ?? [])
    .filter((m) => m.bay_ref === bayRef)
    .sort((a, b) =>
      a.measurement_type === b.measurement_type
        ? a.ref_id.localeCompare(b.ref_id)
        : a.measurement_type === 'CT'
          ? -1
          : 1,
    );
}

function liczba(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Formularz startowy z ZAPISANEGO obwodu przekładnika (pusty, gdy obwodu nie ma). */
export function formularzZPrzekladnika(m: Measurement): FormularzObwodu {
  const o: ObwodWtorny | null | undefined = m.obwod_wtorny;
  return {
    dlugosc_m: liczba(o?.dlugosc_przewodu_m),
    przekroj_mm2: liczba(o?.przekroj_przewodu_mm2),
    obciazenia: (o?.obciazenia_aparatow ?? []).map((a) => ({ nazwa: a.nazwa, moc_va: liczba(a.moc_va) })),
    moc_stykow_va: liczba(o?.moc_stykow_va),
    vt_uzwojenie: m.measurement_type === 'VT' ? (m.vt_uzwojenie ?? null) : null,
  };
}

export interface BladObwodu {
  readonly pole: string;
  readonly komunikat: string;
}

/**
 * Błędy formularza — te same granice co model (`ObwodWtorny`: długość i przekrój > 0,
 * moc aparatu i styków ≥ 0, aparat nazwany). Pole puste NIE jest błędem (brak danej).
 */
export function walidujObwod(f: FormularzObwodu): BladObwodu[] {
  const bledy: BladObwodu[] = [];
  if (f.dlugosc_m !== null && !(f.dlugosc_m > 0)) {
    bledy.push({ pole: 'dlugosc_m', komunikat: 'Długość przewodu musi być dodatnia.' });
  }
  if (f.przekroj_mm2 !== null && !(f.przekroj_mm2 > 0)) {
    bledy.push({ pole: 'przekroj_mm2', komunikat: 'Przekrój przewodu musi być dodatni.' });
  }
  if (f.moc_stykow_va !== null && !(f.moc_stykow_va >= 0)) {
    bledy.push({ pole: 'moc_stykow_va', komunikat: 'Moc styków i zacisków nie może być ujemna.' });
  }
  f.obciazenia.forEach((w, i) => {
    if (!w.nazwa.trim()) {
      bledy.push({ pole: `obciazenie-${i}`, komunikat: `Aparat ${i + 1}: podaj nazwę aparatu.` });
    }
    if (w.moc_va === null || !(w.moc_va >= 0)) {
      bledy.push({ pole: `obciazenie-${i}`, komunikat: `Aparat ${i + 1}: podaj nieujemną moc pobieraną [VA].` });
    }
  });
  return bledy;
}

/** Ładunek `set_measurement_secondary_circuit` — wyłącznie pola, które operacja czyta. */
export function zbudujPayloadObwodu(m: Measurement, f: FormularzObwodu): Record<string, unknown> {
  const obwod: Record<string, unknown> = {
    obciazenia_aparatow: f.obciazenia.map((w) => ({ nazwa: w.nazwa.trim(), moc_va: w.moc_va })),
  };
  if (f.dlugosc_m !== null) obwod.dlugosc_przewodu_m = f.dlugosc_m;
  if (f.przekroj_mm2 !== null) obwod.przekroj_przewodu_mm2 = f.przekroj_mm2;
  if (f.moc_stykow_va !== null) obwod.moc_stykow_va = f.moc_stykow_va;
  const payload: Record<string, unknown> = { measurement_ref: m.ref_id, obwod_wtorny: obwod };
  if (m.measurement_type === 'VT' && f.vt_uzwojenie !== null) payload.vt_uzwojenie = f.vt_uzwojenie;
  return payload;
}

/** Ładunek usunięcia obwodu — jawne `null` czyści `Measurement.obwod_wtorny`. */
export function zbudujPayloadUsunieciaObwodu(m: Measurement): Record<string, unknown> {
  return { measurement_ref: m.ref_id, obwod_wtorny: null };
}

/** Opis zapisanego obwodu jednym zdaniem (jednostki SI, bez obliczeń). */
export function opisObwodu(m: Measurement): string {
  const o = m.obwod_wtorny;
  if (!o) return 'Obwód wtórny niezapisany — bilans obciążenia przekładnika nie ma danych.';
  const czesci: string[] = [];
  czesci.push(o.dlugosc_przewodu_m != null ? `przewód ${o.dlugosc_przewodu_m} m` : 'długość przewodu nie podana');
  czesci.push(o.przekroj_przewodu_mm2 != null ? `${o.przekroj_przewodu_mm2} mm²` : 'przekrój nie podany');
  czesci.push(`aparaty: ${o.obciazenia_aparatow.length}`);
  if (o.moc_stykow_va != null) czesci.push(`styki ${o.moc_stykow_va} VA`);
  if (m.measurement_type === 'VT' && m.vt_uzwojenie) czesci.push(UZWOJENIE_VT_PL[m.vt_uzwojenie]);
  return czesci.join(' · ');
}
