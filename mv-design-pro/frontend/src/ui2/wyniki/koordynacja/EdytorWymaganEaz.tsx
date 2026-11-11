/**
 * Edytor wymagań projektanta zabezpieczeń ziemnozwarciowych (k_b, k_c, k_c,opor) — pole
 * `wymagania_eaz` konfiguracji przypadku obliczeniowego (backend `StudyCaseConfig`, lista
 * kluczy zamknięta `KLUCZE_WYMAGAN_EAZ`). Zapis idzie do przypadku (PATCH tylko tego pola),
 * potem bieg oceny jest liczony od nowa; stan „wartość projektanta” i liczby w wierszach
 * nadaje backend. Etykiety i wartości tabelowe z wierszy `zrodla_wymagan` wyniku — ekran
 * niczego nie liczy i nie nadaje stanu.
 */

import { useEffect, useState } from 'react';

import { formatWgJednostki, parsujLiczbaPL } from '../../../ui/shared/formatPolishValue';
import {
  KLUCZE_WYMAGAN_EAZ,
  type KluczWymaganiaEaz,
  type WymaganiaEaz,
} from '../../../ui/study-cases/types';
import type { ZrodloWymagania } from './ocenaZiemnozwarciowa';
import { KOORDYNACJA_STRINGS as T } from './strings';

/** Wiersz tabeli źródeł, z którego pochodzi wartość tabelowa klucza przypadku (pierwszy
 *  wiersz o kluczu `k` albo `k.<odmiana>`). */
function wierszZrodla(
  zrodla: readonly ZrodloWymagania[],
  klucz: KluczWymaganiaEaz,
): ZrodloWymagania | undefined {
  return zrodla.find((z) => z.klucz === klucz || z.klucz.startsWith(`${klucz}.`));
}

function tekstyZ(wymagania: WymaganiaEaz): Record<KluczWymaganiaEaz, string> {
  const wynik = {} as Record<KluczWymaganiaEaz, string>;
  for (const k of KLUCZE_WYMAGAN_EAZ) {
    const v = wymagania[k];
    wynik[k] = v === undefined ? '' : String(v).replace('.', ',');
  }
  return wynik;
}

export function EdytorWymaganEaz({
  wymagania,
  zrodla,
  onZapisz,
  testid,
}: {
  /** Bieżące `wymagania_eaz` przypadku (z serwera). */
  wymagania: WymaganiaEaz;
  zrodla: readonly ZrodloWymagania[];
  /** Zapis do przypadku i ponowny bieg; odrzucenie — komunikat serwera pod formularzem. */
  onZapisz: (wymagania: WymaganiaEaz) => Promise<void>;
  testid: string;
}) {
  const [teksty, setTeksty] = useState(() => tekstyZ(wymagania));
  const [bledy, setBledy] = useState<Partial<Record<KluczWymaganiaEaz, boolean>>>({});
  const [zapis, setZapis] = useState(false);
  const [bladZapisu, setBladZapisu] = useState<string | null>(null);
  const odcisk = JSON.stringify(wymagania);
  useEffect(() => {
    setTeksty(tekstyZ(JSON.parse(odcisk) as WymaganiaEaz));
    setBledy({});
  }, [odcisk]);

  const zapisz = async (nowe: WymaganiaEaz) => {
    setZapis(true);
    setBladZapisu(null);
    try {
      await onZapisz(nowe);
    } catch (err) {
      setBladZapisu(err instanceof Error ? err.message : String(err));
    } finally {
      setZapis(false);
    }
  };

  const zatwierdz = () => {
    const nowe: WymaganiaEaz = {};
    const noweBledy: Partial<Record<KluczWymaganiaEaz, boolean>> = {};
    for (const k of KLUCZE_WYMAGAN_EAZ) {
      const v = parsujLiczbaPL(teksty[k]);
      if (v === 'pusto') continue;
      if (v === 'blad' || v <= 0) noweBledy[k] = true;
      else nowe[k] = v;
    }
    setBledy(noweBledy);
    if (Object.keys(noweBledy).length === 0) void zapisz(nowe);
  };

  const pusto = KLUCZE_WYMAGAN_EAZ.every((k) => wymagania[k] === undefined);
  return (
    <form
      className="mvd-eaz-wymagania"
      data-testid={`${testid}-wymagania-projektanta`}
      onSubmit={(e) => {
        e.preventDefault();
        zatwierdz();
      }}
    >
      <p className="mvd-eaz-wymagania-tytul">{T.ziemneWymaganiaProjektanta}</p>
      <p className="mvd-eaz-przypis">{T.ziemneWymaganiaProjektantaOpis}</p>
      <div className="mvd-eaz-wymagania-pola">
        {KLUCZE_WYMAGAN_EAZ.map((k) => {
          const z = wierszZrodla(zrodla, k);
          return (
            <label key={k} title={z?.opis_pl}>
              <span>{z?.symbol ?? k}</span>
              <input
                type="text"
                inputMode="decimal"
                value={teksty[k]}
                placeholder={
                  z?.wartosc != null
                    ? T.ziemneWymaganiaZTabeli(formatWgJednostki(z.wartosc, z.jednostka))
                    : ''
                }
                aria-invalid={bledy[k] ? true : undefined}
                onChange={(e) => setTeksty({ ...teksty, [k]: e.target.value })}
                data-testid={`${testid}-wymaganie-${k}`}
              />
            </label>
          );
        })}
      </div>
      {Object.keys(bledy).length > 0 ? (
        <p className="mvd-eaz-braki" role="alert" data-testid={`${testid}-wymagania-projektanta-blad`}>
          {T.ziemneWymaganiaZlaLiczba}
        </p>
      ) : null}
      {bladZapisu ? (
        <p className="mvd-eaz-braki" role="alert" data-testid={`${testid}-wymagania-projektanta-blad-zapisu`}>
          {bladZapisu}
        </p>
      ) : null}
      <div className="mvd-eaz-wymagania-akcje">
        <button type="submit" disabled={zapis} data-testid={`${testid}-wymagania-projektanta-zapisz`}>
          {zapis ? T.ziemneWymaganiaZapisWToku : T.ziemneWymaganiaZapisz}
        </button>
        <button
          type="button"
          disabled={zapis || pusto}
          onClick={() => void zapisz({})}
          data-testid={`${testid}-wymagania-projektanta-wyczysc`}
        >
          {T.ziemneWymaganiaWyczysc}
        </button>
      </div>
    </form>
  );
}
