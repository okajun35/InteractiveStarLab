# InteractiveStarLab WebMCP実装計画書

最終更新：2026-08-29

この文書は、現在完成している観測UIと天体計算をWebMCPへ公開するための実装計画書である。
対象はブラウザ内でツールを公開するWebMCPであり、stdioまたはStreamable HTTPで動く独立MCP Serverではない。

---

## 0. 最初に必ず守ること

- 実装はTDDで行う。各CheckpointでRed、Green、Refactorの順序を守る。
- 全Checkpointを一度に変更しない。Checkpointごとに独立したコミットを作る。
- 各Checkpoint完了時に`npm run build`と`npm run verify`を実行する。
- WebMCP検証を`npm run verify`へ追加し、既存検証も毎回通す。
- 既存の星空ビューア、天体計算、観測Mission、観測履歴を壊さない。
- 既存のユーザー変更を上書きしない。
- 新しいnpm依存は追加しない。WebMCPの最小型定義はリポジトリ内に置く。
- 古い`navigator.modelContext`前提では実装しない。現在の標準面である`document.modelContext`を機能検出して使う。
- WebMCP非対応ブラウザでも通常のUIをクラッシュさせない。
- Tool登録は画面単位のComponentではなく、全画面で生存するProviderで行う。
- Toolの実行処理が古いReact stateを参照しないようにする。
- 読み取りToolと書き込みToolを明確に分ける。
- Mission作成では、Agentから予測高度・方位を受け取らない。アプリ側で再計算して作成時点の値を固定する。
- Mission候補の`maxMagnitude`とSky画面の等級レイヤーを混同しない。
- LocalStorageの不正データでTool実行やUIをクラッシュさせない。
- PNGなどの大きなバイナリをLocalStorageへ保存しない。
- 正確な緯度・経度をAgentやファイル名へ出す処理はプライバシー上の影響を明示する。
- Horizon、Weather、写真のEXIF位置取得、画像認識はCore MCPへ混ぜない。

推奨コミット単位：

```text
feat: add webmcp domain services and contracts
feat: register webmcp read tools
feat: create observation missions through webmcp
feat: expose observation results through webmcp
feat: persist sky snapshots
feat: expose sky snapshots through webmcp
test: harden webmcp workflow and demo
```

---

## 1. WebMCPの前提

2026-08-29時点のWebMCPは、Webページが`document.modelContext.registerTool()`でJavaScript機能をToolとして登録する仕組みである。
APIはSecure Contextを前提とし、仕様はまだ議論中で変更の可能性があるため、必ず機能検出する。

一次資料：

- WebMCP Community Group Draft: https://webmachinelearning.github.io/webmcp/
- Chrome WebMCP Imperative API: https://developer.chrome.com/docs/ai/webmcp/imperative-api
- Lighthouse Registered WebMCP tools audit: https://developer.chrome.com/docs/lighthouse/agentic-browsing/registered-webmcp-tools

本アプリではReact用の実験的パッケージを追加せず、次の形式で直接登録する。

```ts
const modelContext = document.modelContext

await modelContext.registerTool(
  {
    name: "get_observation_site",
    description: "Returns the observation site currently selected in the app.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    execute: async () => JSON.stringify({ ok: true, data: {} }),
  },
  { signal: controller.signal },
)
```

Componentのアンマウント時は`AbortController`で登録を解除する。

---

## 2. 現在ある機能

### 2.1 星空ビューア

| 機能 | 状態 | 主な実装 |
|---|---|---|
| 星・星名・星座線・星座名の描画 | 実装済み | `StarCanvas.tsx`, `starRender.ts` |
| RA/Decから高度・方位を計算 | 実装済み | `coordinates.ts`, `astronomy-engine` |
| 緯度・経度の手入力 | 実装済み | `ObservationPanel.tsx`, `SiteEditor.tsx` |
| 場所プリセット | 実装済み | `directions.ts` |
| 現在地のGeolocation API取得 | 未実装 | なし |
| 写真EXIFから緯度・経度を取得 | 未実装 | なし |
| 日時指定 | 実装済み | `TimeControl.tsx` |
| 方位・高度・視野角指定 | 実装済み | `ObservationPanel.tsx` |
| 等級レイヤー | 実装済み | `MagnitudeLayers.tsx` |
| 昼光・薄暮・光害シミュレーション | 実装済み | `visibilityModel.ts`, `twilight.ts` |
| 観測者感度 | 実装済み | `EnvironmentPanel.tsx` |
| What-If実験 | 実装済み | `ExperimentPanel.tsx`, `experiments.ts` |
| 条件比較 | 実装済み | `ComparePanel.tsx` |
| 選択した星の詳細 | 実装済み | `ObjectInfo.tsx` |

