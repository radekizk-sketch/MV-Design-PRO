/*
 * Dialog „Nowy przypadek obliczeniowy" (W-501). Zbiera nazwę (walidowaną), opis
 * (zakres analizy) i tryb: nowy pusty albo dziedziczenie „jak {nazwa}, ale…" przez
 * KLONOWANIE istniejącego przypadku (istniejące API clone — karta §2). Woła
 * ISTNIEJĄCE akcje store'u przez adapter (`useTworzeniePrzypadku`): `createCase`
 * (nowy) lub `cloneCase` (dziedziczenie). Zero fizyki, zero mutacji modelu.
 *
 * TODO-KARTA: klonowanie (`api.cloneStudyCase`) przyjmuje wyłącznie nową nazwę —
 * „Ustaw jako aktywny" oraz opis dotyczą tylko ścieżki „nowy pusty" (patrz adapter).
 */

import { useState } from 'react';
import { useTworzeniePrzypadku, type PrzypadekWiersz } from './adapters/przypadkiAdapter';
import { PRZYPADKI_STRINGS as T } from './strings';

type Tryb = 'nowy' | 'dziedzicz';

interface NowyPrzypadekProps {
  /** Lista przypadków do wyboru źródła dziedziczenia (klonowania). */
  wiersze: PrzypadekWiersz[];
  /** Wstępnie wybrane źródło (z menu „Klonuj") — ustawia tryb „dziedzicz". */
  zrodloPoczatkowe?: string | null;
  onZamknij: () => void;
  onUtworzono?: (id: string) => void;
}

export function NowyPrzypadek({
  wiersze,
  zrodloPoczatkowe = null,
  onZamknij,
  onUtworzono,
}: NowyPrzypadekProps) {
  const { utworz, klonuj, tworzenie, blad } = useTworzeniePrzypadku();
  const [tryb, setTryb] = useState<Tryb>(zrodloPoczatkowe ? 'dziedzicz' : 'nowy');
  const [nazwa, setNazwa] = useState('');
  const [opis, setOpis] = useState('');
  const [zrodloId, setZrodloId] = useState<string>(zrodloPoczatkowe ?? wiersze[0]?.id ?? '');
  const [ustawAktywny, setUstawAktywny] = useState(false);
  const [walidacja, setWalidacja] = useState<string | null>(null);

  async function przeslij(e: React.FormEvent) {
    e.preventDefault();
    const nazwaOczyszczona = nazwa.trim();
    if (!nazwaOczyszczona) {
      setWalidacja(T.bladNazwaPusta);
      return;
    }
    if (tryb === 'dziedzicz' && !zrodloId) {
      setWalidacja(T.bladBrakZrodla);
      return;
    }
    setWalidacja(null);
    try {
      const utworzony =
        tryb === 'dziedzicz'
          ? await klonuj(zrodloId, nazwaOczyszczona)
          : await utworz(nazwaOczyszczona, opis.trim(), ustawAktywny);
      onUtworzono?.(utworzony.id);
      onZamknij();
    } catch {
      // Komunikat błędu pochodzi ze store'u (`blad`) — dialog pozostaje otwarty.
    }
  }

  return (
    <div className="mvd-dialog-scrim" data-testid="mvd-nowy-scrim" onClick={onZamknij}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={T.dialogTytul}
        className="mvd-dialog"
        data-testid="mvd-nowy-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mvd-dialog-tytul">{T.dialogTytul}</h3>
        <form className="mvd-dialog-form" onSubmit={przeslij}>
          <label className="mvd-pole">
            <span className="mvd-pole-etykieta">{T.polaNazwa}</span>
            <input
              type="text"
              className="mvd-input"
              value={nazwa}
              onChange={(e) => setNazwa(e.target.value)}
              placeholder={T.polaNazwaPodpis}
              data-testid="mvd-nowy-nazwa"
              autoFocus
            />
          </label>

          <fieldset className="mvd-pole mvd-pole-tryb">
            <legend className="mvd-pole-etykieta">{T.kolKonfiguracja}</legend>
            <label className="mvd-radio">
              <input
                type="radio"
                name="tryb"
                checked={tryb === 'nowy'}
                onChange={() => setTryb('nowy')}
                data-testid="mvd-nowy-tryb-nowy"
              />
              {T.trybNowy}
            </label>
            <label className="mvd-radio">
              <input
                type="radio"
                name="tryb"
                checked={tryb === 'dziedzicz'}
                onChange={() => setTryb('dziedzicz')}
                disabled={wiersze.length === 0}
                data-testid="mvd-nowy-tryb-dziedzicz"
              />
              {T.trybDziedzicz}
            </label>
          </fieldset>

          {tryb === 'dziedzicz' ? (
            <label className="mvd-pole">
              <span className="mvd-pole-etykieta">{T.polaZrodlo}</span>
              <select
                className="mvd-input"
                value={zrodloId}
                onChange={(e) => setZrodloId(e.target.value)}
                data-testid="mvd-nowy-zrodlo"
              >
                {wiersze.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nazwa}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="mvd-pole">
                <span className="mvd-pole-etykieta">{T.polaOpis}</span>
                <input
                  type="text"
                  className="mvd-input"
                  value={opis}
                  onChange={(e) => setOpis(e.target.value)}
                  placeholder={T.polaOpisPodpis}
                  data-testid="mvd-nowy-opis"
                />
              </label>
              <label className="mvd-radio mvd-pole">
                <input
                  type="checkbox"
                  checked={ustawAktywny}
                  onChange={(e) => setUstawAktywny(e.target.checked)}
                  data-testid="mvd-nowy-aktywny"
                />
                {T.ustawAktywny}
              </label>
            </>
          )}

          {(walidacja || blad) && (
            <p className="mvd-dialog-blad" role="alert" data-testid="mvd-nowy-blad">
              {walidacja ?? blad}
            </p>
          )}

          <div className="mvd-dialog-akcje">
            <button
              type="button"
              className="mvd-btn"
              onClick={onZamknij}
              data-testid="mvd-nowy-anuluj"
            >
              {T.przyciskAnuluj}
            </button>
            <button
              type="submit"
              className="mvd-btn mvd-btn-primary"
              disabled={tworzenie}
              data-testid="mvd-nowy-utworz"
            >
              {T.przyciskUtworz}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
