/*
 * Przeglądarka przebiegów biegu dynamiki (karta AB-P1 §0.8): oś zdarzeń ze skutkami
 * topologicznymi, wielkości charakterystyczne z jednostkami, wybór kanałów pogrupowanych
 * po elemencie (gałąź z nazwanym zaciskiem od/do z nazwą szyny), wykresy na wspólnej osi
 * czasu (osobny wykres na jednostkę) i sprzężenie ze schematem w obie strony:
 *  - element → schemat: „Pokaż na schemacie" zaznacza element i centruje schemat,
 *  - schemat → kanały: element zaznaczony na schemacie jest podświetlony na liście,
 *    a jego kanały można dołożyć jednym kliknięciem.
 * Próbki pobierane na żądanie wyłącznie dla wybranych kanałów. Zero fizyki.
 */

import { useEffect, useMemo, useState } from 'react';

import { fetchPrzebiegiDynamiki } from './api';
import {
  chwileZdarzen,
  domyslneKanaly,
  fmtLiczba,
  grupujKanaly,
  kanalyElementu,
  nazwaElementu,
  podzialNaWykresy,
  symbolJednostki,
  wierszeWykresu,
  type GrupaKanalu,
  type PrzebiegiDynamiki,
  type WynikDynamiki,
} from './model';
import { WZORZEC_STRINGS } from '../wzorzec/strings';
import { DYNAMIKA_STRINGS as T } from './strings';
import { WykresPrzebiegow } from './WykresPrzebiegow';

const TEKSTY_KANALOW = {
  brakNazwy: T.brakNazwy,
  zaciskOd: T.zaciskOd,
  zaciskDo: T.zaciskDo,
  miejsceZwarcia: T.miejsceZwarcia,
  rodzajMiejscaZwarcia: T.rodzajMiejscaZwarcia,
} as const;

const NAGLOWKI_GRUP: Record<GrupaKanalu, string> = {
  szyna: T.grupaSzyna,
  galaz: T.grupaGalaz,
  miejsce_zwarcia: T.grupaMiejsce,
  urzadzenie: T.grupaUrzadzenie,
};

export interface PrzegladarkaPrzebiegowProps {
  readonly wynik: WynikDynamiki;
  /** Element zaznaczony na schemacie (sprzężenie schemat → kanały). */
  readonly zaznaczonyRef: string | null;
  readonly onPokazNaSchemacie: (ref: string) => void;
}

type StanProbek =
  | { readonly stan: 'brak' }
  | { readonly stan: 'laduje' }
  | { readonly stan: 'blad'; readonly komunikat: string }
  | { readonly stan: 'gotowe'; readonly przebiegi: PrzebiegiDynamiki };

