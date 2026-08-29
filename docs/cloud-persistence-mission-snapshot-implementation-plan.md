# Cloud Persistence / Immutable Mission Snapshot 実装計画書

最終更新：2026-08-29  
対象：InteractiveStarLab  
実装担当想定：GPT-5.6 Luna  
完成期限：2026-08-31（2026-09-01は提出バッファとし、新機能を追加しない）

この文書は、現在のLocalStorage / IndexedDB中心の実装を壊さず、Codex DesktopのWebMCPとビルトインブラウザで作成したObservation Mission、観測結果、およびMission作成時に実際に表示されていたSky CanvasのPNGをSupabaseへ永続保存するための実装仕様である。

今回の中心は複数端末同期ではない。

```text
Codex Desktop Agent
↓ WebMCP
Mission作成
↓
SupabaseへMissionと予測Snapshotを保存
↓
実際に表示中のSky CanvasをPNG撮影
↓
Supabase Storageへ不変保存
↓
ビルトインブラウザで観測結果入力
↓
Supabaseへ結果保存
↓
WebMCPで結果と過去Snapshotを取得
```

を、デモ中に破綻なく成立させることを最優先とする。

---

## 0. 最初に必ず守ること

- 実装はTDDで行う。各Checkpointで必ずRed、Green、Refactorの順序を守る。
- 最初から全Checkpointをまとめて変更しない。
- 各Checkpointのテストを先に追加し、期待どおり失敗することを確認してから実装する。
- 各Checkpoint完了時に`npm run build`と`npm run verify`を実行する。
- 各Checkpoint完了時に独立したコミットを作成する。
- Checkpointの途中で次のCheckpointへ進まない。
- 既存の星空ビューア、天体計算、Mission、観測結果、Snapshot、Observation Guide、PDF、WebMCPを壊さない。
- 既存のユーザー変更を上書きしない。
- 作業開始時に変更ファイルを確認し、ユーザー変更と競合する場合は勝手に戻さない。
- 既存のWebMCP Toolを削除、改名、非登録化しない。
- Mission作成時に固定された`predictedVisible`、予測高度、予測方位、予測等級、地点、日時、`maxMagnitude`を再計算・上書きしない。
- 画面表示用の等級レイヤーとMission候補選定用の`maxMagnitude`を混同しない。
- LocalStorage / IndexedDBの不正データ、Supabaseの不正JSON、通信失敗でアプリをクラッシュさせない。
- 未設定環境では既存LocalStorage / IndexedDB版として起動できるようにする。
- `service_role` keyをブラウザ、Vite環境変数、ソースコード、テストfixtureへ絶対に入れない。
- Supabaseへ配置するのはpublishable keyまたはanon keyだけとする。
- Storage bucketはprivateとし、公開bucketにしない。
- Missionに紐付いたSky Snapshot PNGを同じパスへ上書きしない。
- Mission SnapshotのStorageパスは必ずログイン中の`userId`から始める。
- PNG、PDF、base64、signed URLをLocalStorageへ保存しない。
- signed URLは永続URLとしてDBへ保存しない。必要な時だけ生成する。
- WebMCPからPNG base64やPDFバイナリを返さない。
- MCP、UIとも同じCloud Repository / Snapshot Storage境界を利用する。
- 複雑な双方向同期、CRDT、operation log、tombstone、競合解決は実装しない。
- スマートフォン専用対応、QR共有、Google OAuth、Magic Link、新規登録、パスワードリセットは今回実装しない。
- Horizon、Weather、写真EXIF、画像認識、Plate Solving、ARは今回実装しない。
- PDF本体のSupabase Storage保存はP0では実装しない。直接PDF生成とダウンロードを維持する。
- 例外として新しいnpm依存`@supabase/supabase-js`を1つだけ追加してよい。それ以外の依存は追加しない。
- 実装後に変更ファイル、設計上の判断、テスト結果、手動確認結果、Supabase設定、残課題を報告する。

### 既存計画から今回上書きする事項

`docs/observation-guide-print-implementation-plan.md`には、当時のMVP判断として次が記載されている。

```text
新しいnpm依存を追加しない
PNGをクラウド保存しない
Guide SnapshotはMissionから再生成する
```

今回のクラウド永続化では、次の範囲だけ上書きする。

```text
@supabase/supabase-jsの追加を許可
実際のSky Canvas PNGをSupabase Storageへ保存
MissionとSnapshotのクラウド永続化を追加
```

既存のObservation Guide用ベクター星図は削除しない。

---

## 1. 期限を考慮したP0完成条件

以下の会話と操作がCodex Desktopのビルトインブラウザで成立すればP0完成とする。

