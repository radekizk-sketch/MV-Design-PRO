/**
 * Sekcja „Nastawy wyznaczone z analizy" (karta F-K5, dług V12K-189).
 *
 * DECYZJA WŁAŚCICIELA, którą ta sekcja dopiero domyka: „nastawa bez danych powinna być
 * niedostępna". Kalkulator wykonuje ją od V12K-189 — zwraca `None` i kanoniczny kod
 * gotowości zamiast liczby zastępczej (dawniej 100,0 A dla nastawy rozruchowej i 5×
 * dla bezzwłocznej). Brakowało konsumenta: wynik kończył w kopercie biegu i projektant
 * NIGDZIE nie widział ani nastaw, ani powodu, dla którego części z nich nie ma.
 *
 * Kontrakt tej sekcji:
 *  - wartość liczbowa WYŁĄCZNIE z backendu (zero fizyki, zero wartości domyślnych),
 *  - nastawa niedostępna to STAN z nazwą, powodem i akcją naprawczą (nie puste pole),
 *  - akcja naprawcza prowadzi tam, gdzie brakującą daną się uzupełnia — kierunek
 *    bierzemy z KANONICZNEGO `fix_navigation` biegu, nie z własnego domysłu,
 *  - uczciwe stany zerowe: brak biegu nastaw ≠ awaria końcówki.
 */

import { useEffect, useState } from 'react';

import type { SpaceId } from '../../shell/spaces';
import { useShellStore } from '../../shell/useShellStore';
import {
  BrakBieguNastaw,
  fetchNastawyPrzypadku,
  type NastawyResponse,
  type PozycjaNastawy,
} from './nastawyApi';
import { KOORDYNACJA_STRINGS as T } from './strings';

type Stan = 'ladowanie' | 'brakBiegu' | 'blad' | 'gotowe';

/**
 * Przestrzeń powłoki, w której uzupełnia się brakującą daną.
 *
 * `panel` jest kanoniczną wskazówką rejestru kodów gotowości
 * (`READINESS_CODES[...].fix_navigation`): „analizy" ⇒ trzeba uruchomić bieg,
 * „inspector" ⇒ trzeba uzupełnić parametr elementu modelu. Odwzorowanie jest jawne,
 * bo powłoka ui2 ma własne nazwy przestrzeni; nierozpoznany panel nie dostaje akcji
 * (lepiej brak przycisku niż przycisk prowadzący w złe miejsce).
 */
function przestrzenDlaPanelu(panel: string | undefined): SpaceId | null {
  if (panel === 'analizy') return 'obliczenia';
  if (panel === 'inspector') return 'model';
  return null;
}

function WierszNastawy({
  pozycja,
  onUzupelnij,
}: {
  pozycja: PozycjaNastawy;
  onUzupelnij: (przestrzen: SpaceId) => void;
}) {
  const niedostepna = pozycja.stan === 'NIEDOSTEPNA';
  const przestrzen = niedostepna
    ? przestrzenDlaPanelu(pozycja.fix_navigation?.panel)
    : null;

  return (
    <tr data-testid={`mvd-koordynacja-nastawa-${pozycja.klucz}`} data-stan={pozycja.stan}>
      <th scope="row">{pozycja.etykieta}</th>
      <td>
        {pozycja.wartosc === null
          ? '—'
          : `${pozycja.wartosc.toFixed(1)} ${pozycja.jednostka}`}
      </td>
      <td>
        {niedostepna ? (
          <div className="mvd-koordynacja-nastawa-brak">
            <span data-tone="warn">{pozycja.komunikat_pl}</span>
            {pozycja.powod_pl ? <p>{pozycja.powod_pl}</p> : null}
            {przestrzen ? (
              <button
                type="button"
                className="mvd-koordynacja-akcja"
                data-testid={`mvd-koordynacja-nastawa-${pozycja.klucz}-akcja`}
                onClick={() => onUzupelnij(przestrzen)}
              >
                {T.nastawyUzupelnijDane}
              </button>
            ) : null}
          </div>
        ) : (
          <span data-tone="ok">{T.nastawyStanDostepna}</span>
        )}
      </td>
    </tr>
  );
}

export function SekcjaNastaw({ caseId }: { caseId: string }) {
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const [stan, setStan] = useState<Stan>('ladowanie');
  const [dane, setDane] = useState<NastawyResponse | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStan('ladowanie');
    setDane(null);
    setBlad(null);
    fetchNastawyPrzypadku(caseId, { signal: controller.signal })
      .then((wynik) => {
        setDane(wynik);
        setStan('gotowe');
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (e instanceof BrakBieguNastaw) {
          setStan('brakBiegu');
          return;
        }
        setBlad(e instanceof Error ? e.message : T.nastawyBlad);
        setStan('blad');
      });
    return () => controller.abort();
  }, [caseId]);

  if (stan === 'ladowanie') {
    return (
      <section className="mvd-koordynacja-nastawy" data-testid="mvd-koordynacja-nastawy-ladowanie">
        <h3>{T.nastawyTytul}</h3>
        <p>{T.nastawyLadowanie}</p>
      </section>
    );
  }

  if (stan === 'brakBiegu') {
    return (
      <section className="mvd-koordynacja-stan" data-testid="mvd-koordynacja-nastawy-brak" data-tone="idle">
        <h3>{T.nastawyBrakBieguTytul}</h3>
        <p>{T.nastawyBrakBieguOpis}</p>
        <button
          type="button"
          className="mvd-koordynacja-akcja"
          data-testid="mvd-koordynacja-nastawy-brak-akcja"
          onClick={() => setActiveSpace('obliczenia')}
        >
          {T.nastawyBrakBieguAkcja}
        </button>
      </section>
    );
  }

  if (stan === 'blad' || dane === null) {
    return (
      <section className="mvd-koordynacja-stan" data-testid="mvd-koordynacja-nastawy-blad" data-tone="bad">
        <h3>{T.nastawyBlad}</h3>
        <p>{blad ?? T.nastawyBlad}</p>
      </section>
    );
  }

  const { prezentacja } = dane;
  return (
    <section className="mvd-koordynacja-nastawy" data-testid="mvd-koordynacja-nastawy">
      <h3>{T.nastawyTytul}</h3>
      <p>{T.nastawyOpis}</p>
      <p
        className="mvd-koordynacja-nastawy-podsumowanie"
        data-kompletne={prezentacja.kompletne ? 'tak' : 'nie'}
        data-testid="mvd-koordynacja-nastawy-podsumowanie"
      >
        {prezentacja.podsumowanie_pl}
      </p>
      <table className="mvd-koordynacja-nastawy-tabela">
        <thead>
          <tr>
            <th scope="col">{T.nastawyKolumnaNastawa}</th>
            <th scope="col">{T.nastawyKolumnaWartosc}</th>
            <th scope="col">{T.nastawyKolumnaStan}</th>
          </tr>
        </thead>
        <tbody>
          {prezentacja.pozycje.map((pozycja) => (
            <WierszNastawy
              key={pozycja.klucz}
              pozycja={pozycja}
              onUzupelnij={setActiveSpace}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}
