# Stellarium Western skycultures v0.15.0 — 88星座拡張用データ

このファイルは `sta-view/docs/constellation-data.md` にある「88星座への拡張」メモの一部として、
Stellarium リポジトリから取得した公式データのコピーです。

- ソース: `https://github.com/Stellarium/stellarium` タグ `v0.15.0`
  パス:     `skycultures/western/constellationship.fab`
            `skycultures/western/star_names.fab`

## 形式

### constellationship.fab
各1行: `<3文字星座コード> <線数N> <HIP a> <HIP b> ... (2*N 個のHIP)`
線は「前後のHIPペア」として読める。例:

```
Cru 2  61084 60718  62434 59747
# → Crux: (61084→60718), (62434→59747)

Cyg 9  94779 95853  95853 97165  97165 100453  100453 102098 \
        100453 102488  102488 104732  104732 107310  100453 98110  98110 95947
# → Cygnus: 9線
```

### star_names.fab
各1行: `<HIP番号>|_(\"<英名>\")`
```
 677|_("Alpheratz")
 746|_("Caph")
2081|_("Ankaa")
```

## HIP座標データ
674本の星座線に使われる691個のHIP番号について、CDS/VizieRのHipparcos Main
Catalogue (I/239) からRA・Dec・Johnson V等級を取得した。
取得結果は `data-source/hipparcos-line-stars.v0.15.0.tsv` に保存している。
このデータと本ファイルを `npm run import:constellations` でアプリ用JSONへ変換する。

## 3星座コード→正式名 早見表(抜粋)
| code | name | code | name |
|---|---|---|---|
| Aql | Aquila | Cet | Cetus |
| And | Andromeda | Com | Coma Berenices |
| Ara | Ara | CrA | Corona Australis |
| Ari | Aries | CrB | Corona Borealis |
| Aur | Auriga | Crv | Corvus |
| Boo | Boötes | Cru | Crux |
| Cap | Capricornus | Cyg | Cygnus |
| Cae | Caelum | Del | Delphinus |
| Cam | Camelopardalis | Dra | Draco |
| Car | Carina | Equ | Equuleus |
| Cas | Cassiopeia | Eri | Eridanus |
| Cen | Centaurus | For | Fornax |
| Cnc | Cancer | Gem | Gemini |
| ... | | | |

全88個はファイル内の `code` のユニーク値(88)すべて。
