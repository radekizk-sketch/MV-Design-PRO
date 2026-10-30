/**
 * K6 — pozycje katalogów potrzebne karcie technicznej inspektora: aparaty SN (nazwa typu,
 * zdolność wyłączalna, Iₜₕ, I_dyn), transformatory (nazwa typu), szablony pól SN (nazwa
 * szablonu kanonicznego i producenta) i rodziny rozdzielnic (nazwa rodziny i serii). Pobierane
 * raz na sesję (`/api/catalog/mv-apparatus-types`, `/api/catalog/transformer-types`,
 * `/api/catalog/bay-templates`, `/api/catalog/complete-bay-templates`,
 * `/api/catalog/switchgear-families`); wynik udany jest
 * buforowany na poziomie modułu, błąd pobrania NIE jest buforowany (następne zamontowanie
 * karty ponawia). Do chwili odpowiedzi (i po błędzie) karta pokazuje dane z modelu, a pola
 * znane wyłącznie z katalogu jako „brak danych" — nigdy wartość zastępczą.
 */
import { useEffect, useState } from 'react';

import {
  fetchCompleteBayTemplates,
  fetchMvApparatusTypes,
  fetchSwitchgearFamilies,
  fetchSzablonyPolaKanoniczne,
  fetchTransformerTypes,
} from '../../catalog/api';
import { KATALOGI_PUSTE, type KatalogiKarty } from '../../sld/shared/kartaTechnicznaElementu';

let zaladowane: KatalogiKarty | null = null;
let wToku: Promise<KatalogiKarty | null> | null = null;

function zaladuj(): Promise<KatalogiKarty | null> {
  if (!wToku) {
    wToku = Promise.all([
      fetchMvApparatusTypes(),
      fetchTransformerTypes(),
      // Bez cech pola: lista WSZYSTKICH szablonów rejestru (ocena dopuszczalności nie filtruje).
      fetchSzablonyPolaKanoniczne({ poleGpz: false }),
      fetchCompleteBayTemplates(),
      fetchSwitchgearFamilies(),
    ])
      .then(([aparaty, transformatory, kanoniczne, producenckie, rodziny]) => {
        const szablonyPol = new Map<string, string>(kanoniczne.map((s) => [s.template_ref, s.template_name_pl]));
        for (const s of producenckie) {
          if (s.template_name_pl) szablonyPol.set(s.template_ref, s.template_name_pl);
        }
        zaladowane = {
          aparatySn: new Map(aparaty.map((a) => [a.id, a])),
          transformatory: new Map(transformatory.map((t) => [t.id, { name: t.name }])),
          szablonyPol,
          rodzinyRozdzielnic: new Map(
            rodziny.map((r) => [r.switchgear_family_ref, r.series_name ? `${r.family_name} · ${r.series_name}` : r.family_name]),
          ),
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

