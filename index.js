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

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const ROUTE_PATH = '/dsh-plugin-steward/updates'
const UPDATE_ROUTE_PATH = '/dsh-plugin-steward/update'
const STATUS_ROUTE_PATH = '/dsh-plugin-steward/update/status'
const GITHUB_API = 'https://api.github.com'
const CACHE_TTL_MS = 10 * 60 * 1000
const FETCH_TIMEOUT_MS = 7000
const UPDATE_BODY_BYTES = 8192
const SELF_PACKAGE = '@local/dsh-plugin-steward'
const STEWARD_VERSION = '1.2.3'
const PUBLIC_REGISTRIES = new Set([
  'https://registry.npmjs.org/',
  'https://registry.npmmirror.com/',
])
/** Bound one registry installation attempt; a stalled registry is cancelled, not waited out. */
const UPDATE_ATTEMPT_TIMEOUT_MS = 4 * 60 * 1000
/** Bound the tarball reachability check made before the old version is removed. */
const UPDATE_PREFLIGHT_TIMEOUT_MS = 12 * 1000
/** Bound how long cancellation may take before the next attempt starts anyway. */
const UPDATE_CANCEL_WAIT_MS = 30 * 1000
/** Let the profile finish starting before an interrupted update is recovered. */
const UPDATE_RECOVERY_DELAY_MS = 10 * 1000
const JOURNAL_VERSION = 1
const JOURNAL_FILE = 'steward-pending-update.json'
/** Live update job, persisted so a self-update reload can hand it to the new module. */
const JOB_FILE = 'steward-update-job.json'
const JOB_VERSION = 1
const JOB_TTL_MS = 10 * 60 * 1000
const JOB_POLL_MS = 500
/** Ordered step ids; the client localizes them. */
const JOB_STEPS = {
  normal: ['check', 'preflight', 'journal', 'remove', 'install', 'verify', 'finish'],
  self: ['check', 'preflight', 'journal', 'selfInstall', 'verify', 'reload'],
}
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
  let restoringJob = false
  /** @type {ReturnType<typeof createJob> | null} */
  let currentJob = null

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

  const serveStatus = async (req, res) => {
    if (!isTrustedRequest(req)) {
      sendJson(res, 403, { error: 'forbidden' })
      return
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    let id = ''
    try {
      id = new URL(req.url || '/', 'http://localhost').searchParams.get('id') || ''
    } catch {
      // An unreadable id is answered by the current job.
    }
    if (currentJob === null) {
      const stored = await readJob(ctx)
      if (stored !== null && stored.done && Date.now() - (stored.updatedAt || 0) <= JOB_TTL_MS) {
        currentJob = stored
      }
    }
    if (currentJob === null) {
      sendJson(res, 404, { error: 'no-job' })
      return
    }
    if (id !== '' && id !== currentJob.id) {
      sendJson(res, 404, { error: 'job-not-found' })
      return
    }
    sendJson(res, 200, { ok: true, job: jobSnapshot(currentJob) })
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

    let wait = false
    let asyncJob = false
    try {
      wait = new URL(req.url || '/', 'http://localhost').searchParams.get('wait') === '1'
    } catch {
      // A malformed URL still runs the job with the body's mode.
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
    if (body.wait === true) wait = true
    // Only the 1.2.2+ client asks for a job. An older page keeps the synchronous
    // response it expects, so a refresh is never required for correctness.
    if (body.job === true) asyncJob = true

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const version = typeof body.version === 'string' ? body.version.trim() : ''
    if (!isPackageName(name) || version.length > 64 || parseVersion(version) === null) {
      sendJson(res, 400, { error: 'invalid-target' })
      return
    }
    if (updating || restoringJob) {
      sendJson(res, 409, { error: 'update-in-progress' })
      return
    }
    if (currentJob !== null && !currentJob.done
      && Date.now() - (currentJob.updatedAt || 0) < 30 * 60 * 1000) {
      sendJson(res, 409, { error: 'update-in-progress' })
      return
    }
    if (currentJob !== null) {
      await clearJob(ctx)
      currentJob = null
    }

    // Package operations can legitimately outlive the default HTTP socket
    // timeout; the asynchronous job owns its own rollback after a disconnect.
    try {
      req.setTimeout?.(0)
      res.setTimeout?.(0)
    } catch {
      // Timeout helpers are best-effort on alternative carriers.
    }

    const job = createJob({
      name,
      version,
      fromVersion: null,
      self: name === SELF_PACKAGE,
    })
    currentJob = job
    updating = true
    await persistJob(ctx, job)

    const run = (async () => {
      try {
        const result = await performUpdate(ctx, load, name, version, job)
        finishJob(job, result)
        await persistJob(ctx, job)
        return result
      } catch (error) {
        failJob(job, error)
        await persistJob(ctx, job)
        throw error
      } finally {
        updating = false
      }
    })()

    if (wait || !asyncJob) {
      try {
        await run
        sendJson(res, 200, { ok: true, result: job.result })
      } catch (error) {
        if (!isExpectedUpdateError(error)) {
          try {
            ctx.logger?.error?.(error)
          } catch {
            // Keep the response path independent from logging.
          }
        }
        const detail = truncate(messageOf(error), 600)
        sendJson(res, isExpectedUpdateError(error) ? 409 : 500, {
          error: error?.code || 'update-failed',
          detail,
          reason: detail,
        })
      }
      return
    }

    // A browser refresh or a self-update reload must not turn into an
    // unhandled rejection; the result is read from the status route.
    run.catch(() => {})
    sendJson(res, 202, { ok: true, jobId: job.id, job: jobSnapshot(job) })
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
    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'exact',
        path: STATUS_ROUTE_PATH,
        handler: serveStatus,
      }),
      'dsh-plugin-steward: update status route',
    )
  })

  const restoreJobState = async () => {
    if (currentJob !== null || updating) return
    restoringJob = true
    try {
      const saved = await readJob(ctx)
      if (saved === null) return
      if (saved.done) {
        if (Date.now() - (saved.updatedAt || 0) > JOB_TTL_MS) {
          await clearJob(ctx)
          return
        }
        currentJob = saved
        return
      }
      if (Date.now() - (saved.startedAt || 0) > 30 * 60 * 1000) {
        await clearJob(ctx)
        return
      }
      let bundle = null
      try {
        bundle = await findInstalledBundle(ctx, saved.name)
      } catch {
        bundle = null
      }
      const result = inferJobResult(saved, bundle)
      const job = {
        ...saved,
        done: true,
        phase: result.status === 'failed' ? 'failed' : 'done',
        result,
        error: result.failure || null,
        updatedAt: Date.now(),
      }
      if (job.phase === 'done') {
        job.step = job.steps.length - 1
        for (const step of job.steps) step.state = 'done'
      } else {
        const active = job.steps.find((step) => step.state === 'active')
        if (active !== undefined) active.state = 'error'
      }
      currentJob = job
      await persistJob(ctx, job)
    } finally {
      restoringJob = false
    }
  }

  ctx.effect(() => {
    const timer = setTimeout(() => { void restoreJobState() }, 1200)
    if (typeof timer.unref === 'function') timer.unref()
    return () => clearTimeout(timer)
  }, 'dsh-plugin-steward: restore an update job after a reload')

  // An update that is interrupted between removeBundle and installBundle would
  // otherwise leave the plugin deleted. The journal is written before removal
  // and cleared only once the profile is back in a known-good state, so a
  // restart can finish the rollback the killed process started.
  const recoverInterruptedUpdate = async () => {
    if (updating) return
    // Claim the busy flag before the first await so a concurrent timer or a
    // user update cannot start a second profile operation.
    updating = true
    try {
      const record = await readJournal(ctx)
      if (record === null) return

      let current
      try {
        current = await findInstalledBundle(ctx, record.name)
      } catch {
        return
      }
      if (current?.installed === true) {
        // The target, the old version, or a deliberate third version is on disk.
        // There is nothing to recover and nothing that should be overwritten.
        await clearJournal(ctx)
        return
      }
      if (typeof record.fromVersion !== 'string' || record.fromVersion === '') return

      const startedAt = Date.parse(record.startedAt || '')
      if (Number.isFinite(startedAt) && Date.now() - startedAt > 7 * 24 * 60 * 60 * 1000) return

      const stages = []
      const rollback = await restoreOldVersion(
        ctx,
        record.name,
        record.fromVersion,
        Array.isArray(record.rollbackSpecs) ? record.rollbackSpecs : [],
        record.installArgs && typeof record.installArgs === 'object' ? record.installArgs : {},
        Array.isArray(record.registries) ? record.registries : [],
        stages,
      )
      if (rollback.restored) {
        await clearJournal(ctx)
        if (currentJob !== null && !currentJob.done && currentJob.name === record.name) {
          finishJob(currentJob, {
            status: 'rolled-back',
            name: record.name,
            fromVersion: record.fromVersion,
            toVersion: currentJob.version,
            reason: 'The interrupted update was rolled back at startup.',
          })
          await persistJob(ctx, currentJob)
        }
        try {
          ctx.logger?.info?.(`dsh-plugin-steward: restored ${record.name}@${record.fromVersion} after an interrupted update`)
        } catch {
          // Logging must not disturb recovery.
        }
      } else {
        record.stage = 'rollback-failed'
        record.rollbackError = truncate(rollback.error || 'The old version could not be reinstalled.', 600)
        record.recoveredAt = new Date().toISOString()
        await writeJournal(ctx, record)
      }
    } finally {
      updating = false
    }
  }

  ctx.effect(() => {
    const delay = envDuration('DSH_PLUGIN_STEWARD_RECOVERY_DELAY_MS', UPDATE_RECOVERY_DELAY_MS)
    const timer = setTimeout(() => { void recoverInterruptedUpdate() }, delay)
    if (typeof timer.unref === 'function') timer.unref()
    return () => clearTimeout(timer)
  }, 'dsh-plugin-steward: recover an interrupted update')
}