```text
User:
今夜観測する星を5個選んで、Missionを作って。

Agent:
create_observation_plan(...)

Application:
MissionをSupabaseへ保存
missionIdを返す

Agent:
Sky画面をMissionと同じ地点・日時へ設定
capture_sky_snapshot({ missionId })

Application:
表示中のCanvasをPNG化
privateなSupabase Storageへ保存
MissionへSnapshot参照を固定

User:
ビルトインブラウザで観測結果を入力

Agent:
get_observation_results({ missionId })

Application:
Supabaseから最新結果を取得して返す

Agent:
get_sky_snapshot_metadata({ snapshotId })

Application:
保存時メタデータと短時間有効なsigned URLを返す

Agent:
generate_observation_guide({ missionId })

Application:
保存済みMission予測値から星空図入りPDFを直接生成してダウンロード
```

P0では「同じユーザーが後のブラウザセッションからMission、結果、実Canvas PNGを再取得できる」ことを永続化と定義する。

---

## 2. 今回保存するSnapshotの意味

### 2.1 2種類のSnapshotを区別する

既存アプリには意味の異なる2種類のSnapshotがある。Lunaはこれらを混同しないこと。

| 種類 | 内容 | 役割 |
|---|---|---|
| Actual Sky Canvas PNG | ユーザーがMission計画時に実際に見ていたSky Viewer Canvas | 観測証跡、履歴、Agent参照 |
| Mission Sky Snapshot Model | Mission日時・地点・固定予測から作る全天ベクター星図 | A4 Guide、印刷、見つけ方 |

今回Supabase Storageへ保存するのは前者である。

後者は既存の次の実装を維持する。

```text
src/guides/missionSkySnapshot.ts
src/components/guides/MissionSkySnapshot.tsx
src/guides/pdf.ts
```

### 2.2 Actual Sky Canvas PNGを保存する理由

- Mission作成時に実際に見ていた画面を残す。
- 後の星描画ロジック変更に影響されない観測証跡にする。
- Agentから過去の星空Snapshotを参照可能にする。
- 観測履歴に画像を残す。
- 方角、FOV、表示レイヤー、星座線、シミュレーション設定を含む実際の表示状態を保存する。

### 2.3 不変条件

Missionに最初に正常紐付けされたSnapshotを、そのMissionのCanonical Snapshotとする。

```text
1 Mission
→ 0または1 Canonical Actual Sky Canvas PNG
```

- 既存Canonical Snapshotを同じパスへ上書きしない。
- `upsert: false`でStorageへ保存する。
- 既にSnapshotがあるMissionへの再撮影は`SNAPSHOT_ALREADY_EXISTS`を返す。
- 削除と差し替えは提出後の機能とする。
- Mission未保存時はSnapshotをクラウドへ紐付けない。
- Capture失敗時にMission自体を削除しない。Missionは`skySnapshot: null`のまま再試行可能とする。

### 2.4 Missionと画面条件の一致

`capture_sky_snapshot({ missionId })`は保存前に次を検証する。

```text
currentSky.site.latitude  == mission.siteSnapshot.latitude
currentSky.site.longitude == mission.siteSnapshot.longitude
currentSky.dateTime       == mission.dateTime
```

数値比較は浮動小数点誤差を許容する。

```typescript
const LOCATION_EPSILON = 1e-6;
```

一致しない場合は保存せず、次を返す。

```json
{
  "ok": false,
  "error": {
    "code": "SNAPSHOT_CONTEXT_MISMATCH",
    "message": "Open the Sky view with the Mission site and dateTime before capturing"
  }
}
```

これにより、別日時・別地点の画面をMissionへ誤って紐付けることを防ぐ。

方角、仰角、FOV、表示レイヤー、星座表示、simulation設定は一致条件にはせず、その時点で実際に表示されていた値をPNGメタデータとして固定保存する。

---

## 3. アーキテクチャ

提出環境は次へ固定する。

```text
Vercel
└─ React / Vite static application

Supabase
├─ Auth
├─ PostgreSQL
├─ Row Level Security
└─ private Storage bucket
```

コードはVercel固有APIを使用しない。静的成果物`dist/`を配信すれば動作する状態を維持する。

独自API Server、Vercel Functions、Netlify Functions、Render Web Serviceは追加しない。

```text
UI ───────────┐
              ├─ CloudMissionRepository ── Supabase PostgreSQL
WebMCP ───────┘

UI ───────────┐
              ├─ SnapshotStorage ───────── Supabase Storage
WebMCP ───────┘
```

### 未設定時のフォールバック

次のどちらかがない場合、Supabase clientを初期化しない。

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

その場合は現在どおり動作する。

```text
Mission / Result → LocalStorage
Sky Snapshot     → IndexedDB
PDF              → Browser Blob download
```

設定不足をアプリ全体の起動エラーにしてはならない。

---

## 4. 認証仕様

### P0方式

Supabase Dashboardで事前に作成したデモユーザーを使用する。

```text
Email + Password
```

UIに必要なのは次だけとする。

