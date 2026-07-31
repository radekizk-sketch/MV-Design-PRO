/**
 * WeryfikacjaAparatury — OGNIWO ŁAŃCUCHA „wynik zwarciowy → wytrzymałość
 * aparatury" (karta KD-4; dług nazwany imiennie w V12K-287).
 *
 * DLACZEGO. Karta K7-B wpięła w konfigurator stacji sekcję werdyktu
 * wytrzymałości (I_dyn / I_th) liczonego przez backend, ale odbiór zamknął się
 * z nazwanym brakiem: „brak przejścia z wyniku zwarciowego do weryfikacji
 * aparatu". Inżynier widział prądy zwarciowe w jednym oknie, a odpowiedź na
 * pytanie „czy aparatura to wytrzyma" w zupełnie innym — i musiał je zestawiać
 * w głowie. Ta sekcja domyka łańcuch: prądy TEGO punktu z TEGO biegu jadą do
 * TEJ SAMEJ końcówki walidacji, którą wpięła K7-B.
 *
 * ZERO FIZYKI W PREZENTACJI: ten plik nic nie porównuje i nie skaluje — składa
 * wejścia i pokazuje `message_pl` backendu. Trzy stany werdyktu (wytrzymuje /
 * nie wytrzymuje / NIEUSTALONE dla aparatu spoza katalogu) są odwzorowane 1:1
 * z sekcji K7-B: „nieustalone" to brak podstawy, a nie ocena negatywna.
 */

import { useEffect, useState } from 'react';

import './aparatura.css';
import { useAppStateStore } from '../../../../ui/app-state';
import {
  fetchDeviceWithstandCatalog,
  getStationAudit2Config,
  validateDeviceWithstandApi,
  type DeviceWithstandValidationResponse,
} from '../../../../ui/network-build/station-der/audit2-api';
import type { ShortCircuitRow } from '../../../../ui/results-inspector/types';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { fmtKA } from '../strings';
import {
  polaDoSprawdzenia,
  powodBrakuPodstawy,
  stacjeDlaPunktu,
  type PoleDoSprawdzenia,
  type PowodBrakuPodstawy,
} from './model';
import { APARATURA_STRINGS as T } from './strings';

/** Wiersz werdyktu jednego pola (odpowiedź backendu albo brak podstawy). */
interface WierszWerdyktu {
  readonly stationRef: string;
  readonly bayDesignation: string;
  /** `null` = APARAT SPOZA KATALOGU — brak podstawy, nie werdykt negatywny. */
  readonly odpowiedz: DeviceWithstandValidationResponse | null;
  readonly komunikat: string;
}

type Stan =
  | { readonly rodzaj: 'nieuruchomiona' }
  | { readonly rodzaj: 'pracuje' }
  | { readonly rodzaj: 'gotowe'; readonly wiersze: readonly WierszWerdyktu[] }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

export interface WeryfikacjaAparaturyProps {
  /** Wiersz WYNIKU wybranego punktu zwarcia (źródło prądów). */
  readonly wiersz: ShortCircuitRow;
  /** Nazwa punktu w języku ekranu (nagłówek sekcji). */
  readonly punktNazwa: string;
  /** Przejście do konfiguracji stacji (akcja naprawcza stanu zerowego). */
  readonly onOtworzKonfiguracjeStacji?: (stationRef: string) => void;
}

