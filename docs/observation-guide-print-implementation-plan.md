# Observation Guide / Mission Sky Snapshot 実装計画書

最終更新：2026-08-29

この文書は、InteractiveStarLabへ「Mission日時の星空Snapshotを含む、屋外観測用のA4一枚のObservation Guide」を追加するための、GPT-5.6 Luna向け実装仕様である。

今回のMVPでは、内蔵ブラウザからネイティブ印刷ダイアログを操作できない環境を考慮し、PDFバイナリをアプリ内で直接生成する。印刷専用HTMLとSVGも残し、人間向けの印刷フォールバックとして提供する。

---

## 0. 最初に必ず守ること

- 実装はTDDで行う。各CheckpointでRed、Green、Refactorの順序を守る。
- 最初から全Checkpointをまとめて変更しない。
- Checkpointごとに独立したコミットを作成する。
- 各Checkpoint完了時に`npm run build`と`npm run verify`を実行する。
- 新しい検証スクリプトを`npm run verify`へ追加し、既存検証も毎回すべて通す。
- 既存の星空ビューア、天体計算、Mission、観測結果、Snapshot、WebMCPを壊さない。
- 既存のユーザー変更を上書きしない。
- 新しいnpm依存を追加しない。
- 既存15個のWebMCP Toolを削除、改名、非登録化しない。
- 今回追加するWebMCP Toolは原則`generate_observation_guide`の1個だけとする。
- `planId`という新しい識別子を導入しない。既存の`missionId`へ統一する。
- Mission作成時に固定された地点、日時、予測高度、予測方位、予測等級、`predictedVisible`を再計算・上書きしない。
- Guide生成時に現在のSky Canvasを撮影しない。
- Guide生成へ既存`capture_sky_snapshot`を流用しない。
- Sky画面の表示用等級レイヤーとMissionの`maxMagnitude`を混同しない。
- Guideの周辺星表示条件はGuide専用の定数として定義する。
- PNG、PDF、base64、SVG全文などの大きなデータをLocalStorageへ保存しない。
- 生成したPDFはLocalStorageへ保存せず、Blobと一時的な`blob:` URLでダウンロードする。
- LocalStorageの不正Guideデータでアプリをクラッシュさせない。
- WebMCP非対応ブラウザでも通常UIとPDF保存・印刷Guideを利用できるようにする。
- Horizon、Weather、写真、EXIF、画像認識、PDFフォームは今回実装しない。
- MCP Toolから`window.print()`を実行しない。PDF生成とダウンロードはMCPから行い、ネイティブ印刷は人間向けフォールバックボタンだけで実行する。
- 実装後に変更ファイル、設計上の判断、テスト結果、手動確認結果、残課題を報告する。

推奨コミット単位：

```text
feat: add observation guide domain model
feat: render mission-time sky snapshot
feat: add printable observation guide screen
feat: connect missions to observation guides
feat: prepare observation guides through webmcp
test: verify observation guide print workflow
```

---

## 1. 目的

ユーザーが屋外へPCを持っていかなくても、印刷した紙だけで次の行動を行えるようにする。

```text
Mission日時・地点を確認
↓
Mission Sky Snapshotで星の位置を探す
↓
番号付きの対象星を確認する
↓
Visible / Not Visible / Unsureへ手書きする
↓
帰宅後、必要に応じてWeb UIへ観測結果を入力する
```

この機能の中心はPDFファイルそのものではない。

```text
Mission作成時の予測
↓
持ち出せる印刷用Guide
↓
人間による実際の観測
```

を成立させることである。

---

## 2. MVPの定義

### 生成物

```text
A4 Portrait
1 page
Print-ready HTML
Inline SVG Mission Sky Snapshot
Directly generated PDF Blob
```

### PDF化

MVPの主経路は次の方式とする。

```text
Mission Guide Model
↓
クライアント側PDF writer
↓
PDF Blob
↓
ブラウザのダウンロード
```

画面上の主ボタン名：

```text
PDFを直接保存
Save PDF directly
```

印刷フォールバックとして次のボタンも残す。

```text
印刷 / PDF保存
Print / Save as PDF
```

PDF writerは新しいnpm依存を使わず、A4一枚のベクターPDFを生成する。PDF内の星図はMission Sky Snapshotのモデルから再描画する。

### ブラウザ制約

- PDF直接保存は`Blob`と`URL.createObjectURL`で行い、ネイティブ印刷ダイアログを必要としない。
- 印刷フォールバックのダイアログは`window.print()`で開く。
- `window.print()`はGuide画面の人間向けボタンからだけ呼ぶ。
- ブラウザの印刷ヘッダー・フッターをアプリから完全には制御できない。
- Guide画面にPDF直接保存が主経路であることを表示する。
- `document.title`をファイル名候補へ一時変更してよいが、保存ファイル名はブラウザ依存である。

