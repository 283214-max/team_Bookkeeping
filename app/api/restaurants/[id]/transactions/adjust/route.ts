import {
  parseIntegerAmount,
  readJson,
  withApi,
} from "@/lib/team-budget/http";
import { adjustRestaurant, requireAdmin } from "@/lib/team-budget/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    const user = await requireAdmin(request);
    const { id } = await context.params;
    const body = await readJson<{
      amountDelta?: number;
      memo?: string;
      idempotencyKey?: string;
    }>(request);

    const result = await adjustRestaurant(user, id, {
      amountDelta: parseIntegerAmount(body.amountDelta),
      memo: body.memo,
      idempotencyKey: body.idempotencyKey,
    });

    return Response.json(result, { status: 201 });
  });
}
