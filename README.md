# vec2ras

Render vector tiles in playwright's browser and take screenshots, then return them as raster tiles.

## How to use

```shell
docker-compose build
docker-compose up
```

Then open `test/index.html` in your browser.

## How to purge object

```shell
# delete cache with PURGE method
curl -X PURGE http://localhost:8080/xyz/std/5/28/12@2x.png
# delete cache by path
curl -X DELETE -H "path: /xyz/std/5/28/12@2x.png" -H "mode: cache" http://localhost:8080/_/nuster
# delete cache with regex
curl -X DELETE -H "regex: ^/xyz/std/5/28/.*\.png$" -H "mode: cache" http://localhost:8080/_/nuster
``` 

## Limitation

Rendering speed is very slow, per tile may take 10 sec.

## Note: Deploy to AWS

### CDK

see aws-cdk/README.md

#### Useful command

```
aws ec2 describe-instances --filter "Name=instance-state-name,Values=running" | jq '.Reservations[].Instances[].InstanceId'
```

### backend

```
aws ssm start-session --target <instance>
bash
cd
git clone [your repository]
cd vec2ras/ansible
ansible-playbook backend.yml
```

### frontend

```
aws ssm start-session --target <instance>
bash
cd
git clone [your repository]
cd vec2ras/ansible
ansible-playbook frontend.yml
```

