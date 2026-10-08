# TROUBLESHOOTING.md (for the installing/operating agent)

Real failure modes hit by the first deployment. Read before improvising.

## The node trap (CRITICAL)

Some VPS setups have `/usr/local/bin/node` as a **symlink into another tool's
private node runtime** (the original author's pointed into a deleted agent
harness). Symptoms: after deleting/reinstalling something, `env node` fails,
systemd node services die on restart with "No such file or directory".

Rules:

- Check `readlink -f /usr/local/bin/node` before deleting anything that could
  own it. If it points inside some tool's directory, replace it with a real
  install: NodeSource Node 24 + `ln -sf "$(command -v node)" /usr/local/bin/node`.
- Several systemd services may ExecStart through `/usr/local/bin/node` — after
  any node version jump, **restart them and `npm rebuild` apps with native
  modules** (error signature: `ERR_DLOPEN_FAILED`).

## Bot does not answer

Checklist, in order:

1. `systemctl is-active dsh-web` — if inactive: `journalctl -u dsh-web -n 40`.
2. `~/.dsh/dsh-telegram/status.json` → `"state"` must be `"connected"`.
3. `~/.dsh/dsh-telegram/failures.json` → recent errors with human messages.
4. **Unclaimed bot**: until the owner sends `/claim <code>` (code in
   `~/.dsh/dsh-telegram/claim-code.txt`), the bot answers nobody. The code
   ROTATES on every service restart.
5. Test the token itself: `curl https://api.telegram.org/bot<TOKEN>/getMe`.
6. If `getUpdates` returns HTTP 409 from your own test call, another poller is
   running — that's fine, it means the bot IS connected.

## "DeepSeek Messages transport failed" (model calls dying)

Retries exhausted at the transport layer = the VPS cannot reach
`api.deepseek.com` (or the configured provider). Check basic egress first
(`curl -sI https://api.deepseek.com`), then any routing experiment that may be
active (exit nodes, proxies, VPNs). A **Tailscale exit node routes ALL egress
through another machine** — if that machine's internet dies, every API call and
every public website served by this box dies with it.

## Public websites/SSH on the same VPS: the port lesson

If the VPS already serves sites on 80/443 (docker, caddy, nginx):

- NEVER bind new software to `0.0.0.0:80/443` — check what's listening first
  (`ss -tlnp | grep -E ':80 |:443 '`). Bind a specific IP or another port.
- If the box runs **Tailscale with `tailscale serve`**, Tailscale holds 443 on
  its tailnet IP: a `0.0.0.0:443` bind will fail at boot with
  "address already in use" (possibly breaking a caddy that binds all IPs).
  Bind to the public IP explicitly instead.
- After ANY reboot: verify web/other critical services actually came back
  (containers with restart policies, port bindings intact).

## Editing single-file bind mounts (docker)

`sed -i` on a file that is bind-mounted **into a container replaces the inode**:
the container keeps seeing the OLD content. To edit: `cp f f.new && edit f.new &&
cat f.new > f` (preserves inode), or edit and recreate the container.

## pnpm / plugin version conflicts

`dsh plugin add` refuses peer-dependency mismatches. Preferred order:
(a) use a plugin version matching the installed dsh; (b) if the plugin is only
published for an older dsh, use the official exemption:
`dsh plugin --profile web allow-version <pkg>@<ver> --dsh-version <dshver> --accept-risk`.
Known-good combo this repo was tested with: dsh `0.2.0-rc.2` +
`@sympoies/dsh-telegram` `0.7.0` fork (see plugins/MODIFICACIONES.md — includes
one benign `settings.register` warning at startup).

## systemd-run watchdog pattern (for anything that flips routing)

If a script changes system state that can cut your own access (routes, firewall):
**arm the rollback timer BEFORE making the change**, and abort if arming fails.
`systemd-run` talks to local systemd — it works even when the network doesn't,
but only if you create it before the network breaks.

## The bot command menu (the phone's `/` list)

The menu shown when the owner types `/` in Telegram is NOT read from the plugin's
`COMMANDS`: it is published to the Bot API with `setMyCommands`. `install.sh`
publishes `install/bot-commands.json` (Spanish descriptions) at the end of the
installation. Consequences:

- A command that exists in the plugin's `COMMANDS` but not in that JSON **works**
  when typed, but does not appear in the list. When you add a command (e.g. the
  `/cambiarproyecto` project picker), add it to `install/bot-commands.json` too
  and republish.
- Republishing is one call, no restart needed:
  `curl -s -F "commands=<install/bot-commands.json" "https://api.telegram.org/bot<TOKEN>/setMyCommands"`.
- A **more specific scope shadows the default one**: if a previous installation
  registered commands for `all_private_chats` or `all_group_chats`, the phone
  keeps showing those and ignoring the default scope. Check with
  `getMyCommands` (pass `{"scope":{"type":"all_private_chats"}}`) and clear the
  stale scope with `deleteMyCommands` before republishing.
- Only the owner can talk to the bot, so this is cosmetic — but a stale menu
  makes the owner think commands are broken.
