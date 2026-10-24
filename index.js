/**
 * Plugin Steward — Host half.
 *
 * The browser half manages installed bundles through the generated
 * `pluginManager` Remote namespace. This Host half adds the pieces Remote does
 * not provide: a cached npm update check, plus an update operation that removes
 * the old bundle, installs the exact new version, and reinstalls the old version
 * if anything after the removal fails. Both routes are same-origin only; the
 * update route additionally requires a JSON body and a private request header.
 */

const ROUTE_PATH = '/dsh-plugin-steward/updates'
const UPDATE_ROUTE_PATH = '/dsh-plugin-steward/update'
const CACHE_TTL_MS = 10 * 60 * 1000
const FETCH_TIMEOUT_MS = 7000
const UPDATE_BODY_BYTES = 8192
const SELF_PACKAGE = '@local/dsh-plugin-steward'
const PUBLIC_REGISTRIES = new Set([
  'https://registry.npmjs.org',
  'https://registry.npmmirror.com',
])
const EXTERNAL_SOURCE = /^(?:file|link|workspace|portal|git\+|git:|github:|gitlab:|bitbucket:|https?:|npm:)/i
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export const name = 'dsh-plugin-steward'
export const inject = ['pluginManager']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  /** @type {{ checkedAt: number, registries: string[], packages: Record<string, unknown> } | null} */
  let cache = null
  /** @type {Promise<unknown> | null} */
  let pending = null
  let generation = 0
  let updating = false

  ctx.effect(
    () => ctx.on('plugin-manager/changed', () => {
      generation += 1
      cache = null
    }),
    'dsh-plugin-steward: invalidate update cache',
  )

  const load = (force) => {
    if (!force && cache !== null && Date.now() - cache.checkedAt < CACHE_TTL_MS) {
      return Promise.resolve({ ...cache, cached: true })
    }
    if (pending !== null) return pending
    const startedAt = generation
    const run = computeUpdates(ctx).then((data) => {
      if (startedAt === generation) cache = data
      return { ...data, cached: false }
    })
    pending = run
    run.then(
      () => { if (pending === run) pending = null },
      () => { if (pending === run) pending = null },
    )
    return run
  }

  const serve = async (req, res) => {
    if (!isTrustedRequest(req)) {
      sendJson(res, 403, { error: 'forbidden' })
      return
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }

    let force = false
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      force = url.searchParams.get('refresh') === '1'
    } catch {
      // A malformed URL is answered by the ordinary cached read.
    }

    try {
      const data = await load(force)
      sendJson(res, 200, data)
    } catch (error) {
      try {
        ctx.logger?.error?.(error)
      } catch {
        // Logging a failed check must not turn into a second failure.
      }
      sendJson(res, 500, { error: 'update-check-failed' })
    }
  }

  const serveUpdate = async (req, res) => {
    if (!isTrustedRequest(req)) {
      sendJson(res, 403, { error: 'forbidden' })
      return
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }

    const marker = String(req.headers?.['x-plugin-steward-update'] || '')
    if (marker !== '1') {
      sendJson(res, 403, { error: 'missing-update-intent' })
      return
    }
    const contentType = String(req.headers?.['content-type'] || '').toLowerCase()
    if (!contentType.startsWith('application/json')) {
      sendJson(res, 415, { error: 'unsupported-media-type' })
      return
    }
    if (updating) {
      sendJson(res, 409, { error: 'update-in-progress' })
      return
    }

    // Package operations can legitimately outlive the default HTTP socket
    // timeout, and the operation owns its own rollback after a disconnect.
    try {
      req.setTimeout?.(0)
      res.setTimeout?.(0)
    } catch {
      // Timeout helpers are best-effort on alternative carriers.
    }

    let body = null
    try {
      body = await readJsonBody(req, UPDATE_BODY_BYTES)
    } catch (error) {
      const status = error?.code === 'body-too-large' ? 413 : 400
      sendJson(res, status, { error: error?.code || 'invalid-body' })
      return
    }
    if (body === null || typeof body !== 'object') {
      sendJson(res, 400, { error: 'invalid-body' })
      return
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const version = typeof body.version === 'string' ? body.version.trim() : ''
    if (!isPackageName(name) || version.length > 64 || parseVersion(version) === null) {
      sendJson(res, 400, { error: 'invalid-target' })
      return
    }
    if (updating) {
      sendJson(res, 409, { error: 'update-in-progress' })
      return
    }

    updating = true
    try {
      const result = await performUpdate(ctx, load, name, version)
      sendJson(res, 200, { ok: true, result })
    } catch (error) {
      const expected = error?.code === 'invalid-target' || error?.code === 'not-updatable'
        || error?.code === 'version-changed' || error?.code === 'not-installed'
        || error?.code === 'read-only' || error?.code === 'external-source'
      if (!expected) {
        try {
          ctx.logger?.error?.(error)
        } catch {
          // Keep the response path independent from logging.
        }
      }
      const status = expected ? 409 : 500
      const detail = truncate(messageOf(error), 600)
      sendJson(res, status, {
        error: error?.code || 'update-failed',
        detail,
        reason: detail,
      })
    } finally {
      updating = false
    }
  }

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'exact',
        path: ROUTE_PATH,
        handler: serve,
      }),
      'dsh-plugin-steward: update check route',
    )
    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'exact',
        path: UPDATE_ROUTE_PATH,
        handler: serveUpdate,
      }),
      'dsh-plugin-steward: update action route',
    )
  })
}