- Email入力
- Password入力
- Loginボタン
- Logoutボタン
- ログイン中Email表示
- 読み込み中表示
- 認証エラー表示
- リロード後のsession復元

実装しないもの：

- Sign up
- Magic Link
- Google OAuth
- Password reset
- Profile編集
- 管理画面

### WebMCP

未ログイン時にもTool登録自体は維持する。ただしクラウド操作は次の構造化エラーを返す。

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Sign in before using cloud observation tools"
  }
}
```

これにより、認証状態の変化だけでToolの登録・解除を繰り返さない。

---

## 5. PostgreSQLデータモデル

期限を優先し、P0では1テーブルだけ使用する。

```sql
create table public.observation_missions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_at timestamptz not null,
  mission jsonb not null,
  record jsonb,
  sky_snapshot jsonb,
  guide jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index observation_missions_user_planned_at_idx
  on public.observation_missions(user_id, planned_at desc);
```

### mission JSON

既存`ObservationMission`を破壊せず保存する。

```typescript
type MissionJson = ObservationMission;
```

この中の次の値は固定予測であり、不変とする。

```text
siteSnapshot
dateTime
maxMagnitude
targets[].predictedVisible
targets[].predictedAltitude
targets[].predictedAzimuth
targets[].predictedMagnitude
```

### record JSON

完了済み観測結果を既存`ObservationRecord`形式で保存する。

```typescript
type RecordJson = ObservationRecord | null;
```

同じMissionの結果は同じ行へupsertする。人間がUIまたはWebMCPで結果を明示した場合だけ更新し、Agentが結果を推測してはならない。

### sky_snapshot JSON

Blob本体はPostgreSQLへ入れない。private Storageの参照と、撮影条件だけを保存する。

```typescript
interface CloudMissionSnapshotReference {
  snapshotId: string;
  missionId: string;
  storagePath: string;
  fileName: string;
  mimeType: "image/png";
  width: number;
  height: number;
  createdAt: string;
  heading: string;
  site: ObservationSite;
  dateTime: string;
  view: SkySnapshotView;
  simulation: SimulationSettings;
  layers: StarLayerState;
  displayOptions: DisplayOptions;
}
```

次は保存しない。

```text
Blob
base64
data URL
blob URL
signed URL
```

### guide JSON

既存Guide descriptorを保存する必要がある場合だけ使用する。P0のMission・結果・Snapshot完成前にGuide永続化へ進まない。

---

## 6. RLS

すべてのポリシーは`authenticated` roleだけを対象にする。

```sql
alter table public.observation_missions enable row level security;

create policy "users select own missions"
on public.observation_missions
for select
to authenticated
using (
  auth.uid() is not null
  and auth.uid() = user_id
);

create policy "users insert own missions"
on public.observation_missions
for insert
to authenticated
with check (
  auth.uid() is not null
  and auth.uid() = user_id
);

create policy "users update own missions"
on public.observation_missions
for update
to authenticated
using (
  auth.uid() is not null
  and auth.uid() = user_id
)
with check (
  auth.uid() is not null
  and auth.uid() = user_id
);
```

P0ではUIからMission削除を実装しないため、DELETE policyを作らなくてよい。

anon roleにMissionテーブルの読み書きを許可しない。

---

## 7. Supabase Storage

### Bucket

```text
bucket id: observation-assets
public: false
```

SQL migrationでbucketを作成する。

```sql
insert into storage.buckets (id, name, public)
values ('observation-assets', 'observation-assets', false)
on conflict (id) do update set public = false;
```

### Object path

```text
{userId}/{missionId}/{snapshotId}.png
```

例：

```text
76c.../b18.../55a....png
```

固定名`sky.png`を使用しない。snapshotIdを含め、誤上書きを構造的に防止する。

### Storage RLS

```sql
create policy "users insert own observation assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'observation-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users select own observation assets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'observation-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

P0ではMission Snapshotを不変証跡として扱うため、UPDATE policyとDELETE policyをブラウザへ付与しない。

### signed URL

Agentまたは履歴画面で画像を開く時だけ生成する。

```typescript
const SNAPSHOT_SIGNED_URL_TTL_SECONDS = 300;
```

返却したURLはログへ全文出力しない。DBやLocalStorageにも保存しない。

---

## 8. Repository境界

既存LocalStorage実装を全面的に書き換えない。クラウド用の狭い境界を追加する。

```typescript
interface CloudMissionRepository {
  createMission(mission: ObservationMission): Promise<void>;
  listMissions(): Promise<CloudMissionRow[]>;
  getMission(missionId: string): Promise<CloudMissionRow | null>;
  saveRecord(missionId: string, record: ObservationRecord): Promise<void>;
  attachSnapshot(
    missionId: string,
    snapshot: CloudMissionSnapshotReference,
  ): Promise<void>;
}
```