### 2.2 観測ワークフロー

| 機能 | 状態 | 主な実装 |
|---|---|---|
| 観測候補計算 | 実装済み | `observation/candidates.ts` |
| 最大5星の選択 | 実装済み | `observation/selection.ts` |
| Mission作成 | 実装済み | `observation/mission.ts` |
| 予測高度・方位・等級の固定 | 実装済み | `ObservationTarget` |
| Visible / Not Visible / Unsure入力 | 実装済み | `ObservationRunScreen.tsx` |
| MissionとResultの保存 | 実装済み | `state/observation.tsx`, LocalStorage |
| 不正なLocalStorageデータの安全な破棄 | 実装済み | `observation/storage.ts` |
| 件数比較 | 実装済み | `observation/comparison.ts` |
| 星ごとの予測と実測表示 | 実装済み | `ResultStarCard.tsx` |
| 履歴一覧と再表示 | 実装済み | `ObservationHistoryScreen.tsx` |
| Agent向けTool | 未実装 | なし |

### 2.3 MCPで再利用できる純粋関数

- `horizontalStars()`：地点・日時から全星の高度・方位を計算する。
- `buildObservationCandidates()`：高度0度より上かつ最大等級以下へ絞り込む。
- `targetFromCandidate()`：候補からMission用の固定予測値を作る。
- `createObservationMission()`：入力検証を行いMissionを生成する。
- `buildObservationResults()`：全対象の結果入力を検証する。
- `compareObservationRecord()`：予測数と実測状態を集計する。
- `sortObservationRecords()`、`findObservationRecord()`：履歴を検索する。
- `loadObservationState()`、`saveObservationState()`：安全に永続化する。
- `STAR_BY_ID`：保存された`starId`を星名へ変換する。

これらはReact Componentを介さず利用できるため、WebMCPのexecute処理から呼び出せる。

---

## 3. 星空Snapshotの現状

永続的な「星空Snapshot」はSNAP-A/SNAP-Bの実装で利用可能になった。

Sky画面にはPNGダウンロード機能があり、現在はアプリ内Snapshot保存とも共通化されている。

### 現在できること

- Sky画面の通常表示右上に「Snapshot スナップショット」ボタンがある。
- 現在描画されているCanvasをPNGとしてIndexedDBへ保存し、ダウンロードする。
- Snapshots画面で保存画像をサムネイル表示し、再ダウンロードと削除ができる。
- ファイル名へ日時、地点名、表示方向を含める（緯度・経度はファイル名へ含めない）。

### 現在の制約

- Plan、Observe、Results、History画面から直接撮影するUIはない。Sky画面、またはMCPから撮影する。
- 比較表示ではSnapshotボタンが非表示になる。
- Agentへ画像Blobそのものを返す標準化処理はまだない。ToolはIndexedDB保存、メタデータ、任意のブラウザ内ダウンロードURLを返す。
- 現在のPNGはシミュレーション画像であり、ユーザーがアップロードした夜空写真ではない。

また、Mission内に保存される`predictedAltitude`などの「予測Snapshot」と、CanvasをPNG化する「画像Snapshot」は別の概念である。

### Snapshotで追加するデータ型

```ts
type SkySnapshotMetadata = {
  snapshotId: string
  createdAt: string
  fileName: string
  mimeType: "image/png"
  width: number
  height: number
  heading: string
  site: ObservationSite
  dateTime: string
  view: { azimuth: number; altitude: number; fieldOfView: number }
  simulation: SimulationSettings
  layers: StarLayerState
  displayOptions: DisplayOptions
  missionId?: string
}

type SkySnapshotRecord = SkySnapshotMetadata & { blob: Blob }
```

PNG BlobとメタデータはIndexedDBへ保存する。LocalStorageへbase64画像を入れない。

正確な緯度・経度は個人の観測場所になり得る。ダウンロードファイル名には含めず、MCPの返却metadataへ含まれることをTool descriptionで明示する。

---

## 4. MCPで成立させる体験

