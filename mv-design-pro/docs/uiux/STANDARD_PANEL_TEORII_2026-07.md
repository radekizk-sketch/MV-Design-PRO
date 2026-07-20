# Standard „must-have": Panel teorii przy każdym kroku kreatora (V12K-066)

**Status:** BINDING (dyrektywa właściciela 2026-07-20: „tworzymy teorię do każdego panelu
konfiguracji, dodaj do must-have, zaprojektuj i dodaj do każdego następnego kroku oraz
wszystkich dotychczas").
**Zakres:** wszystkie kreatory ui2 (`frontend/src/ui2/kreatory/**`).

## 1. Zasada

Każdy krok konfiguracji kreatora ui2 **MUSI** udostępniać kontekstowy panel teorii
inżynierskiej (`PanelTeorii`), który tłumaczy projektantowi: **po co** ustawia dane pole,
**z czego** wynika wartość (fizyka/norma), **co daje** w dalszym łańcuchu (rozpływ,
zwarcie, zabezpieczenia, SLD, zgodność). Tam, gdzie istnieje charakterystyka (prawo
sterowania), panel zawiera **żywy wykres** parametryzowany bieżącymi nastawami.

Panel jest **rozwijany** (`<details>`, domyślnie zwinięty) — nie przytłacza ekranu
prowadzącego, a wiedza jest o jeden klik.

## 2. Prymityw (reuse, nie duplikacja)

`ui2/kreatory/rama/panelTeorii.tsx` — `PanelTeorii`:

| Prop | Rola |
|------|------|
| `tytul` | nagłówek panelu (widoczny w summary) |
| `opis` | główny wykład teorii (po co / jak działa / jak czytać) |
| `wymog?` | wymóg normatywny / dobra praktyka (wyróżniony blok) |
| `wymogPrefix?` | prefiks bloku wymogu (np. „Wymóg NC RfG: ") |
| `podstawa?` | podstawa (norma / rozporządzenie / źródło) — przypis |
| `domyslnieOtwarty?` | start rozwinięty (kroki kluczowe) |
| `children` | wykres / schemat / dodatkowe figury (opcjonalne) |
| `testid` | `mvd-kreator-<nazwa>-teoria[-<krok>]` |

Style: `rama/panelTeorii.css`, kolory **wyłącznie** przez tokeny `--mvd-*` (theme-aware
light/dark). Wykresy: czysta prezentacja SVG (kształt specyfikacji prawa sterowania,
**NIE** wynik solvera) — patrz `zrodlo-oze/WykresyNcRfg.tsx` (wzorzec).

## 3. Reguły (spójne z kanonem)

- **ZERO fizyki sieci w UI.** Wynik liczbowy zawsze z backendu. Panel tłumaczy teorię i
  rysuje kształt charakterystyki wg nastaw — nie liczy rozpływu/zwarcia.
- **Język inżynierski** (FLOW §0.3): po co / z czego / co daje; polskie etykiety.
- **Determinizm, dostępność:** statyczny, `role="img"`+`aria-label` na wykresach.
- **Zgodność z guardami:** `ui_no_physics_guard`, `ui_terminology_guard`,
  `forbidden_ui_terms_guard`, `utf8_mojibake_guard`.

## 4. Rejestr pokrycia (rollout)

Legenda: ✅ pokryty · 🟡 częściowo (kluczowe kroki) · ⬜ do zrobienia.

| Kreator | Kroki konfiguracji | Panel teorii | Wykres |
|---------|--------------------|--------------|--------|
| `zrodlo-oze` (OZE/DER) | technologia, falownik, **regulacja** | ✅ (3 panele) | ✅ Q(U)/P(f)/cosφ (żywe) |
| `transformator` (SN/nN + OLTC) | **szyny**, **regulacja** | ✅ (2 panele) | ✅ AVR: zaczep↔napięcie z pasmem (żywy) |
| `kompensator` (bateria SN) | **typ** | ✅ | ✅ Q(U): parabola Q∝U² (żywy) |
| `lacznik` (sekcyjny) | **aparat** | ✅ | — |
| `magistrala` (odcinek SN) | **parametry** | ✅ | ✅ profil U(x) wg cosφ (żywy) |
| `odbior` (nN) | **dane** | ✅ | ✅ trójkąt mocy wg cosφ (żywy) |
| `pierscien` (NOP) | **nop** | ✅ | — |
| `pole` (pole SN) | **pole** | ✅ | — |
| `zrodlo` (GPZ WN/SN) | identyfikacja, **źródło**, transformatory, rozdzielnia, sekcje, normy | 🟡 (źródło) | ✅ sztywność Z∝1/Sk″ (test jedn.; zrzut — patrz backlog) |

### Wspólna baza wykresów (V12K-067)
`rama/wykresPomoc.tsx` (VBW/VBH/PAD/px/py/`RamkaWykresu`) + `rama/wykresy.css`
(`mvd-wykres-*`) — jeden układ współrzędnych, jedna rama, jeden arkusz stylów dla
WSZYSTKICH wykresów kreatorów. OZE (`WykresyNcRfg`) i transformator (`WykresAvr`)
korzystają z tej bazy; kolejne wykresy budujesz na niej (reuse, nie duplikacja).

### Depth backlog (kolejne rundy, NIE odkładane cicho)
- `zrodlo` (GPZ): panele teorii dla pozostałych kroków (rozdzielnia/uziemienie,
  transformatory 110/SN, parametry normowe c/f, sekcje/pola).
- Zrzut GPZ w harnessie: 7-krokowy kreator wymaga pełniejszego zaszczepienia kontekstu
  (`creator-harness-main.tsx`) — komponent renderuje się w apce, ale nie w minimalnym
  harnessie. Wykres `WykresSztywnosci` pokryty testem jednostkowym; zrzut do dołożenia.
- Wykresy zrealizowane: OZE (Q(U)/P(f)/cosφ), transformator (AVR), kompensator (Q∝U²),
  magistrala (profil U), odbiór (trójkąt mocy), GPZ (Z∝1/Sk″). Kolejne charakterystyki
  buduj na wspólnej bazie `rama/wykresPomoc`.

## 5. Egzekwowanie

Docelowo guard `scripts/kreator_teoria_coverage_guard.py` wymusza obecność `PanelTeorii`
w każdym kreatorze (dodany po domknięciu rolloutu — Zero-Debt: guard nie może być
czerwony na HEAD). Do tego czasu pokrycie śledzi §4 (żywy rejestr).
