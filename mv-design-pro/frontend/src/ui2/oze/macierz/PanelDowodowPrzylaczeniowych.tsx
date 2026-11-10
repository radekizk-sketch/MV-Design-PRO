/*
 * P1 — realny odczyt istniejącego ENM: dowód certyfikatu i wzory odbioru.
 * Zero nowego Werdyktu, zero deklaracji akceptacji OSD.
 */
import { useEffect, useState } from 'react';

import {
  pobierzPrzegladCertyfikatowNcRfg,
  pobierzDossierPrzygotowawczeNcRfg,
  type DossierPrzygotowawczeNcrfg,
  type PrzegladCertyfikatow,
} from '../ncrfg/api';

interface Props {
  readonly operatorId: string | null;
  readonly caseId: string | null;
}

function dzisLokalnie(): string {
  const teraz = new Date();
  const rok = teraz.getFullYear();
  const miesiac = String(teraz.getMonth() + 1).padStart(2, '0');
  const dzien = String(teraz.getDate()).padStart(2, '0');
  return String(rok) + '-' + miesiac + '-' + dzien;
}

type Wynik =
  | { readonly stan: 'brak' | 'ladowanie' }
  | { readonly stan: 'blad'; readonly powod: string }
  | {
      readonly stan: 'gotowe';
      readonly certyfikaty: PrzegladCertyfikatow;
      readonly dossier: DossierPrzygotowawczeNcrfg;
    };

export function PanelDowodowPrzylaczeniowych({ operatorId, caseId }: Props): JSX.Element {
  const [dataOceny, setDataOceny] = useState<string>(dzisLokalnie);
  const [wynik, setWynik] = useState<Wynik>({ stan: 'brak' });

  useEffect(() => {
    if (!caseId || !operatorId || !/^\d{4}-\d{2}-\d{2}$/.test(dataOceny)) {
      setWynik({ stan: 'brak' });
      return;
    }
    let aktywne = true;
    setWynik({ stan: 'ladowanie' });
    Promise.all([
      pobierzPrzegladCertyfikatowNcRfg(caseId, operatorId, dataOceny),
      pobierzDossierPrzygotowawczeNcRfg(caseId, operatorId),
    ]).then(
      ([certyfikaty, dossier]) => {
        if (aktywne) setWynik({ stan: 'gotowe', certyfikaty, dossier });
      },
      (error: unknown) => {
        if (aktywne) setWynik({
          stan: 'blad',
          powod: error instanceof Error ? error.message : 'Brak danych źródłowych.',
        });
      },
    );
    return () => {
      aktywne = false;
    };
  }, [caseId, operatorId, dataOceny]);

  return (
    <section className="mvd-oze-panel-blok" data-testid="mvd-oze-dowody-przylaczeniowe">
      <h4>Certyfikaty urządzeń i dokumentacja odbiorowa</h4>
      <p className="mvd-oze-info">
        Przegląd wykazu PTPiREE i danych zainstalowanego urządzenia. Wykaz,
        certyfikat urządzenia, badania i decyzja operatora to różne dowody.
        Ta sekcja nie wydaje certyfikatu ani pozwolenia na użytkowanie.
      </p>
      <label className="mvd-oze-pole">
        <span>Data oceny przyłączeniowej</span>
        <input
          type="date"
          value={dataOceny}
          onChange={(event) => setDataOceny(event.target.value)}
          data-testid="mvd-oze-dowody-data"
        />
      </label>
      {wynik.stan === 'brak' ? <p>Wybierz przypadek, operatora i datę oceny.</p> : null}
      {wynik.stan === 'ladowanie' ? <p>Sprawdzanie wpisów i dokumentów…</p> : null}
      {wynik.stan === 'blad' ? (
        <p role="alert">Nie udało się sprawdzić dowodów: {wynik.powod}</p>
      ) : null}
      {wynik.stan === 'gotowe' ? (
        <>
          <p data-testid="mvd-oze-dowody-rejestr">
            Stan wykazu PTPiREE: {wynik.certyfikaty.rejestr.stan}.
            Data ostatniej obserwacji źródła: {wynik.certyfikaty.rejestr.data_sprawdzenia}.
            Aktualność na dziś wymaga niezależnego potwierdzenia.
          </p>
          {wynik.certyfikaty.urzadzenia.length === 0 ? (
            <p>Brak urządzeń z ocenionym certyfikatem w tym przypadku.</p>
          ) : (
            <ul className="mvd-oze-lista" data-testid="mvd-oze-dowody-urzadzenia">
              {wynik.certyfikaty.urzadzenia.map((item) => (
                <li key={item.der_ref}>
                  <strong>{item.der_ref}</strong> — {item.status} ({item.kod}).
                  {' '}{item.powody_pl.join(' ')}
                  {item.rekord_wykazu ? ' Wpis: ' + item.rekord_wykazu + '.' : ''}
                </li>
              ))}
            </ul>
          )}
          <details>
            <summary>Wzory dokumentów do przygotowania</summary>
            {wynik.dossier.wyniki.map((item) => (
              <div key={item.der_ref} className="mvd-oze-panel-blok">
                <strong>{item.der_ref}</strong>
                {item.plan ? (
                  <>
                    <ul className="mvd-oze-lista">
                      {item.plan.dokumenty.map((doc) => (
                        <li key={doc.kod}>
                          {doc.kod} — {doc.tytul_pl}
                          {doc.wymagane_w_typowej_procedurze
                            ? ' (typowy dokument)'
                            : ' (warunkowo)'}
                        </li>
                      ))}
                    </ul>
                    <p>{item.plan.powod_pl}</p>
                  </>
                ) : (
                  <p>{item.powod_pl ?? item.status}</p>
                )}
              </div>
            ))}
          </details>
        </>
      ) : null}
    </section>
  );
}
