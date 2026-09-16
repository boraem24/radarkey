import test from 'node:test'
import assert from 'node:assert/strict'
import { extractTunnelUrl } from '../scripts/tunnel-output.mjs'
test('ignores provider admin and API links', () =>
  assert.equal(
    extractTunnelUrl('https://admin.localhost.run/ https://api.trycloudflare.com'),
    null,
  ))
test('uses the newest rotated domain', () =>
  assert.equal(
    extractTunnelUrl(
      'tunneled with tls termination, https://first.lhr.life\ntunneled with tls termination, https://second.lhr.life',
    ),
    'https://second.lhr.life',
  ))
test('does not accept an incomplete provider line', () =>
  assert.equal(extractTunnelUrl('tunneled with tls termination, https://first.lhr.'), null))
