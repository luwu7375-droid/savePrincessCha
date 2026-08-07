// ── push-send Edge Function ───────────────────────────────────────────────────
//
// Sends Web Push notifications to all enabled subscriptions for a user.
// Uses VAPID (Voluntary Application Server Identification) for authentication.
//
// Flow:
//   1. Fetch all enabled push_subscriptions for the given userId
//   2. For each subscription:
//      a. Generate VAPID JWT token
//      b. Encrypt notification payload using ECDH P-256
//      c. POST to push service endpoint
//      d. Handle failures (410 Gone = dead subscription, disable it)
//
// References:
//   - RFC 8291: Message Encryption for Web Push
//   - RFC 8292: Voluntary Application Server Identification (VAPID)
//   - https://developers.google.com/web/fundamentals/push-notifications/web-push-protocol

import { makeCorsHeaders } from "../_shared/cors.ts";

const corsHeaders = makeCorsHeaders({
  "Access-Control-Expose-Headers": "x-push-send-status",
});

// VAPID keys (P-256 ECDH keypair)
// Read from environment variables (Supabase Secrets)
const VAPID_PUBLIC_KEY =
  Deno.env.get("VAPID_PUBLIC_KEY") ||
  "BKT3lETzzUJ9Qw0VHFAr78whHwpXOvae8lnM_EE_tra_S2uIbhyCAHb4bo98W37L-YguYPw3iT017bterXlJNm4";
const VAPID_PRIVATE_KEY_DER_BASE64 =
  Deno.env.get("VAPID_PRIVATE_KEY") ||
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgPgjwxwkAErrhfO61cPno_8wDTqprhoeCCgj3k8EQH4uhRANCAASk95RE881CfUMNFRxQK-_MIR8KVzr2nvJZzPxBP7a2v0triG4cggB2-G6PfFt-y_mILmD8N4k9Ne27Xq15STZu";

const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@saveprincesscha.com";

type PushSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  enabled: boolean;
  last_success_at: string | null;
  failure_count: number;
};

type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
};