function OsZdarzen({
  wynik,
  onPokazNaSchemacie,
}: {
  wynik: WynikDynamiki;
  onPokazNaSchemacie: (ref: string) => void;
}) {
  const opis = wynik.opis_wyniku;
  const nazwa = (ref: string) => nazwaElementu(opis, ref, T.brakNazwy);
  return (
    <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-os-zdarzen">
      <h4>{T.zdarzeniaWykonaneTytul}</h4>
      <table className="mvd-dynamika-tabela">
        <thead>
          <tr>
            <th>
              {T.kolChwila} [{T.jednS}]
            </th>
            <th>{T.kolZdarzenie}</th>
            <th>{T.kolElement}</th>
            <th>{T.kolPrzyczyna}</th>
            <th>{T.kolSkutki}</th>
          </tr>
        </thead>
        <tbody>
          {wynik.zdarzenia_wykonane.map((z, i) => {
            const skutki: string[] = [];
            if (z.obszary_odciete.length > 0)
              skutki.push(`${T.skutekOdciete}: ${z.obszary_odciete.map(nazwa).join(', ')}`);
            if (z.obszary_zasilone_ponownie.length > 0)
              skutki.push(
                `${T.skutekZasilone}: ${z.obszary_zasilone_ponownie.map(nazwa).join(', ')}`,
              );
            if (z.odbiory_odciete.length > 0)
              skutki.push(
                `${T.skutekOdbiory}: ${z.odbiory_odciete
                  .map(
                    (o) =>
                      `${nazwa(o.ref)} (P = ${fmtLiczba(o.p_pu)} pu, Q = ${fmtLiczba(o.q_pu)} pu)`,
                  )
                  .join(', ')}`,
              );
            const opisZdarzenia = opis.zdarzenia[i];
            z.przypisania.forEach((p, j) => {
              const opisP = opisZdarzenia?.przypisania[j];
              const jednostka = opisP?.jednostka ? ` ${symbolJednostki(opisP.jednostka)}` : '';
              skutki.push(
                `${T.skutekPrzypisanie}: ${opisP?.stan_pl ?? p.adres} ${
                  opisP ? `„${nazwa(opisP.element_ref)}”` : ''
                }: ${fmtLiczba(p.przed, 6)} → ${fmtLiczba(p.po, 6)}${jednostka}`,
              );
            });
            return (
              <tr key={i} data-testid={`mvd-dynamika-zdarzenie-wykonane-${i}`}>
                <td className="mvd-num">{fmtLiczba(z.t_wykonany_s, 6)}</td>
                <td>{opisZdarzenia?.rodzaj_pl ?? WZORZEC_STRINGS.wartoscSpozaSlownika}</td>
                <td>
                  {z.ref ? (
                    <button
                      type="button"
                      className="mvd-dynamika-link"
                      title={T.pokazNaSchemacie}
                      onClick={() => onPokazNaSchemacie(z.ref as string)}
                    >
                      {nazwa(z.ref)}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{opisZdarzenia?.przyczyna_pl ?? WZORZEC_STRINGS.wartoscSpozaSlownika}</td>
                <td>{skutki.length > 0 ? skutki.join('; ') : T.skutkiBrak}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Przekroczenia({
  wynik,
  onPokazNaSchemacie,
}: {
  wynik: WynikDynamiki;
  onPokazNaSchemacie: (ref: string) => void;
}) {
  const opis = wynik.opis_wyniku;
  return (
    <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-przekroczenia">
      <h4>{T.przekroczeniaTytul}</h4>
      <p className="mvd-dynamika-opis">{T.przekroczeniaOpis}</p>
      {wynik.przekroczenia.length === 0 ? (
        <p className="mvd-dynamika-opis" data-testid="mvd-dynamika-przekroczenia-brak">
          {T.przekroczeniaBrak}
        </p>
      ) : (
        <table className="mvd-dynamika-tabela">
          <thead>
            <tr>
              <th>
                {T.kolChwila} [{T.jednS}]
              </th>
              <th>{T.kolDetektor}</th>
              <th>{T.kolWielkosc}</th>
              <th>{T.kolElement}</th>
              <th>{T.kolProg}</th>
              <th>{T.kolKierunek}</th>
            </tr>
          </thead>
          <tbody>
            {wynik.przekroczenia.map((p, i) => {
              const opisP = opis.przekroczenia[i];
              const ref = opisP?.element_ref ?? null;
              const zacisk =
                opisP?.zacisk === 'od' ? T.zaciskOd : opisP?.zacisk === 'do' ? T.zaciskDo : null;
              return (
                <tr key={`${p.dozor}-${i}`} data-testid={`mvd-dynamika-przekroczenie-${i}`}>
                  <td className="mvd-num">{fmtLiczba(p.t_s, 6)}</td>
                  <td>{p.dozor}</td>
                  <td>
                    {opisP?.wielkosc_pl ?? p.wielkosc}
                    {zacisk ? ` (${zacisk})` : ''}
                  </td>
                  <td>
                    {ref ? (
                      <button
                        type="button"
                        className="mvd-dynamika-link"
                        title={T.pokazNaSchemacie}
                        onClick={() => onPokazNaSchemacie(ref)}
                      >
                        {nazwaElementu(opis, ref, T.brakNazwy)}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="mvd-num">
                    {fmtLiczba(p.prog, 6)}
                    {opisP?.jednostka ? ` ${symbolJednostki(opisP.jednostka)}` : ''}
                  </td>
                  <td>{opisP?.kierunek_pl ?? p.kierunek}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Metryki({ wynik }: { wynik: WynikDynamiki }) {
  const opis = wynik.opis_wyniku;
  return (
    <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-metryki">
      <h4>{T.metrykiTytul}</h4>
      <table className="mvd-dynamika-tabela">
        <thead>
          <tr>
            <th>{T.kolWielkosc}</th>
            <th>{T.kolElement}</th>
            <th>{T.kolWartosc}</th>
            <th>{T.kolJednostka}</th>
          </tr>
        </thead>
        <tbody>
          {wynik.metryki.map((m, i) => (
            <tr key={m.klucz} data-testid={`mvd-dynamika-metryka-${i}`}>
              <td>{opis.metryki[i]?.opis_pl ?? WZORZEC_STRINGS.wartoscSpozaSlownika}</td>
              <td>{m.element_ref ? nazwaElementu(opis, m.element_ref, T.brakNazwy) : '—'}</td>
              <td className="mvd-num">{fmtLiczba(m.wartosc, 6)}</td>
              <td>{symbolJednostki(m.jednostka)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {opis.baza_mocy_mva !== null && (
        <p className="mvd-dynamika-opis">
          {T.baza}: <span className="mvd-num">{fmtLiczba(opis.baza_mocy_mva, 6)}</span> MVA
        </p>
      )}
    </section>
  );
}

export function PrzegladarkaPrzebiegow({
  wynik,
  zaznaczonyRef,
  onPokazNaSchemacie,
}: PrzegladarkaPrzebiegowProps) {
  const opis = wynik.opis_wyniku;
  const grupy = useMemo(() => grupujKanaly(opis, TEKSTY_KANALOW), [opis]);
  const etykiety = useMemo(
    () => new Map(grupy.flatMap((g) => g.kanaly.map((k) => [k.klucz, `${g.nazwa} — ${k.etykieta}`]))),
    [grupy],
  );
  const [wybrane, setWybrane] = useState<string[]>(() => domyslneKanaly(opis));
  const [filtr, setFiltr] = useState('');
  const [probki, setProbki] = useState<StanProbek>({ stan: 'brak' });

  const kluczWyboru = [...wybrane].sort().join(',');
  useEffect(() => {
    if (wybrane.length === 0) {
      setProbki({ stan: 'brak' });
      return;
    }
    let aktywne = true;
    setProbki({ stan: 'laduje' });
    fetchPrzebiegiDynamiki(wynik.run_id, [...wybrane].sort())
      .then((przebiegi) => {
        if (aktywne) setProbki({ stan: 'gotowe', przebiegi });
      })
      .catch((blad: unknown) => {
        if (aktywne)
          setProbki({ stan: 'blad', komunikat: blad instanceof Error ? blad.message : String(blad) });
      });
    return () => {
      aktywne = false;
    };
    // `kluczWyboru` niesie zbiór wybranych kanałów (kolejność bez znaczenia).
  }, [wynik.run_id, kluczWyboru]);

  const przelacz = (klucz: string) =>
    setWybrane((w) => (w.includes(klucz) ? w.filter((k) => k !== klucz) : [...w, klucz]));

  const kanalyZaznaczonego = zaznaczonyRef ? kanalyElementu(opis, zaznaczonyRef) : [];
  const fraza = filtr.trim().toLocaleLowerCase('pl');
  const chwile = chwileZdarzen(wynik.zdarzenia_wykonane);

  return (
    <div className="mvd-dynamika-przegladarka" data-testid="mvd-dynamika-przegladarka">
      <OsZdarzen wynik={wynik} onPokazNaSchemacie={onPokazNaSchemacie} />
      <Przekroczenia wynik={wynik} onPokazNaSchemacie={onPokazNaSchemacie} />
      <Metryki wynik={wynik} />

      <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-przebiegi">
        <h4>{T.przebiegiTytul}</h4>
        {zaznaczonyRef && (
          <div className="mvd-dynamika-zaznaczony" data-testid="mvd-dynamika-zaznaczony">
            {T.kanalyZaznaczonego}: <strong>{nazwaElementu(opis, zaznaczonyRef, T.brakNazwy)}</strong>
            {kanalyZaznaczonego.length > 0 ? (
              <button
                type="button"
                className="mvd-dynamika-akcja-drugorzedna"
                data-testid="mvd-dynamika-zaznaczony-dodaj"
                onClick={() =>
                  setWybrane((w) => [...w, ...kanalyZaznaczonego.filter((k) => !w.includes(k))])
                }
              >
                {T.kanalyZaznaczonegoDodaj}
              </button>
            ) : (
              <span className="mvd-dynamika-powod"> {T.kanalyZaznaczonegoBrak}</span>
            )}
          </div>
        )}
        <div className="mvd-dynamika-uklad-przebiegow">
          <aside className="mvd-dynamika-kanaly" data-testid="mvd-dynamika-kanaly">
            <div className="mvd-dynamika-kanaly-naglowek">
              <strong>{T.kanalyTytul}</strong>
              <span className="mvd-num">
                {wybrane.length} {T.kanalyWybrane}
              </span>
              <button
                type="button"
                className="mvd-dynamika-akcja-drugorzedna"
                data-testid="mvd-dynamika-kanaly-wyczysc"
                onClick={() => setWybrane([])}
              >
                {T.kanalyWyczysc}
              </button>
            </div>
            <input
              type="search"
              aria-label={T.kanalyFiltr}
              placeholder={T.kanalyFiltr}
              data-testid="mvd-dynamika-kanaly-filtr"
              value={filtr}
              onChange={(e) => setFiltr(e.target.value)}
            />
            {(['szyna', 'galaz', 'miejsce_zwarcia', 'urzadzenie'] as const).map((rodzajGrupy) => {
              const grupyRodzaju = grupy.filter((g) => g.grupa === rodzajGrupy);
              if (grupyRodzaju.length === 0) return null;
              return (
                <div key={rodzajGrupy} className="mvd-dynamika-kanaly-grupa">
                  <div className="mvd-dynamika-kanaly-grupa-tytul">{NAGLOWKI_GRUP[rodzajGrupy]}</div>
                  {grupyRodzaju.map((g) => {
                    const kanaly = fraza
                      ? g.kanaly.filter((k) =>
                          `${g.nazwa} ${k.etykieta}`.toLocaleLowerCase('pl').includes(fraza),
                        )
                      : g.kanaly;
                    if (kanaly.length === 0) return null;
                    return (
                      <details
                        key={g.klucz}
                        className="mvd-dynamika-element"
                        data-testid={`mvd-dynamika-element-${g.grupa}-${g.elementRef ?? g.klucz}`}
                        data-zaznaczony={g.elementRef !== null && g.elementRef === zaznaczonyRef ? 'tak' : undefined}
                        open={
                          Boolean(fraza) ||
                          (g.elementRef !== null && g.elementRef === zaznaczonyRef) ||
                          g.kanaly.some((k) => wybrane.includes(k.klucz))
                        }
                      >
                        <summary>
                          <span>{g.nazwa}</span>
                          <span className="mvd-dynamika-rodzaj">{g.rodzaj}</span>
                          {g.elementRef && (
                            <button
                              type="button"
                              className="mvd-dynamika-link"
                              data-testid={`mvd-dynamika-element-${g.grupa}-${g.elementRef}-schemat`}
                              onClick={(e) => {
                                e.preventDefault();
                                onPokazNaSchemacie(g.elementRef as string);
                              }}
                            >
                              {T.pokazNaSchemacie}
                            </button>
                          )}
                        </summary>
                        {kanaly.map((k) => (
                          <label key={k.klucz} className="mvd-dynamika-kanal">
                            <input
                              type="checkbox"
                              data-testid={`mvd-dynamika-kanal-${k.klucz}`}
                              checked={wybrane.includes(k.klucz)}
                              onChange={() => przelacz(k.klucz)}
                            />
                            <span>{k.etykieta}</span>
                            <span className="mvd-dynamika-jednostka">[{symbolJednostki(k.jednostka)}]</span>
                          </label>
                        ))}
                      </details>
                    );
                  })}
                </div>
              );
            })}
          </aside>
          <div className="mvd-dynamika-wykresy" data-testid="mvd-dynamika-wykresy">
            {wybrane.length === 0 && <p className="mvd-dynamika-opis">{T.przebiegiBrakWyboru}</p>}
            {probki.stan === 'laduje' && <p className="mvd-dynamika-opis">{T.przebiegiLadowanie}</p>}
            {probki.stan === 'blad' && (
              <div className="mvd-dynamika-blad" role="alert">
                {T.przebiegiBlad} {probki.komunikat}
              </div>
            )}
            {probki.stan === 'gotowe' &&
              podzialNaWykresy(opis, wybrane).map(({ jednostka, klucze }) => (
                <WykresPrzebiegow
                  key={jednostka}
                  jednostka={jednostka}
                  serie={klucze.map((klucz) => ({ klucz, etykieta: etykiety.get(klucz) ?? klucz }))}
                  wiersze={wierszeWykresu(probki.przebiegi, klucze)}
                  chwileZdarzen={chwile}
                />
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}
