/**
 * nN STUDIO (karta P0.9, plan F §1–§5) — zestaw widoków JEDNEGO modelu:
 * wybór stacji/rozdzielnicy nN + zakładki TOPOLOGIA/ODCINKI/NAPIĘCIA/ZWARCIA/
 * SWZ/DOBÓR (zakres wg §0.1 karty — F §2 wymienia dodatkowo OBCIĄŻENIA/
 * ZABEZPIECZENIA/SELEKTYWNOŚĆ/WYNIKI, poza zakresem tej karty, nazwane w
 * meldunku). Wejście z kontekstu stacji: kreator `pole-nn`/`stacja` prowadzi
 * do modelu, ta zakładka pokazuje go i pozwala go rozbudowywać.
 */

import { useMemo, useState } from 'react';

import { useStacjeNn } from '../../../nav/adapters/nnStudioTreeAdapter';
import { EkranDoboruNn } from './EkranDoboruNn';
import { EkranNapiecNn } from './EkranNapiecNn';
import { EkranSwzNn } from './EkranSwzNn';
import { EkranTopologiiNn } from './EkranTopologiiNn';
import { EkranZwarcNn } from './EkranZwarcNn';
import { TabelaOdcinkowNn } from './TabelaOdcinkowNn';
import { NN_STUDIO_STRINGS as T } from './strings';
import './nnStudio.css';

const ZAKLADKI = [
  { id: 'topologia', etykieta: T.zakladkaTopologia },
  { id: 'odcinki', etykieta: T.zakladkaOdcinki },
  { id: 'napiecia', etykieta: T.zakladkaNapiecia },
  { id: 'zwarcia', etykieta: T.zakladkaZwarcia },
  { id: 'swz', etykieta: T.zakladkaSwz },
  { id: 'dobor', etykieta: T.zakladkaDobor },
] as const;

type ZakladkaId = (typeof ZAKLADKI)[number]['id'];

export function NnStudioWarsztat() {
  const stacje = useStacjeNn();
  const [stationRef, setStationRef] = useState<string | null>(null);
  const [zakladka, setZakladka] = useState<ZakladkaId>('topologia');

  const stacjaAktywna = useMemo(
    () => stationRef ?? stacje[0]?.ref_id ?? null,
    [stationRef, stacje],
  );

  if (stacje.length === 0) {
    return (
      <div className="mvd-nn-studio" data-testid="mvd-nn-studio">
        <div className="mvd-nn-studio-stan-pusty" data-testid="mvd-nn-studio-brak-stacji">
          <h3>{T.brakStacjiTytul}</h3>
          <p>{T.brakStacjiOpis}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mvd-nn-studio" data-testid="mvd-nn-studio">
      <header className="mvd-nn-studio-naglowek">
        <p className="mvd-nn-studio-cel">{T.celJednymZdaniem}</p>
        <label className="mvd-nn-studio-pole-etykieta" htmlFor="mvd-nn-studio-stacja">
          {T.wybierzStacje}
        </label>
        <select
          id="mvd-nn-studio-stacja"
          className="mvd-pole-select"
          data-testid="mvd-nn-studio-stacja"
          value={stacjaAktywna ?? ''}
          onChange={(e) => setStationRef(e.target.value)}
        >
          {stacje.map((s) => (
            <option key={s.ref_id} value={s.ref_id}>
              {s.name}
            </option>
          ))}
        </select>
      </header>

      <div role="tablist" aria-label={T.ariaZakladki} className="mvd-model-zakladki">
        {ZAKLADKI.map((z) => (
          <button
            key={z.id}
            role="tab"
            type="button"
            aria-selected={zakladka === z.id}
            tabIndex={zakladka === z.id ? 0 : -1}
            className={zakladka === z.id ? 'mvd-model-zakladka mvd-on' : 'mvd-model-zakladka'}
            data-testid={`mvd-nn-studio-zakladka-${z.id}`}
            onClick={() => setZakladka(z.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const idx = ZAKLADKI.findIndex((x) => x.id === zakladka);
                const krok = e.key === 'ArrowRight' ? 1 : ZAKLADKI.length - 1;
                setZakladka(ZAKLADKI[(idx + krok) % ZAKLADKI.length].id);
              }
            }}
          >
            {z.etykieta}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mvd-nn-studio-tresc">
        {zakladka === 'topologia' && <EkranTopologiiNn stationRef={stacjaAktywna} />}
        {zakladka === 'odcinki' && <TabelaOdcinkowNn stationRef={stacjaAktywna} />}
        {zakladka === 'napiecia' && <EkranNapiecNn />}
        {zakladka === 'zwarcia' && <EkranZwarcNn stationRef={stacjaAktywna} />}
        {zakladka === 'swz' && <EkranSwzNn stationRef={stacjaAktywna} />}
        {zakladka === 'dobor' && <EkranDoboruNn stationRef={stacjaAktywna} />}
      </div>
    </div>
  );
}
