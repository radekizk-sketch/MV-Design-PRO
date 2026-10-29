/**
 * Ocena pola liniowego GPZ wg klasy pola (karta UX-04/POLE-LINIOWE-WZORZEC, rozszerzenie 2) —
 * karta pola SN (ekran E-11).
 *
 * Treść w całości z backendu (`GET /api/cases/{id}/enm/field-view` → `ocena_pola_liniowego`,
 * `enm/pole_liniowe_gpz.py` — to samo źródło co walidator W049–W053): klasa pola (zadeklarowana
 * albo przyjęta z sieci za polem), moduły wytwarzania i odbiory za polem, wymóg pomiaru
 * rozliczeniowego i analizatora jakości energii, ocena każdej funkcji EAZ wobec wymogu klasy
 * i niezgodności z akcją. Status oceny funkcji nigdy nie stoi sam: wiersz niesie etykietę ze
 * słownika backendu, co oceniono, kryterium, podstawę, przyczynę, braki i dowód z zastrzeżeniem
 * kompletności (kontrakt werdyktu wyjaśnialnego). Funkcja zależna od operatora nigdy nie jest „spełnia" — rozstrzygają
 * warunki przyłączenia, których model nie zawiera. Zero reguły w UI.
 */
import type { OcenaPolaLiniowego } from './useFieldReadModel';
import { NAZWA_KLASY_POLA_PL } from './wyposazeniePola';

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
      className="border-t border-scada-border px-3 py-2 text-[length:var(--mvd-font-size-data)] text-scada-text"
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
      <table data-testid="ocena-pola-liniowego-funkcje" className="mt-2 w-full table-fixed border-collapse text-left">
        {/* Szerokości z treści: podstawa normowa i przyczyna to zdania, funkcja i ocena — krótkie. */}
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[32%]" />
          <col className="w-[14%]" />
          <col className="w-[36%]" />
        </colgroup>
        <thead className="text-scada-muted">
          <tr>
            <th className="pr-2 font-medium">Funkcja</th>
            <th className="pr-2 font-medium">Kryterium i podstawa</th>
            <th className="pr-2 font-medium">Ocena</th>
            <th className="font-medium">Przyczyna i dowód</th>
          </tr>
        </thead>
        <tbody>
          {ocena.oceny_funkcji.map((f) => (
            <tr key={f.kod} data-kod={f.kod} data-status={f.status} className="border-t border-scada-border align-top">
              <td className="pr-2">{f.funkcja_pl}</td>
              <td className="pr-2">
                {f.kryterium}
                <div className="text-scada-muted">{f.podstawa}</div>
              </td>
              {/* Etykieta i wyjaśnienie z backendu (`werdykt.etykiety`, poziom kryterium) — karta
                  nie ma własnej mapy „status → tekst” (kontrakt werdyktu §9). */}
              <td className="pr-2" data-semantyka={f.etykieta.semantyka}>
                {f.etykieta.etykieta_pl}
              </td>
              <td>
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
    </section>
  );
}