/**
 * Remove the old bundle, install the exact version the user saw, and put the
 * old version back if anything after the removal fails. The update cache is the
 * authority for the target version, so the browser cannot ask for an arbitrary
 * package, registry, or downgrade.
 */
async function performUpdate(ctx, load, name, requestedVersion, job) {
  if (job) advanceJob(job, 'check', 'check', 'Checking the installed version…')
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

  const bundle = await findInstalledBundle(ctx, name)
  if (!bundle || bundle.installed !== true || bundle.availability !== 'profile') {
    throw updateProblem('not-installed', 'The bundle is not installed from the profile.')
  }
  const isSelf = bundle.name === SELF_PACKAGE
  if (bundle.readOnlyReason !== undefined || (!isSelf && bundle.removable !== true)) {
    throw updateProblem('read-only', 'The plugin manager does not allow this bundle to be updated.')
  }
  if (isSelf && info.provider !== 'github') {
    throw updateProblem('read-only', 'Self-update is supported only when Plugin Steward is installed from GitHub.')
  }
  if (bundle.version !== fromVersion) {
    throw updateProblem('version-changed', 'The installed version changed; check for updates again.')
  }

  // A previous update may have been interrupted between removal and
  // installation. Do not overwrite its journal with a new attempt.
  const pending = await readJournal(ctx)
  if (pending !== null) {
    if (pending.name === name
      && (bundle.version === pending.toVersion || bundle.version === pending.fromVersion)) {
      await clearJournal(ctx)
    } else {
      throw updateProblem('pending-recovery', 'An earlier update was interrupted; recover it before starting another update.')
    }
  }

  const source = typeof bundle.source === 'string' ? bundle.source.trim() : ''
  const isGitHub = info.provider === 'github'
  let installSpec = null
  let rollbackSpecs = []
  let githubRepo = null

  if (isGitHub) {
    const parsed = parseGitHubSource(source)
    if (parsed === null || `${parsed.owner}/${parsed.repo}` !== info.repo) {
      throw updateProblem('external-source', 'The installed GitHub source does not match the release repository.')
    }
    if (!isGitHubSpec(info.installSpec) || !Array.isArray(info.rollbackSpecs)) {
      throw updateProblem('invalid-target', 'The cached GitHub release target is invalid.')
    }
    rollbackSpecs = info.rollbackSpecs.filter(isGitHubSpec)
    if (rollbackSpecs.length === 0) {
      throw updateProblem('invalid-target', 'No safe rollback target is known for this GitHub plugin.')
    }
    installSpec = info.installSpec
    githubRepo = info.repo
  } else {
    if (source === '' || EXTERNAL_SOURCE.test(source) || name.startsWith('@local/')) {
      throw updateProblem('external-source', 'Only registry packages and explicit GitHub sources can be updated automatically.')
    }
    installSpec = `${name}@${requestedVersion}`
    rollbackSpecs = [`${name}@${fromVersion}`]
  }

  const enabled = bundle.enabled === true
  const registry = isGitHub
    ? undefined
    : (typeof info.registry === 'string' && /^https?:\/\//i.test(info.registry) ? info.registry : undefined)
  const baseInstallArgs = isGitHub ? { enabled, saveExact: true } : installOptions(enabled, registry)

  if (job) {
    job.fromVersion = fromVersion
    job.provider = isGitHub ? 'github' : 'registry'
    job.self = isSelf
    advanceJob(
      job,
      'preflight',
      'preflight',
      isGitHub ? 'Checking the GitHub release source…' : 'Probing the download registries…',
    )
    await persistJob(ctx, job)
  }

  // Ask each candidate registry for the exact tarball before touching the
  // profile. A registry that cannot serve the tarball is skipped, and when no
  // candidate answers the update fails with the old version still installed.
  // This is what turns "remove old, then download for ten minutes" into a
  // harmless refusal.
  const registries = isGitHub
    ? []
    : await planInstallRegistries(ctx, name, requestedVersion, info, job)
  if (!isGitHub && registries.length === 0) {
    throw updateProblem('network', 'No registry answered the update check; the installed version was left unchanged.')
  }
  if (isGitHub) {
    if (job) {
      job.detail = 'Checking the GitHub release source…'
      job.updatedAt = Date.now()
    }
    if (!await preflightGitHubSource(info.repo, info.releaseTag)) {
      throw updateProblem('network', 'The GitHub release source did not answer; the installed version was left unchanged.')
    }
  }

  if (job) {
    advanceJob(job, 'journal', 'journal', 'Writing the recovery journal…')
    await persistJob(ctx, job)
  }
  const journal = {
    version: JOURNAL_VERSION,
    name,
    fromVersion,
    toVersion: requestedVersion,
    provider: isGitHub ? 'github' : 'registry',
    mode: isSelf ? 'self' : 'remove-install',
    self: isSelf,
    installSpec,
    rollbackSpecs,
    installArgs: baseInstallArgs,
    registries,
    startedAt: new Date().toISOString(),
    stage: isSelf ? 'self-installing' : 'removing',
  }
  if (!await writeJournal(ctx, journal)) {
    throw updateProblem('journal-failed', 'The update journal could not be written; nothing was changed.')
  }

  const stages = []
  let failure = null
  let deferredRemoval = false
  let removedChange = null

  try {
    if (!isSelf) {
      if (job) {
        advanceJob(job, 'removing', 'remove', 'Removing the old version…')
        await persistJob(ctx, job)
      }
      const removed = await ctx.pluginManager.removeBundle(name)
      removedChange = removed
      stages.push(stageOf('remove', removed))
      if (!removalAccepted(removed)) {
        throw updateProblem('remove-failed', changeReason(removed))
      }
      // A running host module can be removed from the profile now but stay in
      // memory until the next start. That is a deferred success, not a failure:
      // continue installing the new version so the restart picks it up.
      deferredRemoval = removed.application === 'restart-required'
      journal.stage = 'removed'
      await writeJournal(ctx, journal)
    } else if (job) {
      advanceJob(
        job,
        'self-installing',
        'selfInstall',
        'Installing the new version in place; self-update never removes the running plugin…',
      )
      await persistJob(ctx, job)
    }

    journal.stage = 'installing'
    await writeJournal(ctx, journal)
    if (job) {
      advanceJob(
        job,
        'installing',
        isSelf ? 'selfInstall' : 'install',
        isSelf ? 'Installing the new version in place…' : 'Installing the new version…',
      )
      await persistJob(ctx, job)
    }
    const attempt = await installVersion(ctx, installSpec, baseInstallArgs, registries, stages, 'install', job)
    const installed = attempt.change
    if (installed === null || !installSucceeded(installed)) {
      throw attempt.error || updateProblem('install-failed', 'The new version could not be installed.')
    }

    journal.stage = 'verifying'
    await writeJournal(ctx, journal)
    if (job) {
      advanceJob(job, 'verifying', 'verify', 'Verifying the installed version…')
      await persistJob(ctx, job)
    }
    let current = null
    try {
      current = await findInstalledBundle(ctx, name)
    } catch {
      // A self-update may dispose this context mid-call; the install already succeeded.
    }
    if (current !== null && current?.version !== requestedVersion && installed.version !== requestedVersion) {
      throw updateProblem('verify-failed', 'The installed version did not become the requested version.')
    }

    await clearJournal(ctx)
    const restartRequired = deferredRemoval || installed.application === 'restart-required'
    return {
      status: restartRequired ? 'restart-required' : 'updated',
      provider: isGitHub ? 'github' : 'registry',
      repo: githubRepo,
      releaseTag: isGitHub && typeof info.releaseTag === 'string' ? info.releaseTag : null,
      releaseUrl: isGitHub && typeof info.releaseUrl === 'string' ? info.releaseUrl : null,
      name,
      fromVersion,
      toVersion: requestedVersion,
      enabled,
      registry: registry || null,
      restartRequired,
      restartReason: installed.restartReason || removedChange?.restartReason,
      overridden: installed.application === 'overridden',
      stages,
    }
  } catch (error) {
    failure = error
  }

  // The failure may have happened before the removal committed. In that case
  // the old version is still on disk and only reporting is left to do.
  let current = null
  try {
    current = await findInstalledBundle(ctx, name)
  } catch {
    // The stage diagnostics below carry the useful detail.
  }
  if (current?.installed === true && current.version === fromVersion) {
    await clearJournal(ctx)
    return {
      status: 'failed',
      provider: isGitHub ? 'github' : 'registry',
      repo: githubRepo,
      releaseTag: isGitHub && typeof info.releaseTag === 'string' ? info.releaseTag : null,
      releaseUrl: isGitHub && typeof info.releaseUrl === 'string' ? info.releaseUrl : null,
      name,
      fromVersion,
      toVersion: requestedVersion,
      enabled,
      registry: registry || null,
      keptVersion: fromVersion,
      reason: failure?.message || 'The update failed.',
      failure: problemOf(failure),
      stages,
    }
  }
  if (current?.installed === true && current.version === requestedVersion) {
    await clearJournal(ctx)
    return {
      status: isSelf ? 'updated' : 'restart-required',
      provider: isGitHub ? 'github' : 'registry',
      repo: githubRepo,
      releaseTag: isGitHub && typeof info.releaseTag === 'string' ? info.releaseTag : null,
      releaseUrl: isGitHub && typeof info.releaseUrl === 'string' ? info.releaseUrl : null,
      name,
      fromVersion,
      toVersion: requestedVersion,
      enabled,
      registry: registry || null,
      restartRequired: !isSelf,
      stages,
    }
  }

  // The old version is gone. Reinstall it through the same preflighted
  // registries, and keep the journal until the profile is known-good again.
  if (job) {
    advanceJob(
      job,
      'rolling-back',
      isSelf ? 'selfInstall' : 'install',
      'Recovering the old version…',
    )
    await persistJob(ctx, job)
  }
  journal.stage = 'rolling-back'
  journal.error = truncate(messageOf(failure), 600)
  await writeJournal(ctx, journal)

  const rollback = await restoreOldVersion(
    ctx,
    name,
    fromVersion,
    rollbackSpecs,
    baseInstallArgs,
    registries,
    stages,
    job,
  )

  if (rollback.restored) {
    await clearJournal(ctx)
    return {
      status: 'rolled-back',
      provider: isGitHub ? 'github' : 'registry',
      repo: githubRepo,
      releaseTag: isGitHub && typeof info.releaseTag === 'string' ? info.releaseTag : null,
      releaseUrl: isGitHub && typeof info.releaseUrl === 'string' ? info.releaseUrl : null,
      name,
      fromVersion,
      toVersion: requestedVersion,
      enabled,
      registry: registry || null,
      rollbackRestartRequired: rollback.change?.application === 'restart-required',
      reason: failure?.message || 'The update failed.',
      failure: problemOf(failure),
      stages,
    }
  }

  journal.stage = 'rollback-failed'
  journal.rollbackError = truncate(rollback.error || 'The old version could not be reinstalled.', 600)
  await writeJournal(ctx, journal)

  return {
    status: 'rollback-failed',
    provider: isGitHub ? 'github' : 'registry',
    repo: githubRepo,
    releaseTag: isGitHub && typeof info.releaseTag === 'string' ? info.releaseTag : null,
    releaseUrl: isGitHub && typeof info.releaseUrl === 'string' ? info.releaseUrl : null,
    name,
    fromVersion,
    toVersion: requestedVersion,
    enabled,
    registry: registry || null,
    reason: failure?.message || 'The update failed.',
    failure: problemOf(failure),
    rollbackError: journal.rollbackError,
    rollbackReason: journal.rollbackError,
    stages,
  }
}

async function findInstalledBundle(ctx, name) {
  const bundles = await ctx.pluginManager.listBundles()
  return Array.isArray(bundles) ? bundles.find((candidate) => candidate?.name === name) : undefined
}

/** Try one install spec against each preflighted registry, stopping at the first success. */
async function installVersion(ctx, spec, baseInstallArgs, registries, stages, prefix, job) {
  const candidates = registries.length > 0 ? registries : [null]
  let lastError = null
  let lastChange = null
  const rollingBack = typeof prefix === 'string' && prefix.startsWith('rollback')

  for (let index = 0; index < candidates.length; index += 1) {
    const registry = candidates[index]
    const stageName = index === 0 ? prefix : `${prefix}-${index + 1}`
    const args = { ...baseInstallArgs }
    if (typeof registry === 'string' && registry !== '') args.registry = registry

    if (job) {
      job.detail = `${rollingBack ? 'Reinstalling the old version' : 'Installing the new version'} from ${registry || 'the configured source'}…`
      job.attempt = {
        registry: typeof registry === 'string' ? registry : 'default',
        index: index + 1,
        total: candidates.length,
      }
      job.updatedAt = Date.now()
    }

    try {
      const change = await watchInstallLog(
        ctx,
        job,
        () => installWithDeadline(
          ctx,
          spec,
          args,
          newRequestId(),
          envDuration('DSH_PLUGIN_STEWARD_ATTEMPT_TIMEOUT_MS', UPDATE_ATTEMPT_TIMEOUT_MS),
        ),
      )
      const stage = stageOf(stageName, change)
      stage.registry = typeof registry === 'string' ? registry : 'default'
      stages.push(stage)
      lastChange = change
      if (installSucceeded(change)) return { change, error: null }

      lastError = updateProblem('install-failed', changeReason(change))
      const code = change?.error?.code
      // These answers cannot change by asking another registry.
      if (code === 'already-installed' || code === 'incompatible-version'
        || code === 'not-bundle' || code === 'ambiguous-install') {
        return { change, error: lastError }
      }
    } catch (error) {
      lastError = error
      stages.push({
        stage: stageName,
        registry: typeof registry === 'string' ? registry : 'default',
        error: truncate(messageOf(error), 600),
      })
      // A run that could not be stopped is still using the profile; a second
      // attempt would race it, so report the timeout instead.
      if (error?.code === 'timeout' && error?.cancelled !== true) break
    }
  }

  return { change: lastChange, error: lastError || updateProblem('install-failed', 'The installation failed.') }
}

/**
 * Call installBundle with a hard deadline. On expiry the manager's own
 * cancellation is used, so pnpm is stopped and the profile manifest and
 * lockfile are restored before the next attempt starts.
 */
async function installWithDeadline(ctx, spec, options, requestId, timeoutMs) {
  const manager = ctx.pluginManager
  const pending = manager.installBundle(spec, { ...options, requestId })
  let settled = false
  pending.then(
    () => { settled = true },
    () => { settled = true },
  )

  let timer = null
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve('deadline'), timeoutMs)
  })
  let outcome
  try {
    outcome = await Promise.race([
      pending.then((value) => ({ value }), (error) => ({ error })),
      deadline,
    ])
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
  if (outcome !== 'deadline') {
    if (outcome.error) throw outcome.error
    return outcome.value
  }

  const cancelWait = envDuration('DSH_PLUGIN_STEWARD_CANCEL_WAIT_MS', UPDATE_CANCEL_WAIT_MS)
  let cancelled = false
  if (!settled && typeof manager.cancelInstall === 'function') {
    try {
      const result = await withTimeout(manager.cancelInstall(requestId), cancelWait)
      cancelled = result?.status === 'cancelled'
    } catch {
      // Cancellation is best effort; the timeout is still reported.
    }
  }

  let late = null
  try {
    late = await withTimeout(pending, cancelWait)
  } catch {
    // The timeout below is the useful outcome.
  }
  if (late !== null && late !== undefined && installSucceeded(late)) return late

  const seconds = Math.round(timeoutMs / 1000)
  const error = updateProblem(
    'timeout',
    cancelled
      ? `The installation did not finish within ${seconds}s and was cancelled.`
      : `The installation did not finish within ${seconds}s.`,
  )
  error.cancelled = cancelled
  throw error
}

