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
 *
 * Edytor pisze nastawy BAZOWE modelu. Przypadki obliczeniowe, które wybierają inną grupę albo
 * nadpisują nastawy (ADR-022, sekcja „Zabezpieczenia w tym przypadku" karty przypadku), są
 * oznaczone przy funkcji i pod tabelą (`ZnacznikiPrzypadkow`).
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
  funkcjaEaz,
  RODZAJ_FUNKCJI_EAZ_PL,
  wszystkieFunkcjeEaz,
} from '../../../ui/shared/funkcjeEaz';
import { aparatyWyzwalaneFunkcji, czyNastawaCzasu, liczbaNastawy } from '../../../ui/shared/opisNastawSterownika';
import {
  nastawyFunkcji,
  nazwaUrzadzeniaSterownika,
  numerGrupyEfektywnej,
} from '../../../ui/shared/sterownikZabezpieczen';
import { NASTAWY_STRINGS as T } from './stringsNastaw';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import { ZABEZPIECZENIA_PRZYPADKU_STRINGS as TP } from '../../spaces/obliczenia/zabezpieczenia/stringsZabezpieczenPrzypadku';
import {
  useZnacznikiPrzypadkow,
  ZnacznikiPrzypadkow,
} from '../../spaces/obliczenia/zabezpieczenia/ZnacznikiPrzypadkow';
import { czyNastawaWidoczna, PoleNastawy, wartoscZTekstu, type WartosciFunkcji } from './PoleNastawy';
import { ObwodWtornyPrzekladnika } from './ObwodWtornyPrzekladnika';
import { TekstZWzorami } from '../rama/tekstZWzorami';
import { nazwaPoReferencjiPl } from '../../../ui/shared/nazwaObiektu';

/** Numery grup nastaw sterownika (lustro `NUMERY_GRUP_NASTAW` backendu). */
export const NUMERY_GRUP_NASTAW = [1, 2, 3, 4] as const;


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

/**
 * Ładunek zmiany SKŁADU funkcji sterownika (`update_protection_settings` → `funkcje`: pełna lista
 * kodów w kolejności sterownika). Dodanie dopisuje kod na końcu; zdjęcie usuwa go z listy —
 * backend zdejmuje funkcję razem z nastawami we wszystkich grupach i wierszem macierzy
 * (`enm.zabezpieczenie.ustaw_zestaw_funkcji`). `null` — zmiana bez skutku (kod już jest / nie ma).
 */
