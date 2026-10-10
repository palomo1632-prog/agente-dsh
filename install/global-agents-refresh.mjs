#!/usr/bin/env node
/**
 * global-agents-refresh.mjs — keep the "## Capacidades activas" section of the
 * global instruction file (`$DSH_HOME/AGENTS.md`) in sync with what is really
 * installed on this machine.
 *
 * DSH injects that file into EVERY session of EVERY project, so it must list only
 * capabilities that are actually available, and it must stay short (25 lines).
 * Inactive extras (no proxy, no Whisper, ...) must NOT appear: a line promising
 * something the machine cannot do is worse than no line at all.
 *
 * Only that one section is rewritten. The owner's profile written by the welcome
 * interview is never touched. Idempotent: same machine, same file.
 *
 * Usage:
 *   node global-agents-refresh.mjs [--home DIR] [--dry-run] [--quiet]
 *   --home DIR   treat DIR as $DSH_HOME (default: $DSH_HOME or ~/.dsh)  [testing]
 *   --dry-run    print what would change, write nothing
 *
 * Exit codes: 0 ok (also when over the line cap, with a warning), 1 on failure.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const MAX_LINES = 25
const SECTION = '## Capacidades activas'
const CAPS_MARKER = '<!-- CAPACIDADES — PENDIENTE'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name, fallback) => {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const HOME = homedir()
const DSH_HOME = value('--home', process.env.DSH_HOME || join(HOME, '.dsh'))
const FILE = join(DSH_HOME, 'AGENTS.md')
const dryRun = flag('--dry-run')
const quiet = flag('--quiet')

const ok = (fn) => {
  try {
    return fn() === true
  } catch {
    return false
  }
}

/** systemd unit active? (no systemd, no error: just false) */
function unitActive(name) {
  return ok(() => {
    execFileSync('systemctl', ['is-active', '--quiet', name], { stdio: 'ignore' })
    return true
  })
}

/** python module importable by any interpreter we can find */
function pythonHas(module) {
  for (const bin of ['python3', 'python']) {
    if (ok(() => {
      execFileSync(bin, ['-c', `import ${module}`], { stdio: 'ignore' })
      return true
    })) return true
  }
  return false
}

/** the Telegram voice-note bridge configured in the harness patch layer? */
function speechPatchConfigured() {
  return ok(() => /tokenRef:\s*ELEVENLABS_API_KEY/.test(readFileSync(join(DSH_HOME, 'cordis.patch.yml'), 'utf8')))
}

/** camoufox browser payload fetched (the python package may live in any venv) */
function camoufoxFetched() {
  const cache = join(HOME, '.cache', 'camoufox')
  return ok(() => existsSync(join(cache, 'browsers')) && readdirSync(join(cache, 'browsers')).length > 0)
}

/** a residential proxy is configured if the env file carries a value */
function proxyConfigured() {
  return ok(() => {
    const text = readFileSync(join(HOME, '.dsh-proxy.env'), 'utf8')
    return /^RESIDENTIAL_PROXY=\S/m.test(text)
  })
}

/** One short line per capability that is genuinely available. */
function detect() {
  const lines = []
  if (unitActive('elevenlabs-stt') || speechPatchConfigured()) {
    lines.push('- Notas de voz: ElevenLabs (los audios de Telegram se transcriben solos)')
  }
  if (unitActive('whisper-stt') || pythonHas('faster_whisper')) {
    lines.push('- Notas de voz: Whisper local (transcribe sin depender de terceros)')
  }
  if (camoufoxFetched() || pythonHas('camoufox')) {
    lines.push('- Navegador antidetect: Camoufox (usalo cuando un sitio bloquee el navegador comun)')
  }
  if (proxyConfigured()) {
    lines.push('- Proxy residencial: configurado — `curl -x` para ese comando; credenciales en ~/.dsh-proxy.env; nunca routing global')
  }
  return lines
}

/** Replace the section body, keeping every other byte of the file. */
function rewrite(text, body) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.trim() === SECTION)
  const block = [SECTION, '', ...body]
  if (start === -1) {
    const trimmed = lines.join('\n').replace(/\n*$/, '\n')
    return `${trimmed}\n${block.join('\n')}\n`
  }
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ')) {
      end = i
      break
    }
  }
  // keep the blank line that separated the section from the next one
  const tail = lines.slice(end)
  const head = lines.slice(0, start)
  return [...head, ...block, '', ...tail].join('\n').replace(/\n{3,}/g, '\n\n')
}

function main() {
  if (!existsSync(FILE)) {
    process.stderr.write(`global-agents-refresh: ${FILE} does not exist — run the installer first\n`)
    process.exit(1)
  }
  const before = readFileSync(FILE, 'utf8')
  const found = detect()
  const body = found.length > 0 ? found : ['- (ninguna todavia)']
  const after = rewrite(before, body)

  if (before === after) {
    if (!quiet) {
      process.stdout.write(`global-agents: sin cambios (${found.length} capacidad(es) activa(s))\n`)
      found.forEach((line) => process.stdout.write(`  ${line}\n`))
    }
  } else if (dryRun) {
    process.stdout.write(`--- would write ${FILE} ---\n${after}`)
  } else {
    writeFileSync(FILE, after, { mode: 0o644 })
    if (!quiet) {
      process.stdout.write(`global-agents: actualizado (${found.length} capacidad(es) activa(s))\n`)
      found.forEach((line) => process.stdout.write(`  ${line}\n`))
    }
  }

  const count = (dryRun ? after : readFileSync(FILE, 'utf8')).split('\n').length - 1
  if (count > MAX_LINES) {
    process.stderr.write(`WARN: ${FILE} has ${count} lines (cap ${MAX_LINES}) — trim it, it loads in every session\n`)
  }
  if (!dryRun) {
    const text = readFileSync(FILE, 'utf8')
    if (text.includes(CAPS_MARKER)) {
      process.stderr.write('WARN: the CAPACIDADES placeholder is still in the file — replace it\n')
    }
  }
}

main()
