/**
 * SekcjaPorownaniaMetod — „Walidacja krzyżowa metod rozpływu" (karta W3-G1,
 * aneks D2 mapy domknięcia). Sekcja OSOBNA ekranu „Jakość" (dzielonego z
 * W3-G2 — wpięta w `EkranJakosci.tsx` bez edycji istniejących sekcji).
 *
 * CO ROBI: znajduje NAJNOWSZY zakończony bieg rozpływu metodą NR (referencja)
 * i NAJNOWSZY metodą FD (walidacja) TEGO SAMEGO przypadku, i pokazuje różnicę
 * |U| oraz kąta PER SZYNA + zbieżność + liczbę iteracji obu biegów — Z DWÓCH
 * BIEGÓW KANONICZNYCH, bez nowej fizyki: różnice liczy backend (tor P20c,
 * `POST /api/power-flow-comparisons`, ten sam mechanizm co okno „Porównanie
 * przebiegów" — reużyty WPROST, zero duplikacji), ta warstwa wyłącznie
 * formatuje i renderuje.
 *
 * METODA per bieg jest WYŁĄCZNIE na śladzie (`PowerFlowTrace.solver_method`)
 * — `ExecutionRun` (lista store'u) jej nie niesie, więc odkrycie NR/FD idzie
 * sekwencyjnie od najnowszego biegu (`fetchPowerFlowTrace`), z przerwaniem,
 * gdy oba już znalezione (zwykle 1–2 zapytania, nie N).
 *
 * Stan zerowy jest POCZWÓRNY (uczciwość zamiast jednego domysłu): brak
 * jakiegokolwiek rozpływu, brak WYŁĄCZNIE FD (akcja „Uruchom FD" — dosłowne
 * brzmienie DoD karty), brak WYŁĄCZNIE NR (symetryczny przypadek — akcja
 * „Uruchom NR"), błąd porównania. ZERO fizyki, ZERO mutacji modelu w tym pliku.
 */

import './jakosc.css';

import { useEffect, useMemo, useState } from 'react';

import type { AdvancementMode } from '../../shell/modeModel';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { fetchPowerFlowTrace } from '../../../ui/power-flow-results/api';
import { createPowerFlowComparison } from '../../../ui/power-flow-comparison/api';
import type { PowerFlowComparisonResult } from '../../../ui/power-flow-comparison/types';
import {
  AKCJE_STANU_ZEROWEGO_STRINGS,
  SekcjaZalozen,
  TabelaWynikow,
  useAkcjaPrzejdzDoPrzypadkow,
  useAkcjaUruchomObliczenie,
} from '../wzorzec';
import {
  KOLUMNY_DELTA_SZYN,
  kandydaciRozplywuOdNajnowszego,
  naPodsumowaniePorownaniaMetod,
  naWierszeDeltaSzyn,
  naZalozeniaPorownaniaMetod,
  type WynikBieguMetody,
} from './porownanieMetodModel';
import { JAKOSC_STRINGS as T } from './strings';

type StanOdkrycia =
  | { faza: 'ladowanie' }
  | { faza: 'brakRozplywu' }
  | { faza: 'brakFd'; nr: WynikBieguMetody }
  | { faza: 'brakNr'; fd: WynikBieguMetody }
  | { faza: 'blad' }
  | { faza: 'gotowe'; nr: WynikBieguMetody; fd: WynikBieguMetody; porownanie: PowerFlowComparisonResult };

function StanMetod({
  tytul,
  opis,
  akcja,
  onAkcja,
  testid,
  wariant = 'info',
}: {
  tytul: string;
  opis?: string;
  akcja?: string;
  onAkcja?: () => void;
  testid: string;
  wariant?: 'info' | 'blad';
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-jakosc-stan mvd-jakosc-stan--blad' : 'mvd-jakosc-stan'}
      data-testid={testid}
    >
      <p className="mvd-jakosc-stan-title">{tytul}</p>
      {opis && <p className="mvd-jakosc-stan-desc">{opis}</p>}
      {akcja && onAkcja && (
        <button type="button" className="mvd-jakosc-af-licz" onClick={onAkcja} data-testid={`${testid}-akcja`}>
          {akcja}
        </button>
      )}
    </div>
  );
}

export interface SekcjaPorownaniaMetodProps {
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
}