/**
 * Remove the old bundle, install the exact version the user saw, and put the
 * old version back if anything after the removal fails. The update cache is the
 * authority for the target version, so the browser cannot ask for an arbitrary
 * package, registry, or downgrade.
 */
async function performUpdate(ctx, load, name, requestedVersion) {
  const updates = await load(false)
  const info = updates?.packages?.[name]
  if (!info || info.status !== 'update') {
    throw updateProblem('not-updatable', 'No newer version is known for this package.')
  }
  if (info.latest !== requestedVersion) {
    throw updateProblem('version-changed', 'The available version changed; check for updates again.')
  }

  const fromVersion = typeof info.current === 'string' ? info.current : null
  const fromParsed = parseVersion(fromVersion)
  const toParsed = parseVersion(requestedVersion)
  if (fromParsed === null || toParsed === null || compareVersions(toParsed, fromParsed) <= 0) {
    throw updateProblem('invalid-target', 'The requested version is not newer.')
  }

  const bundles = await ctx.pluginManager.listBundles()
  const bundle = Array.isArray(bundles) ? bundles.find((candidate) => candidate?.name === name) : undefined
  if (!bundle || bundle.installed !== true || bundle.availability !== 'profile') {
    throw updateProblem('not-installed', 'The bundle is not installed from the profile.')
  }
  if (bundle.name === SELF_PACKAGE) {
    throw updateProblem('read-only', 'Plugin Steward does not update itself.')
  }
  if (bundle.readOnlyReason !== undefined || bundle.removable !== true) {
    throw updateProblem('read-only', 'The plugin manager does not allow this bundle to be updated.')
  }
  if (bundle.version !== fromVersion) {
    throw updateProblem('version-changed', 'The installed version changed; check for updates again.')
  }

  const source = typeof bundle.source === 'string' ? bundle.source.trim() : ''
  if (source === '' || EXTERNAL_SOURCE.test(source) || name.startsWith('@local/')) {
    throw updateProblem('external-source', 'Only registry packages can be updated automatically.')
  }

  const enabled = bundle.enabled === true
  const registry = typeof info.registry === 'string' && /^https?:\/\//i.test(info.registry)
    ? info.registry
    : undefined
  const stages = []
  let failure = null
  let deferredRemoval = false
  let installAttempted = false

  try {
    const removed = await ctx.pluginManager.removeBundle(name)
    stages.push(stageOf('remove', removed))
    if (!removalAccepted(removed)) {
      throw updateProblem('remove-failed', changeReason(removed))
    }
    // A running host module can be removed from the profile now but stay in
    // memory until the next start. That is a deferred success, not a failure:
    // continue installing the new version so the restart picks it up.
    deferredRemoval = removed.application === 'restart-required'

    installAttempted = true
    const installed = await ctx.pluginManager.installBundle(
      `${name}@${requestedVersion}`,
      installOptions(enabled, registry),
    )
    stages.push(stageOf('install', installed))
    if (!installSucceeded(installed)) {
      throw updateProblem('install-failed', changeReason(installed))
    }

    const after = await ctx.pluginManager.listBundles()
    const current = Array.isArray(after) ? after.find((candidate) => candidate?.name === name) : undefined
    if (current?.version !== requestedVersion && installed.version !== requestedVersion) {
      throw updateProblem('verify-failed', 'The installed version did not become the requested version.')
    }

    const restartRequired = deferredRemoval || installed.application === 'restart-required'
    return {
      status: restartRequired ? 'restart-required' : 'updated',
      name,
      fromVersion,
      toVersion: requestedVersion,
      enabled,
      registry: registry || null,
      restartRequired,
      restartReason: installed.restartReason || removed.restartReason,
      deferredRemoval,
      overridden: installed.application === 'overridden',
      stages,
    }
  } catch (error) {
    failure = error
  }

  // Only a failed install can have left a new version behind. If removal
  // itself failed or was deferred, the package on disk is still the old one;
  // skip cleanup and let rollback restore its selection.
  if (installAttempted) {
    try {
      const cleanup = await ctx.pluginManager.removeBundle(name)
      stages.push(stageOf('cleanup', cleanup))
    } catch (error) {
      stages.push({ stage: 'cleanup', error: truncate(messageOf(error), 600) })
    }
  }

  let rollback = null
  let rollbackError = null
  try {
    rollback = await ctx.pluginManager.installBundle(
      `${name}@${fromVersion}`,
      installOptions(enabled, registry),
    )
    stages.push(stageOf('rollback', rollback))
    if (!installSucceeded(rollback)) rollbackError = changeReason(rollback)
  } catch (error) {
    rollbackError = messageOf(error)
    stages.push({ stage: 'rollback', error: truncate(rollbackError, 600) })
  }

  // A retry can report "already installed" after a partial cleanup; the
  // profile's actual version is the final authority on whether rollback worked.
  let restored = false
  try {
    const after = await ctx.pluginManager.listBundles()
    const current = Array.isArray(after) ? after.find((candidate) => candidate?.name === name) : undefined
    restored = current?.installed === true && current?.version === fromVersion
  } catch {
    // The rollback stage already carries the useful diagnostic.
  }

  if (restored || (rollback !== null && installSucceeded(rollback))) {
    return {
      status: 'rolled-back',
      name,
      fromVersion,
      toVersion: requestedVersion,
      enabled,
      registry: registry || null,
      rollbackRestartRequired: rollback?.application === 'restart-required',
      reason: failure?.message || 'The update failed.',
      failure: problemOf(failure),
      stages,
    }
  }

  return {
    status: 'rollback-failed',
    name,
    fromVersion,
    toVersion: requestedVersion,
    enabled,
    registry: registry || null,
    reason: failure?.message || 'The update failed.',
    failure: problemOf(failure),
    rollbackError: truncate(rollbackError || 'The old version could not be reinstalled.', 600),
    rollbackReason: truncate(rollbackError || 'The old version could not be reinstalled.', 600),
    stages,
  }
}

