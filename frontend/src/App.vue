<script setup lang="ts">
import { ref } from "vue";

interface Message {
  role: "user" | "assistant";
  text: string;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

interface TraceStep {
  type: "agent" | "tool_result";
  status?: "tool_call" | "final_answer";
  toolCalls?: ToolCall[];
  tool?: string;
  toolCallId?: string;
  content?: unknown;
}

interface EvaluationResult {
  toolCallingAccuracy?: {
    expected?: string[];
    actual?: string[];
    passed?: boolean;
    details?: Array<{
      expected: string;
      actual: string;
      result: "✓" | "✗";
    }>;
  };
  retrievalHitRate?: {
    expectedKeywords?: string[];
    actualText?: string;
    matched?: string[];
    hit?: boolean;
    summary?: string;
  };
  latency?: {
    currentLatency?: number;
    averageLatency?: number;
    p95Latency?: number;
    historyCount?: number;
  };
  answerQuality?: {
    question?: string;
    answer?: string;
    score?: number;
    method?: string;
    summary?: string;
  };
}

interface ChatSession {
  id: number;
  question: string;
  answer: string;
  trace: {
    totalLatency: number;
    steps: TraceStep[];
  };
  evaluation?: EvaluationResult | null;
}

const input = ref("");
const loading = ref(false);
const messages = ref<Message[]>([]);
const chatSessions = ref<ChatSession[]>([]);

const toolCalls = ref<ToolCall[]>([]);

function addMessage(role: Message["role"], text: string) {
  messages.value.push({ role, text });
}

function getStepSummary(step: TraceStep) {
  if (step.type === "agent") {
    if (step.status === "tool_call" && step.toolCalls?.length) {
      const names = step.toolCalls.map((call) => call.name).join(" / ");
      return `调用工具：${names}`;
    }

    return "生成最终回答";
  }

  if (step.type === "tool_result") {
    return `${step.tool ?? "Tool"} 已执行`;
  }

  return "执行完成";
}

async function sendMessage() {
  if (!input.value.trim() || loading.value) {
    return;
  }

  const userText = input.value.trim();
  input.value = "";

  const currentSession: ChatSession = {
    id: Date.now(),
    question: userText,
    answer: "",
    trace: {
      totalLatency: 0,
      steps: [],
    },
    evaluation: null,
  };

  chatSessions.value.push(currentSession);
  addMessage("user", userText);
  loading.value = true;
  toolCalls.value = [];

  try {
    const response = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: userText }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const answerText = data.answer ?? "";

    if (answerText) {
      addMessage("assistant", answerText);
      currentSession.answer = answerText;
    }

    currentSession.evaluation = data.evaluation ?? null;
    toolCalls.value = data.toolCalls ?? [];

    const backendTrace = data.trace ?? { totalLatency: 0, steps: [] };
    const traceSteps = Array.isArray(backendTrace.steps)
      ? backendTrace.steps
      : Array.isArray(data.toolCalls)
        ? [{
            type: "agent",
            status: "tool_call",
            toolCalls: data.toolCalls,
          }]
        : [];

    currentSession.trace = {
      totalLatency: backendTrace.totalLatency ?? 0,
      steps: traceSteps,
    };
  } catch (error) {
    console.error(error);
    const failedText = "请求 EnterprisePilot 失败，请检查后端 API 是否正常运行。";
    addMessage("assistant", failedText);
    currentSession.answer = failedText;
  } finally {
    loading.value = false;
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}
</script>

<template>
  <div class="app">
    <header class="header">
      <div>
        <h1>EnterprisePilot</h1>
        <p>Enterprise RAG · Tool Calling · Trace</p>
      </div>

      <div class="status">
        <span class="status-dot"></span>
        Online
      </div>
    </header>

    <main class="main">
      <section class="chat-panel">
        <div class="section-title">
          <span>Chat</span>
        </div>

        <div class="conversation">
          <div v-if="messages.length === 0 && !loading" class="welcome">
            <h2>你好 👋</h2>
            <p>我是 EnterprisePilot，可以通过 RAG 和 Tools 帮你回答问题。</p>
          </div>

          <template v-else>
            <div
              v-for="(message, index) in messages"
              :key="`${message.role}-${index}`"
              :class="['message', message.role]"
            >
              <div class="avatar">{{ message.role === 'user' ? '👤' : '🤖' }}</div>
              <div class="message-content">{{ message.text }}</div>
            </div>

            <div v-if="loading" class="message assistant">
              <div class="avatar">🤖</div>
              <div class="message-content typing">Agent 正在思考...</div>
            </div>
          </template>
        </div>

        <div class="input-area">
          <textarea
            v-model="input"
            placeholder="输入问题，例如：什么是 RAG？"
            rows="3"
            @keydown="handleKeydown"
          ></textarea>

