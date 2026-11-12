/**
 * Sekcja zwarciowa inspektora (karta INSPEKTOR-I-NAWIGACJA, pkt I „sekcja zwarć”): rodzaj zwarcia,
 * Ik″ / ip / Ith / Sk″ w scenariuszu MAKSYMALNYM i MINIMALNYM osobno, warunki (współczynnik
 * napięciowy c z podstawą, czas trwania zwarcia), konfiguracja sieci biegu i rewizja modelu.
 *
 * Dostawca danych: ta sama końcówka co sekcja „Pasmo MIN/MAX” ekranu zwarć
 * (`GET …/results/short-circuit/pasmo`, `fetchPasmoZwarcia`) — dwa biegi kanoniczne jednego
 * przypadku z backendu. Zero fizyki: wartości z wierszy wyniku, zestawione obok siebie; podpisy,
 * kolejność i format wielkości z JEDNEGO rejestru wspólnego z etykietami kanwy
 * (`RESULT_LABEL_TEMPLATES.short_circuit.bus`). Odpowiedź buforowana na poziomie modułu kluczem
 * `run_id` (bieg deterministyczny → odpowiedź deterministyczna); błąd pobrania nie trafia do
 * bufora — sekcja mówi o nim wprost, następne zamontowanie ponawia.
 */
import { useEffect, useState } from 'react';

import type { ExecutionRun } from '../../study-cases/types';
import type { ShortCircuitRow } from '../../results-inspector/types';
import type { RawMetricValue } from '../../sld-overlay/rawResultOverlayStore';
import { RESULT_LABEL_TEMPLATES, type ResultLabelAnalysis } from '../../sld/shared/resultLabelTemplates';
import { fetchPasmoZwarcia, type PasmoZwarciaOdpowiedz, type StronaPasmaOdpowiedz } from '../../../ui2/wyniki/zwarcia/api';
import { fmtCzas, fmtOhm, fmtWspolczynnik, rodzajZwarciaPL } from '../../../ui2/wyniki/zwarcia/strings';

/** Wiersz zestawienia: jedna wielkość albo jeden warunek, wartość MAKS. i MIN. osobno. */
export interface WierszZwarciaElementu {
  readonly kod: string;
  readonly etykieta: string;
  /** Symbol LaTeX (`$I_{k}''$`) — `null` dla warunku bez symbolu. */
  readonly symbol: string | null;
  readonly maks: string | null;
  readonly min: string | null;
}

export interface ZestawienieZwarciaElementu {
  readonly rodzajPl: string;
  readonly wielkosci: readonly WierszZwarciaElementu[];
  readonly warunki: readonly WierszZwarciaElementu[];
  /** Podstawa współczynnika c z wyniku backendu (tekst backendu, bez tłumaczenia). */
  readonly podstawaCPl: string | null;
  readonly konfiguracjaPl: string;
  readonly rewizjaPl: string;
  /** Brakująca strona pasma z przyczyną backendu (np. bieg MIN jeszcze nie policzony). */
  readonly brakStronyPl: string | null;
}

export type StanZwarciaElementu =
  | { readonly rodzaj: 'nie-dotyczy' }
  | { readonly rodzaj: 'wczytywanie' }
  | { readonly rodzaj: 'blad' }
  | { readonly rodzaj: 'gotowe'; readonly zestawienie: ZestawienieZwarciaElementu }
  /** Pasmo wczytane, ale punkt obiektu nie występuje w żadnej stronie. */
  | { readonly rodzaj: 'brak-punktu' };

/** Pole wiersza wyniku ↔ kod rejestru (ten sam kod, który niesie nakładka kanwy). */
const POLE_WIERSZA: Readonly<Record<string, { readonly pole: keyof ShortCircuitRow; readonly jednostka: string }>> = {
  IK_3F_A: { pole: 'ikss_ka', jednostka: 'kA' },
  IP_A: { pole: 'ip_ka', jednostka: 'kA' },
  ITH_A: { pole: 'ith_ka', jednostka: 'kA' },
  SK_MVA: { pole: 'sk_mva', jednostka: 'MVA' },
};

function wierszPunktu(strona: StronaPasmaOdpowiedz | null, punkt: string): ShortCircuitRow | null {
  if (!strona) return null;
  return strona.wynik.rows.find((wiersz) => wiersz.target_id === punkt || wiersz.element_id === punkt) ?? null;
}

function liczba(wartosc: unknown): number | null {
  return typeof wartosc === 'number' && Number.isFinite(wartosc) ? wartosc : null;
}

function rewizjaStrony(strona: StronaPasmaOdpowiedz | null): number | null {
  return liczba(strona?.analysis_case_context?.rewizja_modelu ?? null);
}

