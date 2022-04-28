# vector-map-converter

## development

```bash
npm i
npx ts-node index.ts
```

## run in docker

```bash
docker build . -t vector_map_converter
docker run --rm -it -p 3000:3000 vector_map_converter node /srv/index.js
```