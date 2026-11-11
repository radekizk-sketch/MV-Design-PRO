/**
 * Sekcja „Zabezpieczenia w tym przypadku" karty przypadku obliczeniowego (ADR-022, karta
 * EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN).
 *
 * Dla każdego sterownika zabezpieczeń pola z modelu sieci: wybór grupy nastaw przypadku (tylko
 * grupy zdefiniowane w modelu) i lista nadpisań (funkcja, nastawa, wartość bazowa Z MODELU →
 * wartość w przypadku, z jednostką) z dodawaniem i usuwaniem. Pole wartości to TO SAMO pole co
 * w edytorze nastaw karty pola (`PoleNastawy` — jeden odczyt tekstu wg schematu rejestru), a zapis
 * idzie końcówką delty przypadku, którą backend sprawdza tą samą regułą co zapis nastaw modelu
 * (`bledy_sterownika`); sprzeczność wraca jako 422 z polem i zdaniem i jest pokazana wprost.
 * Zapis nie zmienia modelu sieci; unieważnia wyłącznie wyniki tego przypadku (backend), a karta
 * odświeża status przypadku przez `onZapisano`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ProtectionAssignment } from '../../../../types/enm';
import { etykietaFunkcjiEaz, funkcjaEaz } from '../../../../ui/shared/funkcjeEaz';
import { zapisWartosciNastawy } from '../../../../ui/shared/opisNastawSterownika';
import {
  nastawyFunkcji,
  nazwaUrzadzeniaSterownika,
  numerGrupyEfektywnej,
  sterowniki as sterownikiModelu,
} from '../../../../ui/shared/sterownikZabezpieczen';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { PoleNastawy } from '../../../kreatory/przekaznik/PoleNastawy';
import {
  czyZmieniony,
  dodajNadpisanie,
  FORMULARZ_PUSTY,
  formularzZWyboru,
  grupaEfektywnaPrzypadku,
  grupyModelu,
  ladunekWyboru,
  pobierzWybor,
  schematNastawy,
  wartoscBazowa,
  zapiszWybor,
  type FormularzWyboru,
  type WyborZabezpieczenPrzypadku,
} from './wyborZabezpieczen';
import { ZABEZPIECZENIA_PRZYPADKU_STRINGS as T } from './stringsZabezpieczenPrzypadku';

interface SekcjaZabezpieczenPrzypadkuProps {
  readonly caseId: string;
  /** Wywoływane po udanym zapisie — karta odświeża status wyników przypadku. */
  readonly onZapisano?: () => void;
}

const TESTID = 'mvd-zabezpieczenia-przypadku';

function opisFunkcji(sterownik: ProtectionAssignment, funkcjaRef: string): string {
  const funkcja = sterownik.funkcje.find((f) => f.ref === funkcjaRef);
  return funkcja ? etykietaFunkcjiEaz(funkcja.kod) : T.funkcjaSpozaSterownika;
}

function nazwaNastawy(schemat: { readonly nazwaPl: string } | null | undefined): string {
  return schemat?.nazwaPl ?? T.nastawaSpozaSchematu;
}

