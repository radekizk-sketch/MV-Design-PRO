/**
 * Tabela ocen funkcji ziemnozwarciowych i uziemień stacji — JEDEN komponent dla sekcji oceny
 * zabezpieczeń (bieg `protection_sn`, E-28), wyniku koordynacji (E-28) i karty nastaw
 * sterownika (E-27, zawężenie do jednego urządzenia).
 *
 * Wiersz = rekord kryterium: urządzenie, funkcja, kryterium, wynik i wartość wymagana
 * z jednostką (z rekordu werdyktu), etykieta statusu ZAWSZE ze zdaniem wyjaśnienia (werdykt
 * wyjaśnialny — status nigdy sam), braki z akcją naprawczą przy odmowie. ZERO fizyki w UI.
 */

import { EtykietaWerdyktu } from '../wzorzec/KartaWerdyktu';
import {
  rekordyZiemnozwarciowe,
  zapisWielkosci,
  zdanieBrakow,
  type WynikOcenyZiemnozwarciowej,
} from './ocenaZiemnozwarciowa';
import { KOORDYNACJA_STRINGS as T } from './strings';

export function TabelaOcenyZiemnozwarciowej({
  wynik,
  urzadzenieRef,
  onUzupelnij,
  testid = 'mvd-ocena-ziemnozwarciowa',
  bezNaglowka = false,
}: {
  wynik: WynikOcenyZiemnozwarciowej | null | undefined;
  /** Zawężenie do jednego sterownika (karta nastaw); brak — wszystkie rekordy. */
  urzadzenieRef?: string;
  /** Droga do uzupełnienia braku w modelu (odmowa z akcją naprawczą). */
  onUzupelnij?: () => void;
  testid?: string;
  bezNaglowka?: boolean;
}) {
  const rekordy = rekordyZiemnozwarciowe(wynik, urzadzenieRef);
  return (
    <div className="mvd-koordynacja-ocena-ziemne" data-testid={testid}>
      {bezNaglowka ? null : (
        <>
          <h4>{T.ziemneTytul}</h4>
          <p className="mvd-koordynacja-ocena-opis">{T.ziemneOpis}</p>
        </>
      )}
      {rekordy.length === 0 ? (
        <p data-testid={`${testid}-brak`}>{T.ziemneBrak}</p>
      ) : (
        <table className="mvd-koordynacja-ocena-tabela">
          <thead>
            <tr>
              <th>{T.ziemneKolUrzadzenie}</th>
              <th>{T.ziemneKolFunkcja}</th>
              <th>{T.ziemneKolKryterium}</th>
              <th>{T.ziemneKolWynik}</th>
              <th>{T.ziemneKolWymagane}</th>
              <th>{T.ziemneKolOcena}</th>
            </tr>
          </thead>
          <tbody>
            {rekordy.map((r, i) => {
              const braki = zdanieBrakow(r);
              // Kolejność rekordów jest deterministyczna (backend) — indeks rozróżnia rekordy tego samego
              // kryterium w dwóch stanach sieci (przed i po wymuszeniu AWSC).
              const klucz = `${r.urzadzenie_ref}::${r.funkcja_ref ?? ''}::${r.kryterium}::${i}`;
              return (
                <tr
                  key={klucz}
                  data-testid={`${testid}-wiersz`}
                  data-urzadzenie={r.urzadzenie_ref}
                  data-kod={r.kod ?? ''}
                  data-kryterium={r.kryterium}
                  data-status={r.status}
                >
                  <td>{r.nazwa_urzadzenia_pl}</td>
                  <td>{r.etykieta_pl ?? '—'}</td>
                  <td>{r.kryterium_pl}</td>
                  <td className="mvd-mono">{zapisWielkosci(r.ocena.wynik?.wartosc)}</td>
                  <td className="mvd-mono">{zapisWielkosci(r.ocena.limit?.wartosc)}</td>
                  <td>
                    <EtykietaWerdyktu etykieta={r.ocena.etykieta} status={r.ocena.status_maszynowy} />{' '}
                    <span className="mvd-koordynacja-ocena-zdanie">{r.zdanie_pl}</span>
                    {braki ? (
                      <span className="mvd-koordynacja-ocena-braki" data-testid={`${testid}-braki`}>
                        {' '}
                        <strong>{T.ziemneBrakuje}</strong> {braki}
                        {onUzupelnij && r.braki && r.braki.length > 0 ? (
                          <>
                            {' '}
                            <button
                              type="button"
                              className="mvd-koordynacja-akcja"
                              onClick={onUzupelnij}
                              data-testid={`${testid}-uzupelnij`}
                            >
                              {T.ocenaUzupelnij}
                            </button>
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
