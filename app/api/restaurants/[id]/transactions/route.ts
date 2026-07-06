import { withApi } from "@/lib/team-budget/http";
import {
  getCurrentUser,
  listRestaurantTransactions,
} from "@/lib/team-budget/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return withApi(async () => {
    await getCurrentUser(request);
    const { id } = await context.params;
    return Response.json(await listRestaurantTransactions(id));
  });
}
