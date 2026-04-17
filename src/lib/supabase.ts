import { createProjectClient } from "@mzon7/zon-incubator-sdk";

const client = createProjectClient("ai_qa_tester_");

export const { supabase, dbTable } = client;
/** Project-scoped callEdgeFunction — auto-reports errors with the correct prefix. */
export const callEdgeFn = client.callEdgeFunction;
