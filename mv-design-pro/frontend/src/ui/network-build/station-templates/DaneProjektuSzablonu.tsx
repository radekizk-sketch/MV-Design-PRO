/**
 * Dane projektu szablonu (`schema.dane_projektu`) — formularz kreatora stacji.
 *
 * Szablon WYMAGA tych danych od projektanta i ich NIE wypełnia (karta GPZ-H5: tory
 * zasilania L1/L2 sekcji 110 kV, stan normalny łącznika szyn 110 kV, tryb rezerwy
 * transformatorowej). Kontrakt backendu: `schema.py::DanaProjektuSzablonu` — etykieta
 * (`label_pl`, ten sam słownik nazw pól co komunikat odmowy operacji), podpowiedź, podstawa,
 * dozwolone wartości z nazwą, warunek wymagania. Brak wartości domyślnej jest cechą
 * kontraktu: każda lista wyboru startuje od „— wybierz —”, a dana niewypełniona NIE trafia
 * do `params_override` (backend odmawia nazwaną odmową, nigdy nie zgaduje).
 *
 * Wartość danej leży w `params_override` pod ścieżką `klucz` (np. `hv_coupler.normal_state`
 * → `{hv_coupler: {normal_state}}`); `apply.py::_ladunek_gpz_h5` przenosi do ładunku
 * operacji klucz najwyższego poziomu (`klucz_ladunku`).
 *
 * Rodzaj pola wejścia: lista wartości z kontraktu (`wartosci`) albo — dla danych bez listy —
 * jawny rejestr `RODZAJ_DANEJ_WG_KLUCZA`. Dana bez listy i spoza rejestru jest
 * „nieobsługiwana” i BLOKUJE zastosowanie z przyczyną (zakaz cichego pominięcia danej
 * wymaganej przez szablon).
 */

import { useState } from 'react';

import type { CatalogChoice, DanaProjektuSzablonu, StationTemplateFull } from './api';

export type RodzajDanejProjektu =
  | 'wybor'
  | 'tekst'
  | 'tory_110'
  | 'numer_transformatora'
  | 'aparat_sn'
  | 'nieobslugiwana';

/**
 * Rodzaj pola danych bez listy wartości w kontrakcie (`wartosci: []`). Kształt wartości —
 * `backend/src/enm/domain_ops_models.py` (pola `hv_sections`, `hv_coupler`,
 * `reserve_transformer`, `reserve_transformer_apparatus` operacji `add_grid_source_sn`).
 */
const RODZAJ_DANEJ_WG_KLUCZA: Readonly<Record<string, RodzajDanejProjektu>> = {
  hv_sections: 'tory_110',
  'hv_coupler.justification': 'tekst',
  reserve_transformer: 'numer_transformatora',
  reserve_transformer_apparatus: 'aparat_sn',
};

/**
 * Etykieta pola: `label_pl` z backendu pochodzi ze słownika nazw pól komunikatów odmów
 * (`enm.slownik_komunikatow.pole`) i jest ujęta w cudzysłów „…” do wstawienia w zdanie —
 * nagłówek pola formularza pokazuje tę samą nazwę bez cudzysłowu.
 */
export function etykietaDanej(dana: DanaProjektuSzablonu): string {
  const m = /^„(.*)”$/u.exec(dana.label_pl);
  return m != null ? m[1] : dana.label_pl;
}

export function rodzajDanejProjektu(dana: DanaProjektuSzablonu): RodzajDanejProjektu {
  const zRejestru = RODZAJ_DANEJ_WG_KLUCZA[dana.klucz];
  if (zRejestru != null) return zRejestru;
  return dana.wartosci.length > 0 ? 'wybor' : 'nieobslugiwana';
}

/**
 * Liczba torów zasilania 110 kV: układ ENEA H5 ma DOKŁADNIE dwie linie zasilające (Zeszyt 1
 * §11.1; backend `apply.py::_GPZ_SECTIONS_COUNT`). Inny układ z daną `hv_sections` nie ma
 * w kontrakcie liczby torów — `null` (dana nieobsługiwana, blokada z przyczyną).
 */
export function liczbaTorow110(template: StationTemplateFull): number | null {
  return template.schema.gpz_uklad === 'H5' ? 2 : null;
}

// ---------------------------------------------------------------------------
// Ścieżka wartości w `params_override`
// ---------------------------------------------------------------------------

