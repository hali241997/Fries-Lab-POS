import { actorFromRequest, memberDto } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    return json(memberDto((await actorFromRequest(request)).actor));
  } catch (error: unknown) {
    return errorResponse(error, 401);
  }
});