function updateProblem(code, detail) {
  const error = new Error(detail)
  error.code = code
  return error
}

function installOptions(enabled, registry) {
  const options = { enabled, saveExact: true }
  if (typeof registry === 'string' && registry !== '') options.registry = registry
  return options
}

function removalAccepted(change) {
  return change?.changed === true
    && change?.error === undefined
    && (change?.application === 'applied' || change?.application === 'restart-required')
}

function installSucceeded(change) {
  if (change?.changed !== true || change?.error !== undefined) return false
  return change.application === 'applied'
    || change.application === 'restart-required'
    || change.application === 'overridden'
}

function changeReason(change) {
  if (change?.error) return managementError(change.error)
  if (change?.application === 'restart-required') return 'The change needs a restart.'
  if (change?.application === 'overridden') return 'A higher-priority layer overrides the change.'
  if (change?.application === 'cancelled') return 'The change was cancelled.'
  return 'The plugin manager did not apply the change.'
}

function managementError(error) {
  const code = typeof error?.code === 'string' ? error.code : 'operation-error'
  const diagnostic = typeof error?.diagnostic === 'string' ? error.diagnostic : ''
  return diagnostic === '' ? code : `${code}: ${truncate(diagnostic, 500)}`
}

function problemOf(error) {
  if (!error) return null
  return {
    code: typeof error.code === 'string' ? error.code : 'update-failed',
    detail: truncate(messageOf(error), 600),
  }
}

