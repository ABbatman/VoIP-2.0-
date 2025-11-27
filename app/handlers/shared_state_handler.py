# app/handlers/shared_state_handler.py
# Tornado handlers for shared state API (short links)

import json

import tornado.web

from app.repositories.shared_state_repository import SharedStateRepository
from app.utils.logger import log_info, log_exception


class SharedStateSaveHandler(tornado.web.RequestHandler):
    """POST /api/state - save state and return short ID."""

    def initialize(self, repository: SharedStateRepository | None = None):
        self.repository = repository or SharedStateRepository()

    async def post(self):
        try:
            # parse JSON body
            try:
                body = json.loads(self.request.body.decode('utf-8'))
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                log_info(f"SharedStateSaveHandler: invalid JSON - {e}")
                self.set_status(400)
                self.write({"error": "Invalid JSON body"})
                return

            if not isinstance(body, dict):
                self.set_status(400)
                self.write({"error": "Body must be a JSON object"})
                return

            # save state
            short_id = await self.repository.save(body)
            log_info(f"SharedStateSaveHandler: saved state with id={short_id}")

            self.set_header("Content-Type", "application/json")
            self.write({"id": short_id})

        except Exception as e:
            log_exception(e, "SharedStateSaveHandler: error saving state")
            self.set_status(500)
            self.write({"error": "Internal server error"})


class SharedStateLoadHandler(tornado.web.RequestHandler):
    """GET /api/state/<id> - load state by short ID."""

    def initialize(self, repository: SharedStateRepository | None = None):
        self.repository = repository or SharedStateRepository()

    async def get(self, state_id: str):
        try:
            if not state_id:
                self.set_status(400)
                self.write({"error": "Missing state ID"})
                return

            state = await self.repository.load(state_id)

            if state is None:
                log_info(f"SharedStateLoadHandler: state not found id={state_id}")
                self.set_status(404)
                self.write({"error": "State not found"})
                return

            log_info(f"SharedStateLoadHandler: loaded state id={state_id}")
            self.set_header("Content-Type", "application/json")
            self.write(state)

        except Exception as e:
            log_exception(e, "SharedStateLoadHandler: error loading state")
            self.set_status(500)
            self.write({"error": "Internal server error"})