---

## 3. 既存実装との関係

### 再利用するもの

| 既存実装 | 利用目的 |
|---|---|
| `ObservationMission` | Guideの元データ |
| `mission.siteSnapshot` | Mission作成時点の地点 |
| `mission.dateTime` | Mission対象日時 |
| `mission.targets` | 固定済み予測値 |
| `STAR_BY_ID` | `starId`から星名を解決 |
| `STARS` | 周辺参照星を計算 |
| `CONSTELLATIONS` | 必要最小限の星座線 |
| `horizontalStars()` | Mission日時・地点の周辺星位置計算 |
| `ObservationProvider` | Mission取得と選択状態 |
| `NavigationProvider` | Guide画面への遷移 |
| WebMCP Providerのref方式 | 最新Guide状態をToolから読む |

### 利用しないもの

Guide生成では次を利用しない。

| 利用しないもの | 理由 |
|---|---|
| 現在表示中のSky Canvas | Mission時点とは限らない |
| `capture_sky_snapshot` | 現在CanvasのPNG撮影用である |
| 現在の`activeSite` | Mission作成後に変更される可能性がある |
| 現在のSky日時 | Mission対象日時と異なる可能性がある |
| 現在の方位・高度・FOV | Missionに固定されていない |
| 現在の星表示レイヤー | Mission候補の`maxMagnitude`と別概念 |
| Snapshot IndexedDB | Guide SVGはMissionから再生成できる |

### 既存WebMCP

現在は15 Toolが登録されている。今回のデモでは次を利用する。

```text
get_current_sky_state
predict_visible_stars
create_observation_plan
generate_observation_guide  ← 新規
get_observation_results
```

登録Tool数は15から16になる。

次の重複Toolは追加しない。

```text
get_observation_context
```

現在地点・日時・Sky状態は既存`get_current_sky_state`または`get_observation_site`で取得できる。

---

## 4. 重要な設計判断

### 4.1 Mission Snapshotを唯一の基準にする

対象星は必ずMissionへ保存済みの値を使う。

```typescript
type ObservationTarget = {
  starId: string
  predictedVisible: boolean
  predictedAltitude: number
  predictedAzimuth: number
  predictedMagnitude: number
}
```

Guide生成時に対象星について天体計算をやり直さない。

周辺参照星だけは、次を使ってMission日時の位置を計算する。

```text
mission.siteSnapshot
mission.dateTime
STARS
horizontalStars()
```

### 4.2 Guide用SnapshotはSVG

Guide内のMission Sky SnapshotはインラインSVGで描画する。

理由：

- 印刷時に文字、星、方位線が鮮明。
- A4へ拡大してもぼやけない。
- Canvasのマウント状態へ依存しない。
- PNG Blobを保存する必要がない。
- Missionから決定的に再生成できる。

### 4.3 全天図を使用する

既存Sky Viewerの特定方向・FOVをそのまま印刷すると、東西に離れた5対象が一枚に入らない可能性がある。

MVPでは全天極座標図を使用する。

```text
地平線 = 外周
天頂 = 中心
北 = 上
東 = 左
南 = 下
西 = 右
```

紙面へ次の説明を印刷する。

```text
星図を頭上に掲げ、観測する方角を下側に向けてください。
Hold the chart overhead and place the direction you face at the bottom.
```

### 4.4 紙面は白黒でも成立させる

- 白背景を基本とする。
- 周辺星は黒または濃い灰色。
- 対象星は太い二重丸と1〜5の番号で強調する。
- 色だけで対象を区別しない。
- 星座線は細い灰色。
- チェック欄はCSS装飾ではなく印刷可能な四角形またはUnicodeを使う。

### 4.5 チェック欄を重複させない

対象詳細とObservation Checklistを別々に表示しない。

各対象行へ統合する。

```text
1 Vega  Mag 0.03  Alt 62°  West  Easy
  □ Visible  □ Not Visible  □ Unsure
```

これにより5対象でもA4一枚へ収める。

---

## 5. データ型

### 5.1 Guide Descriptor

LocalStorageへ保存するのは小さなDescriptorだけとする。

```typescript
type ObservationGuideDescriptor = {
  guideId: string
  missionId: string
  title: string
  durationMinutes: number
  timeZone: string
  createdAt: string
}
```

MVPでは1 Missionにつき1 Guideとする。

```typescript
guideId = `guide-${missionId}`
```

同じMissionでGuideを再生成した場合はDescriptorを更新する。

### 5.2 Guide Target

