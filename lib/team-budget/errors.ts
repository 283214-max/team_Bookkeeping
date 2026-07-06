import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function validationError(message: string, details?: unknown) {
  return new ApiError(400, "VALIDATION_ERROR", message, details);
}

export function unauthorized(message = "로그인이 필요합니다.") {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "관리자 권한이 필요합니다.") {
  return new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "대상을 찾을 수 없습니다.") {
  return new ApiError(404, "NOT_FOUND", message);
}

export function conflict(code: string, message: string, details?: unknown) {
  return new ApiError(409, code, message, details);
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    const body: ApiErrorBody = {
      code: error.code,
      message: error.message,
      details: error.details,
    };
    return Response.json(body, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
  return Response.json(
    {
      code: "INTERNAL_ERROR",
      message,
    } satisfies ApiErrorBody,
    { status: 500 },
  );
}