/** Put the version the user had before the update back on disk. */
async function restoreOldVersion(ctx, name, fromVersion, rollbackSpecs, installArgs, registries, stages, job) {
  let current = null
  try {
    current = await findInstalledBundle(ctx, name)
  } catch {
    // Fall through to the reinstall attempts.
  }
  if (current?.installed === true && current.version === fromVersion) {
    return { restored: true, change: null }
  }

  let lastError = null
  for (let index = 0; index < rollbackSpecs.length; index += 1) {
    const prefix = index === 0 ? 'rollback' : `rollback-${index + 1}`
    const attempt = await installVersion(ctx, rollbackSpecs[index], installArgs, registries, stages, prefix, job)
    if (attempt.change !== null && installSucceeded(attempt.change)) {
      try {
        const after = await findInstalledBundle(ctx, name)
        if (after?.installed === true && after.version === fromVersion) {
          return { restored: true, change: attempt.change }
        }
      } catch {
        // The version check below reports the mismatch.
      }
      lastError = 'The reinstalled version did not match the old version.'
    } else {
      lastError = attempt.error
        ? messageOf(attempt.error)
        : (attempt.change ? changeReason(attempt.change) : 'The old version could not be reinstalled.')
    }
  }
  return { restored: false, change: null, error: lastError || 'The old version could not be reinstalled.' }
}

