# Same-origin deployment boundary

Build `frontend/` and mount its `dist/` directory read-only at
`/var/www/frontend/dist`. Mount the Laravel release at `/var/www/backend` and
make its PHP-FPM service available as `php-fpm:9000`.

Nginx sends `/api`, `/sanctum`, `/login`, `/logout`, and `/up` to Laravel before
the final Vue history fallback. It serves no Laravel source or `.env` file.
Terminate TLS at Nginx or an upstream load balancer and inject secrets only into
the PHP runtime. Node is required during the build and is not a production
application server.

Validate the configuration from the repository root:

```powershell
docker run --rm --add-host php-fpm:127.0.0.1 `
  -v "${PWD}/deploy/nginx/noteflow.conf:/etc/nginx/conf.d/default.conf:ro" `
  nginx:1.27-alpine nginx -t
```