```typescript
type GuideDifficulty = "easy" | "medium" | "hard"

type ObservationGuideTarget = {
  index: number
  starId: string
  name: string
  nameJa?: string
  magnitude: number
  altitude: number
  azimuth: number
  direction: string
  difficulty: GuideDifficulty
  predictedVisible: boolean
}
```

`index`は1から開始し、Sky Snapshotの番号と対象一覧の番号で一致させる。

### 5.3 Sky Snapshot Model

```typescript
type GuideMapStar = {
  starId: string
  name: string
  nameJa?: string
  magnitude: number
  altitude: number
  azimuth: number
  x: number
  y: number
  targetIndex?: number
}

type GuideMapLine = {
  constellationId: string
  x1: number
  y1: number
  x2: number
  y2: number
}

type MissionSkySnapshotModel = {
  missionId: string
  siteSnapshot: ObservationSite
  dateTime: string
  projection: "all_sky"
  width: number
  height: number
  targetStars: GuideMapStar[]
  referenceStars: GuideMapStar[]
  constellationLines: GuideMapLine[]
}
```

### 5.4 完成Guide Model

```typescript
type ObservationGuideModel = {
  descriptor: ObservationGuideDescriptor
  site: ObservationSite
  dateTime: string
  endDateTime: string
  locationText: string
  timeZoneLabel: string
  primaryDirection: string
  targets: ObservationGuideTarget[]
  skySnapshot: MissionSkySnapshotModel
}
```

---

## 6. Guide生成ルール

### 6.1 初期値

```typescript
title = "Star Observation Guide"
durationMinutes = 30
timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
```

### 6.2 入力制限

```text
title: 1〜80文字
durationMinutes: 5〜180の整数
timeZone: Intl.DateTimeFormatで解釈できるIANA timezone
target count: 1〜5
```

IANA timezoneの検証は、新規依存を追加せず次のような処理で行う。

```typescript
new Intl.DateTimeFormat(undefined, { timeZone })
```

例外になった場合は不正入力とする。

### 6.3 日時表示

- 開始時刻は`mission.dateTime`。
- 終了時刻は開始時刻へ`durationMinutes`を加算する。
- 表示にはDescriptorの`timeZone`を使う。
- 紙面へtimezone名も表示する。
- MissionのISO日時そのものは変更しない。

例：

```text
Date: August 29, 2026
Time: 20:00–20:30
Time zone: Asia/Tokyo
```

### 6.4 地点表示とプライバシー

紙面には地点名と、小数2桁へ丸めた緯度経度を表示する。

```text
Home (35.68, 139.76)
```

ファイル名候補へ緯度経度は入れない。

### 6.5 方角ラベル

対象ごとの方角は8方位で表示する。

```text
N / NE / E / SE / S / SW / W / NW
```

境界は45°を8分割する。

```typescript
index = Math.round(normalizedAzimuth / 45) % 8
```

`azimuth`は0〜360へ正規化してから変換する。

### 6.6 難易度

WeatherやHorizonは使用せず、Mission固定等級と高度だけで初心者向け目安を算出する。

```typescript
if (magnitude <= 1.5 && altitude >= 25) {
  return "easy"
}

if (magnitude > 3 || altitude < 15) {
  return "hard"
}

return "medium"
```

Guideへ次の注意を小さく表示する。

```text
Difficulty is a simple estimate based on brightness and altitude.
Weather and local obstacles are not included.
```

### 6.7 Primary Direction

対象方位の円平均から主方向を計算する。

ただし、対象の方位分布が広すぎる場合は誤解を避けるため次を表示する。

```text
Multiple directions
```

MVPの判定例：

- 全対象が120°以内に収まる場合：円平均を8方位へ変換。
- 120°を超えて分散する場合：`Multiple directions`。

全天図そのものには全対象を必ず表示する。

---

## 7. Mission Sky Snapshot仕様

### 7.1 投影

SVG内部座標は次を推奨する。

```text
viewBox="0 0 1000 1000"
center = 500, 500
horizonRadius = 440
```

北を上、東を左にするため、投影式は次とする。

```typescript
const normalizedRadius = (90 - altitude) / 90
const radius = horizonRadius * normalizedRadius
const angle = azimuth * Math.PI / 180

const x = centerX - radius * Math.sin(angle)
const y = centerY - radius * Math.cos(angle)
```

期待位置：

| 方位・高度 | 位置 |
|---|---|
| Az 0°, Alt 0° | 外周上側 N |
| Az 90°, Alt 0° | 外周左側 E |
| Az 180°, Alt 0° | 外周下側 S |
| Az 270°, Alt 0° | 外周右側 W |
| Alt 90° | 中央、天頂 |

高度が0未満の周辺星は表示しない。

### 7.2 対象星

対象星の位置は次をそのまま使う。

```text
target.predictedAltitude
target.predictedAzimuth
```

