/*
 * Pasek narzędzi bieżącej przestrzeni — DRUGI z trzech pasów powłoki (karta
 * K1 POWLOKA, kontrakt UIUX przemysłowy UI-01).
 *
 * Zastępuje dawne trzy pasy nad kanwą: pasek metryk `WorkflowContextStrip`,
 * pas „Tryb pracy" i baner „Następny krok". Zostają wyłącznie polecenia:
 *  - Edycja / Podgląd — tryb pracy kanwy (tylko przestrzeń „Schemat" z kanwą),
 *  - Szukaj — JEDYNA wyszukiwarka (paleta poleceń, Ctrl+K; dawny osobny dialog
 *    wyszukiwania w modelu jest skasowany, jego zdolność przeszła do palety),
 *  - Katalog, Przegląd zbiorczy, Historia — te same cele co dawne akcje paska
 *    metryk,
 *  - Liczniki modelu — panel na żądanie (dawniej stały pas liczb).
 * Każde polecenie dostaje realną akcję od wołającego; brak akcji = brak przycisku
 * (zero martwych kliknięć).
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { SHELL_STRINGS } from './strings';
import type { LicznikiModelu } from './licznikiModelu';
import { formatLengthKm } from '../../ui/shared/formatPolishValue';

export interface PasekNarzedziProps {
  /** Przełącznik trybu pracy kanwy (Edycja/Podgląd) — tylko gdy przestrzeń ma kanwę. */
  przelacznikPodgladu?: ReactNode;
  onSzukaj?: () => void;
  onKatalog?: () => void;
  onPrzegladZbiorczy?: () => void;
  onHistoria?: () => void;
  /** Liczniki modelu (`null` = migawka modelu jeszcze nieobecna). */
  liczniki: LicznikiModelu | null;
  /** Projekt otwarty — przy braku migawki liczniki mówią „wczytywanie", nie „brak". */
  projektOtwarty: boolean;
  /** Akcja pustego modelu: przejście do budowy sieci (parytet dawnego paska metryk). */
  onZacznijBudowe?: () => void;
}

function Narzedzie({
  testId,
  etykieta,
  tytul,
  onClick,
}: {
  testId: string;
  etykieta: string;
  tytul: string;
  onClick?: () => void;
}) {
  if (!onClick) return null;
  return (
    <button type="button" className="mvd-narzedzie" title={tytul} onClick={onClick} data-testid={testId}>
      {etykieta}
    </button>
  );
}

function Wartosc({ etykieta, wartosc, testId }: { etykieta: string; wartosc: string; testId: string }) {
  return (
    <div className="mvd-liczniki-wiersz">
      <dt>{etykieta}</dt>
      <dd className="mvd-num" data-testid={testId}>
        {wartosc}
      </dd>
    </div>
  );
}

function PanelLicznikow({
  liczniki,
  projektOtwarty,
  onZacznijBudowe,
}: Pick<PasekNarzedziProps, 'liczniki' | 'projektOtwarty' | 'onZacznijBudowe'>) {
  if (!liczniki) {
    return projektOtwarty ? (
      <p className="mvd-liczniki-stan" data-testid="mvd-liczniki-wczytywanie">
        Wczytywanie modelu sieci aktywnego zakresu…
      </p>
    ) : (
      <p className="mvd-liczniki-stan" data-testid="mvd-liczniki-brak-projektu">
        Brak otwartego projektu — liczniki pojawią się po otwarciu projektu.
      </p>
    );
  }
  const pusty =
    liczniki.zrodla + liczniki.szyny + liczniki.odcinkiSn + liczniki.stacje + liczniki.transformatory
    + liczniki.generatory + liczniki.odbiory === 0;
  return (
    <>
      <dl className="mvd-liczniki-lista">
        <Wartosc etykieta="Zasilania GPZ" wartosc={String(liczniki.zrodla)} testId="mvd-licznik-zrodla" />
        <Wartosc etykieta="Szyny" wartosc={String(liczniki.szyny)} testId="mvd-licznik-szyny" />
        <Wartosc etykieta="Odcinki SN" wartosc={String(liczniki.odcinkiSn)} testId="mvd-licznik-odcinki" />
        <Wartosc etykieta="Pola SN" wartosc={String(liczniki.polaSn)} testId="mvd-licznik-pola" />
        <Wartosc etykieta="Stacje SN/nN" wartosc={String(liczniki.stacje)} testId="mvd-licznik-stacje" />
        <Wartosc
          etykieta="Transformatory"
          wartosc={String(liczniki.transformatory)}
          testId="mvd-licznik-transformatory"
        />
        <Wartosc
          etykieta="Układy PV/BESS/FW"
          wartosc={String(liczniki.generatory)}
          testId="mvd-licznik-generatory"
        />
        <Wartosc etykieta="Odbiory" wartosc={String(liczniki.odbiory)} testId="mvd-licznik-odbiory" />
        <Wartosc
          etykieta="Długość odcinków SN"
          wartosc={
            liczniki.dlugoscKm === null
              ? 'nie podano'
              : formatLengthKm(liczniki.dlugoscKm, { decimals: 2 })
          }
          testId="mvd-licznik-dlugosc"
        />
      </dl>
      {pusty && onZacznijBudowe ? (
        <button
          type="button"
          className="mvd-btn mvd-btn-primary"
          onClick={onZacznijBudowe}
          data-testid="mvd-liczniki-zacznij"
        >
          Przejdź do budowy GPZ
        </button>
      ) : null}
    </>
  );
}

