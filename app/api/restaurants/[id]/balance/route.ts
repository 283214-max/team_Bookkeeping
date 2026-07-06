import { withApi } from "@/lib/team-budget/http";
import { getCurrentUser, getRestaurant } from "@/lib/team-budget/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return withApi(async () => {
    await getCurrentUser(request);
    const { id } = await context.params;
    const { balance } = await getRestaurant(id);
    return Response.json(balance);
  });
}
