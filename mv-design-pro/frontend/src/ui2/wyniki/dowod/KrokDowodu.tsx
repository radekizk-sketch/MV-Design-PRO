/*
 * KROK DOWODU (karta E9.1 / W-608) — widok pojedynczego kroku śladu WHITE BOX
 * w kanonie pięciu pól: Wzór → Dane wejściowe → Podstawienie → Wynik → Uwagi.
 * Etykiety pól z `TRACE_FIELD_LABELS`; jednostki przy wartościach; pole nieobecne
 * w kroku → pole pominięte (zero atrap). Matematyka renderowana blokowo przez
 * reużyty `MathBlock` z `ui/proof` (bez modyfikacji tamtego modułu).
 *
 * Powiązanie z modelem: krok z `element_id` → przycisk „Pokaż na schemacie"
 * emitujący selekcję na magistrali zdarzeń powłoki (`ui2/events`). Read-only,
 * zero fizyki, zero mutacji store'ów.
 */

import { TRACE_FIELD_LABELS } from '../../../ui/results-inspector/types';
import { MathBlock } from '../../../ui/proof';
import { emituj } from '../../events';
import type { AdvancementMode } from '../../shell/modeModel';
import { DOWOD_STRINGS } from './strings';
import type { KrokDowoduModel, WartoscDowodu } from './dowodModel';

export interface KrokDowoduProps {
  krok: KrokDowoduModel;
  trybZaawansowania: AdvancementMode;
}

/**
 * Wielkości widoczne w danym trybie: znany klucz (etykieta) zawsze; klucz nieznany
 * (etykieta === null) wyłącznie w trybie eksperckim — inaczej wiersz pominięty
 * (zakaz zgadywania etykiet, zakaz surowych identyfikatorów w pierwszym planie).
 */
function widoczneWielkosci(
  wielkosci: WartoscDowodu[],
  trybEkspercki: boolean,
): WartoscDowodu[] {
  return wielkosci.filter((w) => w.etykieta !== null || trybEkspercki);
}

function ListaWielkosci({
  wielkosci,
  testId,
}: {
  wielkosci: WartoscDowodu[];
  testId: string;
}) {
  return (
    <dl className="mvd-dowod-wielkosci" data-testid={testId}>
      {wielkosci.map((w) => (
        <div className="mvd-dowod-wielkosc" key={w.klucz} data-testid="mvd-dowod-wielkosc">
          <dt className="mvd-dowod-wielkosc-etykieta">
            {w.etykieta ?? <code className="mvd-dowod-klucz">{w.klucz}</code>}
          </dt>
          <dd className="mvd-dowod-wielkosc-wartosc mvd-num">
            {w.wartosc}
            {w.jednostka && <span className="mvd-dowod-unit">{w.jednostka}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function KrokDowodu({ krok, trybZaawansowania }: KrokDowoduProps) {
  const trybEkspercki = trybZaawansowania === 'expert';
  const dane = widoczneWielkosci(krok.dane, trybEkspercki);
  const wynik = widoczneWielkosci(krok.wynik, trybEkspercki);

  const pokazNaSchemacie = () => {
    if (krok.elementId) {
      emituj({ typ: 'selekcja', obiektId: krok.elementId, zrodlo: 'dowod' });
    }
  };

  return (
    <article className="mvd-dowod-krok" data-testid="mvd-dowod-krok">
      <header className="mvd-dowod-krok-head">
        <span className="mvd-dowod-krok-numer mvd-num" aria-hidden="true">
          {krok.numer}
        </span>
        <h3 className="mvd-dowod-krok-tytul">{krok.tytul}</h3>
        {krok.elementId && (
          <button
            type="button"
            className="mvd-btn"
            onClick={pokazNaSchemacie}
            data-mvd-action="selekcja"
            data-testid="mvd-dowod-pokaz-na-schemacie"
          >
            {DOWOD_STRINGS.pokazNaSchemacie}
          </button>
        )}
      </header>

      {/* Wzór */}
      {krok.wzorLatex && (
        <section className="mvd-dowod-pole" data-testid="mvd-dowod-pole-wzor">
          <h4 className="mvd-dowod-pole-tytul">{TRACE_FIELD_LABELS.formula_latex}</h4>
          <div className="mvd-dowod-latex">
            <MathBlock latex={krok.wzorLatex} />
          </div>
        </section>
      )}

      {/* Dane wejściowe */}
      {dane.length > 0 && (
        <section className="mvd-dowod-pole" data-testid="mvd-dowod-pole-dane">
          <h4 className="mvd-dowod-pole-tytul">{TRACE_FIELD_LABELS.inputs}</h4>
          <ListaWielkosci wielkosci={dane} testId="mvd-dowod-dane" />
        </section>
      )}

      {/* Podstawienie */}
      {krok.podstawienie && (
        <section className="mvd-dowod-pole" data-testid="mvd-dowod-pole-podstawienie">
          <h4 className="mvd-dowod-pole-tytul">{TRACE_FIELD_LABELS.substitution}</h4>
          <div className="mvd-dowod-latex">
            <MathBlock latex={krok.podstawienie} />
          </div>
        </section>
      )}

      {/* Wynik */}
      {wynik.length > 0 && (
        <section className="mvd-dowod-pole" data-testid="mvd-dowod-pole-wynik">
          <h4 className="mvd-dowod-pole-tytul">{TRACE_FIELD_LABELS.result}</h4>
          <ListaWielkosci wielkosci={wynik} testId="mvd-dowod-wynik" />
        </section>
      )}

      {/* Uwagi */}
      {krok.uwagi && (
        <section className="mvd-dowod-pole" data-testid="mvd-dowod-pole-uwagi">
          <h4 className="mvd-dowod-pole-tytul">{TRACE_FIELD_LABELS.notes}</h4>
          <p className="mvd-dowod-uwagi">{krok.uwagi}</p>
        </section>
      )}
    </article>
  );
}