export function PasekNarzedzi({
  przelacznikPodgladu,
  onSzukaj,
  onKatalog,
  onPrzegladZbiorczy,
  onHistoria,
  liczniki,
  projektOtwarty,
  onZacznijBudowe,
}: PasekNarzedziProps) {
  const [licznikiOtwarte, setLicznikiOtwarte] = useState(false);
  const idPanelu = useId();
  const korzenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!licznikiOtwarte) return;
    const poza = (zdarzenie: PointerEvent) => {
      if (!korzenRef.current?.contains(zdarzenie.target as Node)) setLicznikiOtwarte(false);
    };
    const klawisz = (zdarzenie: KeyboardEvent) => {
      if (zdarzenie.key === 'Escape') setLicznikiOtwarte(false);
    };
    document.addEventListener('pointerdown', poza);
    document.addEventListener('keydown', klawisz);
    return () => {
      document.removeEventListener('pointerdown', poza);
      document.removeEventListener('keydown', klawisz);
    };
  }, [licznikiOtwarte]);

  return (
    <div
      className="mvd-pasek-narzedzi"
      role="toolbar"
      aria-label={SHELL_STRINGS.toolbarLabel}
      data-testid="mvd-pasek-narzedzi"
    >
      {przelacznikPodgladu}
      <Narzedzie testId="mvd-narzedzie-szukaj" etykieta={SHELL_STRINGS.search} tytul={SHELL_STRINGS.searchHint} onClick={onSzukaj} />
      <Narzedzie testId="mvd-narzedzie-katalog" etykieta={SHELL_STRINGS.catalog} tytul={SHELL_STRINGS.catalogHint} onClick={onKatalog} />
      <Narzedzie
        testId="mvd-narzedzie-przeglad"
        etykieta={SHELL_STRINGS.review}
        tytul={SHELL_STRINGS.reviewHint}
        onClick={onPrzegladZbiorczy}
      />
      <Narzedzie testId="mvd-narzedzie-historia" etykieta={SHELL_STRINGS.history} tytul={SHELL_STRINGS.historyHint} onClick={onHistoria} />
      <span className="mvd-grow" />
      <div className="mvd-liczniki" ref={korzenRef}>
        <button
          type="button"
          className="mvd-narzedzie"
          aria-expanded={licznikiOtwarte}
          aria-controls={licznikiOtwarte ? idPanelu : undefined}
          title={SHELL_STRINGS.modelCountsHint}
          onClick={() => setLicznikiOtwarte((stan) => !stan)}
          data-testid="mvd-narzedzie-model"
        >
          {SHELL_STRINGS.modelCounts}
        </button>
        {licznikiOtwarte && (
          <section
            id={idPanelu}
            className="mvd-liczniki-panel"
            aria-label={SHELL_STRINGS.modelCounts}
            data-testid="mvd-liczniki-modelu"
          >
            <PanelLicznikow liczniki={liczniki} projektOtwarty={projektOtwarty} onZacznijBudowe={onZacznijBudowe} />
          </section>
        )}
      </div>
    </div>
  );
}
