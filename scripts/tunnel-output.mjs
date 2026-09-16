export function extractTunnelUrl(output) {
  const matches = [
    ...output.matchAll(
      /tunneled with tls termination, (https:\/\/[a-z0-9-]+\.(?:lhr\.life|localhost\.run))/g,
    ),
  ]
  return matches.at(-1)?.[1] ?? null
}
