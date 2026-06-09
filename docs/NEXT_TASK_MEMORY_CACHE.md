# Next Task: Memory Cache

## Current chat frontend flow

1. The browser loads `app.js` from `index.html`.
2. Chat history is loaded from Supabase and rendered into `.message-list`.
3. User submit path:
   - `handleSubmit()` reads the input text.
   - It saves the user message to Supabase.
   - It appends the message to `chatMessages`.
   - It refreshes message actions.
   - It sends the updated conversation to the chat endpoint.
4. Assistant reply path:
   - `requestStreamingReply()` sends `chatMessages` to the backend chat endpoint.
   - Streaming text is rendered into the assistant bubble.
   - The final assistant message is saved to Supabase.
   - The message is pushed into `chatMessages`.
   - Message actions are refreshed again.
5. Message actions on desktop and mobile are handled in `app.js` through `refreshMessageActions()`, long-press/tap handlers, copy/edit/regenerate, and the fixed action menu.

## Current memory frontend flow

1. Memory admin token is entered through the dedicated modal, not the chat input.
2. The token is stored only in `sessionStorage` as `memory_admin_token`.
3. Memory API calls use `x-memory-admin-token`.
4. `loadMemories()` reads the current memories list from the memories endpoint.
5. Memory toggle actions update enabled state through the memories endpoint.
6. Distill flow sends `chatMessages` to the memories endpoint to generate candidate memories.
7. The memory UI is already separated from the main chat composer and does not write the token into chat history.

## Missing backend memory injection/cache pieces

1. The repo already has Supabase Edge Functions for `/chat` and `/memories`.
2. The `/chat` function reads from `memories` (via persona_memories / project_memory providers). `memory_buckets` is retired and not injected (`LEGACY_MEMORY_ENABLED=false`).
3. The `/chat` function already injects memory text into the system prompt.
4. Missing pieces for the next step:
   - no message hash key for cache lookup
   - no `hit memory ids` tracking
   - no `compiled_context` store/reuse path
   - no cache hit short-circuit before rebuilding memory context
   - no explicit persisted memory-context cache table or equivalent reuse mechanism in repo code

## Tomorrow's Claude Code task card

**Task:** Add a minimal memory context cache to the Supabase `/chat` Edge Function.

**Goal:** Reuse previously compiled memory context when the same conversation/memory inputs appear again, without changing the frontend chat flow.

**Constraints:**
- Do not change the model.
- Do not change the chat frontend flow.
- Do not add DB migrations tonight.
- Do not touch secrets.

**Likely implementation shape:**
1. Compute a stable hash from the normalized chat/memory input.
2. Look up a cached compiled memory context by that hash.
3. Reuse cached `compiled_context` on hit.
4. Persist `hit memory ids` alongside the cache record.
5. Fall back to the current memory fetch + system prompt injection on miss.

**Files to inspect or change tomorrow:**
- `supabase/functions/chat/index.ts`
- `supabase/config.toml` if function env wiring is needed
- `README.md` only if a tiny note is needed
