import {
  parsePositiveAmount,
  readJson,
  requireString,
  withApi,
} from "@/lib/team-budget/http";
import { getCurrentUser, spendRestaurant } from "@/lib/team-budget/store";
import type { ReceiptUpload } from "@/lib/team-budget/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    const user = await getCurrentUser(request);
    const { id } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";
    let body: {
      amount?: number | string;
      usedAt?: string;
      memo?: string;
      idempotencyKey?: string;
      receipt?: ReceiptUpload | null;
    };

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const receipt = formData.get("receipt");
      body = {
        amount: requireString(formData.get("amount"), "amount"),
        usedAt: formData.get("usedAt")?.toString(),
        idempotencyKey: formData.get("idempotencyKey")?.toString(),
        receipt:
          receipt instanceof File && receipt.size > 0
            ? {
                fileName: receipt.name,
                contentType: receipt.type,
                size: receipt.size,
                bytes: await receipt.arrayBuffer(),
              }
            : null,
      };
    } else {
      body = await readJson<{
        amount?: number;
        usedAt?: string;
        memo?: string;
        idempotencyKey?: string;
      }>(request);
    }

    const result = await spendRestaurant(user, id, {
      amount: parsePositiveAmount(body.amount),
      usedAt: body.usedAt,
      memo: body.memo,
      idempotencyKey: body.idempotencyKey,
      receipt: body.receipt,
    });

    return Response.json(result, { status: 201 });
  });
}