```typescript
interface CloudSnapshotStorage {
  saveMissionSnapshot(input: {
    userId: string;
    missionId: string;
    record: SkySnapshotRecord;
  }): Promise<CloudMissionSnapshotReference>;

  getMissionSnapshot(
    reference: CloudMissionSnapshotReference,
  ): Promise<SkySnapshotRecord | null>;

  createAccessUrl(
    reference: CloudMissionSnapshotReference,
    expiresInSeconds: number,
  ): Promise<string>;
}
```

Supabase SDK型をReact ProviderやWebMCP Toolへ漏らさない。

RepositoryはSupabase clientそのものではなく、テスト用fake gatewayを注入可能にする。

### クラウド読み込み時の検証

`mission`、`record`、`sky_snapshot`はJSONBなので、既存LocalStorageと同様にruntime validationを行う。

- 不正Mission行は一覧から除外し、警告状態へする。
- 不正recordは`null`として扱う。
- 不正snapshot referenceでは画像なしとして扱う。
- 一つの不正行でアプリ全体をクラッシュさせない。
- `user_id`やStorage pathをJSON内の値だけで信用しない。

---

## 9. LocalStorage / Supabaseの切り替え

本格同期エンジンは作らない。

### 未ログイン

```text
既存LocalStorage / IndexedDBをそのまま使用
```

### ログイン済み

```text
Supabaseをクラウドの正本として使用
Mission一覧をSupabaseから読み込む
```

Mission作成時は、既存UIとの互換性のためローカルstateへも反映してよい。ただしWebMCPがクラウド保存完了を返すのはSupabase INSERT成功後だけとする。

既存LocalStorage履歴とSupabase履歴を自動マージしない。

ログアウト後はページ状態をクリアし、既存LocalStorageモードへ戻す。別ユーザーのMissionをReact stateへ残さない。

### エラー時

通信失敗を自動的な「同期済み」にしてはならない。

UI表示例：

```text
Cloud save failed
Mission remains available locally in this browser.
[Retry]
```

P0で自動再送キューは作らない。

---

## 10. Mission作成とクラウド保存

既存`createObservationMission()`は純粋な同期ドメイン関数として維持する。

Providerまたはapplication serviceへ非同期処理を追加する。

```typescript
async function createAndPersistMission(
  input: CreateMissionInput,
): Promise<ObservationMission>
```

処理順：

```text
既存createObservationMissionで固定予測Mission作成
↓
ローカルstateへ反映
↓
ログイン中ならSupabase INSERT
↓
成功後にWebMCPへmissionIdを返す
```

Supabase保存に失敗した場合、`CLOUD_MISSION_SAVE_FAILED`を返す。Mission IDを変えて自動再作成しない。

既存同期APIを一括置換して多数の画面を壊さない。必要なら次を併存させる。

```text
createMission()             // 既存ローカル互換
createAndPersistMission()   // UI / WebMCPのクラウド経路
```

締切後に統合できる。

---

## 11. Actual Sky Canvas PNG保存フロー

既存資産を再利用する。

```text
src/snapshots/renderer.ts
src/snapshots/metadata.ts
src/snapshots/types.ts
src/state/snapshots.tsx
src/mcp/snapshotTools.ts
```

### capture処理

```text
1. ログイン確認
2. SupabaseからmissionIdを取得
3. Missionに既存Canonical Snapshotがないことを確認
4. Sky Canvasが現在マウント済みか確認
5. Current Skyの地点・日時がMissionと一致するか確認
6. canvas.toBlob(..., "image/png")
7. PNG type、size、width、heightを検証
8. storagePathをuserId / missionId / snapshotIdから構築
9. Supabase Storageへupsert:falseでupload
10. observation_missions.sky_snapshotへ参照を保存
11. React Snapshot一覧を更新
12. MCPへsnapshotIdとmetadataを返す
```

### 失敗補償

- 手順9失敗：DB参照を保存しない。
- 手順10失敗：Storage objectは孤立する可能性がある。可能なら同一操作内で削除を試みるが、DELETE policyをブラウザへ付けないP0では、孤立objectを残してエラー報告してよい。
- 孤立objectの管理者削除は提出後の運用課題とする。
- DB参照保存に成功した後はCanonical Snapshotを差し替えない。

### サイズ

異常に大きなCanvasを誤保存しないようクライアント側上限を設ける。

```typescript
const MAX_SKY_SNAPSHOT_BYTES = 10 * 1024 * 1024;
```

上限超過時は`SNAPSHOT_TOO_LARGE`を返す。

### Canvas未表示

Sky Canvasがマウントされていない場合、勝手に空画像や再描画画像を保存しない。

```json
{
  "ok": false,
  "error": {
    "code": "SNAPSHOT_UNAVAILABLE",
    "message": "Open the Sky view before capturing the Mission snapshot"
  }
}
```

