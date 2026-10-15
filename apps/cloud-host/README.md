# DSH Cloud Host runtime image

Container image that runs a DeepSeek Harness **Host** for a cloud instance. The image is built
from this directory and is consumed by the cloud-instance controller of the separate Server
repository; the controller injects the instance configuration and mounts the bootstrap token.

`bootstrap.mjs` enrolls the Host through the cloud bootstrap API, persists the device identity and
credentials, acknowledges the registration, and then starts a DSH profile with the Remote Host
plugin enabled. Ordinary restarts reuse the stored identity, so no bootstrap token is needed after
the first successful acknowledgement.

## Build and push

```bash
IMAGE=ccr.ccs.tencentyun.com/liguobao/dsh-cloud-host:dsh-0.2.0-rc.2-remote-0.5.7-20261015
docker build -t "$IMAGE" apps/cloud-host
docker push "$IMAGE"
```

`package.json` pins `@deepseek-ai/dsh` and `ds-harness-remote`; `package-lock.json` locks the full
dependency graph, including the DSH peer packages that would otherwise resolve to incompatible
alpha releases. The image is amd64.

## Runtime contract

| Environment variable | Meaning |
| --- | --- |
| `DSH_CLOUD_INSTANCE_ID` | Instance UUID; must match the persistent volume |
| `DSH_CLOUD_INSTANCE_NUMBER` | Instance number used for the device name `工作电脑 {number}` |
| `DSH_CLOUD_ASSIGNMENT_VERSION` | Authorization version; a higher value clears only `/data/dsh/remote` |
| `DSH_CLOUD_ASSIGNED` | `true` enables registration and the Remote Host plugin |
| `DSH_REMOTE_SERVER_URL` | HTTPS origin of the Server; other URL shapes are rejected |
| `DSH_CLOUD_BOOTSTRAP_TOKEN_FILE` | Bootstrap token file, default `/run/dsh-bootstrap/token` |
| `DSH_REMOTE_LOG_LEVEL` | `debug` / `info` / `warn` / `error`; invalid values abort startup |
| `DSH_PORT` | Loopback Web port, integer 1024-65535, default `3080` |

`/data` is the persistent volume (`/data/dsh` state and Remote identity, `/data/workspace` working
directory, `/data/home` home). `cloud-state.json` refuses to reuse a volume that belongs to another
instance or Server. The container runs as UID/GID 1000, the Web UI listens on `127.0.0.1` only, and
transport falls back to the Server Relay when WebRTC cannot be negotiated. Terminal is enabled;
Codex, Cursor and ACP stay disabled because those backends are not installed in the image. Model API
keys and registry credentials are never baked into the image.

Image tags and behavior changes are recorded in `CHANGELOG.md`. The controller, Kubernetes
templates and end-to-end cloud-instance documentation live in the Server repository.