export function SekcjaPorownaniaMetod({ trybZaawansowania, onOtworzDowod }: SekcjaPorownaniaMetodProps) {
  const runs = useExecutionRunsStore((s) => s.runs);
  const kandydaci = useMemo(() => kandydaciRozplywuOdNajnowszego(runs), [runs]);
  const kluczKandydatow = kandydaci.map((r) => r.id).join(',');

  const [stan, setStan] = useState<StanOdkrycia>({ faza: 'ladowanie' });

  useEffect(() => {
    let anulowane = false;
    setStan({ faza: 'ladowanie' });

    async function odkryjINajdlebszyPorownaj(): Promise<void> {
      if (kandydaci.length === 0) {
        if (!anulowane) setStan({ faza: 'brakRozplywu' });
        return;
      }
      let nr: WynikBieguMetody | null = null;
      let fd: WynikBieguMetody | null = null;
      for (const run of kandydaci) {
        if (nr && fd) break;
        try {
          const slad = await fetchPowerFlowTrace(run.id);
          if (!nr && slad.solver_method === 'newton-raphson') nr = { run, slad };
          if (!fd && slad.solver_method === 'fast-decoupled') fd = { run, slad };
        } catch {
          // Bieg bez dostępnego śladu (np. skasowany w międzyczasie) — pomijamy
          // kandydata, nie przerywamy odkrycia pozostałych.
        }
      }
      if (anulowane) return;
      if (nr && fd) {
        try {
          const porownanie = await createPowerFlowComparison(nr.run.id, fd.run.id);
          if (!anulowane) setStan({ faza: 'gotowe', nr, fd, porownanie });
        } catch {
          if (!anulowane) setStan({ faza: 'blad' });
        }
        return;
      }
      if (nr && !fd) {
        setStan({ faza: 'brakFd', nr });
        return;
      }
      if (!nr && fd) {
        setStan({ faza: 'brakNr', fd });
        return;
      }
      // Kandydaci istnieją (LOAD_FLOW/DONE), ale żaden ślad nie niósł metody
      // NR ani FD (np. wyłącznie GS, albo ślady sprzed pola `solver_method`,
      // patrz komentarz kontraktu) — uczciwie jak brak rozpływu w ogóle.
      setStan({ faza: 'brakRozplywu' });
    }

    void odkryjINajdlebszyPorownaj();
    return () => {
      anulowane = true;
    };
    // Zależność: klucz identyfikatorów kandydatów (ten sam render co `kandydaci`) —
    // efekt rusza ponownie tylko, gdy zmieni się ZBIÓR biegów, nie tożsamość tablicy.
  }, [kluczKandydatow]);

  const akcjaObliczenia = useAkcjaPrzejdzDoPrzypadkow();
  const akcjaFd = useAkcjaUruchomObliczenie('LOAD_FLOW', {
    solverInput: { solver_method: 'fast-decoupled' },
    etykieta: AKCJE_STANU_ZEROWEGO_STRINGS.uruchomMetodaFd,
    opis: AKCJE_STANU_ZEROWEGO_STRINGS.uruchomMetodaFdOpis,
  });
  const akcjaNr = useAkcjaUruchomObliczenie('LOAD_FLOW', {
    solverInput: { solver_method: 'newton-raphson' },
    etykieta: AKCJE_STANU_ZEROWEGO_STRINGS.uruchomMetodaNr,
    opis: AKCJE_STANU_ZEROWEGO_STRINGS.uruchomMetodaNrOpis,
  });

  return (
    <section data-testid="mvd-jakosc-metody">
      <h2 className="mvd-jakosc-sekcja-tytul">{T.sekcjaMetody}</h2>

      {stan.faza === 'ladowanie' && (
        <StanMetod tytul={T.metodyLadowanie} testid="mvd-jakosc-metody-ladowanie" />
      )}

      {stan.faza === 'brakRozplywu' && (
        <StanMetod
          tytul={T.metodyBrakRozplywu}
          opis={T.metodyBrakRozplywuOpis}
          akcja={akcjaObliczenia.etykieta}
          onAkcja={akcjaObliczenia.onKlik}
          testid="mvd-jakosc-metody-brak"
        />
      )}

      {stan.faza === 'brakFd' && (
        <StanMetod
          tytul={T.metodyBrakFd}
          opis={T.metodyBrakFdOpis}
          akcja={akcjaFd.etykieta}
          onAkcja={akcjaFd.onKlik}
          testid="mvd-jakosc-metody-brak-fd"
        />
      )}

      {stan.faza === 'brakNr' && (
        <StanMetod
          tytul={T.metodyBrakNr}
          opis={T.metodyBrakNrOpis}
          akcja={akcjaNr.etykieta}
          onAkcja={akcjaNr.onKlik}
          testid="mvd-jakosc-metody-brak-nr"
        />
      )}

      {stan.faza === 'blad' && (
        <StanMetod
          tytul={T.metodyBlad}
          opis={T.metodyBladOpis}
          wariant="blad"
          testid="mvd-jakosc-metody-blad"
        />
      )}

      {stan.faza === 'gotowe' && (
        <>
          <SekcjaZalozen zalozenia={naZalozeniaPorownaniaMetod(stan.nr, stan.fd)} />
          <div className="mvd-jakosc-podsumowanie" data-testid="mvd-jakosc-metody-podsumowanie">
            {naPodsumowaniePorownaniaMetod(stan.porownanie.summary).map((p) => (
              <div className="mvd-jakosc-chip mvd-jakosc-chip--neutral" key={p.etykieta}>
                <span className="mvd-jakosc-chip-liczba mvd-num">{p.wartosc}</span>
                <span className="mvd-jakosc-chip-etykieta">{p.etykieta}</span>
              </div>
            ))}
          </div>
          <TabelaWynikow
            kolumny={KOLUMNY_DELTA_SZYN}
            wiersze={naWierszeDeltaSzyn(stan.porownanie.bus_diffs)}
            onOtworzDowod={onOtworzDowod}
            trybZaawansowania={trybZaawansowania}
            kluczWiersza="szyna"
          />
        </>
      )}
    </section>
  );
}