/** Zestawienie zwarciowe punktu `punkt` z odpowiedzi pasma (czysta funkcja — testowana wprost). */
export function zestawienieZwarciaElementu(
  pasmo: PasmoZwarciaOdpowiedz,
  punkt: string,
  bieg: ExecutionRun | null,
): ZestawienieZwarciaElementu | null {
  const maks = wierszPunktu(pasmo.max, punkt);
  const min = wierszPunktu(pasmo.min, punkt);
  if (!maks && !min) return null;
  const wielkosci: WierszZwarciaElementu[] = [];
  for (const spec of RESULT_LABEL_TEMPLATES.short_circuit.bus ?? []) {
    const pole = POLE_WIERSZA[spec.code];
    if (!pole) continue;
    const zapis = (wiersz: ShortCircuitRow | null): string | null => {
      const wartosc = liczba(wiersz?.[pole.pole]);
      if (wartosc === null) return null;
      const metryka: RawMetricValue = { code: spec.code, value: wartosc, unit: pole.jednostka, format_hint: 'fixed2' };
      return spec.format(metryka);
    };
    const wartoscMaks = zapis(maks);
    const wartoscMin = zapis(min);
    if (wartoscMaks === null && wartoscMin === null) continue;
    wielkosci.push({ kod: spec.code, etykieta: spec.nazwaPl, symbol: spec.prefix, maks: wartoscMaks, min: wartoscMin });
  }
  const warunki: WierszZwarciaElementu[] = [];
  const c = (wiersz: ShortCircuitRow | null) => {
    const wartosc = liczba(wiersz?.c_factor);
    return wartosc === null ? null : fmtWspolczynnik(wartosc);
  };
  if (c(maks) !== null || c(min) !== null) {
    warunki.push({ kod: 'c', etykieta: 'Współczynnik napięciowy', symbol: '$c$', maks: c(maks), min: c(min) });
  }
  const tk = (wiersz: ShortCircuitRow | null) => {
    const wartosc = liczba(wiersz?.tk_s);
    return wartosc === null ? null : `${fmtCzas(wartosc)} s`;
  };
  if (tk(maks) !== null || tk(min) !== null) {
    warunki.push({ kod: 'tk', etykieta: 'Czas trwania zwarcia', symbol: '$T_{k}$', maks: tk(maks), min: tk(min) });
  }
  const podstawy = [...new Set([maks?.c_zrodlo, min?.c_zrodlo].filter((t): t is string => typeof t === 'string' && t.length > 0))];

  const konfiguracjaBiegu = (pasmo.max ?? pasmo.min)?.wynik.konfiguracja_biegu;
  const czesciKonfiguracji = [
    bieg?.scenario_ref
      ? `scenariusz roboczy, rewizja ${bieg.scenario_ref.revision}`
      : bieg
        ? 'stan normalny modelu'
        : 'stan sieci biegu nieznany — rejestr nie zna biegu',
  ];
  const zf = konfiguracjaBiegu?.impedancja_przejscia;
  if (zf) {
    czesciKonfiguracji.push(
      `impedancja przejścia ${fmtOhm(zf.r_f_ohm)} + j${fmtOhm(zf.x_f_ohm)} Ω (poza zakresem IEC 60909)`,
    );
  }
  const rewMaks = rewizjaStrony(pasmo.max);
  const rewMin = rewizjaStrony(pasmo.min);
  const rewizja = rewMaks ?? rewMin ?? liczba(bieg?.model_revision ?? null);
  const rewizjaPl =
    rewMaks !== null && rewMin !== null && rewMaks !== rewMin
      ? `maks.: rewizja ${rewMaks}, min.: rewizja ${rewMin} — scenariusze policzone na różnych stanach modelu`
      : rewizja !== null
        ? `rewizja ${rewizja}`
        : 'rewizja modelu biegu nieznana';
  return {
    rodzajPl: rodzajZwarciaPL(maks?.fault_type ?? min?.fault_type ?? pasmo.typ_zwarcia_kotwicy),
    wielkosci,
    warunki,
    podstawaCPl: podstawy.length > 0 ? podstawy.join('; ') : null,
    konfiguracjaPl: czesciKonfiguracji.join('; '),
    rewizjaPl,
    brakStronyPl: pasmo.brakujacy_scenariusz
      ? `Scenariusz ${pasmo.brakujacy_scenariusz === 'MAX' ? 'maksymalny' : 'minimalny'} niedostępny: ${pasmo.powod_niedostepnosci_pl ?? 'serwer nie podał przyczyny'}.`
      : null,
  };
}

const bufor = new Map<string, PasmoZwarciaOdpowiedz>();
const wToku = new Map<string, Promise<void>>();

/** Wyczyszczenie bufora — wyłącznie dla testów. */
export function wyczyscZwarcieElementu(): void {
  bufor.clear();
  wToku.clear();
}

function pobierz(runId: string): Promise<void> {
  const trwa = wToku.get(runId);
  if (trwa) return trwa;
  const obietnica = fetchPasmoZwarcia(runId)
    .then((odpowiedz) => {
      bufor.set(runId, odpowiedz);
    })
    .finally(() => wToku.delete(runId));
  wToku.set(runId, obietnica);
  return obietnica;
}

/** Stan sekcji zwarciowej obiektu: dotyczy wyłącznie biegu zwarciowego i punktu wyniku. */
export function useZwarcieElementu(
  runId: string | null,
  analiza: ResultLabelAnalysis | null,
  punkt: string | null,
  bieg: ExecutionRun | null,
): StanZwarciaElementu {
  const dotyczy = analiza === 'short_circuit' && runId !== null && punkt !== null;
  const [, ustawWersje] = useState(0);
  const [bledy, ustawBledy] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!dotyczy || !runId || bufor.has(runId)) return undefined;
    let aktywny = true;
    pobierz(runId).then(
      () => {
        if (aktywny) ustawWersje((w) => w + 1);
      },
      () => {
        if (aktywny) ustawBledy((b) => new Set([...b, runId]));
      },
    );
    return () => {
      aktywny = false;
    };
  }, [dotyczy, runId]);
  if (!dotyczy || !runId || !punkt) return { rodzaj: 'nie-dotyczy' };
  const odpowiedz = bufor.get(runId);
  if (!odpowiedz) return bledy.has(runId) ? { rodzaj: 'blad' } : { rodzaj: 'wczytywanie' };
  const zestawienie = zestawienieZwarciaElementu(odpowiedz, punkt, bieg);
  return zestawienie ? { rodzaj: 'gotowe', zestawienie } : { rodzaj: 'brak-punktu' };
}
