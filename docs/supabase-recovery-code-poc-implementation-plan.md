# Supabase Mission復元コード POC 実装計画書

最終更新：2026-08-30

対象：Interactive Star Lab

実装担当想定：GPT-5.6 Luna

実装方式：TDD / Checkpoint単位のコミット

この文書は、既存のEmail / Passwordログインをユーザー画面から削除し、ログイン操作なしでMission、観測結果、Sky SnapshotをSupabaseへ保存し、Missionごとの復元コードを別端末へ入力して再取得できるPOCへ変更するための実装計画である。

この計画は、次の既存文書にあるEmail / Password認証仕様を上書きする。

- `docs/cloud-persistence-mission-snapshot-implementation-plan.md` の「4. 認証仕様」
- `docs/progress-2026-08-30.md` の「Authenticationでデモ用ユーザーを作成する」作業
- `README.md` のEmail / Passwordデモユーザー設定手順

Mission、観測結果、Snapshot、Guide、WebMCPの既存ドメイン仕様は、明示した変更点を除いて維持する。

### 実装進捗（2026-08-30）

- Checkpoint A〜Gのコード変更と検証スクリプトを実装済み。
- `npm run build` と `npm run verify` は成功済み。
- Supabaseには匿名Mission復元schemaと、Security Advisor対応のhardening migrationを適用済み。
- 残作業はSupabase DashboardでAnonymous Sign-Insを有効化し、デプロイ環境でBrowser A/Bの手動E2Eを行うこと。

---

## 0. 結論とPOCの利用体験

ユーザーにEmail、Password、OAuth、アカウント登録を要求しない。

```text
初回アクセス
↓
アプリがSupabase匿名セッションを自動作成
↓
Missionを作成してSupabaseへ保存
↓
Missionごとの復元コードを一度だけ表示
↓
観測結果とSnapshotを同じMissionへ保存
↓
別端末で復元コードを入力
↓
その端末の匿名セッションへMissionアクセス権を追加
↓
履歴・結果・Snapshotを取得
```

ユーザーから見える「ログイン機能」は存在しない。一方、ブラウザからSupabaseへ安全に接続し、RLSとprivate Storageを維持するため、内部ではSupabase Anonymous Sign-Inを利用する。

この内部匿名セッションはEmailやPasswordを持たない。復元コードは匿名セッション自体を別端末へ移すものではなく、対象Missionへのアクセス権を別の匿名セッションへ追加するCapabilityとして扱う。

### P0完成条件

- ログインフォーム、Email表示、ログアウトボタンが画面に存在しない。
- Supabase設定済み環境では匿名セッションが自動作成・復元される。
- Mission作成時に十分な強度の復元コードが発行される。
- 復元コードの平文はDBへ保存されず、作成応答とユーザー画面に一度だけ現れる。
- 同じ端末ではコード再入力なしでMissionを利用できる。
- 別端末または独立ブラウザコンテキストでコードを入力すると、そのMissionだけ復元できる。
- 復元していない匿名ユーザーはMission IDを知っていてもMission、結果、Snapshotを取得・更新できない。
- 元端末と復元先端末の両方から同じMissionを利用できる。
- 誤ったコードからMissionの存在有無を判別できない。
- Supabase未設定または匿名セッション作成失敗時も、LocalStorage / IndexedDBによるローカル利用を継続できる。
- `npm run build`と`npm run verify`が成功する。

---

## 1. 最初に必ず守ること

- 実装は必ずRed、Green、Refactorの順で行う。
- Checkpointをまとめて実装せず、各Checkpointで先に検証スクリプトを追加する。
- Redでは、意図した未実装理由で失敗していることを確認する。
- 各Checkpoint完了時に`npm run build`と`npm run verify`を実行する。
- 各Checkpoint完了時に、そのCheckpointだけの独立したコミットを作る。
- 作業開始時と各コミット前に`git status --short`と`git diff --check`を確認する。
- ユーザーの既存変更、未追跡ファイル、無関係な差分を上書き・コミットしない。
- 新しいnpm依存は追加しない。既存の`@supabase/supabase-js`とブラウザ標準APIを使用する。
- `service_role` keyをブラウザ、Vite環境変数、テストfixture、ログへ入れない。
- 復元コードの平文、Password、JWT、refresh tokenをログへ出さない。
- 復元コードの平文をPostgreSQL、LocalStorage、IndexedDBへ保存しない。
- Mission IDだけをアクセス秘密として扱わない。
- `anon`ロールへMissionテーブルの直接SELECT / INSERT / UPDATE / DELETE権限を付与しない。
- RLSを無効化しない。`using (true)`による全件公開ポリシーを作らない。
- Storage bucketはprivateを維持する。
- Snapshot PNGをpublic bucketへ移さない。
- 既存のMission予測値、地点、日時、`maxMagnitude`を保存後に再計算・上書きしない。
- 既存のWebMCP Toolを削除・改名しない。契約変更が必要な場合は後方互換を検証する。
- クラウド失敗をアプリ全体のクラッシュやローカルデータ消失にしない。
- 複雑な双方向同期、CRDT、自動競合解決、復元コードの共有管理画面はP0へ入れない。

