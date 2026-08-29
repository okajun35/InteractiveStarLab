# WebMCP Sky操作・観測結果保存 実装計画書

この文書は、既存Core WebMCPへ「Sky画面を開く」「星空の条件を変更する」「人間が報告した観測結果を保存する」「保存結果をResults画面で確認する」機能を追加するための、gpt-5.6-luna向け実装指示書である。

## 0. 最初に必ず守ること

**実装は必ずTDDで行い、Checkpointごとに完了コミットを作成すること。**

- 最初から全Checkpointをまとめて変更しない。必ず記載順に1 Checkpointずつ進める。
- 各Checkpointで、先に失敗するテストを追加する（Red）。その失敗理由を確認してから最小実装を行う（Green）。最後に必要な整理だけを行う（Refactor）。
- 各Checkpoint完了時に、必ず`npm run build`と`npm run verify`を実行する。両方成功するまでコミットしない。
- 各Checkpointは、この文書に指定したコミットメッセージで独立してコミットする。
- Checkpointのコミット後に次のCheckpointへ進む。複数Checkpointを1コミットへまとめない。
- 既存の星空ビューア、天体位置計算、観測ワークフロー、既存6 WebMCP Toolを壊さない。
- 既存のユーザー変更がある場合は上書きしない。開始時に`git status --short`と`git diff`を確認し、無関係な変更をコミットへ含めない。
- 新しいnpm依存は追加しない。現在のReact、TypeScript、Viteと既存ユーティリティだけで実装する。
- Horizon Profile、Weather、Light Pollution外部データ取得、写真EXIF、画像認識、ARは今回実装しない。
- 画面表示用の等級レイヤーとMission候補の`maxMagnitude`を混同しない。今回の表示設定Toolは既存Missionを変更しない。
- `predictedVisible`、`predictedAltitude`、`predictedAzimuth`、`predictedMagnitude`はMission作成時点の固定Snapshotであり、Sky設定変更やResult保存時に再計算・上書きしない。
- LocalStorageの不正データでアプリをクラッシュさせない。既存の安全なロード処理を維持する。
- Tool入力は`unknown`のまま信用しない。欠落、余分なキー、型違い、範囲外、重複、未知IDを実行前に拒否する。
- Toolは画面Componentへ登録しない。画面遷移後も生存する`WebMcpProvider`から登録する。
- 登録時のReact stateをクロージャへ固定しない。現在値・actionはref経由で実行時に参照する。
- 人間の観測結果をAgentが推測して保存してはならない。`save_observation_results`のdescriptionへ「ユーザーが明示した結果だけを保存する」と書く。
- Tool実行成功を返した後に保存が失敗する設計にしない。Result作成と永続state更新は1つの原子的actionとして実装する。
- 実装後、変更ファイル、設計上の判断、TDDのRed/Green、テスト結果、Checkpoint別コミット、残課題を報告する。

各Checkpointで使う基本手順：

```text
1. 対象ファイルと既存差分を確認
2. scripts/verify-webmcp.tsへ失敗テストを追加
3. 対象テストが意図した理由で失敗することを確認（Red）
4. 最小実装（Green）
5. 必要なRefactor
6. npm run build
7. npm run verify
8. git diff --check
9. 指定メッセージでコミット
```

## 1. 今回の到達点

次の会話と画面動作を成立させる。

```text
User: 東京、今夜20時、南向き80度の星空を表示して。
Agent:
  set_observation_site(...)
  set_sky_view_settings(...)
  open_sky_view()

Application: Sky画面を指定条件で表示する。

User: Missionの観測結果は、VegaがVisible、AltairがNot Visibleです。
Agent:
  save_observation_results(...)
  open_observation_results(...)

Application: Results画面に保存済みの比較結果を表示する。
```

Agentが星空を「見る」ための構造化情報は、実装済みの`get_current_sky_state`を使う。`open_sky_view`は人間にCanvasを表示するためのToolであり、画像をAgentへ返すToolではない。

## 2. 現在実装済みのWebMCP

