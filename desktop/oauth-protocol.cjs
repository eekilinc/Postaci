function isOAuthCallbackUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'postaci:' && url.hostname === 'oauth-complete';
  } catch {
    return false;
  }
}

function findOAuthCallbackArg(args) {
  return Array.isArray(args) ? args.find(isOAuthCallbackUrl) : undefined;
}

module.exports = { isOAuthCallbackUrl, findOAuthCallbackArg };
