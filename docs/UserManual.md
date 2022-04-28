
本マニュアルではサーバ上における画像タイル生成機能を利用する方法について記載します。

# 対象サーバ

本マニュアルではUbuntu Linux 20.04でのインストールを想定します。

また、フロントエンドサーバが1台、バックエンドサーバが2台という構成で成り立っている事を想定します。

IPアドレスは以下の構成を取ります。

- frontend1: 192.168.10.101
- backend1: 192.168.20.201
- backend2: 192.168.20.202

フロントエンド(192.168.10.0/24)からバックエンド(192.168.20.0/24)の間はネットワークの疎通ができている、もしくはフロントエンドからバックエンドへの3000番ポートアクセスが可能になっているという仮定で解説をします。

また、本レポジトリのアーカイブを`/tmp/vec2ras.zip`に配置します。

# 共通項目

まず、各サーバにてソフトウェアを最新の状態にします。

```bash
sudo apt update
sudo apt dist-upgrade
```

必要に応じて再起動を行います。

本マニュアルでは、アプリケーションを動かす専用ユーザとしてappsrvユーザを作成します。

このユーザはフロントエンド、バックエンドともに共通で、パスワードが無く、またdockerコマンドが動かせるユーザとなります。

このユーザのセットアップは以下の手順で行います。

```bash
sudo adduser --disabled-password appsrv
sudo apt install -y docker.io
sudo usermod -aG docker appsrv
sudo su - appsrv
docker run hello-world
exit
```

`docker`コマンドが実行できれば成功です。

次にdocker-composeコマンドをインストールします。

```bash
sudo apt install -y ca-certificates curl
sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

最後にディレクトリを作成して本レポジトリを展開します。

```bash
sudo mkdir -p /srv/app
sudo chown -R appsrv:appsrv /srv
sudo su - appsrv
cd /srv/app
unzip /tmp/vec2ras.zip
```

# バックエンドサーバ構築

バックエンドサーバはベクトルタイルをラスタ画像に変換する処理をします。

セットアップは以下の手順で行います。

```bash
sudo su - appsrv
cd /srv/app/vec2ras
docker-compose -f docker-compose-backend.yml pull
docker-compose -f docker-compose-backend.yml build
```

最後にサーバを起動させます。

```bash
docker-compose -f docker-compose-backend.yml up -d
```

以上で、バックエンドサーバの構築は完了です。

# フロントエンドサーバ構築

フロントエンドサーバはプロクシサーバとHTTPSのフロントエンドを実装します。

セットアップは以下の手順で行います。

```bash
sudo su - appsrv
cd /srv/app/vec2ras
docker-compose -f docker-compose-frontend.yml pull
docker-compose -f docker-compose-frontend.yml build
```

次に`nuster-aws.cfg`を編集します。

```bash
vim nuster-aws.cfg
```

編集後は以下のファイルになります。

```
global
    nuster manager on uri /_/nuster
    nuster cache on data-size 200m dir /cache
    master-worker
defaults
    retries 3
    option redispatch
    option dontlognull
    timeout client  300s
    timeout connect 300s
    timeout server  300s
frontend web1
    bind *:8080
    mode http
    default_backend app1
backend app1
    balance roundrobin
    mode http
    nuster cache on
    nuster rule all ttl 30d disk on
    server s1 192.168.20.201:3000
    server s2 192.168.20.202:3000
```

`nuster`の設定ファイルについて説明をします。

```
global
    nuster manager on uri /_/nuster
    nuster cache on data-size 200m dir /cache
    master-worker
```

global セッションでは`nuster`の基本設定を行います。ここでは`/_/nuster`を管理用のURLを設定し、キャッシュサイズを200MBに、`dir`でディスクキャッシュを有効にしています。

```
defaults
    retries 3
    option redispatch
    option dontlognull
    timeout client  300s
    timeout connect 300s
    timeout server  300s
```

defaults セクションではリトライ回数とタイムアウトの時間を設定しています。

```
frontend web1
    bind *:8080
    mode http
    default_backend app1
```

frontend セクションではHTTPで8080ポートで受け付けて、バックエンドの向き先を`app1`にセットします。

```
backend app1
    balance roundrobin
    mode http
    nuster cache on
    nuster rule all ttl 30d disk on
    server s1 192.168.20.201:3000
    server s2 192.168.20.202:3000
