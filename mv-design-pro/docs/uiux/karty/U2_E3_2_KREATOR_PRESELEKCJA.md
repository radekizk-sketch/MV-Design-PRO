# KARTA ZADANIA E3.2 — PRESELEKCJA SZABLONU W KREATORZE ZASTOSOWANIA

**Faza:** U2 · **Epik:** E3 · **Wykonawca:** Sonnet · **Wiążące:** `SPEC_KREATORY_2026-07.md`
Z1/Z2 (zero pustych pól, podpowiedzi), TODO-KARTA scalenia U2 #2 (ModelWarsztat).

## 1. Cel
Domknięcie przepływu „przeglądarka → kreator": „Zastosuj i edytuj" na kaflu szablonu otwiera
kreator zastosowania Z GOTOWYM wyborem tego szablonu (krok wyboru pominięty/zaznaczony),
inżynier od razu wskazuje odcinek i parametry. Dodatkowo: podpowiedzi Z2 przy parametrach
kroku parametrów kreatora (struktura CO/ZAKRES/SKĄD/KONSEKWENCJA z editable schema).

## 2. Zakres plików
- `ui/network-build/station-templates/StationTemplateWizard.tsx` — NOWY opcjonalny prop
  `initialTemplateId?: string | null`: gdy podany, kreator startuje z zaznaczonym szablonem
  (pobiera pełną definicję i przechodzi do kroku miejsca/parametrów); zachowanie bez propa
  BEZ ZMIAN (test regresyjny istniejących ścieżek).
- `ui/network-build/station-templates/__tests__/**` — testy nowego propa (+ istniejące zielone).
- `ui2/spaces/model/ModelWarsztat.tsx` — przekazanie `initialTemplateId` z `onZastosuj(id)`
  (stan lokalny), usunięcie TODO-KARTA z nagłówka.
- `ui2/spaces/model/__tests__/modelWarsztat.test.tsx` — asercja przekazania id do kreatora.
- Podpowiedzi Z2: w kroku parametrów kreatora dymek ⓘ per pole z editable schema
  (`label_pl` + zakres/domyślna/źródło z pól schematu, jeśli dostępne w odpowiedzi API;
  pola bez danych → bez dymka, NIE fabrykuj treści). Format zgodny ze `SPEC_KREATORY` Z2.

## 3. Zasady i kryteria
To pierwsza karta modyfikująca moduł legacy (`ui/network-build`) — chirurgicznie: tylko
wymienione pliki, zero zmian innych przepływów, istniejące testy modułu muszą przejść bez
osłabień. Etykiety PL; zero snake_case w UI (guard). Kryteria: (1) prop działa + regresja
bez propa, (2) ModelWarsztat przekazuje id (test), (3) dymki Z2 tam, gdzie schema ma dane
(test na fixture), (4) pełne bramki jak E1.1 §8 (pipefail). Commit
`feat(kreator): preselekcja szablonu + podpowiedzi Z2 (E3.2)` BEZ push. Raport standardowy.