| Tool | 種別 | 現状 |
|---|---|---|
| `get_observation_site` | Read | 現在の観測地点を取得できる |
| `predict_visible_stars` | Read | 日時・Mission候補上限等級から候補を計算できる |
| `get_current_sky_state` | Read | 現在のSky条件と構造化された星一覧を取得できる |
| `create_observation_plan` | Write | 最大5星のMissionを保存しObserve画面を開く |
| `get_observation_results` | Read | 保存済みRecordを取得できる |
| `compare_prediction_and_observation` | Read | 保存済みRecordの予測・実測比較を取得できる |

既存Tool登録は`src/state/webmcp.tsx`にあり、Providerは画面切替より上位に配置済みである。新Toolも同じライフサイクルへ統合する。

## 3. 現在足りない機能

1. AgentがSky画面を開けない。
2. Agentが観測地点を変更できない。
3. Agentが日時、方位、高度、視野角を変更できない。
4. Agentが等級レイヤー、表示要素、昼光、光害シミュレーション等を変更できない。
5. Agentがユーザーから受け取った`Visible / Not Visible / Unsure`を保存できない。
6. Agentが対象Recordを選び、Results画面を開けない。
7. 現在の`saveObservationRecord()`はactive missionとdraft stateをそのrenderから読む。Toolから`selectMission()`、`setDraftResult()`、`saveObservationRecord()`を同期的に連続実行すると、React更新前の古いstateを保存処理が読む危険がある。
8. 現在のローカル`WebMcpJsonSchema`型は、`results: [{ starId, status }]`のような入れ子Schemaを詳細に表現できない。

## 4. 今回追加するTool

| Tool | 種別 | 目的 |
|---|---|---|
| `open_sky_view` | Write/UI | 現在条件のSky画面を開く |
| `set_observation_site` | Write | 観測地点をObservationとSkyの両方へ同期設定する |
| `set_sky_view_settings` | Write | Skyの日時、方位、高度、視野角を変更する |
| `set_sky_display_settings` | Write | 表示レイヤー、ラベル、環境シミュレーションを変更する |
| `save_observation_results` | Write | 指定Missionの完全な実測結果を原子的に保存する |
| `open_observation_results` | Write/UI | 保存済みRecordを選択してResults画面を開く |

追加後の合計は12 Toolとする。汎用的な`navigate_app({view})`は公開しない。Agentの目的が明確になる目的別Toolだけを登録する。

## 5. Tool契約

すべて既存の成功・失敗envelopeへ合わせる。

```typescript
type ToolSuccess<T> = { ok: true; data: T }

type ToolFailure = {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}
```

### 5.1 `open_sky_view`

入力：

```json
{}
```

成功：

```json
{
  "ok": true,
  "data": {
    "view": "sky",
    "dateTime": "2026-08-29T11:00:00.000Z",
    "azimuth": 180,
    "altitude": 30,
    "fieldOfView": 80
  }
}
```

動作：

- `setView("sky")`を実行する。
- 星空条件自体は変更しない。
- 現在の正規化済みSky view settingsを返す。
- `readOnlyHint: false`とする。データ永続化はしないが、UI stateを変更するためWrite扱いである。

### 5.2 `set_observation_site`

入力：

```typescript
{
  name?: string
  latitude: number   // -90..90
  longitude: number  // -180..180
}
```

成功：

```json
{
  "ok": true,
  "data": {
    "site": {
      "id": "current-site-id",
      "name": "Tokyo",
      "latitude": 35.6812,
      "longitude": 139.7671
    },
    "skyLocationSynchronized": true
  }
}
```

動作：

- `ObservationProvider.activeSite`と`StarViewerProvider.settings`の緯度経度を同時に更新する。
- `name`省略時は既存名を保持する。空白だけの名前は禁止する。
- 既存`site.id`は保持する。Toolから任意のIDを書かせない。
- 既存Missionの`siteSnapshot`は変更しない。
- 位置変更による天体再計算は既存`horizontalStars`経路へ任せ、別の計算実装を作らない。

### 5.3 `set_sky_view_settings`

入力：すべて任意だが、1項目以上必須。

```typescript
{
  dateTime?: string   // 有効なISO日時
  azimuth?: number    // 0以上360未満
  altitude?: number   // 0..90
  fieldOfView?: number // 既存LIMITSの範囲
}
```

成功時は変更後に意図される4項目の完全な設定を返す。日時はISO文字列で返す。

注意：

