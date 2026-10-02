import { handleOptions, json } from "../_shared/http.ts";

Deno.serve((request) => handleOptions(request) ?? json({ ok: true }));
