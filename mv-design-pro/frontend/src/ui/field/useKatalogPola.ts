/**
 * Powiązanie pola SN z katalogiem producenta — odczyt dla karty pola.
 *
 * Model pola (`field-view`) niesie WYŁĄCZNIE referencje: `base_model.bay_template_ref`
 * (szablon pola producenta, z którego pole złożono) i `base_model.switchgear_family_ref`.
 * Treść (nazwa szablonu, rodzaj pola, status źródła, rodzina, producent, konstrukcja, napięcia)
 * należy do katalogu, więc karta czyta ją z istniejących tras katalogu przez JEDEN adapter
 * (`ui/catalog/api.ts`) — bez drugiego klienta HTTP, bez lokalnej kopii katalogu, bez
 * domyślnej rodziny. Porażka odczytu jest stanem z powodem, nie pustą sekcją.
 */
import { useEffect, useState } from 'react';

import type { CompleteMvBayTemplateSummary } from '../catalog/BayTemplatePicker';
import type { Manufacturer } from '../catalog/manufacturer';
import type { SwitchgearFamily } from '../catalog/SwitchgearFamilyPicker';
import {
  fetchCompleteBayTemplates,
  fetchManufacturers,
  fetchSwitchgearFamilies,
  getCatalogErrorMessage,
} from '../catalog/api';

export interface KatalogPolaDane {
  readonly szablony: readonly CompleteMvBayTemplateSummary[];
  readonly rodziny: readonly SwitchgearFamily[];
  readonly producenci: readonly Manufacturer[];
}

/** Stan odczytu katalogu dla karty pola. `BEZ_POWIAZANIA` = pole nie wskazuje katalogu. */
export type KatalogPola =
  | { readonly stan: 'BEZ_POWIAZANIA' }
  | { readonly stan: 'LADOWANIE' }
  | { readonly stan: 'BLAD'; readonly komunikat: string }
  | { readonly stan: 'GOTOWY'; readonly dane: KatalogPolaDane };

let pamiec: Promise<KatalogPolaDane> | null = null;

/** Katalog jest niezmienny w sesji — jedno pobranie na wszystkie karty pól. */
function pobierzKatalog(): Promise<KatalogPolaDane> {
  if (!pamiec) {
    pamiec = Promise.all([
      fetchCompleteBayTemplates(),
      fetchSwitchgearFamilies(),
      fetchManufacturers(),
    ]).then(([szablony, rodziny, producenci]) => ({ szablony, rodziny, producenci }));
    // Porażka nie zostaje w pamięci — ponowne otwarcie karty ponawia odczyt.
    pamiec.catch(() => {
      pamiec = null;
    });
  }
  return pamiec;
}

/** Tylko dla testów: czyści pamięć odczytu między przypadkami. */
export function wyczyscPamiecKataloguPola(): void {
  pamiec = null;
}

export function useKatalogPola(
  bayTemplateRef: string | null | undefined,
  switchgearFamilyRef: string | null | undefined,
): KatalogPola {
  const maPowiazanie = Boolean(bayTemplateRef || switchgearFamilyRef);
  const [stan, setStan] = useState<KatalogPola>(
    maPowiazanie ? { stan: 'LADOWANIE' } : { stan: 'BEZ_POWIAZANIA' },
  );

  useEffect(() => {
    if (!maPowiazanie) {
      setStan({ stan: 'BEZ_POWIAZANIA' });
      return;
    }
    let anulowano = false;
    setStan({ stan: 'LADOWANIE' });
    pobierzKatalog()
      .then((dane) => {
        if (!anulowano) setStan({ stan: 'GOTOWY', dane });
      })
      .catch((blad: unknown) => {
        if (!anulowano) setStan({ stan: 'BLAD', komunikat: getCatalogErrorMessage(blad) });
      });
    return () => {
      anulowano = true;
    };
  }, [maPowiazanie]);

  return stan;
}