export function ladunekSkladuFunkcji(
  sterownik: ProtectionAssignment,
  zmiana: { readonly dodaj: string } | { readonly zdejmij: string },
): Record<string, unknown> | null {
  const kody = sterownik.funkcje.map((f) => f.kod);
  if ('dodaj' in zmiana) {
    if (zmiana.dodaj === '' || kody.includes(zmiana.dodaj)) return null;
    return { protection_ref: sterownik.ref_id, funkcje: [...kody, zmiana.dodaj] };
  }
  if (!kody.includes(zmiana.zdejmij)) return null;
  return { protection_ref: sterownik.ref_id, funkcje: kody.filter((k) => k !== zmiana.zdejmij) };
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
    `I> od ${liczbaNastawy(z['51'].prog[0])} do ${liczbaNastawy(z['51'].prog[1])} ${j}`,
    `I>> od ${liczbaNastawy(z['50'].prog[0])} do ${liczbaNastawy(z['50'].prog[1])} ${j}`,
  ];
  if (z['51'].mnoznik) czesci.push(`TMS od ${liczbaNastawy(z['51'].mnoznik[0])} do ${liczbaNastawy(z['51'].mnoznik[1])}`);
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
  const znacznikiPrzypadkow = useZnacznikiPrzypadkow(caseId, sterownik);
  const przypadki = useStudyCasesStore((s) => s.cases);

  const aktywna = sterownik ? numerGrupyEfektywnej(sterownik) : 1;
  const [grupa, setGrupa] = useState<number>(aktywna);
  const [formularz, setFormularz] = useState<FormularzSterownika>(() =>
    sterownik ? formularzZeSterownika(sterownik, aktywna) : { nastawy: {}, wlaczone: {} },
  );
  const [profil, setProfil] = useState<string | null>(sterownik?.charakterystyki_ref ?? null);
  const [szczegoly, setSzczegoly] = useState(false);
  const [doDodania, setDoDodania] = useState('');
  const [doZdjecia, setDoZdjecia] = useState('');
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
            const nadpisaneW = znacznikiPrzypadkow
              .filter((z) => Object.keys(z.nastawy[f.ref] ?? {}).length > 0)
              .map((z) => nazwaPoReferencjiPl(przypadki, z.caseId, 'przypadek'));
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
                <td>
                  {wpis?.nazwaPl ?? T.spozaRejestru}
                  {nadpisaneW.length > 0 ? (
                    <span className="mvd-edytor-nastaw-w-przypadkach" data-testid={`${testid}-${f.ref}-w-przypadkach`}>
                      {TP.nadpisaneW(nadpisaneW)}
                    </span>
                  ) : null}
                </td>
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

      <ZnacznikiPrzypadkow sterownik={sterownik} znaczniki={znacznikiPrzypadkow} testid={`${testid}-przypadki`} />

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
            <div data-testid={`${testid}-sklad`}>
              <dt>{T.skladFunkcji}</dt>
              <dd className="mvd-edytor-nastaw-sklad">
                <select
                  value={doDodania}
                  onChange={(e) => setDoDodania(e.target.value)}
                  aria-label={T.skladDodajWybor}
                  data-testid={`${testid}-sklad-dodaj-wybor`}
                >
                  <option value="">{T.skladDodajPusty}</option>
                  {wszystkieFunkcjeEaz()
                    .filter((w) => !sterownik.funkcje.some((f) => f.kod === w.kod))
                    .map((w) => (
                      <option key={w.kod} value={w.kod}>
                        {`${etykietaFunkcjiEaz(w.kod)} — ${w.nazwaPl} (${RODZAJ_FUNKCJI_EAZ_PL[w.rodzaj]})`}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={zapisywanie || !caseId || ladunekSkladuFunkcji(sterownik, { dodaj: doDodania }) === null}
                  onClick={() => {
                    const dane = ladunekSkladuFunkcji(sterownik, { dodaj: doDodania });
                    if (dane) void wykonaj(dane).then(() => setDoDodania(''));
                  }}
                  data-testid={`${testid}-sklad-dodaj`}
                >
                  {T.skladDodaj}
                </button>
                <select
                  value={doZdjecia}
                  onChange={(e) => setDoZdjecia(e.target.value)}
                  aria-label={T.skladZdejmijWybor}
                  data-testid={`${testid}-sklad-zdejmij-wybor`}
                >
                  <option value="">{T.skladZdejmijPusty}</option>
                  {sterownik.funkcje.map((f) => (
                    <option key={f.ref} value={f.kod}>
                      {etykietaFunkcjiEaz(f.kod)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={zapisywanie || !caseId || ladunekSkladuFunkcji(sterownik, { zdejmij: doZdjecia }) === null}
                  onClick={() => {
                    const dane = ladunekSkladuFunkcji(sterownik, { zdejmij: doZdjecia });
                    if (dane) void wykonaj(dane).then(() => setDoZdjecia(''));
                  }}
                  data-testid={`${testid}-sklad-zdejmij`}
                >
                  {T.skladZdejmij}
                </button>
                <span className="mvd-edytor-nastaw-zalozenie">{T.skladOpis}</span>
              </dd>
            </div>
            {zakresy ? (
              <div>
                <dt>{T.zakresyProfilu}</dt>
                <dd className="mvd-num" data-testid={`${testid}-zakresy`}>
                  <TekstZWzorami tekst={zakresy} />
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