これは「実際に見ていた画面」を保証するための仕様である。

---

## 12. Snapshot画面

既存Snapshots画面を維持し、ログイン済みではクラウドSnapshotも表示する。

最低表示項目：

- PNG preview
- Mission ID
- Snapshot ID
- 撮影日時
- Mission対象日時
- 地点名、緯度、経度
- 方角、仰角、FOV
- 画像サイズ
- `Cloud saved`表示
- Downloadボタン

Missionに紐付いたクラウドSnapshotにはP0でDeleteボタンを表示しない。

読み込み中、画像取得失敗、signed URL期限切れを明示し、画面全体をクラッシュさせない。

期限切れ時は同じURLを使い続けず、新しいsigned URLを取得する。

---

## 13. WebMCP仕様

既存Tool名を維持し、クラウド対応を追加する。

再ログイン後に結果未入力のMissionもAgentから確認できるよう、既存Toolを壊さない追加読み取りToolとして`get_observation_mission({ missionId })`も登録する。返却には作成時点の地点・日時・固定予測とSnapshot保存状態だけを含め、PNG本体は返さない。

### 13.1 `create_observation_plan`

ログイン中はMissionをSupabaseへ保存してから成功を返す。

返却へ追加：

```json
{
  "missionId": "...",
  "persistence": "supabase",
  "snapshotStatus": "required",
  "nextAction": "Open the Sky view with the Mission context, then call capture_sky_snapshot"
}
```

### 13.2 `capture_sky_snapshot`

既存inputを壊さない。

```typescript
capture_sky_snapshot({
  missionId,
  download?: boolean
})
```

ログイン済みかつ`missionId`ありならCanonical SnapshotとしてSupabaseへ保存する。

返却：

```json
{
  "snapshotId": "...",
  "missionId": "...",
  "persistence": "supabase",
  "storagePath": "userId/missionId/snapshotId.png",
  "downloaded": false,
  "metadata": {
    "createdAt": "...",
    "dateTime": "...",
    "width": 1280,
    "height": 720,
    "heading": "South 180 degrees"
  }
}
```

signed URLはcapture結果に必須ではない。Agentが画像を参照する時は次のToolを使う。

### 13.3 `list_sky_snapshots`

ログイン済みではSupabaseのMission行からSnapshot metadataを新しい順に返す。

PNG Blob、base64、signed URLは一覧へ含めない。

### 13.4 `get_sky_snapshot_metadata`

既存metadataに、クラウドSnapshotの場合だけ短時間有効なアクセス情報を追加する。

```json
{
  "snapshotId": "...",
  "missionId": "...",
  "metadata": { "...": "..." },
  "access": {
    "url": "https://...signed...",
    "expiresInSeconds": 300
  }
}
```

AgentはこのURLをビルトインブラウザで開いて過去画像を確認できる。

### 13.5 `get_observation_results`

ログイン中はReact stateやLocalStorageの古い値を返さず、Tool実行ごとにSupabaseから対象Missionを取得する。

返却には次を含める。

- Mission固定予測
- 観測結果
- Snapshot ID
- Snapshot保存状態
- Snapshot撮影日時

signed URLは結果Toolへ含めない。画像参照は`get_sky_snapshot_metadata`へ分離する。

### 13.6 `generate_observation_guide`

ログイン中はMission IDからSupabaseの最新Mission / Record / Snapshot referenceを取得してからGuideを作る。

対象星の位置は保存済みMission targetsを使い、現在日時で再計算しない。

既存のA4 PDF内の星図は、印刷で判読しやすいMission Sky Snapshotベクター図を維持する。Actual Sky Canvas PNGは履歴・証跡としてSupabaseに保存されるが、P0では既存PDF writerへラスター画像埋め込みを追加しない。

返却へ追加：

```json
{
  "snapshotArchived": true,
  "snapshotId": "...",
  "snapshotSource": "stored_actual_canvas_and_mission_vector_guide"
}
```

---

## 14. PDFとPNGの扱い

P0では役割を明確に分ける。

```text
Actual Sky Canvas PNG
→ Supabase Storageへ永続保存
→ 過去画面、履歴、Agent参照

Observation Guide PDF
→ 保存済みMissionから直接生成
→ 既存ベクターMission Sky Snapshotを印刷
→ Blob download
→ Supabaseには保存しない
```

理由：

- 現在の独自PDF writerはベクター星図に最適化されている。
- PNG埋め込みのためにPDF engineを全面的に変更すると締切リスクが高い。
- 印刷用星図はベクターのほうが白黒印刷で判読しやすい。
- 実Canvas PNGは別途、Mission作成時の不変証跡として確実に残る。

提出後、必要なら次を追加する。

```text
PDFへのActual Sky Canvas PNG埋め込み
PDF本体のSupabase Storage保存
PDF再ダウンロード履歴
```

