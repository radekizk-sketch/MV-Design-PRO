# Warstwy widoczności SLD — kontrakt kanoniczny

**Status:** kanon BINDING (warstwy); część o poziomach szczegółu USUNIĘTA
**Wersja:** v2.0 (2026-11-12, karta SLD-SKALA-I-NAWIGACJA)

---

## 1. Definicja

**Warstwy** — niezależne kanały informacyjne włączane i wyłączane ręcznie. Sterują tym, co jest renderowane, NIE sterują geometrią ani topologią.

**Poziomy szczegółu (LOD 0–4) nie istnieją.** Wersja 1.0 tego dokumentu opisywała pięć poziomów zależnych od skali (progi 0,3 / 0,7 / 1,5 / 3,0, wymuszanie poziomu, wyższy poziom dla zaznaczenia) i silnik `SldLevelOfDetailEngine.ts`, którego w kodzie nie ma. Kontrakt skali jest jeden: `SLD_LOD_SPEC_OPERATOR_GRADE.md` v2.0 „Skala, gęstość informacji i nawigacja" — jedna geometria w każdej skali, skala steruje wyłącznie gęstością informacji wg czytelności napisu na ekranie (R3), tożsamość zawsze czytelna (R4). Konflikt wpisany w `docs/v12xx/REJESTR_KONFLIKTOW.md`.

Reguły, które z dawnej części o poziomach zostają w mocy (teraz jako reguły skali):
1. Zmiana skali nie zmienia współrzędnych świata ani topologii.
2. Ukrycie informacji nie usuwa danych z modelu.
3. Nie wolno masowo renderować pomiarów `I1/I2/I3/P/Q` pod każdym polem, gdy ich pismo jest nieczytelne na ekranie (reguła gęstości R3, nie próg poziomu).
4. Nie wolno renderować wartości jako `0.00` w miejscu braku obliczeń (kontrakt `formatPolishValue`).

---

## 4. Warstwy widoczności

Każda warstwa to checkbox w lewym panelu. Stan startowy: warstwy aparatury, etykiet, topologii, alarmów ON; warstwy pomiarów, wyników, braków danych OFF.

| ID warstwy | Etykieta UI | Co kontroluje |
|---|---|---|
| `equipment` | Aparatura | wszystkie aparaty pól |
| `labels` | Etykiety | nazwy pól, oznaczenia Q |
| `ports` | Porty | porty/anchory (debug) |
| `measurements` | Pomiary | I/U/P/Q pod polami |
| `results-pf` | Wyniki rozpływowe | nakładka load-flow |
| `results-voltage` | Wyniki napięciowe | nakładka spadków |
| `results-sc` | Wyniki zwarciowe | nakładka SC |
| `stability` | Stabilność / FRT | nakładka stabilności (po PR-9) |
| `missing-data` | Braki danych | znaczniki braków |
| `protection` | Zabezpieczenia | nakładka zabezpieczeń |
| `der` | OZE / BESS / FW | wyróżnienie źródeł |
| `topology` | Topologia pracy | NOP, łączniki sekcyjne |
| `alarms` | Alarmy / blokady | znaczniki alarmów |

---

## 5. Reguły warstw (BINDING)

1. Warstwa nie zmienia geometrii.
2. Warstwa nie zmienia topologii.
3. Warstwa nie zmienia world coordinates.
4. Wyłączenie warstwy nie usuwa danych z modelu.
5. Konflikt etykiet → warstwa o niższym priorytecie chowa etykietę. Priorytet (rosnąco): `measurements < labels < equipment`.

---

## 6. Test kontraktowy

Warstwy: przełączenie warstwy nie zmienia współrzędnych świata (`frontend/src/ui/sld/v3/canvas/__tests__/layers.test.ts`). Skala i gęstość informacji: testy wymienione w `SLD_LOD_SPEC_OPERATOR_GRADE.md` §3.

---

**Koniec dokumentu.**