/**
 * Registries to ask, most likely first. Public candidates are probed for the
 * exact tarball before the old version is removed; a private registry is
 * asked alone so its package names never reach a public fallback.
 */
async function planInstallRegistries(ctx, name, version, info, job) {
  const configured = await registryConfig(ctx)
  const candidates = []
  const add = (value) => {
    if (typeof value !== 'string') return
    const normalized = normalizeRegistryUrl(value)
    if (!/^https?:\/\/\S+/.test(normalized)) return
    if (!candidates.includes(normalized)) candidates.push(normalized)
  }

  if (typeof info.registry === 'string') add(info.registry)
  for (const fallback of configured.fallbacks) add(fallback)
  add('https://registry.npmjs.org/')

  if (candidates.length === 0) return []
  if (!isPublicRegistryUrl(candidates[0])) return [candidates[0]]

  // Probe in the configured order and stop at the first registry that can
  // serve the exact tarball. The candidates after it stay as fallbacks, so a
  // second working registry does not cost another probe up front.
  const ordered = []
  const unprobed = []
  for (let index = 0; index < candidates.length; index += 1) {
    const registry = candidates[index]
    if (job) {
      job.detail = `Checking ${registry}…`
      job.updatedAt = Date.now()
    }
    const state = await preflightRegistry(registry, name, version)
    if (state === 'ok') {
      if (job) {
        job.detail = `${registry} can serve the update.`
        job.updatedAt = Date.now()
      }
      ordered.push(registry)
      unprobed.push(...candidates.slice(index + 1))
      break
    }
    if (job) {
      job.detail = `${registry} did not answer; trying another source…`
      job.updatedAt = Date.now()
    }
    if (state === 'unknown' && !isPublicRegistryUrl(registry)) unprobed.push(registry)
  }

  if (ordered.length > 0) return [...ordered, ...unprobed]
  return unprobed.filter((registry) => !isPublicRegistryUrl(registry))
}