- 緯度・経度はこのToolへ入れず、`set_observation_site`へ集約する。
- `dateTime`は有効性を確認後に`Date`へ変換する。
- 既存`astronomy/validation.ts`と`LIMITS`を唯一の範囲根拠として使う。範囲を別ファイルへ重複定義しない。
- 現在存在するMission/Recordの日時や予測Snapshotは変更しない。

### 5.4 `set_sky_display_settings`

入力：すべて任意だが、1項目以上必須。

```typescript
{
  stars?: boolean
  starNames?: boolean
  constellationLines?: boolean
  constellationNames?: boolean

  firstMagnitude?: boolean
  secondMagnitude?: boolean
  thirdMagnitude?: boolean
  fourthMagnitude?: boolean
  faintMagnitude?: boolean

  daylightMode?: "real" | "removed"
  lightPollution?: "city-center" | "urban" | "suburban" | "dark-sky" | "perfect"
  limitingMagnitude?: number       // 1.0..6.5
  observerSensitivity?: number     // -0.5..0.5
  showHiddenStars?: boolean
}
```

命名上の注意：

- `firstMagnitude`等はCanvas表示用の等級レイヤーである。
- Mission候補を絞る`maxMagnitude`ではない。
- このTool実行でMission候補、Mission target、予測Snapshotを変えない。

適用順序：

1. Display options
2. Magnitude layers
3. `daylightMode`、`showHiddenStars`、`observerSensitivity`
4. `lightPollution`
5. `limitingMagnitude`

`lightPollution`と`limitingMagnitude`が同時指定された場合、光害presetを適用した後、明示された`limitingMagnitude`を最終値とする。これによりAgent入力が決定的になる。

### 5.5 `save_observation_results`

入力：

```typescript
{
  missionId: string
  results: Array<{
    starId: string
    status: "visible" | "not_visible" | "unsure"
  }>
}
```

検証：

- `missionId`が存在するMissionを指す。
- `results`はMission target数と同数である。
- 各Mission targetがちょうど1回ずつ含まれる。
- 同じ`starId`の重複を拒否する。
- Mission外の`starId`を拒否する。
- statusは3値だけを許可する。
- 一部だけの結果保存は拒否する。UIと同じく完全なRecordだけを保存する。
- 配列順序には依存せず、保存時はMission target順へ正規化する。

成功：

```json
{
  "ok": true,
  "data": {
    "missionId": "mission-id",
    "saved": true,
    "completedAt": "2026-08-29T12:00:00.000Z",
    "summary": {
      "predicted": 2,
      "visible": 1,
      "notVisible": 1,
      "unsure": 0,
      "matches": 1,
      "mismatches": 1
    }
  }
}
```

動作：

- pure functionで入力を検証・Mission target順へ正規化する。
- `ObservationProvider`へ`saveResultsForMission(missionId, results)`のような原子的actionを追加する。
- action内でMission検索、Record構築、既存同Mission Recordの置換、`activeMissionId`更新、draft同期、`selectedRecordMissionId`更新を1回の操作として成立させる。
- Recordの`targets`、`siteSnapshot`、`dateTime`はMissionに保存済みの固定値をcloneする。
- 既存Recordがあれば同じ`missionId`で置換する。Recordを重複追加しない。
- Tool内で`selectMission`→`setDraftResult`→`saveObservationRecord`を連続呼び出しする実装は禁止する。React stateの非同期更新により古い値を読むためである。
- Toolは保存だけを担当し、自動的には画面遷移しない。次に`open_observation_results`を明示実行することで会話とUI操作を追跡しやすくする。

エラーコード：

- 不正なshape、status、重複、不足、余分なtarget：`INVALID_ARGUMENT`
- Missionなし：`MISSION_NOT_FOUND`
- 永続state更新失敗：`SAVE_FAILED`

### 5.6 `open_observation_results`

入力：

```typescript
{
  missionId?: string
}
```

動作：

- `missionId`指定時は、そのRecordが存在することを確認する。
- 省略時は、現在選択中のRecord、なければ`completedAt`が最新のRecordを選ぶ。
- 対象Recordを`selectRecord()`し、`setView("results")`する。
- Recordが1件もなければ、空のResults画面へ移動せず`RESULT_NOT_FOUND`を返す。
- 成功結果には`view: "results"`、`missionId`、集計summaryを含める。
- 選択と画面遷移だけを行い、Recordを再計算・再保存しない。

