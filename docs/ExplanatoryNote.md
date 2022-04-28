
本ドキュメントではサーバ上における画像タイル生成機能のソースコードについて、主要部分の解説を記載します。

# ソースコードレイアウト

まず、解説の前にソースコードのディレクトリのレイアウトについて説明します。

ディレクトリの一覧は以下のようになっています。

```
.
├── ansible
├── aws-cdk
├── cache
├── docs
├── gsi-sites
├── test
└── vector-map-converter
```

## ansible ディレクトリ

[ansible](https://www.ansible.com/)によるフロントエンド及びバックエンドのサーバ構築を自動化するためのファイルを格納したディレクトリです。

サーバ構築方法については利用マニュアルに記載するため、本解説書では扱いません。

## aws-cdk ディレクトリ

[aws-cdk](https://aws.amazon.com/jp/cdk/)によるAWSのインフラを自動構築するためのソースコード一式を格納したディレクトリです。

サーバ構築方法については利用マニュアルに記載するため、本解説書では扱いません。

## cache ディレクトリ

キャッシュサーバのキャッシュを格納するためのディレクトリです。中身は.keepファイルのみを格納して、git上でディレクトリとして維持するようにしています。

ソースコードは含まれないため、本解説書では扱いません。

## docs ディレクトリ

本ドキュメントなどのソースコードを格納したディレクトリです。

ソースコードは含まれないため、本解説書では扱いません。

## gsi-sites ディレクトリ

地理院地図のスタイル及びレンタリングに必要なHTML/JavaScript/CSSを格納したディレクトリです。

本サイトで重要なため、解説をします。

## test ディレクトリ

docker-compose.ymlを起動した際にチェックをするためのテストサイトを格納したディレクトリです。

こちらはLeafletのサンプルのみを収録しているため、本解説書では扱いません。

## vector-map-converter ディレクトリ

Playwrightによるレンタリングサーバの実装の一式を格納したディレクトリです。

こちらが本解説書でメインに解説を行うディレクトリとなります。

# ソースコード概要

ここでは主に `vector-map-converter` ディレクトリと `gsi-sites` ディレクトリについて解説します。

## `vector-map-converter`の概要

今回のプログラムはindex.tsに全て実装をしており、TypeScriptのトランスパイラを利用して`index.js`ファイルを生成し、それをNode.JSから実行するという仕組みを利用しています。

## `vector-map-converter/package.json` の依存関係

まず、`package.json`の中身について解説をします。

今回、依存関係があるのは以下以下のライブラリとなります。

```javascript
  "dependencies": {
    "p-queue": "^6.6.2",
    "playwright": "^1.16.3"
  },
  "devDependencies": {
    "@types/node": "^16.11.7",
    "ts-node": "^10.4.0",
    "typescript": "^4.4.4"
  }
```

実行時の依存関係(dependencies)は以下の物となります。

- `playwright`は今回内部でレンタリングを行うブラウザの実装となります。
- `p-queue`はキューを扱うためのライブラリです。このライブラリを使う事で複数アクセスが来た際に同時に処理をするのではなく、順番に処理をするようにしています。

開発、ビルド時の依存関係(devDependencies)は以下の物となります。

- `typescript`は今回の実装を[TypeScript](https://www.typescriptlang.org/)で行ったため必須のライブラリとなります。
- `ts-node`はTypeScriptを自動的にNode.JSで解釈させるためのライブラリで、主に開発時に自動的に再コンパイルをするために利用しています。
- `@types/node`はNode.JSが持っているライブラリの型を参照するためのもので、エディタの補助のために利用しています。

## `vector-map-converter/index.ts` の解説

本プログラムでは主に5つの処理に分かれています。

- 変数の初期化及び基本となる関数の設定
- HTTPサーバのプロセス
- URLのパーサ
- キューの処理
- 画像を生成する処理

なお、本解説書では時間計測のためのプログラムやログ出力については省略しています。

### 変数の初期化及び基本となる関数の設定

```typescript
let _concurrency = 4
if (process.env.CONCURRENCY) {
  _concurrency = parseInt(process.env.CONCURRENCY)
}
const concurrency = _concurrency

const queue = new PQueue({concurrency: concurrency})
```

まず最初にキューのconcurrencyを設定します。デフォルトでは4プロセス使用するようにしていますが、`CONCURENCY`変数をプログラムに渡す事で、キューのプロセス数を変更することができます。

```typescript
const tile2long = (x: number, z: number): number => {
  return x / 2 ** z * 360 - 180
}

const tile2lat = (y: number, z: number): number => {
  const n = Math.PI - 2 * Math.PI * y / 2 ** z
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}
```

上記の二つはタイルの座標からEPSG:4326の座標を設定するための関数になります。この関数を使う事で、どの位置を中心座標にしてレンタリングするかを決定します。

```typescript
let browser: Browser
let context_1: BrowserContext
let context_2: BrowserContext
let context_3: BrowserContext
(async () => {
  browser = await chromium.launch({ headless: true })
  context_1 = await browser.newContext({
    viewport: {
      width: 256 + 256,
      height: 256 + 256
    }
  })
  context_2 = await browser.newContext({
    viewport: {
      width: 512 + 256,
      height: 512 + 256
    }
  })
  context_3 = await browser.newContext({
    viewport: {
      width: 768 + 256,
      height: 768 + 256
    }
  })
})()
```

次にPlaywrightのブラウザの初期化を行います。レンタリングのコストを抑えるため、三つのコンテキストを用意して、それを使い回すようにしています。三つのコンテキストはレンタリングする画像のサイズ、256px x 256px(通常)、512px x 512px(retinaディスプレイ対応)、768px x 768px(retinaディスプレイの高解像度のもの)の三種類をしています。

### HTTPサーバのプロセス

```typescript
const server = http.createServer()
server.on('request', async (req, res) => {
  if (req.url === undefined) {
    res.writeHead(200)
    res.end()
    return
  }
  if (req.url == '/favicon.ico') {
    res.writeHead(200)
    res.end()
    return
  }
  if (req.url.indexOf('xyz') < 0) {
    res.writeHead(200)
    res.end()
    return
  }
  if (req.url.indexOf(".png") < 0) {
    res.writeHead(200)
    res.end()
    return
  }
  const paths = parseURL(req.url)
  const base = paths[0]
  const site = `http://static/${base}/`
  const z = paths[1]
  const x = paths[2]
  const y = paths[3]
  const power = paths[4]
  const path = await queueScraper(site, z, x, y, power)
  res.writeHead(200, {
    'Content-Type': 'image/png; charset=utf-8'
  })
  const image = fs.readFileSync(path, 'binary')
  if (path.indexOf('404_') < 0) {
    fs.unlinkSync(path)
  }
  res.end(image, 'binary')
})

server.listen(3000)
```

HTTPサーバはまずrequestのURLを処理して、タイルのアクセスではないものを最初に弾きます。

次にURLをパーサ(後述)でパースをして、レンタリングに必要なxyzタイルの座標、スタイルのパス、及び解像度(`power`)を取得します。なお、サイトのURLはstaticというサイトを固定化してます。これは後述する`gsi-sites`ディレクトリの中身をdockerの名前解決を利用してベクトルタイルへのアクセスを実現化しています。

次にキューに必要な情報を渡して、実際にレンタリングされたファイルのパスを取得します。

そのファイルを`image`変数に読み込み、必要がなくなったファイルを削除して、レスポンスに画像を渡して終了となります。なお、URLによって404を返すパターンがあるため、`404_`から始まるファイルについては削除をしないという処理をしています。

最後にサーバを3000ポートでlistenします。

```typescript
process.on('SIGTERM', async () => {
  server.close()
  await browser.close()
})
```

プロセスが起動している状態で、`SIGTERM`が発行されたらサーバを停止して、ブラウザを終了し、HTTPサーバとしての動作を完全に終了します。

### URLのパーサ

```typescript
const parseURL = (url: string): [string, number, number, number, number] => {
  const paths = url.split('/')
  const base = paths[2]
  const z = parseInt(paths[3])
  const x = parseInt(paths[4])
  const y_filename = paths[5]
  const y_base = y_filename.split('.')[0]
  let power = 1
  let y: number
  if (y_base.indexOf("@") > 0) {
    y = parseInt(y_base.split("@")[0])
    power = parseInt(y_base.split("@")[1])
  } else {
    y = parseInt(y_base)
  }
  return [base, z, x, y, power]
}
```

URLのパーサはURLの文字列を分解して、どのスタイルにアクセスするか(`base`変数)、ズームレベル(`z`変数)、タイルのX座標(`x`変数)、タイルのY座標(`y`変数)、タイルの解像度(`power`変数)を作成して、配列としてHTTPサーバのプロセスに返します。

このうち、タイルのY座標は単純にパースをするとタイルの解像度を含むケースがあるため、`@`があるかないかで処理を振り分けています。例えば`200@2.png`というファイルの場合、Y座標が200で、解像度が2倍(512px x 512px)となります。

### キューの処理

```typescript
const queueScraper = async (site: string, z: number, x: number, y: number, power: number) => {
  return queue.add(() => jumpInto(site, z, x, y, power))
}
```

キューの処理は単純に最初に初期化したキュー(`queue`オブジェクト)に関数を渡すだけです。関数は次に説明するjumpInto関数をベクトルタイルアクセスに必要な情報と一緒に渡すという仕組みになります。

### 画像を生成する処理

```typescript
const jumpInto = async (site: string, z: number, x: number, y: number, power: number): Promise<string> => {
  let context: BrowserContext
  let new_z = z
  if (power == 1) {
    new_z = new_z - 1
    context = context_1
  } else if (power == 2) {
    context = context_2
  } else if (power == 3) {
    new_z = new_z + 0.5
    context = context_3
  } else {
    return '404_1.png'
  }
  const webpage = `${site}#${new_z}/${tile2lat(y + 0.5, z)}/${tile2long(x + 0.5, z)}`
  const size = 256 * power
  const page = await context.newPage()
  await page.goto(webpage, {timeout: 0})
  try {
    await page.waitForNavigation()
  } catch (e) {
    return `404_${power}.png`
  }
  const selector = "#checker"
  await page.waitForFunction(selector => !!document.querySelector(selector), selector, {timeout: 0})
  const filename = randomUUID()
  const path = `files/${filename}.png`
  await page.screenshot({
    path: path,
    clip: {
      x: 128,
      y: 128,
      width: size,
      height: size
    }
  })
  await page.close()
  return path
}
```

まず、`context`変数と`new_z`変数を定義します。これらの変数は画像の解像度に合わせて調整されます。なお、Mapbox GL JSでの解像度とズームレベルは解釈がLeafletなどと一つずれるため、正確な画像(Leafletのズームレベルに合わせた画像)を出力するために解像度が256px x 256pxの場合は一つズームレベルを下げるという処理をいれます。また、`power`変数が範囲外の時は404画像を返して終了します。

次に`webpage`変数で実際にベクトルタイルへのアクセスするURLを決定します。この際にY座標とX座標を0.5ずつずらすことで、実際のタイルの中心座標になるようにしています。

次に`size`変数を決定しますが、これは単に256の何倍かを設定するだけです。

次にコンテキストから新しいページを開いて`page`変数に渡して、画面遷移(`page.goto`)を行います。

次に`page.waitForNavigation`を待つことで画面遷移が行われるのを待ちます。画面遷移が行われなかった場合は404画像を返して終了します。

次に`selector`変数として`#checker`を設定しています。次の`page.waitForFunction`で画面に`id="checker"`という空のHTMLElementが発生するのを待ちます。ここがレンタリングが実際に行われたかどうかを判定するロジックとなっています。後述する`gsi-sites`のHTMLにはJavaScriptで以下のようなスクリプトを入れています。

```javascript
map.on('idle', () => {
  const m = document.getElementById('map')
  const emptyDiv = document.createElement('div')
  emptyDiv.id = 'checker'
  m.appendChild(emptyDiv)
})
```

このスクリプトは`map`変数が`idle`イベントを発生した時に空のdivタグを挿入するという仕組みになっています。`idle`イベントはMapbox GL JSが描画処理を終えた時に発行されるイベントで、これを持ってレンタリングが終わり、すなわち描画が正常に終わったという判断のフラグを立てることで、`page.waitForFunction`から次の処理に移ってスクリーンショットを取って良いというのを知らせています。

最後は`page.screenshot`でブラウザのスクリーンショットを取り、`page.close`でブラウザのページを閉じたのちに、スクリーンショットの画像のパスを返すことで、HTTPサーバにレンタリングされた画像が返されるという形になります。

## `gsi-sites/std/index.html` の処理

`gsi-sites` ディレクトリには三つのスタイル定義とそれぞれのindex.htmlが配置されています。index.htmlの処理は共通なので、`std/index.html`のみ解説をします。また、`map.on('idle', function)`については前述をしたので省略します。そのため、`map`変数のイニシャライザのみ解説します。

```
const map = new mapboxgl.Map({
  container: 'map',
  style: './blank_vertical.json',
  center: [139, 35],
  zoom: 9,
  hash: true,
  localIdeographFontFamily: false
})
```

まず、今回の処理で`hash`を`true`にセットしています。この処理がないとベクトルタイルの画面遷移が発生しないため、現在設定している`center`と`zoom`の値の位置の画像のみレンタリングされるという事になります。

次に`localIdeographFontFamily`を`false`にセットしています。これはどのローカルフォントを読み込むかどうかを決定する仕組みですが、地理院地図のようなサイトではそもそもWebフォントを使うとスタイルがおかしくなる(デフォルトではsans-serifを利用する)ため、`false`を明示的に設定することで、Styleの定義にあるフォントを確実に使うようになります。

以上で、プログラムの解説は終了となります。

# キャッシュサーバについて

キャッシュサーバについては[nuster](https://github.com/jiangwenyuan/nuster)というOSSをそのまま利用しているため、今回の解説書では解説をしていません。こちらについてはユーザマニュアルにて解説をします。