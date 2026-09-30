/**
 * Para predykatów fixtur harnessu ↔ ekranu (karta AB-1a Pakiet D2 §0 pkt 9): ciała żądań,
 * dla których `backend/scripts/eksport_fixtur_harnessu.py` policzył odpowiedzi scen
 * (`ncrfg_bieg_scena_macierz_zadanie`, `certyfikat_scena_zadanie`,
 * `wniosek_scena_magazyn_zadanie`), są DOKŁADNIE tymi, które zbudują produkcyjne funkcje
 * ekranu z tego samego modelu sceny (`deryZModelu` + wejścia mostu `GET …/wejscia` →
 * `zbudujModuly` → `zbudujWejscieModulu`; `zbudujZadanieCertyfikatu`; `zbudujZadanieWniosku`). Rozjazd lustra po którejkolwiek
 * stronie = czerwony test (inaczej harness pokazywałby odpowiedź policzoną dla innych danych).
 */

import { describe, expect, it } from 'vitest';

import certyfikatScenaZadanie from '../../../../harness-fixtures/generated/certyfikat_scena_zadanie.json';
import macierzScenyMigawka from '../../../../harness-fixtures/generated/macierz_scena_migawka.json';
import magazynScenyMigawka from '../../../../harness-fixtures/generated/magazyn_scena_migawka.json';
import biegZadanie from '../../../../harness-fixtures/generated/ncrfg_bieg_scena_macierz_zadanie.json';
import biegOdpowiedz from '../../../../harness-fixtures/generated/ncrfg_bieg_scena_macierz.json';
import wejsciaSceny from '../../../../harness-fixtures/generated/ncrfg_wejscia_scena_macierz.json';
import wniosekPrzebiegi from '../../../../harness-fixtures/generated/wniosek_scena_magazyn_przebiegi.json';
import wniosekZadanie from '../../../../harness-fixtures/generated/wniosek_scena_magazyn_zadanie.json';
import { deryZModelu } from '../../../../ui/network-build/station-der';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import type { EnergyNetworkModel } from '../../../../types/enm';
import { zbudujModuly, zbudujWejscieModulu, zbudujZadanieCertyfikatu } from '../../macierz/macierzModel';
import {
  domyslnyPrzebieg,
  przebiegiRozplywu,
  przebiegiZwarciowe,
  zbudujZadanieWniosku,
} from '../../wniosek/model';
import { operatorZModelu } from '../operator';
import type { WejsciaPrzypadkuNcRfg } from '../typy';

function operatorSceny(migawka: unknown): string {
  const zModelu = operatorZModelu(deryZModelu(migawka as EnergyNetworkModel, 'proj-demo'));
  if (zModelu.rodzaj !== 'z_modelu') throw new Error(`scena bez operatora z modelu: ${zModelu.powod}`);
  return zModelu.operatorId;
}

describe('fixtury scen D2 opisują dokładnie żądania ekranu', () => {
  it('bieg „co-jeśli" sceny macierz: formularz wstępny ekranu (wejścia mostu) = ciało fixtury', () => {
    const ders = deryZModelu(macierzScenyMigawka as unknown as EnergyNetworkModel, 'proj-demo');
    const operator = operatorSceny(macierzScenyMigawka);
    const wejscia = wejsciaSceny as unknown as WejsciaPrzypadkuNcRfg;
    // Para: wejścia policzono dla operatora z modelu sceny i dla modułów zasianych w scenie.
    expect(wejscia.operator_id).toBe(operator);
    expect(wejscia.modules.map((m) => m.der_ref).sort()).toEqual(ders.map((d) => d.id).sort());
    const modules = zbudujModuly(ders, wejscia).map((opis) => {
      const wynik = zbudujWejscieModulu(opis, operator);
      if (wynik.stan !== 'ok') throw new Error(`${opis.derRef}: ${JSON.stringify(wynik)}`);
      return wynik.wejscie;
    });
    expect({ modules }).toEqual(biegZadanie);
    // Odpowiedź policzono dla tych modułów (te same referencje, moc, napięcie, źródło danych).
    expect(biegOdpowiedz.modules.map((m) => [m.der_ref, m.p_max_kw, m.voltage_kv, m.zrodlo_danych])).toEqual(
      modules.map((m) => [m.der_ref, m.p_max_kw, m.voltage_kv, 'ZADANIE_KLIENTA']),
    );
  });

  it('certyfikat scen macierz/certyfikat: identyfikacja z zasiewu + operator z modelu = ciało fixtury', () => {
    for (const migawka of [macierzScenyMigawka, magazynScenyMigawka]) {
      expect(
        zbudujZadanieCertyfikatu({
          nazwaProjektu: 'Przyłączenie farmy PV 8 MW',
          nazwaPrzypadku: 'Stan normalny',
          operatorId: operatorSceny(migawka),
          nazwaZastepcza: 'Projekt bez nazwy',
        }),
      ).toEqual(certyfikatScenaZadanie);
    }
  });

  it('wniosek sceny wniosek: przebiegi domyślne z rejestru + węzeł + operator z modelu = ciało fixtury', () => {
    const runs = wniosekPrzebiegi as unknown as ExecutionRun[];
    const pfRunId = domyslnyPrzebieg(przebiegiRozplywu(runs), null);
    const scRunId = domyslnyPrzebieg(przebiegiZwarciowe(runs), null);
    expect(pfRunId).not.toBeNull();
    expect(scRunId).not.toBeNull();
    expect(
      zbudujZadanieWniosku({
        pfRunId: pfRunId as string,
        scRunId: scRunId as string,
        busRef: wniosekZadanie.bus_ref,
        identyfikacja: {
          nazwaProjektu: 'Przyłączenie farmy PV 8 MW',
          nazwaPrzypadku: 'Stan normalny',
          wnioskodawca: '',
          adres: '',
        },
        operatorId: operatorSceny(magazynScenyMigawka),
      }),
    ).toEqual(wniosekZadanie);
  });
});
