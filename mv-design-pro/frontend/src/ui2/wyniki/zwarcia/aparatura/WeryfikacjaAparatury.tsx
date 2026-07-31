/**
 * WeryfikacjaAparatury — OGNIWO ŁAŃCUCHA „wynik zwarciowy → wytrzymałość
 * aparatury" (karta KD-4; tor Z MODELU — karta KD-6 poz. 2-3).
 *
 * DLACZEGO. Karta K7-B wpięła w konfigurator stacji sekcję werdyktu
 * wytrzymałości (I_dyn / I_th) liczonego przez backend, a KD-4 dołożyła
 * przejście z wyniku zwarciowego. Odbiór KD-4 nazwał jednak dług: aparat brał
 * się WYŁĄCZNIE z ręcznie zapisanej konfiguracji stacji, więc pole, którego
 * inżynier nie skonfigurował, nie istniało dla oceny — mimo że model wie, jaka
 * pozycja katalogu APARAT_SN w nim stoi. KD-6 domyka to ogniwo: werdykty
 * powstają dla WSZYSTKICH pól stacji z aparatami z modelu, a konfiguracja
 * pozostaje nadrzędna tam, gdzie inżynier jej użył (każdy wiersz mówi, skąd
 * wziął aparat).
 *
 * ZERO FIZYKI W PREZENTACJI: ten plik nic nie porównuje i nie skaluje — składa
 * wejścia i pokazuje `message_pl` backendu. Trzy stany werdyktu (wytrzymuje /
 * nie wytrzymuje / NIEUSTALONE) są odwzorowane 1:1 z sekcji K7-B: „nieustalone"
 * to brak podstawy, a nie ocena negatywna.
 */

import { useEffect, useState } from 'react';

import './aparatura.css';
import { useAppStateStore } from '../../../../ui/app-state';
import type { ShortCircuitRow } from '../../../../ui/results-inspector/types';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { fmtKA } from '../strings';
import { pobierzWytrzymaloscAparatury, znacznikWerdyktu, type PoleWytrzymalosci } from './api';
import {
  nazwaStacji,
  powodBrakuPodstawy,
  stacjeDlaPunktu,
  type PowodBrakuPodstawy,
} from './model';
import { APARATURA_STRINGS as T } from './strings';

type Stan =
  | { readonly rodzaj: 'nieuruchomiona' }
  | { readonly rodzaj: 'pracuje' }
  | { readonly rodzaj: 'gotowe'; readonly wiersze: readonly PoleWytrzymalosci[] }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

export interface WeryfikacjaAparaturyProps {
  /** Wiersz WYNIKU wybranego punktu zwarcia (źródło prądów). */
  readonly wiersz: ShortCircuitRow;
  /** Nazwa punktu w języku ekranu (nagłówek sekcji). */
  readonly punktNazwa: string;
  /** Przejście do konfiguracji stacji (akcja naprawcza stanu zerowego). */
  readonly onOtworzKonfiguracjeStacji?: (stationRef: string) => void;
}

/** Etykieta źródła aparatu — inżynier musi wiedzieć, co ocenia. */
function opisZrodla(pole: PoleWytrzymalosci): string {
  return pole.zrodlo === 'model' ? T.zrodloModel : T.zrodloKonfiguracja;
}

