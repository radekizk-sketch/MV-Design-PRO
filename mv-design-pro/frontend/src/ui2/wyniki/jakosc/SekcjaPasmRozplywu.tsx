/*
 * Sekcja „Pasma zdrowego rozsądku rozpływu" (karta W3-G2, KARTA_W3_KONWERGENCJA_
 * FIZYKI_2026-09.md § 0.17) — TRZECIA niezależna sekcja ekranu „Jakość" (obok
 * Wiarygodności zwarciowej i Walidacji energetycznej), wpięta w `EkranJakosci`.
 *
 * Cel: rozpływ mocy nie miał ŻADNEJ bramki „czy ten wynik jest fizycznie
 * sensowny" (SC ją miała — Wiarygodność zwarciowa). Trzy niezależne pasma z
 * jednej końcówki `GET /api/quality/sanity-bounds` (dispatch backendu wg
 * rodzaju przebiegu — PF zamiast SC, ta sama końcówka co Wiarygodność
 * zwarciowa): napięcia szyn (Un ± 10 %, PN-EN 50160), obciążenia gałęzi
 * (linia/kabel wobec In katalogu) i straty czynne sieci (próg jawny, z
 * uzasadnieniem inżynierskim). Status trójstanowy IDENTYCZNY jak Wiarygodność
 * zwarciowa (w paśmie wiarygodności / poza zakresem wiarygodności / dane niekompletne)
 * — reużywa `istotnoscWiarygodnosci`/`STATUS_WIARYGODNOSCI` (jedno źródło
 * prawdy wokabularza statusu, KLASA NIE INSTANCJA).
 *
 * ZERO fizyki, zero ocen lokalnych — wartości, pasma i progi (wraz z
 * proweniencją: cytat normy, uzasadnienie progu strat) pochodzą WYŁĄCZNIE z
 * backendu. Bieg NIEZBIEŻNY: banner ostrzegawczy + KAŻDA pozycja tabel ma
 * status „dane niekompletne" z nazwanym powodem (bez fabrykacji werdyktu z
 * niewiarygodnych danych — pole `converged` niesie to wprost z backendu).
 *
 * Osobny plik (nie `jakoscModel.ts`/`EkranJakosci.tsx` — poza importem
 * wspólnych elementów wzorca i wpięciem jednej linii w kompozycję ekranu),
 * żeby nie kolidować z równoległą pracą nad sekcją porównania metod (W3-G1) w
 * tym samym ekranie. Wzór pliku: `PanelDowoduCieplnego.tsx`.
 */

import { useMemo, useState } from 'react';

import { EkranAnalizy } from '../wzorzec';
import type { DefinicjaKolumny, WierszTabeli, WierszZalozenia } from '../wzorzec';
import {
  Chip,
  SekcjaProps,
  StanSekcji,
  TagStatusu,
  useZasobJakosci,
} from './EkranJakosci';
import { useAkcjaUruchomObliczenie, useNazwaObiektu } from '../wzorzec';
import type { NazwaObiektu } from '../wzorzec';
import { komorkaLiczba } from './jakoscModel';
import {
  fetchPasmaRozplywu,
  type NapieciePasmoItem,
  type ObciazeniePasmoItem,
  type PasmaRozplywuResponse,
  type StratyPasmoWerdykt,
} from './api';
import { JAKOSC_STRINGS, fmtKA, fmtKV, fmtProcent, fmtWartosc, istotnoscWiarygodnosci } from './strings';
import { useSwiezoscNaglowka } from '../../freshness';

// ---------------------------------------------------------------------------
// Napięcia szyn
// ---------------------------------------------------------------------------

const KLUCZ_NAPIECIA_WEZEL = 'identyfikatorNapiecia';

const KOLUMNY_NAPIEC: DefinicjaKolumny[] = [
  { klucz: 'szyna', etykieta: JAKOSC_STRINGS.kolSzynaPasma, wyrownanie: 'lewo' },
  { klucz: 'un', etykieta: JAKOSC_STRINGS.kolNapiecieZnamionowe, jednostka: JAKOSC_STRINGS.jednKV, mono: true },
  { klucz: 'u', etykieta: JAKOSC_STRINGS.kolNapiecieRzeczywiste, jednostka: JAKOSC_STRINGS.jednKV, mono: true },
  { klucz: 'odchylenie', etykieta: JAKOSC_STRINGS.kolOdchylenieProcent, jednostka: JAKOSC_STRINGS.jednProcent, mono: true },
  { klucz: 'pasmo', etykieta: JAKOSC_STRINGS.kolPasmoNapieciowe, mono: true },
  { klucz: 'status', etykieta: JAKOSC_STRINGS.kolStatusWiarygodnosci, wyrownanie: 'lewo' },
  // Karta #145: identyfikator węzła jest kluczem wiersza (komórka poza listą kolumn).
];

