import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { AcceptanceList } from "@/components/doc/AcceptanceList"
import { BulletList } from "@/components/doc/BulletList"
import { Callout } from "@/components/doc/Callout"
import { DocTable } from "@/components/doc/DocTable"
import { MermaidDiagram } from "@/components/doc/MermaidDiagram"
import { SectionCard } from "@/components/doc/SectionCard"
import { SubHeading } from "@/components/doc/SubHeading"
import { SYSTEM_DIAGRAM, WORKFLOW_DIAGRAM } from "@/data/navigation"

function FeatureBlock({
  id,
  title,
  spec,
  highlight,
  details,
  acceptance,
}: {
  id: string
  title: string
  spec: string
  highlight?: string
  details: { feature: string; content: string }[]
  acceptance: string[]
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <SubHeading>
        {title}{" "}
        <Badge variant="outline" className="ml-2 align-middle font-normal">
          仕様{spec}
        </Badge>
      </SubHeading>
      {highlight && (
        <p className="mb-4 text-sm font-medium leading-relaxed text-foreground">
          {highlight}
        </p>
      )}
      <DocTable
        headers={["機能", "内容"]}
        rows={details.map((d) => [d.feature, d.content])}
      />
      <SubHeading level={4}>受け入れ条件(抜粋)</SubHeading>
      <AcceptanceList items={acceptance} />
      <Separator className="my-8" />
    </div>
  )
}

