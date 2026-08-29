# 星空観測支援MVP 実装計画書

この文書は、gpt-5.6-lunaがMCP実装前の観測支援機能を段階的に実装するための作業指示書である。

## 最初に必ず守ること：TDDとフェーズ単位のコミット

本実装は必ずTDDで進め、各フェーズ（Checkpoint A〜E）が終わるごとに、そのフェーズだけの変更をコミットすること。

### TDDで実装する

すべてのCheckpointをTDDで進めること。各機能について、原則として次の順序を守る。

1. 期待する振る舞いを検証するテストを先に追加する（Red）。
2. 追加したテストが意図した理由で失敗することを確認する。
3. テストを通すために必要な最小限の実装を行う（Green）。
4. 全テストが通る状態を維持しながら整理する（Refactor）。
5. `npm run build` と `npm run verify` を実行する。
6. Checkpointの完了条件を満たしたことを確認してコミットする。

テストを実装後の追認として追加してはならない。UIについても、可能な範囲で純粋関数や状態遷移を分離し、先に検証可能な形を作ること。

### 各フェーズ（Checkpoint）ごとにコミットする

最初から全Checkpointをまとめて実装してはならない。Checkpoint A〜Eを順番に実施し、各Checkpointの完了時に必ず独立したコミットを作成する。

推奨コミットメッセージ：

```text
feat: add observation domain and persistence
feat: add observation planning workflow
feat: add observation result entry
feat: add results and history views
feat: integrate observation workflow and polish UI
```

コミット前に次を実行する。

```bash
npm run build
npm run verify
```

テストが失敗している状態ではコミットしないこと。Checkpointと無関係な変更や、既存のユーザー変更をコミットに含めないこと。Gitリポジトリが利用できない場合は、勝手に`git init`せず、その時点で状況を報告すること。

## 重要事項

- 最初から全Checkpointをまとめて変更しないでください。
- 各Checkpoint完了時に `npm run build` と `npm run verify` を実行してください。
- 既存の星空ビューアと天体計算を壊さないでください。
- 既存のユーザー変更がある場合は上書きしないでください。
- 新しいnpm依存は追加しないでください。
- MCP、Horizon、Weatherは今回実装しないでください。
- 画面表示用の等級レイヤーとMission候補の`maxMagnitude`を混同しないでください。
- `predictedVisible`と予測高度・方位はMission作成時点で固定してください。
- LocalStorageの不正データでアプリをクラッシュさせないでください。
- 実装後、変更ファイル、設計上の判断、テスト結果、残課題を報告してください。

加えて、次を守ること。

- 既存の`astronomy-engine`を利用し、天体位置計算を独自実装し直さない。
- 既存の星空ビューア、環境シミュレーション、What-if、比較機能を削除しない。
- React Routerを導入せず、既存のReact状態管理で画面を切り替える。
- Missionの基本予測へ昼光、光害、天候を混ぜない。
- 保存する日時はISO文字列とし、LocalStorageへ`Date`オブジェクトを直接保存しない。
- 作業開始時と各コミット前に差分を確認し、無関係な変更を保護する。

---

## 1. 目的

既存の星空ビューアと天体位置計算を基盤として、次の観測サイクルをMCPなしで成立させる。

```text
観測地点・日時を設定
↓
観測候補を計算
↓
最大5個の観測対象を選択
↓
Missionを作成
↓
人間がVisible / Not Visible / Unsureを入力
↓
結果をLocalStorageへ保存
↓
予測と実測を比較
↓
履歴から再表示
```

このサイクルを、3分以内のデモで破綻なく見せられる状態を目標とする。

## 2. 今回のスコープ

### 実装対象

- M1：等級フィルター初期値の修正
- M2：観測地点のデータ化と入力
- M3：既存の観測日時指定の再利用
- M4：既存の星の位置計算の再利用
- M5：観測候補一覧
- M6：Observation Mission作成
- M7：観測結果入力
- M8：LocalStorageへの履歴保存
- M9：予測と実測の比較
- 保存済み履歴の一覧と再表示
- 最低限のレスポンシブ対応