---

## 2. 採用するアクセスモデル

### 2.1 なぜ単純な公開`anon`テーブルにしないか

publishable keyはブラウザへ公開される。`anon`へ全件SELECTを許可すると、アプリ画面で一覧を隠してもData APIから全行を取得できる。UPDATEを許可すれば、第三者が他のMissionを書き換えられる。

POCで保存データを公開可能と判断しても、次の問題は残る。

- 他人のMissionの変更・破壊
- Botによる大量INSERTとStorage消費
- Mission IDの列挙
- Snapshot PNGの無制限取得
- 「復元コードを持つ人だけが復元できる」というデモ要件との不一致

したがって、Data APIの全件公開ではなく、匿名セッションとMissionアクセス権を使う。

### 2.2 匿名セッションの役割

アプリ起動時に有効なsessionがなければ、`supabase.auth.signInAnonymously()`を一度だけ実行する。

匿名ユーザーもSupabase上では`authenticated`ロールを使い、`auth.uid()`を持つ。画面にはログインUIを表示しない。匿名セッションは現在端末でのアクセス主体としてのみ使う。

```text
Browser A anonymous uid ─┐
                         ├─ Mission access grant ─ Mission
Browser B anonymous uid ─┘
```

別端末では同じ匿名sessionを復元しない。復元コードを検証した後、Browser Bの匿名uidへ対象Missionのアクセス権を追加する。

### 2.3 復元コードの性質

復元コードはMission単位とする。

- 128 bit以上の暗号学的乱数を使う。
- サーバー側で生成した16進32文字（128 bit）の表記を使う。
- 表示例は`ISL-7K4M-9Q2X-...`とするが、最終文字数は128 bit以上を満たすこと。
- 比較時は区切り文字と大小文字を正規化する。
- DBにはSHA-256等の一方向ハッシュだけを保存する。
- 平文はMission作成RPCの正常応答で一度だけ返す。
- 後から平文を再取得するAPIを作らない。
- ログ、エラーメッセージ、analyticsへ含めない。
- URL queryへ自動付与しない。P0ではコピーと手入力を基本とする。
- コード紛失時の再発行・ローテーションはP0対象外とする。

復元コードを知る人は、そのMissionのデータを読み書きできるものとする。これはPasswordではなくMission限定のCapabilityである。

---

## 3. PostgreSQLとRLSの変更計画

### 3.1 事前確認

Lunaはマイグレーション作成前に次を確認する。

- `public.observation_missions`の現在行数
- 適用済みmigration一覧
- 現在のtable grantsとRLS policies
- `observation-assets` bucketがprivateであること
- Storage objectの現在件数

2026-08-30の確認時点ではMissionは0件だったが、実装時に再確認し、空であると仮定しない。

### 3.2 テーブル

既存`public.observation_missions`の`user_id`は作成者の匿名uidとして維持する。Emailユーザー専用という意味を削除し、`creator_user_id`へのrenameはP0では行わない。既存コードとmigrationの差分を小さくするためである。

次を追加する。

```sql
alter table public.observation_missions
  add column recovery_code_hash bytea;

create unique index observation_missions_recovery_code_hash_idx
  on public.observation_missions (recovery_code_hash);

create table public.observation_mission_access (
  mission_id text not null references public.observation_missions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (mission_id, user_id)
);

create index observation_mission_access_user_id_idx
  on public.observation_mission_access(user_id, granted_at desc);
```

新規Missionでは`recovery_code_hash`を必須とする。既存行がある場合は、migration中に推測可能なコードを生成しない。既存データ移行方針を先に決め、平文コードを安全にユーザーへ渡せない行は「既存端末のみアクセス可能、復元コード未発行」として扱う。

現在行数が0であることを再確認できた場合のみ、backfillなしで`recovery_code_hash not null`へ進める。

