/**
 * Edytor nastaw sterownika zabezpieczeń pola — JEDYNY pisarz nastaw ścieżki projektanta.
 *
 * Karta OCHRONA-JEDNO-ZRODLO (ADR-022): sterownik pola ma funkcje z rejestru funkcji EAZ
 * (50/51, 50N/51N, 67/67N, Y0, 59N, 27/59, 81, 46, 49, 50BF, 79, 21, 87T/L, SZR…), grupy nastaw
 * 1–4 z grupą aktywną i macierz wyzwoleń. Edytor jest GENERYCZNY: wiersze i pola nastaw wynikają
 * ze schematu nastaw rejestru (`funkcjeEaz.ts`, lustro backendu) — funkcja dopisana do rejestru
 * dostaje edycję bez zmiany tego pliku. Zapis idzie JEDNĄ operacją `update_protection_settings`
 * (nastawy wybranej grupy, stan funkcji, profil charakterystyk), która unieważnia wyniki; ocena,
 * czas wyłączenia, wytrzymałość aparatury, schemat i raport czytają ten sam sterownik.
 *
 * Standard warsztatu (§10 kontraktu prezentacji inżynierskiej): funkcja = wiersz zwartej tabeli
 * (kod, nazwa, nastawy z jednostkami, czas, aparat wyzwalany), grupy nastaw jako przełącznik,
 * charakterystyki, braki i obwód wtórny przekładnika — w szczegółach na żądanie.
 *
 * ZERO fizyki w UI: przeliczenie progu na stronę pierwotną, sprawdzenie zakresów i braki
 * z akcją naprawczą pochodzą z read modelu `protection-view` (pole `nastawy`, ta sama funkcja
 * backendu co ocena). Reguła rodziny czasu (TMS przy charakterystyce zależnej, zwłoka przy DT)
 * jest lustrem walidacji zapisu backendu (`enm.nastawy_zabezpieczen.bledy_sterownika`).
 */

import './edytorNastaw.css';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import type { NastawyUrzadzeniaWidok, PozycjaSlownika } from '../../../ui/protection/nastawyModelu';
import { JEDNOSTKA_ZAKRESU_PL } from '../../../ui/protection/nastawyModelu';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { ProtectionAssignment } from '../../../types/enm';
import {
  etykietaFunkcjiEaz,
  etykietaWartosciNastawy,
  funkcjaEaz,
  type SchematNastawyEaz,
} from '../../../ui/shared/funkcjeEaz';
import { aparatyWyzwalaneFunkcji, czyNastawaCzasu, liczbaNastawy } from '../../../ui/shared/opisNastawSterownika';
import {
  nastawyFunkcji,
  nazwaUrzadzeniaSterownika,
  numerGrupyEfektywnej,
} from '../../../ui/shared/sterownikZabezpieczen';
import { NASTAWY_STRINGS as T } from './stringsNastaw';
import { ObwodWtornyPrzekladnika } from './ObwodWtornyPrzekladnika';

/** Numery grup nastaw sterownika (lustro `NUMERY_GRUP_NASTAW` backendu). */
export const NUMERY_GRUP_NASTAW = [1, 2, 3, 4] as const;

/** Wartości formularza jednej funkcji: klucz nastawy → tekst pola (pusty = brak, nie zero). */
export type WartosciFunkcji = Readonly<Record<string, string>>;

/** Stan formularza: nastawy funkcji wybranej grupy i stan włączenia funkcji. */
export interface FormularzSterownika {
  readonly nastawy: Readonly<Record<string, WartosciFunkcji>>;
  readonly wlaczone: Readonly<Record<string, boolean>>;
}

function tekstWartosci(wartosc: number | string | boolean): string {
  if (typeof wartosc === 'boolean') return wartosc ? 'true' : 'false';
  return String(wartosc);
}

/** Sterownik modelu (grupa `numerGrupy`) → stan formularza. */
export function formularzZeSterownika(sterownik: ProtectionAssignment, numerGrupy: number): FormularzSterownika {
  const nastawy: Record<string, WartosciFunkcji> = {};
  const wlaczone: Record<string, boolean> = {};
  for (const f of sterownik.funkcje) {
    wlaczone[f.ref] = f.wlaczona !== false;
    const zModelu = nastawyFunkcji(sterownik, f.ref, numerGrupy);
    nastawy[f.ref] = Object.fromEntries(Object.entries(zModelu).map(([k, v]) => [k, tekstWartosci(v)]));
  }
  return { nastawy, wlaczone };
}

