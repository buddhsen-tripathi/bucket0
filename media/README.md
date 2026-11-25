# Thumbnail service

`POST /thumbnail?kind=image|video|pdf` accepts raw source bytes and returns a
WebP thumbnail. The Worker streams source bytes, decrypting them incrementally,
so source files are never collected in Worker memory. The media service
enforces a **64 MiB source limit**, including requests without a
`Content-Length` header. Larger complete sources return 413; for larger files
the queue consumer sends only the first one or two 8 MiB chunks. Folder ZIP
downloads stream directly from R2 through decryption and compression; they do
not use this service.

On Cloudflare, `wrangler.jsonc` builds this image as a Container behind the
private `MEDIA_CONTAINER` Durable Object binding, so no public media hostname or
bearer token is needed. Docker must be running when you deploy (and for
`bun run dev`, which builds the image locally). The container has one basic
instance and sleeps after 30 seconds of inactivity.

To run the service outside a container, run `bun install && bun start` from this
directory (ffmpeg, graphicsmagick, and ghostscript must be installed), then set
the Worker's `MEDIA_SERVICE_URL` to the service origin and the same
`MEDIA_SERVICE_TOKEN` on both services. When `MEDIA_SERVICE_URL` is set, the
Worker uses it instead of the container. This is meant for local development. Leave it
unset in a deployed Worker so decrypted file contents only go to the private
container.

Uploads and Drive listings enqueue reference-only jobs on `BACKGROUND_QUEUE`.
The consumer streams and decrypts the source into the media service and writes
WebP output to the `THUMBNAILS` R2 binding. Database keys use the
`cf-thumbnail:` prefix. The consumer processes one job at a time, retries
failures three times, and sends exhausted jobs to the dead-letter queue. Exact
PostgreSQL version tokens prevent stale jobs from overwriting current file
metadata. Outputs are grouped by owner/file ID so deletion can remove every
generated version; a job that loses a race with deletion or replacement removes
its obsolete output.