```text
User:
What stars should I observe tonight?

Agent:
get_observation_site
predict_visible_stars
create_observation_plan

Application:
Missionを保存し、Observe画面を表示

Human:
Visible / Not Visible / Unsureを入力

User:
What was different from the prediction?

Agent:
get_observation_results
compare_prediction_and_observation

Agent:
予測と実測の違いを説明

User:
Save the sky used for this observation.

Agent:
capture_sky_snapshot

Application:
SnapshotをMissionへ関連付けて保存
```

AgentがPNGを画像認識しなくても観測条件を理解できるよう、構造化された`get_current_sky_state`を用意する。

---

## 5. 作るWebMCP Tool

### Core Must

| Tool | 種別 | 目的 |
|---|---|---|
| `get_observation_site` | Read | 現在選択されている観測地点を取得 |
| `predict_visible_stars` | Read | 地点・日時・最大等級から候補星を計算 |
| `create_observation_plan` | Write | 最大5星のMissionを作成してObserveへ進める |
| `get_observation_results` | Read | 保存済みの実測結果を星名付きで取得 |
| `compare_prediction_and_observation` | Read | Mission単位で予測と実測を比較 |
| `get_current_sky_state` | Read | 現在のSky条件を構造化データで取得 |

### Snapshot Should

| Tool | 種別 | 目的 |
|---|---|---|
| `capture_sky_snapshot` | Write | 現在Sky画面に描画されている星空をPNG保存 |
| `list_sky_snapshots` | Read | 保存済みSnapshotの一覧を取得 |
| `get_sky_snapshot_metadata` | Read | 1件のSnapshot条件と関連Missionを取得 |

MVPではPNG本体を巨大なdata URLとしてTool結果へ返さない。Agentの推論用には`get_current_sky_state`とSnapshot metadataを使う。画像入力対応Agentへバイナリを渡す仕組みは、WebMCP側の相互運用性を確認した後の拡張とする。

---

## 6. Tool契約

すべてのToolはJSON文字列として次の共通Envelopeを返す。

```ts
type ToolSuccess<T> = {
  ok: true
  data: T
}

type ToolFailure = {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}
```

想定エラーコード：

```text
WEBMCP_UNAVAILABLE
INVALID_ARGUMENT
INVALID_DATETIME
INVALID_MAGNITUDE
SITE_NOT_AVAILABLE
STAR_NOT_FOUND
STAR_NOT_CANDIDATE
MISSION_NOT_FOUND
RESULT_NOT_FOUND
RESULT_INCOMPLETE
SNAPSHOT_NOT_FOUND
SNAPSHOT_UNAVAILABLE
SNAPSHOT_STORAGE_UNAVAILABLE
SNAPSHOT_RENDER_FAILED
```

### 6.1 get_observation_site

入力：

```json
{}
```

返却：

```json
{
  "ok": true,
  "data": {
    "id": "home",
    "name": "Home",
    "latitude": 35.6812,
    "longitude": 139.7671
  }
}
```

`readOnlyHint: true`とする。

### 6.2 predict_visible_stars

入力：

```json
{
  "dateTime": "2026-08-29T11:00:00.000Z",
  "maxMagnitude": 2,
  "limit": 10
}
```

- `dateTime`はISO 8601文字列で必須。
- `maxMagnitude`は1〜4の整数で必須。
- `limit`は1〜20、初期値5。
- 地点は現在の`activeSite`を使う。
- 昼光、光害、Weather、Horizonは基本予測へ混ぜない。
- 条件は`altitude > 0 && magnitude <= maxMagnitude`とする。

返却：

```json
{
  "ok": true,
  "data": {
    "site": {
      "id": "home",
      "name": "Home",
      "latitude": 35.6812,
      "longitude": 139.7671
    },
    "dateTime": "2026-08-29T11:00:00.000Z",
    "maxMagnitude": 2,
    "stars": [
      {
        "starId": "vega",
        "name": "Vega",
        "nameJa": "ベガ",
        "magnitude": 0.03,
        "altitude": 62.1,
        "azimuth": 285.4,
        "predictedVisible": true
      }
    ]
  }
}
```

### 6.3 create_observation_plan

入力：

```json
{
  "dateTime": "2026-08-29T11:00:00.000Z",
  "maxMagnitude": 2,
  "starIds": ["vega", "altair", "deneb"]
}
```

