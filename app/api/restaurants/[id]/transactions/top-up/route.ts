import {
  parsePositiveAmount,
  readJson,
  withApi,
} from "@/lib/team-budget/http";
import { requireAdmin, topUpRestaurant } from "@/lib/team-budget/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    const user = await requireAdmin(request);
    const { id } = await context.params;
    const body = await readJson<{
      amount?: number;
      memo?: string;
      idempotencyKey?: string;
    }>(request);

    const result = await topUpRestaurant(user, id, {
      amount: parsePositiveAmount(body.amount),
      memo: body.memo,
      idempotencyKey: body.idempotencyKey,
    });

    return Response.json(result, { status: 201 });
  });
}
