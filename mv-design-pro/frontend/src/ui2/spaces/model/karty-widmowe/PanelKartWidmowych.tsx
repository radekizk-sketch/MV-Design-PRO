/**
 * Zakładka „Karty widmowe" przestrzeni Model sieci — karty widmowe urządzeń w modelu.
 *
 * Po co: emisja harmonicznych i admitancja przekształtnika (sekcja „harmonic" modelu
 * urządzenia) pochodzą WYŁĄCZNIE z karty widmowej urządzenia — nigdy z widma typowego.
 * Katalog producentów niesie karty z dokumentem; gdy karty nie ma, projektant wnosi kartę
 * PROJEKTU (raport badań, pomiar) jako dane inżyniera ze statusem „niezweryfikowana".
 *
 * Dwie operacje, oba kontrakty backendu:
 * - „Wczytaj kartę z pliku" → `dodaj_karte_widmowa_projektu` (`{karta: rekord}`);
 * - „Zapisz przypisanie" przy generatorze → `set_der_catalog_bindings` z `karty_widmowe_ref`.
 * Odmowy (kontrakt rekordu, status, typ urządzenia, kolizja identyfikatora, karta innego
 * urządzenia) wracają zdaniem z backendu. Model panelu: `kartyWidmoweModel.ts`.
 */
import { useEffect, useMemo, useState } from 'react';

import type { DomainOpResponseV1, KartaWidmowa } from '../../../../types/enm';
import { fetchDerConverterTypes, fetchKartyWidmowe, getCatalogErrorMessage } from '../../../../ui/catalog/api';
import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import {
  generatoryKart,
  kartyKataloguModelu,
  odczytajKarteZPliku,
  payloadPrzypisaniaKart,
  PRZESTRZEN_KARTY_PL,
  STATUS_WERYFIKACJI_KARTY_PL,
  type GeneratorKart,
} from './kartyWidmoweModel';

/** Treść pliku jako tekst (FileReader — dostępny w każdej przeglądarce i w środowisku testów). */
function czytajTekst(plik: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const czytnik = new FileReader();
    czytnik.onload = () => resolve(String(czytnik.result ?? ''));
    czytnik.onerror = () => reject(czytnik.error ?? new Error('Nie udało się odczytać pliku.'));
    czytnik.readAsText(plik);
  });
}

function opisKarty(karta: KartaWidmowa): string {
  return `${karta.producent} ${karta.model_urzadzenia} (wersja ${karta.wersja})`;
}

