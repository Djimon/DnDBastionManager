# D&D Bastion Manager - Project Rules

Zentrale Dokumentation aller vereinbarten Projekt-Regeln und Commitments zwischen Agent und User.

## Testing & Debugging

### Manual Testing Rule
- **Agent**: Schreibt Code und bereitet alles vor
- **User**: Führt manuelle Tests durch (App starten, UI testen, Logs überprüfen)
- **Keine automatischen Tests** vom Agent solange keine automatisierten Testinfrastruktur existiert
- Begründung: Für ein kleines Projekt wäre Überengineering mit automatisierten Tests nicht sinnvoll

### Logging
- Python: Alle Module loggen via `core_engine.logger.setup_logger()`
- JavaScript: Frontend loggt via `logClient(level, message)` → Server API
- Log-Dateien: `logs/app.log`, `logs/session_manager.log`, etc.
- Agent und user prüfen regelmäßig Logs zur Fehleranalyse nach manuellen Tests

## Development Workflow

### Code Organization
- Slices: Implementierung gemäß DEVELOPMENT_SLICES.md
- Struktur: `core_engine/` für Backend, `app/html/` für Frontend, `core/` für Daten
- Git: Commits müssen aussagekräftig sein mit Slice-Referenzen

### Data Structure Reference
- **Leitplanke**: `Session_save.json` ist die Kanonische Struktur
- Alle Session-States müssen dieses Schema erfüllen
- Schema-Änderungen müssen versioniert werden

## Communication Style

- Kurze, prägnante Zusammenfassungen
- Deutsche Sprache (wie User schreibt)
- Bei Pausen: Kurze Status-Updates statt ausführliche Erklärungen

## GitHub Issues

- Issues immer per Commit-Referenz schliessen (z. B. Fixes #1), nicht direkt per CLI schliessen

- Push-Flow: Nach einem Commit erst kurzer Test/Abnahme durch den User, dann Push
