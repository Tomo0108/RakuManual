/** 骨組みヒアリングの設問マスタ（app/src/lib/mock-data.ts と ID 同期） */
export const BASE_QUESTIONS = [
  { id: "q1", text: "これからマニュアル化する業務の名前を教えてください。", type: "text" },
  { id: "q2", text: "この業務の目的はなんですか?この業務が完了すると、何が達成されますか?", type: "text" },
  { id: "q3", text: "この業務はどのくらいの頻度で発生しますか?", type: "choice" },
  { id: "q4", text: "業務の開始のきっかけ(トリガー)はなんですか?", type: "text" },
  { id: "q5", text: "この業務には誰が関わりますか?当てはまるものをすべて選んでください。", type: "multi" },
  { id: "q6", text: "誰から仕事を受け取り、完了後は誰に渡しますか?", type: "text" },
  { id: "q7", text: "業務が「完了した」と言える状態はどんな状態ですか?", type: "text" },
  { id: "q8", text: "業務のおおまかな手順を、思いつく順で構わないので教えてください。", type: "text" },
  { id: "q9", text: "途中で判断が分かれるポイント(条件分岐)はありますか?", type: "text" },
  { id: "q10", text: "例外的なケースや、イレギュラー対応があれば教えてください。", type: "text" },
]

export function hearingQuestionText(questionId: string): string | undefined {
  return BASE_QUESTIONS.find((q) => q.id === questionId)?.text
}
