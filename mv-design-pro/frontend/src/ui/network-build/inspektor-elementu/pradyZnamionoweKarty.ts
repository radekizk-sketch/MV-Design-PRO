/**
 * Prądy znamionowe transformatorów modelu dla karty technicznej (karta INSPEKTOR-I-NAWIGACJA
 * I.1: „≈24,2 A / ≈909 A” liczone w BACKENDZIE). Zero fizyki w prezentacji: wartości z końcówki
 * `/api/solver/transformer-rated-currents-preview` (`fetchTransformerRatedCurrents`, ta sama,
 * z której korzysta kreator transformatora), wynik buforowany na poziomie modułu kluczem danych
 * tabliczki (`kluczPradowZnamionowych`). Zapytanie nieudane nie trafia do bufora — karta
 * pokazuje brak z przyczyną, a następne zamontowanie ponawia.
 */
import { useEffect, useMemo, useState } from 'react';

import type { EnergyNetworkModel } from '../../../types/enm';
import { fetchTransformerRatedCurrents } from '../forms/transformerRatedCurrentsApi';
import {
  kluczPradowZnamionowych,
  type ObliczeniaKarty,
  type PradyZnamionoweTransformatora,
} from '../../sld/shared/kartaTechnicznaElementu';

const bufor = new Map<string, PradyZnamionoweTransformatora>();
const wToku = new Map<string, Promise<void>>();

/** Wyczyszczenie bufora — wyłącznie dla testów. */
export function wyczyscPradyZnamionoweKarty(): void {
  bufor.clear();
  wToku.clear();
}

function pobierz(klucz: string): Promise<void> {
  const trwa = wToku.get(klucz);
  if (trwa) return trwa;
  const [sn, u1, u2] = klucz.split('|').map(Number);
  const obietnica = fetchTransformerRatedCurrents({
    rated_power_kva: sn * 1000,
    primary_voltage_kv: u1,
    secondary_voltage_kv: u2,
  })
    .then((wynik) => {
      bufor.set(klucz, { pierwotnyA: wynik.primary_current_a, wtornyA: wynik.secondary_current_a, podstawaPl: wynik.formula_ref });
    })
    .catch(() => undefined)
    .finally(() => wToku.delete(klucz));
  wToku.set(klucz, obietnica);
  return obietnica;
}

/** Prądy znamionowe wszystkich transformatorów modelu (unikalne dane tabliczki). */
export function useObliczeniaKarty(snapshot: EnergyNetworkModel | null): ObliczeniaKarty {
  const klucze = useMemo(
    () =>
      [...new Set((snapshot?.transformers ?? []).map((tr) => kluczPradowZnamionowych(tr)).filter((k): k is string => k !== null))].sort(),
    [snapshot],
  );
  const [wersja, ustawWersje] = useState(0);
  useEffect(() => {
    let aktywny = true;
    const brakujace = klucze.filter((k) => !bufor.has(k));
    if (brakujace.length === 0) return undefined;
    void Promise.all(brakujace.map(pobierz)).then(() => {
      if (aktywny) ustawWersje((w) => w + 1);
    });
    return () => {
      aktywny = false;
    };
  }, [klucze]);
  return useMemo(
    () => ({ pradyZnamionowe: new Map(klucze.filter((k) => bufor.has(k)).map((k) => [k, bufor.get(k)!] as const)) }),
    // `wersja` — nowe wpisy bufora po odpowiedzi serwera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [klucze, wersja],
  );
}