対象星の表示：

- 太い外円。
- 内側の星点。
- 1〜5の番号。
- 星名。
- 白黒印刷で判別可能。
- 対象星は周辺星の表示上限に関係なく必ず表示。

### 7.3 周辺参照星

Guide専用定数を定義する。

```typescript
GUIDE_REFERENCE_MAX_MAGNITUDE = 3
GUIDE_REFERENCE_STAR_LIMIT = 60
GUIDE_REFERENCE_LABEL_MAX_MAGNITUDE = 1.5
```

選択条件：

```text
altitude > 0
magnitude <= GUIDE_REFERENCE_MAX_MAGNITUDE
```

ソート：

```text
magnitude昇順
同値ならaltitude降順
```

対象星と重複する周辺星は1回だけ描画する。

現在のSky画面の等級レイヤーは使用しない。

### 7.4 星のサイズ

印刷用SVG専用関数を使用する。

例：

```typescript
radius = clamp(4.5 - magnitude, 1.2, 4.5)
```

既存Canvasのglowやgradientは印刷SVGへ持ち込まない。

### 7.5 星名

表示する名前：

- 全対象星。
- 周辺星は`magnitude <= 1.5`の主要星だけ。

重なり回避は完全でなくてよいが、最低限次を行う。

- 対象ラベルを周辺ラベルより優先。
- 対象番号を最優先。
- SVG外へラベルを出さない。
- 同一点付近の周辺ラベルは省略してよい。

### 7.6 星座線

- `CONSTELLATIONS`を利用する。
- 両端の星が地平線上かつSnapshotモデルに含まれる場合だけ描画する。
- 線は薄い灰色。
- 対象星の二重丸や番号より背面へ描画する。
- 星座名の表示はMVPでは不要。

### 7.7 方位と凡例

必須：

```text
N / NE / E / SE / S / SW / W / NW
Zenith
Horizon
Magnitude legend
Target marker legend
```

### 7.8 Snapshotの決定性

同じMissionとGuide設定から、常に同じSVGモデルを生成する。

次を変更してもMission Sky Snapshotが変化してはいけない。

```text
activeSite
現在のSky日時
現在の方位・高度・FOV
Sky表示レイヤー
光害設定
昼光モード
observer sensitivity
現在選択中の星
現在の画面
```

---

## 8. A4一枚のレイアウト

### Page

```css
@page {
  size: A4 portrait;
  margin: 8mm;
}
```

印刷可能領域の目安：

```text
194mm × 281mm
```

### 推奨構成

```text
┌──────────────────────────────────┐
│ STAR OBSERVATION GUIDE           │
│ Date / Time / Site / Direction   │
├──────────────────────────────────┤
│                                  │
│      MISSION SKY SNAPSHOT        │
│                                  │
│          全天SVG星図              │
│                                  │
├──────────────────────────────────┤
│ 1 Vega   Mag 0.03 Alt 62° W      │
│   □ Visible □ Not Visible □ ?    │
│ 2 Altair ...                     │
│ 3 Deneb ...                      │
├──────────────────────────────────┤
│ Weather: _______________________ │
│ Notes:   _______________________ │
└──────────────────────────────────┘
```

目安：

```text
Header: 24〜30mm
Sky Snapshot: 110〜125mm
Target table: 70〜90mm
Notes: 残り領域
```

対象5個でも必ず1ページへ収める。

### Header

```text
STAR OBSERVATION GUIDE
Title
Date
Time range
Time zone
Location name
Latitude / Longitude rounded to 2 decimals
Primary direction or Multiple directions
```

### Target Table

各行：

```text
番号
星名
等級
高度
方角
難易度
□ Visible
□ Not Visible
□ Unsure
```

### Notes

```text
Weather: ______________________________

What did you notice?
_______________________________________
_______________________________________
```

### Print CSS

印刷時に非表示：

```text
アプリ共通ヘッダー
ナビゲーション
WebMCP Status
Guide操作ボタン
画面用説明
```

印刷時に必須：

```text
Guide本体のみ
白背景
黒文字
SVG
チェック欄
Notes罫線
```

次を指定する。

```css
break-inside: avoid;
page-break-inside: avoid;
print-color-adjust: exact;
-webkit-print-color-adjust: exact;
```

ただし色に依存しない設計を維持する。

---

## 9. 通常UI

### Guide画面

新しい`AppView`を追加する。

```typescript
type AppView =
  | "plan"
  | "observe"
  | "results"
  | "history"
  | "sky"
  | "snapshots"
  | "guide"
```

Guideはヘッダーの常設メニューへ追加しない。

次の導線だけで開く。

- Observe画面のMission概要。
- Guide準備完了表示。
- WebMCPの`generate_observation_guide`。