function fmtPasmoKv(lower: number | null, upper: number | null): string {
  if (lower === null || upper === null) return JAKOSC_STRINGS.kreska;
  return `${fmtKV(lower)}–${fmtKV(upper)}`;
}

function mapujWierszNapiecia(item: NapieciePasmoItem, nazwa: NazwaObiektu): WierszTabeli {
  return {
    szyna: { wartosc: nazwa(item.target_id, item.target_name) },
    un: komorkaLiczba(item.nominal_kv, fmtKV),
    u: komorkaLiczba(item.actual_kv, fmtKV, { ostrzezenie: !item.in_range }),
    odchylenie: komorkaLiczba(item.deviation_pct, fmtProcent),
    pasmo: { wartosc: fmtPasmoKv(item.lower_kv, item.upper_kv) },
    status: { wartosc: item.status },
    [KLUCZ_NAPIECIA_WEZEL]: { wartosc: item.target_id },
  };
}

function naZalozeniaNapiec(napiecia: PasmaRozplywuResponse['napiecia']): WierszZalozenia[] {
  return [
    {
      etykieta: JAKOSC_STRINGS.pasmaNormaNapiecia,
      wartosc: `Un ± ${napiecia.band_pct} %`,
      uwaga: napiecia.norm_ref,
    },
  ];
}