async function registryConfig(ctx) {
  const fallbacks = []
  let resolved = null
  try {
    const info = await ctx.pluginManager.registries()
    if (typeof info?.resolved === 'string' && /^https?:\/\//i.test(info.resolved)) resolved = info.resolved
    for (const fallback of Array.isArray(info?.fallbackRegistries) ? info.fallbackRegistries : []) {
      if (typeof fallback === 'string' && /^https?:\/\//i.test(fallback)) fallbacks.push(fallback)
    }
  } catch {
    // The default public registry remains a useful last resort.
  }
  return { resolved, fallbacks }
}

/**
 * Ask a registry for the exact tarball URL and check that the file answers.
 * 'unknown' is kept for registries whose metadata needs credentials; a public
 * registry that does not answer is skipped by the caller.
 */
async function preflightRegistry(registry, name, version) {
  let tarball = null
  try {
    const packument = await fetchJson(
      `${registry.replace(/\/+$/, '')}/${encodeURIComponent(name)}`,
      'application/vnd.npm.install-v1+json',
      envDuration('DSH_PLUGIN_STEWARD_PREFLIGHT_TIMEOUT_MS', UPDATE_PREFLIGHT_TIMEOUT_MS),
    )
    const dist = packument?.versions?.[version]?.dist
    tarball = typeof dist?.tarball === 'string' && /^https?:\/\//i.test(dist.tarball)
      ? dist.tarball
      : null
  } catch {
    return isPublicRegistryUrl(registry) ? 'unreachable' : 'unknown'
  }
  if (tarball === null) return isPublicRegistryUrl(registry) ? 'unreachable' : 'unknown'

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    envDuration('DSH_PLUGIN_STEWARD_PREFLIGHT_TIMEOUT_MS', UPDATE_PREFLIGHT_TIMEOUT_MS),
  )
  if (typeof timer.unref === 'function') timer.unref()
  try {
    const response = await fetch(tarball, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })
    if (response.ok || response.status === 405) return 'ok'
    // 401/403 mean the host answered and pnpm can still authenticate.
    if (response.status === 401 || response.status === 403) return 'ok'
    return 'unreachable'
  } catch {
    return 'unreachable'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Check that the release source can be fetched before a GitHub update touches
 * the profile. The install itself uses a Git spec, but codeload is the same
 * release content and answers a cheap HEAD.
 */
async function preflightGitHubSource(repo, releaseTag) {
  if (typeof repo !== 'string' || typeof releaseTag !== 'string' || releaseTag === '') return false
  const [owner, name] = repo.split('/')
  if (typeof owner !== 'string' || owner === '' || typeof name !== 'string' || name === '') return false
  const url = `https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    + `/tar.gz/refs/tags/${encodeURIComponent(releaseTag)}`
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    envDuration('DSH_PLUGIN_STEWARD_PREFLIGHT_TIMEOUT_MS', UPDATE_PREFLIGHT_TIMEOUT_MS),
  )
  if (typeof timer.unref === 'function') timer.unref()
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
    return response.ok || response.status === 405
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function normalizeRegistryUrl(value) {
  return `${String(value).trim().replace(/\/+$/, '')}/`
}

function isPublicRegistryUrl(value) {
  return typeof value === 'string' && PUBLIC_REGISTRIES.has(normalizeRegistryUrl(value))
}

function newRequestId() {
  return `steward-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function envDuration(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 1000 ? value : fallback
}

function withTimeout(promise, ms) {
  let timer = null
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer)
  })
}

