/*
 * BilansIEC — panel „Bilans IEC 60909" wybranego punktu zwarcia
 * (program ZWARCIA-PRO F1, karta właściciela pkt 4: pełny bilans dostępny
 * bez zaglądania do White Box).
 *
 * Wszystkie wielkości pochodzą z wiersza kanonicznego (`ShortCircuitRow`,
 * pola addytywne z FROZEN solvera przez `build_short_circuit_results`).
 * ZERO fizyki w UI — komponent wyłącznie formatuje; starsze wyniki bez pól
 * pokazują uczciwą kreskę. Czytelność przy dużych sieciach: bilans żyje
 * w panelu wybranego punktu, nie w tabeli (§0.4 programu).
 */

import type { ShortCircuitRow } from '../../../ui/results-inspector/types';
import { ZWARCIA_STRINGS, fmtCzas, fmtKA, fmtKV, fmtKappa, fmtMVA, fmtOhm } from './strings';

interface PozycjaBilansu {
  readonly etykieta: string;
  readonly wartosc: string;
  readonly jednostka: string | null;
}

function poz(
  etykieta: string,
  wartosc: number | null | undefined,
  format: (n: number) => string,
  jednostka: string | null,
): PozycjaBilansu {
  return {
    etykieta,
    wartosc: wartosc === null || wartosc === undefined ? ZWARCIA_STRINGS.kreska : format(wartosc),
    jednostka,
  };
}

/** Czysty adapter: wiersz kanoniczny → pozycje bilansu (kolejność normowa). */
export function naBilansIEC(row: ShortCircuitRow): PozycjaBilansu[] {
  const S = ZWARCIA_STRINGS;
  return [
    poz(S.bilansIkss, row.ikss_ka, fmtKA, S.jednKA),
    poz(S.bilansIp, row.ip_ka, fmtKA, S.jednKA),
    poz(S.bilansIth, row.ith_ka, fmtKA, S.jednKA),
    poz(S.bilansIb, row.ib_ka, fmtKA, S.jednKA),
    poz(S.bilansIk, row.ik_ka, fmtKA, S.jednKA),
    poz(S.bilansSk, row.sk_mva, fmtMVA, S.jednMVA),
    poz(S.bilansI2t, row.i2t_ka2s, fmtKappa, S.jednKA2s),
    poz(S.bilansKappa, row.kappa, fmtKappa, null),
    poz(S.bilansXR, row.xr_ratio, fmtKappa, null),
    poz(S.bilansRk, row.rk_ohm, fmtOhm, S.jednOhm),
    poz(S.bilansXk, row.xk_ohm, fmtOhm, S.jednOhm),
    poz(S.bilansZk, row.zk_ohm, fmtOhm, S.jednOhm),
    poz(S.bilansC, row.c_factor, fmtKappa, null),
    poz(S.bilansUn, row.un_kv, fmtKV, S.jednKV),
    poz(S.bilansTk, row.tk_s, fmtCzas, S.jednS),
    poz(S.bilansTb, row.tb_s, fmtCzas, S.jednS),
  ];
}

export function BilansIEC({ row, punktNazwa }: { row: ShortCircuitRow; punktNazwa: string }) {
  return (
    <section
      className="mvd-zwarcia-bilans"
      data-testid="mvd-zwarcia-bilans"
      aria-label={ZWARCIA_STRINGS.bilansTytul}
    >
      <h3 className="mvd-zwarcia-bilans-tytul">
        {ZWARCIA_STRINGS.bilansTytul}
        {': '}
        <span className="mvd-zwarcia-bilans-punkt">{punktNazwa}</span>
      </h3>
      <p className="mvd-zwarcia-bilans-opis">{ZWARCIA_STRINGS.bilansOpis}</p>
      <dl className="mvd-zwarcia-bilans-siatka">
        {naBilansIEC(row).map((p) => (
          <div key={p.etykieta} className="mvd-zwarcia-bilans-poz">
            <dt>{p.etykieta}</dt>
            <dd className="mvd-num">
              {p.wartosc}
              {p.jednostka && p.wartosc !== ZWARCIA_STRINGS.kreska ? ` ${p.jednostka}` : ''}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