          <button :disabled="loading || !input.trim()" @click="sendMessage">
            {{ loading ? "处理中..." : "发送" }}
          </button>
        </div>
      </section>

      <aside class="trace-panel">
        <div class="section-title">
          <span>Agent Trace</span>
          <small v-if="chatSessions.length">{{ chatSessions.length }} 轮</small>
        </div>

        <div v-if="chatSessions.length === 0" class="empty-trace">暂无 Tool 调用</div>

        <div v-else class="trace-sessions">
          <div
            v-for="(session, sessionIndex) in chatSessions"
            :key="session.id"
            class="session-card"
          >
            <div class="session-header">
              <span class="session-index">对话 {{ sessionIndex + 1 }}</span>
              <small v-if="session.trace.totalLatency">{{ session.trace.totalLatency }} ms</small>
            </div>

            <div class="session-question">
              <span class="label">Q</span>
              <div>{{ session.question }}</div>
            </div>

            <div v-if="session.evaluation" class="evaluation-box">
              <div class="metric-row">
                <span class="metric-label">① Tool Calling Accuracy</span>
                <span class="metric-value">
                  {{ session.evaluation.toolCallingAccuracy?.passed ? '✓' : '✗' }}
                  {{ session.evaluation.toolCallingAccuracy?.details?.map((detail) => `${detail.expected}:${detail.result}`).join(' / ') || 'N/A' }}
                </span>
              </div>

              <div class="metric-row">
                <span class="metric-label">② Retrieval Hit Rate</span>
                <span class="metric-value">
                  {{ session.evaluation.retrievalHitRate?.hit ? 'Hit' : 'Miss' }}
                  {{ session.evaluation.retrievalHitRate?.summary ? `· ${session.evaluation.retrievalHitRate.summary}` : '' }}
                </span>
              </div>

              <div class="metric-row">
                <span class="metric-label">③ Latency</span>
                <span class="metric-value">
                  Average {{ session.evaluation.latency?.averageLatency ?? 0 }} ms
                  / P95 {{ session.evaluation.latency?.p95Latency ?? 0 }} ms
                </span>
              </div>

              <div class="metric-row">
                <span class="metric-label">④ Answer Quality</span>
                <span class="metric-value">
                  {{ session.evaluation.answerQuality?.score ?? 0 }}/5
                  {{ session.evaluation.answerQuality?.method ? `· ${session.evaluation.answerQuality.method === 'llm-as-a-judge' ? 'LLM Judge' : 'Heuristic'}` : '' }}
                  {{ session.evaluation.answerQuality?.summary ? `· ${session.evaluation.answerQuality.summary}` : '' }}
                </span>
              </div>
            </div>

            <div v-if="session.trace.steps.length === 0" class="empty-step">暂无 trace</div>

            <div v-else class="trace-list">
              <div
                v-for="(step, stepIndex) in session.trace.steps"
                :key="`${session.id}-${step.type}-${step.tool ?? 'agent'}-${stepIndex}`"
                class="trace-step"
              >
                <div v-if="step.type === 'agent'" class="trace-card agent-card">
                  <div class="trace-header">
                    <span class="trace-badge agent">Agent</span>
                    <strong>{{ step.status === 'tool_call' ? '调用 Tool' : '生成回答' }}</strong>
                  </div>

                  <div class="trace-summary">{{ getStepSummary(step) }}</div>

                  <div v-if="step.toolCalls?.length" class="tool-chips">
                    <span
                      v-for="(call, callIndex) in step.toolCalls"
                      :key="`${call.name}-${callIndex}`"
                      class="tool-chip"
                    >
                      {{ call.name }}
                    </span>
                  </div>
                </div>

                <div v-else class="trace-card tool-card">
                  <div class="trace-header">
                    <span class="trace-badge tool">Tool</span>
                    <strong>{{ step.tool }}</strong>
                  </div>

                  <div class="trace-summary">{{ getStepSummary(step) }}</div>
                  <div v-if="step.toolCallId" class="trace-meta">callId: {{ step.toolCallId }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
:global(body) {
  margin: 0;
  font-family: "Inter", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: #f3f6fb;
  color: #1f2a37;
}

* {
  box-sizing: border-box;
}

.app {
  min-height: 100vh;
  background: linear-gradient(180deg, #f8fafc 0%, #edf3fb 100%);
  color: #172033;
}

.header {
  height: 82px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  background: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
}

.header h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.header p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.22);
  color: #15803d;
  font-size: 13px;
  font-weight: 600;
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: linear-gradient(180deg, #4ade80, #22c55e);
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
}

.main {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(300px, 420px);
  gap: 22px;
  max-width: 1460px;
  margin: 0 auto;
  padding: 24px;
}

.chat-panel,
.trace-panel {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 18px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.04);
  overflow: hidden;
}

.chat-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 140px);
}

.trace-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 140px);
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  font-weight: 700;
  color: #1f2937;
}

