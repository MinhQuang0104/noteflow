# Module boundary

Future product modules follow `Vue UI → JSON API → Application → Domain`.
Domain code stays plain PHP and does not depend on Laravel controllers or facades,
Eloquent, network access, database access, or the system clock.