export function odczytajDana(overrides: Readonly<Record<string, unknown>>, klucz: string): unknown {
  let biezacy: unknown = overrides;
  for (const czesc of klucz.split('.')) {
    if (biezacy == null || typeof biezacy !== 'object' || Array.isArray(biezacy)) return undefined;
    biezacy = (biezacy as Record<string, unknown>)[czesc];
  }
  return biezacy;
}

/** Zapis niemutujący; `undefined` usuwa daną (i pusty obiekt nadrzędny). */
export function zapiszDana(
  overrides: Readonly<Record<string, unknown>>,
  klucz: string,
  wartosc: unknown,
): Record<string, unknown> {
  const [glowa, ...reszta] = klucz.split('.');
  const wynik: Record<string, unknown> = { ...overrides };
  if (reszta.length === 0) {
    if (wartosc === undefined) delete wynik[glowa];
    else wynik[glowa] = wartosc;
    return wynik;
  }
  const dziecko = overrides[glowa];
  const obiekt =
    dziecko != null && typeof dziecko === 'object' && !Array.isArray(dziecko)
      ? (dziecko as Record<string, unknown>)
      : {};
  const nowe = zapiszDana(obiekt, reszta.join('.'), wartosc);
  if (Object.keys(nowe).length === 0) delete wynik[glowa];
  else wynik[glowa] = nowe;
  return wynik;
}

// ---------------------------------------------------------------------------
// Tor zasilania sekcji 110 kV (`hv_sections[n].supply`)
// ---------------------------------------------------------------------------

interface PoleToru {
  /** Klucz w `supply` albo w `supply.manual_equivalent`. */
  klucz: string;
  wRownowazniku: boolean;
  liczba: boolean;
  wymagane: boolean;
  label_pl: string;
}

/**
 * Pola toru zasilania — `_wpisy_sekcji_wn_gpz` i `_resolve_manual_source_equivalent`
 * (`backend/src/enm/domain_operations.py`): linia, stacja zasilająca, równoważnik sieci
 * w trybie mocy zwarciowej po stronie 110 kV (napięcie U_nQ jest daną — bez domyślnego
 * 110 kV; Sk″ max i R/X wymagane; scenariusz MIN i Z0/Z1 opcjonalne — bez Z0/Z1 zwarcie
 * doziemne 110 kV kończy się odmową z przyczyną, nie wynikiem z założenia).
 */
export const POLA_TORU_110: readonly PoleToru[] = [
  { klucz: 'line_name', wRownowazniku: false, liczba: false, wymagane: true, label_pl: 'Nazwa linii 110 kV' },
  {
    klucz: 'supplying_station_name',
    wRownowazniku: false,
    liczba: false,
    wymagane: true,
    label_pl: 'Stacja zasilająca',
  },
  {
    klucz: 'hv_voltage_kv',
    wRownowazniku: true,
    liczba: true,
    wymagane: true,
    label_pl: 'Napięcie znamionowe sieci U_nQ [kV]',
  },
  { klucz: 'sk3_hv_mva', wRownowazniku: true, liczba: true, wymagane: true, label_pl: 'Sk″ max [MVA]' },
  { klucz: 'rx_ratio', wRownowazniku: true, liczba: true, wymagane: true, label_pl: 'R/X (max)' },
  { klucz: 'sk3_min_mva', wRownowazniku: true, liczba: true, wymagane: false, label_pl: 'Sk″ min [MVA]' },
  { klucz: 'rx_ratio_min', wRownowazniku: true, liczba: true, wymagane: false, label_pl: 'R/X (min)' },
  { klucz: 'z0_z1_ratio', wRownowazniku: true, liczba: true, wymagane: false, label_pl: 'Z0/Z1' },
];

type Tor110 = { supply: Record<string, unknown> };

function wartoscPolaToru(tor: unknown, pole: PoleToru): unknown {
  if (tor == null || typeof tor !== 'object') return undefined;
  const zasilanie = (tor as Tor110).supply;
  if (zasilanie == null || typeof zasilanie !== 'object') return undefined;
  if (!pole.wRownowazniku) return zasilanie[pole.klucz];
  const rownowaznik = zasilanie.manual_equivalent;
  if (rownowaznik == null || typeof rownowaznik !== 'object') return undefined;
  return (rownowaznik as Record<string, unknown>)[pole.klucz];
}