### 今回実装しないもの

- M10〜M13のWebMCP
- Horizon Profileと遮蔽物判定
- Weather API
- Light Pollution API
- Device Orientation
- AR、Plate Solving、画像解析
- 複数日グラフやPDFレポート
- 新しいルーティングライブラリ

## 3. 既存実装の扱い

次の既存実装を流用する。

- `src/state/context.tsx`：観測位置、日時、水平座標計算結果
- `src/astronomy/coordinates.ts`：RA/Decから高度・方位への変換
- `src/astronomy/stars.ts`：星カタログ
- `src/components/TimeControl.tsx`：日時入力
- `src/components/ObservationPanel.tsx`：緯度経度入力の既存UIとバリデーション
- `src/components/StarCanvas.tsx`：星空表示
- `src/components/ObjectInfo.tsx`：星名、等級、高度、方位の詳細表示

既存の`ComparePanel`は環境条件の比較であり、今回追加する予測と観測結果の比較とは別機能として維持する。

## 4. 完成後の画面構成

ヘッダーは観測サイクルを優先し、記録系画面をサブメニューへまとめる。

```text
Sky | Plan | Observe | Results | Records ▾

Records ▾
  History
  Snapshots
```

初期画面は`Plan`とする。

### Plan

```text
観測地点
観測日時
最大等級
↓
観測候補一覧
↓
最大5個選択
↓
Missionを作成
```

### Observe

```text
Mission情報
対象星一覧
Visible / Not Visible / Unsure
↓
観測結果を保存
```

### Results

```text
予測数
Visible数
Not Visible数
Unsure数
星ごとの予測・実測
```

### History

```text
保存済みObservationRecord一覧
↓
選択した記録をResultsで表示
```

### Sky

現在の星空ビューアをそのまま利用できるようにする。

## 5. データモデル

新規ファイル：

```text
src/types/observation.ts
```

以下を定義する。

```ts
export interface ObservationSite {
  id: string
  name: string
  latitude: number
  longitude: number
}

export type ObservationStatus =
  | "visible"
  | "not_visible"
  | "unsure"

export interface ObservationCandidate {
  starId: string
  name: string
  nameJa?: string
  magnitude: number
  altitude: number
  azimuth: number
  predictedVisible: boolean
}

export interface ObservationTarget {
  starId: string
  predictedVisible: boolean
  predictedAltitude: number
  predictedAzimuth: number
  predictedMagnitude: number
}

export interface ObservationMission {
  id: string
  siteId: string
  siteSnapshot: ObservationSite
  dateTime: string
  maxMagnitude: number
  targets: ObservationTarget[]
  createdAt: string
}

export interface ObservationResult {
  starId: string
  status: ObservationStatus
}

export interface ObservationRecord {
  missionId: string
  siteId: string
  siteSnapshot: ObservationSite
  dateTime: string
  targets: ObservationTarget[]
  results: ObservationResult[]
  completedAt: string
}

export interface ObservationComparison {
  predicted: number
  visible: number
  notVisible: number
  unsure: number
}
```

`siteSnapshot`と予測値を保存する理由は、Mission作成後に現在の地点や日時が変更されても、当時の観測条件と予測を再現できるようにするためである。

日時は次の形式で保存する。

```ts
date.toISOString()
```

表示時のみ次のように変換する。

```ts
new Date(dateTime)
```

## 6. ドメインロジック

新規ディレクトリ：

```text
src/observation/
```

### `candidates.ts`

次の純粋関数を実装する。

```ts
buildObservationCandidates({
  horizontalStars,
  maxMagnitude,
}): ObservationCandidate[]
```

候補条件は仕様どおり固定する。

```ts
star.altitude > 0 &&
star.magnitude <= maxMagnitude
```