function stageOf(stage, change) {
  const entry = {
    stage,
    changed: change?.changed === true,
    application: typeof change?.application === 'string' ? change.application : null,
  }
  if (change?.error) entry.error = managementError(change.error)
  if (typeof change?.restartReason === 'string' && change.restartReason !== '') {
    entry.restartReason = change.restartReason
  }
  if (Array.isArray(change?.warnings) && change.warnings.length > 0) {
    entry.warnings = change.warnings.slice(0, 3).map((warning) => truncate(String(warning), 300))
  }
  return entry
}

async function readJsonBody(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) {
      const error = new Error('Request body is too large.')
      error.code = 'body-too-large'
      throw error
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Request body is not valid JSON.')
    error.code = 'invalid-json'
    throw error
  }
}

function isPackageName(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 214
    && /^(?:@[A-Za-z0-9][A-Za-z0-9._~-]*\/)?[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(value)
}

function truncate(value, limit) {
  const text = String(value)
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`
}

/**
 * Read the profile's installed bundles and compare each registry package with
 * its registry's `latest` dist-tag. Local, linked, git and archived installs
 * are reported as `local` instead of pretending a registry can update them.
 */
async function computeUpdates(ctx) {
  const all = await ctx.pluginManager.listBundles()
  const installed = all.filter((bundle) => (
    bundle.installed === true
    && bundle.availability === 'profile'
    && bundle.name !== SELF_PACKAGE
  ))
  const registries = await registryUrls(ctx)
  const packages = {}

  await Promise.all(installed.map(async (bundle) => {
    packages[bundle.name] = await inspectBundle(bundle, registries)
  }))

  return {
    checkedAt: Date.now(),
    registries,
    packages,
  }
}

async function inspectBundle(bundle, registries) {
  const current = typeof bundle.version === 'string' && bundle.version !== ''
    ? bundle.version
    : null
  const source = typeof bundle.source === 'string' ? bundle.source.trim() : ''

  if (EXTERNAL_SOURCE.test(source) || bundle.name.startsWith('@local/')) {
    return {
      status: 'local',
      current,
      latest: null,
      source,
      reason: 'external-source',
    }
  }

  if (current === null) {
    return {
      status: 'unknown',
      current: null,
      latest: null,
      source,
      reason: 'missing-version',
    }
  }

  if (parseVersion(current) === null) {
    return {
      status: 'unknown',
      current,
      latest: null,
      source,
      reason: 'unreadable-version',
    }
  }

  let lastError = null
  for (const registry of registries) {
    try {
      const latest = await readLatest(registry, bundle.name)
      if (latest === null) {
        lastError = 'no-latest-tag'
        continue
      }
      const latestParsed = parseVersion(latest)
      if (latestParsed === null) {
        lastError = 'unreadable-latest-version'
        continue
      }
      const currentParsed = parseVersion(current)
      const status = compareVersions(latestParsed, currentParsed) > 0 ? 'update' : 'current'
      return {
        status,
        current,
        latest,
        source,
        registry,
      }
    } catch (error) {
      lastError = messageOf(error)
    }
  }

  return {
    status: 'unknown',
    current,
    latest: null,
    source,
    reason: lastError || 'no-registry-answered',
  }
}

/**
 * Build the registry order. A configured private registry is asked alone so
 * installing from it never leaks package names to a public fallback.
 */
async function registryUrls(ctx) {
  const urls = []
  const add = (value) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(trimmed)) return
    if (!urls.includes(trimmed)) urls.push(trimmed)
  }

  let info = null
  try {
    info = await ctx.pluginManager.registries()
  } catch {
    // The default public registry remains a useful last resort.
  }

  const primary = typeof info?.resolved === 'string' && info.resolved !== ''
    ? info.resolved
    : (typeof info?.registry === 'string' && info.registry !== '' ? info.registry : null)

  if (primary !== null) {
    add(primary)
    const normalized = primary.trim().replace(/\/+$/, '')
    if (!PUBLIC_REGISTRIES.has(normalized)) return urls
    for (const fallback of Array.isArray(info?.fallbackRegistries) ? info.fallbackRegistries : []) {
      add(fallback)
    }
  } else if (Array.isArray(info?.fallbackRegistries)) {
    for (const fallback of info.fallbackRegistries) add(fallback)
  }

  add('https://registry.npmjs.org/')
  return urls
}

async function readLatest(registry, name) {
  const base = registry.trim().replace(/\/+$/, '')
  const encoded = encodeURIComponent(name)

  try {
    const tags = await fetchJson(`${base}/-/package/${encoded}/dist-tags`)
    if (typeof tags?.latest === 'string' && tags.latest !== '') return tags.latest
  } catch {
    // Some registries expose only the packument; fall through to it once.
  }

  const packument = await fetchJson(
    `${base}/${encoded}`,
    'application/vnd.npm.install-v1+json',
  )
  const latest = packument?.['dist-tags']?.latest
  return typeof latest === 'string' && latest !== '' ? latest : null
}

async function fetchJson(url, accept = 'application/json') {
  const response = await fetch(url, {
    headers: {
      accept,
      'user-agent': 'dsh-plugin-steward/1.0.0',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json()
}

function parseVersion(value) {
  if (typeof value !== 'string') return null
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim())
  if (match === null) return null
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] === undefined ? [] : match[4].split('.'),
  }
}

function compareVersions(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  if (a.pre.length === 0) return 1
  if (b.pre.length === 0) return -1

  const length = Math.max(a.pre.length, b.pre.length)
  for (let index = 0; index < length; index += 1) {
    const left = a.pre[index]
    const right = b.pre[index]
    if (left === undefined) return -1
    if (right === undefined) return 1
    if (left === right) continue
    const leftNumeric = /^\d+$/.test(left)
    const rightNumeric = /^\d+$/.test(right)
    if (leftNumeric && rightNumeric) return Number(left) > Number(right) ? 1 : -1
    if (leftNumeric) return -1
    if (rightNumeric) return 1
    return left > right ? 1 : -1
  }
  return 0
}

function isTrustedRequest(req) {
  const hostHeader = String(req.headers?.host || '')
  if (hostHeader === '') return false

  const closeBracket = hostHeader.indexOf(']')
  const host = hostHeader.startsWith('[') && closeBracket > 0
    ? hostHeader.slice(1, closeBracket)
    : hostHeader.split(':')[0]
  if (!LOOPBACK_HOSTS.has(host.toLowerCase())) return false

  const site = String(req.headers?.['sec-fetch-site'] || '').toLowerCase()
  if (site !== '' && site !== 'same-origin') return false

  const origin = req.headers?.origin
  if (typeof origin === 'string' && origin !== '') {
    try {
      if (new URL(origin).host !== hostHeader) return false
    } catch {
      return false
    }
  }
  return true
}

function sendJson(res, status, payload) {
  if (!res || res.writableEnded === true || res.destroyed === true) return
  try {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(body)
  } catch {
    // A disconnected browser must not abort the Host-side update or rollback.
  }
}

function messageOf(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}