/**
 * Nastawy widoczne w formularzu wg reguły rodziny czasu (lustro walidacji zapisu backendu):
 * funkcja z charakterystyką czasową ma mnożnik TMS tylko przy charakterystyce zależnej, a zwłokę
 * tylko przy czasie niezależnym (DT); bez wybranej charakterystyki — żadnej z nich.
 */
export function czyNastawaWidoczna(schemat: SchematNastawyEaz, wartosci: WartosciFunkcji, zKrzywa: boolean): boolean {
  if (!zKrzywa) return true;
  const krzywa = wartosci.krzywa ?? '';
  if (schemat.klucz === 'tms') return krzywa !== '' && krzywa !== 'DT';
  if (schemat.klucz === 'zwloka_s') return krzywa === 'DT';
  return true;
}

/** Tekst pola → wartość nastawy wg schematu (`null` — pole puste albo nieczytelne). */
export function wartoscZTekstu(schemat: SchematNastawyEaz, tekst: string): number | string | boolean | null {
  const t = tekst.trim();
  if (t === '') return null;
  if (schemat.typ === 'LOGICZNA') return t === 'true';
  if (schemat.typ === 'WYBOR') return t;
  const liczba = Number(t.replace(',', '.'));
  return Number.isFinite(liczba) ? liczba : null;
}

/** Nastawy jednej funkcji do zapisu: tylko pola widoczne i wypełnione (brak, nie zero). */
export function nastawyDoZapisu(kod: string, wartosci: WartosciFunkcji): Record<string, number | string | boolean> {
  const schemat = funkcjaEaz(kod)?.nastawy ?? [];
  const zKrzywa = schemat.some((s) => s.klucz === 'krzywa');
  const wynik: Record<string, number | string | boolean> = {};
  for (const s of schemat) {
    if (!czyNastawaWidoczna(s, wartosci, zKrzywa)) continue;
    const v = wartoscZTekstu(s, wartosci[s.klucz] ?? '');
    if (v !== null) wynik[s.klucz] = v;
  }
  return wynik;
}

/**
 * Ładunek `update_protection_settings` z różnicy formularza i modelu: nastawy TYLKO funkcji
 * zmienionych w wybranej grupie (funkcja niezmieniona zachowuje pochodzenie nastaw, np. wartość
 * roboczą), stan funkcji tylko zmienionych, profil charakterystyk tylko gdy zmieniony.
 * `null` — nic do zapisania.
 */
export function ladunekZapisu(
  sterownik: ProtectionAssignment,
  numerGrupy: number,
  formularz: FormularzSterownika,
  profil: string | null,
): Record<string, unknown> | null {
  const zModelu = formularzZeSterownika(sterownik, numerGrupy);
  const nastawy: Record<string, Record<string, number | string | boolean>> = {};
  const wlaczone: Record<string, boolean> = {};
  for (const f of sterownik.funkcje) {
    const nowe = nastawyDoZapisu(f.kod, formularz.nastawy[f.ref] ?? {});
    const stare = nastawyDoZapisu(f.kod, zModelu.nastawy[f.ref] ?? {});
    if (JSON.stringify(nowe) !== JSON.stringify(stare)) nastawy[f.ref] = nowe;
    if ((formularz.wlaczone[f.ref] ?? true) !== (zModelu.wlaczone[f.ref] ?? true)) {
      wlaczone[f.ref] = formularz.wlaczone[f.ref] ?? true;
    }
  }
  const ladunek: Record<string, unknown> = { protection_ref: sterownik.ref_id };
  if (Object.keys(nastawy).length > 0) {
    ladunek.grupa = numerGrupy;
    ladunek.nastawy = nastawy;
  }
  if (Object.keys(wlaczone).length > 0) ladunek.wlaczone = wlaczone;
  if (profil !== (sterownik.charakterystyki_ref ?? null)) ladunek.charakterystyki_ref = profil;
  return Object.keys(ladunek).length > 1 ? ladunek : null;
}