type PushSendResult = {
  success: boolean;
  delivered: number;
  failed: number;
  disabled: number;
  errors: Array<{ endpoint: string; error: string }>;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── VAPID JWT signing ─────────────────────────────────────────────────────────

async function generateVapidJwt(audience: string): Promise<string> {
  // JWT header: { "typ": "JWT", "alg": "ES256" }
  const header = btoa(JSON.stringify({ typ: "JWT", alg: "ES256" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // JWT payload: { "aud": "<push-service-origin>", "exp": <24h-from-now>, "sub": "<mailto:...>" }
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 86400; // 24 hours
  const payload = btoa(
    JSON.stringify({ aud: audience, exp, sub: VAPID_SUBJECT }),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const unsignedToken = `${header}.${payload}`;

  // Import VAPID private key for signing
  const privateKeyDer = Uint8Array.from(
    atob(VAPID_PRIVATE_KEY_DER_BASE64),
    (c) => c.charCodeAt(0),
  );
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyDer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  // Sign with ES256 (ECDSA P-256 SHA-256)
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(unsignedToken),
  );

  // Convert signature to base64url
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${unsignedToken}.${signature}`;
}

// ── Web Push encryption (RFC 8291) ────────────────────────────────────────────

async function encryptPayload(
  payload: string,
  userPublicKey: string,
  userAuth: string,
): Promise<{
  ciphertext: Uint8Array;
  salt: Uint8Array;
  publicKey: Uint8Array;
}> {
  // Generate ephemeral ECDH P-256 keypair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  // Import user's public key (p256dh, base64url-decoded)
  const userPublicKeyBytes = Uint8Array.from(
    atob(userPublicKey.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const userKey = await crypto.subtle.importKey(
    "raw",
    userPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // Derive shared secret via ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: userKey },
    serverKeyPair.privateKey,
    256,
  );

  // Export server public key (uncompressed format, 65 bytes)
  const serverPublicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey),
  );

  // Derive encryption key and nonce using HKDF-SHA256
  const authSecret = Uint8Array.from(
    atob(userAuth.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF extract: PRK = HMAC-SHA256(auth, sharedSecret)
  const authKey = await crypto.subtle.importKey(
    "raw",
    authSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prk = new Uint8Array(
    await crypto.subtle.sign("HMAC", authKey, new Uint8Array(sharedSecret)),
  );

  // HKDF expand for IKM (Input Keying Material)
  const ikmInfo = new Uint8Array([
    ...new TextEncoder().encode("WebPush: info\0"),
    ...userPublicKeyBytes,
    ...serverPublicKeyBytes,
  ]);
  const ikmKey = await crypto.subtle.importKey(
    "raw",
    prk,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const ikm = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      ikmKey,
      new Uint8Array([...ikmInfo, 1]),
    ),
  );

  // Derive content encryption key (CEK) and nonce
  const saltKey = await crypto.subtle.importKey(
    "raw",
    salt,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const cekInfo = new Uint8Array([
    ...new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
    1,
  ]);
  const cek = new Uint8Array(
    await crypto.subtle.sign("HMAC", saltKey, new Uint8Array([...ikm, ...cekInfo])),
  ).slice(0, 16);

  const nonceInfo = new Uint8Array([
    ...new TextEncoder().encode("Content-Encoding: nonce\0"),
    1,
  ]);
  const nonce = new Uint8Array(
    await crypto.subtle.sign("HMAC", saltKey, new Uint8Array([...ikm, ...nonceInfo])),
  ).slice(0, 12);

  // Encrypt payload with AES-128-GCM
  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // Add padding (2 bytes: 0x00 0x00) + payload
  const paddedPayload = new Uint8Array([
    0x00,
    0x00,
    ...new TextEncoder().encode(payload),
  ]);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      paddedPayload,
    ),
  );

  return { ciphertext, salt, publicKey: serverPublicKeyBytes };
}

// ── Push delivery ─────────────────────────────────────────────────────────────

async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<{ success: boolean; shouldDisable: boolean; error?: string }> {
  try {
    // Extract push service origin for VAPID audience
    const endpointUrl = new URL(subscription.endpoint);
    const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

    // Generate VAPID JWT
    const jwt = await generateVapidJwt(audience);

    // Encrypt payload
    const payloadJson = JSON.stringify(payload);
    const { ciphertext, salt, publicKey } = await encryptPayload(
      payloadJson,
      subscription.p256dh,
      subscription.auth,
    );

    // Send POST to push service endpoint
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Content-Length": String(ciphertext.length),
        "TTL": "86400", // 24 hours
        "Urgency": "high",
        Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
        Crypto_Key: `dh=${btoa(String.fromCharCode(...publicKey)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`,
        Encryption: `salt=${btoa(String.fromCharCode(...salt)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`,
      },
      body: ciphertext,
    });

    if (response.status === 410) {
      // 410 Gone: subscription expired or was unsubscribed
      return { success: false, shouldDisable: true, error: "subscription_expired" };
    }

    if (response.status === 404) {
      // 404 Not Found: subscription no longer exists
      return { success: false, shouldDisable: true, error: "subscription_not_found" };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        success: false,
        shouldDisable: false,
        error: `HTTP ${response.status}: ${errorText.slice(0, 100)}`,
      };
    }

    return { success: true, shouldDisable: false };
  } catch (error) {
    return {
      success: false,
      shouldDisable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: { userId: string; payload: PushPayload };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { userId, payload } = body;

  if (!userId || typeof userId !== "string") {
    return jsonResponse({ error: "userId is required" }, 400);
  }

  if (!payload || typeof payload !== "object") {
    return jsonResponse({ error: "payload is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("DB_URL") || Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("DB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Database configuration missing" }, 500);
  }

  // Fetch all enabled push subscriptions for this user
  const fetchUrl =
    `${supabaseUrl}/rest/v1/push_subscriptions` +
    `?user_id=eq.${encodeURIComponent(userId)}` +
    `&enabled=eq.true` +
    `&select=*`;

  const fetchRes = await fetch(fetchUrl, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!fetchRes.ok) {
    const errorText = await fetchRes.text().catch(() => "");
    return jsonResponse(
      { error: `Failed to fetch subscriptions: ${errorText.slice(0, 100)}` },
      500,
    );
  }

  const subscriptions: PushSubscription[] = await fetchRes.json();

  if (subscriptions.length === 0) {
    return jsonResponse({ success: true, delivered: 0, message: "No subscriptions" });
  }

  const result: PushSendResult = {
    success: true,
    delivered: 0,
    failed: 0,
    disabled: 0,
    errors: [],
  };

  // Send push to each subscription
  for (const sub of subscriptions) {
    const sendResult = await sendPushNotification(sub, payload);

    if (sendResult.success) {
      result.delivered++;
      // Update last_success_at and reset failure_count
      await fetch(
        `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${sub.id}`,
        {
          method: "PATCH",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            last_success_at: new Date().toISOString(),
            failure_count: 0,
          }),
        },
      );
    } else {
      result.failed++;
      result.errors.push({
        endpoint: sub.endpoint.slice(0, 50) + "...",
        error: sendResult.error || "unknown",
      });

      if (sendResult.shouldDisable) {
        // Disable dead subscription
        result.disabled++;
        await fetch(
          `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${sub.id}`,
          {
            method: "PATCH",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ enabled: false }),
          },
        );
      } else {
        // Increment failure_count, disable after 3 failures
        const newFailureCount = sub.failure_count + 1;
        await fetch(
          `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${sub.id}`,
          {
            method: "PATCH",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              failure_count: newFailureCount,
              enabled: newFailureCount < 3,
            }),
          },
        );

        if (newFailureCount >= 3) {
          result.disabled++;
        }
      }
    }
  }

  return jsonResponse(result);
});
