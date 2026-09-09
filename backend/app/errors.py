from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Помилка застосунку з єдиною структурою відповіді (див. розділ 2.5 вимог)."""

    def __init__(self, code: str, message: str, status_code: int = 400, details: dict | None = None):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)


def error_body(code: str, message: str, details: dict | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}}}


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=error_body(exc.code, exc.message, exc.details))


async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=error_body("internal_error", "Внутрішня помилка сервера", {"type": type(exc).__name__}),
    )