### Observe画面

Missionが存在する場合：

```text
[ 観測ガイドを作る ]
```

Guide作成済み：

```text
[ 観測ガイドを表示 ]
```

### Guide画面の操作

```text
[ 印刷 / PDF保存 ]
[ 観測画面へ戻る ]
```

Guide画面を開いた時点では印刷ダイアログを自動表示しない。

### Guide Provider

`GuideProvider`は`ObservationProvider`の内側かつ`WebMcpProvider`の外側へ配置する。

責務：

```text
Guide Descriptor一覧
選択中Guide ID
Guide生成・更新
MissionからGuide Model構築
Guide選択
安全なLocalStorage保存
```

WebMCP Toolが古いReact stateを参照しないよう、既存Providerと同じref方式を使用する。

---

## 10. Guide Storage

別のLocalStorageキーを使用する。

```typescript
GUIDE_STORAGE_KEY = "star-view.observation-guides.v1"
```

```typescript
type PersistedGuideState = {
  version: 1
  descriptors: ObservationGuideDescriptor[]
  selectedGuideId: string | null
}
```

保存しないもの：

```text
SVG全文
HTML全文
PNG
PDF
Blob URL
base64
周辺星座標配列
```

これらはMissionとDescriptorから毎回再構築する。

不正データ対応：

- JSON parse失敗で空状態。
- version不一致で空状態。
- 不正`guideId`を無視。
- 不正`missionId`を無視。
- titleが空、または80文字超過なら無効。
- durationが範囲外なら無効。
- timezoneが不正なら無効。
- 不正データでUIやWebMCPをクラッシュさせない。

---

## 11. WebMCP仕様

### 11.1 既存Toolの再利用

#### get_current_sky_state

現在の地点・日時をAgentが取得する。

#### predict_visible_stars

既存入力名を維持する。

```json
{
  "dateTime": "2026-08-29T11:00:00.000Z",
  "maxMagnitude": 2,
  "limit": 10
}
```

`maxResults`へ改名しない。

後方互換な追加項目として、候補結果へ次を追加してよい。

```json
{
  "direction": "W",
  "difficulty": "easy"
}
```

Guideと同じ純粋関数を共有し、MCP独自の難易度ロジックを作らない。

#### create_observation_plan

既存契約を維持する。

```json
{
  "dateTime": "2026-08-29T11:00:00.000Z",
  "maxMagnitude": 2,
  "starIds": ["vega", "altair", "deneb"]
}
```

Guideのtitle、duration、timezoneはこのToolへ混ぜず、Guide Toolへ渡す。

#### get_observation_results

既存`missionId`を使用する。

### 11.2 新規Tool：generate_observation_guide

Tool種別：

```text
Write
```

理由：

- Guide Descriptorを保存する。
- 選択Guideを更新する。
- Guide画面へ遷移する。

入力：

```typescript
generate_observation_guide({
  missionId,
  title?,
  durationMinutes?,
  timeZone?
})
```

JSON Schema：

```json
{
  "type": "object",
  "properties": {
    "missionId": {
      "type": "string"
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "durationMinutes": {
      "type": "integer",
      "minimum": 5,
      "maximum": 180
    },
    "timeZone": {
      "type": "string"
    }
  },
  "required": ["missionId"],
  "additionalProperties": false
}
```

成功返却：

```json
{
  "ok": true,
  "data": {
    "guideId": "guide-mission-id",
    "missionId": "mission-id",
    "status": "ready",
    "view": "guide",
    "fileNameHint": "observation-guide-20260829.pdf",
    "pdfGenerated": true,
    "downloadAvailable": true,
    "downloadUrl": "blob:https://example.invalid/guide",
    "snapshotIncluded": true,
    "snapshotSource": "mission",
    "snapshotDateTime": "2026-08-29T11:00:00.000Z",
    "targetCount": 3,
    "actionRequired": "PDF download started"
  }
}
```

返さないもの：

```text
PDF Blob本体
SVG全文
HTML全文
data URL
base64
（Tool結果へは一時`blob:`ダウンロードURLのみ返してよい）
```

想定エラー：

```text
INVALID_ARGUMENT
MISSION_NOT_FOUND
GUIDE_STORAGE_UNAVAILABLE
```

存在しないMissionの場合、Guide画面を開かない。

### 11.3 Tool description

Tool descriptionへ次を明記する。

- Mission作成時点の地点、日時、予測位置を使う。
- 印刷用HTMLとSVG、およびA4 PDFバイナリを準備する。
- PDFバイナリ本体は返さず、一時`blob:`ダウンロードURLとファイル名を返す。
- Tool実行時にブラウザのダウンロードを開始する。
- ネイティブ印刷が必要な場合は人間がGuide画面からPrint / Save as PDFを実行する。
- Guide metadataには観測地点情報が含まれる。

