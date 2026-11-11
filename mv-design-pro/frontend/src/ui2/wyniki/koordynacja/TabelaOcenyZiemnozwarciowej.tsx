/**
 * Ocena zabezpieczeń ziemnozwarciowych — JEDEN komponent dla sekcji oceny zabezpieczeń (bieg
 * `protection_sn`, E-28), wyniku koordynacji (E-28) i karty nastaw sterownika (E-27, zawężenie
 * do jednego urządzenia).
 *
 * Układ (karta EKRANY-EAZ-ZIEMNOZWARCIOWE z korektami właściciela 2026-11-05):
 * - pasek „Sieć” (stałe dane sieci) i pasek „Przypadek doziemienia” (R_F, rodzaj, c, U₀, AWSC
 *   przed/po) — osobno, bo U₀ i 3I₀ zależą od przypadku, nie od sieci;
 * - jedna tabela na RODZINĘ zabezpieczeń; zestaw kolumn z rejestru backendu
 *   (`wynik.rodziny[].kolumny`, `rodziny_eaz.py`) — komponent nie ma warunków na kolumny;
 * - wiersz = pole · funkcja ANSI · stopień · grupa nastaw; kolor WYŁĄCZNIE na liczbie, która nie
 *   spełnia kryterium (`spelnia === false` z backendu); stan jednym znakiem z etykiety backendu;
 * - braki nastaw: jedno zdanie zbiorcze nad tabelami, w komórce nastawy „—” z akcją
 *   „Uzupełnij” (otwiera edytor TEJ funkcji);
 * - „Szczegóły” (jeden przycisk na wiersz): wykres wskazowy 67N z danych algorytmu, warunki
 *   algorytmu, wzory KaTeX z backendu, wymagane współczynniki z podstawą i karty werdyktu.
 *
 * Uziemienia stacji to osobna sekcja (`TabelaUziemienStacji`). ZERO fizyki w UI — liczby,
 * werdykty, zapasy i geometria wykresu przychodzą z backendu; ekran formatuje i rozmieszcza.
 */

import './ocenaEaz.css';

import { Fragment, useState } from 'react';

import { MathInline, MathRenderer } from '../../../ui/proof/MathRenderer';
import { KartaWerdyktu, ZnakWerdyktu } from '../wzorzec/KartaWerdyktu';
import { formatWgJednostki } from '../../../ui/shared/formatPolishValue';
import {
  rekordyWiersza,
  wierszeRodzin,
  type KomorkaRodziny,
  type PrzypadekDoziemienia,
  type RodzinaEaz,
  type SiecDoziemna,
  type WierszRodziny,
  type WynikOcenyZiemnozwarciowej,
} from './ocenaZiemnozwarciowa';
import { KOORDYNACJA_STRINGS as T } from './strings';
import { TabelaUziemienStacji } from './TabelaUziemienStacji';
import { WykresWskazowy67N } from './WykresWskazowy67N';

/** Cel akcji „Uzupełnij”: sterownik i funkcja, których nastawę trzeba podać. */
export interface CelUzupelnienia {
  readonly urzadzenieRef: string;
  readonly funkcjaRef: string;
}

/** Pozycja paska: etykieta słowna albo symbol (KaTeX) z jednostką w nawiasie, potem liczba. */
function Pozycja({
  etykieta,
  symbol,
  jednostka,
  wartosc,
}: {
  etykieta?: string;
  symbol?: string;
  jednostka?: string;
  wartosc: string;
}) {
  return (
    <span className="mvd-eaz-pasek-pozycja">
      <span className="mvd-eaz-pasek-etykieta">
        {symbol ? <MathInline latex={symbol} /> : etykieta}
        {jednostka ? ` [${jednostka}]` : null}
      </span>{' '}
      <span className="mvd-num">{wartosc}</span>
    </span>
  );
}

