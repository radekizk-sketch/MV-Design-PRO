/**
 * Edytor WIĄZAŃ KATALOGOWYCH wytwórcy (V12K-242, ostatnie ogniwo łańcucha F-K8).
 *
 * DLACZEGO TEN EKRAN ISTNIEJE. Łańcuch danych był budowany od tyłu i do tej pory nie
 * miał początku: backend przyjmuje wiązania kanoniczną operacją (`set_der_catalog_bindings`,
 * V12K-238), odrzuca referencje spoza katalogu (V12K-241), katalog wyprowadza rodzaj
 * rdzenia z klasy (V12K-239), a reguła gotowości czyta te dane i nazywa braki
 * (V12K-232/233). Brakowało JEDNEGO: miejsca, w którym projektant może te wiązania
 * WYBRAĆ. Ekran wytwórcy pokazywał je wyłącznie do odczytu — pomiar: zero kontrolek
 * wyboru (V12K-237, samokorekta wpisu).
 *
 * ZAKRES ŚWIADOMIE OGRANICZONY do wiązań, dla których backend MA katalog: zabezpieczenie,
 * przekładnik prądowy, przekładnik napięciowy. Dane prądu zwarciowego i model dynamiczny
 * NIE mają katalogu po stronie backendu, więc nie dostają tu pickera — kontrolka
 * wybierająca z listy, której backend nie zna, byłaby fabrykacją (zakaz „phantom"), a jej
 * zapis i tak zostałby odrzucony przez walidację referencji. Brak jest NAZWANY na ekranie.
 *
 * KAŻDA ZMIANA IDZIE DO MODELU. Wybór wysyła WYŁĄCZNIE zmienione pole (kontrakt
 * „pominięcie ≠ null" — pominięte pola zostawiają pozostałe wiązania nietknięte),
 * a wyczyszczenie wysyła jawny `null`, żeby reguła gotowości znów widziała brak danej.
 */

import { useCallback, useMemo, useState } from 'react';

import type { DomainOpResponseV1 } from '../../../types/enm';
import { TypePicker } from '../../catalog/TypePicker';
import type { TypeCategory } from '../../catalog/types';
import { MISSING_DASH } from '../../shared/formatPolishValue';
import {
  DerPersistenceApiError,
  patchDerCatalogBindings,
  type DerCatalogBindingsRequest,
} from '../../sld/v2/canvas/derPersistenceApi';

/** Wiązanie edytowalne = takie, dla którego backend ma katalog i potrafi je zweryfikować. */
interface WiazanieEdytowalne {
  readonly pole: keyof DerCatalogBindingsRequest;
  readonly etykieta: string;
  readonly kategoria: TypeCategory;
  /** Po co to wiązanie jest — język inżynierski, nie nazwa pola. */
  readonly poCo: string;
}

export const WIAZANIA_EDYTOWALNE: readonly WiazanieEdytowalne[] = [
  {
    pole: 'protection_catalog_ref',
    etykieta: 'Zabezpieczenie',
    kategoria: 'PROTECTION_DEVICE',
    poCo: 'funkcje zabezpieczeniowe wytwórcy (oś „Zabezpieczenia")',
  },
  {
    pole: 'ct_catalog_ref',
    etykieta: 'Przekładnik prądowy',
    kategoria: 'CT',
    poCo: 'klasa rdzenia decyduje o gotowości osi zabezpieczeń (IEC 61869-2)',
  },
  {
    pole: 'vt_catalog_ref',
    etykieta: 'Przekładnik napięciowy',
    kategoria: 'VT',
    poCo: 'pomiar napięcia dla zabezpieczeń i automatyki',
  },
];

/** Wiązania BEZ katalogu w backendzie — nazwane wprost, bez atrapy pickera. */
export const WIAZANIA_BEZ_KATALOGU: readonly { readonly etykieta: string; readonly powod: string }[] = [
  {
    etykieta: 'Dane prądu zwarciowego',
    powod: 'brak katalogu w backendzie — wymaga danych producenta (osie SC1F/SC2FG)',
  },
  {
    etykieta: 'Model dynamiczny',
    powod: 'brak katalogu w backendzie — wymaga danych producenta (osie FRT/HVRT)',
  },
];

export interface DerWiazaniaEditorProps {
  readonly derId: string;
  readonly projectId: string | null;
  readonly caseId: string | null;
  /** Bieżące wartości wiązań z rekordu wytwórcy (odczyt z modelu). */
  readonly wartosci: Partial<Record<keyof DerCatalogBindingsRequest, string | null | undefined>>;
  /** Etykieta katalogowa dla danego wiązania — rozwiązywana przez wołającego z REALNEGO
   *  katalogu; `null` = typ nieznany katalogowi (kreska, nie polecenie wyboru). */
  readonly etykietaTypu: (pole: keyof DerCatalogBindingsRequest) => string | null;
  /**
   * Wywoływane po udanym zapisie. Dostaje ODPOWIEDŹ OPERACJI, nie tylko zapisaną wartość:
   * model po zapisie zna również dane WYPROWADZONE z katalogu (rodzaj rdzenia CT, ALF —
   * V12K-239), których wołający nie ma skąd odtworzyć bez ponownego pobrania snapshotu.
   */
  readonly poZapisie: (
    pole: keyof DerCatalogBindingsRequest,
    ref: string | null,
    odpowiedz: DomainOpResponseV1,
  ) => void;
}

