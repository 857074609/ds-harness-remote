# Cloud host image changelog

## dsh-0.2.0-rc.2-remote-0.5.7-20261015-remote-config-v2

- Remove the force-Relay environment override; overlay fixes `forceRelay: false`, allowing WebRTC negotiation and normal transport fallback.
- Log-level and Web-port settings remain unchanged.

## dsh-0.2.0-rc.2-remote-0.5.7-20261015-remote-config

- Default enables WebRTC negotiation instead of forcing server Relay. Set `DSH_REMOTE_FORCE_RELAY=true` to force Relay (retains ice-fix behavior).
- Add `DSH_REMOTE_LOG_LEVEL`: debug/info/warn/error, default info. Empty uses info. Debug diagnostics require actual negotiation; logs may contain network addresses. Restore info after troubleshooting.
- Add `DSH_PORT`: integer 1024-65535, default 3080. Web remains bound to 127.0.0.1; this does not configure ICE UDP ports or enable host networking.
- Invalid log levels and ports fail before authorization or persistent state changes, with a specific safe error.
- Other overlay settings and create-only profile initialization remain unchanged.
- DSH and Remote package versions remain 0.2.0-rc.2 and 0.5.7.
- Controller environment injection, existing-instance upgrade APIs, and hostNetwork deployment are outside this image change.
