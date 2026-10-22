/**
 * Obwód wtórny przekładnika prądowego zabezpieczenia — zapis danych, z których jądro
 * nasycenia (`ct_burden_saturation`, IEC 61869-2 § 5.6) liczy efektywny współczynnik
 * ALF_eff.
 *
 * DLACZEGO TU (karta CT-JEDEN-WERDYKT): wiarygodność punktu oceny zabezpieczeń jest werdyktem
 * jądra, a jądro bez długości i przekroju przewodów obwodu wtórnego daje stan nieustalony
 * z poleceniem „uzupełnij". Kreator stacji zapisuje obwód tylko przy TWORZENIU przekładnika;
 * przekładnik dodany kreatorem pomiaru albo istniejący nie miał drogi zapisu — operacja
 * `set_measurement_secondary_circuit` (backend `enm/domain_operations_v2.py`) nie miała
 * konsumenta w UI. Ta sekcja stoi przy nastawach zabezpieczenia, czyli tam, gdzie projektant
 * widzi ocenę i jej przyczynę.
 *
 * ZERO FIZYKI: pola mapują 1:1 na `Measurement.obwod_wtorny` (`enm/models.py::ObwodWtorny`) —
 * długość w jedną stronę, przekrój, lista aparatów z mocą, moc styków. Nic tu nie jest
 * sumowane ani przeliczane; pole puste = brak danej (nie zero).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { ObwodWtorny } from '../../../types/enm';
import { PoleLiczbowe, PoleTekstowe } from '../rama';
import { NASTAWY_STRINGS as T } from './stringsNastaw';

/** Wiersz aparatu w formularzu (moc pusta = brak danej). */
export interface AparatFormularza {
  readonly nazwa: string;
  readonly moc_va: number | null;
}

/** Stan formularza obwodu wtórnego — każde pole puste = `null`, nigdy wartość zastępcza. */
export interface FormularzObwodu {
  readonly dlugosc_m: number | null;
  readonly przekroj_mm2: number | null;
  readonly aparaty: readonly AparatFormularza[];
  readonly moc_stykow_va: number | null;
}

/** Obwód z modelu → formularz (obwód niezapisany = formularz pusty). */
export function formularzZObwodu(obwod: ObwodWtorny | null | undefined): FormularzObwodu {
  return {
    dlugosc_m: obwod?.dlugosc_przewodu_m ?? null,
    przekroj_mm2: obwod?.przekroj_przewodu_mm2 ?? null,
    aparaty: (obwod?.obciazenia_aparatow ?? []).map((a) => ({ nazwa: a.nazwa, moc_va: a.moc_va })),
    moc_stykow_va: obwod?.moc_stykow_va ?? null,
  };
}

/**
 * Formularz → `obwod_wtorny` operacji. Pola puste nie wchodzą do ładunku; aparat bez mocy
 * albo bez nazwy nie jest wysyłany (backend wymaga obu). Formularz całkiem pusty = `null`,
 * czyli jawne skasowanie obwodu (konwencja operacji: klucz obecny + `null` = skasuj).
 */
export function obwodZFormularza(f: FormularzObwodu): ObwodWtorny | null {
  const aparaty = f.aparaty
    .filter((a) => a.nazwa.trim() !== '' && a.moc_va !== null)
    .map((a) => ({ nazwa: a.nazwa.trim(), moc_va: a.moc_va as number }));
  if (f.dlugosc_m === null && f.przekroj_mm2 === null && aparaty.length === 0 && f.moc_stykow_va === null) {
    return null;
  }
  const obwod: ObwodWtorny = { obciazenia_aparatow: aparaty };
  if (f.dlugosc_m !== null) obwod.dlugosc_przewodu_m = f.dlugosc_m;
  if (f.przekroj_mm2 !== null) obwod.przekroj_przewodu_mm2 = f.przekroj_mm2;
  if (f.moc_stykow_va !== null) obwod.moc_stykow_va = f.moc_stykow_va;
  return obwod;
}

export interface ObwodWtornyPrzekladnikaProps {
  /** Identyfikator przekładnika prądowego w modelu (`Measurement.ref_id`). */
  readonly ctRef: string;
  readonly testid: string;
}