### 3.3 DB helperとRPC

SQL関数はすべて固定`search_path`、完全修飾名、最小権限で作成する。`security definer`を使う関数は、所有者と`EXECUTE` grantsを明示し、`public`から実行権限をrevokeする。

必要な関数境界：

```text
private.has_observation_mission_access(mission_id, user_id) -> boolean

public.create_observation_mission_with_recovery(...)
  -> mission row + recoveryCode plaintext

public.restore_observation_mission(recoveryCode)
  -> restored missionId
```

`create_observation_mission_with_recovery`は次を同一transactionで行う。

1. `auth.uid()`が存在することを確認する。
2. サーバー側で復元コードを生成する。
3. 正規化済みコードのhashをMissionへ保存する。
4. `observation_missions.user_id = auth.uid()`でMissionを作る。
5. 作成者のaccess rowを作る。
6. 平文コードを正常応答で一度だけ返す。

`restore_observation_mission`は次を行う。

1. `auth.uid()`が存在することを確認する。
2. 入力コードを正規化・hash化する。
3. hashが一致するMissionを検索する。
4. `(mission_id, auth.uid())`をaccess tableへ冪等にinsertする。
5. 一致時だけMission IDを返す。

不正コード、存在しないコード、形式不正はすべて同じ`RESTORE_CODE_INVALID`へ正規化する。Missionの存在やコードの部分一致を示す情報を返さない。

### 3.4 RLS

MissionのSELECT / UPDATEは次を満たす行だけ許可する。

```text
auth.uid() = observation_missions.user_id
OR
observation_mission_accessに(mission_id, auth.uid())が存在する
```

Mission作成はRPCに限定する。クライアントからテーブルへの直接INSERTはrevokeする。

access tableはクライアントから直接SELECT / INSERT / UPDATE / DELETEさせない。アクセス追加は復元RPCだけで行う。

最低限のgrants：

| 対象 | `anon` | `authenticated` |
|---|---|---|
| `observation_missions` | なし | SELECT / UPDATEのみ |
| `observation_mission_access` | なし | 直接権限なし |
| create RPC | なし | EXECUTE |
| restore RPC | なし | EXECUTE |

匿名Sign-In前の`anon`ロールにはMissionデータへの権限を付与しない。

### 3.5 Storage

bucket `observation-assets`はprivateを維持する。

現在のStorage path：

```text
<userId>/<missionId>/<snapshotId>.png
```

変更後：

```text
<missionId>/<snapshotId>.png
```

アクセス権を複数匿名uidへ付与するため、作成者uidをpathの認可主体にしない。StorageのINSERT / SELECT policyは、path先頭のMission IDについて`private.has_observation_mission_access(...)`がtrueかを確認する。

- INSERTとSELECTだけ許可する。
- UPDATE、DELETE、upsertを許可しない。
- 1 Mission 1 canonical Snapshotを維持する。
- path traversal、空Mission ID、Missionに属さないSnapshotを拒否する。
- signed URLは永続保存しない。

既存Storage objectがある場合はpath移行が必要になるため、migration前の件数確認を必須とする。0件なら新pathへ直接切り替える。

---

## 4. アプリケーション変更計画

### 4.1 認証状態をCloud Identityへ置き換える

現在の`AuthProvider`と`AuthPanel`はEmail / Passwordログインを前提としている。次の状態へ置き換える。

```ts
type CloudIdentityState = {
  configured: boolean;
  ready: boolean;
  anonymousUserId: string | null;
  error: string | null;
};
```

必要な処理：

- Supabase未設定なら即座にlocal modeへ入る。
- 既存匿名sessionがあれば再利用する。
- sessionがなければ一度だけ`signInAnonymously()`を実行する。
- React Strict Modeの二重effectで匿名ユーザーを二重作成しない。
- bootstrap中だけCloud書き込みを待機する。
- bootstrap失敗時はローカル利用を継続し、再試行可能な非破壊エラーを表示する。
- Email、Password、signIn、signOut、email表示を状態・UIから削除する。

ファイル名は実装時に選べるが、`auth`という語がユーザーログインを連想させる場合は`src/state/cloudIdentity.tsx`等へ分離する。

### 4.2 Mission作成

`createSupabaseMissionRepository.createMission`は直接table insertをやめ、create RPCを呼ぶ。

戻り値へ次を追加する。

```ts
type CreatedCloudMission = {
  row: CloudMissionRow;
  recoveryCode: string;
};
```

Mission作成後のUIに次を表示する。