- `starIds`は1〜5件、重複不可。
- Agentから高度、方位、`predictedVisible`を受け取らない。
- 現在の地点と入力日時からアプリ側で再計算する。
- 指定星が候補条件を満たさない場合は`STAR_NOT_CANDIDATE`を返す。
- Mission保存後、アプリをObserve画面へ移動する。

返却：

```json
{
  "ok": true,
  "data": {
    "missionId": "mission-id",
    "view": "observe",
    "targetCount": 3,
    "targets": [
      {
        "starId": "vega",
        "predictedVisible": true,
        "predictedAltitude": 62.1,
        "predictedAzimuth": 285.4,
        "predictedMagnitude": 0.03
      }
    ]
  }
}
```

`readOnlyHint: false`とする。

### 6.4 get_observation_results

入力：

```json
{
  "missionId": "mission-id"
}
```

`missionId`は省略可能とし、省略時は選択中のRecord、次に最新完了Recordを使う。

返却：

```json
{
  "ok": true,
  "data": {
    "missionId": "mission-id",
    "site": {
      "name": "Home",
      "latitude": 35.6812,
      "longitude": 139.7671
    },
    "dateTime": "2026-08-29T11:00:00.000Z",
    "completedAt": "2026-08-29T12:00:00.000Z",
    "results": [
      {
        "starId": "vega",
        "name": "Vega",
        "prediction": "visible",
        "observation": "visible",
        "predictedAltitude": 62.1,
        "predictedAzimuth": 285.4
      }
    ]
  }
}
```

### 6.5 compare_prediction_and_observation

入力：

```json
{
  "missionId": "mission-id"
}
```

返却：

```json
{
  "ok": true,
  "data": {
    "missionId": "mission-id",
    "predicted": 5,
    "visible": 3,
    "notVisible": 1,
    "unsure": 1,
    "comparable": 4,
    "matches": 3,
    "mismatches": 1,
    "matchRate": 0.75,
    "stars": []
  }
}
```

一致判定は次で固定する。

```text
predictedVisible=true  + observation=visible      → match
predictedVisible=true  + observation=not_visible  → mismatch
predictedVisible=false + observation=not_visible  → match
predictedVisible=false + observation=visible      → mismatch
observation=unsure                                  → 比較対象外
```

現在のMVP候補は全件`predictedVisible=true`であるため、現状では`matches`はVisible件数と同じになる。

### 6.6 get_current_sky_state

入力：

```json
{}
```

返却項目：

- 現在の地点、日時、方位、高度、視野角
- Sky表示用の等級レイヤー
- 昼光モード、光害、限界等級、観測者感度
- 表示オプション
- 現在の方向にある星の構造化一覧
- 太陽高度、薄暮段階、visibleCount、inViewCount

これは画像Snapshotではなく、Agentが現在の画面条件を理解するための構造化Snapshotである。

### 6.7 capture_sky_snapshot

入力（任意）：

```json
{
  "missionId": "mission-id",
  "download": false
}
```

- `missionId`を指定すると既存Missionへ関連付ける。Missionの存在を検証する。
- 撮影条件は現在Sky画面で描画されている地点、日時、方位、高度、FOV、表示設定を使う。
- PNGの幅・高さは現在Canvasの実寸を使う（Tool入力で任意サイズへ変更しない）。
- PNGをIndexedDBへ保存する。
- `download`省略時は`true`としてブラウザダウンロードも行い、`false`なら保存だけ行う。

返却：

```json
{
  "ok": true,
  "data": {
    "snapshotId": "snapshot-id",
    "metadata": {
      "snapshotId": "snapshot-id",
      "missionId": "mission-id",
      "createdAt": "2026-08-29T12:10:00.000Z",
      "mimeType": "image/png",
      "width": 1280,
      "height": 720
    },
    "downloadUrl": null,
    "downloaded": false
  }
}
```

---

## 7. 現在足りないもの

### 7.1 WebMCP基盤

- `document.modelContext`の型定義。
- WebMCP対応判定。
- Tool登録と解除のライフサイクル。
- Tool名、説明、JSON Schema、annotation。
- Toolの共通成功・失敗Envelope。
- 実行時入力バリデーション。
- WebMCP対応状態を人間へ表示するUI。
- Tool登録数を確認する開発用診断。

### 7.2 React外から使うサービス層