export function ObwodWtornyPrzekladnika({ ctRef, testid }: ObwodWtornyPrzekladnikaProps) {
  const caseId = useAppStateStore((s) => s.activeCaseId);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const przekladnik = useSnapshotStore(
    (s) => s.snapshot?.measurements?.find((m) => m.ref_id === ctRef) ?? null,
  );
  const zModelu = useMemo(() => formularzZObwodu(przekladnik?.obwod_wtorny), [przekladnik]);

  const [formularz, setFormularz] = useState<FormularzObwodu>(zModelu);
  const [blad, setBlad] = useState<string | null>(null);
  const [zapisywanie, setZapisywanie] = useState(false);

  // Model zmienił się (zapis, cofnięcie) — formularz odtwarza stan MODELU.
  useEffect(() => {
    setFormularz(zModelu);
  }, [zModelu]);

  const zmien = useCallback(
    (zmiana: Partial<FormularzObwodu>) => setFormularz((f) => ({ ...f, ...zmiana })),
    [],
  );
  const zmienAparat = useCallback(
    (indeks: number, zmiana: Partial<AparatFormularza>) =>
      setFormularz((f) => ({
        ...f,
        aparaty: f.aparaty.map((a, i) => (i === indeks ? { ...a, ...zmiana } : a)),
      })),
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
      const odpowiedz = await executeDomainOperation(caseId, 'set_measurement_secondary_circuit', {
        measurement_ref: ctRef,
        obwod_wtorny: obwodZFormularza(formularz),
      });
      if (!odpowiedz) {
        setBlad(useSnapshotStore.getState().error ?? T.obwodBladZapisu);
      } else if (odpowiedz.error) {
        setBlad(odpowiedz.error);
      }
    } catch (e) {
      setBlad(e instanceof Error ? e.message : T.obwodBladZapisu);
    } finally {
      setZapisywanie(false);
    }
  }, [caseId, ctRef, executeDomainOperation, formularz]);

  if (przekladnik === null) return null;

  return (
    <fieldset className="mvd-edytor-nastaw-stopien" data-testid={testid}>
      <legend className="mvd-edytor-nastaw-legenda">{T.obwodTytul}</legend>
      <p className="mvd-edytor-nastaw-wynik">{T.obwodOpis}</p>
      <div className="mvd-edytor-nastaw-pola">
        <PoleLiczbowe
          etykieta={T.obwodDlugosc}
          jednostka="m"
          wartosc={formularz.dlugosc_m}
          onZmiana={(dlugosc_m) => zmien({ dlugosc_m })}
          min={0}
          testid={`${testid}-dlugosc`}
        />
        <PoleLiczbowe
          etykieta={T.obwodPrzekroj}
          jednostka="mm²"
          wartosc={formularz.przekroj_mm2}
          onZmiana={(przekroj_mm2) => zmien({ przekroj_mm2 })}
          min={0}
          testid={`${testid}-przekroj`}
        />
        <PoleLiczbowe
          etykieta={T.obwodMocStykow}
          jednostka="VA"
          wartosc={formularz.moc_stykow_va}
          onZmiana={(moc_stykow_va) => zmien({ moc_stykow_va })}
          min={0}
          pomoc={T.obwodMocStykowPomoc}
          testid={`${testid}-moc-stykow`}
        />
      </div>
      {formularz.aparaty.map((aparat, indeks) => (
        // Kolejność aparatów jest daną modelu (lista), więc indeks jest tożsamością wiersza.
        <div key={indeks} className="mvd-edytor-nastaw-pola" data-testid={`${testid}-aparat-${indeks}`}>
          <PoleTekstowe
            etykieta={T.obwodAparatNazwa}
            wartosc={aparat.nazwa}
            onZmiana={(nazwa) => zmienAparat(indeks, { nazwa })}
            testid={`${testid}-aparat-${indeks}-nazwa`}
          />
          <PoleLiczbowe
            etykieta={T.obwodAparatMoc}
            jednostka="VA"
            wartosc={aparat.moc_va}
            onZmiana={(moc_va) => zmienAparat(indeks, { moc_va })}
            min={0}
            testid={`${testid}-aparat-${indeks}-moc`}
          />
          <button
            type="button"
            className="mvd-edytor-nastaw-usun"
            onClick={() => zmien({ aparaty: formularz.aparaty.filter((_, i) => i !== indeks) })}
            data-testid={`${testid}-aparat-${indeks}-usun`}
          >
            {T.obwodUsunAparat}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="mvd-edytor-nastaw-usun"
        onClick={() => zmien({ aparaty: [...formularz.aparaty, { nazwa: '', moc_va: null }] })}
        data-testid={`${testid}-dodaj-aparat`}
      >
        {T.obwodDodajAparat}
      </button>
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
        {zapisywanie ? T.zapisywanie : T.obwodZapisz}
      </button>
    </fieldset>
  );
}
