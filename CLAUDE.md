# 柴犬（換毛期）（shibainu）

換毛期の柴犬から指1本で毛を抜き、60秒で大きな毛玉を作る 3D ゲーム。怒らせたら終わり。
公開URL: https://waqk.jp/shibainu/（英語版 /shibainu/en/）。Worker `shibainu`、D1 `shibainu-scores`、R2 `shibainu-shares`。未：ハブ掲載（`/add-game shibainu`）、JSON-LD の datePublished。

## 作り方（大事）
- 配信するのは `index.html`（1ファイル。毛のデータと効果音も base64 で中に入る）と `vendor/three.min.js`（three.js **r128**。モックと同じ版を同梱。共通ルールの r186 とは違う。2026-11-22 運営者）と `ogp.jpg`。
- **`index.html` を直接直さない。** `src/` を直して作り直す：`cd src && python build.py && python pack.py && python mkgame.py`（毛を生やし直さないなら `python mkgame.py` だけ）。
  - `dog.py`（形と部位ごとの毛の決まり）→ `build.py`（毛を生やす → dog_v2.npz）→ `pack.py`（dog.bin・dog.json。しっぽらしさ vt/ut/gt もここ）→ `mkgame.py`（dog_template.html の 37〜355 行目＋game_tail.js＋game_shell.html → ../index.html）。
  - **mkgame.py は dog_template.html を行番号で切り出す。** dog_template.html の行数を変えない（消すときは空行にする）。
  - Windows の Python で書き戻すときは `newline=''`。index.html が開いていると書き込みに失敗することがあるので、やり直す。
- 見た目（毛・目・鼻・部屋・床）は dog_template.html、画面の HTML/CSS は game_shell.html、動き（抜く・怒り・浮き毛・毛玉・音・結果・ランキング・広告）は game_tail.js。

## 決定事項（運営者）
- 制限時間60秒。ガウッ！で終わり、時間切れは「そこまで！」（犬は怒らない）。
- ゆっくり引くほど気づかれにくい（怒りは「指を動かした量×速さ」でたまる）。引く向き（毛の流れ）では痛さを変えない。
- 浮き毛：背中・首・太ももの赤い毛の所に白い房が出る。ごっそり抜けて痛くない。大きい塊ほど時間ボーナス（最大＋6秒）。「＋○秒」が左上の残り時間へ飛ぶ。
- 怒りのサイン：舌をしまう→耳が寝る・しっぽが立つ→白目→振り向く→うなる（頭の上に「ヴヴヴ……」）→ガウッ！
- 毛玉のふくらみ G.fluff = 20（柴犬の毛の量を倍に）。称号は直径で：〜20 初めての／20〜 見習い／40〜 一般的な／60〜 慣れてきた／80〜 プロの／100〜 伝説の毛づくろい（英語は STR.en.titles）。表記は `称号「…」`（飾りを足さない）。
- 結果画面は「画像（犬と毛玉の絵だけ。文字なし）・直径・柴犬○匹分の毛玉・称号」と共通の2行のボタン。画像の画角は終わり方によらず同じで、顔だけ変える（ガウッ＝怒った顔、時間切れ＝穏やかな顔）。
- カメラのボタンはなし。柴犬以外をドラッグで回す、ピンチ（PC はホイール）で寄る・引く。上下左右に △▽◁▷ がうっすら点滅。
- 左上に毛玉サイズと残り時間（26px）、右上に ♪（音）と言語。床は濃い茶色、ラグなし。
- 毛色：赤毛は彩度を少し抑えたオレンジ、白い所は白寄り（dog_template.html）。目は1.2倍。抜いた毛（毛玉）は白とごく淡い茶色の2色を境なく混ぜる（game_tail.js の cottonFS）。カメラは犬を中心に回し、毛玉は大きくなるほど犬から離す。毛玉がカメラと犬の間に入ったら毛玉と影を完全に消す（うっすら残さない）。カメラは毛玉を入れるために引きすぎない（犬だけの距離の1.4倍まで。毛玉ははみ出してよい）（2026-11-23）。
- 抜いた瞬間に、毛玉の直径が増えた分を「＋1.2cm」で抜いた所から浮かべる（浮き毛は大きい字。game_tail.js の gainPop。2026-11-24）。
- 抜いている間だけ、毛の束の先に親指と人差し指を出す（手の甲なし。付け根は指先からの距離でぼかして消す。指は画面で引いた方向から少し手前寄りに伸びる。game_tail.js の hand・handGrip・fingerMat）。
- Xでシェア：押したときだけ、結果の絵に直径・称号・題名（日英）を入れた 1200×630 の JPEG を R2 に上げ、共有ページ `/shibainu/s/<id>` の URL で投稿（手本は sanma）。共有ページの題と説明は Worker が直径から作り直す。/api/share は IP ごとに1分5件。1枚約130KB・保存期間なし（2026-11-23）。結果の絵の寄り具合は game_tail.js の `SHOT`。
- OGP：犬は左、毛玉は右、タイトルは左上に Hachi Maru Pop（文字の背景なし、白とこげ茶の縁取り）。ゲームの画面から撮る。
- 全国ランキング（歴代／デイリーの TOP100。score は直径の 0.1cm 単位）。広告はジーニーのオーバーレイ（animal-rocket の写し）。

## 注意点
- 試験用の近道 `window.__game` と「調整」パネルは `?debug=1` のときだけ。
- ジーニーの余白（#geniee_overlay_boots）の高さを `--adB` にし、canvas の高さを `calc(100% - var(--adB))` で縮める。canvas は `height:auto` だと上下の指定で伸びない。座標の計算はウィンドウではなく `cv.clientWidth/Height` を使う。
- 手元の自動抜き（`__game.auto`）は1秒に何十回も抜くので、ランキングに送ると Worker の「ありえない記録」の判定ではじかれる（正しい動き）。
- つかむ判定（pick）は、しっぽを立てた形には追いつかない（見た目だけ動かしている）。

## 調整する場所
- game_tail.js の `G`（angerK・decay・irrit・radius・fluff・slowSp・moveK・holdK・time・flEvery・flLife・flMax・bonusU）。`?debug=1` の「調整」パネルでも試せる。
- 効果音：snd/（bark・yelp・growl・pant）。抜けた音と毛玉に置かれる音は game_tail.js の `sfx.pluck`・`sfx.puff`（合成）。
