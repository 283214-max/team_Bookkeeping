import { withApi } from "@/lib/team-budget/http";
import { getCurrentUser } from "@/lib/team-budget/store";

export async function GET(request: Request) {
  return withApi(async () => {
    return Response.json(await getCurrentUser(request));
  });
}