- 「Missionを保存しました」
- Mission ID
- 復元コード
- コピーボタン
- 「このコードは再表示できません。別端末での復元に必要です」
- コピー成功・失敗の状態

平文コードをReactの永続state、LocalStorage、IndexedDB、Mission JSONへ入れない。画面を閉じた後は再表示できない仕様とする。

Cloud作成に失敗した場合でもローカルMissionを削除しない。ただし「クラウド未保存・復元コードなし」と明示し、成功したように表示しない。自動再送queueはP0対象外とする。

### 4.3 復元UI

Recordsメニュー配下またはHistory空状態に「復元コードからMissionを復元」を追加する。

UI要件：

- 復元コード入力
- paste可能
- 区切り記号・大小文字の正規化
- 復元ボタン
- 読み込み中状態
- 成功時に対象Missionを履歴へ追加し、ResultsまたはObserveへ遷移可能
- 同じコードの再入力は冪等に成功
- 形式不正・不一致は同じ安全なエラー表示
- 復元コードを入力欄以外へ再表示しない
- 成功後は入力欄をclearする

Missionごとの復元コードなので、複数Missionを復元する場合はコードを個別に入力する。全履歴を一括復元するアカウントコードはP0対象外とする。

### 4.4 観測結果と履歴

- accessを持つ匿名uidは既存repository経由で結果を保存できる。
- Historyは現在の匿名uidがaccessを持つMissionだけ一覧化する。
- 復元直後に`refreshCloudMissions()`を実行する。
- 元端末と復元先端末のどちらから更新しても、再読込後は最新rowを表示する。
- P0では同時編集の競合解決を追加しない。last write winsを明記する。
- Mission作成時に固定した予測値を結果保存時に再計算しない。

### 4.5 Snapshot

- Snapshot path生成から`userId`依存を外し、Mission IDを先頭にする。
- upload前に現在uidがMission accessを持つことを確認する。
- 復元先端末でもprivate Snapshotを取得し、短時間signed URLを生成できることを確認する。
- canonical Snapshotの不変性、`upsert: false`、重複拒否を維持する。
- ローカルIndexedDB SnapshotはSupabase未設定・Cloud失敗時のfallbackとして維持する。

### 4.6 WebMCP

既存Tool登録は維持する。追加候補：

```text
restore_observation_mission
input: { recoveryCode: string }
output: { ok: true, missionId: string }
```

`create_observation_plan`がCloud Missionを作成した場合は、成功応答へ`recoveryCode`を追加する。Local-onlyの場合は含めない。

安全要件：

- Toolのdescriptionへ「復元コードはMissionへのアクセスCapability」であることを書く。
- raw codeをconsoleへ出さない。
- error envelopeへ入力コードをechoしない。
- `get_observation_mission({ missionId })`はaccessのないMissionを取得できない。
- Mission IDだけでは復元できない。

---

## 5. TDD Checkpoints

各CheckpointはRed → Green → Refactor → 全体検証 → コミットの順で進める。

### Checkpoint A：復元コードのドメイン契約

先に追加・更新する検証：

```text
scripts/verify-cloud-recovery-code.ts
```

検証項目：

- 正規化で区切り文字と大小文字を吸収する。
- 不正な長さ・文字を拒否する。
- 表示形式と正規化形式を相互変換できる。
- 生成器へ固定乱数を注入して決定的にテストできる。
- 128 bit未満のコードを生成しない。
- エラーに入力コードを含めない。
- Mission DTOや永続JSONへ平文コードが混入しない。

実装候補：

```text
src/cloud/recoveryCode.ts
```

Checkpoint完了コミット例：

```text
test: define mission recovery code contract
```

### Checkpoint B：匿名Cloud Identity

先に追加・更新する検証：

```text
scripts/verify-cloud-anonymous-auth.ts
scripts/verify-cloud-auth.ts
```

検証項目：

- Supabase未設定時はlocal modeになる。
- 既存sessionを再利用する。
- sessionなしの場合だけ匿名Sign-Inする。
- 同時bootstrap呼び出しで匿名ユーザーを二重作成しない。
- anonymous uid取得後にcloud modeになる。
- bootstrap失敗時もlocal modeを利用できる。
- Email / Password APIを要求しない。

Checkpoint完了コミット例：

```text
feat: bootstrap anonymous cloud identity
```

### Checkpoint C：Schema、RPC、RLS

先に追加・更新する検証：

