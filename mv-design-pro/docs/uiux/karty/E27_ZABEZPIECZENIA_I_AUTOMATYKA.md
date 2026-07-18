# KARTA ZADANIA E-27 — REALNY EKRAN „ZABEZPIECZENIA I AUTOMATYKA" (koniec phantoma)

**Priorytet:** NATYCHMIASTOWY (FLOW §0.6 — zdolność bez dostawcy uzupełniana
end-to-end, dyrektywa właściciela 2026-07-18) · **Etap flow:** E2/E6 (nastawy
i automatyka to decyzje projektowe na modelu) · **Wykonawca:** Opus (worktree)
· **Wiążące:** CLAUDE.md; FLOW §0 (w tym §0.3 kontrakt ekranu prowadzącego);
precedensy F-E5a/b (podmiana dostawcy, componentKey=metadana).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE — z rekonesansu)
1. **Zdolność E-27 (kanon):** `labelFull='Zabezpieczenia i automatyka'`,
   trasa `/workspace/protection-automation` — przegląd zabezpieczeń i
   automatyki sieciowej. Dostawca był PHANTOMEM; po F-E5b tymczasowo kontrakt
   analizy. Ta karta dostarcza REALNY ekran.
2. **Realne źródła danych (istnieją — używaj ich, nie fabrykuj):**
   - ENM: `BayProtectionControlUnit` (`enm/models.py` ~:1014-1021:
     `automation_features: dict[str,bool]`, `spz: SpzState`), przekaźniki/
     przypisania zabezpieczeń (`protection_assignments`, `add_relay`),
   - read-model pola: `application/field_read_model.py:707`
     (`automation_features=...`) — RECON, która końcówka API go serwuje
     (szukaj konsumenta w `api/` — prawdopodobnie widoki kanoniczne/enm),
   - silnik nastaw: `application/protection_settings/engine.py`
     (m.in. `_analyze_spz`) — RECON, która końcówka go wystawia,
   - istniejąca edycja per pole: panele E-11 `field_protection`
     („Zabezpieczenia pola") i `field_control` („Sterowanie polem") —
     `networkBuildStore.mapInspectorPanelMeta`; nawigacja przez istniejący
     mechanizm otwarcia panelu pola (RECON: `useNetworkBuildStore` akcja
     otwierająca panel inspektora pola — ta sama, której używa SLD/inspektor),
   - komponenty gotowe: `ui/protection-coordination/AutomationPanel.tsx`
     (SPZ/SZR/SCO/FDIR, ma tryb `showReadOnly`) i typy `automationTypes.ts`.
3. **Zakres ekranu v1 (uczciwy end-to-end):** NOWY moduł
   `ui2/model/zabezpieczenia-automatyka/EkranZabezpieczenAutomatyki.tsx`
   (+model/strings/css/testy):
   - nagłówek celu: „Przegląd zabezpieczeń i automatyki sieciowej (SPZ/SZR/
     SCO/FDIR): co jest skonfigurowane, gdzie są braki i gdzie się to
     edytuje — na podstawie modelu sieci.",
   - TOR wejścia: brak projektu/modelu → stan zerowy z akcją (wzorzec F-E5b),
   - sekcja ZABEZPIECZENIA: tabela pól/przekaźników z ENM snapshotu
     (przypisania, podstawowe nastawy jeżeli read-model je niesie) + akcja
     wiersza „Otwórz kartę pola" (istniejący panel E-11 field_protection),
   - sekcja AUTOMATYKA: tabela sterowników polowych (`BayProtectionControlUnit`):
     funkcje automatyki (chipy per feature z `automation_features`), stan SPZ
     (z `SpzState`), prezentacja przez REUŻYTY `AutomationPanel` w trybie
     read-only per wybrany sterownik LUB własna tabela w tokenach --mvd-*
     (decyzja wykonawcy wg czytelności; AutomationPanel wymaga configs —
     zmapuj z ENM bez fabrykowania brakujących pól: pokazuj tylko to, co
     model niesie, braki jako uczciwe „nie skonfigurowano"),
   - akcje edycyjne: NIE buduj nowej ścieżki zapisu automatyki w tej karcie,
     jeżeli operacja domenowa nie istnieje — ale wtedy OBOWIĄZKOWO ustal to
     jednoznacznie (grep operacji domenowych) i wpisz do raportu wynik;
     edycja prowadzi do istniejących paneli E-11 (to jest realna ścieżka
     użytkownika dziś). JEŚLI odkryjesz istniejącą operację domenową
     zapisu automatyki — podepnij edycję przez nią (pełny end-to-end),
   - „następny krok": po przeglądzie → Koordynacja zabezpieczeń (E-28,
     `openRouteSurface('E-28')`) — naturalna kolejność inżynierska
     (nastawy → selektywność).
4. **Podmiana dostawcy:** router `case 'E-27'` → nowy ekran;
   `componentKey` E-27 → `'EkranZabezpieczenAutomatyki'`; usuń wpis `'E-27'`
   z `KONTRAKTY_EKRANOW` (tymczasowy dostawca F-E5b). Kanon poza
   componentKey NIETKNIĘTY.
5. Testy ≥ 10 (kliki natywne): cel, stan zerowy z akcją, tabela zabezpieczeń
   z fixture ENM (kształt 1:1 z modelami), tabela/panel automatyki (features
   + SPZ; „nie skonfigurowano" dla braków), akcja „Otwórz kartę pola"
   (asercja otwarcia panelu E-11 w store), następny krok → E-28, podmiana
   dostawcy w routerze, brak regresji kontrakt-analizy (usunięty wpis E-27).

## 1. Bramki
KROK 0: fetch+reset (HEAD zawiera tę kartę). Standard: type-check; lint
--max-warnings 0; PEŁNY vitest ZERO failed (baza 8883 + ≥10, do pliku po
pętli `until`); guard:codenames; venv D2vgvUMQ: v12xx_canon_guard (KRYTYCZNY),
forbidden_ui_terms, ui_terminology, utf8_mojibake, dead_click, ui_no_physics
= 0. Backend: TYLKO jeżeli podpinasz istniejącą operację/końcówkę — wtedy
celowane + pełny pytest (baza 6241) + guardy backendu; ZERO nowych końcówek
bez odkrytej istniejącej luki zapisu; ZERO zmian `enm/**`, solverów, kanonu
poza componentKey, `ui/sld/**`. Commit BEZ push: `feat(ui2): realny ekran
Zabezpieczenia i automatyka (E-27) — koniec phantoma`. Raport: plik:linia;
wynik ustalenia ścieżki zapisu automatyki (jednoznaczny grep); mapowanie
ENM→UI (co niesiemy, czego uczciwie brak); komplet bramek.
