/**
 * 仮想デモ用お題フィクスチャ（同一プロンプト・設定で複数業務を検証）
 */

import type { Project } from "../types.js"
import { generateFlowMock } from "./structured.js"

export type ScenarioFixture = {
  id: string
  title: string
  description: string
  hearingAnswers: Project["hearingAnswers"]
  /** 深掘り回答（stepIndex は flow の process/decision 順） */
  deepdiveAnswers: Array<{
    stepIndex: number
    system?: string
    answers: Array<{ question: string; answer: string }>
  }>
}

export const SCENARIO_FIXTURES: ScenarioFixture[] = [
  {
    id: "ros-order",
    title: "ROS発注（Kintone）",
    description: "参考 PPTX 相当。商品タイプ選択〜承認申請",
    hearingAnswers: [
      { questionId: "q1", questionText: "業務名", value: "ROS発注（Kintoneアプリ）", status: "confirmed" },
      { questionId: "q2", questionText: "目的", value: "営業発注をシステム上で正確に起票し購買へ連携する", status: "confirmed" },
      { questionId: "q4", questionText: "トリガー", value: "営業から発注依頼メールを受領したとき", status: "confirmed" },
      { questionId: "q5", questionText: "関係者", value: "営業担当,購買部,SCM", status: "confirmed" },
      {
        questionId: "q8",
        questionText: "手順",
        value: "商品タイプを選択する、発注情報を入力する、商品リストを入力する、内容を確認して承認申請する",
        status: "confirmed",
      },
      {
        questionId: "q9",
        questionText: "分岐",
        value: "必要書類が全て揃い内容に間違いが無いか確認する",
        status: "confirmed",
      },
    ],
    deepdiveAnswers: [
      {
        stepIndex: 0,
        system: "【営業】ROS発注前確認",
        answers: [
          { question: "使用画面", answer: "商品タイプ選択画面" },
          { question: "操作", answer: "「商品タイプ」で「製品・サービス」または「SI・役務」を選択" },
        ],
      },
      {
        stepIndex: 1,
        system: "【営業】ROS発注",
        answers: [{ question: "必須項目", answer: "案件名・納期・担当者を入力して「保存」" }],
      },
    ],
  },
  {
    id: "expense",
    title: "経費精算申請",
    description: "社内経費システムでの申請〜上長承認",
    hearingAnswers: [
      { questionId: "q1", questionText: "業務名", value: "経費精算申請", status: "confirmed" },
      { questionId: "q4", questionText: "トリガー", value: "出張・接待等の支出が発生したとき", status: "confirmed" },
      { questionId: "q5", questionText: "関係者", value: "申請者,上長,経理", status: "confirmed" },
      {
        questionId: "q8",
        questionText: "手順",
        value: "領収書をスキャンする、申請内容を入力する、上長承認を依頼する",
        status: "confirmed",
      },
      { questionId: "q9", questionText: "分岐", value: "金額が10万円超の場合は部長承認が必要", status: "confirmed" },
    ],
    deepdiveAnswers: [
      {
        stepIndex: 0,
        system: "【経理】経費精算システム",
        answers: [{ question: "添付", answer: "領収書PDFを1件ずつアップロード" }],
      },
    ],
  },
  {
    id: "onboarding",
    title: "新入社員入社手続き",
    description: "人事・総務・IT の横断フロー",
    hearingAnswers: [
      { questionId: "q1", questionText: "業務名", value: "新入社員入社手続き", status: "confirmed" },
      { questionId: "q4", questionText: "トリガー", value: "内定承諾書を受領したとき", status: "confirmed" },
      { questionId: "q5", questionText: "関係者", value: "人事,総務,IT,上長", status: "confirmed" },
      {
        questionId: "q8",
        questionText: "手順",
        value: "入社情報を登録する、備品を手配する、アカウントを発行する、オリエンテーションを実施する",
        status: "confirmed",
      },
    ],
    deepdiveAnswers: [
      {
        stepIndex: 0,
        system: "【人事】入社管理",
        answers: [{ question: "必須", answer: "氏名・入社日・所属を登録し「確定」" }],
      },
    ],
  },
  {
    id: "support-ticket",
    title: "顧客問い合わせ一次対応",
    description: "CRM への起票とエスカレーション",
    hearingAnswers: [
      { questionId: "q1", questionText: "業務名", value: "顧客問い合わせ一次対応", status: "confirmed" },
      { questionId: "q4", questionText: "トリガー", value: "メール・電話で問い合わせを受けたとき", status: "confirmed" },
      { questionId: "q5", questionText: "関係者", value: "サポート担当,エスカレーション先,顧客", status: "confirmed" },
      {
        questionId: "q8",
        questionText: "手順",
        value: "内容をヒアリングする、CRMにチケットを起票する、一次回答またはエスカレーションする",
        status: "confirmed",
      },
      { questionId: "q10", questionText: "例外", value: "SLA 4時間以内に初回応答", status: "confirmed" },
    ],
    deepdiveAnswers: [
      {
        stepIndex: 1,
        system: "【CS】CRM",
        answers: [{ question: "起票", answer: "「新規チケット」から優先度とカテゴリを選択" }],
      },
    ],
  },
  {
    id: "inventory",
    title: "月次在庫棚卸",
    description: "倉庫実数入力と差異確認",
    hearingAnswers: [
      { questionId: "q1", questionText: "業務名", value: "月次在庫棚卸", status: "confirmed" },
      { questionId: "q4", questionText: "トリガー", value: "毎月最終営業日", status: "confirmed" },
      { questionId: "q5", questionText: "関係者", value: "倉庫担当,在庫管理,経理", status: "confirmed" },
      {
        questionId: "q8",
        questionText: "手順",
        value: "棚卸リストを出力する、実数を入力する、差異を確認して確定する",
        status: "confirmed",
      },
    ],
    deepdiveAnswers: [
      {
        stepIndex: 1,
        system: "【在庫】WMS",
        answers: [{ question: "入力", answer: "ロケーションごとに実数を入力し「保存」" }],
      },
    ],
  },
]

export function buildScenarioProject(fixture: ScenarioFixture): Project {
  const flow = generateFlowMock(fixture.hearingAnswers.find((a) => a.questionId === "q1")?.value ?? fixture.title)
  const majorTitle = fixture.hearingAnswers.find((a) => a.questionId === "q1")?.value ?? fixture.title
  const docNodes = flow.nodes.filter((n) => n.data.kind === "process" || n.data.kind === "decision")

  const deepdive = docNodes.map((n, i) => {
    const extra = fixture.deepdiveAnswers.find((d) => d.stepIndex === i)
    return {
      stepId: n.id,
      stepLabel: n.data.label,
      sectionNumber: `${i + 1}`,
      majorTitle,
      mediumTitle: n.data.lane,
      importance: "normal" as const,
      status: "done" as const,
      answers: (extra?.answers ?? []).map((a) => ({
        question: a.question,
        answer: a.answer,
        value: a.answer,
      })),
    }
  })

  return {
    id: `p-scenario-${fixture.id}`,
    name: majorTitle,
    status: "manual",
    description: fixture.description,
    hearingAnswers: fixture.hearingAnswers,
    flow,
    deepdive,
    sections: [],
    history: [],
    createdAt: "2026-08-22",
    updatedAt: "2026-08-22",
  } as Project
}