### 11.4 登録

`registeredToolNames`へ追加する。

```text
generate_observation_guide
```

登録数表示は16になる。

Providerの画面切り替えでToolが消えないこと。

---

## 12. ファイル構成案

```text
src/
  guides/
    types.ts
    difficulty.ts
    direction.ts
    time.ts
    storage.ts
    model.ts
    skyProjection.ts
    missionSkySnapshot.ts
    pdf.ts

  components/
    guides/
      MissionSkySnapshot.tsx
      ObservationGuideScreen.tsx
      GuideTargetTable.tsx
      GuideNotes.tsx

  state/
    guides.tsx

  mcp/
    guideTools.ts

scripts/
  verify-guides.ts
  verify-guide-snapshot.ts
  verify-guide-pdf.ts
```

既存変更候補：

```text
src/App.tsx
src/state/navigation.tsx
src/state/webmcp.tsx
src/components/observation/ObservationRunScreen.tsx
src/mcp/contracts.ts
src/mcp/services.ts
src/styles.css
package.json
```

`StarCanvas.tsx`と`starRender.ts`は原則変更しない。

Guide Snapshot用SVGは別レンダラーとし、既存Canvas描画を壊さない。

---

## 13. Checkpoint G1：GuideドメインとStorage

### Red

- MissionからGuide Targetを生成できる。
- 対象番号が1からMission順に付く。
- 星名を`STAR_BY_ID`から解決できる。
- Mission固定高度、方位、等級を保持する。
- 方角8分割の境界値が正しい。
- 難易度境界が正しい。
- 開始時刻とdurationから終了時刻を計算できる。
- 指定timezoneで時刻表示できる。
- 不正timezoneを拒否する。
- titleとdurationを検証する。
- Descriptorを保存、一覧、取得、更新できる。
- 同じMissionのGuideをupsertできる。
- 不正JSONで空状態へ戻る。
- 不正versionで空状態へ戻る。
- LocalStorage利用不可でもクラッシュしない。

### Green

```text
guides/types.ts
guides/difficulty.ts
guides/direction.ts
guides/time.ts
guides/storage.ts
guides/model.ts
scripts/verify-guides.ts
```

### Refactor

- UIやReactをGuide純粋関数へimportしない。
- 難易度と方角変換をGuide UIとMCPで共有する。
- DTOをdeep cloneし、Mission参照を直接変更しない。

### 完了条件

```text
npm run build
npm run verify
```

コミット：

```text
feat: add observation guide domain model
```

---

## 14. Checkpoint G2：Mission Sky Snapshot Model

### Red

- Mission地点・日時から周辺星を計算できる。
- 対象星は再計算値ではなくMission固定高度・方位を使う。
- 現在の`activeSite`を変えてもSnapshotが変化しない。
- 現在のSky日時を変えてもSnapshotが変化しない。
- Sky画面が開かれていなくても生成できる。
- Canvasが存在しなくても生成できる。
- 1〜5対象がすべてMap内に入る。
- Alt 0°が地平線外周になる。
- Alt 90°が中央になる。
- Nが上、Eが左、Sが下、Wが右になる。
- 高度0以下の周辺星を除外する。
- 周辺星が等級上限と件数上限を守る。
- 対象星を周辺星と重複描画しない。
- 星座線は両端が表示対象の場合だけ作成する。
- 座標にNaN、Infinityを含めない。
- 入力Missionを変更しない。

### Green

```text
guides/skyProjection.ts
guides/missionSkySnapshot.ts
scripts/verify-guide-snapshot.ts
```

### Refactor

- Canvas API、DOM API、Reactへ依存させない。
- ProjectionとSnapshot選択ロジックを分離する。
- Guide専用等級定数を一か所へ集約する。

### 完了条件

同じMissionから決定的な`MissionSkySnapshotModel`を取得できる。

```text
npm run build
npm run verify
```

コミット：

```text
feat: render mission-time sky snapshot
```

---

## 15. Checkpoint G3：SVGとA4 Guide画面

### Red

- Snapshot ModelからSVGを表示できる。
- 対象番号と対象表の番号が一致する。
- 対象星を太い二重丸で表示する。
- 白黒でも対象と周辺星を区別できる。
- N/E/S/Wと地平線・天頂を表示する。
- 1、3、5対象でGuide構造を生成できる。
- 印刷時に共通ヘッダーと操作ボタンを非表示にする。
- Guideの各主要ブロックをページ分割しない。
- `window.print()`はボタン操作時だけ呼ぶ。

### Green

