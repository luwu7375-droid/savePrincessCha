const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const messageList = document.getElementById("messageList");
const sendButton = chatForm.querySelector("button");

const chatMessages = [];
const supabaseClient = createSupabaseClient();
const welcomeMessage = "欢迎来到救公主。";

function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    return null;
  }

  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function addMessage(text, role) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.textContent = text;
  messageList.appendChild(message);
  messageList.scrollTop = messageList.scrollHeight;
  return message;
}

function renderWelcomeMessage() {
  messageList.innerHTML = "";
  addMessage(welcomeMessage, "assistant");
}

function setLoading(isLoading) {
  messageInput.disabled = isLoading;
  sendButton.disabled = isLoading;
  sendButton.textContent = isLoading ? "发送中" : "发送";
}

function readDelta(chunk) {
  return chunk.choices?.[0]?.delta?.content || "";
}

async function saveMessage(role, content) {
  if (!supabaseClient) {
    console.warn("Supabase 未配置，消息未保存。");
    return;
  }

  const { error } = await supabaseClient
    .from("messages")
    .insert({ role, content });

  if (error) {
    console.error("保存消息失败：", error);
  }
}

async function callChatAPI(messages) {
  if (!CHAT_API_ENDPOINT || CHAT_API_ENDPOINT === "YOUR_SUPABASE_EDGE_FUNCTION_CHAT_URL") {
    throw new Error("CHAT_API_ENDPOINT 未配置，请在 config.js 中填写 Supabase Edge Function 地址。");
  }

  return fetch(CHAT_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages,
      stream: true,
    }),
  });
}

async function loadHistory() {
  if (!supabaseClient) {
    renderWelcomeMessage();
    console.warn("Supabase 未配置，历史消息未加载。");
    return;
  }

  const { data, error } = await supabaseClient
    .from("messages")
    .select("role, content, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    renderWelcomeMessage();
    console.error("加载历史消息失败：", error);
    return;
  }

  const history = [...data].reverse();
  chatMessages.length = 0;
  messageList.innerHTML = "";

  if (!history.length) {
    renderWelcomeMessage();
    return;
  }

  for (const message of history) {
    addMessage(message.content, message.role);
    chatMessages.push({
      role: message.role,
      content: message.content,
    });
  }
}

async function requestStreamingReply(assistantMessage) {
  const response = await callChatAPI(chatMessages);

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(errorText || `请求失败：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullReply = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) {
        continue;
      }

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        streamDone = true;
        break;
      }

      const delta = readDelta(JSON.parse(data));
      if (delta) {
        fullReply += delta;
        assistantMessage.textContent = fullReply;
        messageList.scrollTop = messageList.scrollHeight;
      }
    }
  }

  if (!fullReply) {
    throw new Error("未收到模型回复");
  }

  chatMessages.push({ role: "assistant", content: fullReply });
  await saveMessage("assistant", fullReply);
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  addMessage(text, "user");
  chatMessages.push({ role: "user", content: text });
  await saveMessage("user", text);
  messageInput.value = "";

  const assistantMessage = addMessage("", "assistant");
  setLoading(true);

  try {
    await requestStreamingReply(assistantMessage);
  } catch (error) {
    assistantMessage.textContent = `回复失败：${error.message}`;
    chatMessages.pop();
  } finally {
    setLoading(false);
    messageInput.focus();
  }
});

setLoading(true);
loadHistory().finally(() => {
  setLoading(false);
  messageInput.focus();
});
