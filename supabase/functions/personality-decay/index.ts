// ── Ombre Brain: daily L2 personality decay function ─────────────────────────
//
// Scheduled via Supabase pg_cron or called directly via HTTP.
// Fetches all active L2 features, computes decay score, archives those below 0.3.
//
// Decay formula:
//   Score = Importance × (activation_count^0.3) × e^(-λ×days) × emotion_weight
//   λ = 0.05 (5% per day), archive threshold = 0.3
//   emotion_weight = clamp((|valence| + |arousal|) / 2, 0.1, 1.0)
//     (use absolute values so negative emotions still keep features active;
//      floor at 0.1 to prevent zero-weight features from dying instantly)
//
// Run cadence: once per day (UTC midnight), via Supabase pg_cron:
//   SELECT cron.schedule('personality-decay', '0 0 * * *',
//     $$SELECT net.http_post(url := 'https://<ref>.functions.supabase.co/personality-decay',
//       headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}',
//       body := '{}') AS request_id;$$
//   );

const FUNCTION_VERSION = "decay-v1";
const DECAY_LAMBDA = 0.05;       // 5% per day
const ARCHIVE_THRESHOLD = 0.3;   // below this → archived
const BATCH_SIZE = 100;           // rows per DB page

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type L2Row = {
  id: string;
  user_id: string;
  name: string;
  importance: number;
  activation_count: number;
  decay_rate: number;
  calculated_score: number;
  first_detected_at: string;
  last_reinforced_at: string;
  valence: number | null;
  arousal: number | null;
  resolved: boolean;
  status: string;
};

type DecayResult = {
  processed: number;
  archived: number;
  updated: number;
  errors: number;
};

function computeScore(row: L2Row, nowMs: number): number {
  const firstMs = new Date(row.first_detected_at).getTime();
  const days = (nowMs - firstMs) / 86_400_000;

  // Decay factor: if resolved=true, double the decay coefficient
  const lambda = row.resolved ? DECAY_LAMBDA * 2 : DECAY_LAMBDA;

  // emotion_weight: use absolute values, clamp to [0.1, 1.0]
  const absValence = Math.abs(row.valence ?? 0);
  const absArousal = Math.abs(row.arousal ?? 0);
  const emotionWeight = Math.max(0.1, Math.min(1.0, (absValence + absArousal) / 2));

  const score =
    row.importance *
    Math.pow(Math.max(row.activation_count, 1), 0.3) *
    Math.exp(-lambda * days) *
    emotionWeight;

  return Math.max(0, score);
}

async function fetchActiveBatch(
  supabaseUrl: string,
  serviceRoleKey: string,
  offset: number,
): Promise<L2Row[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/persona_layer2_dynamic_features` +
      `?status=eq.active` +
      `&select=id,user_id,name,importance,activation_count,decay_rate,calculated_score,` +
      `first_detected_at,last_reinforced_at,valence,arousal,resolved,status` +
      `&order=first_detected_at.asc&limit=${BATCH_SIZE}&offset=${offset}`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fetch failed HTTP ${res.status}: ${text.slice(0, 80)}`);
  }
  return (await res.json()) as L2Row[];
}

async function archiveRow(
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string,
  newScore: number,
): Promise<void> {
  await fetch(
    `${supabaseUrl}/rest/v1/persona_layer2_dynamic_features?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: "archived",
        calculated_score: parseFloat(newScore.toFixed(4)),
        reason_for_status: `Natural decay: score ${newScore.toFixed(4)} < ${ARCHIVE_THRESHOLD}`,
      }),
    },
  );
}

async function updateScore(
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string,
  newScore: number,
): Promise<void> {
  await fetch(
    `${supabaseUrl}/rest/v1/persona_layer2_dynamic_features?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        calculated_score: parseFloat(newScore.toFixed(4)),
      }),
    },
  );
}

async function runDecay(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<DecayResult> {
  const result: DecayResult = { processed: 0, archived: 0, updated: 0, errors: 0 };
  const nowMs = Date.now();
  let offset = 0;

  while (true) {
    let rows: L2Row[];
    try {
      rows = await fetchActiveBatch(supabaseUrl, serviceRoleKey, offset);
    } catch (err) {
      console.error(`[decay] fetchActiveBatch offset=${offset} error:`, err instanceof Error ? err.message : String(err));
      result.errors += 1;
      break;
    }

    if (rows.length === 0) break;

    // Process concurrently within the batch (capped to avoid connection flooding)
    const ops = rows.map(async (row) => {
      result.processed += 1;
      const newScore = computeScore(row, nowMs);
      try {
        if (newScore < ARCHIVE_THRESHOLD) {
          await archiveRow(supabaseUrl, serviceRoleKey, row.id, newScore);
          result.archived += 1;
        } else if (Math.abs(newScore - row.calculated_score) > 0.001) {
          // Only write if score changed meaningfully
          await updateScore(supabaseUrl, serviceRoleKey, row.id, newScore);
          result.updated += 1;
        }
      } catch (err) {
        console.error(`[decay] update error row=${row.id}:`, err instanceof Error ? err.message : String(err));
        result.errors += 1;
      }
    });

    await Promise.all(ops);

    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return result;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Accept POST only; allow GET for manual trigger convenience
  if (request.method !== "POST" && request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("DB_URL") || Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("DB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing DB_URL or DB_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const t0 = Date.now();

  let result: DecayResult;
  try {
    result = await runDecay(supabaseUrl, serviceRoleKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[decay] fatal error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const totalMs = Date.now() - t0;
  const log = { fn: "personality-decay", v: FUNCTION_VERSION, ...result, total_ms: totalMs };
  console.log(JSON.stringify(log));

  return new Response(JSON.stringify(log), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
