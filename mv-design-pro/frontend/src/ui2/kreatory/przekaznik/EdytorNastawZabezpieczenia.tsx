/**
 * Edytor nastaw zabezpieczenia nadprądowego — pisarz nastaw ścieżki projektanta.
 *
 * Karta BIEG-ZABEZPIECZEN-Z-MODELU (D-21): nastawy bazowe żyją w MODELU przy urządzeniu, a
 * ocena zabezpieczeń (bieg, koordynacja E-28, czasy wyłączenia) czyta je stąd. Zapis idzie
 * operacją domenową `update_protection_settings` (backend: `enm/domain_operations_v2.py`,
 * reguła zapisu `enm/nastawy_zabezpieczen.py::bledy_nastaw`) — nastawy sprzeczne są
 * odrzucane nazwanym błędem, niekompletne przyjmowane (brak nazywa ocena).
 *
 * ZERO fizyki w UI: przeliczenie progu na stronę pierwotną, zakresy katalogu z podstawą i
 * braki z akcją naprawczą pochodzą z read modelu `protection-view` (pole `nastawy`,
 * ta sama funkcja backendu co ocena). Listy wyboru — z pozycji katalogu
 * (`zakresy.charakterystyki`) albo słownika backendu (`slownik_nastaw`), nigdy z UI.
 */

import './edytorNastaw.css';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import type {
  NastawyUrzadzeniaWidok,
  PozycjaSlownika,
  SlownikNastaw,
  ZakresFunkcji,
} from '../../../ui/protection/nastawyModelu';
import { JEDNOSTKA_ZAKRESU_PL } from '../../../ui/protection/nastawyModelu';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { ProtectionSetting } from '../../../types/enm';
import { PoleLiczbowe, PolePrzelacznikBinarny, PoleWyboru } from '../rama';
import { NASTAWY_STRINGS as T } from './stringsNastaw';

/** Funkcje nadprądowe edytowane tym edytorem (ocenia je jedna ścieżka backendu). */
export const FUNKCJE_EDYTORA = ['overcurrent_51', 'overcurrent_50'] as const;
type FunkcjaEdytora = (typeof FUNKCJE_EDYTORA)[number];

/** Stan formularza jednego stopnia (pola puste = `null`, nigdy wartość zastępcza). */
export interface StopienFormularza {
  readonly aktywny: boolean;
  readonly prog: number | null;
  readonly jednostka: '' | 'A_WTORNY' | 'A_PIERWOTNY';
  readonly krzywa: string;
  readonly tms: number | null;
  readonly zwloka: number | null;
}

export type FormularzNastaw = Record<FunkcjaEdytora, StopienFormularza>;

const PUSTY_STOPIEN: StopienFormularza = {
  aktywny: false,
  prog: null,
  jednostka: '',
  krzywa: '',
  tms: null,
  zwloka: null,
};

/** Nastawy modelu (surowe `ProtectionSetting`) → stan formularza. */
export function formularzZNastaw(nastawy: readonly ProtectionSetting[]): FormularzNastaw {
  const wynik = { overcurrent_51: PUSTY_STOPIEN, overcurrent_50: PUSTY_STOPIEN };
  for (const n of nastawy) {
    if (n.function_type !== 'overcurrent_51' && n.function_type !== 'overcurrent_50') continue;
    wynik[n.function_type] = {
      aktywny: true,
      prog: n.threshold_a ?? null,
      jednostka: n.threshold_unit ?? '',
      krzywa: n.curve_type ?? '',
      tms: n.time_multiplier ?? null,
      zwloka: n.time_delay_s ?? null,
    };
  }
  return wynik;
}

/**
 * Stan formularza → lista nastaw do zapisu. Stopień nieaktywny nie trafia na listę; pola
 * puste są pomijane (brak, nie zero). Pola drugiej rodziny czasu (TMS przy DT, zwłoka przy
 * charakterystyce zależnej) nie są wysyłane — backend odrzuciłby je jako sprzeczne.
 * Nastawy innych funkcji przypisania (np. ziemnozwarciowe) zostają bez zmian.
 */
export function nastawyZFormularza(
  formularz: FormularzNastaw,
  pozostale: readonly ProtectionSetting[],
): ProtectionSetting[] {
  const zachowane = pozostale.filter(
    (n) => n.function_type !== 'overcurrent_51' && n.function_type !== 'overcurrent_50',
  );
  const edytowane: ProtectionSetting[] = [];
  for (const funkcja of FUNKCJE_EDYTORA) {
    const s = formularz[funkcja];
    if (!s.aktywny) continue;
    const wpis: ProtectionSetting = { function_type: funkcja };
    if (s.prog !== null) wpis.threshold_a = s.prog;
    if (s.jednostka) wpis.threshold_unit = s.jednostka;
    if (s.krzywa) wpis.curve_type = s.krzywa as ProtectionSetting['curve_type'];
    if (s.krzywa === 'DT') {
      if (s.zwloka !== null) wpis.time_delay_s = s.zwloka;
    } else if (s.krzywa && s.tms !== null) {
      wpis.time_multiplier = s.tms;
    }
    edytowane.push(wpis);
  }
  return [...zachowane, ...edytowane];
}