function PrzypisanieGeneratora({
  wiersz,
  nazwaTypu,
  zapisuje,
  onZapisz,
}: {
  readonly wiersz: GeneratorKart;
  readonly nazwaTypu: string;
  readonly zapisuje: boolean;
  readonly onZapisz: (wybrane: readonly string[]) => void;
}) {
  const { generator, dostepne, przypisane } = wiersz;
  const [wybrane, setWybrane] = useState<readonly string[]>(przypisane);
  const kluczPrzypisanych = przypisane.join('|');
  useEffect(() => {
    setWybrane(kluczPrzypisanych ? kluczPrzypisanych.split('|') : []);
  }, [kluczPrzypisanych]);
  const zmienione = [...wybrane].sort().join('|') !== kluczPrzypisanych;
  const ref = generator.ref_id;
  return (
    <li data-testid={`karty-widmowe-generator-${ref}`} className="rounded border border-scada-border/60 p-2">
      <div className="font-medium text-scada-text">{generator.name || ref}</div>
      <div className="text-scada-muted">Typ urządzenia: {nazwaTypu}</div>
      <div data-testid={`karty-widmowe-generator-${ref}-stan`} className="mt-0.5">
        {przypisane.length > 0
          ? `Modele widmowe z ${przypisane.length === 1 ? 'jednej karty' : `${przypisane.length} kart`} — sekcja harmonicznych ma dane urządzenia.`
          : 'Brak karty widmowej — sekcja harmonicznych modelu urządzenia nie ma danych (nie ma widma typowego).'}
      </div>
      {dostepne.length === 0 ? (
        <p data-testid={`karty-widmowe-generator-${ref}-brak-kart`} className="mt-1 text-scada-muted">
          Katalog modelu nie ma karty dla tego typu urządzenia — wczytaj kartę projektu z pliku.
        </p>
      ) : (
        <>
          <ul className="mt-1 space-y-0.5">
            {dostepne.map(({ karta, przestrzen }) => (
              <li key={karta.id}>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    data-testid={`karty-widmowe-generator-${ref}-karta-${karta.id}`}
                    checked={wybrane.includes(karta.id)}
                    onChange={(e) =>
                      setWybrane((p) => (e.target.checked ? [...p, karta.id] : p.filter((id) => id !== karta.id)))
                    }
                  />
                  <span>
                    {opisKarty(karta)} — {PRZESTRZEN_KARTY_PL[przestrzen]}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-testid={`karty-widmowe-generator-${ref}-zapisz`}
            className="mt-1 rounded bg-scada-accent px-2 py-0.5 text-white disabled:opacity-50"
            disabled={!zmienione || zapisuje}
            onClick={() => onZapisz(wybrane)}
          >
            Zapisz przypisanie kart
          </button>
        </>
      )}
    </li>
  );
}

export function PanelKartWidmowych() {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const [statyczne, setStatyczne] = useState<readonly KartaWidmowa[]>([]);
  const [nazwyTypow, setNazwyTypow] = useState<ReadonlyMap<string, string>>(new Map());
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  // Wynik OPERACJI zapisu karty (wykonana / odmowa z treścią backendu), nie ocena kryterium.
  const [komunikat, setKomunikat] = useState<{ readonly stan: 'wykonana' | 'odmowa'; readonly tekst: string } | null>(null);
  const [zapisuje, setZapisuje] = useState(false);

  useEffect(() => {
    let anulowane = false;
    Promise.all([fetchKartyWidmowe(), fetchDerConverterTypes()])
      .then(([karty, typy]) => {
        if (anulowane) return;
        setStatyczne(karty);
        setNazwyTypow(new Map(typy.map((t) => [t.id, t.name])));
      })
      .catch((e: unknown) => {
        if (!anulowane) setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      anulowane = true;
    };
  }, []);

  const karty = useMemo(() => kartyKataloguModelu(statyczne, snapshot), [statyczne, snapshot]);
  const generatory = useMemo(() => generatoryKart(snapshot, karty), [snapshot, karty]);

  // Wywołanie operacji podaje wołający jako LITERAŁ nazwy (biała lista operacji UI skanuje
  // literały `executeDomainOperation(...)` — nazwa w zmiennej uciekłaby spod tego testu).
  const wykonaj = async (
    wywolanie: (caseId: string) => Promise<DomainOpResponseV1 | null>,
    sukces: string,
  ) => {
    if (!activeCaseId) return;
    setZapisuje(true);
    setKomunikat(null);
    try {
      const odpowiedz = await wywolanie(activeCaseId);
      if (!odpowiedz || odpowiedz.error) {
        setKomunikat({
          stan: 'odmowa',
          tekst: odpowiedz?.error ?? useSnapshotStore.getState().error ?? 'Operacja nie powiodła się.',
        });
        return;
      }
      setKomunikat({ stan: 'wykonana', tekst: sukces });
    } finally {
      setZapisuje(false);
    }
  };

  const onPlik = async (plik: File | undefined) => {
    if (!plik) return;
    let tekst: string;
    try {
      tekst = await czytajTekst(plik);
    } catch {
      setKomunikat({ stan: 'odmowa', tekst: `Nie udało się odczytać pliku „${plik.name}”.` });
      return;
    }
    const odczyt = odczytajKarteZPliku(tekst);
    if (!odczyt.ok) {
      setKomunikat({ stan: 'odmowa', tekst: odczyt.powodPl });
      return;
    }
    const karta = odczyt.karta;
    await wykonaj(
      (caseId) => executeDomainOperation(caseId, 'dodaj_karte_widmowa_projektu', { karta }),
      `Wczytano kartę widmową z pliku „${plik.name}”.`,
    );
  };

  return (
    <div data-testid="karty-widmowe-panel" className="flex h-full flex-col gap-3 overflow-auto p-4 text-xs">
      <section>
        <h2 className="text-sm font-semibold text-scada-text">Karty widmowe urządzeń</h2>
        <p className="mt-1 text-scada-muted">
          Karta widmowa niesie emisję harmonicznych i admitancję przekształtnika z raportu badań
          albo dokumentu producenta. Sekcja harmonicznych modelu urządzenia korzysta wyłącznie
          z karty przypisanej do generatora — bez karty zostaje jawnym brakiem danych.
        </p>
        <label className="mt-2 inline-flex items-center gap-2">
          <span className="font-medium">Wczytaj kartę projektu z pliku (JSON)</span>
          <input
            type="file"
            accept="application/json,.json"
            data-testid="karty-widmowe-plik"
            disabled={!activeCaseId || zapisuje}
            onChange={(e) => {
              const plik = e.target.files?.[0];
              e.target.value = '';
              void onPlik(plik);
            }}
          />
        </label>
        {komunikat ? (
          <p
            data-testid="karty-widmowe-komunikat"
            data-stan={komunikat.stan}
            className={komunikat.stan === 'wykonana' ? 'mt-1 text-scada-text' : 'mt-1 text-sygnal-uwaga-tusz'}
          >
            {komunikat.tekst}
          </p>
        ) : null}
        {bladKatalogu ? (
          <p data-testid="karty-widmowe-blad-katalogu" className="mt-1 text-sygnal-uwaga-tusz">
            {bladKatalogu}
          </p>
        ) : null}
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
          Katalog kart modelu — {karty.length}
        </h3>
        {karty.length === 0 ? (
          <p data-testid="karty-widmowe-lista-pusta" className="mt-1 text-scada-muted">
            Ani katalog producentów, ani projekt nie niesie dziś karty widmowej.
          </p>
        ) : (
          <table data-testid="karty-widmowe-lista" className="mt-1 w-full text-[11px]">
            <thead>
              <tr className="border-b border-scada-border text-left text-scada-muted">
                <th>Karta</th>
                <th>Typ urządzenia</th>
                <th>Pochodzenie</th>
                <th>Weryfikacja</th>
                <th className="text-right">Modele</th>
              </tr>
            </thead>
            <tbody>
              {karty.map(({ karta, przestrzen }) => (
                <tr key={karta.id} data-testid={`karty-widmowe-karta-${karta.id}`} className="border-b border-scada-border/40">
                  <td>{opisKarty(karta)}</td>
                  <td>{nazwyTypow.get(karta.urzadzenie_ref) ?? 'typ spoza listy przekształtników'}</td>
                  <td>{PRZESTRZEN_KARTY_PL[przestrzen]}</td>
                  <td>{STATUS_WERYFIKACJI_KARTY_PL[karta.verification_status]}</td>
                  <td className="text-right font-mono">{karta.modele.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
          Przypisanie kart do generatorów
        </h3>
        {generatory.length === 0 ? (
          <p data-testid="karty-widmowe-brak-generatorow" className="mt-1 text-scada-muted">
            Model nie ma generatora z typem katalogowym — karta widmowa należy do typu urządzenia.
          </p>
        ) : (
          <ul className="mt-1 space-y-2">
            {generatory.map((wiersz) => (
              <PrzypisanieGeneratora
                key={wiersz.generator.ref_id}
                wiersz={wiersz}
                nazwaTypu={nazwyTypow.get(wiersz.generator.catalog_ref ?? '') ?? 'typ spoza listy przekształtników'}
                zapisuje={zapisuje}
                onZapisz={(wybrane) =>
                  void wykonaj(
                    (caseId) =>
                      executeDomainOperation(
                        caseId,
                        'set_der_catalog_bindings',
                        payloadPrzypisaniaKart(wiersz.generator.ref_id, wybrane),
                      ),
                    `Zapisano przypisanie kart widmowych: ${wiersz.generator.name || wiersz.generator.ref_id}.`,
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