export function DocumentContent() {
  return (
    <div className="space-y-8">
      {/* Meta */}
      <SectionCard id="meta" title="ドキュメント情報">
        <DocTable
          headers={["項目", "内容"]}
          rows={[
            ["ドキュメント名", "業務マニュアル自動作成AIツール 要件定義書"],
            ["プロダクト名(仮)", "ラクマニュアル"],
            ["作成部署", "○○部"],
            ["PIC(担当責任者)", "(氏名を記載)"],
            ["承認者", "(上司氏名を記載)"],
            ["ステータス", "ドラフト(承認待ち)"],
          ]}
        />
        <SubHeading level={4}>バージョン履歴</SubHeading>
        <DocTable
          headers={["バージョン", "日付", "変更内容", "担当者"]}
          rows={[["0.1.0", "2026-07-05", "初版ドラフト作成", "(氏名)"]]}
          compact
        />
        <Callout>
          バージョン番号は「メジャー.マイナー.パッチ」で運用する。変更時は必ず本履歴に記録し、承認者のレビューを経て更新する。
        </Callout>
      </SectionCard>

      {/* 1. Overview */}
      <SectionCard
        id="overview"
        title="1. 概要"
        description="プロダクトの全体像・背景・用語定義"
      >
        <div id="overview-product" className="scroll-mt-24">
          <SubHeading>1-A. プロダクト概要</SubHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            本プロダクトは、
            <strong className="font-medium text-foreground">
              業務担当者がAIとの対話に答えるだけで、業務フロー図と業務マニュアルを段階的に生成できる社内向けWebアプリケーション
            </strong>
            である。AIによる構造化ヒアリングで属人化した業務知識を、更新可能な資産として組織に蓄積することを目的とする。
          </p>
          <MermaidDiagram
            chart={SYSTEM_DIAGRAM}
            caption="システム構成図(概要)"
          />
          <Callout>
            社内データを学習に利用しない契約(オプトアウト)が可能なLLMであることを選定の必須条件とする(5章参照)。
          </Callout>
        </div>

        <div id="overview-background" className="scroll-mt-24">
          <SubHeading>1-B. 背景</SubHeading>
          <SubHeading level={4}>現状の課題</SubHeading>
          <DocTable
            headers={["課題", "影響"]}
            rows={[
              [
                "マニュアル作成が特定の担当者のスキル・時間に依存",
                "作成着手までのリードタイムが長く、未整備業務が放置される",
              ],
              [
                "業務知識が担当者の頭の中にしかない(属人化)",
                "異動・退職時の引継ぎコスト増大、業務停止リスク",
              ],
              [
                "作成済みマニュアルの更新が困難",
                "実態と乖離した「使われないマニュアル」の量産",
              ],
              [
                "文書化スキルの個人差が大きい",
                "マニュアルの品質・粒度がバラバラで検索性が低い",
              ],
            ]}
          />
          <SubHeading level={4}>ビジネス目標</SubHeading>
          <BulletList
            items={[
              "マニュアル1本あたりの作成工数を大幅に削減する(具体目標は 2-D の KPI にて定義)",
              "部内業務の文書化率を高め、引継ぎ・教育コストを削減する",
              "「作って終わり」ではなく「更新され続ける」マニュアル運用を実現する",
            ]}
          />
          <SubHeading level={4}>背景と要件の対応</SubHeading>
          <DocTable
            headers={["背景(課題)", "対応する要件"]}
            rows={[
              ["文書化スキルへの依存", "AIヒアリングによる骨組み作成(F-1)"],
              [
                "業務全体像の整理が難しい",
                "フロー図の自動生成と対話的修正(F-2, F-3)",
              ],
              ["作業詳細の抜け漏れ", "フロー単位の深掘りヒアリング(F-4)"],
              ["マニュアルの陳腐化", "更新・メンテナンス機能(F-6)"],
              [
                "完成物の活用・配布",
                "エクスポート・テンプレート・QAチャット(F-7)",
              ],
            ]}
          />
        </div>

        <div id="overview-glossary" className="scroll-mt-24">
          <SubHeading>1-C. 用語定義</SubHeading>
          <DocTable
            headers={["用語", "定義"]}
            rows={[
              [
                "ヒアリングセッション",
                "AIが利用者に質問し回答を収集する一連の対話。フェーズ1(骨組み)とフェーズ2(深掘り)がある",
              ],
              [
                "業務フロー図",
                "業務のステップ・分岐・担当を図示したもの。AIが生成し利用者が編集する",
              ],
              [
                "セクション",
                "フロー図上のステップ(またはステップ群)に対応するマニュアルの章単位",
              ],
              [
                "プロジェクト",
                "1つの業務マニュアル作成単位。ヒアリング回答・フロー図・マニュアル・画像を包含する",
              ],
              [
                "LLM",
                "大規模言語モデル。ヒアリング・生成・チャット機能の中核となるAI",
              ],
              [
                "ハルシネーション",
                "AIが事実と異なる内容をもっともらしく生成する現象",
              ],
              [
                "デザインテンプレート",
                "社内ブランドガイドラインに準拠した、マニュアル出力用の体裁定義",
              ],
            ]}
          />
        </div>
      </SectionCard>

      {/* 2. Business */}
      <SectionCard
        id="business"
        title="2. 業務要件"
        description="業務フロー・規模・KPI・スコープ"
      >
        <div id="business-flow" className="scroll-mt-24">
          <SubHeading>2-A. 業務フロー</SubHeading>
          <p className="mb-4 text-sm text-muted-foreground">
            利用者は各ステップ間を自由に行き来でき、後戻りによるデータ消失は発生させない。
          </p>
          <MermaidDiagram
            chart={WORKFLOW_DIAGRAM}
            caption="マニュアル作成フロー(8ステップ)"
          />
          <DocTable
            headers={["ステップ", "主担当", "内容"]}
            rows={[
              [
                "① 骨組みヒアリング",
                "利用者 ⇔ AI",
                "業務の目的・関係者・開始/終了条件・大まかな手順を質問形式で収集",
              ],
              [
                "② フロー図生成",
                "AI",
                "①の回答から業務フロー図を生成(複数ページ対応)",
              ],
              [
                "③ フロー図修正",
                "利用者",
                "誤りの指摘(自然言語)または直接編集で確定",
              ],
              [
                "④ 深掘りヒアリング",
                "利用者 ⇔ AI",
                "各フローステップの使用ファイル・具体的作業・注意点を収集",
              ],
              [
                "⑤ マニュアル生成",
                "AI",
                "セクション単位でマニュアルを生成。画像差し込みポイントを提案",
              ],
              [
                "⑥ レビュー・更新",
                "利用者",
                "内容の修正、画像添付、承認",
              ],
              [
                "⑦ 出力・活用",
                "利用者",
                "PDF/PowerPoint出力、テンプレート適用、QAチャット利用",
              ],
            ]}
          />
        </div>

        <SubHeading>2-B. 規模 / 2-C. 時期・時間</SubHeading>
        <DocTable
          headers={["項目", "想定値 / 内容"]}
          rows={[
            ["利用対象", "当初は自部門(約○○名) → 将来的に全社展開を視野"],
            ["同時利用ユーザー数", "最大○○人(初期)、将来最大○○○人"],
            ["作成プロジェクト数", "初年度 ○○件程度"],
            ["フローステップ数", "平均10〜30、最大100ステップ"],
            ["マニュアルページ数", "平均1〜3ページ/セクション、最大10ページ"],
            ["添付画像", "1プロジェクトあたり最大○○枚、1枚あたり最大10MB"],
            ["利用時間帯", "平日業務時間(9:00〜18:00)を中心"],
            [
              "マスタスケジュール(案)",
              "要件定義承認 → 基本設計・UX設計(○ヶ月) → 開発(○ヶ月) → パイロット(1〜2ヶ月) → 本稼働",
            ],
          ]}
        />
        <Callout>
          ○○は部内の実数を確認のうえ確定する。UX(特に③フロー図編集)は実利用フィードバックなしに完成度を担保できないため、パイロット期間を必ず設ける。
        </Callout>

        <div id="business-kpi" className="scroll-mt-24">
          <SubHeading>2-D. 指標(KPI / サービス品質の測定基準)</SubHeading>
          <Badge variant="secondary" className="mb-4">
            仕様⑧
          </Badge>
          <SubHeading level={4}>効率性(ROIの根拠)</SubHeading>
          <DocTable
            headers={["指標", "現状値", "目標値", "期限", "測定方法"]}
            rows={[
              [
                "マニュアル1本あたり作成工数",
                "現状計測(想定: 平均○時間)",
                "50%以上削減",
                "稼働3ヶ月後",
                "プロジェクト開始〜承認完了までの実作業時間を自動記録",
              ],
              [
                "作成完了率",
                "—",
                "80%以上",
                "稼働3ヶ月後",
                "プロジェクトステータスの自動集計",
              ],
              [
                "部内業務の文書化率",
                "現状計測",
                "○○%以上",
                "稼働6ヶ月後",
                "対象業務リストに対するマニュアル化済み件数",
              ],
            ]}
          />
          <SubHeading level={4}>出力品質 / 使用感(UX) / 活用度</SubHeading>
          <DocTable
            headers={["カテゴリ", "指標", "目標値"]}
            rows={[
              ["出力品質", "フロー図の初回生成精度", "70%以上"],
              ["出力品質", "マニュアル修正率", "30%以下"],
              ["出力品質", "ハルシネーション起因の重大修正", "0件"],
              ["使用感", "利用者満足度(CSAT)", "平均4.0以上(5段階)"],
              ["使用感", "ヒアリング途中離脱率", "20%以下"],
              ["活用度", "完成後6ヶ月以内の更新率", "40%以上"],
            ]}
          />
        </div>

        <div id="business-scope" className="scroll-mt-24">
          <SubHeading>2-E. 範囲(スコープ)</SubHeading>
          <SubHeading level={4}>対象</SubHeading>
          <BulletList
            items={[
              "仕様①〜⑧に対応する機能一式(3章参照)",
              "社内SSOによる認証・権限管理",
              "KPI計測用のログ・ダッシュボード基盤",
            ]}
          />
          <SubHeading level={4}>対象外</SubHeading>
          <DocTable
            headers={["対象外項目", "理由・代替"]}
            rows={[
              [
                "画面録画・スクリーンショットの自動取得",
                "画像は利用者がアップロード。自動取得は将来検討",
              ],
              [
                "既存マニュアルの自動取り込み・変換",
                "手動移行の位置づけ。自動変換は次期フェーズ候補",
              ],
              ["多言語対応", "初期は日本語のみ"],
              ["モバイルアプリ", "PCブラウザのみ対象"],
              ["社外ユーザーへの公開", "社内利用限定"],
              ["動画マニュアル生成", "対象外"],
            ]}
          />
        </div>
      </SectionCard>

      {/* 3. Functional - abbreviated for key sections + full list */}
      <SectionCard
        id="functional"
        title="3. 機能要件"
        description="仕様①〜⑧に対応する F-0〜F-8"
        badge="9機能群"
      >
        <div id="functional-list" className="scroll-mt-24">
          <SubHeading>機能一覧(ブレイクダウン)</SubHeading>
          <DocTable
            headers={["ID", "大分類", "中分類", "概要", "対応仕様"]}
            rows={[
              [
                "F-0",
                "基盤",
                "認証・プロジェクト管理",
                "SSOログイン、プロジェクトの作成・一覧・権限管理",
                "—",
              ],
              [
                "F-1",
                "骨組みヒアリング",
                "構造化質問エンジン",
                "AIが対話形式で業務の骨組み情報を収集",
                "①",
              ],
              [
                "F-2",
                "フロー図生成",
                "AI生成・複数ページ",
                "ヒアリング結果から業務フロー図を自動生成",
                "②",
              ],
              [
                "F-3",
                "フロー図編集",
                "直接編集・自然言語修正",
                "利用者によるフロー図の修正・確定",
                "③",
              ],
              [
                "F-4",
                "深掘りヒアリング",
                "フロー単位の詳細収集",
                "各ステップの使用ファイル・作業詳細を収集",
                "④",
              ],
              [
                "F-5",
                "マニュアル生成",
                "セクション単位生成・画像",
                "マニュアル本文の生成と画像差し込み",
                "⑤",
              ],
              [
                "F-6",
                "更新・メンテナンス",
                "編集・履歴・部分再生成",
                "完成後の修正と履歴管理",
                "⑥",
              ],
              [
                "F-7",
                "出力・活用",
                "PDF/PPT・テンプレート・チャット",
                "エクスポートと業務QAチャット",
                "⑦",
              ],
              [
                "F-8",
                "品質測定",
                "ログ・ダッシュボード",
                "KPI自動集計と可視化",
                "⑧",
              ],
            ]}
            compact
          />
        </div>

        <FeatureBlock
          id="functional-f1"
          title="F-1. 骨組みヒアリング機能"
          spec="①"
          highlight="業務のコンテキストを漏れなく収集する本プロダクトの心臓部。質問数が多くなることは許容し、その代わり利用者が疲弊しない対話設計を最優先する。"
          details={[
            {
              feature: "質問フレームワーク",
              content:
                "業務名→目的→関係者→開始/完了条件→頻度→手順→例外の順に体系立てて質問。5W1Hを網羅し、回答に応じて追加質問を動的生成",
            },
            {
              feature: "回答形式の多様化",
              content: "自由記述・選択肢・複数選択・スキップを使い分け",
            },
            {
              feature: "進捗の可視化",
              content: "プログレスバー+残り質問の目安を常時表示",
            },
            {
              feature: "中断・再開",
              content: "1問ごとに自動保存。ブラウザを閉じても続きから再開",
            },
            {
              feature: "回答の見直し",
              content: "過去回答の修正と影響範囲(再生成箇所)の提示",
            },
            {
              feature: "わからない・後で",
              content: "未回答リストとして管理",
            },
          ]}
          acceptance={[
            "回答が1問ごとに保存され、セッション中断後に完全に復元されること",
            "過去回答修正時、矛盾する後続回答をAIが検出し確認を促すこと",
            "ヒアリング完了までの離脱率をログで計測できること(F-8連携)",
          ]}
        />

        <FeatureBlock
          id="functional-f2"
          title="F-2. フロー図生成機能"
          spec="②"
          details={[
            {
              feature: "自動生成",
              content:
                "F-1の回答をもとに、スイムレーン・処理・条件分岐・開始/終了を含む業務フロー図を生成",
            },
            {
              feature: "複数ページ対応",
              content:
                "サブプロセス単位で自動ページ分割。ページ間接続とサマリービューを提供",
            },
            {
              feature: "生成根拠の提示",
              content: "各ステップがどのヒアリング回答に基づくかをトレース可能",
            },
            {
              feature: "再生成",
              content:
                "全体または一部を再生成可能。手動修正箇所は上書きしない(保護)",
            },
          ]}
          acceptance={[
            "手順・分岐・担当者が漏れなくフロー図に反映されること",
            "30ステップ超で自動ページ分割が機能すること",
            "手動修正済みステップが再生成で消失しないこと(最重要)",
          ]}
        />

        <FeatureBlock
          id="functional-f3"
          title="F-3. フロー図編集機能"
          spec="③"
          highlight="「変更がしづらいのは絶対にNG」— UXを最優先に設計。パイロットでのユーザビリティテスト合格を条件とする。"
          details={[
            {
              feature: "直接編集",
              content:
                "D&Dによるステップの移動・追加・削除・結線変更。ダブルクリックでその場編集",
            },
            {
              feature: "自然言語での修正指示",
              content:
                "チャットで指摘→AIが差分プレビューで提示→利用者承認後に反映",
            },
            {
              feature: "取り消し・やり直し",
              content: "全編集操作に無制限のUndo/Redo",
            },
            {
              feature: "自動整列",
              content: "手動編集後もレイアウトが崩れない自動整列・自動結線",
            },
            {
              feature: "版の保存",
              content: "自動保存と任意時点のスナップショット復元",
            },
          ]}
          acceptance={[
            "ステップの追加・削除・並び替え・分岐変更がマウス操作のみで完結すること",
            "自然言語修正が適用前に必ず差分プレビューとして提示されること",
            "いかなる編集操作もUndoで復元できること",
            "ユーザビリティテスト(部内5名以上)で「修正が難しい」評価が0件であること",
          ]}
        />

        <FeatureBlock
          id="functional-f4"
          title="F-4. 深掘りヒアリング機能"
          spec="④"
          details={[
            {
              feature: "フロー単位のヒアリング",
              content:
                "各ステップを対象に深掘り質問。対象ステップをフロー図上でハイライト",
            },
            {
              feature: "収集項目",
              content:
                "使用ファイル・システム・操作手順・判断基準・所要時間・注意点・例外対応",
            },
            {
              feature: "ファイル情報の登録",
              content: "名称・保管場所・用途を構造化登録。ファイル添付も可能",
            },
            {
              feature: "順不同・部分完了",
              content:
                "好きな順に回答可能。未回答セクションはプレースホルダ表示",
            },
            {
              feature: "ヒアリング密度の調整",
              content: "ステップ重要度に応じて質問の深さを変える",
            },
          ]}
          acceptance={[
            "各ステップのヒアリング状況(未着手/回答中/完了)が一覧で把握できること",
            "フロー図修正時、影響を受けるヒアリング項目が「要確認」になること",
          ]}
        />

        <FeatureBlock
          id="functional-f5"
          title="F-5. マニュアル生成機能"
          spec="⑤"
          details={[
            {
              feature: "セクション単位の生成",
              content: "セクションごとに生成・確認・確定を回せる",
            },
            {
              feature: "冗長性の抑制",
              content: "1手順=1文、重複排除、共通事項の集約。冗長度チェック",
            },
            {
              feature: "画像差し込み(ヘルプボタン方式)",
              content:
                "「画像を見る」ボタンで展開/折りたたみ。インデント崩れを防止",
            },
            {
              feature: "生成と実データの分離",
              content: "AI推測箇所に「要確認」マーク。確認なしに確定不可",
            },
          ]}
          acceptance={[
            "画像の表示/非表示が本文レイアウトに影響を与えないこと",
            "「要確認」マークが全て解消されるまで承認済みにできないこと",
            "セクション間の重複説明を検出・集約提案できること",
          ]}
        />

        <FeatureBlock
          id="functional-f6"
          title="F-6. 更新・メンテナンス機能"
          spec="⑥"
          details={[
            {
              feature: "直接編集",
              content: "承認済みマニュアルもリッチテキストエディタでいつでも修正可能",
            },
            {
              feature: "AIによる部分再生成",
              content: "該当セクションのみ再ヒアリング→再生成。他セクションに影響しない",
            },
            {
              feature: "更新履歴",
              content: "「いつ・誰が・何を」を記録。過去版との差分比較・復元が可能",
            },
            {
              feature: "版管理",
              content: "「公開版」と「編集中ドラフト」を分離",
            },
            {
              feature: "陳腐化防止",
              content: "見直し期限の設定と期限接近時の通知",
            },
            {
              feature: "引継ぎ対応",
              content: "マニュアルオーナー(メンテナンス責任者)の変更",
            },
          ]}
          acceptance={[
            "セクション単位の再生成が他セクションの内容・画像を変更しないこと",
            "過去版との差分が視覚的に確認でき、ワンクリックで復元できること",
          ]}
        />

        <SubHeading>F-7. 出力・活用機能(仕様⑦)</SubHeading>
        <DocTable
          headers={["区分", "機能", "内容"]}
          rows={[
            [
              "エクスポート",
              "PDF出力",
              "フロー図含むPDF。画像は展開/巻末/なしから選択",
            ],
            [
              "エクスポート",
              "PowerPoint出力",
              "セクション→スライド構成。編集可能なpptx形式",
            ],
            [
              "テンプレート",
              "社内テンプレート選択",
              "ブランドガイドライン準拠の複数テンプレート",
            ],
            [
              "QAチャット",
              "マニュアル横断QA",
              "完成マニュアル群を知識ベースとした業務質問回答",
            ],
            [
              "QAチャット",
              "出典の明示",
              "根拠マニュアル・セクションへのリンク必須。推測回答禁止",
            ],
            [
              "QAチャット",
              "権限の尊重",
              "閲覧権限を持つマニュアルのみを回答根拠に使用",
            ],
          ]}
        />

        <SubHeading>F-8. 品質測定機能(仕様⑧)</SubHeading>
        <DocTable
          headers={["機能", "内容"]}
          rows={[
            ["操作ログ収集", "ヒアリング進捗、編集操作、生成、出力、チャット利用を記録"],
            ["満足度収集", "プロジェクト完了時・チャット回答時のCSATアンケート"],
            ["KPIダッシュボード", "2-Dの各指標を管理者向けに自動集計・可視化"],
            [
              "LLMコスト監視",
              "トークン消費と概算コストを可視化。閾値超過時に通知",
            ],
          ]}
        />
        <Separator className="my-8" />

        <SubHeading>情報・データ(主要データモデル概要)</SubHeading>
        <DocTable
          headers={["データ", "主な属性", "備考"]}
          rows={[
            ["プロジェクト", "名称、オーナー、ステータス、権限設定", "マニュアル1本の単位"],
            ["ヒアリング回答", "質問ID、回答内容、回答日時、確定/要確認フラグ", "1問ごとに保存"],
            ["フロー図", "ステップ、結線、レーン、ページ、手動修正フラグ", "手動修正保護のためのフラグ"],
            ["マニュアルセクション", "本文(構造化)、版、承認状態、要確認マーク", "公開版とドラフトを分離"],
            ["画像", "ファイル、キャプション、紐付け手順、表示位置", "ストレージに保存"],
            ["変更履歴", "対象、変更前後、実施者、日時", "F-6の版管理・監査に使用"],
            ["操作ログ", "ユーザー、操作種別、タイムスタンプ", "KPI集計用"],
          ]}
          compact
        />

        <SubHeading>外部インターフェース</SubHeading>
        <DocTable
          headers={["IF名", "接続先", "目的", "備考"]}
          rows={[
            ["LLM API", "選定LLMプロバイダ", "ヒアリング・生成・チャット", "HTTPS、学習オプトアウト契約必須"],
            ["SSO連携", "社内認証基盤", "認証・ユーザー情報取得", "SAML/OIDC(社内標準に準拠)"],
            ["(将来)社内ポータル連携", "社内ポータル", "マニュアルへのリンク共有", "次期フェーズ検討"],
          ]}
          compact
        />

        <div id="functional-screens" className="scroll-mt-24">
          <SubHeading>画面一覧(主要画面)</SubHeading>
          <DocTable
            headers={["画面ID", "画面名", "目的・役割", "対応機能"]}
            rows={[
              ["SCR-001", "ログイン(SSO)", "社内認証基盤経由のログイン", "F-0"],
              [
                "SCR-002",
                "プロジェクト一覧",
                "作成中/完成マニュアルの一覧・検索・新規作成",
                "F-0",
              ],
              [
                "SCR-003",
                "ヒアリング画面",
                "AIとの対話UI。進捗表示・回答履歴・中断再開",
                "F-1, F-4",
              ],
              [
                "SCR-004",
                "フロー図エディタ",
                "フロー図の閲覧・直接編集・自然言語修正・ページ切替",
                "F-2, F-3",
              ],
              [
                "SCR-005",
                "マニュアルエディタ",
                "セクション単位の生成結果確認・編集・画像管理",
                "F-5, F-6",
              ],
              [
                "SCR-006",
                "マニュアル閲覧画面",
                "閲覧者向け表示。画像の展開/折りたたみ、検索",
                "F-5, F-7",
              ],
              [
                "SCR-007",
                "エクスポート設定",
                "出力形式・テンプレート・範囲の選択",
                "F-7",
              ],
              ["SCR-008", "QAチャット", "業務質問チャット", "F-7"],
              [
                "SCR-009",
                "管理ダッシュボード",
                "KPI・コスト・利用状況の可視化",
                "F-8",
              ],
              [
                "SCR-010",
                "管理設定",
                "テンプレート管理、ユーザー権限、見直し期限設定",
                "F-0, F-7",
              ],
            ]}
            compact
          />
        </div>
      </SectionCard>

      {/* 4. Non-functional */}
      <SectionCard id="nonfunctional" title="4. 非機能要件">
        <SubHeading>4-A. ユーザビリティ・アクセシビリティ</SubHeading>
        <p className="mb-3 text-sm font-medium text-foreground">
          使用感が期待を超えることが承認条件 — ユーザビリティを最上位に置く。
        </p>
        <BulletList
          items={[
            "対象: ITリテラシーが高くない業務担当者を含む全部員",
            "主要導線: プロジェクト作成→ヒアリング開始まで3クリック以内",
            "AI処理中: 進捗表示+ストリーミング表示で体感速度を担保",
            "アクセシビリティ: キーボード操作、WCAG 2.1 AA相当",
            "ユーザビリティテスト: パイロット期間中に部内5名以上",
          ]}
        />
        <SubHeading>4-D. 性能</SubHeading>
        <DocTable
          headers={["項目", "目標"]}
          rows={[
            ["通常画面の表示", "3秒以内"],
            ["フロー図編集操作の反映", "0.5秒以内(ローカル操作は即時)"],
            [
              "AI生成(フロー図・マニュアル1セクション)",
              "ストリーミング開始まで10秒、完了まで60秒以内",
            ],
            ["チャット回答", "初回表示まで5秒以内"],
            ["PDF/PPT出力", "50ページ規模で2分以内"],
          ]}
        />
        <SubHeading>4-I. AI・LLM固有の考慮点</SubHeading>
        <DocTable
          headers={["項目", "方針"]}
          rows={[
            ["応答時間", "ストリーミング表示を必須"],
            [
              "コスト",
              "月間コスト上限を設定。80%で通知、100%で新規生成を一時制限",
            ],
            [
              "ハルシネーション対策",
              "要確認マーク必須。最終的な正しさは利用者承認で担保",
            ],
            [
              "フォールバック",
              "LLM障害時も閲覧・手動編集・出力は継続(AI機能のみ縮退)",
            ],
          ]}
        />
      </SectionCard>

      {/* 5. Security */}
      <SectionCard id="security" title="5. セキュリティ要件">
        <DocTable
          headers={["項目", "方針"]}
          rows={[
            ["情報分類", "業務マニュアルおよびヒアリング回答は「社外秘」"],
            ["認証", "社内SSO必須。社外からはVPNポリシーに準拠"],
            [
              "アクセス制御",
              "ロールベース(閲覧者/作成者/管理者)+プロジェクト単位の権限",
            ],
            ["通信・保管の暗号化", "TLS / AES-256相当"],
            ["監査ログ", "閲覧・編集・出力・チャットの操作ログ(1年以上)"],
            [
              "LLM外部送信",
              "学習オプトアウト契約必須。情シス・法務の承認",
            ],
            [
              "プロンプトインジェクション",
              "システム指示とユーザー入力を分離",
            ],
            [
              "チャット権限",
              "閲覧権限外のマニュアル内容が漏れないことを必須テスト",
            ],
          ]}
        />
      </SectionCard>

      {/* 6. Migration */}
      <SectionCard id="migration" title="6. 移行要件">
        <BulletList
          items={[
            "既存Word/Excel/PPTマニュアルの自動取り込みはスコープ外",
            "優先度の高い業務から本ツールで「作り直す」方針",
            "移行対象業務リストと優先順位はパイロット開始前に確定",
            "引継ぎ後1ヶ月間は開発側の並走サポート期間を設ける",
          ]}
        />
      </SectionCard>

      {/* 7. Operations */}
      <SectionCard id="operations" title="7. 運用要件">
        <DocTable
          headers={["区分", "内容"]}
          rows={[
            [
              "教育",
              "一般利用者: 30分説明会+チュートリアル / 管理者: KPI・コスト管理研修",
            ],
            [
              "運用体制",
              "PIC(業務側)+情シス(基盤)+開発保守窓口の3者体制",
            ],
            [
              "定常運用",
              "KPI月次確認、LLMコスト月次確認、見直し期限切れマニュアルの棚卸し",
            ],
            [
              "改善サイクル",
              "KPI月次レビュー、質問テンプレート・プロンプト改善を四半期ごと",
            ],
            [
              "保守",
              "セキュリティパッチ、LLMモデル更新追従、四半期リストア訓練",
            ],
          ]}
        />
        <Callout>
          本ツール自身で本ツールの操作マニュアルを作成する(ドッグフーディング。品質検証を兼ねる)。
        </Callout>
      </SectionCard>

      {/* 8. Approval */}
      <SectionCard
        id="approval"
        title="8. 承認にあたっての確認事項"
        description="承認プロセスの中で確定が必要な項目"
        badge="要決定"
      >
        <DocTable
          headers={["#", "項目", "決定者", "期限"]}
          rows={[
            ["1", "利用規模の実数(2-Bの○○部分)", "PIC", "承認前"],
            [
              "2",
              "現状のマニュアル作成工数の計測(KPI Baseline)",
              "PIC・部内",
              "承認前",
            ],
            [
              "3",
              "LLMプロバイダ候補と月間コスト試算",
              "PIC・情シス",
              "承認前",
            ],
            [
              "4",
              "社内SSO・ネットワークポリシーとの適合確認",
              "情シス",
              "基本設計前",
            ],
            [
              "5",
              "開発体制(内製/ベンダー)と概算予算・スケジュール",
              "上長・PIC",
              "承認時",
            ],
            [
              "6",
              "社内デザインテンプレートの提供元",
              "総務・広報",
              "開発中",
            ],
          ]}
        />
      </SectionCard>
    </div>
  )
}