function PasekSieci({ siec, testid }: { siec: readonly SiecDoziemna[]; testid: string }) {
  if (siec.length === 0) return null;
  return (
    <div className="mvd-eaz-pasek" data-testid={`${testid}-siec`}>
      <span className="mvd-eaz-pasek-tytul">{T.ziemneSiec}</span>
      {siec.map((s) => (
        <span key={s.numer} className="mvd-eaz-pasek-grupa" data-sposob={s.sposob}>
          {siec.length > 1 ? <span className="mvd-eaz-pasek-etykieta">{T.ziemneSiecNr(s.numer)}</span> : null}
          <Pozycja etykieta={T.ziemnePunktNeutralny} wartosc={s.sposob_pl} />
          {s.prad_pojemnosciowy_a !== null ? (
            <Pozycja symbol={T.ziemneIc} jednostka="A" wartosc={formatWgJednostki(s.prad_pojemnosciowy_a, 'A')} />
          ) : null}
          {s.rozstrojenie_proc !== null ? (
            <Pozycja symbol={T.ziemneV} jednostka="%" wartosc={formatWgJednostki(s.rozstrojenie_proc, '%')} />
          ) : null}
          {s.prad_resztkowy_a !== null ? (
            <Pozycja symbol={T.ziemneIres} jednostka="A" wartosc={formatWgJednostki(s.prad_resztkowy_a, 'A')} />
          ) : null}
          {s.awsc_prad_a !== null ? <Pozycja symbol={T.ziemneAwsc} jednostka="A" wartosc={formatWgJednostki(s.awsc_prad_a, 'A')} /> : null}
          {s.awsc_czas_s !== null ? (
            <Pozycja symbol={T.ziemneAwscCzas} jednostka="s" wartosc={formatWgJednostki(s.awsc_czas_s, 's')} />
          ) : null}
        </span>
      ))}
    </div>
  );
}

function PasekPrzypadku({ przypadek, testid }: { przypadek: PrzypadekDoziemienia; testid: string }) {
  const u0 =
    przypadek.u0_min_proc !== null && przypadek.u0_max_proc !== null
      ? `${formatWgJednostki(przypadek.u0_min_proc, '%')}–${formatWgJednostki(przypadek.u0_max_proc, '%')}`
      : '—';
  return (
    <div className="mvd-eaz-pasek" data-testid={`${testid}-przypadek`}>
      <span className="mvd-eaz-pasek-tytul">{T.ziemnePrzypadek}</span>
      <Pozycja etykieta={T.ziemneRodzaj} wartosc={T.ziemneRodzajPl(przypadek.rodzaj)} />
      <Pozycja symbol={T.ziemneRf} jednostka="Ω" wartosc={formatWgJednostki(przypadek.r_f_ohm, 'Ω')} />
      <Pozycja symbol={T.ziemneC} wartosc={`${formatWgJednostki(przypadek.c_min, '1')}–${formatWgJednostki(przypadek.c_max, '1')}`} />
      <Pozycja symbol={T.ziemneU0} jednostka="%" wartosc={u0} />
      <Pozycja symbol={T.ziemneIdz} jednostka="A" wartosc={formatWgJednostki(przypadek.prad_doziemny_max_a, 'A')} />
      <Pozycja etykieta={T.ziemneAwscStany} wartosc={przypadek.stany_awsc.map(T.ziemneAwscStanPl).join(' / ')} />
      <Pozycja etykieta={T.ziemnePunkty} wartosc={String(przypadek.liczba_punktow)} />
    </div>
  );
}

function Komorka({ komorka, testid }: { komorka: KomorkaRodziny | undefined; testid: string }) {
  if (!komorka) {
    return (
      <td className="mvd-num mvd-eaz-liczba" data-testid={testid}>
        —
      </td>
    );
  }
  const tekst = komorka.wartosc !== null ? formatWgJednostki(komorka.wartosc, komorka.jednostka) : (komorka.tekst ?? '—');
  return (
    <td
      className="mvd-num mvd-eaz-liczba"
      data-testid={testid}
      data-spelnia={komorka.spelnia === null ? undefined : String(komorka.spelnia)}
      title={komorka.powod_pl ?? undefined}
    >
      {tekst}
    </td>
  );
}

