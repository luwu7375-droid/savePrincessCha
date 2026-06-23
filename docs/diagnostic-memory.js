// Memory System Diagnostic Script
// Paste this into browser console after logging in

(async function diagnoseMemorySystem() {
  console.log("=== Memory System Diagnostic ===\n");

  // Get current user
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    console.error("❌ Cannot get current user:", userError);
    return;
  }

  const userId = user.id;
  console.log("✅ Current user_id:", userId);
  console.log("   Email:", user.email || "N/A");
  console.log("\n");

  // Helper to query table
  async function queryTable(tableName, selectCols = "*") {
    try {
      // Total count
      const { count: totalCount, error: totalError } = await supabaseClient
        .from(tableName)
        .select("*", { count: "exact", head: true });

      if (totalError) {
        console.error(`❌ Error counting ${tableName}:`, totalError);
        return null;
      }

      // User's count
      const { count: userCount, error: userCountError } = await supabaseClient
        .from(tableName)
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      if (userCountError) {
        console.error(`❌ Error counting user ${tableName}:`, userCountError);
        return null;
      }

      // Recent 5 rows
      const { data: recentRows, error: recentError } = await supabaseClient
        .from(tableName)
        .select(selectCols)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (recentError) {
        console.error(`❌ Error fetching recent ${tableName}:`, recentError);
        return null;
      }

      return { totalCount, userCount, recentRows };
    } catch (err) {
      console.error(`❌ Exception querying ${tableName}:`, err);
      return null;
    }
  }

  // 1. memories
  console.log("📚 TABLE: memories");
  const memoriesData = await queryTable("memories", "id, created_at, category, enabled, content");
  if (memoriesData) {
    console.log(`   Total: ${memoriesData.totalCount}`);
    console.log(`   Current user: ${memoriesData.userCount}`);

    // Count enabled/disabled
    const { count: enabledCount } = await supabaseClient
      .from("memories")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("enabled", true);

    console.log(`   Enabled: ${enabledCount || 0}`);
    console.log(`   Disabled: ${(memoriesData.userCount || 0) - (enabledCount || 0)}`);

    if (memoriesData.recentRows.length > 0) {
      console.log("   Recent 5:");
      memoriesData.recentRows.forEach((r, i) => {
        console.log(`     ${i+1}. ${r.created_at} | ${r.category || 'N/A'} | enabled=${r.enabled} | "${(r.content || '').slice(0, 50)}..."`);
      });
    } else {
      console.log("   ⚠️ No memories found for current user");
    }
  }
  console.log("\n");

  // 2. instructions
  console.log("📝 TABLE: instructions");
  const instructionsData = await queryTable("instructions", "id, created_at, category, enabled, content");
  if (instructionsData) {
    console.log(`   Total: ${instructionsData.totalCount}`);
    console.log(`   Current user: ${instructionsData.userCount}`);

    const { count: enabledCount } = await supabaseClient
      .from("instructions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("enabled", true);

    console.log(`   Enabled: ${enabledCount || 0}`);
    console.log(`   Disabled: ${(instructionsData.userCount || 0) - (enabledCount || 0)}`);

    if (instructionsData.recentRows.length > 0) {
      console.log("   Recent 5:");
      instructionsData.recentRows.forEach((r, i) => {
        console.log(`     ${i+1}. ${r.created_at} | ${r.category || 'N/A'} | enabled=${r.enabled} | "${(r.content || '').slice(0, 50)}..."`);
      });
    } else {
      console.log("   ⚠️ No instructions found for current user");
    }
  }
  console.log("\n");

  // 3. auto_memory_candidates
  console.log("🤖 TABLE: auto_memory_candidates");
  const candidatesData = await queryTable("auto_memory_candidates", "id, created_at, status, content");
  if (candidatesData) {
    console.log(`   Total: ${candidatesData.totalCount}`);
    console.log(`   Current user: ${candidatesData.userCount}`);

    // Status distribution
    const statuses = ["new", "pending", "approved", "promoted", "rejected"];
    console.log("   Status distribution:");
    for (const status of statuses) {
      const { count } = await supabaseClient
        .from("auto_memory_candidates")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", status);
      console.log(`     ${status}: ${count || 0}`);
    }

    if (candidatesData.recentRows.length > 0) {
      console.log("   Recent 5:");
      candidatesData.recentRows.forEach((r, i) => {
        console.log(`     ${i+1}. ${r.created_at} | status=${r.status} | "${(r.content || '').slice(0, 50)}..."`);
      });
    } else {
      console.log("   ⚠️ No candidates found for current user");
    }
  }
  console.log("\n");

  // 4. memory_buckets (legacy)
  console.log("🗂️ TABLE: memory_buckets (legacy)");
  const bucketsData = await queryTable("memory_buckets", "id, created_at, category, enabled, content");
  if (bucketsData) {
    console.log(`   Total: ${bucketsData.totalCount}`);
    console.log(`   Current user: ${bucketsData.userCount}`);

    if (bucketsData.recentRows.length > 0) {
      console.log("   Recent 5:");
      bucketsData.recentRows.forEach((r, i) => {
        console.log(`     ${i+1}. ${r.created_at} | ${r.category || 'N/A'} | enabled=${r.enabled} | "${(r.content || '').slice(0, 50)}..."`);
      });
    } else {
      console.log("   ⚠️ No legacy buckets found for current user");
    }
  }
  console.log("\n");

  // 5. conversations
  console.log("💬 TABLE: conversations");
  const convsData = await queryTable("conversations", "id, created_at, title");
  if (convsData) {
    console.log(`   Total: ${convsData.totalCount}`);
    console.log(`   Current user: ${convsData.userCount}`);

    if (convsData.recentRows.length > 0) {
      console.log("   Recent 5:");
      convsData.recentRows.forEach((r, i) => {
        console.log(`     ${i+1}. ${r.created_at} | "${(r.title || '').slice(0, 50)}"`);
      });
    } else {
      console.log("   ⚠️ No conversations found for current user");
    }
  }
  console.log("\n");

  // 6. messages
  console.log("✉️ TABLE: messages");
  const msgsData = await queryTable("messages", "id, created_at, role, content");
  if (msgsData) {
    console.log(`   Total: ${msgsData.totalCount}`);
    console.log(`   Current user: ${msgsData.userCount}`);

    if (msgsData.recentRows.length > 0) {
      console.log("   Recent 5:");
      msgsData.recentRows.forEach((r, i) => {
        console.log(`     ${i+1}. ${r.created_at} | ${r.role} | "${(r.content || '').slice(0, 50)}..."`);
      });
    } else {
      console.log("   ⚠️ No messages found for current user");
    }
  }
  console.log("\n");

  // === DIAGNOSIS ===
  console.log("=== DIAGNOSIS ===\n");

  const hasLegacyBuckets = bucketsData && bucketsData.userCount > 0;
  const hasMemories = memoriesData && memoriesData.userCount > 0;
  const hasInstructions = instructionsData && instructionsData.userCount > 0;
  const hasCandidates = candidatesData && candidatesData.userCount > 0;
  const hasConversations = convsData && convsData.userCount > 0;
  const hasMessages = msgsData && msgsData.userCount > 0;

  if (hasLegacyBuckets && !hasMemories && !hasInstructions) {
    console.log("⚠️ SCENARIO A: Legacy data exists, new system empty");
    console.log("   → memory_buckets has data, but memories/instructions are empty");
    console.log("   → Need migration or read-only legacy archive entry point");
  } else if (hasCandidates && candidatesData.recentRows.some(r => r.status === "promoted") && !hasMemories) {
    console.log("⚠️ SCENARIO B: Candidates promoted but memories empty");
    console.log("   → auto_memory_candidates has 'promoted' status");
    console.log("   → But memories table is empty");
    console.log("   → Check vault_after_chat / promotion pipeline");
  } else if (!hasCandidates && !hasMemories && !hasInstructions) {
    console.log("⚠️ SCENARIO C: No automatic memory capture");
    console.log("   → auto_memory_candidates is empty");
    console.log("   → Check MEMORY_ENDPOINT / MEMORY_ADMIN_TOKEN");
    console.log("   → Check if vault_after_chat is being called");
  } else if (!hasConversations && !hasMessages) {
    console.log("⚠️ SCENARIO D: No chat history");
    console.log("   → conversations and messages are empty");
    console.log("   → Possible environment switch or user_id mismatch");
  } else if (hasMemories || hasInstructions) {
    console.log("⚠️ SCENARIO E: Data exists but frontend may be empty");
    console.log("   → memories/instructions have data");
    console.log("   → If frontend shows empty, check memory center filters");
    console.log("   → Check statusFilter/categoryFilter/recent filter logic");
  } else {
    console.log("✅ System looks healthy");
    console.log(`   → memories: ${memoriesData?.userCount || 0}`);
    console.log(`   → instructions: ${instructionsData?.userCount || 0}`);
    console.log(`   → candidates: ${candidatesData?.userCount || 0}`);
    console.log(`   → conversations: ${convsData?.userCount || 0}`);
    console.log(`   → messages: ${msgsData?.userCount || 0}`);
  }

  console.log("\n=== END DIAGNOSTIC ===");
})();