現在のPlan画面は`useStarViewer()`の`horizontal`へ直接依存している。
`predict_visible_stars`は任意日時で計算するため、次の純粋関数が必要になる。

```ts
predictVisibleStars({
  site,
  dateTime,
  maxMagnitude,
  limit,
})
```

この関数内で既存の`horizontalStars()`と`buildObservationCandidates()`を組み合わせる。

### 7.3 MCPからの画面遷移

現在の`AppView`は`AppShell`内のローカルstateである。
そのままではMCP ProviderからObserve画面へ移動できない。

次のどちらかを実装する。

1. `AppNavigationProvider`を追加し、`view`と`setView`を共有する。
2. WebMCP Providerへ`onOpenObserve`などの限定callbackを渡す。

推奨は1。Toolが増えても画面遷移を一箇所で管理できる。

汎用的な`navigate_app` Toolは公開しない。Mission作成などのユーザー目的に沿ったToolが必要な画面遷移を行う。

### 7.4 比較結果の不足

現在の`ObservationComparison`には次がない。

- comparable
- matches
- mismatches
- matchRate
- 星ごとの一致・不一致

純粋関数として追加し、UIとMCPの両方で同じ定義を使う。

### 7.5 Snapshot基盤

- Sky画面外でも使えるCanvasレンダリング関数。
- Snapshot metadata型。
- IndexedDB storage adapter。
- IndexedDBが使えない場合の安全なfallback。
- Snapshot一覧画面。
- Mission / Resultとの関連付け。
- ダウンロード、削除、再表示。
- MCPからの作成・一覧・取得。
- 緯度経度をファイル名へ含めるかのプライバシー設定。

### 7.6 テスト基盤

- fake `ModelContext`。
- 登録Toolの名前、schema、annotationを検証するテスト。
- ToolをJSON入力で実行するテスト。
- React state更新後もToolが最新状態を返す回帰テスト。
- 非対応ブラウザで通常UIが動くテスト。
- IndexedDB相当を抽象化したインメモリSnapshot storage。
- 対応ChromeでのLighthouse WebMCP audit。

---

## 8. 実装構成案

```text
src/
  mcp/
    contracts.ts
    errors.ts
    schemas.ts
    services.ts
    toolDefinitions.ts
    registerTools.ts
  state/
    navigation.tsx
    webmcp.tsx
    snapshots.tsx
  snapshots/
    types.ts
    metadata.ts
    renderer.ts
    storage.ts
  components/
    WebMcpStatus.tsx
    snapshots/
      SnapshotScreen.tsx
      SnapshotCard.tsx
  types/
    webmcp.d.ts
scripts/
  verify-webmcp.ts
  verify-snapshots.ts
```

### Provider配置

```tsx
<StarViewerProvider>
  <SimulationProvider>
    <ObservationProvider>
      <NavigationProvider>
        <SnapshotProvider>
          <WebMcpProvider>
            <AppShell />
          </WebMcpProvider>
        </SnapshotProvider>
      </NavigationProvider>
    </ObservationProvider>
  </SimulationProvider>
</StarViewerProvider>
```

`WebMcpProvider`はPlan、Observe、Results、History、Skyを切り替えてもアンマウントされない位置へ置く。

Toolは登録時のstateを閉じ込めない。Provider内で最新stateとactionをrefへ同期し、execute時にrefから読むか、state変更時に安全に再登録する。推奨はref方式である。

---

## 9. Checkpoint MCP-A：契約と純粋サービス

### Red

`scripts/verify-webmcp.ts`を先に追加し、次を失敗させる。

- 有効な地点・日時から候補星を返す。
- `altitude <= 0`を返さない。
- 最大等級境界を含む。
- limitを守る。
- 不正日時と不正等級を拒否する。
- Tool成功・失敗EnvelopeをJSON化できる。
- 結果DTOに星名が含まれる。
- 比較のmatches / mismatches / unsure定義が正しい。

### Green

- `mcp/contracts.ts`
- `mcp/errors.ts`
- `mcp/services.ts`
- 比較純粋関数の拡張

を追加する。

### 完了条件

- Reactをimportせず予測・結果取得・比較が行える。
- `npm run build`と`npm run verify`が成功する。

---

## 10. Checkpoint MCP-B：登録基盤とRead Tool

対象：

- `get_observation_site`
- `predict_visible_stars`
- `get_current_sky_state`

### Red