function OpisWymagania({ przyjete, stan }: { przyjete: boolean; stan: string }) {
  if (przyjete) return <>{T.ziemneWymaganiePrzyjete}</>;
  return <>{stan === 'ZWERYFIKOWANE' ? T.ziemneWymaganieZweryfikowane : T.ziemneWymaganieWskazane}</>;
}

function Szczegoly({ wiersz, wynik, testid }: { wiersz: WierszRodziny; wynik: WynikOcenyZiemnozwarciowej; testid: string }) {
  const karty = rekordyWiersza(wynik, wiersz.kryteria);
  const wymagania = Object.entries(wiersz.wymagania);
  return (
    <div className="mvd-eaz-szczegoly" data-testid={`${testid}-szczegoly`}>
      <div className="mvd-eaz-szczegoly-gora">
        {wiersz.wykres_wskazowy ? <WykresWskazowy67N wykres={wiersz.wykres_wskazowy} testid={`${testid}-wykres`} /> : null}
        <div className="mvd-eaz-szczegoly-dane">
          {wiersz.warunki_67n ? (
            <section data-testid={`${testid}-warunki`}>
              <h6>{T.ziemneWarunki67n}</h6>
              <table className="mvd-eaz-tabela">
                <thead>
                  <tr>
                    <th>{T.ziemneKolWarunek}</th>
                    <th className="mvd-eaz-liczba">{T.ziemneKolWartosc}</th>
                    <th className="mvd-eaz-liczba">{T.ziemneKolNastawa}</th>
                    <th className="mvd-eaz-liczba">{T.ziemneKolZapas}</th>
                  </tr>
                </thead>
                <tbody>
                  {(['W_POLU', 'POZA_POLEM'] as const).flatMap((rola) => {
                    const warunki = wiersz.warunki_67n?.[rola] ?? [];
                    const rozstrzyga = wiersz.wykres_wskazowy?.wskazy.find((w) => w.rola === rola)?.rozstrzygajacy;
                    if (warunki.length === 0) return [];
                    return [
                      <tr key={`${rola}-naglowek`} className="mvd-eaz-podnaglowek">
                        <td colSpan={4}>{T.ziemneWarunekRola(rola)}</td>
                      </tr>,
                      ...warunki.map((w) => (
                        <tr
                          key={`${rola}-${w.klucz}`}
                          data-testid={`${testid}-warunek`}
                          data-rola={rola}
                          data-klucz={w.klucz}
                          data-spelniony={String(w.spelniony)}
                        >
                          <td>
                            <MathInline latex={w.warunek_latex} />
                            {rozstrzyga === w.klucz ? <span className="mvd-eaz-rozstrzyga">{T.ziemneRozstrzyga}</span> : null}
                          </td>
                          <td className="mvd-num mvd-eaz-liczba">
                            {formatWgJednostki(w.wartosc, w.jednostka)} {w.jednostka}
                          </td>
                          <td className="mvd-num mvd-eaz-liczba">
                            {formatWgJednostki(w.nastawa, w.jednostka)} {w.jednostka}
                          </td>
                          <td className="mvd-num mvd-eaz-liczba" data-spelnia={String(w.spelniony)}>
                            {formatWgJednostki(w.zapas, w.jednostka)} {w.jednostka}
                          </td>
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
            </section>
          ) : null}
          {wiersz.wzory.length > 0 ? (
            <section data-testid={`${testid}-wzory`}>
              <h6>{T.ziemneWzory}</h6>
              {wiersz.wzory.map((w) => (
                <div key={w.symbol_latex} className="mvd-eaz-wzor">
                  <MathRenderer latex={w.wzor_latex} block />
                </div>
              ))}
            </section>
          ) : null}
          {wymagania.length > 0 ? (
            <section data-testid={`${testid}-wymagania`}>
              <h6>{T.ziemneWymagane}</h6>
              <ul className="mvd-eaz-lista">
                {wymagania.map(([klucz, w]) => (
                  <li key={klucz} data-stan-zrodla={w.stan_zrodla} data-przyjete={String(w.przyjete)}>
                    <span className="mvd-num">
                      {w.symbol} ≥ {formatWgJednostki(w.wartosc, '1')}
                    </span>{' '}
                    — {w.zrodlo_pl} (<OpisWymagania przyjete={w.przyjete} stan={w.stan_zrodla} />).{' '}
                    <span className="mvd-eaz-przypis">{w.uzasadnienie_pl}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {wiersz.braki_pl.length > 0 ? (
            <section data-testid={`${testid}-braki`}>
              <h6>{T.ziemneBraki}</h6>
              <ul className="mvd-eaz-lista">
                {wiersz.braki_pl.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
      {karty.length > 0 ? (
        <section className="mvd-eaz-karty" data-testid={`${testid}-karty`}>
          <h6>{T.ziemneKryteria}</h6>
          {karty.map((k) => (
            <KartaWerdyktu key={k.kryterium_id} rekord={k} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function TabelaRodziny({
  rodzina,
  wiersze,
  wynik,
  onUzupelnij,
  testid,
}: {
  rodzina: RodzinaEaz;
  wiersze: readonly WierszRodziny[];
  wynik: WynikOcenyZiemnozwarciowej;
  onUzupelnij?: (cel: CelUzupelnienia) => void;
  testid: string;
}) {
  const [otwarte, setOtwarte] = useState<ReadonlySet<string>>(new Set());
  const liczbaKolumn = rodzina.kolumny.length + 5;
  const przelacz = (klucz: string) =>
    setOtwarte((o) => {
      const n = new Set(o);
      if (n.has(klucz)) n.delete(klucz);
      else n.add(klucz);
      return n;
    });
  return (
    <section className="mvd-eaz-rodzina" data-testid={`${testid}-rodzina`} data-rodzina={rodzina.id}>
      <h5>{rodzina.nazwa_pl}</h5>
      <div className="mvd-eaz-przewijanie">
        <table className="mvd-eaz-tabela">
          <thead>
            <tr>
              <th>{T.ziemneKolPole}</th>
              <th>{T.ziemneKolFunkcja}</th>
              <th>{T.ziemneKolGrupa}</th>
              {rodzina.kolumny.map((k) => (
                <th key={k.klucz} className="mvd-eaz-liczba" title={k.opis_pl} data-kolumna={k.klucz}>
                  {k.naglowek_pl}
                </th>
              ))}
              <th className="mvd-eaz-stan">{T.ziemneKolStan}</th>
              <th>
                <span className="mvd-sr-only">{T.ziemneSzczegoly}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {wiersze.map((w) => {
              const klucz = `${w.urzadzenie_ref}::${w.funkcja_ref}`;
              const otwarty = otwarte.has(klucz);
              const bezNastaw = w.braki.length > 0;
              return (
                <Fragment key={klucz}>
                  <tr
                    data-testid={`${testid}-wiersz`}
                    data-urzadzenie={w.urzadzenie_ref}
                    data-funkcja={w.funkcja_ref}
                    data-kod={w.kod}
                    data-status={w.stan}
                  >
                    <td title={w.sterownik_pl}>{w.pole_pl ?? w.sterownik_pl}</td>
                    <td title={w.etykieta_pl}>
                      <strong>{w.ansi}</strong> {w.oznaczenie_pl}
                    </td>
                    <td className="mvd-num">{w.grupa !== null ? T.ziemneGrupa(w.grupa) : '—'}</td>
                    {rodzina.kolumny.map((k, i) =>
                      // Pierwsza kolumna rodziny to nastawa — bez nastaw: „—” z akcją uzupełnienia.
                      i === 0 && bezNastaw && !w.wartosci[k.klucz] ? (
                        <td key={k.klucz} className="mvd-num mvd-eaz-liczba" data-testid={`${testid}-brak-nastawy`}>
                          —
                          {onUzupelnij ? (
                            <button
                              type="button"
                              className="mvd-eaz-akcja"
                              title={T.ziemneUzupelnijOpis(w.etykieta_pl)}
                              data-testid={`${testid}-uzupelnij`}
                              onClick={() => onUzupelnij({ urzadzenieRef: w.urzadzenie_ref, funkcjaRef: w.funkcja_ref })}
                            >
                              {T.ziemneUzupelnij}
                            </button>
                          ) : null}
                        </td>
                      ) : (
                        <Komorka key={k.klucz} komorka={w.wartosci[k.klucz]} testid={`${testid}-${k.klucz}`} />
                      ),
                    )}
                    <td className="mvd-eaz-stan">
                      <ZnakWerdyktu etykieta={w.etykieta} przyczyna={w.przyczyna_pl} status={w.stan} testid={`${testid}-stan`} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="mvd-eaz-akcja"
                        aria-expanded={otwarty}
                        title={T.ziemneSzczegolyOpis}
                        data-testid={`${testid}-szczegoly-przelacz`}
                        onClick={() => przelacz(klucz)}
                      >
                        {otwarty ? T.ziemneSzczegolyZwin : T.ziemneSzczegoly}
                      </button>
                    </td>
                  </tr>
                  {otwarty ? (
                    <tr className="mvd-eaz-wiersz-szczegolow">
                      <td colSpan={liczbaKolumn}>
                        <Szczegoly wiersz={w} wynik={wynik} testid={testid} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TabelaOcenyZiemnozwarciowej({
  wynik,
  urzadzenieRef,
  onUzupelnij,
  testid = 'mvd-ocena-ziemnozwarciowa',
  bezNaglowka = false,
}: {
  wynik: WynikOcenyZiemnozwarciowej | null | undefined;
  /** Zawężenie do jednego sterownika (karta nastaw); brak — wszystkie wiersze i uziemienia. */
  urzadzenieRef?: string;
  /** Otwarcie edytora nastaw wskazanej funkcji (natywny klik w „Uzupełnij”). */
  onUzupelnij?: (cel: CelUzupelnienia) => void;
  testid?: string;
  bezNaglowka?: boolean;
}) {
  const wiersze = wierszeRodzin(wynik, urzadzenieRef);
  const uziemienia = urzadzenieRef === undefined ? (wynik?.wiersze_uziemien ?? []) : [];
  const bezNastaw = wiersze.filter((w) => w.braki.length > 0);
  const polaBezNastaw = new Set(bezNastaw.map((w) => w.urzadzenie_ref)).size;
  const rodziny = (wynik?.rodziny ?? []).filter((r) => wiersze.some((w) => w.rodzina === r.id));
  if (!wynik || (wiersze.length === 0 && uziemienia.length === 0)) {
    return (
      <div className="mvd-eaz" data-testid={testid}>
        {bezNaglowka ? null : <h4>{T.ziemneTytul}</h4>}
        <p data-testid={`${testid}-brak`}>{T.ziemneBrak}</p>
      </div>
    );
  }
  return (
    <div className="mvd-eaz" data-testid={testid}>
      {bezNaglowka ? null : <h4>{T.ziemneTytul}</h4>}
      {urzadzenieRef === undefined ? <PasekSieci siec={wynik.siec ?? []} testid={testid} /> : null}
      {wynik.przypadek && wiersze.length > 0 ? <PasekPrzypadku przypadek={wynik.przypadek} testid={testid} /> : null}
      {bezNastaw.length > 0 ? (
        <p className="mvd-eaz-braki" data-testid={`${testid}-braki-zbiorcze`}>
          {T.ziemneBezNastaw(bezNastaw.length, polaBezNastaw)}
        </p>
      ) : null}
      {rodziny.map((r) => (
        <TabelaRodziny
          key={r.id}
          rodzina={r}
          wiersze={wiersze.filter((w) => w.rodzina === r.id)}
          wynik={wynik}
          onUzupelnij={onUzupelnij}
          testid={testid}
        />
      ))}
      {uziemienia.length > 0 ? (
        <TabelaUziemienStacji
          wiersze={uziemienia}
          przypisy={wynik.przypisy_uziemien ?? {}}
          wynik={wynik}
          testid={`${testid}-uziemienia`}
        />
      ) : null}
    </div>
  );
}