export function DerWiazaniaEditor({
  derId,
  projectId,
  caseId,
  wartosci,
  etykietaTypu,
  poZapisie,
}: DerWiazaniaEditorProps): JSX.Element {
  const [otwartyPicker, setOtwartyPicker] = useState<WiazanieEdytowalne | null>(null);
  const [zapisywane, setZapisywane] = useState<keyof DerCatalogBindingsRequest | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  const kontekstKompletny = Boolean(projectId && caseId);

  const zapisz = useCallback(
    async (pole: keyof DerCatalogBindingsRequest, ref: string | null) => {
      if (!projectId || !caseId) return;
      setZapisywane(pole);
      setBlad(null);
      try {
        // WYŁĄCZNIE zmienione pole — pozostałe wiązania zostają w modelu nietknięte
        // (kontrakt „pominięcie ≠ null", V12K-238).
        const odpowiedz = await patchDerCatalogBindings(projectId, caseId, derId, { [pole]: ref });
        poZapisie(pole, ref, odpowiedz);
      } catch (error) {
        setBlad(
          error instanceof DerPersistenceApiError
            ? error.message
            : 'Nie udało się zapisać wiązania w modelu sieci.',
        );
      } finally {
        setZapisywane(null);
      }
    },
    [caseId, derId, poZapisie, projectId],
  );

  const wiersze = useMemo(
    () =>
      WIAZANIA_EDYTOWALNE.map((wiazanie) => {
        const ref = wartosci[wiazanie.pole] ?? null;
        const nazwa = ref ? etykietaTypu(wiazanie.pole) : null;
        return { wiazanie, ref, nazwa };
      }),
    [etykietaTypu, wartosci],
  );

  return (
    <section className="space-y-3" data-testid="der-wiazania-editor">
      <div>
        <h3 className="text-sm font-semibold text-scada-text">Wiązania katalogowe</h3>
        <p className="text-xs text-scada-muted">
          Wybór trafia do modelu sieci i jest widoczny dla analiz, raportów i eksportu
          projektu.
        </p>
      </div>

      {!kontekstKompletny && (
        <p className="text-xs text-scada-grounded" data-testid="der-wiazania-brak-kontekstu">
          Wybierz projekt i przypadek obliczeniowy, żeby zapisać wiązania w modelu.
        </p>
      )}

      <dl className="space-y-2">
        {wiersze.map(({ wiazanie, ref, nazwa }) => (
          <div
            key={wiazanie.pole}
            className="flex flex-wrap items-baseline justify-between gap-2 border-b border-scada-border/60 pb-2"
            data-testid={`der-wiazanie-${wiazanie.pole}`}
          >
            <div className="min-w-0">
              <dt className="text-sm text-scada-text">{wiazanie.etykieta}</dt>
              <dd className="text-xs text-scada-muted">{wiazanie.poCo}</dd>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-scada-text" data-testid={`der-wiazanie-wartosc-${wiazanie.pole}`}>
                {ref === null
                  ? 'wybierz wariant katalogowy'
                  : (nazwa ?? MISSING_DASH)}
              </span>
              <button
                type="button"
                className="rounded border border-scada-border px-2 py-1 text-xs text-scada-text hover:bg-scada-surface disabled:opacity-50"
                disabled={!kontekstKompletny || zapisywane !== null}
                onClick={() => setOtwartyPicker(wiazanie)}
                data-testid={`der-wiazanie-wybierz-${wiazanie.pole}`}
              >
                {ref === null ? 'Wybierz' : 'Zmień'}
              </button>
              {ref !== null && (
                <button
                  type="button"
                  className="rounded border border-scada-border px-2 py-1 text-xs text-scada-muted hover:bg-scada-surface disabled:opacity-50"
                  disabled={!kontekstKompletny || zapisywane !== null}
                  onClick={() => void zapisz(wiazanie.pole, null)}
                  data-testid={`der-wiazanie-wyczysc-${wiazanie.pole}`}
                >
                  Wyczyść
                </button>
              )}
            </div>
          </div>
        ))}
      </dl>

      {blad && (
        <p className="text-xs text-scada-alarm" data-testid="der-wiazania-blad">
          {blad}
        </p>
      )}

      <div className="rounded border border-scada-border/60 bg-scada-surface/40 p-2">
        <p className="text-xs font-semibold text-scada-text">Bez wyboru na tym ekranie</p>
        <ul className="mt-1 space-y-1">
          {WIAZANIA_BEZ_KATALOGU.map((pozycja) => (
            <li key={pozycja.etykieta} className="text-xs text-scada-muted">
              <span className="text-scada-text">{pozycja.etykieta}</span> — {pozycja.powod}
            </li>
          ))}
        </ul>
      </div>

      {otwartyPicker && (
        <TypePicker
          isOpen
          category={otwartyPicker.kategoria}
          currentTypeId={wartosci[otwartyPicker.pole] ?? null}
          onClose={() => setOtwartyPicker(null)}
          onSelectType={(typeId) => {
            const pole = otwartyPicker.pole;
            setOtwartyPicker(null);
            void zapisz(pole, typeId);
          }}
        />
      )}
    </section>
  );
}
