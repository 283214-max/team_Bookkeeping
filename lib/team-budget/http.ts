import { toErrorResponse, validationError } from "./errors";

export async function readJson<T>(request: Request): Promise<Partial<T>> {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as Partial<T>;
  } catch {
    throw validationError("JSON 형식이 올바르지 않습니다.");
  }
}

export function withApi(handler: () => Response | Promise<Response>) {
  return Promise.resolve(handler()).catch(toErrorResponse);
}

export function parsePositiveAmount(value: unknown, fieldName = "amount") {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^\d]/g, ""))
        : NaN;

  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    throw validationError(`${fieldName}는 0보다 큰 정수여야 합니다.`, {
      field: fieldName,
    });
  }

  return amount;
}

export function parseIntegerAmount(value: unknown, fieldName = "amountDelta") {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^\d-]/g, ""))
        : NaN;

  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount === 0) {
    throw validationError(`${fieldName}는 0이 아닌 정수여야 합니다.`, {
      field: fieldName,
    });
  }

  return amount;
}

export function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw validationError(`${fieldName} 값이 필요합니다.`, { field: fieldName });
  }

  return value.trim();
}
