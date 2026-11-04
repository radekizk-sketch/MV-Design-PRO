/**
 * K6 — pozycje katalogów potrzebne karcie technicznej inspektora: aparaty SN (nazwa typu,
 * zdolność wyłączalna, Iₜₕ, I_dyn), transformatory, przekształtniki źródeł OZE i typy sieci
 * zasilającej (nazwa i producent typu), rodziny rozdzielnic i szablony pól (nazwy zamiast
 * identyfikatorów), profile operatorów NC RfG, charakterystyki P(f) i profile modeli
 * dynamicznych (sekcja zgodności przyłączeniowej źródła). Pobierane raz na sesję; wynik jest
 * buforowany na poziomie modułu WYŁĄCZNIE wtedy, gdy wszystkie katalogi przyszły — katalog,
 * którego pobranie się nie udało, zostaje pusty do następnego zamontowania karty (ponowienie),
 * a pozostałe są pokazywane od razu. Do chwili odpowiedzi karta pokazuje dane z modelu,
 * a pola znane wyłącznie z katalogu jako „brak danych” albo opis jawny pozycji bez nazwy —
 * nigdy wartość zastępczą ani identyfikator pozycji.
 */
import { useEffect, useState } from 'react';

import {
  fetchCompleteBayTemplates,
  fetchDerConverterTypes,
  fetchMvApparatusTypes,
  fetchSourceSystemTypes,
  fetchSwitchgearFamilies,
  fetchTransformerTypes,
} from '../../catalog/api';
import { KATALOGI_PUSTE, type KatalogiKarty } from '../../sld/shared/kartaTechnicznaElementu';
import { fetchAudit2CatalogSnapshot } from '../station-der/audit2-api';
import { fetchDerDynamicProfiles, fetchNcRfgOperators } from '../station-der/derRemoteCatalogs';

let zaladowane: KatalogiKarty | null = null;
let wToku: Promise<KatalogiKarty | null> | null = null;

/** Wywołanie pobrania jako obietnica — także wyjątek synchroniczny staje się odrzuceniem. */
function sprobuj<T>(pobierz: () => Promise<T>): Promise<T> {
  return Promise.resolve().then(pobierz);
}

/** Lista pozycji katalogu z odpowiedzi; odpowiedź o innym kształcie niż lista (błąd kontraktu,
 *  strona błędu serwera) to katalog niedostępny — pusta lista, nie wyjątek przy budowie karty. */
function lista<T>(wynik: PromiseSettledResult<readonly T[]>): readonly T[] {
  return wynik.status === 'fulfilled' && Array.isArray(wynik.value) ? wynik.value : [];
}

function krzywePf(wynik: PromiseSettledResult<{ readonly pf_curves?: unknown }>): readonly { id: string; label_pl: string }[] {
  if (wynik.status !== 'fulfilled') return [];
  const krzywe = wynik.value?.pf_curves;
  return Array.isArray(krzywe) ? (krzywe as { id: string; label_pl: string }[]) : [];
}

/** Katalog przyszedł w kształcie kontraktu (lista albo migawka z listą krzywych P(f)). */
function kompletny(wynik: PromiseSettledResult<unknown>, czyMigawka = false): boolean {
  if (wynik.status !== 'fulfilled') return false;
  const v = wynik.value as { pf_curves?: unknown } | null;
  return czyMigawka ? Array.isArray(v?.pf_curves) : Array.isArray(v);
}

function zaladuj(): Promise<KatalogiKarty | null> {
  if (!wToku) {
    wToku = Promise.allSettled([
      sprobuj(fetchMvApparatusTypes),
      sprobuj(fetchTransformerTypes),
      sprobuj(() => fetchDerConverterTypes()),
      sprobuj(fetchSourceSystemTypes),
      sprobuj(() => fetchSwitchgearFamilies()),
      sprobuj(() => fetchCompleteBayTemplates()),
      sprobuj(fetchNcRfgOperators),
      sprobuj(fetchAudit2CatalogSnapshot),
      sprobuj(fetchDerDynamicProfiles),
    ] as const).then((wyniki) => {
      const [aparaty, transformatory, przeksztaltniki, systemy, rodziny, szablony, operatorzy, audit2, dynamika] =
        wyniki;
      const katalogi: KatalogiKarty = {
        aparatySn: new Map(lista(aparaty).map((a) => [a.id, a])),
        transformatory: new Map(lista(transformatory).map((t) => [t.id, { name: t.name }])),
        przeksztaltniki: new Map(
          lista(przeksztaltniki).map((c) => [c.id, { name: c.name, manufacturer: c.manufacturer }]),
        ),
        systemyZasilajace: new Map(lista(systemy).map((s) => [s.id, { name: s.name }])),
        rodzinyRozdzielnic: new Map(
          lista(rodziny).map((r) => [r.switchgear_family_ref, r.family_name]),
        ),
        szablonyPol: lista(szablony),
        operatorzyNcRfg: lista(operatorzy),
        krzywePf: new Map(krzywePf(audit2).map((k) => [k.id, k.label_pl])),
        profileDynamiki: lista(dynamika),
      };
      const listy = [aparaty, transformatory, przeksztaltniki, systemy, rodziny, szablony, operatorzy, dynamika];
      if (listy.every((w) => kompletny(w)) && kompletny(audit2, true)) {
        zaladowane = katalogi;
      } else {
        wToku = null;
      }
      return katalogi;
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