/** Jednostka pola nastawy w komórce tabeli (strona przekładnika progu idzie z wyboru obok). */
function jednostkaPola(schemat: SchematNastawyEaz): string | null {
  if (schemat.klucz === 'prog' || !schemat.jednostka || schemat.jednostka === '1') return null;
  return schemat.jednostka;
}

function PoleNastawy({
  schemat,
  wartosc,
  onZmiana,
  testid,
}: {
  schemat: SchematNastawyEaz;
  wartosc: string;
  onZmiana: (tekst: string) => void;
  testid: string;
}) {
  if (schemat.typ === 'LOGICZNA') {
    return (
      <label className="mvd-edytor-nastaw-pole" title={schemat.nazwaPl}>
        <input
          type="checkbox"
          checked={wartosc === 'true'}
          onChange={(e) => onZmiana(e.target.checked ? 'true' : 'false')}
          aria-label={schemat.nazwaPl}
          data-testid={testid}
        />
        <span>{schemat.nazwaPl}</span>
      </label>
    );
  }
  if (schemat.typ === 'WYBOR') {
    return (
      <select
        className="mvd-edytor-nastaw-wybor"
        value={wartosc}
        onChange={(e) => onZmiana(e.target.value)}
        aria-label={schemat.nazwaPl}
        title={schemat.nazwaPl}
        data-testid={testid}
      >
        <option value="">{schemat.klucz === 'jednostka_progu' ? T.stronaPusta : T.wybierz}</option>
        {schemat.wartosci.map((w) => (
          <option key={w} value={w}>
            {schemat.klucz === 'jednostka_progu' ? T.stronaSkrot(w) : etykietaWartosciNastawy(w)}
          </option>
        ))}
      </select>
    );
  }
  const jednostka = jednostkaPola(schemat);
  return (
    <span className="mvd-edytor-nastaw-pole" title={schemat.nazwaPl}>
      {schemat.klucz === 'tms' ? <span className="mvd-edytor-nastaw-prefiks">TMS</span> : null}
      <input
        type="number"
        step="any"
        min={0}
        className="mvd-num"
        value={wartosc}
        onChange={(e) => onZmiana(e.target.value)}
        aria-label={schemat.nazwaPl}
        data-testid={testid}
      />
      {jednostka ? <span className="mvd-edytor-nastaw-jednostka">{jednostka}</span> : null}
    </span>
  );
}

function opisProfilu(nastawy: NastawyUrzadzeniaWidok | undefined): string {
  const ch = nastawy?.charakterystyki;
  if (!ch) return T.charakterystykiBrak;
  return `${ch.model} — ${T.zrodloCharakterystyk[ch.zrodlo]}`;
}

function opisZakresow(nastawy: NastawyUrzadzeniaWidok | undefined): string | null {
  const z = nastawy?.zakresy;
  if (!z || !z.jednostka_zakresow_pradowych) return null;
  const j = JEDNOSTKA_ZAKRESU_PL[z.jednostka_zakresow_pradowych];
  const czesci = [
    `I> ${liczbaNastawy(z['51'].prog[0])}–${liczbaNastawy(z['51'].prog[1])} ${j}`,
    `I>> ${liczbaNastawy(z['50'].prog[0])}–${liczbaNastawy(z['50'].prog[1])} ${j}`,
  ];
  if (z['51'].mnoznik) czesci.push(`TMS ${liczbaNastawy(z['51'].mnoznik[0])}–${liczbaNastawy(z['51'].mnoznik[1])}`);
  return czesci.join(' · ');
}

export interface EdytorNastawZabezpieczeniaProps {
  /** Identyfikator sterownika zabezpieczeń w modelu (`protection_ref`). */
  readonly urzadzenieRef: string;
  /** Nastawy rozwiązane przez backend (read model `protection-view`). */
  readonly nastawy?: NastawyUrzadzeniaWidok;
  /** Profile charakterystyk do wyboru (read model `protection-view`). */
  readonly profile?: readonly PozycjaSlownika[];
  readonly testid?: string;
}