## 6. 共通設計

### 6.1 ファイル構成案

```text
src/mcp/
  contracts.ts                 # 新しいDTOを追加
  input.ts                     # 共通object/enum/number検証を再利用・拡張
  webmcp.ts                    # 再帰的JSON Schema型へ安全に拡張
  skyControlServices.ts        # 設定入力のpure validation/normalization
  skyControlTools.ts           # open/set系4 Tool
  observationWriteServices.ts  # Result入力のpure validation/record構築
  observationWriteTools.ts     # save/open results系2 Tool

src/state/
  observation.tsx              # 原子的saveResultsForMission action
  webmcp.tsx                   # 新Tool登録と最新state/action refs

scripts/
  verify-webmcp.ts             # 全CheckpointのTDD検証
```

既存ファイルへ自然に収まる場合は命名を調整してよい。ただし、入力検証・Record構築をReact ProviderやTool `execute`内へ埋め込まず、pure functionとしてテスト可能にする。

### 6.2 WebMCP JSON Schema

`save_observation_results.results.items`へ次を表現できるよう、ローカルSchema型を再帰化する。

```typescript
interface WebMcpSchemaProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object"
  description?: string
  enum?: readonly (string | number | boolean)[]
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  items?: WebMcpSchemaProperty
  properties?: Record<string, WebMcpSchemaProperty>
  required?: string[]
  additionalProperties?: boolean
}
```

実際のランタイム検証はJSON Schemaだけへ依存せず、既存`safeExecute`内で必ず実施する。

### 6.3 最新stateの参照

`WebMcpProvider`で次をrefへ保持する。

- `activeSite`、`missions`、`records`、`selectedRecordMissionId`
- Sky observation settings、display options
- simulation settings、layers
- `updateActiveSite`、`updateSettings`、`updateOptions`
- simulationの設定actions
- `saveResultsForMission`、`selectRecord`、`setView`

Tool登録effectの依存配列をstate変更ごとに再実行する設計にはしない。登録はProvider lifecycleで1回、実行値はrefから読む。

### 6.4 React state更新後の返却値

React setter直後にrefを再読込して「更新後」とみなしてはならない。setter反映前の値である可能性がある。

- 設定Toolは「現在値 + 検証済みpatch」から期待される完全な更新後DTOをpure functionで先に作り、そのDTOと同じpatchを適用する。
- Result Toolはpure functionで完成Recordを作り、原子的actionがそのRecordを保存し、同じRecordから返却DTOを作る。
- 後続の`get_current_sky_state`や`get_observation_results`は次のTool実行時にrefの最新stateを読む。

## 7. Checkpoint順序

## Checkpoint MCP-E：契約、Schema、pure validation

目的：ReactやTool登録へ触れる前に、新入力と返却型を固定する。

### Red

`scripts/verify-webmcp.ts`へ次を追加し、未実装で失敗することを確認する。

- view settingsのISO日時と数値範囲を検証できる。
- 空patchと余分なキーを拒否する。
- display settingsのenumと数値範囲を検証できる。
- `firstMagnitude`等がdisplay layerへだけ正規化され、`maxMagnitude`を生成しない。
- Result入力の完全性、重複、未知star、statusを検証できる。
- ResultがMission target順へ正規化される。
- Mission SnapshotからRecordを作り、予測値を変更しない。
- 入れ子のResult JSON SchemaをTypeScriptで表現できる。

### Green

- DTO型とpure validation/normalizationを実装する。
- 既存`input.ts`の検証パターンとerror envelopeを再利用する。
- WebMCP Schema型を再帰化する。
- React state、LocalStorage、画面遷移はまだ変更しない。

### 完了条件

```text
npm run build  PASS
npm run verify PASS
git diff --check PASS
```

コミット：

```text
feat: define webmcp sky and result write contracts
```

## Checkpoint MCP-F：Sky画面遷移Tool

目的：Agentが人間向けSky Canvasを開けるようにする。

### Red

- `open_sky_view`だけを単体登録できる。
- inputの余分なキーを拒否する。
- 実行時に`openSky()` callbackが1回呼ばれる。
- 成功結果へ`view: "sky"`と現在の日時・方向・FOVを含む。
- `readOnlyHint`がfalseである。
- callback例外を成功として返さない。