function profileDirectory(ctx) {
  const candidates = []
  try {
    const profile = typeof ctx?.get === 'function' ? ctx.get('profileContext') : undefined
    if (typeof profile?.dir === 'string') candidates.push(profile.dir)
  } catch {
    // Fall through to the other sources.
  }
  try {
    if (typeof ctx?.pluginManager?.profile?.dir === 'string') candidates.push(ctx.pluginManager.profile.dir)
  } catch {
    // Fall through to the environment.
  }
  if (typeof process.env.DSH_PROFILE_DIR === 'string') candidates.push(process.env.DSH_PROFILE_DIR)
  return candidates.find((value) => typeof value === 'string' && value !== '') ?? null
}

function stateTarget(ctx, file) {
  const dir = profileDirectory(ctx)
  if (dir === null) return null
  return join(dir, '.plugin-manager', file)
}

function journalTarget(ctx) {
  return stateTarget(ctx, JOURNAL_FILE)
}

function jobTarget(ctx) {
  return stateTarget(ctx, JOB_FILE)
}

async function writeJournal(ctx, record) {
  const target = journalTarget(ctx)
  if (target === null) return true
  const temp = `${target}.${process.pid}.tmp`
  try {
    await mkdir(dirname(target), { recursive: true })
    await writeFile(temp, JSON.stringify(record, null, 2), 'utf8')
    await rename(temp, target)
    return true
  } catch (error) {
    try {
      ctx.logger?.warn?.('dsh-plugin-steward: could not write the update journal', error)
    } catch {
      // Reporting the failure must not fail the update itself.
    }
    return false
  }
}

async function readJournal(ctx) {
  const target = journalTarget(ctx)
  if (target === null) return null
  try {
    const record = JSON.parse(await readFile(target, 'utf8'))
    if (record === null || typeof record !== 'object') return null
    if (record.version !== JOURNAL_VERSION) return null
    if (typeof record.name !== 'string' || typeof record.fromVersion !== 'string') return null
    return record
  } catch {
    return null
  }
}

async function clearJournal(ctx) {
  const target = journalTarget(ctx)
  if (target === null) return
  try {
    await rm(target, { force: true })
  } catch {
    // A leftover journal is harmless: the next start verifies the profile first.
  }
}

/** A live update job shown by the tab while the plugin manager works. */
function createJob({ name, version, fromVersion, self }) {
  const ids = self ? JOB_STEPS.self : JOB_STEPS.normal
  return {
    schema: JOB_VERSION,
    id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    version,
    fromVersion,
    self: self === true,
    phase: 'check',
    step: 0,
    steps: ids.map((id, index) => ({ id, state: index === 0 ? 'active' : 'pending' })),
    detail: '',
    logTail: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
    done: false,
    result: null,
    error: null,
  }
}

function advanceJob(job, phase, stepId, detail) {
  if (job === null || job === undefined) return
  if (typeof stepId === 'string') {
    const index = job.steps.findIndex((step) => step.id === stepId)
    if (index >= 0) {
      job.step = index
      job.steps.forEach((step, position) => {
        if (position < index) step.state = 'done'
        else if (position === index) step.state = 'active'
        else if (step.state !== 'error') step.state = 'pending'
      })
    }
  }
  if (typeof detail === 'string' && detail !== '') job.detail = truncate(detail, 300)
  job.phase = phase
  job.updatedAt = Date.now()
}

function finishJob(job, result) {
  if (job === null || job === undefined) return
  job.done = true
  job.phase = 'done'
  job.result = result
  job.error = null
  job.updatedAt = Date.now()
  job.step = job.steps.length - 1
  for (const step of job.steps) step.state = 'done'
}

function failJob(job, error) {
  if (job === null || job === undefined) return
  job.done = true
  job.phase = 'failed'
  job.updatedAt = Date.now()
  const failure = problemOf(error)
  job.error = failure
  job.result = {
    status: 'failed',
    name: job.name,
    fromVersion: job.fromVersion,
    toVersion: job.version,
    reason: messageOf(error),
    failure,
  }
  const active = job.steps.find((step) => step.state === 'active')
  if (active !== undefined) active.state = 'error'
}

function jobSnapshot(job) {
  return {
    ...job,
    elapsedMs: Math.max(0, Date.now() - job.startedAt),
    steps: job.steps.map((step) => ({ ...step })),
    logTail: Array.isArray(job.logTail) ? job.logTail.slice(-6) : [],
  }
}

