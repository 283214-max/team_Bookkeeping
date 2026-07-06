import { readJson, withApi } from "@/lib/team-budget/http";
import {
  deleteRestaurant,
  getCurrentUser,
  getRestaurant,
  requireAdmin,
  updateRestaurant,
} from "@/lib/team-budget/store";
import type { RestaurantStatus } from "@/lib/team-budget/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return withApi(async () => {
    await getCurrentUser(request);
    const { id } = await context.params;
    return Response.json(await getRestaurant(id));
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return withApi(async () => {
    const user = await requireAdmin(request);
    const { id } = await context.params;
    const body = await readJson<{
      name?: string;
      category?: string;
      status?: RestaurantStatus;
      memo?: string;
    }>(request);

    return Response.json(await updateRestaurant(user, id, body));
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return withApi(async () => {
    const user = await requireAdmin(request);
    const { id } = await context.params;

    return Response.json(await deleteRestaurant(user, id));
  });
}
