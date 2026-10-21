# Koordynacja wątków programu UI/UX przemysłowego (2026-10)

Plik wymiany między wątkiem prowadzącym (sesja „Program UI/UX przemysłowy (kontrakt 2026-10-16) —
prowadzenie i wdrożenie”) a wątkiem wykonawczym (sesja „Program UI/UX przemysłowy — kontynuacja
z gałęzi (2026-10-21)”). Powód: właściciel 2026-10-21 polecił, żeby wątki się koordynowały i żeby
zarządzał wątek prowadzący. Bezpośrednia wiadomość między sesjami nie dociera do sesji bezczynnej,
dlatego stan i prośby są tu, na gałęzi `claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy`.

## Podział ról

- **Wątek prowadzący** ustala kolejność kart, rozstrzyga konflikty gorących plików, wydaje decyzje
  architektoniczne B-01 i integruje do gałęzi programu.
- **Wątek wykonawczy** wykonuje karty, weryfikuje je niezależnie, wypycha wyłącznie na swoją gałąź
  i melduje z dowodami (działająca aplikacja, rzeczywista operacja, zweryfikowany model, wynik
  obliczenia). Bez PR i bez scalania. Werdykt B-02 wydaje właściciel.

## Stan na 2026-10-21 (czubek gałęzi wykonawczej: `6044146ea`)

Decyzja właściciela nr 2 po analizie Z-01…Z-21 jest zapisana w `PLAN_UIUX_PRZEMYSLOWY_2026-10.md` §5
(„Rozstrzygnięcia właściciela 2026-10-21”), a diagnoza w
`ANALIZA_ODRZUCENIA_UI01_UI02_UI04_2026-10-21.md`. B-02 nadal odrzucone. Zgody B-01 na chronione
rdzenie nie ma. Hierarchia ryzyka: P0 poprawność elektryczna, P1 ciągłość procesu, P2 użyteczność.

Karty w toku (wykonawcy w osobnych worktree, gałęzie lokalne `uiux-*` od `5a174d424`):

| Karta | Zakres | Obszar plików |
|-------|--------|---------------|
| GPZ-MODEL | Przypadek A: jedna szyna 110 kV (albo `gpz_hv_sections`) ze źródłem. Przypadek B: równoważnik SN bez transformatorów 110/SN i bez podwójnego liczenia. Blokada gotowości dla sekcji bez zasilania. Macierz dowodu obliczeniowego z niezależnym obliczeniem IEC 60909. Ustalenie granicy B-01 | `backend/src/enm/domain_operations.py` ~4240–4710 |
| K3 | Stacja sekcyjna: sekcje i łącznik z modelu (gałąź `bus_coupler`), trzy przypadki aparatury (w modelu / propozycja szablonu / brak danych), kontrola kontraktu symboli IEC 60617 | `ui/sld/**` |
| K8 | Jeden kontekst wyniku na rodzinę analiz, pasek stanu, jeden predykat świeżości, akceptacja PF A / SC B / PF C | `ui2/wyniki/**`, store wyników |
| K6 | Inspektor 340–420 px (domyślnie ~360) plus jawny, odwracalny tryb szeroki 560 px; karta techniczna per typ; formularz OZE do kreatora pola SN | inspektor ui2 |
| K2b | Kadr bez wchłaniania sąsiadów, odporne kryteria kadru, historia z zaznaczeniem, widok roboczy / arkusz, NOP na wszystkich poziomach szczegółowości | `ui/sld/v3/**` |

Następna fala: K4 (warstwy, zasilanie z backendu, blok wyników GPZ), po scaleniu K8 i K2b.

## Prośby do wątku prowadzącego

1. **W5-C (operacje łączników)**: `SwitchBranch.normal_state`, `open_switch` / `close_switch`,
   przepisanie `set_normal_open_point`, `OperatingScenario.switch_states` w `apply_scenario`.
   Bez tego NOP nie może być wariantem łączeniowym jednego modelu bazowego (ADR-017). Nie da się
   też otworzyć łącznika sekcji z modelu w K3. Wątek wykonawczy tego nie dorabia.
2. **Operacja wyposażenia pola** (`set_bay_equipment` albo jej odpowiednik) dla trzech przypadków
   aparatury. Renderer nie dostanie zaślepek w zastępstwie.
3. **Kolejność scalania gorącego pliku** `backend/src/enm/domain_operations.py`: karta GPZ-MODEL
   edytuje go równolegle z W5-B, W5-C i W5-T.
4. **B-01 dla GPZ**: jeśli karta GPZ-MODEL wykaże, że naprawa wymaga zmiany chronionej ścieżki
   obliczeniowej (pliki z `scripts/solver_diff_guard.py`), wykonawca zatrzymuje się. Złoży wtedy
   osobny pakiet decyzyjny, a decyzję wydaje wątek prowadzący jako architekt.

## Odpowiedzi i polecenia wątku prowadzącego

(Wątek prowadzący dopisuje tu polecenia; wątek wykonawczy czyta ten rozdział przed każdą kartą.)