async function persistJob(ctx, job) {
  const target = jobTarget(ctx)
  if (target === null) return false
  const temp = `${target}.${process.pid}.tmp`
  try {
    await mkdir(dirname(target), { recursive: true })
    await writeFile(temp, JSON.stringify(jobSnapshot(job), null, 2), 'utf8')
    await rename(temp, target)
    return true
  } catch (error) {
    try {
      ctx.logger?.warn?.('dsh-plugin-steward: could not persist the update job', error)
    } catch {
      // The live status route still works; only the reload handoff is lost.
    }
    return false
  }
}

async function readJob(ctx) {
  const target = jobTarget(ctx)
  if (target === null) return null
  try {
    const job = JSON.parse(await readFile(target, 'utf8'))
    if (job === null || typeof job !== 'object') return null
    if (job.schema !== JOB_VERSION) return null
    if (typeof job.id !== 'string' || typeof job.name !== 'string' || typeof job.version !== 'string') return null
    if (!Array.isArray(job.steps)) return null
    return job
  } catch {
    return null
  }
}

async function clearJob(ctx) {
  const target = jobTarget(ctx)
  if (target === null) return
  try {
    await rm(target, { force: true })
  } catch {
    // A stale job is harmless; the next start replaces or expires it.
  }
}

/** Infer the result of a job whose plugin reloaded before it reported back. */
function inferJobResult(job, bundle) {
  const base = {
    name: job.name,
    fromVersion: job.fromVersion,
    toVersion: job.version,
    provider: job.self ? 'github' : undefined,
  }
  if (bundle?.installed === true && bundle.version === job.version) {
    return {
      ...base,
      status: job.self ? 'updated' : 'restart-required',
      inferred: true,
      reason: 'The plugin reloaded before the update reported a result; the target version is installed.',
    }
  }
  if (bundle?.installed === true && bundle.version === job.fromVersion) {
    return {
      ...base,
      status: 'failed',
      keptVersion: job.fromVersion,
      reason: 'The plugin reloaded before the update reported a result; the old version is still installed.',
      failure: { code: 'interrupted', detail: 'The update did not report a result before the plugin reloaded.' },
    }
  }
  return {
    ...base,
    status: 'failed',
    reason: 'The update was interrupted before it reported a result.',
    failure: { code: 'interrupted', detail: 'The update did not report a result before its plugin stopped.' },
  }
}

/**
 * Stream the newest pnpm operation log into the job while an install runs.
 * The plugin manager writes `.plugin-manager/logs/operation-<id>/pnpm.log`, so the
 * tab can show real download/resolve lines without a second event channel.
 */
async function watchInstallLog(ctx, job, run) {
  if (job === null || job === undefined) return run()
  const dir = profileDirectory(ctx)
  if (dir === null) return run()
  const logsDir = join(dir, '.plugin-manager', 'logs')
  let before = new Set()
  try {
    before = new Set(await readdir(logsDir))
  } catch {
    // The first operation creates the directory later.
  }
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const entries = await readdir(logsDir)
      const fresh = entries
        .filter((entry) => !before.has(entry) && entry.startsWith('operation-'))
        .sort()
      const newest = fresh[fresh.length - 1]
      if (newest === undefined) return
      const text = await readFile(join(logsDir, newest, 'pnpm.log'), 'utf8')
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      if (lines.length === 0) return
      job.logTail = lines.slice(-4).map((line) => truncate(stripAnsi(line), 280))
      const progress = [...lines].reverse().find((line) => (
        /Progress:|Packages:|ERR_|WARN|Done in|dsh:/.test(line)
      ))
      if (progress !== undefined) job.detail = truncate(stripAnsi(progress), 240)
      job.updatedAt = Date.now()
    } catch {
      // The operation log may not exist yet; the next poll retries.
    }
  }, JOB_POLL_MS)
  if (typeof timer.unref === 'function') timer.unref()
  try {
    return await run()
  } finally {
    stopped = true
    clearInterval(timer)
  }
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, '')
}

function updateProblem(code, detail) {
  const error = new Error(detail)
  error.code = code
  return error
}

