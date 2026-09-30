/*
 * Edytor scenariusza zdarzeń i nastaw solvera (karta AB-P1 §0.6) — formularz GENEROWANY
 * z opisu kontraktu backendu (`GET /api/dynamika/opis-scenariusza`): rodzaje zdarzeń, ich
 * pola, typy, jednostki, zakresy, wartości wyboru i role referencji. Nowy rodzaj zdarzenia
 * dodany do kontraktu pojawia się tu bez zmiany kodu interfejsu; rodzaj i wartość, których
 * rdzeń nie wykonuje, są widoczne z adnotacją (bieg odmówi nazwanym kodem).
 *
 * Referencje wybiera się po NAZWIE elementu z bieżącego modelu (kolekcje wskazane przez
 * kontrakt). Zapis idzie do magazynu scenariuszy nazwanych projektu (nowa rewizja przy
 * ponownym zapisie). Żadnej wartości domyślnej: pole puste jest puste.
 */

import { useMemo, useState } from 'react';

import {
  KLUCZ_WARIANTU,
  WARTOSC_NIE,
  WARTOSC_TAK,
  noweZdarzenie,
  nowyElementListy,
  nowyWariant,
  polaScenariuszaDoFormularza,
  pustyFormularz,
  zakresPola,
  zbudujHarmonogram,
  zdarzenieDoFormularza,
  type BladFormularza,
  type OpisPola,
  type OpisScenariusza,
  type ScenariuszDynamiki,
  type WartoscFormularza,
  type ZdarzenieFormularza,
} from './model';
import { DYNAMIKA_STRINGS as T } from './strings';

/** Elementy modelu do wyboru referencji: kolekcja -> [{ref, nazwa}]. */
export type ElementyModelu = Readonly<Record<string, readonly { ref: string; nazwa: string }[]>>;

export const TEKSTY_WALIDACJI = {
  wymagane: T.wymagane,
  liczba: T.liczba,
  calkowita: T.calkowita,
  brakZdarzen: T.brakZdarzen,
} as const;

interface PoleProps {
  readonly pole: OpisPola;
  readonly wartosc: WartoscFormularza | undefined;
  readonly sciezka: string;
  readonly bledy: ReadonlyMap<string, string>;
  readonly elementy: ElementyModelu;
  readonly onZmiana: (wartosc: WartoscFormularza) => void;
}

