/*
 * Read-only źródłowy audyt WOS/PTPiREE (P0). Ten panel NIE wystawia Werdyktu.
 * Wykorzystuje jednego klienta ui2/oze/ncrfg/api i aktywny model przypadku.
 */
import { useEffect, useState } from 'react';

import {
  pobierzAudytZrodelNcRfg,
  pobierzOceneWydanPrzypadkuNcRfg,
  type AudytWydanPrzypadkuNcRfg,
  type AudytZrodelNcRfg,
} from '../ncrfg/api';

type Stan =
  | { readonly rodzaj: 'brak' | 'ladowanie' }
  | {
      readonly rodzaj: 'gotowe';
      readonly zrodla: AudytZrodelNcRfg;
      readonly wydania: AudytWydanPrzypadkuNcRfg | null;
    }
  | { readonly rodzaj: 'blad'; readonly opis: string };

export interface PanelPodstawRegulacyjnychProps {
  readonly operatorId: string | null;
  readonly caseId: string | null;
}

export function PanelPodstawRegulacyjnych({
  operatorId,
  caseId,
}: PanelPodstawRegulacyjnychProps): JSX.Element {
  const [stan, setStan] = useState<Stan>({ rodzaj: 'brak' });

  useEffect(() => {
    if (operatorId === null) {
      setStan({ rodzaj: 'brak' });
      return;
    }
    let aktywne = true;
    setStan({ rodzaj: 'ladowanie' });
    Promise.all([
      pobierzAudytZrodelNcRfg(operatorId),
      caseId
        ? pobierzOceneWydanPrzypadkuNcRfg(caseId, operatorId)
        : Promise.resolve(null),
    ]).then(
      ([zrodla, wydania]) => {
        if (aktywne) setStan({ rodzaj: 'gotowe', zrodla, wydania });
      },
      (err: unknown) => {
        if (aktywne) setStan({
          rodzaj: 'blad',
          opis: err instanceof Error ? err.message : 'Nie udało się odczytać podstaw.',
        });
      },
    );
    return () => {
      aktywne = false;
    };
  }, [operatorId, caseId]);

  return (
    <section className="mvd-oze-panel-blok" data-testid="mvd-oze-podstawy-regulacyjne">
      <h4>Podstawy regulacyjne i kompletność dowodów</h4>
      <p className="mvd-oze-info">
        Ocena wydania norm i dokumentów nie jest potwierdzeniem spełnienia NC RfG.
        Wyniki obliczeń nie zastępują certyfikatu urządzenia ani badań odbiorowych.
      </p>
      {stan.rodzaj === 'brak' ? (
        <p>Wybierz operatora, aby sprawdzić podstawy.</p>
      ) : null}
      {stan.rodzaj === 'ladowanie' ? <p>Sprawdzanie podstaw źródłowych…</p> : null}
      {stan.rodzaj === 'blad' ? (
        <p role="alert" data-testid="mvd-oze-podstawy-blad">
          Brak dostępu do przeglądu źródeł: {stan.opis}
        </p>
      ) : null}
      {stan.rodzaj === 'gotowe' ? (
        <>
          <p data-testid="mvd-oze-podstawy-stan">
            {stan.zrodla.gotowosc_do_formalnego_potwierdzenia_zgodnosci
              ? 'Podstawy źródłowe kompletne; wymagana odrębna ocena urządzeń i badań.'
              : 'Podstawy niekompletne: formalny dowód zgodności wymaga uzupełnienia.'}
          </p>
          {stan.zrodla.blokery.length > 0 ? (
            <details>
              <summary>Wymagane uzupełnienia źródeł ({stan.zrodla.blokery.length})</summary>
              <ul className="mvd-oze-lista" data-testid="mvd-oze-podstawy-braki">
                {stan.zrodla.blokery.map((item) => (
                  <li key={item.kod}>{item.opis_pl}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {stan.wydania?.wyniki.length ? (
            <div>
              <h5>Wydania dla modułów z modelu</h5>
              <ul className="mvd-oze-lista" data-testid="mvd-oze-podstawy-moduly">
                {stan.wydania.wyniki.map((item) => (
                  <li key={item.der_ref}>
                    <strong>{item.der_ref}</strong>
                    {item.status ? (
                      <span> — {item.powod_pl ?? item.status}</span>
                    ) : item.ocena ? (
                      <span>
                        {' — WOS: '}
                        {item.ocena.wos.wydanie ?? 'nie ustalono'}
                        {', PTPiREE: '}
                        {item.ocena.ptpiree.wydanie ?? 'nie ustalono'}
                        {item.blokery_aktywacji?.length
                          ? ' — nieaktywne w obecnym profilu'
                          : ' — wymaga potwierdzenia podstaw i wyników'}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
