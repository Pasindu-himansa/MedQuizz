"""
One-time helper: get a Gmail API refresh token for sending MedQuizz emails.

Usage (from the Backend folder):
    python scripts/get_gmail_token.py path/to/client_secret.json

It opens your browser, you sign in with the Gmail account that should send
the emails and allow "Send email on your behalf", then it prints the values
to add as secrets on the Hugging Face Space.
"""
import json
import secrets
import sys
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

SCOPE = "https://www.googleapis.com/auth/gmail.send"


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        client = json.load(f)
    client = client.get("installed") or client.get("web")
    client_id, client_secret = client["client_id"], client["client_secret"]

    state = secrets.token_urlsafe(16)
    result = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if params.get("state", [None])[0] == state:
                result["code"] = params.get("code", [None])[0]
                result["error"] = params.get("error", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h2>Done - you can close this tab and go back to the terminal.</h2>")

        def log_message(self, *args):
            pass

    server = HTTPServer(("localhost", 0), Handler)
    redirect_uri = f"http://localhost:{server.server_port}"
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    })

    print("Opening your browser to sign in with Google...")
    print(f"If it doesn't open, visit:\n{auth_url}\n")
    webbrowser.open(auth_url)
    while "code" not in result and "error" not in result:
        server.handle_request()

    if not result.get("code"):
        print(f"Authorization failed: {result.get('error')}")
        sys.exit(1)

    data = urllib.parse.urlencode({
        "code": result["code"],
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode()
    with urllib.request.urlopen("https://oauth2.googleapis.com/token", data=data) as res:
        tokens = json.load(res)

    if "refresh_token" not in tokens:
        print("No refresh token returned. Remove the app's access at "
              "https://myaccount.google.com/permissions and run this again.")
        sys.exit(1)

    print("Success! Add these as secrets on your Hugging Face Space:\n")
    print(f"GMAIL_CLIENT_ID      = {client_id}")
    print(f"GMAIL_CLIENT_SECRET  = {client_secret}")
    print(f"GMAIL_REFRESH_TOKEN  = {tokens['refresh_token']}")
    print("GMAIL_SENDER         = the Gmail address you just signed in with")


if __name__ == "__main__":
    main()