並び順：

1. 等級が小さい星
2. 高度が高い星
3. 名前順

現在の`evaluateStar()`は環境シミュレーション用なので、Missionの基本候補判定には使用しない。

### `mission.ts`

次の純粋関数を実装する。

```ts
createObservationMission(...): ObservationMission
```

要件：

- 対象0件では作成しない。
- 対象は最大5個。
- 重複した`starId`を許可しない。
- IDには`crypto.randomUUID()`を利用する。
- Mission作成時点の高度、方位、等級、`predictedVisible`を固定する。
- 作成後に画面条件が変わってもMissionの値を再計算しない。

時刻やID生成をテストしやすくするため、必要なら`now`やID生成関数を引数として注入できる設計にする。

### `comparison.ts`

```ts
compareObservationRecord(
  record: ObservationRecord,
): ObservationComparison
```

集計規則：

- `predicted`：`predictedVisible === true`の数
- `visible`：`status === "visible"`の数
- `notVisible`：`status === "not_visible"`の数
- `unsure`：`status === "unsure"`の数

M9では一致率は必須ではないため、今回の必須実装へ含めない。

## 7. LocalStorage

新規ファイル：

```text
src/observation/storage.ts
```

Storage key：

```ts
const STORAGE_KEY = "star-view.observation.v1"
```

保存形式：

```ts
interface PersistedObservationState {
  version: 1
  activeSite: ObservationSite
  missions: ObservationMission[]
  records: ObservationRecord[]
}
```

実装する関数：

```ts
loadObservationState()
saveObservationState(state)
clearObservationState()
```

必須条件：

- JSON破損時にクラッシュしない。
- `version`や必須配列が不正なら安全な初期状態へ戻す。
- LocalStorageが利用できない場合も画面を表示する。
- `Date`オブジェクトを直接保存しない。
- 同一`missionId`のRecord保存は重複追加ではなく更新とする。
- テスト用に`Storage`互換オブジェクトを注入できる設計にする。

初期地点：

```ts
{
  id: "home",
  name: "Home",
  latitude: 35.6812,
  longitude: 139.7671,
}
```

## 8. 状態管理

新規ファイル：

```text
src/state/observation.tsx
```

`ObservationProvider`を実装する。

保持する状態：

```ts
activeSite
missions
records
activeMissionId
selectedRecordMissionId
draftResults
```

公開操作：

```ts
updateActiveSite()
createMission()
selectMission()
setDraftResult()
saveObservationRecord()
selectRecord()
```

責務を次のように分ける。

- `StarViewerProvider`：星空表示条件と天体位置
- `SimulationProvider`：昼光、光害、表示上の視認性
- `ObservationProvider`：地点、Mission、観測入力、Record、履歴

Provider構成：

```tsx
<StarViewerProvider>
  <SimulationProvider>
    <ObservationProvider>
      <AppShell />
    </ObservationProvider>
  </SimulationProvider>
</StarViewerProvider>
```

観測地点を変更した場合は、`activeSite`と既存の`StarViewerProvider.settings`の緯度経度を同期する。ただし、保存済みMissionとRecordの`siteSnapshot`は更新しない。

---

## 9. Checkpoint A：ドメイン基盤と永続化

### Red

先に次の検証を`verify-observation-flow.ts`へ追加する。

```text
altitude > 0 の星だけ候補になる
altitude === 0 は候補にならない
magnitude === maxMagnitude は候補になる
maxMagnitudeより暗い星は候補にならない
候補が等級・高度・名前の規則で並ぶ
重複した星をMissionへ入れられない
対象0件のMissionを作れない
6件のMissionを作れない
5件のMissionを作成できる
Mission作成時の高度・方位・予測が固定される
比較集計が正しい
保存から読み込みまで値が維持される
壊れたJSONを読み込んでも例外にならない
不正versionは初期状態へ戻る
同一missionIdのRecordが重複しない
```

