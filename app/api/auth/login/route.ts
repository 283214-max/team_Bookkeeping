import { readJson, withApi } from "@/lib/team-budget/http";
import { loginUser } from "@/lib/team-budget/store";

export async function POST(request: Request) {
  return withApi(async () => {
    const body = await readJson<{ email?: string; name?: string }>(request);
    const result = await loginUser({
      email: body.email,
      name: body.name,
    });

    return Response.json(result);
  });
}
