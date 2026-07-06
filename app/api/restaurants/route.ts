import { readJson, withApi } from "@/lib/team-budget/http";
import {
  createRestaurant,
  getCurrentUser,
  listRestaurants,
  requireAdmin,
} from "@/lib/team-budget/store";
import type { RestaurantStatus } from "@/lib/team-budget/types";

export async function GET(request: Request) {
  return withApi(async () => {
    await getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as RestaurantStatus | null;
    return Response.json(
      await listRestaurants({
        q: searchParams.get("q"),
        status,
      }),
    );
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    const user = await requireAdmin(request);
    const body = await readJson<{
      name?: string;
      category?: string;
      initialAmount?: number;
      memo?: string;
    }>(request);

    const result = await createRestaurant(user, {
      name: body.name,
      category: body.category,
      initialAmount: body.initialAmount,
      memo: body.memo,
    });

    return Response.json(result, { status: 201 });
  });
}
