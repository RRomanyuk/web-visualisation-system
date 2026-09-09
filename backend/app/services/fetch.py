"""Отримання сирих даних із зовнішнього відкритого REST API (вимога 2.1)."""

from urllib.parse import urlparse

import httpx

from app.errors import AppError


def _validate_url(url: str, allowed_hosts: list[str]) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise AppError("invalid_url", "URL має використовувати схему http або https", 400)
    host = (parsed.hostname or "").lower()
    if not host:
        raise AppError("invalid_url", "Не вдалося визначити хост у URL", 400)
    if allowed_hosts and host not in allowed_hosts:
        raise AppError(
            "host_not_allowed",
            f"Хост '{host}' не входить до списку дозволених джерел",
            403,
            {"allowed_hosts": allowed_hosts},
        )


def fetch_raw(
    *,
    url: str,
    method: str,
    headers: dict[str, str],
    params: dict,
    timeout: int,
    max_bytes: int,
    allowed_hosts: list[str],
) -> tuple[bytes, str]:
    """Повертає (тіло відповіді, content-type). Кидає AppError при будь-якій проблемі."""
    _validate_url(url, allowed_hosts)
    try:
        with httpx.Client(follow_redirects=True, timeout=timeout) as client:
            with client.stream(method, url, headers=headers, params=params) as resp:
                _validate_url(str(resp.url), allowed_hosts)  # повторна перевірка після редіректів
                if resp.status_code >= 400:
                    raise AppError(
                        "fetch_failed",
                        f"Зовнішній API повернув статус {resp.status_code}",
                        502,
                        {"status_code": resp.status_code},
                    )
                content_type = resp.headers.get("content-type", "")
                total = 0
                chunks: list[bytes] = []
                for chunk in resp.iter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise AppError(
                            "response_too_large",
                            f"Відповідь перевищує ліміт {max_bytes // (1024 * 1024)} МБ",
                            413,
                        )
                    chunks.append(chunk)
    except httpx.TimeoutException:
        raise AppError("fetch_timeout", "Перевищено час очікування відповіді від зовнішнього API", 504)
    except httpx.HTTPError as exc:
        raise AppError("fetch_failed", f"Помилка запиту до зовнішнього API: {exc}", 502)

    body = b"".join(chunks)
    if not body.strip():
        raise AppError("empty_dataset", "Зовнішній API повернув порожню відповідь", 422)
    return body, content_type