---

## 15. エラーコード

最低限、次を安定したコードとして扱う。

| code | 意味 |
|---|---|
| `AUTH_REQUIRED` | ログインが必要 |
| `CLOUD_NOT_CONFIGURED` | Supabase環境変数なし |
| `CLOUD_MISSION_SAVE_FAILED` | Mission INSERT失敗 |
| `CLOUD_MISSION_LOAD_FAILED` | Mission SELECT失敗 |
| `CLOUD_RESULT_SAVE_FAILED` | Result UPDATE失敗 |
| `MISSION_NOT_FOUND` | Missionなし、またはRLSで不可視 |
| `SNAPSHOT_UNAVAILABLE` | Sky Canvas未表示 |
| `SNAPSHOT_CONTEXT_MISMATCH` | Missionと画面の地点・日時不一致 |
| `SNAPSHOT_ALREADY_EXISTS` | Canonical Snapshot保存済み |
| `SNAPSHOT_TOO_LARGE` | PNG上限超過 |
| `SNAPSHOT_UPLOAD_FAILED` | Storage upload失敗 |
| `SNAPSHOT_LINK_FAILED` | Missionへの参照保存失敗 |
| `SNAPSHOT_ACCESS_FAILED` | signed URL生成失敗 |
| `GUIDE_PDF_UNAVAILABLE` | PDF生成またはダウンロード失敗 |

Supabaseの内部エラー全文、SQL、認証token、signed URLをユーザー向けエラーへ露出しない。

---

## 16. TDD Checkpoints

各Checkpointで以下を厳守する。

```text
1. テスト追加
2. テスト失敗確認（Red）
3. 最小実装（Green）
4. Refactor
5. npm run build
6. npm run verify
7. git diff --check
8. Checkpoint単位でcommit
9. 次のCheckpointへ進む
```

### Checkpoint 0：Baseline確認

変更前に実行：

```bash
npm run build
npm run verify
```

確認項目：

- 既存テストが成功する。
- 既存変更ファイルを把握する。
- WebMCP Tool登録数とTool名を記録する。
- 現在のSnapshot、Guide PDF、Observation Resultが動作する。

Baselineが失敗している場合、今回変更による失敗と混同せず報告する。

コミットは不要。

### Checkpoint 1：Supabase設定境界

先に追加する検証：

```text
scripts/verify-cloud-config.ts
```

検証内容：

- 環境変数ありでconfigを返す。
- 片方欠落時はdisabledを返す。
- 欠落時にthrowしない。
- service roleらしい設定を受け付けない設計になっている。
- Supabase SDK型がdomain層へ漏れない。

実装候補：

```text
src/cloud/config.ts
src/cloud/client.ts
src/cloud/types.ts
```

このCheckpointだけで`@supabase/supabase-js`を追加する。

推奨コミット：

```text
feat: add optional supabase client configuration
```

### Checkpoint 2：SQL schema、RLS、Storage policies

先にSQL構造検証を追加する。

```text
scripts/verify-cloud-schema.ts
```

作成：

```text
supabase/migrations/20260829_cloud_observation_missions.sql
```

検証内容：

- 1テーブルだけ作る。
- RLSが有効。
- authenticated user本人だけ読み書きできる。
- anon policyがない。
- private bucketが作られる。
- Storage path先頭userIdを検査する。
- Storage UPDATE / DELETE policyを作らない。

可能ならSupabase SQL Editorへ適用し、別ユーザーで他ユーザーMissionをSELECTできないことを手動確認する。

推奨コミット：

```text
feat: define secure cloud observation storage
```

### Checkpoint 3：Cloud Mission Repository

先にfake gatewayによる検証を追加する。

```text
scripts/verify-cloud-missions.ts
```

検証内容：

- Missionの固定予測値を失わず保存・復元する。
- Mission IDを変更しない。
- 一覧はplannedAt降順。
- 異常JSONを無視しクラッシュしない。
- Result upsertでMission targetsを書き換えない。
- 他ユーザーIDをクライアントinputから指定できない。
- Supabase失敗を安定したapplication errorへ変換する。

実装候補：

```text
src/cloud/missionRepository.ts
src/cloud/missionValidation.ts
src/cloud/errors.ts
```

推奨コミット：

```text
feat: persist observation missions and results in supabase
```

### Checkpoint 4：最小認証UIとクラウドモード

先に認証state検証を追加する。

```text
scripts/verify-cloud-auth.ts
```

検証内容：

- 未設定時にlocal modeになる。
- 設定済み未ログイン時にlogin UIを出す。
- session復元後にcloud modeへなる。
- logout時にクラウドMission stateを消す。
- 認証エラーで星空ビューアがクラッシュしない。

実装候補：

```text
src/state/auth.tsx
src/components/AuthPanel.tsx
```

