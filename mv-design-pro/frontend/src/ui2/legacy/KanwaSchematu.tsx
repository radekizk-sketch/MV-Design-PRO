/*
 * KanwaSchematu — JEDYNE miejsce montażu kanwy schematu w aplikacji (karta
 * SLD-SKALA-I-NAWIGACJA, część W). Opakowanie rejestruje montaż w
 * `ui2/shell/widokKanwySchematu.ts`, więc jedna droga wejścia na schemat
 * (`zaznaczElementModelu` / `pokazElementNaSchemacie`) wie, czy wskazanie kamery
 * obsłuży kanwa NA EKRANIE (przestrzeń „Schemat", zakładki „Schemat" i
 * „Diagnostyka" warsztatu „Model sieci", trasa podglądu, okno E-01), czy trzeba
 * przejść do przestrzeni „Schemat". Montaż kanwy z pominięciem opakowania
 * czerwieni regułę G strażnika `nawigacja_jeden_kanon_guard.py`.
 */

import {
  SldCanvasV3Workspace,
  type SldCanvasV3WorkspaceProps,
} from '../../ui/sld/v3/canvas/SldCanvasV3Workspace';
import { useRejestracjaKanwySchematu } from '../shell/widokKanwySchematu';

export function KanwaSchematu(props: SldCanvasV3WorkspaceProps): JSX.Element {
  useRejestracjaKanwySchematu();
  return <SldCanvasV3Workspace {...props} />;
}