function isExpectedUpdateError(error) {
  const code = error?.code
  return code === 'invalid-target' || code === 'not-updatable'
    || code === 'version-changed' || code === 'not-installed'
    || code === 'read-only' || code === 'external-source'
    || code === 'network' || code === 'timeout'
    || code === 'pending-recovery' || code === 'journal-failed'
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
 * Read the profile's installed bundles and compare each package with its
 * registry's `latest` dist-tag, or with the latest GitHub Release when the
 * package was installed from a GitHub source. Local and linked installs remain
 * outside the update surface.
 */
async function computeUpdates(ctx) {
  const all = await ctx.pluginManager.listBundles()
  const installed = all.filter((bundle) => (
    bundle.installed === true
    && bundle.availability === 'profile'
  ))
  const registries = await registryUrls(ctx)
  const github = githubAccess()
  const packages = {}

  await Promise.all(installed.map(async (bundle) => {
    const info = await inspectBundle(bundle, registries, github)
    packages[bundle.name] = {
      ...info,
      self: bundle.name === SELF_PACKAGE,
    }
  }))

  return {
    checkedAt: Date.now(),
    registries,
    github: { authenticated: github.token !== null },
    steward: { version: STEWARD_VERSION },
    packages,
  }
}

async function inspectBundle(bundle, registries, github) {
  const current = typeof bundle.version === 'string' && bundle.version !== ''
    ? bundle.version
    : null
  const source = typeof bundle.source === 'string' ? bundle.source.trim() : ''
  const githubSource = parseGitHubSource(source)

  if (githubSource !== null) {
    return inspectGitHubBundle(bundle, githubSource, current, source, github)
  }

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

async function inspectGitHubBundle(bundle, parsed, current, source, github) {
  const repo = `${parsed.owner}/${parsed.repo}`
  const base = {
    provider: 'github',
    repo,
    source,
    current,
  }

  if (current === null) {
    return { ...base, status: 'unknown', latest: null, reason: 'missing-version' }
  }
  const currentParsed = parseVersion(current)
  if (currentParsed === null) {
    return { ...base, status: 'unknown', latest: null, reason: 'unreadable-version' }
  }

  try {
    const release = await githubJson(
      `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/releases/latest`,
      github,
    )
    if (!release || typeof release.tag_name !== 'string' || release.tag_name.trim() === '') {
      return { ...base, status: 'unknown', latest: null, reason: 'release-without-tag' }
    }
    const releaseTag = release.tag_name.trim()
    const latest = normalizeReleaseVersion(releaseTag)
    if (latest === null) {
      return { ...base, status: 'unknown', latest: null, releaseTag, reason: 'unreadable-release-tag' }
    }
    const latestParsed = parseVersion(latest)
    if (latestParsed === null) {
      return { ...base, status: 'unknown', latest: null, releaseTag, reason: 'unreadable-release-tag' }
    }

    const releaseUrl = typeof release.html_url === 'string' ? release.html_url : null
    const publishedAt = typeof release.published_at === 'string' ? release.published_at : null
    if (compareVersions(latestParsed, currentParsed) <= 0) {
      return {
        ...base,
        status: 'current',
        latest,
        releaseTag,
        releaseUrl,
        publishedAt,
      }
    }

    const installSpec = buildGitHubSpec(parsed.owner, parsed.repo, releaseTag, parsed.path)
    const rollbackSpecs = githubRollbackSpecs(parsed, current, source)
    return {
      ...base,
      status: 'update',
      latest,
      releaseTag,
      releaseUrl,
      publishedAt,
      installSpec,
      rollbackSpecs,
    }
  } catch (error) {
    return {
      ...base,
      status: 'unknown',
      latest: null,
      reason: messageOf(error),
    }
  }
}

/**
 * Parse only explicit GitHub package sources. A release asset URL or an
 * arbitrary web URL is deliberately not treated as a repository.
 */
function parseGitHubSource(source) {
  if (typeof source !== 'string' || source.trim() === '') return null
  let value = source.trim()
  let path = ''

  const pathMatch = /(?:&|\?)path:([^#&\s]+)/i.exec(value)
  if (pathMatch !== null) {
    path = normalizeGitPath(pathMatch[1])
    if (path === null) return null
    value = value.replace(pathMatch[0], '')
  }

  const patterns = [
    /^github:([^/\s#]+)\/([^/\s#]+?)(?:\.git)?(?:#(.+))?$/i,
    /^git\+https?:\/\/github\.com\/([^/\s#]+)\/([^/\s#]+?)(?:\.git)?(?:#(.+))?$/i,
    /^https?:\/\/github\.com\/([^/\s#]+)\/([^/\s#]+?)(?:\.git)?(?:#(.+))?$/i,
    /^git\+ssh:\/\/git@github\.com\/([^/\s#]+)\/([^/\s#]+?)(?:\.git)?(?:#(.+))?$/i,
    /^git@github\.com:([^/\s#]+)\/([^/\s#]+?)(?:\.git)?(?:#(.+))?$/i,
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(value)
    if (match === null) continue
    const owner = match[1]
    const repo = match[2].replace(/\.git$/i, '')
    const ref = typeof match[3] === 'string' && match[3] !== '' ? match[3] : null
    if (!isRepoPart(owner) || !isRepoPart(repo)) return null
    return { owner, repo, ref, path }
  }
  return null
}

function normalizeGitPath(value) {
  const path = value.startsWith('/') ? value : `/${value}`
  if (!/^\/[A-Za-z0-9._/-]+$/.test(path) || path.includes('..')) return null
  return path
}

function isRepoPart(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 100
    && /^[A-Za-z0-9_.-]+$/.test(value)
    && value !== '.'
    && value !== '..'
}

function isSafeGitRef(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 200
    && /^[A-Za-z0-9][A-Za-z0-9._/@+-]*$/.test(value)
    && !value.includes('..')
    && !value.endsWith('/')
    && !value.endsWith('.')
}

function buildGitHubSpec(owner, repo, ref, path) {
  if (!isRepoPart(owner) || !isRepoPart(repo) || !isSafeGitRef(ref)) {
    throw new Error('Unsafe GitHub release reference.')
  }
  const pathPart = typeof path === 'string' && path !== '' ? `&path:${path}` : ''
  return `git+https://github.com/${owner}/${repo}.git${pathPart}#${ref}`
}

function isGitHubSpec(value) {
  if (typeof value !== 'string' || value.length > 500) return false
  if (!value.startsWith('git+https://github.com/')) return false
  const fragment = value.lastIndexOf('#')
  if (fragment <= 0 || fragment === value.length - 1) return false
  return isSafeGitRef(value.slice(fragment + 1))
}

function githubRollbackSpecs(parsed, current, source) {
  const specs = []
  const add = (value) => {
    if (typeof value === 'string' && value !== '' && !specs.includes(value)) specs.push(value)
  }

  // A source pinned to a commit is the most exact rollback target.
  if (parsed.ref !== null && /^[0-9a-f]{7,40}$/i.test(parsed.ref)) add(source)
  add(buildGitHubSpec(parsed.owner, parsed.repo, `v${current}`, parsed.path))
  add(buildGitHubSpec(parsed.owner, parsed.repo, current, parsed.path))
  // A branch/tag source is a last resort if neither version tag exists.
  if (parsed.ref !== null) add(source)
  return specs
}

function normalizeReleaseVersion(tag) {
  if (typeof tag !== 'string') return null
  const value = tag.trim().replace(/^v/i, '')
  return parseVersion(value) === null ? null : value
}

function githubAccess() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT
  return {
    token: typeof token === 'string' && token.trim() !== '' ? token.trim() : null,
  }
}

async function githubJson(path, github) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-plugin-steward/1.2.3',
  }
  if (github && github.token !== null) headers.authorization = `Bearer ${github.token}`
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
  return await response.json()
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
    if (!isPublicRegistryUrl(normalized)) return urls
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

async function fetchJson(url, accept = 'application/json', timeoutMs = FETCH_TIMEOUT_MS) {
  const response = await fetch(url, {
    headers: {
      accept,
      'user-agent': 'dsh-plugin-steward/1.2.3',
    },
    signal: AbortSignal.timeout(timeoutMs),
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
