export type LlmProviderId = "mock" | "openrouter" | "gateway" | "openai"

export interface LlmMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LlmCompletionResult {
  text: string
  tokens: number
  provider: LlmProviderId
}

export interface LlmStreamChunk {
  delta: string
}

export interface LlmCallContext {
  userId: string
  projectId?: string
  action: string
}

export interface LlmCompleteOptions {
  maxTokens?: number
  context?: LlmCallContext
}

export interface LlmAdapter {
  complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<LlmCompletionResult>
  streamComplete(
    messages: LlmMessage[],
    opts?: LlmCompleteOptions,
  ): AsyncGenerator<LlmStreamChunk, LlmCompletionResult>
}
