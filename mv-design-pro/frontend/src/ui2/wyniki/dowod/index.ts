/*
 * Publiczny interfejs okna „Dowód obliczeń" (ui2/wyniki/dowod, karta E9.1 / W-608) —
 * przegląd śladu WHITE BOX przebiegu w kanonie pięciu pól. Read-only, dane przez props.
 */

export { PrzegladDowodu } from './PrzegladDowodu';
export type { PrzegladDowoduProps, WskazanyElementDowodu } from './PrzegladDowodu';
export { ZrodloLatex } from './ZrodloLatex';
export type { ZrodloLatexProps } from './ZrodloLatex';
export { KrokDowodu } from './KrokDowodu';
export type { KrokDowoduProps } from './KrokDowodu';
export { SpisKrokow } from './SpisKrokow';
export type { SpisKrokowProps, PozycjaSpisu } from './SpisKrokow';
export { mapujKroki, formatujWartosc } from './dowodModel';
export type { KrokDowoduModel, WartoscDowodu } from './dowodModel';
export { DOWOD_STRINGS } from './strings';
