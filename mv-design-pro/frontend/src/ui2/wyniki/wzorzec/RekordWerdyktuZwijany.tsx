/*
 * REKORD WERDYKTU ZWIJANY — wiersz pierwszego planu rekordu K (`OcenaKryterium`) z pełną
 * `KartaWerdyktu` rozwijaną na żądanie (kontrakt werdyktu wyjaśnialnego §9; karta
 * FIX-E2E-PELNE, decyzja architekta dla sekcji aparatury).
 *
 * Osobny plik, bo `KartaWerdyktu.tsx` jest przypięta jako źródło, które NIE czyta statusu
 * maszynowego (karta nie zna reguł K/W). Ten komponent czyta `status_maszynowy` w trzech
 * miejscach i tylko tam: atrybut `data-status` wiersza i plakietki (filtry, testy) oraz stan
 * startowy zwinięcia (`STATUSY_ROZWINIETE`). Tekst i kolor biorą się wyłącznie z rekordu
 * backendu.
 */
import { useId, useState } from 'react';

import { MathInline } from '../../../ui/proof/MathRenderer';
import {
  EtykietaWerdyktu,
  KartaWerdyktu,
  NAZWA_RELACJI_PL,
  NAZWA_STANU_ZRODLA_PL,
  SEMANTYKA_KOLOR,
  TEKSTY,
  wielkoscPl,
  type StylKarty,
} from './KartaWerdyktu';
import type { LimitKryterium, Margines, OcenaKryterium, Relacja, StatusWerdyktu } from './werdykt';
import { useNazwaObiektu } from './useNazwaObiektu';
import './kartaWerdyktu.css';

const TEKSTY_REKORDU = {
  pokazSzczegoly: 'Pokaż wyjaśnienie i dowód',
  ukryjSzczegoly: 'Ukryj wyjaśnienie i dowód',
  obwiednia: 'obwiednia',
  punktowObwiedni: 'punktów',
} as const;

// ---------------------------------------------------------------------------
// Rekord zwijany (lista rekordów K: wiersz pierwszego planu, pełna karta na żądanie)
// ---------------------------------------------------------------------------

/** Statusy, przy których rekord zwijany startuje ROZWINIĘTY: projektant ma od razu widzieć
 *  wyjaśnienie tego, co nie spełnia warunku albo nie daje się rozstrzygnąć (decyzja architekta,
 *  karta FIX-E2E-PELNE). To JEDYNE miejsce interfejsu, w którym literał statusu wpływa na
 *  prezentację — i wpływa wyłącznie na stan zwinięcia, nigdy na tekst ani kolor (tekst niesie
 *  `etykieta.etykieta_pl`, kolor `SEMANTYKA_KOLOR[etykieta.semantyka]`; przypięte testem). */
export const STATUSY_ROZWINIETE: ReadonlySet<StatusWerdyktu> = new Set<StatusWerdyktu>([
  'NIE_SPELNIA',
  'NIEJEDNOZNACZNY',
]);

function LimitZwiezly({
  limit,
  relacja,
}: {
  readonly limit: LimitKryterium | null;
  readonly relacja: Relacja;
}) {
  if (relacja === 'LOGICZNE') return <>{TEKSTY.limitLogiczny}</>;
  if (limit === null) return <>{TEKSTY.limitBrak}</>;
  const podstawa = limit.podstawa;
  return (
    <>
      {NAZWA_RELACJI_PL[relacja]}:{' '}
      {limit.wartosc !== null && <strong className="mvd-num">{wielkoscPl(limit.wartosc)}</strong>}
      {limit.pasmo !== null && (
        <strong className="mvd-num">
          {TEKSTY.pasmoOd} {wielkoscPl(limit.pasmo[0])} {TEKSTY.pasmoDo} {wielkoscPl(limit.pasmo[1])}
        </strong>
      )}
      {limit.obwiednia !== null && (
        <strong className="mvd-num">
          {TEKSTY_REKORDU.obwiednia} ({limit.obwiednia.length} {TEKSTY_REKORDU.punktowObwiedni}
          {limit.jednostka_obwiedni !== null ? `, ${limit.jednostka_obwiedni}` : ''})
        </strong>
      )}
      {' · '}
      <span className="mvd-werdykt-zwijany-podstawa" data-stan-zrodla={podstawa.status}>
        {TEKSTY.podstawaLimitu.toLowerCase()}: {podstawa.jednostka_redakcyjna ?? `„${podstawa.dokument}”`} (
        {NAZWA_STANU_ZRODLA_PL[podstawa.status]})
      </span>
    </>
  );
}

function MarginesZwiezly({ margines }: { readonly margines: Margines | null }) {
  if (margines === null) return <>{TEKSTY.marginesBrak}</>;
  if (margines.wartosc === null) {
    return (
      <>
        {TEKSTY.marginesNiedefiniowalny}
        {margines.powod_pl !== null ? ` — ${margines.powod_pl}` : ''}
      </>
    );
  }
  return <strong className="mvd-num">{wielkoscPl(margines.wartosc, true)}</strong>;
}

