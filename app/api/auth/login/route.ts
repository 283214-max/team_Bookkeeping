import { readJson, withApi } from "@/lib/team-budget/http";
import { loginUser } from "@/lib/team-budget/store";
import type { Role } from "@/lib/team-budget/types";

export async function POST(request: Request) {
  return withApi(async () => {
    const body = await readJson<{ email?: string; role?: Role }>(request);
    const result = await loginUser({
      email: body.email,
      role: body.role,
    });

    return Response.json(result);
  });
}
