# 柴犬（換毛期）

ブラウザの3Dゲームのモック（v3）。換毛期の柴犬から毛を抜き、怒らせずにどこまで大きな毛玉を作れるかを競う。

- `shibainu-game-v3.html`：遊べる本体（1ファイル、three.js r128 を cdnjs から読む）
- `src/`：作り方
  - `dog.py`：柴犬の形（SDF）と部位ごとの毛の決まり
  - `build.py`：毛を生やす → `dog_v2.npz`
  - `pack.py`：ブラウザ用に詰める → `dog.bin` / `dog.json`
  - `dog_template.html`：見た目（毛・目・鼻・部屋）の元
  - `game_shell.html`・`game_tail.js`：ゲーム部分（画面・操作・怒り・毛玉・結果）
  - `mkgame.py`：上をまとめて `../index.html`（配信するゲーム本体）を作る
- `snd/`：効果音（Pixabay から運営者が取得）。`bark` ガウッ、`yelp` 痛いとき、`growl` 唸り声（くり返し）、`pant` 落ち着いているときの息。`orig_*` は元のファイル

作り直し：src で `python build.py && python pack.py && python mkgame.py`（効果音は `../snd/` から読む）

## 配信（試験中）
- Cloudflare Worker `shibainu`（静的ファイルだけ）。`index.html` だけを `.assetsignore` の許可リストで公開。
- 試験中は `wrangler.jsonc` に routes を書かない（workers.dev だけ）。
