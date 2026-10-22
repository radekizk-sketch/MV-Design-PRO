/**
 * K6 — pozycje katalogów potrzebne karcie technicznej inspektora: aparaty SN (nazwa typu,
 * zdolność wyłączalna, Iₜₕ, I_dyn) i transformatory (nazwa typu). Pobierane raz na sesję
 * (`/api/catalog/mv-apparatus-types`, `/api/catalog/transformer-types`); wynik udany jest
 * buforowany na poziomie modułu, błąd pobrania NIE jest buforowany (następne zamontowanie
 * karty ponawia). Do chwili odpowiedzi (i po błędzie) karta pokazuje dane z modelu, a pola
 * znane wyłącznie z katalogu jako „brak danych" — nigdy wartość zastępczą.
 */
import { useEffect, useState } from 'react';

import { fetchMvApparatusTypes, fetchTransformerTypes } from '../../catalog/api';
import { KATALOGI_PUSTE, type KatalogiKarty } from '../../sld/shared/kartaTechnicznaElementu';

let zaladowane: KatalogiKarty | null = null;
let wToku: Promise<KatalogiKarty | null> | null = null;

function zaladuj(): Promise<KatalogiKarty | null> {
  if (!wToku) {
    wToku = Promise.all([fetchMvApparatusTypes(), fetchTransformerTypes()])
      .then(([aparaty, transformatory]) => {
        zaladowane = {
          aparatySn: new Map(aparaty.map((a) => [a.id, a])),
          transformatory: new Map(transformatory.map((t) => [t.id, { name: t.name }])),
        };
        return zaladowane;
      })
      .catch(() => {
        wToku = null;
        return null;
      });
  }
  return wToku;
}

export function useKatalogiKarty(): KatalogiKarty {
  const [katalogi, setKatalogi] = useState<KatalogiKarty>(zaladowane ?? KATALOGI_PUSTE);
  useEffect(() => {
    if (zaladowane) {
      setKatalogi(zaladowane);
      return undefined;
    }
    let aktywny = true;
    void zaladuj().then((wynik) => {
      if (aktywny && wynik) setKatalogi(wynik);
    });
    return () => {
      aktywny = false;
    };
  }, []);
  return katalogi;
}