```text
components/guides/MissionSkySnapshot.tsx
components/guides/GuideTargetTable.tsx
components/guides/GuideNotes.tsx
components/guides/ObservationGuideScreen.tsx
state/navigation.tsxへ"guide"追加
App.tsxへGuide画面追加
styles.cssへscreen/print CSS追加
```

### Refactor

- Guide表示用DTOだけをComponentへ渡す。
- Component内で天体計算を行わない。
- 印刷CSSと通常画面CSSを明確に分ける。

### 手動確認

Chrome印刷プレビューで次を確認する。

```text
A4
Portrait
Scale 100%
1 page
1 target
3 targets
5 targets
日本語文字化けなし
チェック欄表示
SVGの番号表示
白黒プレビューで判別可能
```

`verify:layout`は既存環境のPlaywright固定パス問題があるため、修復をこのCheckpointへ混ぜない。利用可能な場合だけ補助確認に使う。

### 完了条件

```text
npm run build
npm run verify
```

コミット：

```text
feat: add printable observation guide screen
```

---

## 16. Checkpoint G4：Guide Providerと通常UI導線

### Red

- Mission IDからGuideを準備できる。
- Missionがない場合はGuideを作成しない。
- Guide準備後に選択Guideが更新される。
- Guide Descriptorがリロード後も残る。
- DescriptorからGuide Modelを再構築できる。
- Missionが見つからないDescriptorでクラッシュしない。
- 現在のSky設定変更で既存Guide内容が変化しない。

### Green

```text
state/guides.tsx
App Provider treeへGuideProvider追加
ObservationRunScreenへGuideボタン追加
Guide画面への遷移
Guide画面からObserveへ戻る導線
```

### Provider順序

概念上、次を満たすこと。

```text
ObservationProvider
  NavigationProvider
    GuideProvider
      SnapshotProvider
        WebMcpProvider
```

既存Provider間の依存を確認し、必要最小限の変更にする。

### 完了条件

人間がMission概要からGuideを開き、印刷画面を表示できる。

```text
npm run build
npm run verify
```

コミット：

```text
feat: connect missions to observation guides
```

---

## 17. Checkpoint G5：WebMCP

### Red

- `generate_observation_guide`を登録する。
- 必須`missionId`を検証する。
- 追加プロパティを拒否する。
- 存在しないMissionを`MISSION_NOT_FOUND`で拒否する。
- titleの空文字と80文字超過を拒否する。
- durationの小数、範囲外を拒否する。
- 不正timezoneを拒否する。
- 省略値でtitle、duration、timezoneの初期値を使う。
- Tool実行後にGuideを選択する。
- Tool実行後にGuide画面を開く。
- Mission予測Snapshotを変更しない。
- Tool結果へSVG全文、PDF Blob、base64、data URLを含めない。
- Tool結果へ一時`blob:`ダウンロードURLを含め、PDFダウンロードを開始する。
- 返却値に`snapshotSource: "mission"`を含める。
- Tool descriptionがPDF直接生成・ダウンロードと、印刷フォールバックを説明する。
- Tool登録数が16になる。
- 画面遷移後もToolが登録されたままである。
- 古いReact stateを参照しない。

### Green

```text
mcp/guideTools.ts
state/webmcp.tsxへGuide state ref追加
registeredToolNamesへ追加
scripts/verify-webmcp.tsへGuide Tool検証追加
```

必要なら既存`predict_visible_stars`のDTOへ`direction`と`difficulty`を後方互換で追加する。

### Refactor

- Tool validationとGuide domain validationを重複させない。
- Tool execute内でSVGを文字列化しない。
- Tool execute内で`window.print()`しない。

### 完了条件

次の会話でGuide画面が開く。

```text
User:
Create an observation guide for five easy-to-find stars tonight.

Agent:
get_current_sky_state
predict_visible_stars
create_observation_plan
generate_observation_guide

Application:
Observation Guide Ready
[ Print / Save as PDF ]
```

```text
npm run build
npm run verify
```

コミット：

```text
feat: prepare observation guides through webmcp
```

---

## 18. Checkpoint G6：統合・監査・デモ

### 自動検証

```text
npm run build
npm run verify
git diff --check
```

確認項目：

- 既存天体計算テストがすべて成功する。
- 既存Mission/Result/Snapshot/WebMCPテストがすべて成功する。
- Guideテストが`npm run verify`へ含まれる。
- 新しいnpm依存が追加されていない。
- 既存15 Toolが残っている。
- 新規Guide Toolを含めて16 Toolになる。
- WebMCP非対応ブラウザでGuide UIが動く。
- LocalStorage不正データでクラッシュしない。

### Mission不変性確認

