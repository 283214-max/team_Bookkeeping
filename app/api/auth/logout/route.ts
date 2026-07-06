import { getCurrentUser } from "@/lib/team-budget/store";
import { withApi } from "@/lib/team-budget/http";

export async function POST(request: Request) {
  return withApi(async () => {
    await getCurrentUser(request);
    return Response.json({ success: true });
  });
}
