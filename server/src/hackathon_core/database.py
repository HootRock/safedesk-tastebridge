"""SQLite locally, or bounded HTTP transport against a Turso cloud primary."""
import re
import sqlite3
from pathlib import Path
from urllib.parse import urlsplit


class DatabaseError(RuntimeError):
    """Stable storage errors that never include provider details or credentials."""


def validate_remote_config(url: str, token: str) -> None:
    try:
        parsed = urlsplit(url)
        labels = (parsed.hostname or "").split(".")
        valid_host = len(labels) >= 3 and labels[-2:] == ["turso", "io"] and all(
            re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels
        )
        valid = (
            url.startswith(("libsql://", "https://"))
            and parsed.scheme in ("libsql", "https")
            and valid_host and parsed.port is None
            and parsed.username is None and parsed.password is None
            and parsed.path in ("", "/") and not parsed.query and not parsed.fragment
            and not any(char.isspace() for char in url)
            and isinstance(token, str) and bool(re.fullmatch(r"[A-Za-z0-9._=-]+", token))
        )
    except (ValueError, TypeError, AttributeError):
        valid = False
    if not valid:
        raise DatabaseError("invalid_remote_config")


def _remote_connect(**kwargs):
    from .libsql_http import HttpConnection
    return HttpConnection(**kwargs)


class Database:
    def __init__(self, path, *, remote_url="", auth_token="", public_hosting=False, remote_connector=None):
        self.path = path
        self.remote = bool(public_hosting or remote_url or auth_token)
        self._remote_url, self._auth_token = remote_url, auth_token
        self._remote_connector = remote_connector or _remote_connect
        if self.remote:
            validate_remote_config(remote_url, auth_token)

    def connect(self):
        if not self.remote:
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(self.path, timeout=10)
            connection.row_factory = sqlite3.Row
            return connection
        try:
            raw = self._remote_connector(database=self._remote_url, auth_token=self._auth_token, timeout=10)
            return _RemoteConnection(raw)
        except DatabaseError:
            raise
        except Exception:
            raise DatabaseError("storage_unavailable") from None


class _Row(tuple):
    def __new__(cls, names, values):
        row = super().__new__(cls, values)
        row._names = names
        return row

    def __getitem__(self, key):
        if isinstance(key, str):
            for index, name in enumerate(self._names):
                if name.lower() == key.lower():
                    return super().__getitem__(index)
            raise IndexError("No item with that key")
        return super().__getitem__(key)

    def keys(self):
        return list(self._names)


class _RemoteCursor:
    def __init__(self, raw):
        self._raw = raw
        self._exhausted = False

    def fetchone(self):
        if self._exhausted:
            return None
        try:
            values = self._raw.fetchone()
            if values is None:
                self._exhausted = True
                return None
            names = tuple(column[0] for column in self._raw.description)
            return _Row(names, values)
        except Exception:
            raise DatabaseError("storage_unavailable") from None

    def fetchall(self):
        return list(self)

    def __iter__(self):
        while (row := self.fetchone()) is not None:
            yield row

    @property
    def rowcount(self):
        try:
            return self._raw.rowcount
        except Exception:
            raise DatabaseError("storage_unavailable") from None


class _RemoteConnection:
    """Adapt tuple rows; explicitly commit/rollback and close each connection."""
    def __init__(self, raw):
        self._raw = raw

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            if exc_type is None:
                self.commit()
            else:
                self.rollback()
        finally:
            self.close()
        return False

    def execute(self, sql, parameters=()):
        try:
            return _RemoteCursor(self._raw.execute(sql, parameters))
        except Exception:
            raise DatabaseError("storage_unavailable") from None

    def executescript(self, script):
        # The legacy injected libsql driver suppresses errors on Connection.executescript;
        # its cursor and the production HTTP transport propagate them.
        try:
            cursor = self._raw.cursor()
            try:
                cursor.executescript(script)
            finally:
                cursor.close()
        except Exception:
            raise DatabaseError("storage_unavailable") from None

    def commit(self):
        try:
            self._raw.commit()
        except Exception:
            raise DatabaseError("storage_unavailable") from None

    def rollback(self):
        try:
            self._raw.rollback()
        except Exception:
            raise DatabaseError("storage_unavailable") from None

    def close(self):
        try:
            self._raw.close()
        except Exception:
            raise DatabaseError("storage_unavailable") from None
