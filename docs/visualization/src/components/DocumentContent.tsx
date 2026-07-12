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
  extra,
}: {
  id: string
  title: string
  spec?: string
  highlight?: string
  details: { feature: string; content: string }[]
  acceptance: string[]
  extra?: React.ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <SubHeading>
        {title}{" "}
        {spec && (
          <Badge variant="outline" className="ml-2 align-middle font-normal">
            仕様{spec}
          </Badge>
        )}
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
      {extra}
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
            ["プロダクト名", "ラクマニュアル (RakuManual)"],
            ["作成部署", "○○部"],
            ["PIC(担当責任者)", "(氏名を記載)"],
            ["承認者", "(上司氏名を記載)"],
            ["ステータス", "ドラフト(承認待ち)"],
          ]}
        />
        <SubHeading level={4}>バージョン履歴</SubHeading>
        <DocTable
          headers={["バージョン", "日付", "変更内容", "担当者"]}
          rows={[
            ["0.1.0", "2026-07-05", "初版ドラフト作成", "(氏名)"],
            [
              "0.2.0",
              "2026-07-12",
              "現行アプリの機能・画面・データモデルに合わせて全面改訂。API/バックエンド実装を前提とした要件として再構成",
              "(氏名)",
            ],
          ]}
          compact
        />
        <Callout>
          バージョン番号は「メジャー.マイナー.パッチ」で運用する。変更時は必ず本履歴に記録し、承認者のレビューを経て更新する。保存場所は部の共有ドライブ(またはリポジトリ)に一元化する。
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
            である。属人化した業務知識を、更新可能な資産として組織に蓄積することを目的とする。
          </p>
          <SubHeading level={4}>利用の流れ</SubHeading>
          <BulletList
            items={[
              "骨組みヒアリング(チャット形式)で業務の骨格を回答する",
              "AIがスイムレーン型の業務フロー図を生成する",
              "直接編集または自然言語指示でフロー図を修正・確定する",
              "ステップ単位の深掘りヒアリングで詳細を収集する",
              "階層項番付きマニュアルをセクション単位で生成・承認する",
              "PDF / PowerPoint 出力、および業務QAチャットで活用する",
            ]}
          />
          <MermaidDiagram
            chart={SYSTEM_DIAGRAM}
            caption="システム構成図(概要)"
          />
          <SubHeading level={4}>技術構成(想定)</SubHeading>
          <DocTable
            headers={["層", "想定技術", "備考"]}
            rows={[
              [
                "フロントエンド",
                "SPA(React + TypeScript)、Tailwind、ノードエディタ(@xyflow 相当)",
                "PWA対応。PCブラウザ主、モバイルは閲覧・簡易操作",
              ],
              [
                "API",
                "REST / JSON。認証はSSOトークン(JWT等)",
                "生成系は非同期ジョブ化。進捗はポーリングまたはストリーミング",
              ],
              [
                "永続化",
                "RDB + オブジェクトストレージ",
                "ヒアリング回答は1問ごとに永続化",
              ],
              [
                "AI",
                "LLM抽象化レイヤ経由で外部LLMを呼ぶ",
                "プロバイダ変更に耐えること。学習オプトアウト必須",
              ],
              [
                "検索",
                "公開済みマニュアルのベクトル索引",
                "QAチャットの出典検索に使用",
              ],
            ]}
            compact
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
              "完成マニュアルをQAチャットで日常業務から参照できるようにする",
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
              ["効果測定・改善", "KPIダッシュボード(F-8)"],
            ]}
          />
        </div>

        <div id="overview-glossary" className="scroll-mt-24">
          <SubHeading>1-C. 用語定義</SubHeading>
          <DocTable
            headers={["用語", "定義"]}
            rows={[
              [
                "プロジェクト",
                "1つの業務マニュアル作成単位。ヒアリング回答・フロー図・深掘り・マニュアル・画像・履歴を包含する",
              ],
              [
                "ヒアリングセッション",
                "AIが利用者に質問し回答を収集する一連の対話。骨組み(F-1)と深掘り(F-4)がある",
              ],
              [
                "業務フロー図",
                "担当レーン(縦)×利用システム(横)のスイムレーン上に、開始/処理/分岐/終了ステップを配置した図",
              ],
              [
                "項番",
                "マニュアル・フロー上の番号。中項目は 1.1 / 2.1 形式。大項目跨ぎを許容する",
              ],
              [
                "大項目 / 中項目",
                "マニュアルの階層。大項目=業務領域、中項目=業務概要。セクション本文はその下に属する",
              ],
              [
                "セクション",
                "フロー図上のステップ(またはステップ群)に対応するマニュアルの章単位",
              ],
              [
                "要確認マーク",
                "AIが推測で補完した箇所を示すフラグ。解消までセクション承認不可",
              ],
              [
                "公開版",
                "閲覧者・QAチャットの根拠として利用される、承認済みセクションを含む公開状態のマニュアル",
              ],
              [
                "LLM",
                "大規模言語モデル。ヒアリング・生成・チャットの中核AI",
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
            利用者は各工程のタブ間を自由に行き来でき、後戻りによるデータ消失は発生させない。各操作はAPI経由でサーバーに永続化される。
          </p>
          <MermaidDiagram
            chart={WORKFLOW_DIAGRAM}
            caption="マニュアル作成フロー(7ステップ)"
          />
          <DocTable
            headers={["ステップ", "主担当", "内容", "状態"]}
            rows={[
              [
                "① 骨組みヒアリング",
                "利用者 ⇔ AI",
                "業務の目的・関係者・開始/終了条件・大まかな手順を収集。1問ごとに自動保存",
                "hearing",
              ],
              [
                "② フロー図生成",
                "AI",
                "スイムレーン型フロー図を生成。項番・生成根拠を付与",
                "flow",
              ],
              [
                "③ フロー図修正",
                "利用者",
                "直接編集または自然言語指示で修正・確定。深掘り対象ステップを生成",
                "flow → deepdive",
              ],
              [
                "④ 深掘りヒアリング",
                "利用者 ⇔ AI",
                "各ステップの操作・判断基準・注意点を重要度に応じて収集",
                "deepdive",
              ],
              [
                "⑤ マニュアル生成",
                "AI",
                "セクション単位で本文を生成。階層と要確認マークを付与",
                "manual",
              ],
              [
                "⑥ レビュー・承認",
                "利用者",
                "画像添付・本文修正・要確認解消・セクション承認",
                "manual",
              ],
              [
                "⑦ 公開・出力・活用",
                "利用者",
                "プロジェクト公開、PDF/PPTX出力、QAチャット",
                "published",
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
            [
              "添付画像",
              "1プロジェクトあたり最大○○枚、1枚あたり最大10MB(クライアント側でもサイズ検証)",
            ],
            [
              "利用時間帯",
              "平日業務時間(9:00〜18:00)を中心。索引更新・通知は非同期ジョブ可",
            ],
            ["ピーク想定", "期末・異動期(引継ぎ需要)に利用が集中"],
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
          <p className="mb-4 text-sm text-muted-foreground">
            各指標は現状値(Baseline)を稼働前に計測し、操作ログ・プロジェクト状態からツール内で自動集計する(F-8)。
          </p>
          <SubHeading level={4}>効率性(ROIの根拠)</SubHeading>
          <DocTable
            headers={["指標", "現状値", "目標値", "期限", "測定方法"]}
            rows={[
              [
                "マニュアル1本あたり作成工数",
                "現状計測(想定: 平均○時間)",
                "50%以上削減",
                "稼働3ヶ月後",
                "プロジェクト開始〜公開完了までの実作業時間を自動記録",
              ],
              [
                "作成完了率(着手→公開)",
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
              ["使用感", "フロー図編集の操作エラー率", "継続的に低減"],
              ["活用度", "月間閲覧数・チャット質問数", "継続的に増加"],
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
              "社内SSOによる認証・ロール/プロジェクト権限管理",
              "プロジェクト・回答・フロー・マニュアル・画像・履歴のサーバー永続化",
              "LLM連携による生成・チャット(ストリーミング対応)",
              "KPI計測用のログ・ダッシュボード基盤",
              "PDF / PowerPoint エクスポート",
              "PWA(インストール・更新通知)",
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
              [
                "ネイティブモバイルアプリ",
                "PCブラウザ主。モバイルはレスポンシブWeb / PWAで閲覧・簡易操作",
              ],
              ["社外ユーザーへの公開", "社内利用限定"],
              ["動画マニュアル生成", "対象外"],
            ]}
          />
        </div>
      </SectionCard>

      {/* 3. Functional */}
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
                "SSOログイン、プロジェクトCRUD・権限・概要・設定",
                "—",
              ],
              [
                "F-1",
                "骨組みヒアリング",
                "構造化質問エンジン",
                "AIが対話形式で業務の骨組み情報を収集し永続化",
                "①",
              ],
              [
                "F-2",
                "フロー図生成",
                "AI生成・根拠トレース",
                "ヒアリング結果からスイムレーン型フロー図を自動生成",
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
                "ステップ単位の詳細収集",
                "各ステップの作業詳細を重要度に応じて収集",
                "④",
              ],
              [
                "F-5",
                "マニュアル生成",
                "セクション単位生成・階層・画像",
                "階層項番付きマニュアルの生成と画像差し込み",
                "⑤",
              ],
              [
                "F-6",
                "更新・メンテナンス",
                "編集・履歴・部分再生成",
                "完成後の修正と履歴管理・公開",
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
                "KPI自動集計と可視化・LLMコスト監視",
                "⑧",
              ],
            ]}
            compact
          />
        </div>

        <FeatureBlock
          id="functional-f0"
          title="F-0. 基盤機能(認証・プロジェクト管理)"
          details={[
            {
              feature: "SSO認証",
              content:
                "社内IdP(SAML/OIDC)経由でログイン。未認証時はログイン画面へ誘導",
            },
            {
              feature: "セッション管理",
              content:
                "アクセストークンの更新、ログアウト、端末間のセッション無効化",
            },
            {
              feature: "プロジェクト一覧",
              content:
                "カード形式で名称・説明・オーナー・更新日・ステータス・進捗を表示。名前/説明/オーナーで検索",
            },
            {
              feature: "新規作成 / 続きから再開",
              content:
                "名称(+任意の説明)を入力し作成。作成直後に骨組みヒアリングへ遷移(3クリック以内)。状態に応じた工程タブへ直行",
            },
            {
              feature: "プロジェクト概要",
              content:
                "説明、見直し期限、4工程の進捗、更新履歴タイムライン",
            },
            {
              feature: "権限 / オーナー変更",
              content:
                "ロール(閲覧者/作成者/管理者)+プロジェクト単位のメンバー権限。オーナーの引継ぎ変更",
            },
            {
              feature: "UI設定",
              content:
                "利用者ごとのアクセントカラー設定。PWAとしてインストール可能",
            },
          ]}
          extra={
            <>
              <SubHeading level={4}>プロジェクト状態</SubHeading>
              <DocTable
                headers={["状態", "ラベル", "意味"]}
                rows={[
                  ["hearing", "骨組みヒアリング中", "①進行中"],
                  ["flow", "フロー図編集中", "②③進行中"],
                  ["deepdive", "深掘りヒアリング中", "④進行中"],
                  ["manual", "マニュアル作成中", "⑤⑥進行中"],
                  ["published", "公開済み", "⑦。QAの検索対象になる"],
                ]}
                compact
              />
            </>
          }
          acceptance={[
            "SSO未ログインでは業務データAPIにアクセスできないこと",
            "新規作成からヒアリング開始まで3クリック以内であること",
            "プロジェクト状態・進捗が一覧と概要で一貫して表示されること",
          ]}
        />

        <FeatureBlock
          id="functional-f1"
          title="F-1. 骨組みヒアリング機能"
          spec="①"
          highlight="業務のコンテキストを漏れなく収集する本プロダクトの心臓部。質問数が多くなることは許容し、その代わり利用者が疲弊しない対話設計を最優先する。回答はAPI経由で1問ごとに永続化する。"
          details={[
            {
              feature: "質問フレームワーク",
              content:
                "業務名→目的→頻度→開始条件→関係者→受け渡し→完了条件→大まかな手順→分岐→例外の順。テンプレートをベースに追加質問を動的生成",
            },
            {
              feature: "回答形式",
              content:
                "自由記述 / 単一選択 / 複数選択を使い分け。answered / unknown / later / skipped を正当な状態として保持",
            },
            {
              feature: "進捗の可視化",
              content: "プログレスバーと残り質問の目安を常時表示",
            },
            {
              feature: "中断・再開",
              content:
                "回答は1問ごとにサーバー保存。別端末・再ログイン後も続きから再開",
            },
            {
              feature: "回答の見直し",
              content:
                "過去回答の修正と影響範囲(再生成箇所)の提示。矛盾する後続回答をAIが検出",
            },
            {
              feature: "チャットUI",
              content: "AI側・利用者側のバブル表示。AIアバターにブランドロゴを使用",
            },
          ]}
          acceptance={[
            "回答が1問ごとにサーバーへ保存され、セッション中断後に完全に復元されること",
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
                "担当レーン・利用システム軸・処理・条件分岐・開始/終了を含むスイムレーン型フロー図を非同期ジョブで生成",
            },
            {
              feature: "項番の自動付与",
              content:
                "文書化対象ステップに 1.1, 1.2 … を付与。大項目跨ぎや同一項番グルーピングを許容。既存項番は不用意に上書きしない",
            },
            {
              feature: "生成根拠の提示",
              content: "各ステップがどのヒアリング回答に基づくかをトレース可能(source)",
            },
            {
              feature: "再生成",
              content:
                "全体または一部を再生成。手動修正箇所(manualフラグ)は上書きしない",
            },
            {
              feature: "複数ページ対応",
              content:
                "サブプロセス単位で自動ページ分割。ページ間接続とサマリービューを提供",
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
              feature: "ロック / 編集モード",
              content: "デフォルトは閲覧ロック。解除後に編集可能",
            },
            {
              feature: "直接編集",
              content:
                "D&Dによるステップの移動・追加・削除・結線変更。ダブルクリックでその場編集。コネクタはパネル・ノード近傍・コンテキストメニューから追加",
            },
            {
              feature: "自然言語での修正指示",
              content:
                "チャットで指摘→AIが差分プレビュー(追加=緑/削除=赤/変更=黄)で提示→利用者承認後に反映",
            },
            {
              feature: "取り消し・やり直し",
              content: "十分な段数のUndo/Redo。ショートカット対応",
            },
            {
              feature: "自動整列・自動保存",
              content:
                "レーン・システム軸に沿って整列。サーバーに自動保存。スナップショット復元",
            },
            {
              feature: "フロー確定",
              content:
                "確定で深掘り対象ステップ一覧を生成/更新。ラベル変更があった既存ステップは深掘り状態を「要確認」に遷移",
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
              feature: "ステップ単位のヒアリング",
              content:
                "処理/分岐ステップを対象に深掘り。一覧で項番・ラベル・状態・重要度を把握",
            },
            {
              feature: "収集項目",
              content:
                "使用システム・画面 / 操作手順 / 判断基準 / 所要時間 / 注意点 / 例外対応 / 関連資料",
            },
            {
              feature: "重要度による密度調整",
              content: "高:多問 / 中:標準 / 低:最小。全ステップ均一の長時間ヒアリングを避ける",
            },
            {
              feature: "順不同・部分完了",
              content:
                "好きな順に回答可能。一部完了でもマニュアル生成に進める。未回答はプレースホルダ",
            },
            {
              feature: "状態管理",
              content:
                "not-started / in-progress / done / recheck。フロー変更で影響を受けた項目は自動で recheck",
            },
            {
              feature: "大項目・中項目メタ / ファイル情報",
              content:
                "ステップに大項目名・中項目名を保持。使用ファイルの名称・保管場所・用途を構造化登録",
            },
          ]}
          acceptance={[
            "各ステップのヒアリング状況が一覧で把握できること",
            "フロー図修正時、影響を受けるヒアリング項目が自動で「要確認」になること",
            "重要度変更に応じて質問数が切り替わること",
          ]}
        />

        <FeatureBlock
          id="functional-f5"
          title="F-5. マニュアル生成機能"
          spec="⑤"
          details={[
            {
              feature: "セクション単位の生成",
              content:
                "深掘り完了ステップごとに生成。セクション単位で生成・確認・承認を回せる",
            },
            {
              feature: "階層表示",
              content:
                "大項目(1) → 中項目(1.1) → セクション本文。中項目見出しに項番と業務概要を出し、セクション側で項番を二重表示しない",
            },
            {
              feature: "ブロック構造",
              content: "paragraph(説明) / step(手順) / note(注意) の構造化本文",
            },
            {
              feature: "冗長性の抑制",
              content:
                "1手順=1文、重複排除、共通事項の集約。冗長度超過時は分割または要約を提案",
            },
            {
              feature: "画像差し込み(ヘルプボタン方式)",
              content:
                "「画像を見る」ボタンで展開/折りたたみ。インデント崩れを防止。JPEG/PNG/GIF/WebP等対応",
            },
            {
              feature: "要確認マーク / 目次",
              content:
                "AI推測箇所に needsConfirm を付与。全て解消するまで承認不可。サイドバーで大項目・中項目へジャンプ",
            },
          ]}
          extra={
            <>
              <SubHeading level={4}>セクション状態</SubHeading>
              <DocTable
                headers={["状態", "ラベル", "意味"]}
                rows={[
                  ["draft", "下書き", "生成直後・再生成後"],
                  ["review", "レビュー中", "承認済み後に再編集した状態"],
                  ["approved", "承認済み", "要確認ゼロで承認完了"],
                ]}
                compact
              />
            </>
          }
          acceptance={[
            "画像の表示/非表示が本文レイアウトに影響を与えないこと",
            "「要確認」が全て解消されるまでセクションを「承認済み」にできないこと",
            "階層目次と本文の項番が一致し、中項目見出しとセクションヘッダで項番が二重表示されないこと",
          ]}
        />

        <FeatureBlock
          id="functional-f6"
          title="F-6. 更新・メンテナンス機能"
          spec="⑥"
          details={[
            {
              feature: "直接編集",
              content:
                "承認済みマニュアルもブロック単位で修正可能。編集すると review に戻す",
            },
            {
              feature: "AIによる部分再生成",
              content:
                "該当セクションのみ再ヒアリング/再生成。他セクションの本文・画像は変更しない",
            },
            {
              feature: "更新履歴・版管理",
              content:
                "「いつ・誰が・何を」を記録。セクション version を採番。公開版と編集中ドラフトを分離",
            },
            {
              feature: "差分・復元",
              content: "任意の過去版と差分比較し、ワンクリックで復元",
            },
            {
              feature: "陳腐化防止・公開",
              content:
                "見直し期限(reviewDeadline)を設定し期限接近時に通知。承認済み後に published へ遷移しQA索引を更新",
            },
            {
              feature: "オーナー変更",
              content: "メンテナンス責任者を変更できる",
            },
          ]}
          acceptance={[
            "セクション単位の再生成が他セクションの内容・画像を変更しないこと",
            "過去版との差分が視覚的に確認でき、ワンクリックで復元できること",
            "公開後のマニュアルのみがQA検索対象になること(下書きは出ない)",
          ]}
        />

        <div id="functional-f7" className="scroll-mt-24">
          <SubHeading>
            F-7. 出力・活用機能{" "}
            <Badge variant="outline" className="ml-2 align-middle font-normal">
              仕様⑦
            </Badge>
          </SubHeading>
          <SubHeading level={4}>F-7-1. エクスポート</SubHeading>
          <DocTable
            headers={["機能", "内容"]}
            rows={[
              [
                "PDF出力",
                "マニュアル(任意でフロー図含む)をPDF出力。画像は全展開/巻末まとめ/なしから選択",
              ],
              [
                "PowerPoint出力",
                "1セクション=1スライドで編集可能pptxを生成。表紙スライド付き",
              ],
              ["出力範囲", "マニュアル全体 / 特定セクション"],
              [
                "非同期生成",
                "大規模出力はジョブ化し、完了後にダウンロードURLを発行(短時間有効)",
              ],
            ]}
          />
          <SubHeading level={4}>F-7-2. デザインテンプレート</SubHeading>
          <DocTable
            headers={["機能", "内容"]}
            rows={[
              [
                "テンプレート選択",
                "コーポレート標準 / シンプル / 研修資料用など、社内ブランド準拠テンプレートを出力時に選択",
              ],
              [
                "テンプレート管理",
                "管理者が表紙・ヘッダフッタ・配色・フォントを登録・更新。既存マニュアルへの再適用も可能",
              ],
            ]}
          />
          <SubHeading level={4}>F-7-3. 業務QAチャット</SubHeading>
          <DocTable
            headers={["機能", "内容"]}
            rows={[
              [
                "マニュアル横断QA",
                "公開済みマニュアルを知識ベースとし、業務質問にチャットで回答",
              ],
              [
                "出典の明示",
                "根拠プロジェクト・セクションへのリンク必須。根拠なしの場合は推測で答えない",
              ],
              [
                "権限の尊重",
                "質問者が閲覧権限を持つマニュアルのみを回答根拠に使用",
              ],
              [
                "作成中の案内 / フィードバック",
                "作成中の場合は完成前である旨を返す。「役に立った/立たなかった」を収集しF-8で集計",
              ],
            ]}
          />
          <SubHeading level={4}>受け入れ条件(抜粋)</SubHeading>
          <AcceptanceList
            items={[
              "PDF/PPT出力でテンプレートの体裁が正しく適用されること",
              "チャット回答に出典リンクが100%付与されること(根拠なしの場合はその旨を明示)",
              "閲覧権限のないマニュアルの内容がチャット経由で漏れないこと",
            ]}
          />
          <Separator className="my-8" />
        </div>

        <div id="functional-f8" className="scroll-mt-24">
          <SubHeading>
            F-8. 品質測定機能{" "}
            <Badge variant="outline" className="ml-2 align-middle font-normal">
              仕様⑧
            </Badge>
          </SubHeading>
          <DocTable
            headers={["機能", "内容"]}
            rows={[
              [
                "操作ログ収集",
                "ヒアリング進捗、編集操作、生成のやり直し、出力、チャット利用、承認・公開を自動記録",
              ],
              [
                "満足度収集",
                "プロジェクト完了時・チャット回答時にCSATを収集",
              ],
              [
                "KPIダッシュボード",
                "作成工数削減率、作成完了率、フロー初回精度、CSAT、LLMコスト、活用度、公開済み件数、見直し期限を管理者向けに可視化",
              ],
              [
                "LLMコスト監視",
                "プロジェクトあたり・月あたりのトークン消費と概算コストを可視化。80%で通知、100%で新規生成を一時制限",
              ],
            ]}
          />
          <Separator className="my-8" />
        </div>

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
                "プロジェクト概要",
                "進捗・見直し期限・更新履歴",
                "F-0, F-6",
              ],
              [
                "SCR-004",
                "骨組みヒアリング",
                "AI対話・進捗・回答一覧・中断再開",
                "F-1",
              ],
              [
                "SCR-005",
                "フロー図エディタ",
                "生成・直接編集・自然言語修正・確定",
                "F-2, F-3",
              ],
              [
                "SCR-006",
                "深掘りヒアリング",
                "ステップ一覧・重要度・回答・要確認",
                "F-4",
              ],
              [
                "SCR-007",
                "マニュアルエディタ",
                "階層表示・編集・画像・承認",
                "F-5, F-6",
              ],
              [
                "SCR-008",
                "マニュアル閲覧",
                "閲覧者向け表示(画像展開、検索)",
                "F-5, F-7",
              ],
              [
                "SCR-009",
                "エクスポート設定",
                "形式・テンプレート・範囲・画像モード",
                "F-7",
              ],
              ["SCR-010", "QAチャット", "業務質問チャット", "F-7"],
              [
                "SCR-011",
                "KPIダッシュボード",
                "KPI・コスト・利用状況",
                "F-8",
              ],
              [
                "SCR-012",
                "管理設定",
                "テンプレート管理、ユーザー権限、通知設定",
                "F-0, F-7",
              ],
            ]}
            compact
          />
          <Callout>
            プロジェクト詳細はタブ切替(概要 / 骨組みヒアリング / フロー図 / 深掘り / マニュアル / 出力・活用)でSCR-003〜SCR-007, SCR-009を一体的に提供する。
          </Callout>
        </div>

        <div id="functional-data" className="scroll-mt-24">
          <SubHeading>情報・データ(主要データモデル)</SubHeading>
          <p className="mb-4 text-sm text-muted-foreground">
            現行アプリのデータモデルをサーバー永続化の正とする。
          </p>
          <DocTable
            headers={["エンティティ", "主な属性", "備考"]}
            rows={[
              ["User", "id, name, email, roles", "SSOから同期"],
              [
                "Project",
                "id, name, ownerId, status, description, reviewDeadline, updatedAt",
                "状態は2-A参照",
              ],
              [
                "ProjectMember",
                "projectId, userId, permission",
                "閲覧/編集/管理",
              ],
              [
                "HearingAnswer",
                "projectId, questionId, value, status",
                "1問ごと保存",
              ],
              [
                "FlowState",
                "nodes, edges, lanes, layoutMeta",
                "ノードに項番・lane・kind・system・manual・source",
              ],
              [
                "DeepDiveItem",
                "stepId, stepLabel, sectionNumber, majorTitle, mediumTitle, importance, status, answers",
                "フロー確定で同期",
              ],
              [
                "ManualSection",
                "id, title, sectionNumber, majorTitle, mediumTitle, stepId, status, version, blocks",
                "公開版/ドラフトを版管理",
              ],
              [
                "ManualBlock",
                "type, text, needsConfirm, imageRef",
                "paragraph/step/note",
              ],
              [
                "ManualImage",
                "storageKey, caption, mimeType, name",
                "ストレージ参照",
              ],
              ["HistoryEntry", "date, userId, action", "監査・概要表示"],
              [
                "OperationLog",
                "userId, actionType, payload, timestamp",
                "KPI集計用",
              ],
              [
                "ExportJob",
                "format, options, status, downloadUrl, expiresAt",
                "PDF/PPTX",
              ],
              [
                "QaThread / QaMessage",
                "question, answer, citations, feedback",
                "出典必須",
              ],
              ["DesignTemplate", "name, theme, assets", "出力体裁"],
            ]}
            compact
          />
        </div>

        <div id="functional-api" className="scroll-mt-24">
          <SubHeading>API概要(外部インターフェース含む)</SubHeading>
          <p className="mb-4 text-sm text-muted-foreground">
            フロントエンドはすべて認証付きAPI経由でデータにアクセスする。生成系はジョブIDを返し、クライアントは進捗を購読する。
          </p>
          <DocTable
            headers={["領域", "例", "備考"]}
            rows={[
              ["認証", "GET /auth/me, SSOコールバック", "IdP連携"],
              [
                "プロジェクト",
                "GET/POST /projects, PATCH /projects/{id}, POST .../publish",
                "権限チェック必須",
              ],
              [
                "ヒアリング",
                "PUT .../hearing/answers/{questionId}, POST .../hearing/complete",
                "1問ごとUPSERT",
              ],
              [
                "フロー",
                "POST .../flow/generate, PUT .../flow, POST .../nl-edit, POST .../confirm",
                "生成は非同期可",
              ],
              [
                "深掘り",
                "GET/PATCH .../deepdive/{stepId}, PUT .../answers",
                "",
              ],
              [
                "マニュアル",
                "POST .../manual/generate, PATCH .../sections/{id}, POST .../approve",
                "画像は別アップロードAPI",
              ],
              [
                "画像",
                "POST .../images (multipart)",
                "ウイルススキャン・サイズ制限",
              ],
              [
                "エクスポート",
                "POST .../exports, GET .../exports/{jobId}",
                "完了後に署名付きURL",
              ],
              [
                "QA",
                "POST /qa/ask, POST /qa/messages/{id}/feedback",
                "権限内コーパスのみ",
              ],
              ["KPI", "GET /metrics/dashboard", "管理者向け"],
              [
                "外部LLM",
                "選定LLMプロバイダ",
                "HTTPS、学習オプトアウト必須",
              ],
              ["外部SSO", "社内IdP", "SAML/OIDC"],
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
            "対象: ITリテラシーが高くない業務担当者を含む全部員。トレーニングなしで初回利用が完了できることを目標",
            "主要導線: プロジェクト作成→ヒアリング開始まで3クリック以内",
            "フロー図編集: F-3の受け入れ条件(ユーザビリティテスト合格)を必須",
            "AI処理中: 進捗表示+ストリーミング表示で体感速度を担保",
            "誤操作防止: 破壊的操作には確認と復元手段を用意",
            "レスポンシブ: デスクトップ主、モバイルではヒアリング・閲覧・QAを利用可能",
            "アクセシビリティ: キーボード操作、WCAG 2.1 AA相当",
            "ユーザビリティテスト: パイロット期間中に部内5名以上",
          ]}
        />
        <SubHeading>4-B / 4-C. システム方式・規模</SubHeading>
        <BulletList
          items={[
            "社内利用のWebアプリケーション(PCブラウザ主対象、PWA対応)",
            "フロントはSPA、バックエンドはAPI + 非同期ジョブ",
            "LLMは外部API利用を基本とし、抽象化レイヤでプロバイダ変更に耐える",
            "全社展開(ユーザー数10倍)時にアーキテクチャの作り直しが不要な構成",
            "生成ジョブとオンラインAPIを分離し、LLM遅延が他機能を阻害しない",
          ]}
        />
        <SubHeading>4-D. 性能</SubHeading>
        <DocTable
          headers={["項目", "目標"]}
          rows={[
            ["通常画面の表示", "3秒以内"],
            [
              "フロー図編集操作の反映(ローカル)",
              "0.5秒以内(即時)。サーバー保存はバックグラウンド",
            ],
            [
              "AI生成(フロー図・マニュアル1セクション)",
              "ストリーミング開始まで10秒、完了まで60秒以内",
            ],
            ["チャット回答", "初回トークンまで5秒以内"],
            ["PDF/PPT出力", "50ページ規模で2分以内"],
          ]}
        />
        <SubHeading>4-E / 4-F / 4-G / 4-H. 信頼性・拡張性・互換性・継続性</SubHeading>
        <DocTable
          headers={["区分", "方針"]}
          rows={[
            [
              "信頼性",
              "稼働率99.5%以上(業務時間内)。1問ごと・編集ごとの自動保存。RPO 24時間 / RTO 1営業日。LLM障害時はAI機能のみ縮退",
            ],
            [
              "拡張性",
              "質問・デザインテンプレートは管理画面から追加可能。将来の取り込み・キャプチャ・多言語を見据えたモジュール構成",
            ],
            [
              "互換性",
              "バージョンアップ後もデータ読み込み・編集可。出力は社内標準Officeで開けること。Chrome / Edge 最新版",
            ],
            [
              "継続性",
              "社内標準のバックアップ・障害対応ポリシーに準拠。LLM障害時は明示しデータ保全のうえリトライ可能",
            ],
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
              "出力の非決定性",
              "利用者の確認・承認を挟む。再生成時も手動修正箇所は保護",
            ],
            [
              "ハルシネーション対策",
              "要確認マーク必須。チャットは出典必須・根拠なし回答禁止。正しさは利用者承認で担保",
            ],
            [
              "フォールバック",
              "LLM障害・レート制限時は明示し、データ保全のうえリトライ可能",
            ],
            [
              "プロバイダ依存の低減",
              "LLM抽象化レイヤにより変更・モデル更新の影響を局所化",
            ],
          ]}
        />
      </SectionCard>

      {/* 5. Security */}
      <SectionCard id="security" title="5. セキュリティ要件">
        <SubHeading>5-A. 情報セキュリティ</SubHeading>
        <DocTable
          headers={["項目", "方針"]}
          rows={[
            ["情報分類", "業務マニュアルおよびヒアリング回答は「社外秘」"],
            ["認証", "社内SSO必須。社外からはVPNポリシーに準拠"],
            [
              "アクセス制御",
              "ロールベース(閲覧者/作成者/管理者)+プロジェクト単位の権限。APIはすべて認可チェック",
            ],
            ["通信・保管の暗号化", "TLS / AES-256相当"],
            [
              "監査ログ",
              "閲覧・編集・出力・チャットの操作ログ。保持期間は社内規程に準拠(目安1年以上)",
            ],
          ]}
        />
        <SubHeading>5-B. 稼働環境</SubHeading>
        <BulletList
          items={[
            "対応ブラウザ: Chrome / Edge 最新版",
            "対応OS: 社内標準PC環境(Windows / macOS)",
            "クライアント: PWAインストール可。オフラインは閲覧の限定的サポートを基本設計で判断",
          ]}
        />
        <SubHeading>5-C. テスト</SubHeading>
        <BulletList
          items={[
            "脆弱性診断(XSS・SQLインジェクション・認可バイパス)を本稼働前に実施",
            "チャット経由の権限外情報漏洩(F-7-3)を必須テスト項目とする",
            "ファイルアップロードの不正ファイル・過大サイズを検証",
            "テストデータは実業務データを使わずダミーデータで実施",
          ]}
        />
        <SubHeading>5-D. AI・LLM利用時のセキュリティ</SubHeading>
        <DocTable
          headers={["項目", "方針"]}
          rows={[
            [
              "機密情報の外部送信",
              "学習オプトアウト契約必須。保管場所・保持期間を情シス・法務が承認",
            ],
            [
              "個人情報の取り扱い",
              "ヒアリングで個人情報を入力しないよう利用ガイドとUI注意喚起",
            ],
            [
              "プロンプトインジェクション",
              "システム指示とユーザー入力を分離。マニュアル本文に埋め込まれた指示が動作を変えないよう検証",
            ],
            [
              "出力のアクセス制御",
              "AIに渡すコンテキストを質問者の閲覧権限内に制限(F-7-3)",
            ],
            [
              "入出力ログ",
              "誰がどんな入力をし、AIが何を出力したかを記録し追跡可能とする",
            ],
            [
              "生成物の権利",
              "LLM利用規約における商用利用可否・権利帰属を契約前に確認",
            ],
          ]}
        />
      </SectionCard>

      {/* 6. Migration */}
      <SectionCard id="migration" title="6. 移行要件">
        <SubHeading>6-A. 既存マニュアル資産の扱い</SubHeading>
        <BulletList
          items={[
            "既存Word/Excel/PPTマニュアルの自動取り込みはスコープ外",
            "優先度の高い業務から本ツールで「作り直す」方針。既存資産はヒアリング時の参照資料として活用",
            "移行対象業務リストと優先順位はパイロット開始前に確定",
          ]}
        />
        <SubHeading>6-B. 引継ぎ</SubHeading>
        <BulletList
          items={[
            "運用手順書・障害対応手順・LLMコスト管理手順・API運用手順のドキュメント提供とハンズオンを必須とする",
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
              "一般利用者: 30分説明会+チュートリアル / 管理者: テンプレート・KPI・コスト管理研修。本ツール自身で操作マニュアルを作成(ドッグフーディング)",
            ],
            [
              "運用体制",
              "PIC(業務側)+情シス(基盤)+開発保守窓口の3者体制",
            ],
            [
              "定常運用",
              "KPI月次確認、LLMコスト月次確認、見直し期限切れマニュアルの棚卸し。部内ヘルプ窓口を設置",
            ],
            [
              "改善サイクル",
              "KPI月次レビュー、質問テンプレート・プロンプト改善を四半期ごと",
            ],
            [
              "保守",
              "セキュリティパッチ、LLMモデル更新追従、API/DBマイグレーション、死活・エラー・ジョブ・コスト監視、四半期リストア訓練",
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
            [
              "7",
              "RDB / オブジェクトストレージ / ジョブ基盤の標準技術選定",
              "情シス・開発",
              "基本設計時",
            ],
          ]}
        />
      </SectionCard>
    </div>
  )
}