export function WeryfikacjaAparatury({
  wiersz,
  punktNazwa,
  onOtworzKonfiguracjeStacji,
}: WeryfikacjaAparaturyProps) {
  const caseId = useAppStateStore((s) => s.activeCaseId);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const [stan, setStan] = useState<Stan>({ rodzaj: 'nieuruchomiona' });
  const [powod, setPowod] = useState<PowodBrakuPodstawy | null>(null);

  const stacje = stacjeDlaPunktu(snapshot, wiersz);
  const ipKA = wiersz.ip_ka;
  const ithKA = wiersz.ith_ka;

  // Zmiana punktu zwarcia unieważnia poprzedni werdykt (inaczej ekran
  // pokazywałby ocenę aparatury INNEGO punktu — najgroźniejszy rodzaj kłamstwa).
  useEffect(() => {
    setStan({ rodzaj: 'nieuruchomiona' });
    setPowod(null);
  }, [wiersz.target_id]);

  const sprawdz = async () => {
    setStan({ rodzaj: 'pracuje' });
    try {
      const zebrane: PoleWytrzymalosci[] = [];
      if (caseId) {
        for (const stationRef of stacje) {
          const widok = await pobierzWytrzymaloscAparatury(caseId, {
            station_ref: stationRef,
            // PRĄDY Z BIEGU — nie z zapisu konfiguracji (tam siedzą liczby,
            // którymi konfigurator dobierał aparat; tutaj sprawdzamy je wynikiem
            // solvera).
            i_peak_ka: ipKA,
            i_thermal_ka: ithKA,
            ik_ka: wiersz.ik_ka ?? null,
          });
          zebrane.push(...widok.pola);
        }
      }

      const brak = powodBrakuPodstawy({
        ipKA,
        ithKA,
        stacje,
        liczbaPol: zebrane.length,
      });
      setPowod(brak);
      setStan({ rodzaj: 'gotowe', wiersze: brak === null ? zebrane : [] });
    } catch (error) {
      setStan({
        rodzaj: 'blad',
        komunikat: error instanceof Error ? error.message : T.blad,
      });
    }
  };

  const komunikatBraku = (p: PowodBrakuPodstawy): string =>
    p === 'brak-pradow'
      ? T.brakPradow
      : p === 'punkt-poza-stacja'
        ? T.punktPozaStacja
        : T.brakAparatury;

  const liczbaPol = stan.rodzaj === 'gotowe' ? stan.wiersze.length : null;

  return (
    <section className="mvd-apar" data-testid="mvd-zwarcia-aparatura">
      <header className="mvd-apar-glowa">
        <div>
          <h3 className="mvd-apar-tytul">
            {T.tytul} — <span className="mvd-apar-punkt">{punktNazwa}</span>
          </h3>
          <p className="mvd-apar-cel">{T.cel}</p>
        </div>
        <button
          type="button"
          className="mvd-apar-akcja"
          data-testid="mvd-zwarcia-aparatura-sprawdz"
          disabled={stan.rodzaj === 'pracuje'}
          onClick={() => void sprawdz()}
        >
          {stan.rodzaj === 'pracuje'
            ? T.pracuje
            : stan.rodzaj === 'nieuruchomiona'
              ? T.akcja
              : T.akcjaPonow}
        </button>
      </header>

      <dl className="mvd-apar-wejscia" data-testid="mvd-zwarcia-aparatura-wejscia">
        <div>
          <dt>{T.wejscieIp}</dt>
          <dd className="mvd-num" data-testid="mvd-zwarcia-aparatura-ip">
            {ipKA === null ? T.kreska : `${fmtKA(ipKA)} ${T.jednKA}`}
            <span className="mvd-apar-zrodlo">{T.zrodloPradow}</span>
          </dd>
        </div>
        <div>
          <dt>{T.wejscieIth}</dt>
          <dd className="mvd-num" data-testid="mvd-zwarcia-aparatura-ith">
            {ithKA === null ? T.kreska : `${fmtKA(ithKA)} ${T.jednKA}`}
            <span className="mvd-apar-zrodlo">{T.zrodloPradow}</span>
          </dd>
        </div>
        <div>
          <dt>{T.wejscieStacja}</dt>
          {/* Strefa pierwszoplanowa mówi NAZWĄ stacji; ref modelu zostaje
              maszynowym atrybutem (podpowiedź i asercje), nie napisem. */}
          <dd
            data-testid="mvd-zwarcia-aparatura-stacje"
            data-stacje-ref={stacje.join(',')}
            title={stacje.join(', ')}
          >
            {stacje.length === 0
              ? T.kreska
              : stacje.map((ref) => nazwaStacji(snapshot, ref)).join(', ')}
          </dd>
        </div>
        <div>
          <dt>{T.wejsciePola}</dt>
          <dd className="mvd-num">
            {liczbaPol === null ? T.kreska : String(liczbaPol)}
            <span className="mvd-apar-zrodlo">{T.zrodloAparatu}</span>
          </dd>
        </div>
      </dl>

      {stan.rodzaj === 'blad' && (
        <p className="mvd-apar-blad" data-testid="mvd-zwarcia-aparatura-blad">
          {T.blad} {stan.komunikat} {T.bladUwaga}
        </p>
      )}

      {stan.rodzaj === 'gotowe' && powod !== null && (
        <div className="mvd-apar-brak" data-testid="mvd-zwarcia-aparatura-brak" data-powod={powod}>
          <p>{caseId ? komunikatBraku(powod) : T.brakPrzypadku}</p>
          {powod === 'brak-aparatury' && stacje.length > 0 && (
            <button
              type="button"
              className="mvd-apar-akcja mvd-apar-akcja--wtorna"
              data-testid="mvd-zwarcia-aparatura-konfiguruj"
              onClick={() => onOtworzKonfiguracjeStacji?.(stacje[0])}
            >
              {T.brakAparaturyAkcja}
            </button>
          )}
        </div>
      )}

      {stan.rodzaj === 'gotowe' && powod === null && (
        <ul className="mvd-apar-werdykty" data-testid="mvd-zwarcia-aparatura-werdykty">
          {stan.wiersze.map((w) => (
            <li
              key={`${w.pole_ref ?? w.pole}::${w.aparat_ref ?? w.aparat_catalog_ref}`}
              className="mvd-apar-werdykt"
              data-testid={`mvd-zwarcia-aparatura-pole-${w.pole}`}
              // Znacznik maszynowy werdyktu: 'true' / 'false' / 'nieustalone'.
              data-withstand-ok={znacznikWerdyktu(w)}
              data-zrodlo={w.zrodlo}
            >
              <span className="mvd-apar-pole mvd-num">{w.pole}</span>
              <span className="mvd-apar-komunikat">{w.komunikat_pl}</span>
              <span
                className="mvd-apar-zrodlo"
                data-testid={`mvd-zwarcia-aparatura-zrodlo-${w.pole}`}
              >
                {opisZrodla(w)}
                {w.aparat_etykieta ? ` · ${w.aparat_etykieta}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mvd-apar-norma">{T.norma}</p>
    </section>
  );
}