.section-title small {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.conversation {
  flex: 1;
  min-height: 0;
  padding: 22px 20px 14px;
  overflow-y: scroll;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.6) transparent;
  overscroll-behavior: contain;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.8), rgba(255, 255, 255, 0));
}

.conversation::-webkit-scrollbar,
.trace-sessions::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.conversation::-webkit-scrollbar-thumb,
.trace-sessions::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.6);
}

.conversation::-webkit-scrollbar-track,
.trace-sessions::-webkit-scrollbar-track {
  background: transparent;
}

.welcome {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  min-height: 260px;
  text-align: left;
  color: #64748b;
}

.welcome h2 {
  margin: 0 0 10px;
  font-size: 34px;
  font-weight: 700;
  color: #0f172a;
}

.welcome p {
  margin: 0;
  max-width: 480px;
  line-height: 1.8;
  font-size: 15px;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
  align-items: flex-start;
}

.message.user {
  justify-content: flex-end;
}

.message.user .avatar {
  order: 2;
}

.message.user .message-content {
  background: linear-gradient(180deg, #eef2ff, #e2e8f0);
  border: 1px solid rgba(99, 102, 241, 0.12);
}

.message.assistant .message-content {
  background: linear-gradient(180deg, #f8fafc, #eef2f7);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(180deg, #eef2ff, #e2e8f0);
  border: 1px solid rgba(148, 163, 184, 0.22);
  font-size: 18px;
}

.message-content {
  max-width: min(78%, 720px);
  padding: 14px 16px;
  border-radius: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-align: left;
  color: #1f2937;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.02);
}

.typing {
  color: #64748b;
  font-style: italic;
}

.input-area {
  display: flex;
  gap: 12px;
  padding: 16px 18px 20px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.86);
}

textarea {
  flex: 1;
  resize: none;
  padding: 14px 16px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 12px;
  background: #f8fafc;
  color: #0f172a;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  outline: none;
  transition: all 0.2s ease;
}

textarea:focus {
  border-color: rgba(79, 70, 229, 0.8);
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.08);
  background: white;
}

button {
  width: 94px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(180deg, #4f46e5, #4338ca);
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  box-shadow: 0 10px 20px rgba(79, 70, 229, 0.18);
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
}

button:disabled {
  background: linear-gradient(180deg, #cbd5e1, #b9c4d2);
  cursor: not-allowed;
  box-shadow: none;
}

.empty-trace {
  padding: 28px 20px;
  color: #94a3b8;
  text-align: center;
  font-size: 14px;
}

.trace-panel {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 140px);
}

.trace-sessions {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow-y: scroll;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.6) transparent;
  overscroll-behavior: contain;
}

.session-card {
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.02);
}

.session-card + .session-card {
  margin-top: 14px;
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  color: #475569;
}

.session-index {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #334155;
}

.session-question {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 0 12px;
  color: #334155;
}

.label {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  background: #e2e8f0;
  color: #334155;
}

.evaluation-box {
  margin: 0 0 12px;
  padding: 12px 12px 8px;
  border: 1px solid rgba(79, 70, 229, 0.12);
  border-radius: 12px;
  background: rgba(79, 70, 229, 0.03);
}

.metric-row {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: flex-start;
  padding: 6px 0;
  font-size: 12px;
  line-height: 1.6;
  color: #334155;
}

.metric-label {
  font-weight: 700;
  color: #1f2937;
  min-width: 180px;
}

.metric-value {
  flex: 1;
  text-align: left;
  color: #475569;
  word-break: break-word;
}

.trace-list {
  padding-top: 8px;
}

.trace-step + .trace-step {
  margin-top: 12px;
}

.trace-card {
  padding: 14px 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
}

.agent-card {
  border-left: 4px solid #4f46e5;
}

.tool-card {
  border-left: 4px solid #22c55e;
}

.trace-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.trace-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 54px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: white;
}

.trace-badge.agent {
  background: linear-gradient(180deg, #6366f1, #4f46e5);
}

.trace-badge.tool {
  background: linear-gradient(180deg, #34d399, #16a34a);
}

.trace-summary {
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.tool-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.tool-chip {
  padding: 6px 10px;
  border-radius: 999px;
  background: #eef2ff;
  border: 1px solid rgba(99, 102, 241, 0.14);
  color: #3730a3;
  font-size: 12px;
  font-weight: 600;
}

.trace-meta {
  margin-top: 8px;
  color: #64748b;
  font-size: 11px;
  font-family: "SFMono-Regular", Consolas, monospace;
}

@media (max-width: 900px) {
  .main {
    grid-template-columns: 1fr;
  }

  .trace-panel,
  .chat-panel {
    min-height: auto;
  }

  .header {
    padding: 0 18px;
  }

  .header h1 {
    font-size: 22px;
  }

  .input-area {
    flex-direction: column;
  }

  button {
    width: 100%;
    height: 44px;
  }
}
</style>