追加した検証が、未実装のため失敗することを確認する。

### Green / Refactor

追加・変更対象：

```text
src/types/observation.ts
src/observation/candidates.ts
src/observation/mission.ts
src/observation/comparison.ts
src/observation/storage.ts
src/state/observation.tsx
scripts/verify-observation-flow.ts
package.json
```

既存の検証方法に合わせ、外部テストライブラリは追加しない。

### 完了条件

- ドメイン関数がReactに依存していない。
- LocalStorage異常時に安全な初期状態を返す。
- Providerが既存Providerと責務分離されている。
- `npm run build`が成功する。
- `npm run verify`が既存検証を含めて成功する。

### コミット

```text
feat: add observation domain and persistence
```

---

## 10. Checkpoint B：Plan画面

追加ファイル：

```text
src/components/observation/ObservationPlanScreen.tsx
src/components/observation/SiteEditor.tsx
src/components/observation/CandidateList.tsx
```

### Red

先に純粋な選択状態ロジックを検証する。必要なら`src/observation/selection.ts`へ分離する。

```text
5件まで選択できる
6件目を選択できない
選択済みの星を解除できる
候補条件から外れた星が選択解除される
選択0件ではMissionを作成できない
```

### SiteEditor

入力項目：

```text
地点名
緯度
経度
```

緯度・経度は既存の制限を再利用する。

```text
緯度: -90〜90
経度: -180〜180
```

Geolocation APIは今回の必須条件にしない。追加する場合も手入力欄を常に残し、取得失敗を画面内へ表示する。

### 日時

既存の`TimeControl`を再利用する。

デモ用に次のボタンを追加してよい。

```text
今日 20:00
```

### 最大等級

Plan画面では次の単一選択にする。

```text
1等星
2等星
3等星
4等星
```

内部値：

```ts
1 | 2 | 3 | 4
```

初期値は`2`とする。

Plan画面の`maxMagnitude`は、Sky画面の等級レイヤーON/OFFとは別状態にする。

### CandidateList

各行に次を表示する。

```text
チェックボックス
星名
等級
高度
方位
```

要件：

- 最大5個まで選択できる。
- 5個選択時は未選択チェックボックスを無効化する。
- `3 / 5 selected`のような選択数を表示する。
- 候補0件の場合は空状態を表示する。
- 条件変更によって候補外になった選択を解除する。
- 1件以上選択されるまでMission作成ボタンを無効化する。
- Mission作成後は`activeMissionId`を設定してObserveへ移動する。

### 完了条件

- 地点、日時、最大等級を変更すると候補が更新される。
- 候補条件が`altitude > 0 && magnitude <= maxMagnitude`である。
- 最大5件を選択してMissionを作成できる。
- Missionに作成時点の予測値が保存される。
- `npm run build`と`npm run verify`が成功する。

### コミット

```text
feat: add observation planning workflow
```

---

## 11. Checkpoint C：Observe画面

追加ファイル：

```text
src/components/observation/ObservationRunScreen.tsx
src/components/observation/ObservationStatusInput.tsx
```

### Red

入力状態とRecord生成をUIから分離し、先に次を検証する。

```text
未入力は完了数に含まれない
Visibleを入力できる
Not Visibleを入力できる
Unsureを入力できる
同じ星の状態を変更できる
全対象の入力前はRecordを確定できない
全対象を入力するとRecordを作成できる
Record内のMission予測値が変更されない
```

### UI

各対象星について3択を表示する。

```text
Vega

[Visible]
[Not Visible]
[Unsure]
```

要件：

- 選択中のボタンを視覚的かつ`aria-pressed`等で識別できる。
- `3 / 5 completed`のような完了数を表示する。
- 全対象の入力が終わるまで保存ボタンを無効化する。
- Missionの地点、日時、対象数を上部に表示する。
- 同一セッション中は画面を移動しても入力途中の状態を失わない。
- 保存時に`ObservationRecord`を作成する。
- 保存後はResults画面へ移動する。