```text
scripts/verify-cloud-recovery-schema.ts
scripts/verify-cloud-schema.ts
```

静的検証に加え、可能ならSupabase CLIまたは隔離したテストprojectで次を統合検証する。

- create RPCがMissionと作成者accessを同時作成する。
- DBに平文コードが残らない。
- code hashがuniqueである。
- Browser Aは作成Missionを取得・更新できる。
- Browser Bは復元前に取得・更新できない。
- Browser Bが正しいコードを使うとaccess rowが追加される。
- Browser Bが復元後に取得・更新できる。
- Browser Aのaccessも維持される。
- Browser CはMission IDだけでは取得できない。
- 誤ったコードは同一エラーになる。
- access tableをクライアントが直接列挙・変更できない。
- `anon`ロールはtableへ直接アクセスできない。
- security definer関数の`search_path`とgrantsが限定されている。

migration候補：

```text
supabase/migrations/<timestamp>_anonymous_mission_recovery.sql
```

Checkpoint完了コミット例：

```text
feat: add recovery-code mission access schema
```

### Checkpoint D：Repositoryと状態管理

先に追加・更新する検証：

```text
scripts/verify-cloud-repository.ts
scripts/verify-cloud-observation-flow.ts
scripts/verify-cloud-missions.ts
```

検証項目：

- Mission作成はRPCを使う。
- create結果はMission rowと復元コードを分離して返す。
- restoreはRPCを使い、成功後にMissionを再取得する。
- 同じコードの復元が冪等である。
- codeをrepository errorへ含めない。
- Cloud失敗時にlocal Missionを失わない。
- accessを持つ復元Missionへ結果を保存できる。
- Mission予測Snapshotが不変である。
- Cloud未設定時のLocalStorage挙動が壊れない。

Checkpoint完了コミット例：

```text
feat: restore cloud missions with recovery codes
```

### Checkpoint E：ログインUI削除と復元UI

先に追加・更新する検証：

```text
scripts/verify-cloud-recovery-ui.ts
scripts/verify-navigation.ts
```

検証項目：

- Cloudログイン、Email、Password、ログアウトが表示されない。
- Cloud bootstrap中とlocal fallbackが区別される。
- Mission作成成功時だけ復元コードを表示する。
- コピーボタンがコードをコピーする。
- コードはdismiss後に再表示されない。
- Historyから復元フォームを開ける。
- 復元成功後に履歴へMissionが現れる。
- 復元失敗時も入力コードをエラーへ表示しない。
- 未ログインを理由にMission作成・結果保存ボタンをdisableしない。

Checkpoint完了コミット例：

```text
feat: replace cloud login with mission recovery UI
```

### Checkpoint F：private Snapshotの複数端末アクセス

先に追加・更新する検証：

```text
scripts/verify-cloud-snapshots.ts
scripts/verify-cloud-snapshot-storage.ts
scripts/verify-cloud-snapshot-webmcp.ts
```

検証項目：

- 新Storage pathがMission IDから始まる。
- accessのないuidはupload、read、signed URL生成ができない。
- 作成者はuploadとreadができる。
- 復元先uidはreadとsigned URL生成ができる。
- UPDATE、DELETE、overwriteは拒否される。
- 既存のMission日時・地点一致検証を維持する。
- Local IndexedDB fallbackを維持する。

Checkpoint完了コミット例：

```text
feat: authorize mission snapshots by recovery access
```

### Checkpoint G：WebMCP、ドキュメント、E2E

先に追加・更新する検証：

```text
scripts/verify-cloud-mission-webmcp.ts
scripts/verify-cloud-recovery-webmcp.ts
scripts/verify-webmcp.ts
```

検証項目：

- create応答にCloud時だけ復元コードが含まれる。
- restore ToolがMission IDを返す。
- Tool errorが復元コードをechoしない。
- accessなしの既存read/write Toolが失敗する。
- restore後に既存Toolが同じMissionを扱える。
- READMEとVercel / Supabase設定手順が新方式と一致する。

Checkpoint完了コミット例：

```text
docs: document anonymous mission recovery flow
```

---

## 6. 手動E2Eシナリオ

Agent Browserまたは独立browser contextを2つ使う。

### Scenario 1：作成端末

1. LocalStorage、IndexedDB、Supabase sessionがない状態で起動する。
2. ログインUIがないことを確認する。
3. 匿名Cloud Identityがreadyになることを確認する。
4. Missionを作成する。
5. 復元コードをコピーし、安全な一時メモへ保存する。
6. 観測結果を保存する。
7. Mission条件へSkyを設定し、Snapshotを保存する。
8. History、Results、Snapshotから再取得できることを確認する。
9. リロード後も同じ匿名sessionで再取得できることを確認する。

