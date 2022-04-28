FROM node:17

RUN apt-get update && \
    apt-get -y install xvfb xauth \
      chromium chromium-driver \
      libgles2-mesa libegl1 \
      fonts-ipafont-gothic fonts-ipafont-mincho && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /srv
WORKDIR /srv
# install npm packages
COPY package.json /srv
COPY package-lock.json /srv
RUN npm install
# compile typescript
COPY index.ts /srv
COPY tsconfig.json /srv
RUN npx tsc index.ts
# copy entrypoint
COPY docker-entrypoint.sh /srv
# create temprary directory
RUN mkdir -p /srv/files
# COPY 404 files
COPY 404_1.png /srv
COPY 404_2.png /srv
COPY 404_3.png /srv

# port
EXPOSE 3000
# entrypoint
ENTRYPOINT ["/srv/docker-entrypoint.sh"]
