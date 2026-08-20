import { apiFetch } from "./client"

export interface QASource {
  projectId: string
  projectName: string
  section: string
  sectionId: string
}

export interface QAResponse {
  text: string
  source?: QASource
  noSource: boolean
  messageId: string
}

export async function askQuestion(question: string): Promise<QAResponse> {
  return apiFetch("/qa/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  })
}

export async function sendQaFeedback(payload: {
  messageId: string
  question: string
  feedback: "up" | "down"
}): Promise<void> {
  await apiFetch("/qa/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}