function zapiszPoleToru(tor: unknown, pole: PoleToru, wartosc: unknown): Tor110 {
  const zasilanie: Record<string, unknown> = {
    ...((tor as Tor110 | undefined)?.supply ?? {}),
  };
  if (!pole.wRownowazniku) {
    if (wartosc === undefined) delete zasilanie[pole.klucz];
    else zasilanie[pole.klucz] = wartosc;
    return { supply: zasilanie };
  }
  const rownowaznik: Record<string, unknown> = {
    ...((zasilanie.manual_equivalent as Record<string, unknown> | undefined) ?? {}),
  };
  if (wartosc === undefined) delete rownowaznik[pole.klucz];
  else rownowaznik[pole.klucz] = wartosc;
  if (Object.keys(rownowaznik).length === 0) delete zasilanie.manual_equivalent;
  else zasilanie.manual_equivalent = rownowaznik;
  return { supply: zasilanie };
}

function poleToruWypelnione(tor: unknown, pole: PoleToru): boolean {
  const w = wartoscPolaToru(tor, pole);
  if (pole.liczba) return typeof w === 'number' && Number.isFinite(w) && w > 0;
  return typeof w === 'string' && w.trim().length > 0;
}

/** Liczba dodatnia z tekstu (przecinek dziesiętny dopuszczony); inaczej `undefined`. */
export function liczbaDodatnia(tekst: string): number | undefined {
  const t = tekst.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// ---------------------------------------------------------------------------
// Braki — blokada zastosowania
// ---------------------------------------------------------------------------

export interface BrakDanejProjektu {
  klucz: string;
  opis_pl: string;
}

/**
 * Dane projektu blokujące zastosowanie: dana bez warunku (`warunek_pl` pusty — wymagana
 * zawsze) niewypełniona oraz KAŻDA dana nieobsługiwana przez formularz. Dana z warunkiem
 * opisanym tekstem (`warunek_pl`, np. „wymagane przy trybie rezerwy jawnej”) jest pokazana
 * z warunkiem, ale nie blokuje: kontrakt nie niesie warunku w postaci maszynowej, a
 * powtórzenie predykatu backendu we froncie byłoby drugim źródłem prawdy — brak takiej
 * danej rozstrzyga operacja odmową nazwaną (kod i komunikat z backendu).
 */
export function brakiDanychProjektu(
  template: StationTemplateFull,
  overrides: Readonly<Record<string, unknown>>,
): BrakDanejProjektu[] {
  const braki: BrakDanejProjektu[] = [];
  for (const dana of template.schema.dane_projektu) {
    const rodzaj = rodzajDanejProjektu(dana);
    if (rodzaj === 'nieobslugiwana' || (rodzaj === 'tory_110' && liczbaTorow110(template) == null)) {
      braki.push({
        klucz: dana.klucz,
        opis_pl: `${dana.label_pl}: kreator nie ma pola wejścia dla tej danej szablonu — zastosowanie zablokowane, zgłoś brak.`,
      });
      continue;
    }
    if (dana.warunek_pl !== '') continue;
    const wartosc = odczytajDana(overrides, dana.klucz);
    if (rodzaj === 'tory_110') {
      const liczba = liczbaTorow110(template) ?? 0;
      const tory = Array.isArray(wartosc) ? wartosc : [];
      for (let i = 0; i < liczba; i += 1) {
        const brakujace = POLA_TORU_110.filter(
          (p) => p.wymagane && !poleToruWypelnione(tory[i], p),
        ).map((p) => p.label_pl);
        if (brakujace.length > 0) {
          braki.push({
            klucz: `${dana.klucz}.${i + 1}`,
            opis_pl: `${dana.label_pl} — sekcja 110 kV ${i + 1}: uzupełnij ${brakujace.join(', ')}.`,
          });
        }
      }
      continue;
    }
    const wypelniona =
      typeof wartosc === 'string'
        ? wartosc.trim().length > 0
        : wartosc != null && (typeof wartosc !== 'object' || Object.keys(wartosc).length > 0);
    if (!wypelniona) braki.push({ klucz: dana.klucz, opis_pl: `${dana.label_pl}: wybierz wartość.` });
  }
  return braki;
}

// ---------------------------------------------------------------------------
// Komponent
// ---------------------------------------------------------------------------

const KLASA_POLA = 'w-full px-2 py-1.5 bg-zinc-800 text-zinc-100 rounded text-sm';

export function DaneProjektuSekcja(props: {
  template: StationTemplateFull;
  overrides: Readonly<Record<string, unknown>>;
  onChange: (overrides: Record<string, unknown>) => void;
}): JSX.Element | null {
  const { template, overrides, onChange } = props;
  const dane = template.schema.dane_projektu;
  if (dane.length === 0) return null;
  const braki = brakiDanychProjektu(template, overrides);
  return (
    <section
      data-testid="dane-projektu"
      aria-labelledby="dane-projektu-tytul"
      className="mb-4 border border-zinc-700 rounded p-3 space-y-3"
    >
      <h3 id="dane-projektu-tytul" className="text-sm font-bold">
        Dane projektu (wymagane od projektanta — szablon ich nie wypełnia)
      </h3>
      {dane.map((dana) => (
        <DanaProjektuPole
          key={dana.klucz}
          dana={dana}
          template={template}
          overrides={overrides}
          onChange={onChange}
        />
      ))}
      <BrakiDanychProjektu braki={braki} />
    </section>
  );
}

export function BrakiDanychProjektu(props: { braki: readonly BrakDanejProjektu[] }): JSX.Element | null {
  if (props.braki.length === 0) return null;
  return (
    <div
      data-testid="dane-projektu-braki"
      role="status"
      className="text-xs bg-sygnal-uwaga-tlo text-sygnal-uwaga-tusz border border-sygnal-uwaga rounded p-2"
    >
      <div className="font-semibold">Zastosowanie zablokowane — brak danych projektu:</div>
      <ul className="list-disc ml-4 mt-1">
        {props.braki.map((b) => (
          <li key={b.klucz} data-testid={`dane-projektu-brak-${b.klucz}`}>
            {b.opis_pl}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OpisDanej(props: { dana: DanaProjektuSzablonu; idPola: string }): JSX.Element {
  const { dana } = props;
  return (
    <>
      <label htmlFor={props.idPola} className="block text-xs font-semibold text-zinc-200">
        {etykietaDanej(dana)}
      </label>
      <div className="text-xs text-zinc-400">{dana.podpowiedz_pl}</div>
      <div className="text-xs text-zinc-500">Podstawa: {dana.podstawa_pl}</div>
      <div className="text-xs text-zinc-500" data-testid={`dana-projektu-warunek-${dana.klucz}`}>
        {dana.warunek_pl !== '' ? `Wymagalność: ${dana.warunek_pl}` : 'Wymagalność: zawsze'}
      </div>
    </>
  );
}

function DanaProjektuPole(props: {
  dana: DanaProjektuSzablonu;
  template: StationTemplateFull;
  overrides: Readonly<Record<string, unknown>>;
  onChange: (overrides: Record<string, unknown>) => void;
}): JSX.Element {
  const { dana, template, overrides, onChange } = props;
  const rodzaj = rodzajDanejProjektu(dana);
  const idPola = `dana-projektu-pole-${dana.klucz}`;
  const wartosc = odczytajDana(overrides, dana.klucz);
  const zapisz = (w: unknown) => onChange(zapiszDana(overrides, dana.klucz, w));

  let pole: JSX.Element;
  switch (rodzaj) {
    case 'wybor':
      pole = (
        <SelectBezDomyslnej
          id={idPola}
          wartosc={typeof wartosc === 'string' ? wartosc : ''}
          opcje={dana.wartosci.map((w) => ({ wartosc: w.wartosc, label_pl: w.label_pl }))}
          onChange={(w) => zapisz(w === '' ? undefined : w)}
        />
      );
      break;
    case 'tekst':
      pole = (
        <input
          id={idPola}
          type="text"
          value={typeof wartosc === 'string' ? wartosc : ''}
          onChange={(e) => zapisz(e.target.value === '' ? undefined : e.target.value)}
          className={KLASA_POLA}
        />
      );
      break;
    case 'numer_transformatora': {
      const liczba = Number(overrides.transformer_count ?? template.schema.transformer_count.default);
      pole = (
        <SelectBezDomyslnej
          id={idPola}
          wartosc={typeof wartosc === 'number' ? String(wartosc) : ''}
          opcje={Array.from({ length: Number.isInteger(liczba) && liczba > 0 ? liczba : 0 }, (_, i) => ({
            wartosc: String(i + 1),
            label_pl: `Transformator ${i + 1}`,
          }))}
          onChange={(w) => zapisz(w === '' ? undefined : Number(w))}
        />
      );
      break;
    }
    case 'aparat_sn':
      pole = (
        <SelectBezDomyslnej
          id={idPola}
          wartosc={
            wartosc != null && typeof wartosc === 'object'
              ? String((wartosc as Record<string, unknown>).catalog_ref ?? '')
              : ''
          }
          opcje={template.schema.sn_bay_apparatus_options.map((o: CatalogChoice) => ({
            wartosc: o.catalog_ref,
            label_pl: o.label_pl,
          }))}
          onChange={(w) => zapisz(w === '' ? undefined : { catalog_ref: w })}
        />
      );
      break;
    case 'tory_110': {
      const liczba = liczbaTorow110(template);
      pole =
        liczba == null ? (
          <div className="text-xs text-sygnal-blokada-tusz">
            Układ szablonu nie określa liczby torów zasilania 110 kV.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: liczba }, (_, i) => (
              <TorZasilania110
                key={i}
                numer={i + 1}
                tor={Array.isArray(wartosc) ? wartosc[i] : undefined}
                onChange={(tor) => {
                  const tory = Array.from({ length: liczba }, (_, j) =>
                    j === i ? tor : (Array.isArray(wartosc) ? wartosc[j] : undefined) ?? { supply: {} },
                  );
                  zapisz(tory);
                }}
              />
            ))}
          </div>
        );
      break;
    }
    case 'nieobslugiwana':
      pole = (
        <div className="text-xs text-sygnal-blokada-tusz">
          Kreator nie ma pola wejścia dla tej danej szablonu.
        </div>
      );
      break;
  }

  return (
    <div data-testid={`dana-projektu-${dana.klucz}`} data-rodzaj={rodzaj} className="space-y-1">
      <OpisDanej dana={dana} idPola={idPola} />
      {pole}
    </div>
  );
}

function SelectBezDomyslnej(props: {
  id: string;
  wartosc: string;
  opcje: readonly { wartosc: string; label_pl: string }[];
  onChange: (w: string) => void;
}): JSX.Element {
  return (
    <select
      id={props.id}
      value={props.wartosc}
      onChange={(e) => props.onChange(e.target.value)}
      className={KLASA_POLA}
    >
      <option value="">— wybierz —</option>
      {props.opcje.map((o) => (
        <option key={o.wartosc} value={o.wartosc}>
          {o.label_pl}
        </option>
      ))}
    </select>
  );
}

function TorZasilania110(props: {
  numer: number;
  tor: unknown;
  onChange: (tor: Tor110) => void;
}): JSX.Element {
  // Surowy tekst pól liczbowych trzymany lokalnie (pisanie „0,” albo „1.” nie może kasować
  // pola); do `params_override` trafia wyłącznie liczba dodatnia — inna treść usuwa daną
  // i zostawia brak widoczny w liście blokady.
  const [surowe, setSurowe] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      POLA_TORU_110.map((p) => {
        const w = wartoscPolaToru(props.tor, p);
        return [p.klucz, w == null ? '' : String(w)];
      }),
    ),
  );
  return (
    <fieldset
      data-testid={`tor-110-${props.numer}`}
      className="border border-zinc-700 rounded p-2 space-y-2"
    >
      <legend className="text-xs font-semibold px-1">Sekcja 110 kV {props.numer} — tor zasilania</legend>
      {POLA_TORU_110.map((p) => {
        const id = `tor-110-${props.numer}-${p.klucz}`;
        const tekst = surowe[p.klucz] ?? '';
        const bledna = p.liczba && tekst.trim() !== '' && liczbaDodatnia(tekst) === undefined;
        return (
          <div key={p.klucz}>
            <label htmlFor={id} className="block text-xs text-zinc-400">
              {p.label_pl}
              {p.wymagane ? ' (wymagane)' : ' (opcjonalne)'}
            </label>
            <input
              id={id}
              data-testid={id}
              type="text"
              inputMode={p.liczba ? 'decimal' : 'text'}
              value={tekst}
              aria-invalid={bledna}
              onChange={(e) => {
                const nowy = e.target.value;
                setSurowe((s) => ({ ...s, [p.klucz]: nowy }));
                const w = p.liczba ? liczbaDodatnia(nowy) : nowy.trim() === '' ? undefined : nowy;
                props.onChange(zapiszPoleToru(props.tor, p, w));
              }}
              className={KLASA_POLA}
            />
            {bledna && (
              <div className="text-xs text-sygnal-blokada-tusz">Podaj liczbę dodatnią.</div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