- fake ModelContextへ3 Toolが登録される。
- Tool名、description、inputSchema、annotationが正しい。
- cleanup時に登録が解除される。
- WebMCP非対応時に例外が発生しない。
- 地点変更後にToolが最新地点を返す。
- 日時変更後に`get_current_sky_state`が最新日時を返す。

### Green

- `types/webmcp.d.ts`
- `mcp/schemas.ts`
- `mcp/toolDefinitions.ts`
- `mcp/registerTools.ts`
- `state/webmcp.tsx`
- `components/WebMcpStatus.tsx`

を追加する。

### UI

ヘッダーまたは設定内に次を表示する。

```text
MCP 15
```

ステータスの完全な説明（`WebMCP Ready · 15 tools`など）は`title`とアクセシブルラベルで確認できる。

非対応時：

```text
MCP off
```

通常の観測UIはそのまま利用できる。

---

## 11. Checkpoint MCP-C：Mission作成Tool

対象：`create_observation_plan`

### Red

- 0件と6件以上を拒否する。
- 重複starIdを拒否する。
- 存在しない星を拒否する。
- 候補外の星を拒否する。
- Agentが高度・方位を偽装できない。
- Missionに地点Snapshotが保存される。
- 高度・方位・等級・`predictedVisible`が作成時点で固定される。
- Mission作成後にactiveMissionIdが更新される。
- Observe画面へ遷移する。

### Green

- `NavigationProvider`を追加する。
- `AppShell`のローカルviewをProviderへ移す。
- `create_observation_plan`を登録する。
- 既存`ObservationProvider.createMission()`を再利用する。

### 完了条件

次の会話でMissionが画面に現れる。

```text
Find five bright stars for tonight.
```

---

## 12. Checkpoint MCP-D：Resultと比較Tool

対象：

- `get_observation_results`
- `compare_prediction_and_observation`

### Red

- missionId指定で正しいRecordを返す。
- missionId省略時に選択中、次に最新Recordを返す。
- Recordがない場合は`RESULT_NOT_FOUND`を返す。
- starIdを英語名・日本語名へ変換する。
- unsureをmatchRateの分母から除外する。
- mismatchの星を個別に返す。
- Mission作成後の現在位置変更で予測値が変わらない。

### Green

- DTO変換関数を追加する。
- 比較関数をUIとMCPで共有する。
- 2つのToolを登録する。

### 完了条件

Agentが「Denebは見える予測だったが実測では見えなかった」と説明できるJSONを得られる。

---

## 13. Checkpoint SNAP-A：永続Snapshot（完了）

### Red

- Snapshot metadataが日時をISO文字列として保持する。
- Missionと関連付けられる。
- PNG BlobをLocalStorageへ入れない。
- 保存・一覧・取得・削除ができる。
- storage利用不可でもアプリがクラッシュしない（空状態へフォールバックする）。
- Snapshotレンダリングが既存Skyと同じ天体位置を使う。

### Green

- `snapshots/types.ts`
- `snapshots/metadata.ts`
- `snapshots/renderer.ts`
- `snapshots/storage.ts`
- `SnapshotProvider`
- `SnapshotScreen`

を追加する。

既存`StarCanvas.takeSnapshot()`は共有Snapshot serviceを呼ぶ形へ整理する。

### UI変更

- ヘッダーへ`Snapshots`を追加する。
- SkyのSnapshotボタンを維持する。
- 保存後にSnapshot一覧でサムネイル、日時、地点、方向、関連Missionを確認できる。
- 再ダウンロードと削除ができる。

### 注意

Missionには画面方向、FOV、光害などが現在保存されていない。Mission時点の完全な再現が必要なら、Missionへ`skyStateSnapshot`を追加し、storage versionを上げてmigrationを実装する。

推奨は次の追加である。

```ts
type MissionSkyStateSnapshot = {
  azimuth: number
  altitude: number
  fieldOfView: number
  layers: StarLayerState
  simulation: SimulationSettings
  displayOptions: DisplayOptions
}
```

既存Missionはこの値を持たないため、読み込み時に`undefined`を許容する後方互換migrationが必要になる。

---

## 14. Checkpoint SNAP-B：Snapshot Tool（完了）

対象：

- `capture_sky_snapshot`
- `list_sky_snapshots`
- `get_sky_snapshot_metadata`

### Red

