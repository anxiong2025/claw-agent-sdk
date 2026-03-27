/** 内置 Provider 预设 — 覆盖主流 OpenAI 兼容模型厂商 */
export interface ProviderPreset {
  baseUrl: string
  model: string
  apiKeyEnv: string
}

export const PRESETS: Record<string, ProviderPreset> = {
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    apiKeyEnv: "DASHSCOPE_API_KEY",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
  gpt: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
    apiKeyEnv: "GEMINI_API_KEY",
  },
  glm: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-plus",
    apiKeyEnv: "GLM_API_KEY",
  },
  minimax: {
    baseUrl: "https://api.minimax.chat/v1",
    model: "MiniMax-Text-01",
    apiKeyEnv: "MINIMAX_API_KEY",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: "google/gemini-2.5-flash",
    apiKeyEnv: "OPENROUTER_API_KEY",
  },
}
