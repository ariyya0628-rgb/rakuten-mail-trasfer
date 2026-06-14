from pathlib import Path

from google.auth.exceptions import GoogleAuthError, RefreshError, TransportError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


SCOPES = [
    "https://www.googleapis.com/auth/gmail.settings.basic",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/gmail.readonly",
]

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CREDENTIALS_DIR = PROJECT_ROOT / "credentials"
CREDENTIALS_FILE = CREDENTIALS_DIR / "credentials.json"
TOKEN_FILE = CREDENTIALS_DIR / "token.json"


class CredentialsFileNotFoundError(FileNotFoundError):
    pass


class GmailAuthenticationError(RuntimeError):
    pass


def get_gmail_service():
    if not CREDENTIALS_FILE.exists():
        raise CredentialsFileNotFoundError(str(CREDENTIALS_FILE))

    credentials = None
    if TOKEN_FILE.exists():
        credentials = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        if not credentials.has_scopes(SCOPES):
            credentials = None

    if credentials and credentials.expired and credentials.refresh_token:
        try:
            credentials.refresh(Request())
        except (RefreshError, TransportError, GoogleAuthError) as exc:
            raise GmailAuthenticationError(str(exc)) from exc

    if not credentials or not credentials.valid:
        try:
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
            credentials = flow.run_local_server(port=0)
        except Exception as exc:
            raise GmailAuthenticationError(str(exc)) from exc

        CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(credentials.to_json(), encoding="utf-8")

    return build("gmail", "v1", credentials=credentials)