### Green

- `open_sky_view`を実装する。
- `WebMcpProvider`から`setViewRef.current("sky")`へ接続する。
- status表示の登録Tool名一覧へ追加する。

### 完了条件

- Plan、Observe、Results、Historyのどの画面から実行してもSkyへ移動する。
- 既存6 Toolの登録が維持される。

コミット：

```text
feat: open the sky view through webmcp
```

## Checkpoint MCP-G：観測地点・Sky方向設定Tool

目的：Agentが星空計算条件を変更できるようにする。

### Red

- `set_observation_site`が有効な地点を受理する。
- 緯度、経度、空名、余分なキーを拒否する。
- Observation siteとSky locationの両callbackが同じ緯度経度で呼ばれる。
- 既存site IDを保持する。
- `set_sky_view_settings`が部分patchを受理する。
- 無効日時、空patch、方位・高度・FOV範囲外を拒否する。
- 既存値とpatchから完全な更新後DTOを返す。
- Missionの`maxMagnitude`やtargetsへ触れない。

### Green

- 2 Toolを実装し、`WebMcpProvider`のrefs/actionsへ接続する。
- 既存`updateActiveSite`と`updateSettings`を利用する。
- `get_current_sky_state`が次回実行時に新しい条件を返すことを確認する。

### 完了条件

- UIの地点、日時、方位、高度、FOVがTool入力と一致する。
- 天体位置は既存計算で再描画される。
- 既存Missionの予測Snapshotが不変である。

コミット：

```text
feat: configure sky observation settings through webmcp
```

## Checkpoint MCP-H：Sky表示・環境設定Tool

目的：AgentがCanvasの表示条件を変更できるようにする。

### Red

- 各display optionと各magnitude layerを個別変更できる。
- daylight、light pollution、limiting magnitude、observer sensitivity、hidden starsを変更できる。
- enum外、範囲外、空patch、余分なキーを拒否する。
- `lightPollution`と`limitingMagnitude`同時指定時に明示limitが最終値になる。
- display layer変更でMission `maxMagnitude`とtarget Snapshotが変わらない。
- 実行結果に完全なdisplay/simulation settingsを返す。

### Green

- `set_sky_display_settings`を実装する。
- 既存simulation actionを再利用する。必要なら、適用順とpreset管理を一箇所に保つ小さなbatch actionを追加する。
- 既存の範囲定数とenum型を使う。

### 完了条件

- Sky画面でTool指定どおり表示が切り替わる。
- `get_current_sky_state`が新しい表示・simulation状態を返す。
- Mission候補上限と表示レイヤーが独立している。

コミット：

```text
feat: configure sky display settings through webmcp
```

## Checkpoint MCP-I：原子的な観測結果保存

目的：Agentがユーザー報告を安全にObservationRecordとして保存できるようにする。

### Red

まずpure/stateテストを追加する。

- active missionとは別の`missionId`も明示指定して保存できる。
- 入力順が違ってもMission target順で保存する。
- 完全な結果だけを保存する。
- 同Missionの再保存はRecordを置換し、件数を増やさない。
- `activeMissionId`、draft、selected recordが保存内容へ同期する。
- Missionの地点、日時、target予測Snapshotをそのままcloneする。
- 保存後に既存Missionを変更してもRecordのcloneが変化しない。
- `selectMission`等のReact更新を待つ必要なく、1 actionで保存できる。

次にToolテストを追加する。

- `save_observation_results`を登録する。
- 正常入力で保存callbackが1回だけ呼ばれる。
- 欠落、重複、未知star、未知Mission、不正statusを失敗envelopeで返す。
- Tool descriptionにユーザー明示結果だけを保存する旨がある。
- 成功結果のsummaryが既存比較ロジックと一致する。

### Green

- pure Record builderを実装する。
- `ObservationState`へ原子的`saveResultsForMission` actionを追加する。
- Toolを実装しProviderのaction refへ接続する。
- LocalStorage保存は既存`saveObservationState`経路を維持する。

### 完了条件

- Tool保存後、`get_observation_results({missionId})`で同じ結果を取得できる。
- リロード後もRecordが残る。
- 不正LocalStorageからの起動が既存どおり安全である。

コミット：