export function WeryfikacjaAparatury({
  wiersz,
  punktNazwa,
  onOtworzKonfiguracjeStacji,
}: WeryfikacjaAparaturyProps) {
  const projectId = useAppStateStore((s) => s.activeProjectId);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const [stan, setStan] = useState<Stan>({ rodzaj: 'nieuruchomiona' });
  const [pola, setPola] = useState<readonly PoleDoSprawdzenia[]>([]);
  const [powod, setPowod] = useState<PowodBrakuPodstawy | null>(null);

  const stacje = stacjeDlaPunktu(snapshot, wiersz);
  const ipKA = wiersz.ip_ka;
  const ithKA = wiersz.ith_ka;

  // Zmiana punktu zwarcia unieważnia poprzedni werdykt (inaczej ekran
  // pokazywałby ocenę aparatury INNEGO punktu — najgroźniejszy rodzaj kłamstwa).
  useEffect(() => {
    setStan({ rodzaj: 'nieuruchomiona' });
    setPola([]);
    setPowod(null);
  }, [wiersz.target_id]);

  const sprawdz = async () => {
    setStan({ rodzaj: 'pracuje' });
    try {
      // Konfiguracja stacji: aparat pola + czas wyłączenia (ten sam zapis, który
      // wypełnia kartę zabezpieczeń konfiguratora).
      const zebrane: PoleDoSprawdzenia[] = [];
      if (projectId) {
        for (const stationRef of stacje) {
          const config = await getStationAudit2Config(projectId, stationRef);
          zebrane.push(
            ...polaDoSprawdzenia({
              stationRef,
              bayDeviceWithstand: config?.bay_device_withstand,
              ipKA,
              ithKA,
            }),
          );
        }
      }
      setPola(zebrane);

      const brak = powodBrakuPodstawy({
        ipKA,
        ithKA,
        stacje,
        liczbaPol: zebrane.length,
      });
      setPowod(brak);
      if (brak !== null) {
        setStan({ rodzaj: 'gotowe', wiersze: [] });
        return;
      }

      const katalog = await fetchDeviceWithstandCatalog();
      const wiersze = await Promise.all(
        zebrane.map(async (pole): Promise<WierszWerdyktu> => {
          if (!katalog.some((aparat) => aparat.id === pole.deviceCatalogRef)) {
            // APARAT SPOZA KATALOGU BACKENDU — brak podstawy do sprawdzenia
            // (rozstrzygnięcie przeniesione z sekcji K7-B, V12K-257/287).
            return {
              stationRef: pole.stationRef,
              bayDesignation: pole.bayDesignation,
              odpowiedz: null,
              komunikat:
                `Aparat ${pole.deviceCatalogRef} nie występuje w katalogu — `
                + 'wytrzymałości zwarciowej nie da się sprawdzić.',
            };
          }
          const odpowiedz = await validateDeviceWithstandApi({
            device_id: pole.deviceCatalogRef,
            i_peak_calculated_ka: pole.i_peak_calculated_ka,
            i_thermal_calculated_ka: pole.i_thermal_calculated_ka,
            t_clearing_s: pole.t_clearing_s,
          });
          return {
            stationRef: pole.stationRef,
            bayDesignation: pole.bayDesignation,
            odpowiedz,
            komunikat: odpowiedz.message_pl,
          };
        }),
      );
      setStan({ rodzaj: 'gotowe', wiersze });
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
          <dd data-testid="mvd-zwarcia-aparatura-stacje">
            {stacje.length === 0 ? T.kreska : stacje.join(', ')}
          </dd>
        </div>
        <div>
          <dt>{T.wejsciePola}</dt>
          <dd className="mvd-num">
            {stan.rodzaj === 'nieuruchomiona' ? T.kreska : String(pola.length)}
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
          <p>{projectId ? komunikatBraku(powod) : T.brakProjektu}</p>
          {powod === 'brak-aparatury-w-konfiguracji' && stacje.length > 0 && (
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
              key={`${w.stationRef}::${w.bayDesignation}`}
              className="mvd-apar-werdykt"
              data-testid={`mvd-zwarcia-aparatura-pole-${w.bayDesignation}`}
              // Znacznik maszynowy werdyktu: 'true' / 'false' / 'nieustalone'.
              data-withstand-ok={w.odpowiedz === null ? T.poza : String(w.odpowiedz.ok)}
            >
              <span className="mvd-apar-pole mvd-num">{w.bayDesignation}</span>
              <span className="mvd-apar-komunikat">{w.komunikat}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mvd-apar-norma">{T.norma}</p>
    </section>
  );
}