画面メニューを増やしすぎず、既存のSettingsまたはコンパクトなAccount popoverへ配置する。

このCheckpoint完了後、Vercelへ初回デプロイし、環境変数とSupabase AuthのSite URLを設定する。

推奨コミット：

```text
feat: add minimal cloud sign in flow
```

### Checkpoint 5：UI / WebMCP Mission・Resultクラウド経路

先に検証を追加する。

```text
scripts/verify-cloud-observation-flow.ts
```

検証内容：

- MCP Mission成功はクラウドINSERT成功後だけ返る。
- 予測値は固定されたまま。
- UI保存結果をクラウドへupsertする。
- `get_observation_results`は実行ごとにRepositoryを読む。
- 古いReact refやLocalStorage結果を優先しない。
- クラウド失敗時にlocal dataを消さない。

既存同期関数を無理にすべてPromise化せず、application serviceを追加して影響範囲を限定する。

推奨コミット：

```text
feat: connect observation workflow to cloud persistence
```

### Checkpoint 6：Immutable Mission Snapshot Storage

先に検証を追加する。

```text
scripts/verify-cloud-snapshots.ts
```

検証内容：

- pathが`userId/missionId/snapshotId.png`になる。
- `upsert: false`で保存する。
- PNG以外を拒否する。
- 10 MiB超過を拒否する。
- Missionと現在の地点・日時不一致を拒否する。
- Canvas未表示を拒否する。
- 既存Canonical Snapshotを拒否する。
- Blob、base64、signed URLをDB metadataへ入れない。
- DB link成功後にSnapshot metadataが履歴へ現れる。
- Storage upload失敗時にDB参照を作らない。

実装候補：

```text
src/cloud/snapshotStorage.ts
src/cloud/snapshotReference.ts
src/cloud/snapshotValidation.ts
```

既存`canvasToPng()`と`createSkySnapshotMetadata()`を再利用する。

推奨コミット：

```text
feat: archive immutable mission sky snapshots
```

### Checkpoint 7：Snapshot UI / WebMCP access

先に検証を追加する。

```text
scripts/verify-cloud-snapshot-webmcp.ts
```

検証内容：

- `capture_sky_snapshot`がクラウド保存完了後に成功を返す。
- `list_sky_snapshots`にBlob、base64、signed URLを含めない。
- `get_sky_snapshot_metadata`だけが300秒signed URLを生成する。
- AUTH_REQUIREDを返せる。
- RLS不可視と不存在を同じMISSION_NOT_FOUNDとして扱える。
- URL期限切れ後に再取得できる。
- 既存ローカルSnapshot Toolも未ログイン時に動く。

Snapshot画面にCloud savedとMission IDを表示する。

推奨コミット：

```text
feat: expose archived sky snapshots to webmcp
```

### Checkpoint 8：Guide統合と回帰確認

先に検証を追加する。

```text
scripts/verify-cloud-guide-flow.ts
```

検証内容：

- Mission IDからクラウドMissionを取得してGuideを作る。
- targetsの高度・方位・等級を再計算しない。
- Snapshot保存済み状態をMCP結果へ含める。
- Snapshot未保存でも既存ベクターGuideを生成できる。
- PDF直接ダウンロードを維持する。
- ネイティブ印刷ダイアログへ依存しない。
- PDF本体をLocalStorage / Supabaseへ保存しない。

推奨コミット：

```text
feat: generate guides from persisted missions
```

### Checkpoint 9：実環境E2E、デプロイ、ドキュメント

自動確認：

```bash
npm run build
npm run verify
git diff --check
```

Codex Desktopビルトインブラウザで手動確認：

1. Vercel URLを開く。
2. デモユーザーでログインする。
3. WebMCP Tool一覧が既存Toolを含めて登録される。
4. AgentがMissionを作成する。
5. Supabase Table EditorにMission行がある。
6. Sky画面をMissionと同じ地点・日時で開く。
7. Agentが`capture_sky_snapshot({ missionId })`を実行する。
8. StorageにPNG objectがある。
9. Mission行の`sky_snapshot`に参照がある。
10. Snapshot画面で画像を開ける。
11. ブラウザをリロードする。
12. 同じMissionとSnapshotが復元される。
13. UIからVisible / Not Visible / Unsureを保存する。
14. Agentが最新結果を取得できる。
15. AgentがSnapshot metadataとsigned URLを取得できる。
16. signed URLからPNGを確認できる。
17. AgentがGuide PDFを生成し、直接ダウンロードが始まる。
18. 既存ローカルモードでも星空ビューアが動く。

推奨コミット：

```text
docs: document cloud observation deployment
```

---

## 17. `npm run verify`への追加

Checkpointごとに追加した検証を既存`verify`へ順次含める。

最終的に最低限次を含める。