```

backend セクションではバックエンド`app1`の設定を行います。

このバックエンドではキャッシュが有効で、30日間ディスクにキャッシュし、振り分けルールを`roundrobin`にしてバックエンドサーバの二つのIPアドレスとポートをセットしています。

`nuster`の設定が完了したら`nuster`を起動します。

```bash
docker-compose -f docker-compose-frontend.yml up -d
exit
```

次にHTTPSの設定を行います。ドメイン名を`www.distributed-vector.net`とします。

まず、nginx関係のソフトをインストールします。

```bash
sudo apt install -y software-properties-common nginx libnginx-mod-http-subs-filter
```

次にnginx用に`dhparam`を作成します。

```bash
sudo openssl dhparam -out /etc/nginx/dhparam.pem 2048
```

次に証明書を取得します。今回は自己証明書の作成をします。外部のCAから取得する際はCSRを送付して、取得したキーを`www.distributed-vector.net.crt`に置き換えてください。

```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl genrsa -out /etc/nginx/ssl/www.distributed-vector.net.key 2048
sudo openssl req -new -key /etc/nginx/ssl/www.distributed-vector.net.key -out /etc/nginx/ssl/www.distributed-vector.net.csr
sudo openssl x509 -days 3650 -req -signkey /etc/nginx/ssl/www.distributed-vector.net.key -in /etc/nginx/ssl/www.distributed-vector.net.csr -out /etc/nginx/ssl/www.distributed-vector.net.crt
sudo chown root:root -R /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/*
sudo chmod 700 /etc/nginx/ssl
```

CSRの作成時のプロンプトは以下のように入力します。

```
You are about to be asked to enter information that will be incorporated
into your certificate request.
What you are about to enter is what is called a Distinguished Name or a DN.
There are quite a few fields but you can leave some blank
For some fields there will be a default value,
If you enter '.', the field will be left blank.
-----
Country Name (2 letter code) [AU]:JP
State or Province Name (full name) [Some-State]:
Locality Name (eg, city) []:Tsukuba
Organization Name (eg, company) [Internet Widgits Pty Ltd]:GSI
Organizational Unit Name (eg, section) []:
Common Name (e.g. server FQDN or YOUR name) []:www.distributed-vector.net
Email Address []:

Please enter the following 'extra' attributes
to be sent with your certificate request
A challenge password []:
An optional company name []:
```

次にnginxのSSLの共通項目を記述します。

```bash
sudo vim /etc/nginx/snippets/ssl.conf
```

以下の内容を入力します。

```
ssl_session_timeout 1d;
ssl_session_cache shared:MozSSL:10m;  # about 40000 sessions
ssl_session_tickets off;

# Diffie-Hellman parameter for DHE ciphersuites, recommended 2048 bits
ssl_dhparam /etc/nginx/dhparam.pem;

# intermediate configuration. tweak to your needs.
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;

# HSTS (ngx_http_headers_module is required) (15768000 seconds = 6 months)
add_header Strict-Transport-Security max-age=15768000;

# OCSP Stapling ---
# fetch OCSP records from URL in ssl_certificate and cache them
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.4.4 8.8.8.8 valid=300s;

client_max_body_size 20M;
try_files $uri/index.html $uri.html $uri;
```

次にnginxの設定を記述します。

```bash
sudo vim /etc/nginx/sites-available/www.distributed-vector.net
```

以下の内容を入力します。

```
upstream tile {
  server 127.0.0.1:8080;
}

server {
  listen 80;
  listen [::]:80;
  server_name www.distributed-vector.net;

  root /usr/share/nginx/html;

  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  # certs sent to the client in SERVER HELLO are concatenated in ssl_certificate
  ssl_certificate /etc/nginx/ssl/www.distributed-vector.net.crt;
  ssl_certificate_key /etc/nginx/ssl/www.distributed-vector.net.key;

  server_name www.distributed-vector.net;
  access_log /var/log/nginx/www.distributed-vector.net_https_access.log;
  error_log /var/log/nginx/www.distributed-vector.net_https_error.log;

  include snippets/ssl.conf;

  root /usr/share/nginx/html;

  send_timeout 180;
  proxy_connect_timeout 600;
  proxy_read_timeout    600;
  proxy_send_timeout    600;

  location /xyz/ {
    if ($request_method !~ ^(GET)$ ) {
      return 405;
    }
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $http_host;
    proxy_pass http://tile;
  }

}
```

ここでは`/xyz/`以下へのGETリクエストを`localhost:8080`へフォワードすることで、HTTPSアクセスを実現しています。なお、HTTPへのアクセスの場合はHTTPSにリダイレクトされるようにしています。

また、Let's Encryptを使った場合などは`ssl_trusted_certificate`などの項目が必要なケースがあります。Let's Encryptについては本レポジトリのansibleディレクトリが参考になります。

次にindex.htmlを作成します。

```bash
sudo vim /usr/share/nginx/html/index.html
```

以下の内容を記述します。

```html
<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <title>test site</title>
    <style>
      body, html {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
      }
      #map {
        width: 100%;
        height: 100%;
      }
    </style>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css"
   crossorigin=""/>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"
   crossorigin=""></script>
    <script src="https://unpkg.com/leaflet-hash@0.1.1/leaflet-hash.js"></script>
    <script>
      const gsi_attribution = "©国土地理院"
      const std = L.tileLayer('/xyz/std/{z}/{x}/{y}{r}.png', {attribution: gsi_attribution})
      const pale = L.tileLayer('/xyz/pale/{z}/{x}/{y}{r}.png', {attribution: gsi_attribution})
      const blank = L.tileLayer('/xyz/blank/{z}/{x}/{y}{r}.png', {attribution: gsi_attribution})
      const map = L.map('map', {
        center: [36.104611, 140.084556],
        zoom: 5,
        layers: [std]
      })
      const baseMaps = {
        "標準": std,
        "淡色": pale,
        "blank": blank,
      }
      L.control.layers(baseMaps).addTo(map)
      new L.Hash(map)
    </script>
  </body>
</html>
```

注: `link`タグ及び`script`タグの`integrity`についてはsha512の文字列が収まらないため、省略をしています。

最後にnginxで動作可能になるようにnginxの設定を有効にします。

```bash
cd /etc/nginx/sites-enabled/
sudo ln -s ../sites-available/www.distributed-vector.net .
sudo systemctl restart nginx
```

以上で、フロントエンドサーバの構築は完了です。

# 接続テスト

クライアントの`/etc/hosts`にフロントエンドサーバのIPアドレスと`www.distributed-vector.net`のセットを追加します。

```bash
sudo vim /etc/hosts
```

以下を追加。

```
192.168.10.101 www.distributed-vector.net
```

そして、[https://www.distributed-vector.net](https://www.distributed-vector.net)へアクセスをします。タイルがレンタリングされたら成功です。

# 接続情報

接続先のURLは以下のようになります。

1. retinaディスプレイ無効: `https://www.distributed-vector.net/xyz/{style}/{z}/{x}/{y}.png`
2. retinaディスプレイ有効: `https://www.distributed-vector.net/xyz/{style}/{z}/{x}/{y}{r}.png`

`www.distributed-vector.net`を実装するサーバ名のドメイン名に置き換えてください。

# PURGEについて

キャッシュサーバのPURGE処理については、フロントエンドのサーバにログインした後、以下の操作を実施することで可能となっています。

```shell
# delete cache with PURGE method
curl -X PURGE http://127.0.0.1:8080/xyz/std/5/28/12@2x.png
# delete cache by path
curl -X DELETE -H "path: /xyz/std/5/28/12@2x.png" -H "mode: cache" http://127.0.0.1:8080/_/nuster
# delete cache with regex
curl -X DELETE -H "regex: ^/xyz/std/5/28/.*\.png$" -H "mode: cache" http://127.0.0.1:8080/_/nuster
```

上記では直接PURGEリクエストを送るパターンと、`http://127.0.0.1:8080/_/nuster`という管理URLからDELETEリクエストを送るパターンで実施しています。後者では正規表現を使った一括削除が可能となっています。

また、PURGEリクエストは外部からされないようにnginxにてGETリクエストのみを許可するようになっています。
