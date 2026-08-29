# Interactive star Lab

ブラウザ上で現在地・日時・視線方向を指定し、星空をインタラクティブに確認できる星空ビューアです。
Stellariumの公式データをもとに、88星座の星座線を表示します。

## Features

- 東京など任意の緯度・経度から見える星空を表示
- 日時を変更して星の動きを確認
- 方位・高度・視野角を操作して空を探索
- 星名・星座線・星座名の表示切り替え
- 星をクリックして詳細を確認
- 星空表示をPNGとして保存
- 明るさ別の星レイヤーを切り替え
- 昼夜・薄明・光害・観測者感度を変えた見え方のシミュレーション
- 見えない星の表示と、非表示理由（地平線・昼光・光害など）の確認
- 東京・札幌・那覇・シンガポールなどの場所プリセット
- What-if実験（昼光を除去、光害を減らす、時刻を進める、シドニーと比較）
- 星空のBefore / After比較と、現地時刻をそろえた場所比較
- 88星座、674本の星座線、752個の恒星データを収録

## Requirements

- Node.js 18以上
- npm

Pythonは使用していません。Pythonの仮想環境（venv）は不要です。

## Setup

```bash
npm ci
```

### Optional cloud persistence

Mission、観測結果、Missionに紐づく実際のSky Canvas PNGをSupabaseへ保存する場合は、Viteの公開環境変数を設定します。

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

`service_role` keyはブラウザへ設定しないでください。Supabase SQL Editorで
[`supabase/migrations/20260829000000_cloud_observation_missions.sql`](supabase/migrations/20260829000000_cloud_observation_missions.sql)
を適用し、Authenticationでデモ用のEmail / Passwordユーザーを作成します。設定がない環境では、従来どおりLocalStorage / IndexedDBモードで起動します。

Codex Desktopのビルトインブラウザでのクラウド観測フローは次のとおりです。

1. Cloudログイン後、Agentで`create_observation_plan`を実行する。
2. 返された`missionId`の日時・地点をSky画面へ設定し、`capture_sky_snapshot({ missionId })`を実行する。
3. ビルトインブラウザのObserve画面でVisible / Not Visible / Unsureを入力して保存する。
4. Agentで`get_observation_results({ missionId })`または`get_sky_snapshot_metadata({ snapshotId })`を実行する。

Snapshot PNGはprivate Storageへ不変保存され、必要な時だけ短時間のsigned URLが発行されます。Observation Guide PDFは保存済みMissionの固定予測からブラウザ内で直接生成します。

## Development

開発サーバーを起動します。

```bash
npm run dev
```

起動後、表示されたURL（通常は <http://localhost:5173/>）をブラウザで開いてください。

## Quality checks

```bash
npm run build
npm run verify
```

`build` はTypeScriptの型チェックと本番ビルドを行い、`verify` は天体位置・表示範囲・データ整合性に加えて、明るさ・昼夜・薄明・場所比較・星座線を検証します。

Playwrightが利用可能な環境では、レイアウトを含むブラウザチェックも実行できます。

```bash
npm run verify:layout
```

## Constellation data

アプリ用データは以下にあります。

- `src/data/constellations.json`: 88星座の星座線と日本語名
- `src/data/stars.json`: 星の座標・等級・名称
- `data-source/stellarium-western-constellationship.v0.15.0.txt`: Stellarium Western skyculture v0.15.0の星座線
- `data-source/stellarium-western-star-names.v0.15.0.txt`: StellariumのHIP番号と星名の対応
- `data-source/hipparcos-line-stars.v0.15.0.tsv`: CDS/VizieR Hipparcos Main Catalogueから取得した線端点の座標・V等級

元データからアプリ用JSONを再生成する場合は、次を実行します。

```bash
npm run import:constellations
```

## Project structure

```text
src/
  astronomy/       天体位置計算・投影・表示判定
  components/      星空キャンバスと操作パネル
  data/            アプリが読み込む星・星座データ
  state/            表示設定と観測状態
scripts/            検証・データ変換スクリプト
data-source/        取得元データ
```

## Data sources

- [Stellarium](https://github.com/Stellarium/stellarium), tag `v0.15.0`
- [CDS/VizieR Hipparcos Main Catalogue (I/239)](https://cdsarc.cds.unistra.fr/ftp/cats/I/239/ReadMe)