export function EdytorNastawZabezpieczenia({
  urzadzenieRef,
  nastawy,
  profile = [],
  testid = 'mvd-edytor-nastaw',
}: EdytorNastawZabezpieczeniaProps) {
  const caseId = useAppStateStore((s) => s.activeCaseId);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const sterownik = useSnapshotStore(
    (s) => s.snapshot?.protection_assignments?.find((p) => p.ref_id === urzadzenieRef) ?? null,
  );
  const pole = useSnapshotStore((s) =>
    sterownik?.bay_ref ? (s.snapshot?.bays?.find((b) => b.ref_id === sterownik.bay_ref) ?? null) : null,
  );
  const galezie = useSnapshotStore((s) => s.snapshot?.branches);

  const aktywna = sterownik ? numerGrupyEfektywnej(sterownik) : 1;
  const [grupa, setGrupa] = useState<number>(aktywna);
  const [formularz, setFormularz] = useState<FormularzSterownika>(() =>
    sterownik ? formularzZeSterownika(sterownik, aktywna) : { nastawy: {}, wlaczone: {} },
  );
  const [profil, setProfil] = useState<string | null>(sterownik?.charakterystyki_ref ?? null);
  const [szczegoly, setSzczegoly] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);

  // Model zmienił się (zapis, cofnięcie, inna sesja) albo wybrano inną grupę — formularz
  // odtwarza stan MODELU wybranej grupy.
  useEffect(() => {
    if (!sterownik) return;
    setFormularz(formularzZeSterownika(sterownik, grupa));
    setProfil(sterownik.charakterystyki_ref ?? null);
  }, [sterownik, grupa]);

  const ladunek = useMemo(
    () => (sterownik ? ladunekZapisu(sterownik, grupa, formularz, profil) : null),
    [sterownik, grupa, formularz, profil],
  );
  // Przeliczenie progu na stronę pierwotną (backend) dotyczy grupy aktywnej — pokazywane tylko
  // przy niej, by nie podpisać nastaw innej grupy liczbą grupy czytanej przez ocenę.
  const progiPierwotne = useMemo(
    () =>
      new Map(grupa === aktywna ? (nastawy?.stopnie ?? []).map((s) => [s.funkcja, s] as const) : []),
    [nastawy?.stopnie, grupa, aktywna],
  );

  const wykonaj = useCallback(
    async (dane: Record<string, unknown>) => {
      if (!caseId) {
        setBlad(T.brakPrzypadku);
        return;
      }
      setBlad(null);
      setZapisywanie(true);
      try {
        const odpowiedz = await executeDomainOperation(caseId, 'update_protection_settings', dane);
        if (!odpowiedz) setBlad(useSnapshotStore.getState().error ?? T.bladZapisu);
        else if (odpowiedz.error) setBlad(odpowiedz.error);
      } catch (e) {
        setBlad(e instanceof Error ? e.message : T.bladZapisu);
      } finally {
        setZapisywanie(false);
      }
    },
    [caseId, executeDomainOperation],
  );

  if (!sterownik) {
    return (
      <p className="mvd-edytor-nastaw-blad" role="alert" data-testid={`${testid}-brak`}>
        {T.brakSterownika}
      </p>
    );
  }

  const zmienNastawe = (ref: string, klucz: string, tekst: string) =>
    setFormularz((f) => ({ ...f, nastawy: { ...f.nastawy, [ref]: { ...(f.nastawy[ref] ?? {}), [klucz]: tekst } } }));
  const przekladnia = nastawy?.przekladnia_a
    ? `${liczbaNastawy(nastawy.przekladnia_a[0])}/${liczbaNastawy(nastawy.przekladnia_a[1])} A${nastawy.klasa_ct ? ` ${nastawy.klasa_ct}` : ''}`
    : T.brakPrzekladni;
  const braki = nastawy?.braki ?? [];
  const nieoceniane = nastawy?.funkcje_nieoceniane ?? [];
  const pierwszyRefKodu = new Map<string, string>();
  for (const f of sterownik.funkcje) if (!pierwszyRefKodu.has(f.kod)) pierwszyRefKodu.set(f.kod, f.ref);
  const zakresy = opisZakresow(nastawy);

  return (
    <section className="mvd-edytor-nastaw" data-testid={testid}>
      <header className="mvd-edytor-nastaw-naglowek">
        <h4>{sterownik.name ?? nazwaUrzadzeniaSterownika(sterownik)}</h4>
        <span className="mvd-edytor-nastaw-kontekst" data-testid={`${testid}-urzadzenie`}>
          {nazwaUrzadzeniaSterownika(sterownik)}
        </span>
        <span className="mvd-edytor-nastaw-kontekst" data-testid={`${testid}-przekladnia`}>
          {T.przekladnikSkrot} {przekladnia}
        </span>
        <div className="mvd-edytor-nastaw-grupy" role="group" aria-label={T.grupaNastaw}>
          <span className="mvd-edytor-nastaw-kontekst">{T.grupaNastaw}</span>
          {NUMERY_GRUP_NASTAW.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={n === grupa}
              data-aktywna={n === aktywna ? 'true' : 'false'}
              title={n === aktywna ? T.grupaAktywnaOpis(n) : T.grupaOpis(n)}
              onClick={() => setGrupa(n)}
              data-testid={`${testid}-grupa-${n}`}
            >
              {n}
            </button>
          ))}
          {grupa !== aktywna ? (
            <button
              type="button"
              className="mvd-edytor-nastaw-ustaw-aktywna"
              disabled={zapisywanie || !caseId}
              onClick={() => void wykonaj({ protection_ref: sterownik.ref_id, aktywna_grupa: grupa })}
              data-testid={`${testid}-ustaw-aktywna`}
            >
              {T.ustawAktywna(grupa)}
            </button>
          ) : null}
        </div>
      </header>

      <table className="mvd-edytor-nastaw-tabela" data-testid={`${testid}-tabela`}>
        <thead>
          <tr>
            <th scope="col" title={T.kolWlaczonaOpis}>
              {T.kolWlaczona}
            </th>
            <th scope="col">{T.kolFunkcja}</th>
            <th scope="col">{T.kolNazwa}</th>
            <th scope="col">{T.kolNastawy}</th>
            <th scope="col">{T.kolCzas}</th>
            <th scope="col">{T.kolWylacza}</th>
          </tr>
        </thead>
        <tbody>
          {sterownik.funkcje.map((f) => {
            const wpis = funkcjaEaz(f.kod);
            const schemat = wpis?.nastawy ?? [];
            const zKrzywa = schemat.some((s) => s.klucz === 'krzywa');
            const wartosci = formularz.nastawy[f.ref] ?? {};
            const widoczne = schemat.filter((s) => czyNastawaWidoczna(s, wartosci, zKrzywa));
            const wlaczona = formularz.wlaczone[f.ref] ?? true;
            const rozwiazany = pierwszyRefKodu.get(f.kod) === f.ref ? progiPierwotne.get(f.kod) : undefined;
            const komorka = (czas: boolean) =>
              widoczne
                .filter((s) => czyNastawaCzasu(s) === czas)
                .map((s) => (
                  <PoleNastawy
                    key={s.klucz}
                    schemat={s}
                    wartosc={wartosci[s.klucz] ?? ''}
                    onZmiana={(t) => zmienNastawe(f.ref, s.klucz, t)}
                    testid={`${testid}-${f.ref}-${s.klucz}`}
                  />
                ));
            return (
              <tr key={f.ref} data-wlaczona={wlaczona ? 'true' : 'false'} data-testid={`${testid}-${f.ref}`}>
                <td>
                  <input
                    type="checkbox"
                    checked={wlaczona}
                    onChange={(e) =>
                      setFormularz((fo) => ({ ...fo, wlaczone: { ...fo.wlaczone, [f.ref]: e.target.checked } }))
                    }
                    aria-label={T.wlaczFunkcje(etykietaFunkcjiEaz(f.kod))}
                    data-testid={`${testid}-${f.ref}-wlaczona`}
                  />
                </td>
                <td className="mvd-edytor-nastaw-kod">{etykietaFunkcjiEaz(f.kod)}</td>
                <td>{wpis?.nazwaPl ?? T.spozaRejestru}</td>
                <td>
                  <div className="mvd-edytor-nastaw-komorka">
                    {schemat.length === 0 ? <span className="mvd-edytor-nastaw-pusto">{T.bezNastaw}</span> : komorka(false)}
                    {rozwiazany ? (
                      <span className="mvd-edytor-nastaw-wynik mvd-num" data-testid={`${testid}-${f.ref}-pierwotny`}>
                        {T.progPierwotny(liczbaNastawy(rozwiazany.prog_pierwotny_a))}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>
                  <div className="mvd-edytor-nastaw-komorka">{komorka(true)}</div>
                </td>
                <td data-testid={`${testid}-${f.ref}-wylacza`}>
                  {aparatyWyzwalaneFunkcji({ branches: galezie }, pole, sterownik, f.ref) ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mvd-edytor-nastaw-stopka">
        <button
          type="button"
          className="mvd-edytor-nastaw-zapisz"
          onClick={() => {
            if (ladunek) void wykonaj(ladunek);
          }}
          disabled={zapisywanie || !caseId || ladunek === null}
          data-testid={`${testid}-zapisz`}
        >
          {zapisywanie ? T.zapisywanie : T.zapisz(grupa)}
        </button>
        <span
          className="mvd-edytor-nastaw-stan"
          data-stan={braki.length > 0 ? 'braki' : 'gotowe'}
          data-testid={braki.length > 0 ? `${testid}-braki-liczba` : `${testid}-gotowe`}
        >
          {braki.length > 0 ? T.brakiLiczba(braki.length) : T.gotowe}
        </span>
        <button
          type="button"
          className="mvd-edytor-nastaw-szczegoly-przycisk"
          aria-expanded={szczegoly}
          onClick={() => setSzczegoly((s) => !s)}
          data-testid={`${testid}-szczegoly-przelacz`}
        >
          {szczegoly ? T.szczegolyZwin : T.szczegoly}
        </button>
      </div>

      {blad ? (
        <p className="mvd-edytor-nastaw-blad" role="alert" data-testid={`${testid}-blad`}>
          {blad}
        </p>
      ) : null}

      {szczegoly ? (
        <div className="mvd-edytor-nastaw-szczegoly" data-testid={`${testid}-szczegoly`}>
          <dl className="mvd-edytor-nastaw-lista">
            <div>
              <dt>{T.charakterystyki}</dt>
              <dd data-testid={`${testid}-charakterystyki`}>
                {opisProfilu(nastawy)}
                {nastawy?.charakterystyki?.powod_pl ? (
                  <span className="mvd-edytor-nastaw-zalozenie"> {nastawy.charakterystyki.powod_pl}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>{T.profilWybor}</dt>
              <dd>
                <select
                  value={profil ?? ''}
                  onChange={(e) => setProfil(e.target.value === '' ? null : e.target.value)}
                  aria-label={T.profilWybor}
                  data-testid={`${testid}-profil`}
                >
                  <option value="">{T.profilZWyrobu}</option>
                  {profile.map((p) => (
                    <option key={p.kod} value={p.kod}>
                      {p.etykieta_pl}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            {zakresy ? (
              <div>
                <dt>{T.zakresyProfilu}</dt>
                <dd className="mvd-num" data-testid={`${testid}-zakresy`}>
                  {zakresy}
                </dd>
              </div>
            ) : null}
          </dl>
          {braki.length > 0 ? (
            <ul className="mvd-edytor-nastaw-braki" data-testid={`${testid}-braki`} role="status">
              {braki.map((b) => (
                <li key={`${b.kod}-${b.funkcja ?? ''}-${b.komunikat_pl}`}>
                  <span>{b.komunikat_pl}</span> <em>{b.akcja_naprawcza_pl}</em>
                </li>
              ))}
            </ul>
          ) : null}
          {nieoceniane.length > 0 ? (
            <ul className="mvd-edytor-nastaw-nieoceniane" data-testid={`${testid}-nieoceniane`}>
              {nieoceniane.map((n) => (
                <li key={n.funkcja}>
                  <strong>{etykietaFunkcjiEaz(n.funkcja)}</strong> — {n.powod_pl}
                </li>
              ))}
            </ul>
          ) : null}
          {nastawy?.ct_ref ? <ObwodWtornyPrzekladnika ctRef={nastawy.ct_ref} testid={`${testid}-obwod`} /> : null}
        </div>
      ) : null}
    </section>
  );
}
