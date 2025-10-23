# app/utils/vite.py

import json
import os
from markupsafe import Markup # We need this again
from app import config

class ViteLoader:
    # ... class code is correct and doesn't need changes ...
    _instance = None
    
    def __init__(self):
        self.is_dev = config.DEBUG
        self.manifest = {}
        
        if not self.is_dev:
            manifest_path = os.path.join(config.STATIC_PATH, 'dist', '.vite', 'manifest.json')
            if not os.path.exists(manifest_path):
                 manifest_path = os.path.join(config.STATIC_PATH, 'dist', 'manifest.json')
            try:
                with open(manifest_path, 'r') as f:
                    self.manifest = json.load(f)
            except Exception as e:
                print(f"❌ Could not read Vite manifest at {manifest_path}: {e}")

    @classmethod
    def instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def vite_script_tag(self):
        vite_dev_server = "http://localhost:5173"

        if self.is_dev:
            tags = [
                f'<script type="module" src="{vite_dev_server}/@vite/client"></script>',
                f'<script type="module" src="{vite_dev_server}/js/main.js"></script>'
            ]
        else:
            base_url = f"{config.STATIC_URL_PREFIX}"
            entry_point_key = 'js/main.js'
            entry_point = self.manifest.get(entry_point_key, {})
            
            js_path = entry_point.get('file')
            css_files = entry_point.get('css', [])

            tags = []
            for css_path in css_files:
                tags.append(f'<link rel="stylesheet" href="{base_url}dist/{css_path}">')
            if js_path:
                tags.append(f'<script type="module" src="{base_url}dist/{js_path}"></script>')

        return "\n".join(tags) # Return a raw string

# It must accept the handler argument from ui_methods
def vite_script_tag(handler):
    return ViteLoader.instance().vite_script_tag()