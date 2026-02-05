# AGENTS

Zentrale Dokumentation aller vereinbarten Projekt-Regeln und Commitments zwischen Agent und User.

## Zweck & Geltungsbereich
- Diese Datei enthaelt die verbindlichen Regeln fuer Zusammenarbeit, Code, Tests und Kommunikation.

## Repo & Remote Defaults
- Standard-Repo: `Djimon/DnDBastionManager`.
- Remote `origin`: `https://github.com/Djimon/DnDBastionManager.git` (fetch/push).
- Bevorzugtes Tool: `gh` CLI.

## Issue-Workflow
- Issues immer per Commit-Referenz schliessen (z. B. Fixes #1), nicht direkt per CLI schliessen.
- Naechstes Issue: zuerst Label `prio:high`, sonst niedrigste offene Issue-Nummer.
- Wenn ein Issue in einem Commit bearbeitet wird, im Commit referenzieren und per Commit schliessen (resolve/close).

## Branching & Commits
- Standard-Branch: `main` (direkt fuer ca. 90% der Commits).
- Feature-Branches nur bei gamebreaking/grossen Aenderungen oder auf Wunsch.
- Branch-Namen: kein fixes Schema.
- Commit-Prefix: Bugfix `Fix:`; Neues Feature `Added:`; Entfernt `Removed:`.
- Slices: Implementierung gemaess DEVELOPMENT_SLICES.md.
- Commits muessen aussagekraeftig sein mit Slice-Referenzen.

## Testing & QA
- Agent: schreibt Code und bereitet alles vor.
- User: fuehrt manuelle Tests durch (App starten, UI testen, Logs pruefen).
- Keine automatischen Tests vom Agent solange keine automatisierte Testinfrastruktur existiert.
- Begruendung: Fuer ein kleines Projekt waere Overengineering mit automatisierten Tests nicht sinnvoll.

## Logging & Debugging
- Python: Alle Module loggen via `core_engine.logger.setup_logger()`.
- JavaScript: Frontend loggt via `logClient(level, message)` -> Server API.
- Log-Dateien: `logs/app.log`, `logs/session_manager.log`, etc.
- Agent und User pruefen regelmaessig Logs zur Fehleranalyse nach manuellen Tests.
- Logs werden nur auf Anfrage oder bei Fehler-/Issue-Meldungen geprueft; wenn Logs gefragt sind, ist das der erste Schritt.

## Projektstruktur & Pfade
- Struktur: `core_engine/` fuer Backend, `app/html/` fuer Frontend, `core/` fuer Daten.

## Daten-/Schema-Konventionen
- Leitplanke: `Session_save.json` ist die kanonische Struktur.
- Alle Session-States muessen dieses Schema erfuellen.
- Schema-Aenderungen werden in der Commit-Message festgehalten.

## Code-Style & Linting
- Keine speziellen Linting-Tools festgelegt.
- Kommentare: gewuenscht sind gut erklaerende Kommentare im Code.

## Dokumentation & Artefakte
- README wird gepflegt.
- Changelog erst ab Version 1.0 (vorher kein Pflegeaufwand).

## Kommunikation & Sprache
- Kurze, praegnante Zusammenfassungen.
- Deutsche Sprache (wie User schreibt).
- Bei Pausen: Kurze Status-Updates statt ausfuehrliche Erklaerungen.

## Freigaben & Push-Flow
- Nach einem Commit erst Test/Abnahme durch den User, dann Push.

## Tool-Permissions
- Wenn eine Freigabe noetig ist, moeglichst breite, aber sinnvolle Prefix-Regeln vorschlagen (z. B. `["gh", "issue"]` statt eines exakten Kommandos), damit nicht jedes Mal erneut gefragt werden muss.
- Standard-Freigaben (Option 1) fuer weniger Rueckfragen:
- `Get-Content`
- `rg`
- `Get-ChildItem`
- `git`
- `gh`

## Offene Entscheidungen / TODOs
- Noch offen.
