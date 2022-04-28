

# サーバ上における画像タイル生成機能 API仕様

## 開発サーバ

- Host: `www.distributed-vector.net`
- IP Address: 54.178.61.100
- Service: Amazon Web Service EC2
- Port: http(80), https(443)

httpへのアクセスはhttpsのリダイレクトとして実装している。

### サービス

`https://www.distributed-vector.net`にアクセスするとLeafletによるサンプルが動作する。

以下のAPIへのアクセス先はブラウザの開発ツールから取得することができる。

## API Entry Point

### `/xyz/{style}/{z}/{x}/{y}{retina option}.png`

#### 基本仕様

APIは地図データが存在したらレンタリングされた画像を、地図データが存在しない場合は空白の白い画像を出力する。

また、`retina option`の範囲外のクエリが来た場合には404画像を返す。

#### `{style}`

スタイルの指定。以下のいずれかの文字列。

- std
- pale
- blank

#### `{z]`

ズームレベルの指定。2〜18のいずれか。

#### `{x}`

タイルのX座標。

#### `{y}`

タイルのY座標。

#### `{retina option}`

retina画像へのアクセスを決定する修飾子。
この項目のみオプションとなる。また、許可しているのは`@2x`及び`@3x`のみとなる。

また、retinaオプションによってレンタリング可能なズームレベルが一つずつ下がる。
例えば`@2x`の場合、レンタリング可能なズームレベルは2〜17となる。

#### URL sample

- `https://www.distributed-vector.net/xyz/std/7/113/50.png`
- `https://www.distributed-vector.net/xyz/std/7/113/50@2x.png`
- `https://www.distributed-vector.net/xyz/pale/7/113/50.png`
- `https://www.distributed-vector.net/xyz/pale/7/113/50@2x.png`
- `https://www.distributed-vector.net/xyz/blank/7/113/50.png`
- `https://www.distributed-vector.net/xyz/blank/7/113/50@2x.png`

#### curl example

以下にcurlコマンドでのアクセスのサンプルを示す。

```
curl 'https://www.distributed-vector.net/xyz/std/7/113/50@2x.png' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:95.0) Gecko/20100101 Firefox/95.0' -H 'Accept: image/avif,image/webp,*/*' -H 'Accept-Language: en,en-US;q=0.5' -H 'Accept-Encoding: gzip, deflate, br' -H 'Connection: keep-alive' -H 'Referer: https://www.distributed-vector.net/' -H 'Sec-Fetch-Dest: image' -H 'Sec-Fetch-Mode: no-cors' -H 'Sec-Fetch-Site: same-origin' -H 'Cache-Control: max-age=0' -H 'TE: trailers'
```