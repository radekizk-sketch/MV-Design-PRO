/**
 * Ocena pola liniowego GPZ wg klasy pola (karta UX-04/POLE-LINIOWE-WZORZEC, rozszerzenie 2) —
 * karta pola SN (ekran E-11).
 *
 * Treść w całości z backendu (`GET /api/cases/{id}/enm/field-view` → `ocena_pola_liniowego`,
 * `enm/pole_liniowe_gpz.py` — to samo źródło co walidator W053–W057): klasa pola (zadeklarowana
 * albo przyjęta z sieci za polem), moduły wytwarzania i odbiory za polem, wymóg pomiaru
 * rozliczeniowego i analizatora jakości energii, ocena każdej funkcji EAZ wobec wymogu klasy
 * i niezgodności z akcją. Status oceny funkcji nigdy nie stoi sam: wiersz niesie etykietę ze
 * słownika backendu, co oceniono, kryterium, podstawę, przyczynę, braki i dowód z zastrzeżeniem
 * kompletności (kontrakt werdyktu wyjaśnialnego). Funkcja zależna od operatora nigdy nie jest „spełnia" — rozstrzygają
 * warunki przyłączenia, których model nie zawiera. Zero reguły w UI.
 */
import { NAZWA_WERYFIKACJI_PL, type ObwodyWtornePola } from '../catalog/api';
import type { NapiecieZwrotnePola, ObwodFunkcjiPola, OcenaPolaLiniowego } from './useFieldReadModel';
import { NAZWA_KLASY_POLA_PL } from './wyposazeniePola';
import './ocenaPolaLiniowego.css';

/** Kolumna tabeli oceny: nazwa (nagłówek tabeli ORAZ etykieta komórki w układzie blokowym
 *  wąskiego kontenera — `ocenaPolaLiniowego.css`) i szerokość w układzie tabeli. Jedno źródło
 *  obu napisów; parę nagłówek ↔ `data-etykieta` komórki przypina test komponentu. */
interface KolumnaOceny {
  readonly naglowek: string;
  readonly szerokosc: string;
}

/** Szerokości z treści: podstawa normowa i przyczyna to zdania, funkcja i ocena — krótkie. */
const KOLUMNY_OCENY_FUNKCJI = [
  { naglowek: 'Funkcja', szerokosc: 'w-[18%]' },
  { naglowek: 'Kryterium i podstawa', szerokosc: 'w-[32%]' },
  { naglowek: 'Ocena', szerokosc: 'w-[14%]' },
  { naglowek: 'Przyczyna i dowód', szerokosc: 'w-[36%]' },
] as const satisfies readonly KolumnaOceny[];

const KOLUMNY_OBWODOW_FUNKCJI = [
  { naglowek: 'Funkcja', szerokosc: 'w-[20%]' },
  { naglowek: 'Blok rysunku', szerokosc: 'w-[14%]' },
  { naglowek: 'Z czego mierzy', szerokosc: 'w-[32%]' },
  { naglowek: 'Działa na', szerokosc: 'w-[18%]' },
  { naglowek: 'Źródło', szerokosc: 'w-[16%]' },
] as const satisfies readonly KolumnaOceny[];

const KOLUMNY_SYGNALOW_POLA = [
  { naglowek: 'Sygnał', szerokosc: 'w-[18%]' },
  { naglowek: 'Kierunek', szerokosc: 'w-[12%]' },
  { naglowek: 'Obwód', szerokosc: 'w-[16%]' },
  { naglowek: 'Znaczenie', szerokosc: 'w-[34%]' },
  { naglowek: 'Źródło', szerokosc: 'w-[20%]' },
] as const satisfies readonly KolumnaOceny[];

/** Szerokości kolumn i wiersz nagłówka tabeli oceny z jednej listy kolumn. */
function NaglowekTabeli({ kolumny }: { readonly kolumny: readonly KolumnaOceny[] }): JSX.Element {
  return (
    <>
      <colgroup>
        {kolumny.map((k) => (
          <col key={k.naglowek} className={k.szerokosc} />
        ))}
      </colgroup>
      <thead className="text-scada-muted">
        <tr role="row">
          {kolumny.map((k, i) => (
            <th key={k.naglowek} role="columnheader" className={i < kolumny.length - 1 ? 'pr-2 font-medium' : 'font-medium'}>
              {k.naglowek}
            </th>
          ))}
        </tr>
      </thead>
    </>
  );
}

