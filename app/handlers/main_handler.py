# app/handlers/main_handler.py

import tornado.web
from app.utils.logger import log_info # Use absolute import

# Renders the main HTML page from templates/index.html
class MainHandler(tornado.web.RequestHandler):
    def get(self):
        log_info("🌐 GET / — main page loaded")
        self.render("index.html")