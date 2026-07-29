/**
 * „Co się zmieniło od tego wyniku" — ostatni klik łańcucha unieważnienia (V12K-264).
 *
 * Znacznik świeżości mówił dotąd TYLKO tyle, że wynik jest nieaktualny („rew. 4 → 7").
 * Projektant dostawał liczbę rewizji i nic poza nią: żeby zdecydować, czy przeliczać,
 * musiał sam odtworzyć z pamięci, co zrobił między biegiem a chwilą obecną. Przy sieci
 * z kilkudziesięcioma elementami to wybór między liczeniem wszystkiego na ślepo
 * a rezygnacją z aktualizacji.
 *
 * Panel pokazuje LISTĘ przyczyn z backendu: operacja (opis z kanonu), kiedy, ilu
 * elementów dotknęła. Każdy element jest klikalny — to jest ten ostatni klik: z
 * werdyktu „nieaktualne" prosto do elementu, który go unieważnił.
 *
 * ZERO FIZYKI, ZERO INTERPRETACJI: komponent nie liczy nic poza pozycjami listy
 * i nie tłumaczy operacji — opisy przychodzą z `domain/canonical_operations.py`.
 */

import './zmiany.css';
import { useEffect, useState } from 'react';

import { pobierzDziennikZmian, podsumowaniePl } from './dziennikApi';
import type { DziennikZmian } from './dziennikApi';

type Stan = 'ladowanie' | 'gotowe' | 'blad';

export interface PanelCoSieZmieniloProps {
  /** Wariant pracy, którego model sprawdzamy. */
  readonly caseId: string;
  /** Rewizja modelu, NA KTÓREJ policzono wynik. */
  readonly rewizjaDanych: number;
  /** Klik w element dotknięty zmianą — prowadzi do niego w modelu/schemacie. */
  readonly onPokazElement?: (elementRef: string) => void;
}

function etykietaCzasu(znacznik: string): string {
  // Znacznik jest ISO 8601 z backendu; skracamy do minut, bo sekundy nie niosą
  // dla projektanta informacji, a wydłużają wiersz.
  const t = znacznik.replace('T', ' ');
  return t.length >= 16 ? t.slice(0, 16) : t;
}

export function PanelCoSieZmienilo({
  caseId,
  rewizjaDanych,
  onPokazElement,
}: PanelCoSieZmieniloProps): JSX.Element | null {
  const [stan, setStan] = useState<Stan>('ladowanie');
  const [dziennik, setDziennik] = useState<DziennikZmian | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  useEffect(() => {
    const kontroler = new AbortController();
    setStan('ladowanie');
    void (async () => {
      try {
        const dane = await pobierzDziennikZmian(caseId, rewizjaDanych, {
          signal: kontroler.signal,
        });
        setDziennik(dane);
        setBlad(null);
        setStan('gotowe');
      } catch (e) {
        if (kontroler.signal.aborted) return;
        // Awaria dziennika NIE MOŻE wyglądać jak „nic się nie zmieniło" — to
        // odwrotny kierunek błędu niż wymagany (wynik jest nieaktualny, a panel
        // sugerowałby, że jest w porządku).
        setBlad(e instanceof Error ? e.message : 'Nie udało się pobrać dziennika zmian.');
        setStan('blad');
      }
    })();
    return () => kontroler.abort();
  }, [caseId, rewizjaDanych]);

  if (stan === 'ladowanie') {
    return (
      <p className="mvd-zmiany-stan" data-testid="mvd-zmiany-ladowanie">
        Sprawdzanie, co zmieniło się w modelu…
      </p>
    );
  }

  if (stan === 'blad' || dziennik === null) {
    return (
      <p className="mvd-zmiany-stan" data-tone="bad" data-testid="mvd-zmiany-blad">
        {blad}
      </p>
    );
  }

  if (dziennik.wpisy.length === 0) {
    // Uczciwy stan: rewizje się rozjechały, ale dziennik nie zna przyczyny
    // (np. zmiany sprzed wdrożenia dziennika). Milczenie sugerowałoby aktualność.
    return (
      <p className="mvd-zmiany-stan" data-testid="mvd-zmiany-brak-przyczyn">
        {dziennik.aktualny
          ? 'Model nie zmienił się od czasu tego wyniku.'
          : `Model jest w rewizji ${dziennik.rewizja_biezaca}, wynik policzono na `
            + `${dziennik.od_rewizji} — dziennik nie zawiera przyczyn tych zmian.`}
      </p>
    );
  }

  return (
    <section className="mvd-zmiany" data-testid="mvd-co-sie-zmienilo">
      <h3 className="mvd-zmiany-tytul">Co się zmieniło od tego wyniku</h3>
      <p className="mvd-zmiany-podsumowanie" data-testid="mvd-zmiany-podsumowanie">
        {podsumowaniePl(dziennik)}
      </p>
      <ol className="mvd-zmiany-lista">
        {dziennik.wpisy.map((wpis) => (
          <li
            key={wpis.rewizja}
            className="mvd-zmiany-wpis"
            data-testid={`mvd-zmiana-${wpis.rewizja}`}
          >
            <p className="mvd-zmiany-opis">
              <span className="mvd-num">rew. {wpis.rewizja}</span>
              {' · '}
              {wpis.opis_pl}
            </p>
            <p className="mvd-zmiany-meta">{etykietaCzasu(wpis.znacznik_czasu)}</p>
            <ul className="mvd-zmiany-elementy">
              {[
                ...wpis.utworzone.map((ref) => ['dodano', ref] as const),
                ...wpis.zmienione.map((ref) => ['zmieniono', ref] as const),
                ...wpis.usuniete.map((ref) => ['usunięto', ref] as const),
              ].map(([rodzaj, ref]) => (
                <li key={`${rodzaj}-${ref}`}>
                  {onPokazElement && rodzaj !== 'usunięto' ? (
                    <button
                      type="button"
                      className="mvd-zmiany-element"
                      data-testid={`mvd-zmiana-element-${ref}`}
                      onClick={() => onPokazElement(ref)}
                    >
                      {rodzaj}: <span className="mvd-mono">{ref}</span>
                    </button>
                  ) : (
                    // Element USUNIĘTY nie ma dokąd prowadzić — przycisk byłby
                    // martwym klikiem, więc go nie ma.
                    <span className="mvd-zmiany-element" data-nieklikalny="true">
                      {rodzaj}: <span className="mvd-mono">{ref}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