```text
feat: save observation results through webmcp
```

## Checkpoint MCP-J：Results画面遷移と統合

目的：保存した実測結果を人間がResults画面で確認できるようにする。

### Red

- `open_observation_results`を登録する。
- 指定MissionのRecordを選択してResultsを開く。
- mission省略時は選択中、次に最新Recordを使う。
- Recordなし、未知missionを`RESULT_NOT_FOUND`にする。
- 成功結果に選択missionと比較summaryを含む。
- Tool実行後も全12 Toolが登録されたままである。
- 全Tool名に重複がない。

### Green

- Toolを実装し、`selectRecord`と`setView("results")`へ接続する。
- `registeredToolNames`を実際の12 Toolと一致させる。
- 必要ならTool群の逐次登録を小さな登録関数へ整理する。ただし既存契約を変えない。

### 手動統合確認

1. アプリをPlan画面で起動する。
2. `set_observation_site`で地点を変更する。
3. `set_sky_view_settings`で日時と方向を変更する。
4. `set_sky_display_settings`で1〜2等星だけを有効にする。
5. `open_sky_view`でSkyを表示する。
6. `get_current_sky_state`が画面条件と一致することを確認する。
7. `predict_visible_stars`で候補を得る。
8. `create_observation_plan`で2〜5星のMissionを作る。
9. `save_observation_results`へユーザーが報告した3値を渡す。
10. `open_observation_results`でResultsを表示する。
11. `get_observation_results`と`compare_prediction_and_observation`が画面と一致することを確認する。
12. Plan、Sky、Resultsを移動しても全Toolが利用可能なことを確認する。
13. リロード後にもMissionとRecordが残ることを確認する。

### 完了条件

```text
npm run build  PASS
npm run verify PASS
git diff --check PASS
12 Tool registered
3分デモの一連操作が成立
```

コミット：

```text
feat: open saved observation results through webmcp
```

## 8. 非回帰テスト一覧

各Checkpointで`npm run verify`が次を維持すること。

- 既存天体位置計算と可視候補計算。
- 初期の表示等級レイヤーが1〜2等星。
- Missionは最大5 target。
- Mission作成時点の予測高度・方位・等級・可視性が固定される。
- 既存UIからのResult入力と保存。
- 比較集計で`unsure`をmatch rateの分母から除外する既存仕様。
- LocalStorageの欠落、不正JSON、不正shape、旧データでクラッシュしない。
- WebMCP非対応ブラウザでもアプリ本体が動く。
- WebMCP Toolが最新stateを読み、画面遷移で消えない。
- 実験Snapshotが画面遷移後もProviderに保持される既存レビュー修正。

## 9. 今回実装しないもの

- CanvasのPNGを永続保存する`capture_sky_snapshot`。
- Snapshot一覧、再ダウンロード、Missionとの画像関連付け。
- AgentへCanvas画像そのものを返す仕組み。
- Horizon Profileと遮蔽物判定。
- Weather API、光害外部API。
- 写真からの緯度経度取得、EXIF抽出、画像認識。
- 1星ずつ未完成draftを保存するMCP Tool。
- Mission自体の編集・削除Tool。
- 汎用`navigate_app` Tool。

画像Snapshotは`docs/webmcp-implementation-plan.md`のSNAP-A/SNAP-Bに別計画として存在する。今回の「保存系」は観測結果をResults画面へ出すための`ObservationRecord`保存を指す。画像Snapshotを同時に実装してCheckpointを混在させない。

## 10. lunaの最終報告形式

```markdown
## 実装結果

### 完了したCheckpoint
- MCP-E: ...
- MCP-F: ...

### 登録Tool
- 既存6 Tool
- 新規6 Tool

### 変更ファイル
- path: 変更理由

### 設計上の判断
- React stateの非同期更新をどう回避したか
- 地点をObservationとSkyへどう同期したか
- display layerとMission maxMagnitudeをどう分離したか
- lightPollutionとlimitingMagnitudeの適用順

### TDD
- 各CheckpointのRedで確認した失敗
- Greenで追加した最小実装

### テスト結果
- npm run build: PASS/FAIL
- npm run verify: PASS/FAIL
- 手動統合確認: PASS/FAIL

### コミット
- hash message

### 残課題
- 未実装事項
- 既知の制約
```