Missionが存在しない場合は、次の空状態を表示する。

```text
観測ミッションがありません
[Planへ移動]
```

### 完了条件

- 3択をすべての対象に入力できる。
- 未入力がある状態で保存できない。
- 保存したRecordがLocalStorageへ反映される。
- `npm run build`と`npm run verify`が成功する。

### コミット

```text
feat: add observation result entry
```

---

## 12. Checkpoint D：ResultsとHistory

追加ファイル：

```text
src/components/observation/ObservationResultsScreen.tsx
src/components/observation/ComparisonSummary.tsx
src/components/observation/ResultStarCard.tsx
src/components/observation/ObservationHistoryScreen.tsx
```

### Red

先に次を検証する。

```text
Recordを新しい順に並べられる
missionIdから対象Recordを選択できる
星データから表示名を解決できる
存在しないstarIdでも画面がクラッシュしない
predicted、visible、notVisible、unsureが正しく集計される
```

### Results集計

```text
Prediction
5 stars expected

Result
Visible       3
Not Visible   1
Unsure        1
```

### 星ごとの表示

```text
Vega

Prediction:
Visible

Observation:
Visible
```

不一致の場合は視覚的に区別する。

```text
Deneb

Prediction:
Visible

Observation:
Not Visible
```

予測がVisibleで実測がNot Visibleの場合のみ、次の考察候補を表示してよい。

```text
Possible reasons

- Clouds
- Light pollution
- Local obstacle
- Observation direction
- Human eyesight
```

原因を断定せず、「考えられる理由」「可能性があります」と表現する。

### History

各履歴に次を表示する。

```text
観測日時
地点名
対象数
Visible数
Not Visible数
Unsure数
```

要件：

- 新しいRecordから表示する。
- 履歴を選択するとResultsへ移動する。
- リロード後も保存済み履歴を表示できる。
- 履歴がない場合はPlanへの導線を表示する。
- 初回実装では削除、編集、検索を追加しない。

### 完了条件

- 集計と星ごとの予測・実測を確認できる。
- 保存済みRecordをHistoryから再表示できる。
- ページリロード後も履歴が維持される。
- `npm run build`と`npm run verify`が成功する。

### コミット

```text
feat: add results and history views
```

---

## 13. Checkpoint E：アプリ統合とUI仕上げ

主な変更ファイル：

```text
src/App.tsx
src/styles.css
src/state/simulation.tsx
```

### 画面切り替え

Appレベルで次を保持する。

```ts
type AppView =
  | "plan"
  | "observe"
  | "results"
  | "history"
  | "sky"
```

React Routerは追加せず、Reactの状態で切り替える。

現在のSky画面部分は、必要に応じて`SkyWorkspace`へ切り出す。

```tsx
function SkyWorkspace() {
  return (
    <>
      <div className="app-main">
        {/* 既存のsidebarとSkyArea */}
      </div>
      <footer>{/* 既存のObjectInfo */}</footer>
    </>
  )
}
```

ワークフロー画面は共通レイアウトにする。

```tsx
<main className="workflow-page">
  <div className="workflow-container">
    {/* Plan / Observe / Results / History */}
  </div>
</main>
```

### M1の初期値修正

`src/state/simulation.tsx`の初期レイヤーを次に変更する。

```ts
const DEFAULT_LAYERS = {
  first: true,
  second: true,
  third: false,
  fourth: false,
  faint: false,
}
```

Sky画面の等級レイヤーUI自体は残す。

### レスポンシブ要件

- PCではワークフロー部分を最大幅1000〜1200px程度にする。
- スマートフォンではカードを1列にする。
- 3択ボタンは狭い画面でも押しやすい大きさにする。
- Candidate一覧は必要に応じてリスト内スクロールにする。
- 横スクロールを発生させない。
- タップ領域をおおむね40px以上にする。
- 既存の860px以下のSkyレイアウトを壊さない。
- キーボード操作時のフォーカス表示を維持する。