export interface RekordWerdyktuZwijanyProps {
  /** PEŁNY rekord K z backendu — wiersz pokazuje jego pierwszy plan, karta całość. */
  readonly rekord: OcenaKryterium;
}

/**
 * Rekord K jako WIERSZ pierwszego planu kontraktu werdyktu (§9): ocena (etykieta z rekordu),
 * co oceniono, kryterium z warunkiem, wynik z jednostką, limit z podstawą i stanem źródła,
 * margines. Wiersz sam wyjaśnia werdykt — nigdy goła etykieta. Pełna `KartaWerdyktu`
 * (wyjaśnienie, podstawa, dowód, kompletność, zakres, ślad) rozwija się natywnym przyciskiem
 * z `aria-expanded` (klik albo Enter/spacja). Rekordy `NIE_SPELNIA` i `NIEJEDNOZNACZNY`
 * startują rozwinięte (`STATUSY_ROZWINIETE`). Lista dziewięciu rozwiniętych kart po ~2 400 px
 * w sekcji aparatury była nieczytelna (pomiar e2e kd6, karta FIX-E2E-PELNE).
 */
export function RekordWerdyktuZwijany({ rekord }: RekordWerdyktuZwijanyProps) {
  const [otwarty, setOtwarty] = useState(STATUSY_ROZWINIETE.has(rekord.status_maszynowy));
  const idKarty = useId();
  const nazwaObiektu = useNazwaObiektu();
  const testId = `mvd-werdykt-zwijany-${rekord.kryterium_id}`;
  const relacja = rekord.kryterium.relacja;
  const styl: StylKarty = { '--mvd-werdykt-kolor': SEMANTYKA_KOLOR[rekord.etykieta.semantyka] };
  const przedmiot =
    rekord.przedmiot.element_ref !== null
      ? nazwaObiektu(rekord.przedmiot.element_ref, rekord.przedmiot.nazwa_pl)
      : rekord.przedmiot.nazwa_pl;
  return (
    <article
      className="mvd-werdykt-zwijany"
      style={styl}
      data-testid={testId}
      data-status={rekord.status_maszynowy}
      data-semantyka={rekord.etykieta.semantyka}
    >
      <div className="mvd-werdykt-zwijany-wiersz">
        <EtykietaWerdyktu
          etykieta={rekord.etykieta}
          status={rekord.status_maszynowy}
          testid={`${testId}-ocena`}
        />
        <span className="mvd-werdykt-zwijany-kryterium" data-testid={`${testId}-kryterium`}>
          {rekord.kryterium.opis_pl}
          {rekord.kryterium.warunek_latex.trim() !== '' && (
            <>
              {' '}
              <MathInline latex={rekord.kryterium.warunek_latex} />
            </>
          )}
        </span>
        <span className="mvd-werdykt-zwijany-pole" data-testid={`${testId}-przedmiot`}>
          <span className="mvd-werdykt-para-nazwa">{TEKSTY.przedmiot}:</span> {przedmiot}
        </span>
        <span className="mvd-werdykt-zwijany-pole" data-testid={`${testId}-wynik`}>
          <span className="mvd-werdykt-para-nazwa">{TEKSTY.wynik}:</span>{' '}
          {rekord.wynik === null ? (
            TEKSTY.nieWyznaczono
          ) : (
            <>
              {rekord.wynik.symbol_latex.trim() !== '' && (
                <>
                  <MathInline latex={rekord.wynik.symbol_latex} />{' '}
                </>
              )}
              <strong className="mvd-num">{wielkoscPl(rekord.wynik.wartosc)}</strong>
            </>
          )}
        </span>
        <span className="mvd-werdykt-zwijany-pole" data-testid={`${testId}-limit`}>
          <span className="mvd-werdykt-para-nazwa">{TEKSTY.limit}:</span>{' '}
          <LimitZwiezly limit={rekord.limit} relacja={relacja} />
        </span>
        <span className="mvd-werdykt-zwijany-pole" data-testid={`${testId}-margines`}>
          <span className="mvd-werdykt-para-nazwa">{TEKSTY.margines}:</span>{' '}
          <MarginesZwiezly margines={rekord.margines} />
        </span>
        <button
          type="button"
          className="mvd-werdykt-zwijany-przelacz"
          aria-expanded={otwarty}
          aria-controls={otwarty ? idKarty : undefined}
          data-testid={`${testId}-przelacz`}
          onClick={() => setOtwarty((stan) => !stan)}
        >
          {otwarty ? TEKSTY_REKORDU.ukryjSzczegoly : TEKSTY_REKORDU.pokazSzczegoly}
        </button>
      </div>
      {otwarty && (
        <div id={idKarty} className="mvd-werdykt-zwijany-karta" data-testid={`${testId}-karta`}>
          <KartaWerdyktu rekord={rekord} />
        </div>
      )}
    </article>
  );
}