### Scenario 2：別端末復元

1. 独立browser contextを開き、別の匿名uidであることを確認する。
2. Mission IDだけでは取得できないことを確認する。
3. 誤った復元コードが安全に失敗することを確認する。
4. 正しい復元コードを入力する。
5. Mission、結果、Snapshot metadataを取得できることを確認する。
6. private Snapshotの短時間signed URLを取得できることを確認する。
7. 結果を更新し、作成端末の再読込後に反映されることを確認する。
8. 作成端末のaccessが失われていないことを確認する。

### Scenario 3：分離とfallback

1. 第3の匿名uidからMission IDだけでアクセスし、拒否されることを確認する。
2. Supabase URLを誤らせた環境で起動する。
3. ローカルMissionと結果を作成できることを確認する。
4. Cloud未保存・復元コードなしと明示されることを確認する。
5. 既存のローカル履歴が消えないことを確認する。

---

## 7. Supabase / Vercel設定手順

Lunaの実装完了後、運用者が次を行う。

### Supabase

1. Anonymous Sign-Insを有効化する。
2. 新migrationを適用する。
3. Mission table、access table、RPC、RLS、grantsを確認する。
4. `observation-assets`がprivateであることを確認する。
5. Security Advisorを確認する。
6. 作成・復元E2E後、匿名Auth userとaccess rowが期待どおり作成されたことを確認する。

Email providerやデモ用Email / PasswordユーザーはこのPOCに不要である。

### Vercel

必要な公開環境変数は次だけとする。

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

`service_role` key、DB Password、復元コードをVercel環境変数へ入れない。

---

## 8. リスクとP0での判断

### 復元コード紛失

コードを失うと別端末復元できない。同じ端末の匿名sessionが残っていれば利用できる。再発行はP0対象外であることをUIで明記する。

### 復元コード漏洩

コードを知る人はMissionへアクセスできる。コードを共有しない旨を表示する。P0ではaccess取り消し、コードrotation、端末一覧を実装しない。

### 匿名ユーザーの増加

匿名Sign-InはAuth userを作る。POC後に不要な匿名ユーザー、Mission、Storage objectを整理する運用を別途検討する。自動削除ジョブはP0へ入れない。

### 同時編集

複数端末から同時更新した場合はlast write winsとする。競合UIは実装しない。

### Missionごとのコード

多数のMissionを別端末へ移すには複数コードが必要になる。POCではデモの明確さを優先する。将来、全履歴用アカウント、端末ペアリング、複数Mission bundle codeへ拡張できる。

### DB RPCの権限

復元RPCはRLSを迂回してcode hashを検索するため、最も注意が必要な境界である。固定`search_path`、完全修飾名、最小EXECUTE grant、入力長上限、一定のエラー形、秘密値の非ログ化をテストする。

---

## 9. 完了時の報告項目

Lunaは実装完了時に次を報告する。

- CheckpointごとのコミットSHA
- 変更ファイル一覧
- migration名と適用結果
- RLS / grants / Security Advisor結果
- Redを確認したテストと、Green後の結果
- `npm run build`結果
- `npm run verify`結果
- Browser A / B / Cの手動E2E結果
- 復元コードがDB、ログ、LocalStorage、IndexedDBに残っていない確認結果
- Cloud失敗時のlocal fallback結果
- 未解決のリスクとP0後へ送った項目

---

## 10. Definition of Done

次をすべて満たした場合だけ完了とする。

- Email / PasswordログインUIが削除されている。
- ユーザー操作なしで匿名Cloud Identityがreadyになる。
- Mission作成RPCが復元コードを一度だけ返す。
- DBに平文復元コードが存在しない。
- 作成者と復元済み端末だけがMissionへアクセスできる。
- Mission IDだけではアクセスできない。
- 別端末でコード入力後、Mission、結果、private Snapshotを利用できる。
- 元端末のaccessが維持される。
- accessのない匿名uidによるread/writeが拒否される。
- `anon`ロールによる直接table accessが拒否される。
- 未設定・接続失敗時のローカル機能が動作する。
- 既存の天体計算、Mission固定予測、Guide、PDF、WebMCPが壊れていない。
- `git diff --check`、`npm run build`、`npm run verify`が成功する。
- READMEとSupabase / Vercel手順が実装と一致する。