function formatKw(p: number): string {
  return `${p.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} kW`;
}

export interface OcenaPolaLiniowegoGpzProps {
  readonly ocena: OcenaPolaLiniowego;
}

export function OcenaPolaLiniowegoGpz({ ocena }: OcenaPolaLiniowegoGpzProps): JSX.Element {
  const sumaOdbiorow = ocena.odbiory.reduce((suma, [, p]) => suma + p, 0);
  return (
    <section
      data-testid="ocena-pola-liniowego"
      data-klasa={ocena.klasa_oceny}
      className="mvd-ocena-pola border-t border-scada-border px-3 py-2 text-[length:var(--mvd-font-size-data)] text-scada-text"
    >
      <h3 className="font-semibold">Ocena pola liniowego GPZ wg klasy pola</h3>
      <p data-testid="ocena-pola-liniowego-klasa" className="mt-1">
        Klasa oceny: {NAZWA_KLASY_POLA_PL[ocena.klasa_oceny]}
        {ocena.klasa_przyjeta
          ? ' — przyjęta z sieci za polem, bo pole nie ma zadeklarowanej klasy (ustaw klasę w wyposażeniu pola).'
          : ' — zadeklarowana w polu.'}
        {!ocena.klasa_przyjeta && ocena.klasa_z_sieci !== ocena.klasa_oceny
          ? ` Sieć za polem wskazuje: ${NAZWA_KLASY_POLA_PL[ocena.klasa_z_sieci]}.`
          : ''}
      </p>
      <p data-testid="ocena-pola-liniowego-siec" className="mt-1 text-scada-muted">
        Za polem: {ocena.moduly.length} moduł(y) wytwarzania, {ocena.odbiory.length} odbiór(y)
        {ocena.odbiory.length > 0 ? ` o łącznej mocy ${formatKw(sumaOdbiorow)}` : ''}
        {ocena.linia_napowietrzna ? ', linia napowietrzna.' : ', bez linii napowietrznej.'}
      </p>
      {ocena.moduly.length > 0 ? (
        <ul data-testid="ocena-pola-liniowego-moduly" className="mt-1 list-disc pl-4 text-scada-muted">
          {ocena.moduly.map((m) => (
            <li key={m.ref_id} data-ref={m.ref_id} data-typ={m.typ ?? ''}>
              {m.ref_id}: {formatKw(m.p_kw)}, typ modułu {m.typ ?? 'nieustalony'} — {m.powod_pl}
            </li>
          ))}
        </ul>
      ) : null}
      <p data-testid="ocena-pola-liniowego-ajee" data-wymagany={String(ocena.ajee_wymagany)} className="mt-1">
        Pomiar rozliczeniowy i analizator jakości energii: {ocena.ajee_wymagany ? 'wymagany' : 'niewymagany'} —{' '}
        {ocena.ajee_przyczyna}.
        {ocena.ajee_wymagany
          ? ocena.ajee_rdzen_obecny
            ? ' Przekładnik prądowy pola ma rdzeń rozliczeniowy.'
            : ' Przekładnik prądowy pola nie ma rdzenia rozliczeniowego.'
          : ''}
      </p>
      <table
        role="table"
        data-testid="ocena-pola-liniowego-funkcje"
        className="mvd-ocena-pola-tabela mt-2 w-full table-fixed border-collapse text-left"
      >
        <NaglowekTabeli kolumny={KOLUMNY_OCENY_FUNKCJI} />
        <tbody>
          {ocena.oceny_funkcji.map((f) => (
            <tr key={f.kod} role="row" data-kod={f.kod} data-status={f.status} className="border-t border-scada-border align-top">
              <td role="cell" data-etykieta={KOLUMNY_OCENY_FUNKCJI[0].naglowek} className="pr-2">
                {f.funkcja_pl}
              </td>
              <td role="cell" data-etykieta={KOLUMNY_OCENY_FUNKCJI[1].naglowek} className="pr-2">
                {f.kryterium}
                <div className="text-scada-muted">{f.podstawa}</div>
              </td>
              {/* Etykieta i wyjaśnienie z backendu (`werdykt.etykiety`, poziom kryterium) — karta
                  nie ma własnej mapy „status → tekst” (kontrakt werdyktu §9). */}
              <td
                role="cell"
                data-etykieta={KOLUMNY_OCENY_FUNKCJI[2].naglowek}
                className="pr-2"
                data-semantyka={f.etykieta.semantyka}
              >
                {f.etykieta.etykieta_pl}
              </td>
              <td role="cell" data-etykieta={KOLUMNY_OCENY_FUNKCJI[3].naglowek}>
                {f.wyjasnienie.przyczyna_pl}
                {f.wyjasnienie.czego_brakuje.length > 0 ? (
                  <div>Brakuje: {f.wyjasnienie.czego_brakuje.join('; ')}.</div>
                ) : null}
                <div className="text-scada-muted">
                  {f.co_oceniono}; {f.dowod}
                  {f.wyjasnienie.zastrzezenia.length > 0 ? ` — ${f.wyjasnienie.zastrzezenia.join('; ')}` : ''}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ocena.niezgodnosci.length > 0 ? (
        <ul data-testid="ocena-pola-liniowego-niezgodnosci" className="mt-2 list-disc pl-4 text-sygnal-uwaga-tusz">
          {ocena.niezgodnosci.map((n) => (
            <li key={n.kod} data-kod={n.kod}>
              {n.komunikat_pl} Akcja: {n.akcja_pl}.
            </li>
          ))}
        </ul>
      ) : null}
      {ocena.napiecie_zwrotne ? <NapiecieZwrotne nz={ocena.napiecie_zwrotne} /> : null}
      {ocena.obwody_funkcji && ocena.obwody_funkcji.length > 0 ? (
        <ObwodyFunkcji obwody={ocena.obwody_funkcji} />
      ) : null}
      {ocena.obwody_wtorne ? <SygnalyPola obwody={ocena.obwody_wtorne} /> : null}
    </section>
  );
}

const KIERUNEK_PL = { WEJSCIE: 'wejście', WYJSCIE: 'wyjście' } as const;
const OBWOD_PL = { WYLACZNIK: 'do wyłącznika', OKREZNY: 'obwód okrężny', NADRZEDNY: 'nadrzędny' } as const;

/** Napięcie po stronie linii (Z.11.1/Z.11): czym mierzone, czy pole ma blokadę NZ, źródła za
 *  polem i stan z pomiaru — wszystko z backendu (`NapiecieZwrotnePola`). */
function NapiecieZwrotne({ nz }: { readonly nz: NapiecieZwrotnePola }): JSX.Element {
  return (
    <div data-testid="ocena-pola-liniowego-napiecie-zwrotne" data-stan={nz.stan_pomiaru} data-mozliwe={String(nz.mozliwe)} className="mt-2">
      <h4 className="font-semibold">Napięcie zwrotne od strony linii</h4>
      <p className="mt-1">
        {nz.stan_pomiaru_pl}. {nz.mozliwe ? 'Napięcie zwrotne możliwe' : 'Źródło napięcia zwrotnego za polem: brak'} — {nz.wyjasnienie_pl}.
      </p>
      <p className="mt-1 text-scada-muted">
        Pomiar: {nz.pomiar_pl}. Blokada załączenia od napięcia zwrotnego (NZ) w zestawie funkcji pola:{' '}
        {nz.blokada_nz ? 'jest' : 'brak'}.
      </p>
    </div>
  );
}

/** Obwody funkcji EAZ pola wg wzorca rozwiązane na aparatach pola (z czego funkcja mierzy, na co
 *  działa). Stan funkcji (aktywna, odstawiona) należy do nastaw zabezpieczeń (ADR-022), których
 *  model nie niesie — karta mówi to jawnie. */
function ObwodyFunkcji({ obwody }: { readonly obwody: readonly ObwodFunkcjiPola[] }): JSX.Element {
  return (
    <div className="mt-2">
      <h4 className="font-semibold">Obwody wtórne funkcji wg wzorca pola</h4>
      <p className="mt-1 text-scada-muted">
        Stan funkcji (aktywna, odstawiona, zablokowana) nieustalony — należy do nastaw zabezpieczeń, których model pola jeszcze nie niesie.
      </p>
      <table
        role="table"
        data-testid="ocena-pola-liniowego-obwody"
        className="mvd-ocena-pola-tabela mt-1 w-full table-fixed border-collapse text-left"
      >
        <NaglowekTabeli kolumny={KOLUMNY_OBWODOW_FUNKCJI} />
        <tbody>
          {obwody.map((o) => (
            <tr
              key={o.kod}
              role="row"
              data-kod={o.kod}
              data-obecna={String(o.obecna)}
              data-weryfikacja={o.weryfikacja}
              className="border-t border-scada-border align-top"
            >
              <td role="cell" data-etykieta={KOLUMNY_OBWODOW_FUNKCJI[0].naglowek} className="pr-2">
                {o.funkcja_pl}
                {o.obecna ? null : <div className="text-scada-muted">we wzorcu, poza zestawem funkcji pola</div>}
              </td>
              <td role="cell" data-etykieta={KOLUMNY_OBWODOW_FUNKCJI[1].naglowek} className="pr-2">
                {o.blok_rysunku ?? '—'}
              </td>
              <td role="cell" data-etykieta={KOLUMNY_OBWODOW_FUNKCJI[2].naglowek} className="pr-2">
                {o.wejscia_pl.join('; ')}
              </td>
              <td role="cell" data-etykieta={KOLUMNY_OBWODOW_FUNKCJI[3].naglowek} className="pr-2">
                {o.wyjscia_pl}
              </td>
              <td role="cell" data-etykieta={KOLUMNY_OBWODOW_FUNKCJI[4].naglowek} title={o.uwaga ?? undefined}>
                {NAZWA_WERYFIKACJI_PL[o.weryfikacja]}
                {o.uwaga ? <div className="text-scada-muted">{o.uwaga}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Sygnały wzorca pola: do wyłącznika, obwody okrężne rozdzielni i sygnały nadrzędne rysunku. */
function SygnalyPola({ obwody }: { readonly obwody: ObwodyWtornePola }): JSX.Element {
  return (
    <div className="mt-2">
      <h4 className="font-semibold">Sygnały pola wg wzorca</h4>
      <p className="mt-1 text-scada-muted">{obwody.podstawa}.</p>
      <ul data-testid="ocena-pola-liniowego-napedy" className="mt-1 text-scada-muted">
        {obwody.napedy.map((n) => (
          <li key={n.aparat} data-testid="ocena-pola-liniowego-naped" data-aparat={n.aparat} data-naped={n.naped}>
            Napęd {n.aparat}: {n.naped_pl} — {NAZWA_WERYFIKACJI_PL[n.weryfikacja]}
            {n.uwaga ? <span className="block">{n.uwaga}</span> : null}
          </li>
        ))}
      </ul>
      <table
        role="table"
        data-testid="ocena-pola-liniowego-sygnaly"
        className="mvd-ocena-pola-tabela mt-1 w-full table-fixed border-collapse text-left"
      >
        <NaglowekTabeli kolumny={KOLUMNY_SYGNALOW_POLA} />
        <tbody>
          {obwody.sygnaly.map((s) => (
            <tr key={s.nazwa} role="row" data-sygnal={s.nazwa} data-weryfikacja={s.weryfikacja} className="border-t border-scada-border align-top">
              <td role="cell" data-etykieta={KOLUMNY_SYGNALOW_POLA[0].naglowek} className="pr-2">
                {s.nazwa}
              </td>
              <td role="cell" data-etykieta={KOLUMNY_SYGNALOW_POLA[1].naglowek} className="pr-2">
                {KIERUNEK_PL[s.kierunek]}
              </td>
              <td role="cell" data-etykieta={KOLUMNY_SYGNALOW_POLA[2].naglowek} className="pr-2">
                {OBWOD_PL[s.obwod]}
                {s.sterownik_pola ? <div className="text-scada-muted">sterownik pola</div> : null}
              </td>
              <td role="cell" data-etykieta={KOLUMNY_SYGNALOW_POLA[3].naglowek} className="pr-2">
                {s.znaczenie_pl ?? 'rozwinięcia skrótu standard nie podaje'}
              </td>
              <td role="cell" data-etykieta={KOLUMNY_SYGNALOW_POLA[4].naglowek} title={s.uwaga ?? undefined}>
                {NAZWA_WERYFIKACJI_PL[s.weryfikacja]}
                {s.uwaga ? <div className="text-scada-muted">{s.uwaga}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