function DodajNadpisanie({
  sterownik,
  formularz,
  onDodaj,
}: {
  sterownik: ProtectionAssignment;
  formularz: FormularzWyboru;
  onDodaj: (funkcjaRef: string, klucz: string) => void;
}) {
  const [funkcjaRef, setFunkcjaRef] = useState('');
  const [klucz, setKlucz] = useState('');
  const funkcja = sterownik.funkcje.find((f) => f.ref === funkcjaRef) ?? null;
  const zajete = new Set(
    formularz.nadpisania.filter((w) => w.sterownikRef === sterownik.ref_id && w.funkcjaRef === funkcjaRef).map((w) => w.klucz),
  );
  const nastawy = (funkcja ? (funkcjaEaz(funkcja.kod)?.nastawy ?? []) : []).filter((s) => !zajete.has(s.klucz));
  const id = `${TESTID}-${sterownik.ref_id}`;
  return (
    <div className="mvd-zab-przypadku-dodaj">
      <select
        value={funkcjaRef}
        onChange={(e) => {
          setFunkcjaRef(e.target.value);
          setKlucz('');
        }}
        aria-label={T.dodajFunkcja}
        data-testid={`${id}-dodaj-funkcja`}
      >
        <option value="">{T.wybierz}</option>
        {sterownik.funkcje.map((f) => (
          <option key={f.ref} value={f.ref}>
            {etykietaFunkcjiEaz(f.kod)}
          </option>
        ))}
      </select>
      <select
        value={klucz}
        onChange={(e) => setKlucz(e.target.value)}
        aria-label={T.dodajNastawa}
        disabled={nastawy.length === 0}
        data-testid={`${id}-dodaj-nastawa`}
      >
        <option value="">{T.wybierz}</option>
        {nastawy.map((s) => (
          <option key={s.klucz} value={s.klucz}>
            {s.nazwaPl}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="mvd-btn"
        disabled={!funkcjaRef || !klucz}
        onClick={() => {
          onDodaj(funkcjaRef, klucz);
          setKlucz('');
        }}
        data-testid={`${id}-dodaj`}
      >
        {T.dodaj}
      </button>
    </div>
  );
}

function SterownikPrzypadku({
  sterownik,
  formularz,
  bledny,
  onZmiana,
}: {
  sterownik: ProtectionAssignment;
  formularz: FormularzWyboru;
  bledny: number | null;
  onZmiana: (f: FormularzWyboru) => void;
}) {
  const id = `${TESTID}-${sterownik.ref_id}`;
  const grupaModelu = numerGrupyEfektywnej(sterownik);
  const grupa = grupaEfektywnaPrzypadku(sterownik, formularz.grupy);
  const wiersze = formularz.nadpisania
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.sterownikRef === sterownik.ref_id);

  const ustawGrupe = (tekst: string) => {
    const grupy = { ...formularz.grupy };
    if (tekst === '') delete grupy[sterownik.ref_id];
    else grupy[sterownik.ref_id] = Number(tekst);
    onZmiana({ ...formularz, grupy });
  };

  const maDelte = formularz.grupy[sterownik.ref_id] !== undefined || wiersze.length > 0;
  const [otwarty, setOtwarty] = useState(maDelte);
  useEffect(() => {
    if (maDelte) setOtwarty(true);
  }, [maDelte]);

  return (
    <details
      className="mvd-zab-przypadku-sterownik"
      open={otwarty}
      onToggle={(e) => setOtwarty(e.currentTarget.open)}
      data-testid={id}
    >
      <summary className="mvd-zab-przypadku-naglowek" data-testid={`${id}-naglowek`}>
        <strong>{sterownik.name ?? nazwaUrzadzeniaSterownika(sterownik)}</strong>
        <span className="mvd-zab-przypadku-kontekst">{nazwaUrzadzeniaSterownika(sterownik)}</span>
        <span className="mvd-zab-przypadku-kontekst" data-testid={`${id}-stan`}>
          {T.stanSterownika(grupa, formularz.grupy[sterownik.ref_id] !== undefined, wiersze.length)}
        </span>
      </summary>
      <label className="mvd-zab-przypadku-grupa">
        <span>{T.grupaEtykieta}</span>
        <select
          value={formularz.grupy[sterownik.ref_id] === undefined ? '' : String(formularz.grupy[sterownik.ref_id])}
          onChange={(e) => ustawGrupe(e.target.value)}
          aria-label={`${T.grupaEtykieta} — ${sterownik.name ?? nazwaUrzadzeniaSterownika(sterownik)}`}
          data-testid={`${id}-grupa`}
        >
          <option value="">{T.grupaZModelu(grupaModelu)}</option>
          {grupyModelu(sterownik).map((n) => (
            <option key={n} value={String(n)}>
              {T.grupa(n)}
            </option>
          ))}
        </select>
      </label>

      {wiersze.length === 0 ? (
        <p className="mvd-zab-przypadku-pusto" data-testid={`${id}-bez-nadpisan`}>
          {T.bezNadpisan}
        </p>
      ) : (
        <table className="mvd-edytor-nastaw-tabela" data-testid={`${id}-nadpisania`}>
          <thead>
            <tr>
              <th scope="col">{T.kolFunkcja}</th>
              <th scope="col">{T.kolNastawa}</th>
              <th scope="col">{T.kolBazowa}</th>
              <th scope="col">{T.kolPrzypadek}</th>
              <th scope="col">
                <span className="mvd-sr-only">{T.usun}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {wiersze.map(({ w, i }) => {
              const schemat = schematNastawy(sterownik, w.funkcjaRef, w.klucz);
              const bazowa = wartoscBazowa(sterownik, w.funkcjaRef, w.klucz, formularz.grupy);
              const nastawyBazowe = nastawyFunkcji(sterownik, w.funkcjaRef, grupa);
              const wid = `${id}-${w.funkcjaRef}-${w.klucz}`;
              return (
                <tr key={`${w.funkcjaRef}/${w.klucz}`} data-bledny={bledny === i ? 'true' : 'false'} data-testid={wid}>
                  <td className="mvd-edytor-nastaw-kod">{opisFunkcji(sterownik, w.funkcjaRef)}</td>
                  <td>{nazwaNastawy(schemat)}</td>
                  <td className="mvd-num" data-testid={`${wid}-bazowa`}>
                    {bazowa === null || schemat === null
                      ? T.brakBazowej
                      : zapisWartosciNastawy(schemat, bazowa, nastawyBazowe)}
                  </td>
                  <td>
                    {schemat ? (
                      <PoleNastawy
                        schemat={schemat}
                        wartosc={w.tekst}
                        onZmiana={(tekst) =>
                          onZmiana({
                            ...formularz,
                            nadpisania: formularz.nadpisania.map((x, j) => (j === i ? { ...x, tekst } : x)),
                          })
                        }
                        testid={`${wid}-wartosc`}
                      />
                    ) : (
                      w.tekst
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="mvd-btn"
                      aria-label={`${T.usun}: ${opisFunkcji(sterownik, w.funkcjaRef)} — ${nazwaNastawy(schemat)}`}
                      onClick={() =>
                        onZmiana({ ...formularz, nadpisania: formularz.nadpisania.filter((_, j) => j !== i) })
                      }
                      data-testid={`${wid}-usun`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <DodajNadpisanie
        sterownik={sterownik}
        formularz={formularz}
        onDodaj={(funkcjaRef, klucz) => onZmiana(dodajNadpisanie(formularz, sterownik, funkcjaRef, klucz))}
      />
    </details>
  );
}

export function SekcjaZabezpieczenPrzypadku({ caseId, onZapisano }: SekcjaZabezpieczenPrzypadkuProps) {
  const protectionAssignments = useSnapshotStore((s) => s.snapshot?.protection_assignments);
  const lista = useMemo(
    () => sterownikiModelu({ protection_assignments: protectionAssignments ?? [] }),
    [protectionAssignments],
  );
  const [zapisany, setZapisany] = useState<WyborZabezpieczenPrzypadku | null>(null);
  const [formularz, setFormularz] = useState<FormularzWyboru>(FORMULARZ_PUSTY);
  const [stan, setStan] = useState<'ladowanie' | 'gotowe' | 'blad'>('ladowanie');
  const [blad, setBlad] = useState<string | null>(null);
  const [bledny, setBledny] = useState<number | null>(null);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);
  const maSterowniki = lista.length > 0;

  useEffect(() => {
    if (!maSterowniki) return;
    let anulowane = false;
    setStan('ladowanie');
    setBlad(null);
    setKomunikat(null);
    pobierzWybor(caseId)
      .then((wybor) => {
        if (anulowane) return;
        setZapisany(wybor);
        setFormularz(formularzZWyboru(wybor));
        setStan('gotowe');
      })
      .catch((e: unknown) => {
        if (anulowane) return;
        setBlad(e instanceof Error && e.message ? e.message : T.bladOdczytu);
        setStan('blad');
      });
    return () => {
      anulowane = true;
    };
  }, [caseId, maSterowniki]);

  const zmien = useCallback((f: FormularzWyboru) => {
    setFormularz(f);
    setBledny(null);
    setBlad(null);
    setKomunikat(null);
  }, []);

  const zapisz = async () => {
    const wynik = ladunekWyboru(formularz, lista);
    if (!wynik.ok) {
      const w = formularz.nadpisania[wynik.wiersz];
      const sterownik = lista.find((s) => s.ref_id === w.sterownikRef);
      const nazwa = nazwaNastawy(sterownik ? schematNastawy(sterownik, w.funkcjaRef, w.klucz) : null);
      setBledny(wynik.wiersz);
      setBlad(T.nieczytelne(sterownik ? opisFunkcji(sterownik, w.funkcjaRef) : T.funkcjaSpozaSterownika, nazwa));
      return;
    }
    setZapisywanie(true);
    setBlad(null);
    try {
      const wybor = await zapiszWybor(caseId, wynik.ladunek);
      setZapisany(wybor);
      setFormularz(formularzZWyboru(wybor));
      setKomunikat(T.zapisano);
      onZapisano?.();
    } catch (e) {
      setBlad(e instanceof Error && e.message ? e.message : T.bladZapisu);
    } finally {
      setZapisywanie(false);
    }
  };

  return (
    <section className="mvd-karta-sekcja mvd-zab-przypadku" aria-label={T.tytul} data-testid={TESTID}>
      <h4 className="mvd-karta-sekcja-tytul">{T.tytul}</h4>
      {!maSterowniki ? (
        <p className="mvd-karta-opis" data-testid={`${TESTID}-brak-sterownikow`}>
          {T.brakSterownikow}
        </p>
      ) : stan === 'ladowanie' ? (
        <p className="mvd-karta-opis" data-testid={`${TESTID}-ladowanie`}>
          {T.ladowanie}
        </p>
      ) : stan === 'blad' ? (
        <p className="mvd-zab-przypadku-blad" role="alert" data-testid={`${TESTID}-blad-odczytu`}>
          {blad ?? T.bladOdczytu}
        </p>
      ) : (
        <>
          <p className="mvd-karta-opis">{T.opis}</p>
          {lista.map((s) => (
            <SterownikPrzypadku key={s.ref_id} sterownik={s} formularz={formularz} bledny={bledny} onZmiana={zmien} />
          ))}
          <div className="mvd-zab-przypadku-stopka">
            <button
              type="button"
              className="mvd-btn mvd-btn-primary"
              disabled={zapisywanie || !czyZmieniony(formularz, zapisany)}
              onClick={() => void zapisz()}
              data-testid={`${TESTID}-zapisz`}
            >
              {zapisywanie ? T.zapisywanie : T.zapisz}
            </button>
            <button
              type="button"
              className="mvd-btn"
              disabled={zapisywanie || !czyZmieniony(formularz, zapisany)}
              onClick={() => zmien(formularzZWyboru(zapisany))}
              data-testid={`${TESTID}-przywroc`}
            >
              {T.przywroc}
            </button>
            {komunikat ? (
              <span className="mvd-zab-przypadku-komunikat" role="status" data-testid={`${TESTID}-zapisano`}>
                {komunikat}
              </span>
            ) : null}
          </div>
          {blad ? (
            <p className="mvd-zab-przypadku-blad" role="alert" data-testid={`${TESTID}-blad`}>
              {blad}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
