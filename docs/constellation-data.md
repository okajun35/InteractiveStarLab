# 星空ビューア — データソースと88星座への拡張メモ

## 1. 現在使用中のデータ

| データ | ソース | 場所 |
|---|---|---|
| 恒星(752個: RA/Dec/等級/名称) | 既存の著名星カタログ + Hipparcos Main Catalogue (I/239) | `src/data/stars.json` |
| 星座線88星座・674本 | Stellarium Western skyculture v0.15.0 の `constellationship.fab` | `src/data/constellations.json` |
| HIP → RA/Dec/Vmag (691個) | CDS/VizieR Hipparcos Main Catalogue (I/239) | `data-source/hipparcos-line-stars.v0.15.0.tsv` |
| 日本語星座名 | 国際天文学連合の88星座に対応する日本語表記 | `src/data/constellations.json` |

- RA は **sidereal hours (J2000)**、Dec は degrees。astronomy-engine `Horizon()` と同じ約束。
- 等級は 4.0 程度まで(全端点星が揃うよう一部 4.0〜4.95 も含む)。
- 等級 4.0 以下でも線に使われない余計な星が混在する場合がある — 表示は `magnitude` と ViewLine 依存で制御。

### 恒星データ抽出の由来
```
npm ターボール → tar → dist/index.js
  → var va=[{id:"sirius",name,ra,dec,mag},...] を正規表現で抽出
  → var O=[{name:"Ursa Major",lines:[["dubhe","merak"],...]},...] を抽出
```
2026-08 時点の `@found-in-space/stellarium-skycultures-western` には画像アセットのみで線データは無い(確認済み)。

## 2. 88星座への拡張 — 取り込み済み

### 手元に確保済みの公式データ(Stellarium リポジトリ)
`https://github.com/Stellarium/stellarium` タグ `v0.15.0` の `skycultures/western/` に公式88星座・674線がある:

| ファイル | 中身 | 状態 |
|---|---|---|
| `constellationship.fab` | 88星座の正式な星座線(3文字コード + HIP番号のペア列) | **取得済み**(`data-source/stellarium-western-constellationship.v0.15.0.txt`、88行・674線) |
| `star_names.fab` | HIP番号 → 英名 の対応(339個) | **取得済み**(`data-source/stellarium-western-star-names.v0.15.0.txt`、339行) |
| Hipparcos Main Catalogue (I/239) | 線端点691個のRA/Dec/Vmag | **取得済み**(`data-source/hipparcos-line-stars.v0.15.0.tsv`、691行) |
| `constellations_boundaries.dat` | 星座境界線(多角形) | バイナリ形式、MVPでは不要 |

形式例(`constellationship.fab`):
```
Cru 2  61084 60718  62434 59747     # Crux: 2線, (HIP61084-HIP60718),(HIP62434-HIP59747)
Cyg 9  94779 95853  95853 97165 ... # Cygnus: 9線
```

### 変換結果
`npm run import:constellations` で、上記3ファイルを解析し、88星座の線端点をアプリ用の恒星IDへ変換する。
公式名称のない恒星は `HIP <番号>` の名称を持たせ、全ての線端点を表示可能にしている。

出力は88星座・674本・752恒星で、線端点691個の欠落はない。

試して失敗した入手経路(2026-08-27):
| 経路 | 結果 |
|---|---|
| VizieR ASU `https://vizier.cfa.harvard.edu/viz-bin/cat?I/138` / `I/3093` | `I/3093` は PostgreSQL 内部エラー、`I/138` は Southern Reference Star Catalog (別カタログ) で返却 |
| CDS Strasbourg FTP/mirror (`cds.unistra.fr/ftp/I/3093/hip_main.5.gz` 等) | 404 |
| SIMBAD TAP (`https://simbad.u-strasbg.fr/simtap/sync`) | 404 |
| Gaia TAP (gea.esac.esa.int) | HTTP 200 だがホーム画面のみ返す(クエリが通らない) |
| npm パッケージ検索(hipparcos / star-catalog / bright-stars 等) | 該当パッケージ無し |
| Stellarium `.cat` バイナリ(`stars/default/stars_*.cat`) | HIP番号込みだがジオデシック・グリッド形式。パース可能だが暗い星は精度が劣る |

### 変換手順
1. HIP → (RA, Dec, Vmag) テーブルをVizieRから取得し、`data-source/hipparcos-line-stars.v0.15.0.tsv` に保存。
2. `constellationship.fab` を解析 → `[[HIPa, HIPb], ...]` の星座別線リストへ変換。
3. 線端点HIPを座標・等級・名称へ解決し、既存の著名星IDを可能な範囲で再利用。
4. `stars.json` / `constellations.json` に書き込み。
5. `npm run build && npm run verify` で回帰確認。

### 日本語名拡張
天文協会の88星座日本語名が確定しているため、`nameJa` へ一括設定可能。
「座」は U+5EA7 とすること(かな「ざ/ザ」ではダメ — 過去に文字化け事故あり)。

## 3. 検証コマンド
```bash
cd sta-view
npm run build   # tsc --noEmit && vite build
npm run verify  # スクリプト/verify.ts: 方角差, 時刻変化, FOV, Tokyo↔Sydney, データ整合, 境界NaN
```

## 4. 既知の制約
- 星座は88個・星座線674本・恒星752個(線端点を含む)。
- 等級 2.0 以下/著名星にのみ名称ラベル表示(仕様 §15)。
- 星座名ラベルは「最明る星の平均位置」に配置。
- 地形・光害・月明かり等の視認性判定は MVP 対象外(§33)。