- current条件でSnapshotを作成できる。
- missionId指定で関連付けられる。
- 存在しないMissionを拒否する。
- Canvasの実寸をmetadataへ保存する。
- 保存失敗を成功として返さない。
- list結果へBlobや巨大data URLを含めない。
- 位置情報を返すことがTool descriptionから分かる。

### Green

- 3つのToolを登録する。
- capture成功後にSnapshotを選択状態にする。
- Agentが返却されたIDを使って一覧から確認できる。

### 完了条件

AgentのTool実行でSnapshotがアプリ内履歴へ追加され、人間が確認・ダウンロードできる。

---

## 15. Checkpoint MCP-E：統合・監査・デモ

### 検証

- `npm run build`
- `npm run verify`
- WebMCP対応Chromeで全Toolを列挙する。
- LighthouseのRegistered WebMCP tools auditで登録を確認する。
- ツールが画面遷移後も登録されたままであることを確認する。
- React Strict Mode相当のmount/unmountで二重登録しないことを確認する。
- WebMCP非対応ブラウザで通常UIを確認する。
- リロード後にMission、Result、Snapshotが残ることを確認する。

### 3分デモ

1. Planで地点と日時を設定する。
2. Agentが`get_observation_site`を実行する。
3. Agentが`predict_visible_stars`を実行する。
4. Agentが`create_observation_plan`を実行する。
5. アプリがObserveへ移動する。
6. 人間がVisible / Not Visible / Unsureを入力する。
7. Agentが`get_observation_results`を実行する。
8. Agentが`compare_prediction_and_observation`を実行する。
9. Agentが差分を説明する。
10. Agentが`capture_sky_snapshot`を実行する。
11. Snapshot画面で保存画像と関連Missionを確認する。

---

## 16. 最終受け入れ条件

- WebMCP対応環境でCore Must 6 Toolを発見できる。
- Snapshot Should 3 Toolを発見できる。
- Toolの入力Schemaが追加プロパティを拒否する。
- Read ToolがUIを変更しない。
- Write Toolが変更内容を返却し、UIにも反映する。
- Agentから渡された高度・方位を信用しない。
- Missionの予測値は作成後に変化しない。
- 観測結果は人間がUIから入力する。
- 結果比較のmatch定義がテストとUIとMCPで一致する。
- 画面遷移してもToolが消えず、最新stateを読む。
- WebMCP非対応環境でもアプリが動く。
- Snapshotがアプリ内に保存される。
- SnapshotをMissionへ関連付けられる。
- SnapshotのPNG BlobをLocalStorageへ保存しない。
- Snapshots画面で保存画像をサムネイル表示できる。
- `capture_sky_snapshot`はPNG BlobをTool結果へ埋め込まず、保存メタデータと任意のダウンロードURLを返す。
- 正確な位置情報の扱いがUIとTool descriptionで明示される。
- `npm run build`と`npm run verify`が成功する。
- Checkpointごとのコミットが存在する。

---

## 17. 今回のMCPフェーズに含めないもの

- 写真アップロードとEXIF GPS取得
- 夜空写真からの場所推定
- Horizon Profile
- Weather API
- Light Pollution API
- Agentによる人間の観測結果入力
- Snapshot画像のAI画像認識
- Snapshotのクラウド共有
- PDFレポート
- AR、Plate Solving
- 独立MCP ServerとStreamable HTTP transport

写真から緯度経度を取得する機能は、WebMCP完成後に別Checkpointとして計画する。GPS EXIFがない写真から位置を推定する機能は精度・プライバシー・画像解析の課題が大きいため、同じ機能として扱わない。

---

## 18. 実装終了時の報告形式

```text
## 実装結果

### 完了したCheckpoint
- MCP-A: ...
- MCP-B: ...
- MCP-C: ...
- MCP-D: ...
- SNAP-A: ...
- SNAP-B: ...
- MCP-E: ...

### 登録Tool
- tool_name: Read / Write、用途

### 変更ファイル
- path: 内容

### 設計上の判断
- 判断と理由

### TDD
- Redで確認した失敗
- Greenの最小実装
- Refactor内容

### テスト結果
- npm run build: PASS / FAIL
- npm run verify: PASS / FAIL
- WebMCP実機確認: PASS / FAIL / 未実行理由
- Lighthouse audit: PASS / FAIL / 未実行理由

### コミット
- hash message

### 残課題
- 次フェーズへ送った内容
```
