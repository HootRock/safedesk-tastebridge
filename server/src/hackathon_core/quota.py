"""Atomic daily request caps shared by reconstructed application instances."""
from datetime import date
from typing import Protocol

from .database import Database


class RequestQuota(Protocol):
    def claim(self, service: str, day: str, limit: int) -> bool: ...


class DailyQuota:
    def __init__(self, database: Database):
        self.database = database
        with database.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS request_quotas(
                service TEXT NOT NULL, day TEXT NOT NULL, requests INTEGER NOT NULL,
                PRIMARY KEY(service,day))""")

    def claim(self, service: str, day: str, limit: int) -> bool:
        if not isinstance(limit, int) or isinstance(limit, bool) or limit < 0:
            raise ValueError("invalid_quota_limit")
        if not isinstance(service, str) or not service or len(service) > 64:
            raise ValueError("invalid_quota_service")
        if not isinstance(day, str) or date.fromisoformat(day).isoformat() != day:
            raise ValueError("invalid_quota_day")
        if limit == 0:
            return False
        with self.database.connect() as db:
            # One conditional statement prevents read/modify/write races across processes.
            row = db.execute("""INSERT INTO request_quotas(service,day,requests) VALUES(?,?,1)
                ON CONFLICT(service,day) DO UPDATE SET requests=requests+1 WHERE requests<?
                RETURNING requests""", (service, day, limit)).fetchone()
            return row is not None
