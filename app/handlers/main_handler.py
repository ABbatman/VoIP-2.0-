# app/handlers/main_handler.py

import tornado.web
from app.utils.logger import log_info
from app.utils.vite import vite_script_tag
from markupsafe import Markup

# Provide a minimal 'safe' helper compatible with Tornado template pipe `value | safe`
class _SafeFilter:
    def __ror__(self, other):
        return Markup(other)

class MainHandler(tornado.web.RequestHandler):
    def get(self):
        log_info("GET / - main page loaded")
        # Provide vite tags explicitly to the template context
        # so templates that reference `vite_tags` can render without NameError
        tags = vite_script_tag(self)
        # Mark tags as safe HTML to prevent escaping in template
        safe_tags = Markup(tags)
        # Also provide `safe` helper into template namespace (backward-compat)
        self.render("index.html", vite_tags=safe_tags, safe=_SafeFilter())