/** Jedno pole formularza wg typu z kontraktu (rekurencyjnie dla pól złożonych). */
export function PoleFormularza({ pole, wartosc, sciezka, bledy, elementy, onZmiana }: PoleProps) {
  const blad = bledy.get(sciezka);
  const id = `mvd-dynamika-pole-${sciezka.replace(/\./g, '-')}`;
  const obiekt = (
    wartosc && typeof wartosc === 'object' && !Array.isArray(wartosc) ? wartosc : {}
  ) as { [p: string]: WartoscFormularza };
  const podpola = (pola: readonly OpisPola[], baza: string, zmiana: (v: typeof obiekt) => void) =>
    pola.map((podpole) => (
      <PoleFormularza
        key={podpole.nazwa}
        pole={podpole}
        wartosc={obiekt[podpole.nazwa]}
        sciezka={`${baza}.${podpole.nazwa}`}
        bledy={bledy}
        elementy={elementy}
        onZmiana={(v) => zmiana({ ...obiekt, [podpole.nazwa]: v })}
      />
    ));
  if (pole.typ === 'obiekt') {
    return (
      <fieldset className="mvd-dynamika-obiekt" data-testid={id}>
        <legend>{pole.etykieta_pl}</legend>
        {podpola(pole.pola ?? [], sciezka, onZmiana)}
      </fieldset>
    );
  }
  if (pole.typ === 'lista') {
    const lista = Array.isArray(wartosc) ? wartosc : [];
    return (
      <fieldset className="mvd-dynamika-obiekt mvd-dynamika-lista" data-testid={id}>
        <legend>{pole.etykieta_pl}</legend>
        {lista.length === 0 && <p className="mvd-dynamika-opis">{T.listaPusta}</p>}
        {lista.map((element, i) => (
          <div key={i} className="mvd-dynamika-element-listy" data-testid={`${id}-${i}`}>
            <div className="mvd-dynamika-wiersz-pol">
              {(pole.pola ?? []).map((podpole) => {
                const wartosciElementu = (
                  element && typeof element === 'object' && !Array.isArray(element) ? element : {}
                ) as { [p: string]: WartoscFormularza };
                return (
                  <PoleFormularza
                    key={podpole.nazwa}
                    pole={podpole}
                    wartosc={wartosciElementu[podpole.nazwa]}
                    sciezka={`${sciezka}.${i}.${podpole.nazwa}`}
                    bledy={bledy}
                    elementy={elementy}
                    onZmiana={(v) =>
                      onZmiana(
                        lista.map((e, j) =>
                          j === i ? { ...wartosciElementu, [podpole.nazwa]: v } : e,
                        ),
                      )
                    }
                  />
                );
              })}
            </div>
            <button
              type="button"
              className="mvd-dynamika-akcja-drugorzedna"
              data-testid={`${id}-${i}-usun`}
              onClick={() => onZmiana(lista.filter((_, j) => j !== i))}
            >
              {T.usunElementListy}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="mvd-dynamika-akcja-drugorzedna"
          data-testid={`${id}-dodaj`}
          onClick={() => onZmiana([...lista, nowyElementListy(pole)])}
        >
          {T.dodajElementListy}
        </button>
      </fieldset>
    );
  }
  if (pole.typ === 'unia') {
    const rodzaj = typeof obiekt[KLUCZ_WARIANTU] === 'string' ? (obiekt[KLUCZ_WARIANTU] as string) : '';
    const wariant = (pole.warianty ?? []).find((w) => w.rodzaj === rodzaj);
    return (
      <fieldset className="mvd-dynamika-obiekt" data-testid={id} data-blad={blad ? 'tak' : undefined}>
        <legend>
          {pole.etykieta_pl}
          {pole.wymagane && !pole.dopuszcza_brak ? ' *' : ''}
        </legend>
        <select
          aria-label={pole.etykieta_pl}
          data-testid={`${id}-wariant`}
          value={rodzaj}
          onChange={(e) => onZmiana(nowyWariant(pole, e.target.value))}
        >
          <option value="">{pole.dopuszcza_brak ? T.brakWartosci : T.wybierzWariant}</option>
          {(pole.warianty ?? []).map((w) => (
            <option key={w.rodzaj} value={w.rodzaj}>
              {w.etykieta_pl}
            </option>
          ))}
        </select>
        {wariant && podpola(wariant.pola, sciezka, onZmiana)}
        {blad && (
          <span className="mvd-dynamika-blad-pola" role="alert">
            {blad}
          </span>
        )}
      </fieldset>
    );
  }
  const tekst = typeof wartosc === 'string' ? wartosc : '';
  const zakres = zakresPola(pole);
  const etykieta = (
    <span className="mvd-dynamika-pole-etykieta">
      {pole.etykieta_pl}
      {pole.jednostka ? ` [${pole.jednostka}]` : ''}
      {pole.wymagane && !pole.dopuszcza_brak ? ' *' : ''}
    </span>
  );
  let kontrolka;
  if (pole.typ === 'logiczna') {
    kontrolka = (
      <select id={id} data-testid={id} value={tekst} onChange={(e) => onZmiana(e.target.value)}>
        <option value="">{pole.dopuszcza_brak ? T.brakWartosci : '…'}</option>
        <option value={WARTOSC_TAK}>{T.wartoscTak}</option>
        <option value={WARTOSC_NIE}>{T.wartoscNie}</option>
      </select>
    );
  } else if (pole.typ === 'wybor') {
    kontrolka = (
      <select id={id} data-testid={id} value={tekst} onChange={(e) => onZmiana(e.target.value)}>
        <option value="">{pole.dopuszcza_brak ? T.brakWartosci : '…'}</option>
        {(pole.wartosci ?? []).map((w) => (
          <option key={w.wartosc} value={w.wartosc}>
            {w.etykieta_pl}
            {w.wykonywana_przez_rdzen === false ? ` ${T.wartoscNiewykonywana}` : ''}
          </option>
        ))}
      </select>
    );
  } else if (pole.typ === 'referencja') {
    const kolekcje = pole.kolekcje ?? [];
    kontrolka = (
      <select id={id} data-testid={id} value={tekst} onChange={(e) => onZmiana(e.target.value)}>
        <option value="">{pole.dopuszcza_brak ? T.brakWartosci : '…'}</option>
        {kolekcje.map((k) => (
          <optgroup key={k.kolekcja} label={k.etykieta_pl}>
            {(elementy[k.kolekcja] ?? []).map((el) => (
              <option key={el.ref} value={el.ref}>
                {el.nazwa}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  } else {
    kontrolka = (
      <input
        id={id}
        data-testid={id}
        type="text"
        inputMode={pole.typ === 'tekst' ? 'text' : 'decimal'}
        placeholder={pole.dopuszcza_brak ? T.brakWartosciPole : undefined}
        value={tekst}
        onChange={(e) => onZmiana(e.target.value)}
      />
    );
  }
  return (
    <label className="mvd-dynamika-pole" htmlFor={id} data-blad={blad ? 'tak' : undefined}>
      {etykieta}
      {kontrolka}
      {zakres && (
        <span className="mvd-dynamika-zakres">
          {T.zakres} {zakres}
        </span>
      )}
      {blad && (
        <span className="mvd-dynamika-blad-pola" role="alert">
          {blad}
        </span>
      )}
    </label>
  );
}

function mapaBledow(bledy: readonly BladFormularza[]): Map<string, string> {
  return new Map(bledy.map((b) => [b.sciezka, b.komunikat]));
}

export interface EdytorScenariuszaProps {
  readonly opis: OpisScenariusza;
  readonly scenariusze: readonly ScenariuszDynamiki[];
  readonly wybranyId: string | null;
  readonly elementy: ElementyModelu;
  readonly onWybierz: (scenarioId: string | null) => void;
  /** Zapis scenariusza (nowy albo nowa rewizja) — rzuca błąd z komunikatem backendu. */
  readonly onZapisz: (zadanie: {
    scenario_id: string | null;
    name: string;
    dynamika: NonNullable<ReturnType<typeof zbudujHarmonogram>['harmonogram']>;
  }) => Promise<void>;
}

function stanPoczatkowy(opis: OpisScenariusza, scenariusz: ScenariuszDynamiki | null) {
  return {
    nazwa: scenariusz?.name ?? '',
    pola: scenariusz
      ? polaScenariuszaDoFormularza(opis, scenariusz.dynamika)
      : pustyFormularz(opis.pola_scenariusza),
    zdarzenia: scenariusz
      ? scenariusz.dynamika.zdarzenia.map((z) => zdarzenieDoFormularza(opis, z))
      : [],
  };
}

export function EdytorScenariusza(props: EdytorScenariuszaProps) {
  const wybrany = props.scenariusze.find((s) => s.scenario_id === props.wybranyId) ?? null;
  // Zmiana wybranego scenariusza (albo jego rewizji) ładuje formularz od nowa.
  return (
    <EdytorScenariuszaFormularz
      key={`${wybrany?.scenario_id ?? 'nowy'}|${wybrany?.revision ?? 0}`}
      {...props}
      wybrany={wybrany}
    />
  );
}

function EdytorScenariuszaFormularz({
  opis,
  scenariusze,
  wybrany,
  elementy,
  onWybierz,
  onZapisz,
}: EdytorScenariuszaProps & { wybrany: ScenariuszDynamiki | null }) {
  const poczatek = useMemo(() => stanPoczatkowy(opis, wybrany), [opis, wybrany]);
  const [nazwa, setNazwa] = useState(poczatek.nazwa);
  const [pola, setPola] = useState(poczatek.pola);
  const [zdarzenia, setZdarzenia] = useState<ZdarzenieFormularza[]>(poczatek.zdarzenia);
  const [rodzajDoDodania, setRodzajDoDodania] = useState('');
  const [bledy, setBledy] = useState<BladFormularza[]>([]);
  const [bladZapisu, setBladZapisu] = useState<string | null>(null);
  const [zapisuje, setZapisuje] = useState(false);
  const mapa = mapaBledow(bledy);

  const zapisz = async () => {
    const { harmonogram, bledy: nowe } = zbudujHarmonogram(opis, pola, zdarzenia, TEKSTY_WALIDACJI);
    const wszystkie = nazwa.trim() ? nowe : [...nowe, { sciezka: 'nazwa', komunikat: T.brakNazwyScenariusza }];
    setBledy(wszystkie);
    setBladZapisu(null);
    if (!harmonogram || wszystkie.length > 0) return;
    setZapisuje(true);
    try {
      await onZapisz({ scenario_id: wybrany?.scenario_id ?? null, name: nazwa.trim(), dynamika: harmonogram });
    } catch (blad) {
      setBladZapisu(blad instanceof Error ? blad.message : String(blad));
    } finally {
      setZapisuje(false);
    }
  };

  const rodzaj = (r: string) => opis.rodzaje_zdarzen.find((x) => x.rodzaj === r);

  return (
    <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-scenariusz">
      <h4>{T.scenariuszTytul}</h4>
      <p className="mvd-dynamika-opis">{T.scenariuszOpis}</p>
      <div className="mvd-dynamika-wiersz-pol">
        <label className="mvd-dynamika-pole">
          <span className="mvd-dynamika-pole-etykieta">{T.scenariuszZapisany}</span>
          <select
            data-testid="mvd-dynamika-scenariusz-wybor"
            value={wybrany?.scenario_id ?? ''}
            onChange={(e) => onWybierz(e.target.value || null)}
          >
            <option value="">{T.scenariuszNowy}</option>
            {scenariusze.map((s) => (
              <option key={s.scenario_id} value={s.scenario_id}>
                {s.name} ({T.scenariuszRewizja} {s.revision})
              </option>
            ))}
          </select>
        </label>
        <label className="mvd-dynamika-pole" data-blad={mapa.get('nazwa') ? 'tak' : undefined}>
          <span className="mvd-dynamika-pole-etykieta">{T.scenariuszNazwa} *</span>
          <input
            type="text"
            data-testid="mvd-dynamika-scenariusz-nazwa"
            value={nazwa}
            onChange={(e) => setNazwa(e.target.value)}
          />
          {mapa.get('nazwa') && (
            <span className="mvd-dynamika-blad-pola" role="alert">
              {mapa.get('nazwa')}
            </span>
          )}
        </label>
        {opis.pola_scenariusza.map((pole) => (
          <PoleFormularza
            key={pole.nazwa}
            pole={pole}
            wartosc={pola[pole.nazwa]}
            sciezka={pole.nazwa}
            bledy={mapa}
            elementy={elementy}
            onZmiana={(v) => setPola((p) => ({ ...p, [pole.nazwa]: v }))}
          />
        ))}
      </div>

      <h5>{T.zdarzeniaTytul}</h5>
      {zdarzenia.length === 0 && (
        <p className="mvd-dynamika-opis" data-testid="mvd-dynamika-zdarzenia-puste">
          {mapa.get('zdarzenia') ?? T.zdarzeniaBrak}
        </p>
      )}
      <ol className="mvd-dynamika-zdarzenia">
        {zdarzenia.map((zdarzenie, i) => {
          const opisRodzaju = rodzaj(zdarzenie.rodzaj);
          return (
            <li key={i} data-testid={`mvd-dynamika-zdarzenie-${i}`} data-rodzaj={zdarzenie.rodzaj}>
              <div className="mvd-dynamika-zdarzenie-naglowek">
                <strong>{opisRodzaju?.etykieta_pl ?? zdarzenie.rodzaj}</strong>
                {opisRodzaju && !opisRodzaju.wykonywany_przez_rdzen && (
                  <span className="mvd-dynamika-powod"> {T.niewykonywanyPrzezRdzen}</span>
                )}
                <button
                  type="button"
                  className="mvd-dynamika-akcja-drugorzedna"
                  data-testid={`mvd-dynamika-zdarzenie-${i}-usun`}
                  onClick={() => setZdarzenia((z) => z.filter((_, j) => j !== i))}
                >
                  {T.usunZdarzenie}
                </button>
              </div>
              <div className="mvd-dynamika-wiersz-pol">
                {(opisRodzaju?.pola ?? []).map((pole) => (
                  <PoleFormularza
                    key={pole.nazwa}
                    pole={pole}
                    wartosc={zdarzenie.wartosci[pole.nazwa]}
                    sciezka={`zdarzenia.${i}.${pole.nazwa}`}
                    bledy={mapa}
                    elementy={elementy}
                    onZmiana={(v) =>
                      setZdarzenia((lista) =>
                        lista.map((z, j) =>
                          j === i ? { ...z, wartosci: { ...z.wartosci, [pole.nazwa]: v } } : z,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mvd-dynamika-wiersz-akcji">
        <select
          aria-label={T.wybierzRodzaj}
          data-testid="mvd-dynamika-rodzaj-zdarzenia"
          value={rodzajDoDodania}
          onChange={(e) => setRodzajDoDodania(e.target.value)}
        >
          <option value="">{T.wybierzRodzaj}</option>
          {opis.rodzaje_zdarzen.map((r) => (
            <option key={r.rodzaj} value={r.rodzaj}>
              {r.etykieta_pl}
              {r.wykonywany_przez_rdzen ? '' : ` ${T.niewykonywanyPrzezRdzen}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="mvd-dynamika-akcja-drugorzedna"
          data-testid="mvd-dynamika-dodaj-zdarzenie"
          disabled={rodzajDoDodania === ''}
          onClick={() => {
            const r = rodzaj(rodzajDoDodania);
            if (r) setZdarzenia((z) => [...z, noweZdarzenie(r)]);
          }}
        >
          {T.dodajZdarzenie}
        </button>
      </div>

      {bladZapisu && (
        <div className="mvd-dynamika-blad" role="alert" data-testid="mvd-dynamika-scenariusz-blad">
          {T.bledyZapisu} {bladZapisu}
        </div>
      )}
      <div className="mvd-dynamika-wiersz-akcji">
        <button
          type="button"
          className="mvd-dynamika-akcja"
          data-testid="mvd-dynamika-scenariusz-zapisz"
          disabled={zapisuje}
          onClick={() => void zapisz()}
        >
          {zapisuje ? T.scenariuszZapisuje : T.scenariuszZapisz}
        </button>
      </div>
    </section>
  );
}

export interface FormularzNastawProps {
  readonly opis: OpisScenariusza;
  readonly wartosci: { [pole: string]: WartoscFormularza };
  readonly bledy: readonly BladFormularza[];
  readonly onZmiana: (nazwa: string, wartosc: WartoscFormularza) => void;
}

/** Nastawy solvera — komplet pól kontraktu, bez wartości domyślnych. */
export function FormularzNastaw({ opis, wartosci, bledy, onZmiana }: FormularzNastawProps) {
  const mapa = mapaBledow(bledy);
  return (
    <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-nastawy">
      <h4>{T.nastawyTytul}</h4>
      <p className="mvd-dynamika-opis">{T.nastawyOpis}</p>
      <div className="mvd-dynamika-wiersz-pol">
        {opis.nastawy_solvera.map((pole) => (
          <PoleFormularza
            key={pole.nazwa}
            pole={pole}
            wartosc={wartosci[pole.nazwa]}
            sciezka={`nastawy.${pole.nazwa}`}
            bledy={mapa}
            elementy={{}}
            onZmiana={(v) => onZmiana(pole.nazwa, v)}
          />
        ))}
      </div>
    </section>
  );
}