### Red / 回帰確認

UI統合前に、既存検証で守るべき振る舞いを確認する。必要な回帰テストを先に追加してからApp構成を変更する。

最低限、次を確認する。

```text
Sky画面へ移動できる
PlanからObserveへ進める
保存後にResultsへ進める
HistoryからResultsへ戻れる
MissionがないObserveで空状態が出る
RecordがないResultsで空状態が出る
初期等級レイヤーが1〜2等星のみON
```

### 完了条件

- Plan、Observe、Results、History、Skyを切り替えられる。
- 初期画面がPlanである。
- 既存Sky Viewerの操作が維持されている。
- PCとスマートフォン幅で主要操作が行える。
- `npm run build`と`npm run verify`が成功する。
- 実行可能な環境では`npm run verify:layout`も成功する。

### コミット

```text
feat: integrate observation workflow and polish UI
```

---

## 14. 最終受け入れシナリオ

次の一連の操作を手動確認する。

1. アプリを初回表示する。
2. Plan画面が表示される。
3. 地点名、緯度、経度を入力する。
4. 日時を夜に設定する。
5. 最大等級を2に設定する。
6. 地平線上の候補星が一覧表示される。
7. Vega、Altair、Denebなど最大5個まで選択する。
8. Missionを作成する。
9. Observe画面へ移動する。
10. 各星にVisible / Not Visible / Unsureを入力する。
11. 全件入力後に結果を保存する。
12. Results画面で集計と個別比較を確認する。
13. History画面で保存したRecordを確認する。
14. ブラウザをリロードする。
15. Historyから同じRecordを開けることを確認する。
16. Sky画面へ移動する。
17. 既存の星空表示、日時、方位、等級レイヤー、星の選択が動くことを確認する。

## 15. 最終受け入れ条件

- 星、星名、等級、高度、方位を確認できる。
- 地点名、緯度、経度を入力できる。
- 日時を指定できる。
- 最大等級の初期値が2である。
- 地平線上かつ最大等級以下の星が候補になる。
- 最大5個を選択できる。
- Missionを作成できる。
- 各星にVisible / Not Visible / Unsureを入力できる。
- 未入力がある状態でRecordを確定できない。
- 予測と結果の件数を比較できる。
- 星ごとの予測と実測を確認できる。
- LocalStorageへ保存できる。
- リロード後も履歴が残る。
- 過去の結果を再表示できる。
- 既存Sky Viewerを引き続き利用できる。
- 既存検証を含む`npm run build`と`npm run verify`が成功する。
- Checkpoint A〜Eごとのコミットが存在する。
- MCP、Horizon、Weather関連コードを追加していない。

## 16. 最終報告フォーマット

実装終了後は、次の形式で報告する。

```text
## 実装結果

### 完了したCheckpoint
- Checkpoint A: ...
- Checkpoint B: ...
- Checkpoint C: ...
- Checkpoint D: ...
- Checkpoint E: ...

### 変更ファイル
- path/to/file: 変更内容

### 設計上の判断
- 判断内容と理由

### TDD実施結果
- 先に追加したテスト
- Redで確認した失敗
- Greenで行った最小実装
- Refactorで整理した内容

### テスト結果
- npm run build: PASS / FAIL
- npm run verify: PASS / FAIL
- npm run verify:layout: PASS / FAIL / 未実行理由

### コミット
- commit hash / message

### 残課題
- 未実装または次フェーズへ送った内容
```

この実装が完了した後、同じドメイン関数と保存データを利用してWebMCPを追加する。WebMCP用に先回りした抽象化や仮実装は、今回のスコープには含めない。

次フェーズの詳細は[WebMCP実装計画書](./webmcp-implementation-plan.md)を参照する。
