import { withApi } from "@/lib/team-budget/http";
import { getCurrentUser, listTransactions } from "@/lib/team-budget/store";
import type { TransactionType } from "@/lib/team-budget/types";

export async function GET(request: Request) {
  return withApi(async () => {
    const requestUser = await getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as TransactionType | "ALL" | null;

    return Response.json(
      await listTransactions({
        requestUser,
        restaurantId: searchParams.get("restaurantId"),
        userId: searchParams.get("userId"),
        type,
      }),
    );
  });
}