function SzczegolNapiecia({ item }: { item: NapieciePasmoItem | null }) {
  if (!item) {
    return (
      <p className="mvd-jakosc-szczegol-brak" data-testid="mvd-jakosc-pasma-napiecia-szczegol-pusty">
        {JAKOSC_STRINGS.szczegolBrakWyboru}
      </p>
    );
  }
  return (
    <div data-testid="mvd-jakosc-pasma-napiecia-szczegol">
      <p className="mvd-jakosc-szczegol-why">{item.why_pl}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Obciążenia gałęzi (linia/kabel — wielkość znamionowa: prąd In)
// ---------------------------------------------------------------------------

const KLUCZ_OBCIAZENIA_GALAZ = 'identyfikatorObciazenia';

const KOLUMNY_OBCIAZEN: DefinicjaKolumny[] = [
  { klucz: 'galaz', etykieta: JAKOSC_STRINGS.kolGalazPasma, wyrownanie: 'lewo' },
  { klucz: 'i', etykieta: JAKOSC_STRINGS.kolPradGalezi, jednostka: JAKOSC_STRINGS.jednKA, mono: true },
  { klucz: 'in', etykieta: JAKOSC_STRINGS.kolPradZnamionowy, jednostka: JAKOSC_STRINGS.jednA, mono: true },
  { klucz: 'obciazenie', etykieta: JAKOSC_STRINGS.kolObciazenieProcent, jednostka: JAKOSC_STRINGS.jednProcent, mono: true },
  { klucz: 'status', etykieta: JAKOSC_STRINGS.kolStatusWiarygodnosci, wyrownanie: 'lewo' },
  // Karta #145: identyfikator gałęzi jest kluczem wiersza (komórka poza listą kolumn).
];

function mapujWierszObciazenia(item: ObciazeniePasmoItem, nazwa: NazwaObiektu): WierszTabeli {
  return {
    galaz: { wartosc: nazwa(item.target_id, item.target_name) },
    i: komorkaLiczba(item.current_ka, fmtKA),
    in: komorkaLiczba(item.rated_current_a, fmtWartosc, { ostrzezenie: !item.in_range }),
    obciazenie: komorkaLiczba(item.loading_pct, fmtProcent),
    status: { wartosc: item.status },
    [KLUCZ_OBCIAZENIA_GALAZ]: { wartosc: item.target_id },
  };
}

const ZALOZENIA_OBCIAZEN: WierszZalozenia[] = [
  {
    etykieta: JAKOSC_STRINGS.pasmaRodzajGalezi,
    wartosc: JAKOSC_STRINGS.pasmaRodzajGaleziWartosc,
    uwaga: JAKOSC_STRINGS.pasmaRodzajGaleziUwaga,
  },
];

function SzczegolObciazenia({ item }: { item: ObciazeniePasmoItem | null }) {
  if (!item) {
    return (
      <p className="mvd-jakosc-szczegol-brak" data-testid="mvd-jakosc-pasma-obciazenia-szczegol-pusty">
        {JAKOSC_STRINGS.szczegolBrakWyboru}
      </p>
    );
  }
  return (
    <div data-testid="mvd-jakosc-pasma-obciazenia-szczegol">
      <p className="mvd-jakosc-szczegol-why">{item.why_pl}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Straty czynne sieci — agregat SIECIOWY (jedna pozycja, nie lista)
// ---------------------------------------------------------------------------

function wartoscMw(v: number | null): string {
  return v !== null ? `${fmtWartosc(v)} ${JAKOSC_STRINGS.jednMw}` : JAKOSC_STRINGS.kreska;
}

function BlokStrat({ straty }: { straty: StratyPasmoWerdykt }) {
  return (
    <section className="mvd-jakosc-szczegol" data-testid="mvd-jakosc-pasma-straty">
      <header className="mvd-jakosc-szczegol-head">
        <h3 className="mvd-jakosc-szczegol-tytul">{JAKOSC_STRINGS.pasmaSekcjaStrat}</h3>
        <TagStatusu tekst={straty.status} istotnosc={istotnoscWiarygodnosci(straty.status)} />
      </header>
      <dl className="mvd-jakosc-szczegol-dane">
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.pasmaStratyCzynne}</dt>
          <dd className="mvd-num">{wartoscMw(straty.losses_active_mw)}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.pasmaSumaOdbiorow}</dt>
          <dd className="mvd-num">{wartoscMw(straty.load_active_total_mw)}</dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.pasmaStratyProcentOdbiorow}</dt>
          <dd className="mvd-num">
            {straty.losses_pct_of_load !== null
              ? `${fmtProcent(straty.losses_pct_of_load)} ${JAKOSC_STRINGS.jednProcent}`
              : JAKOSC_STRINGS.kreska}
          </dd>
        </div>
        <div className="mvd-jakosc-szczegol-para">
          <dt>{JAKOSC_STRINGS.pasmaProgWiarygodnosci}</dt>
          <dd className="mvd-num">
            {fmtProcent(straty.threshold_pct)} {JAKOSC_STRINGS.jednProcent}
          </dd>
        </div>
      </dl>
      <p className="mvd-jakosc-szczegol-why">{straty.why_pl}</p>
      <p className="mvd-jakosc-szczegol-uwaga" data-testid="mvd-jakosc-pasma-straty-uzasadnienie">
        {JAKOSC_STRINGS.pasmaUzasadnienieProgu}: {straty.threshold_why_pl}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sekcja złożona
// ---------------------------------------------------------------------------

export function SekcjaPasmRozplywu({
  przebieg,
  trybZaawansowania,
  onOtworzDowod,
  onEksport,
}: SekcjaProps) {
  const runId = przebieg?.id ?? null;
  // V12K-264/265: znacznik świeżości + panel przyczyn z JEDNEJ derywacji.
  const swiezosc = useSwiezoscNaglowka(runId);
  const { stan, dane } = useZasobJakosci<PasmaRozplywuResponse>(runId, fetchPasmaRozplywu);
  const akcjaBiegu = useAkcjaUruchomObliczenie('LOAD_FLOW');
  const [wybranaSzyna, setWybranaSzyna] = useState<string | null>(null);
  const [wybranaGalaz, setWybranaGalaz] = useState<string | null>(null);
  const nazwaObiektu = useNazwaObiektu();

  const napieciaItems = dane?.napiecia.items ?? [];
  const obciazeniaItems = dane?.obciazenia.items ?? [];
  const selektorNapiec = useMemo(
    () => new Map<string, NapieciePasmoItem>(napieciaItems.map((it) => [it.target_id, it])),
    [napieciaItems],
  );
  const selektorObciazen = useMemo(
    () => new Map<string, ObciazeniePasmoItem>(obciazeniaItems.map((it) => [it.target_id, it])),
    [obciazeniaItems],
  );

  if (stan === 'brakPrzebiegu') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaPasmaRozplywu}
        komunikat={JAKOSC_STRINGS.brakPrzebieguRozplywu}
        opis={JAKOSC_STRINGS.brakPrzebieguRozplywuOpis}
        wariant="info"
        testid="mvd-jakosc-pasma-rozplywu-brak"
        akcja={akcjaBiegu}
      />
    );
  }
  if (stan === 'ladowanie') {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaPasmaRozplywu}
        komunikat={JAKOSC_STRINGS.ladowanie}
        wariant="info"
        testid="mvd-jakosc-pasma-rozplywu-ladowanie"
      />
    );
  }
  if (stan === 'blad' || dane === null) {
    return (
      <StanSekcji
        tytul={JAKOSC_STRINGS.sekcjaPasmaRozplywu}
        komunikat={JAKOSC_STRINGS.blad}
        opis={JAKOSC_STRINGS.bladOpis}
        wariant="blad"
        testid="mvd-jakosc-pasma-rozplywu-blad"
      />
    );
  }

  return (
    <section data-testid="mvd-jakosc-pasma-rozplywu">
      <h2 className="mvd-jakosc-sekcja-tytul">{JAKOSC_STRINGS.sekcjaPasmaRozplywu}</h2>
      {!dane.converged && (
        <p className="mvd-jakosc-nieaktualne" data-testid="mvd-jakosc-pasma-rozplywu-niezbiezny">
          {JAKOSC_STRINGS.pasmaNiezbiezny}
        </p>
      )}

      <h3 className="mvd-jakosc-szczegol-sekcja-tytul">{JAKOSC_STRINGS.pasmaSekcjaNapiec}</h3>
      <EkranAnalizy
        naglowek={{ analizaPL: JAKOSC_STRINGS.pasmaSekcjaNapiec, runId: runId ?? undefined, ...swiezosc }}
        zalozenia={naZalozeniaNapiec(dane.napiecia)}
        kolumny={KOLUMNY_NAPIEC}
        wiersze={napieciaItems.map((item) => mapujWierszNapiecia(item, nazwaObiektu))}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_NAPIECIA_WEZEL}
        onWybierzWiersz={setWybranaSzyna}
        wybranyWiersz={wybranaSzyna}
        // Karta UI2 p.6: pasmo napięcia liczone per węzeł (Bus).
        typElementuWiersza={() => 'Bus'}
        // Poprawka KLASA NIE INSTANCJA: `KLUCZ_NAPIECIA_WEZEL` niesie `target_id`
        // (techniczny), kolumna „Szyna" pokazuje nazwę z mostu nazw wyników —
        // ten sam `selektorNapiec`, którego już używa `SzczegolNapiecia` niżej.
        nazwaElementuWiersza={(klucz) => {
          const item = selektorNapiec.get(klucz);
          return item ? nazwaObiektu(item.target_id, item.target_name) : undefined;
        }}
      />
      <div className="mvd-jakosc-podsumowanie" data-testid="mvd-jakosc-pasma-napiecia-podsumowanie">
        <Chip etykieta={JAKOSC_STRINGS.podsumZweryfikowane} wartosc={dane.napiecia.summary.credible_count} istotnosc="ok" />
        <Chip etykieta={JAKOSC_STRINGS.podsumPozaZakresem} wartosc={dane.napiecia.summary.out_of_range_count} istotnosc="err" />
        <Chip etykieta={JAKOSC_STRINGS.podsumNiekompletne} wartosc={dane.napiecia.summary.incomplete_count} istotnosc="neutral" />
      </div>
      <SzczegolNapiecia item={wybranaSzyna ? selektorNapiec.get(wybranaSzyna) ?? null : null} />

      <h3 className="mvd-jakosc-szczegol-sekcja-tytul">{JAKOSC_STRINGS.pasmaSekcjaObciazen}</h3>
      <EkranAnalizy
        naglowek={{ analizaPL: JAKOSC_STRINGS.pasmaSekcjaObciazen, runId: runId ?? undefined, ...swiezosc }}
        zalozenia={ZALOZENIA_OBCIAZEN}
        kolumny={KOLUMNY_OBCIAZEN}
        wiersze={obciazeniaItems.map((item) => mapujWierszObciazenia(item, nazwaObiektu))}
        onOtworzDowod={onOtworzDowod}
        onEksport={onEksport}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_OBCIAZENIA_GALAZ}
        onWybierzWiersz={setWybranaGalaz}
        wybranyWiersz={wybranaGalaz}
        // Karta UI2 p.6: sekcja dotyczy WYŁĄCZNIE linii/kabli (nagłówek
        // pliku: „Obciążenia gałęzi — linia/kabel"), nigdy transformatorów.
        typElementuWiersza={() => 'LineBranch'}
        // Poprawka KLASA NIE INSTANCJA: `KLUCZ_OBCIAZENIA_GALAZ` niesie
        // `target_id` (techniczny), kolumna „Gałąź" pokazuje nazwę z mostu nazw
        // wyników — ten sam `selektorObciazen`, którego już używa
        // `SzczegolObciazenia` niżej.
        nazwaElementuWiersza={(klucz) => {
          const item = selektorObciazen.get(klucz);
          return item ? nazwaObiektu(item.target_id, item.target_name) : undefined;
        }}
      />
      <div className="mvd-jakosc-podsumowanie" data-testid="mvd-jakosc-pasma-obciazenia-podsumowanie">
        <Chip etykieta={JAKOSC_STRINGS.podsumZweryfikowane} wartosc={dane.obciazenia.summary.credible_count} istotnosc="ok" />
        <Chip etykieta={JAKOSC_STRINGS.podsumPozaZakresem} wartosc={dane.obciazenia.summary.out_of_range_count} istotnosc="err" />
        <Chip etykieta={JAKOSC_STRINGS.podsumNiekompletne} wartosc={dane.obciazenia.summary.incomplete_count} istotnosc="neutral" />
      </div>
      <SzczegolObciazenia item={wybranaGalaz ? selektorObciazen.get(wybranaGalaz) ?? null : null} />

      <BlokStrat straty={dane.straty} />
    </section>
  );
}