```text
verify-cloud-config.ts
verify-cloud-schema.ts
verify-cloud-missions.ts
verify-cloud-auth.ts
verify-cloud-observation-flow.ts
verify-cloud-snapshots.ts
verify-cloud-snapshot-webmcp.ts
verify-cloud-guide-flow.ts
```

外部Supabaseへ接続しない単体検証はfake gatewayで実行する。`npm run verify`がネットワークや本番credentialsを要求してはならない。

実Supabase接続試験はCheckpoint 9の手動E2Eとして分離する。

---

## 18. Vercel / Supabase設定手順

### Supabase

1. Projectを作成する。
2. SQL Editorでmigrationを適用する。
3. `observation-assets`がprivateであることを確認する。
4. Authenticationでデモユーザーを事前作成する。
5. Email + Password loginを有効にする。
6. Site URLを本番Vercel URLへ設定する。
7. RLS policyを確認する。

### Vercel

```text
Framework preset: Vite
Build command: npm run build
Output directory: dist
```

Environment Variables：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

PreviewとProductionの両方に必要なら設定する。

### 禁止

```text
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_SERVICE_ROLE_KEY
```

上記をVercelへ登録しない。

---

## 19. デモ手順

デモ開始前：

- Vercel本番URLをCodex Desktopビルトインブラウザで開いておく。
- デモユーザーでログイン済みにする。
- Sky Canvasを表示できることを確認する。
- Supabaseがpause状態でないことを確認する。
- WebMCP Toolが登録済みであることを確認する。
- 既存Missionを1つ予備として保存しておく。

3分デモ：

```text
0:00 Agentが現在条件を取得
0:20 Agentが明るい星を選びMission作成
0:45 Missionが画面とクラウドへ表示
1:00 Sky画面を開き、実Canvas PNGをCapture
1:20 Snapshot履歴を表示
1:40 観測結果を入力・保存
2:00 Agentがクラウド結果を取得して比較
2:20 Agentが過去Snapshot metadataを取得
2:35 AgentがObservation Guide PDFを生成
2:55 完成メッセージ
```

ネイティブ印刷ダイアログはデモで使用しない。

---

## 20. スコープから外すもの

2026-09-01提出版では次を実装しない。

- スマートフォン固有対応
- 複数端末同時編集
- 完全offline-first
- 自動再送キュー
- LocalStorage既存履歴の自動移行
- Mission / Result / Targetの複数テーブル正規化
- Snapshot差し替え、削除、複数版管理
- Snapshot画像編集
- 公開共有リンク
- QRコード
- Magic Link
- Google OAuth
- Sign up
- Password reset
- service roleを使う処理
- 独自API Server
- Vercel Functions
- PDF本体のクラウド保存
- PDF内へのActual Canvas PNG埋め込み
- PDF履歴・版管理
- Storage孤立objectの自動掃除
- Weather、Horizon、写真EXIF、画像認識

---

## 21. 提出後の拡張候補

提出版完成後にだけ検討する。

### P1

- Actual Canvas PNGをPDFへ追加掲載
- PDF本体をStorageへ保存
- Snapshotの複数版管理
- Mission単位のAsset一覧
- Snapshot SHA-256保存
- LocalStorage履歴import

### P2

- Magic Link
- Google OAuth
- スマートフォン観測
- offline queue
- 通信復帰時upsert
- Mission共有

---

## 22. Lunaの最終報告フォーマット

実装完了後、次を必ず報告する。

```text
## 完了Checkpoint

## 変更ファイル

## Supabase schema / policy

## 設計上の判断

## 既存機能を維持した方法

## TDD結果
- Redで確認した失敗
- Greenで追加した最小実装
- Refactor内容

## 検証結果
- npm run build
- npm run verify
- git diff --check

## 手動E2E結果
- Codex Desktop WebMCP
- Mission cloud save
- PNG Storage save
- browser reload restore
- Result cloud save
- Agent result retrieval
- Agent snapshot access
- PDF direct download

## コミット一覧

## デプロイURL

## 残課題
```

失敗している項目を成功したように報告してはならない。Supabase credential、access token、signed URL全文を報告へ貼らない。

---

## 23. 最終判断基準

今回の価値は、単にPNGファイルをアップロードできることではない。

```text
Agentが作成した予測Mission
↓
Mission作成時に人間が実際に見ていたSky Canvas
↓
人間が入力した観測結果
↓
Agentによる予測と現実の比較
```

を、ブラウザセッションを越えて一つのMission IDで再利用できることである。

そのため、締切までは以下を最優先とする。

1. Mission固定予測を壊さない。
2. Actual Sky Canvas PNGをprivate Storageへ不変保存する。
3. 結果をクラウドへ保存する。
4. WebMCPが毎回クラウドの最新値を読む。
5. 既存PDF直接ダウンロードを維持する。
6. Codex Desktopビルトインブラウザで3分デモを完走する。