1. Missionを作成する。
2. Guideを生成する。
3. 現在地点を東京からSydneyへ変更する。
4. 現在日時を6時間変更する。
5. Sky表示レイヤーと光害設定を変更する。
6. Guideを再表示する。
7. 対象星の高度、方位、等級、番号、Snapshot位置が変わっていないことを確認する。

### 印刷確認

- A4 Portrait 1ページ。
- 5対象が収まる。
- Mission Sky Snapshotが紙面で十分大きい。
- 対象番号とチェック行が一致する。
- 方位ラベルが読める。
- 白黒印刷で対象を識別できる。
- チェック欄へ鉛筆で記入できる大きさ。
- Notes欄へ手書きできる。
- アプリのヘッダー、ナビ、MCP Status、ボタンが印刷されない。

### コミット

```text
test: verify observation guide print workflow
```

---

## 19. 3分デモ

### 観測前

```text
User:
今夜30分で観察しやすい星を5個選んで、観測用Guideを作って。

Agent:
get_current_sky_state

Agent:
predict_visible_stars({
  dateTime,
  maxMagnitude: 2,
  limit: 10
})

Agent:
create_observation_plan({
  dateTime,
  maxMagnitude: 2,
  starIds
})

Agent:
generate_observation_guide({
  missionId,
  durationMinutes: 30,
  timeZone: "Asia/Tokyo"
})
```

画面：

```text
STAR OBSERVATION GUIDE

Mission日時の全天Snapshot
対象番号1〜5
対象チェック欄
Notes

[ 印刷 / PDF保存 ]
[ PDFを直接保存 ]
```

`PDFを直接保存`はネイティブ印刷画面を開かず、生成済みPDFをダウンロードする。必要なら人間が`印刷 / PDF保存`を使う。

### 屋外

```text
紙の全天図を見る
↓
対象番号を探す
↓
Visible / Not Visible / Unsureへチェック
↓
天候や気づきをNotesへ記入
```

屋外ではPCを使用しない。

### 観測後

帰宅後、人間がWeb UIへ結果を入力する。

```text
User:
観測結果をまとめて。

Agent:
get_observation_results({ missionId })
```

紙の手書き結果は自動同期しない。

---

## 20. 最終受け入れ条件

- MissionからA4 Portrait一枚のGuideを表示できる。
- Guide画面の操作とWebMCPの両方からA4 PDF Blobを直接生成できる。
- 内蔵ブラウザでネイティブ印刷ダイアログを操作できなくてもPDFを保存できる。
- GuideにMission日時の静的な全天Sky Snapshotがある。
- 対象星1〜5が太い二重丸と番号で強調される。
- 対象番号とチェックリスト番号が一致する。
- 周辺主要星、地平線、天頂、8方位を表示する。
- 対象高度・方位・等級はMission作成時点の固定値である。
- Guideは現在のSky Canvasへ依存しない。
- Guideは現在地点、日時、表示レイヤー変更の影響を受けない。
- Sky画面を開かずにGuideを生成できる。
- SVGやPDFをLocalStorageへ保存しない。
- LocalStorage不正データでクラッシュしない。
- `generate_observation_guide`からGuide画面を開ける。
- ToolがPDF Blob本体、SVG全文、base64、data URLを返さない。
- Toolが一時`blob:` URLを返し、PDFダウンロードを開始する。
- ネイティブ印刷は人間の操作によるフォールバックとして利用できる。
- 印刷時にGuide以外のUIが消える。
- 5対象でもA4一枚に収まる。
- 白黒印刷でも対象を識別できる。
- 新しいnpm依存がない。
- 既存15 WebMCP Toolが維持され、合計16 Toolになる。
- `npm run build`と`npm run verify`が成功する。
- Checkpointごとのコミットが存在する。

---

## 21. 今回実装しないもの

```text
PDFフォーム
複数ページGuide
方向別の複数Sky Map
現在CanvasのScreenshot流用
Guide SVGのSnapshot履歴保存
QRコード
紙の結果のOCR
紙の結果の自動同期
Weather
Horizon Profile
Light Pollution API
写真
EXIF
画像認識
生成AI画像
クラウド共有
メール送信
```

PDF生成は依存追加なしのクライアント側PDF writerで実装する。複雑な日本語フォント埋め込みや複数ページ出力は今回の対象外とする。

---

## 22. 実装後の報告テンプレート

Lunaは完了時に次を報告する。

```text
1. 完了したCheckpoint
2. コミットIDとコミットメッセージ
3. 変更ファイル
4. Guide Modelの設計判断
5. Mission Sky Snapshotの投影方式
6. Mission予測Snapshotを不変にした方法
7. LocalStorageの安全対策
8. WebMCP Tool契約
9. npm run build結果
10. npm run verify結果
11. Chrome印刷プレビューの確認結果
12. A4一ページ確認結果
13. 残課題
```
