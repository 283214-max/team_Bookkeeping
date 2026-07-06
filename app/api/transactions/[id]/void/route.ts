import { readJson, withApi } from "@/lib/team-budget/http";
import { getCurrentUser, voidTransaction } from "@/lib/team-budget/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  return withApi(async () => {
    const user = await getCurrentUser(request);
    const { id } = await context.params;
    const body = await readJson<{
      reason?: string;
      idempotencyKey?: string;
    }>(request);

    const result = await voidTransaction(user, id, {
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
    });

    return Response.json(result, { status: 201 });
  });
}
