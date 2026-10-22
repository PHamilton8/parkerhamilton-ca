import assert from 'node:assert/strict';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function assertPreviewDestination(value, versionId, subdomain) {
  assert.match(versionId ?? '', UUID, 'Exact version UUID required');
  assert.match(subdomain ?? '', /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, 'Reviewed workers.dev subdomain required');
  const url = new URL(value);
  const hostname = `${versionId.slice(0, 8)}-parkerhamilton-ca.${subdomain}.workers.dev`;
  assert.ok(url.protocol === 'https:' && url.hostname === hostname && !url.port && !url.username && !url.password && !url.search && !url.hash,
    'Preview must use the exact version, Worker and reviewed account subdomain over clean HTTPS');
  return url;
}

/** Only retain known provider identity fields; never raw errors, URLs or logs. */
function safeSnapshot(value) {
  if (!value || value.workerName !== 'parkerhamilton-ca' || !UUID.test(value.deploymentId) || !Array.isArray(value.versions) || !value.versions.length) return null;
  const versions = [];
  for (const item of value.versions) {
    if (!UUID.test(item.versionId) || !Number.isFinite(item.percentage) || item.percentage <= 0 || item.percentage > 100) return null;
    versions.push({ versionId: item.versionId, percentage: item.percentage });
  }
  if (Math.abs(versions.reduce((sum, item) => sum + item.percentage, 0) - 100) > 0.0001) return null;
  return { workerName: 'parkerhamilton-ca', deploymentId: value.deploymentId, versions };
}
function safeVersionIds(value) {
  return Array.isArray(value) && value.length <= 1000 && value.every((id) => typeof id === 'string' && UUID.test(id)) ? [...new Set(value)].sort() : null;
}
/** Evidence is deliberately never a promotable candidate receipt. */
export function reconcileUploadEvidence({ outcome, before, after, versionsBefore, versionsAfter, upload }) {
  before = safeSnapshot(before); after = safeSnapshot(after);
  versionsBefore = safeVersionIds(versionsBefore); versionsAfter = safeVersionIds(versionsAfter);
  const complete = Boolean(before && after && versionsBefore && versionsAfter);
  const productionUnchanged = before && after ? JSON.stringify(before) === JSON.stringify(after) : null;
  const newVersionIds = versionsBefore && versionsAfter ? versionsAfter.filter((id) => !versionsBefore.includes(id)) : [];
  const receiptVersionId = UUID.test(upload?.versionId ?? '') ? upload.versionId : null;
  const receiptMatches = Boolean(receiptVersionId && newVersionIds.length === 1 && newVersionIds[0] === receiptVersionId);
  const uploadOutcome = ['success', 'failure', 'cancelled', 'skipped'].includes(outcome) ? outcome : 'unknown';
  return { schemaVersion: 1, status: 'NON_PROMOTABLE_OPERATION_EVIDENCE', uploadOutcome,
    reconciliationRequired: uploadOutcome !== 'success' || !complete || !productionUnchanged || !receiptMatches,
    productionUnchanged, before, after, newVersionIds, receiptVersionId,
    warning: 'A failed or interrupted uploader may already have created a version. Reconcile provider state before any retry.' };
}

/** A non-promotable operation record cannot be converted to success after failure. */
export function assertCompleteCandidateEvidence(ci, operation, { sourceSha, treeSha, versionId, ciRunId }) {
  assert.equal(ci?.schemaVersion, 1, 'Complete CI provenance required');
  assert.equal(ci.repository, 'PHamilton8/parkerhamilton-ca');
  assert.equal(ci.sha, sourceSha);
  assert.equal(ci.checkoutSha, sourceSha);
  assert.equal(ci.checkoutTree, treeSha, 'Candidate tree must be the tree actually tested by CI');
  assert.equal(ci.workflowRunId, ciRunId);
  assert.ok(Number.isSafeInteger(ci.runAttempt) && ci.runAttempt > 0);
  assert.equal(ci.conclusion, 'success');
  assert.ok(Array.isArray(ci.requiredJobs) && ci.requiredJobs.length === 2, 'Both required jobs must be retained');
  for (const name of ['quality', 'browser']) {
    const jobs = ci.requiredJobs.filter((job) => job.name === name);
    assert.equal(jobs.length, 1);
    const job = jobs[0];
    assert.equal(job.runId, ciRunId);
    assert.equal(job.runAttempt, ci.runAttempt);
    assert.equal(job.checkoutSha, sourceSha);
    assert.equal(job.checkoutTree, treeSha);
    assert.equal(job.cleanTrackedTree, true);
    assert.equal(job.conclusion, 'success');
  }
  assert.equal(operation?.status, 'NON_PROMOTABLE_OPERATION_EVIDENCE');
  assert.equal(operation.uploadOutcome, 'success', 'A failed upload cannot become a candidate receipt');
  assert.equal(operation.reconciliationRequired, false, 'Unreconciled upload cannot become a candidate receipt');
  assert.equal(operation.productionUnchanged, true);
  assert.equal(operation.receiptVersionId, versionId);
  assert.deepEqual(operation.newVersionIds, [versionId]);
}
