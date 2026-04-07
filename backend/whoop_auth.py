"""
One-time WHOOP OAuth flow. Run this once to get a refresh token.

    cd backend && python whoop_auth.py

It will:
  1. Print an authorization URL — open it in your browser
  2. Start a local server on port 8080 to catch the callback
  3. Exchange the code for tokens
  4. Save the refresh token to backend/.env as WHOOP_REFRESH_TOKEN
"""
import os
import urllib.parse
import urllib.request
import json
import secrets
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from dotenv import load_dotenv

ENV_FILE = Path(__file__).parent / ".env"
load_dotenv(ENV_FILE)

CLIENT_ID     = os.environ["WHOOP_CLIENT_ID"]
CLIENT_SECRET = os.environ["WHOOP_CLIENT_SECRET"]
REDIRECT_URI  = os.environ["WHOOP_REDIRECT_URI"]

AUTH_URL  = "https://api.prod.whoop.com/oauth/oauth2/auth"
TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"

SCOPES = "read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement offline"

state = secrets.token_urlsafe(16)
received_code = None


class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global received_code
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if params.get("state", [None])[0] != state:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"State mismatch. Try again.")
            return

        received_code = params.get("code", [None])[0]
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"<h2>Authorized! You can close this tab.</h2>")

    def log_message(self, *args):
        pass  # suppress request logs


def exchange_code(code):
    data = urllib.parse.urlencode({
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  REDIRECT_URI,
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }).encode()

    req = urllib.request.Request(TOKEN_URL, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("User-Agent", "Mozilla/5.0")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code}: {body}")
        raise


def save_refresh_token(token):
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    lines = [l for l in lines if not l.startswith("WHOOP_REFRESH_TOKEN=")]
    lines.append(f"WHOOP_REFRESH_TOKEN={token}")
    ENV_FILE.write_text("\n".join(lines) + "\n")
    print(f"✓ Saved WHOOP_REFRESH_TOKEN to {ENV_FILE}")


if __name__ == "__main__":
    params = urllib.parse.urlencode({
        "client_id":     CLIENT_ID,
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         SCOPES,
        "state":         state,
    })
    auth_url = f"{AUTH_URL}?{params}"

    print("\nOpen this URL in your browser:\n")
    print(auth_url)
    print("\nWaiting for callback on http://localhost:8080 ...\n")

    server = HTTPServer(("localhost", 8080), CallbackHandler)
    server.handle_request()  # handle one request then stop

    if not received_code:
        print("No code received. Aborting.")
        exit(1)

    print("Code received. Exchanging for tokens...")
    tokens = exchange_code(received_code)

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        print("No refresh token in response:", tokens)
        exit(1)

    save_refresh_token(refresh_token)
    print(f"\nAccess token (expires soon): {tokens['access_token'][:40]}...")
    print("Done. You won't need to run this again.")