function liczba(wartosc: number): string {
  return wartosc.toLocaleString('pl-PL', { maximumFractionDigits: 3 });
}

function opisZakresu(
  zakres: ZakresFunkcji | undefined,
  jednostka: 'KROTNOSC_IN' | 'A_WTORNY' | null | undefined,
): string | null {
  if (!zakres || !jednostka) return null;
  return `${liczba(zakres.prog[0])}–${liczba(zakres.prog[1])} ${JEDNOSTKA_ZAKRESU_PL[jednostka]}`;
}

export interface EdytorNastawZabezpieczeniaProps {
  /** Identyfikator przypisania zabezpieczenia w modelu (`protection_ref`). */
  readonly urzadzenieRef: string;
  /** Nastawy rozwiązane przez backend (read model `protection-view`). */
  readonly nastawy: NastawyUrzadzeniaWidok;
  /** Słownik list wyboru z backendu (dla pozycji katalogu bez zakresów). */
  readonly slownik: SlownikNastaw | undefined;
  readonly testid?: string;
}

export function EdytorNastawZabezpieczenia({
  urzadzenieRef,
  nastawy,
  slownik,
  testid = 'mvd-edytor-nastaw',
}: EdytorNastawZabezpieczeniaProps) {
  const caseId = useAppStateStore((s) => s.activeCaseId);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const przypisanie = useSnapshotStore(
    (s) => s.snapshot?.protection_assignments?.find((p) => p.ref_id === urzadzenieRef) ?? null,
  );
  const surowe = useMemo(() => przypisanie?.settings ?? [], [przypisanie]);

  const [formularz, setFormularz] = useState<FormularzNastaw>(() => formularzZNastaw(surowe));
  const [blad, setBlad] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);

  // Model zmienił się (zapis, cofnięcie, inna sesja) — formularz odtwarza stan MODELU.
  useEffect(() => {
    setFormularz(formularzZNastaw(surowe));
  }, [surowe]);

  const charakterystyki: readonly PozycjaSlownika[] =
    nastawy.zakresy?.charakterystyki ?? slownik?.charakterystyki ?? [];
  const jednostki: readonly PozycjaSlownika[] = slownik?.jednostki_progu ?? [];
  const stopnieBackendu = useMemo(
    () => new Map(nastawy.stopnie.map((s) => [s.funkcja, s])),
    [nastawy.stopnie],
  );

  const zmien = useCallback(
    (funkcja: FunkcjaEdytora, zmiana: Partial<StopienFormularza>) =>
      setFormularz((f) => ({ ...f, [funkcja]: { ...f[funkcja], ...zmiana } })),
    [],
  );

  const onZapisz = useCallback(async () => {
    if (!caseId) {
      setBlad(T.brakPrzypadku);
      return;
    }
    setBlad(null);
    setZapisywanie(true);
    try {
      const odpowiedz = await executeDomainOperation(caseId, 'update_protection_settings', {
        protection_ref: urzadzenieRef,
        settings: nastawyZFormularza(formularz, surowe),
      });
      if (!odpowiedz) {
        setBlad(useSnapshotStore.getState().error ?? T.bladZapisu);
      } else if (odpowiedz.error) {
        setBlad(odpowiedz.error);
      }
    } catch (e) {
      setBlad(e instanceof Error ? e.message : T.bladZapisu);
    } finally {
      setZapisywanie(false);
    }
  }, [caseId, executeDomainOperation, formularz, surowe, urzadzenieRef]);

  const przekladnia = nastawy.przekladnia_a
    ? `${liczba(nastawy.przekladnia_a[0])}/${liczba(nastawy.przekladnia_a[1])} A`
    : T.brakPrzekladni;

  return (
    <section className="mvd-edytor-nastaw" data-testid={testid}>
      <header className="mvd-edytor-nastaw-naglowek">
        <h4>{nastawy.nazwa_pl}</h4>
        <dl className="mvd-edytor-nastaw-kontekst">
          <div>
            <dt>{T.przekladnik}</dt>
            <dd data-testid={`${testid}-przekladnia`}>
              {przekladnia}
              {nastawy.klasa_ct ? ` · ${nastawy.klasa_ct}` : ''}
            </dd>
          </div>
          <div>
            <dt>{T.zakresyKatalogu}</dt>
            <dd data-testid={`${testid}-podstawa`}>
              {nastawy.zakresy
                ? `${nastawy.zakresy.model} — ${nastawy.zakresy.podstawa_pl ?? T.jednostkaNieustalona}`
                : T.brakZakresow}
            </dd>
          </div>
        </dl>
      </header>

      {FUNKCJE_EDYTORA.map((funkcja) => {
        const s = formularz[funkcja];
        const etykieta = funkcja === 'overcurrent_51' ? T.stopien51 : T.stopien50;
        const zakres = nastawy.zakresy?.[funkcja];
        const opis = opisZakresu(zakres, nastawy.zakresy?.jednostka_zakresow_pradowych);
        const rozwiazany = stopnieBackendu.get(funkcja);
        return (
          <fieldset
            key={funkcja}
            className="mvd-edytor-nastaw-stopien"
            data-testid={`${testid}-${funkcja}`}
          >
            <PolePrzelacznikBinarny
              etykieta={etykieta}
              wlaczone={s.aktywny}
              onZmiana={(aktywny) => zmien(funkcja, { aktywny })}
              opis={T.stopienAktywnyOpis}
              testid={`${testid}-${funkcja}-aktywny`}
            />
            {s.aktywny ? (
              <div className="mvd-edytor-nastaw-pola">
                <PoleLiczbowe
                  etykieta={T.prog}
                  wartosc={s.prog}
                  onZmiana={(prog) => zmien(funkcja, { prog })}
                  min={0}
                  pomoc={opis ? `${T.zakresPrzekaznika}: ${opis}` : T.zakresNieznany}
                  testid={`${testid}-${funkcja}-prog`}
                />
                <PoleWyboru
                  etykieta={T.jednostka}
                  wartosc={s.jednostka}
                  onZmiana={(jednostka) =>
                    zmien(funkcja, { jednostka: jednostka as StopienFormularza['jednostka'] })
                  }
                  opcje={[
                    { id: '', etykieta: T.wybierz },
                    ...jednostki.map((j) => ({ id: j.kod, etykieta: j.etykieta_pl })),
                  ]}
                  testid={`${testid}-${funkcja}-jednostka`}
                />
                <PoleWyboru
                  etykieta={T.charakterystyka}
                  wartosc={s.krzywa}
                  onZmiana={(krzywa) => zmien(funkcja, { krzywa })}
                  opcje={[
                    { id: '', etykieta: T.wybierz },
                    ...charakterystyki.map((c) => ({ id: c.kod, etykieta: c.etykieta_pl })),
                  ]}
                  testid={`${testid}-${funkcja}-krzywa`}
                />
                {s.krzywa === 'DT' ? (
                  <PoleLiczbowe
                    etykieta={T.zwloka}
                    jednostka="s"
                    wartosc={s.zwloka}
                    onZmiana={(zwloka) => zmien(funkcja, { zwloka })}
                    min={0}
                    testid={`${testid}-${funkcja}-zwloka`}
                  />
                ) : s.krzywa ? (
                  <PoleLiczbowe
                    etykieta={T.tms}
                    wartosc={s.tms}
                    onZmiana={(tms) => zmien(funkcja, { tms })}
                    min={0}
                    testid={`${testid}-${funkcja}-tms`}
                  />
                ) : null}
                {rozwiazany ? (
                  <p className="mvd-edytor-nastaw-wynik" data-testid={`${testid}-${funkcja}-pierwotny`}>
                    {T.progPierwotny(liczba(rozwiazany.prog_pierwotny_a), liczba(rozwiazany.prog_wtorny_a))}
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>
        );
      })}

      {nastawy.braki.length > 0 ? (
        <div className="mvd-edytor-nastaw-braki" data-testid={`${testid}-braki`} role="status">
          <p>{T.brakiTytul}</p>
          <ul>
            {nastawy.braki.map((b) => (
              <li key={`${b.kod}-${b.funkcja ?? ''}-${b.komunikat_pl}`}>
                <span>{b.komunikat_pl}</span> <em>{b.akcja_naprawcza_pl}</em>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mvd-edytor-nastaw-gotowe" data-testid={`${testid}-gotowe`}>
          {T.gotowe}
        </p>
      )}

      {blad ? (
        <p className="mvd-edytor-nastaw-blad" role="alert" data-testid={`${testid}-blad`}>
          {blad}
        </p>
      ) : null}

      <button
        type="button"
        className="mvd-edytor-nastaw-zapisz"
        onClick={() => void onZapisz()}
        disabled={zapisywanie || !caseId}
        data-testid={`${testid}-zapisz`}
      >
        {zapisywanie ? T.zapisywanie : T.zapisz}
      </button>
    </section>
  );
}
