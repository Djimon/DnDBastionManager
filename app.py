import webview
import json
import os
from pathlib import Path

class Api:
    """API für die Kommunikation zwischen Frontend und Backend"""
    
    def __init__(self):
        self.data_dir = str(Path(__file__).parent / "core")
    
    def load_facility(self, facility_name):
        """Lade JSON-Daten einer Facility"""
        try:
            filepath = Path(self.data_dir) / f"{facility_name}.json"
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return {"error": f"Facility '{facility_name}' nicht gefunden"}
        except Exception as e:
            return {"error": str(e)}
    
    def get_facilities(self):
        """Gebe Liste aller verfügbaren Facilities"""
        facilities = []
        for file in Path(self.data_dir).glob("core_*.json"):
            facilities.append(file.stem)
        return sorted(facilities)
    
    def save_facility(self, facility_name, data):
        """Speichere Facility-Daten"""
        try:
            filepath = Path(self.data_dir) / f"{facility_name}.json"
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return {"success": True, "message": f"'{facility_name}' gespeichert"}
        except Exception as e:
            return {"success": False, "error": str(e)}

def main():
    # API-Instanz
    api = Api()
    
    # HTML-Datei
    html_file = Path(__file__).parent / "app" / "html" / "index.html"
    
    # Webview erstellen
    window = webview.create_window(
        title='D&D Bastion Manager',
        url=str(html_file),
        js_api=api,
        width=1200,
        height=800,
        resizable=True,
        fullscreen=False,
    )
    
    # Starten
    webview.start(debug=True)

if __name__ == '__main__':
    main()
