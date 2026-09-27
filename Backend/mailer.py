import base64
import os
import time
from email.message import EmailMessage

import httpx

# Sends mail through the Gmail API over HTTPS. SMTP ports are blocked on
# Hugging Face Spaces, so smtplib cannot be used there.
# Required env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER
# (get the refresh token with scripts/get_gmail_token.py).
# Set EMAIL_DEV_MODE=1 locally to print emails to the console instead.

TOKEN_URL = "https://oauth2.googleapis.com/token"
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

_access_token = {"value": None, "expires_at": 0}


def email_configured() -> bool:
    return all(os.environ.get(k) for k in [
        "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER"
    ])


def _get_access_token() -> str:
    if _access_token["value"] and time.time() < _access_token["expires_at"] - 60:
        return _access_token["value"]

    res = httpx.post(TOKEN_URL, data={
        "client_id": os.environ["GMAIL_CLIENT_ID"],
        "client_secret": os.environ["GMAIL_CLIENT_SECRET"],
        "refresh_token": os.environ["GMAIL_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    }, timeout=15)
    res.raise_for_status()
    data = res.json()
    _access_token["value"] = data["access_token"]
    _access_token["expires_at"] = time.time() + data.get("expires_in", 3600)
    return _access_token["value"]


def send_email(to: str, subject: str, text: str, html: str = None):
    if not email_configured():
        if os.environ.get("EMAIL_DEV_MODE") == "1":
            print(f"[EMAIL_DEV_MODE] To: {to} | Subject: {subject}\n{text}")
            return
        raise RuntimeError("Email sending is not configured (GMAIL_* env vars missing)")

    msg = EmailMessage()
    msg["To"] = to
    msg["From"] = f"MedQuizz <{os.environ['GMAIL_SENDER']}>"
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    res = httpx.post(
        SEND_URL,
        json={"raw": raw},
        headers={"Authorization": f"Bearer {_get_access_token()}"},
        timeout=15,
    )
    res.raise_for_status()


def send_otp_email(to: str, code: str, purpose: str, minutes_valid: int):
    if purpose == "register":
        subject = f"{code} is your MedQuizz verification code"
        intro = "Use this code to verify your email and finish creating your MedQuizz account."
    else:
        subject = f"{code} is your MedQuizz password reset code"
        intro = "Use this code to reset your MedQuizz password."

    footer = f"The code expires in {minutes_valid} minutes. If you didn't request this, you can ignore this email."
    text = f"{intro}\n\nYour code: {code}\n\n{footer}"
    html = f"""\
<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1f2937">
  <h2 style="margin:0 0 16px;color:#4f46e5">MedQuizz</h2>
  <p style="margin:0 0 16px">{intro}</p>
  <div style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#eef2ff;padding:16px;text-align:center;border-radius:8px">{code}</div>
  <p style="margin:16px 0 0;font-size:13px;color:#6b7280">{footer}</p>
</div>"""
    send_email(to, subject, text, html)
