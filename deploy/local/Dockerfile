FROM php:8.4-cli-bookworm

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

RUN apt-get update \
    && apt-get install -y --no-install-recommends git libonig-dev libpq-dev unzip \
    && docker-php-ext-install mbstring pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/backend

COPY entrypoint.sh /usr/local/bin/noteflow-entrypoint
RUN chmod 0755 /usr/local/bin/noteflow-entrypoint

ENTRYPOINT ["/usr/local/bin/noteflow-entrypoint"]
