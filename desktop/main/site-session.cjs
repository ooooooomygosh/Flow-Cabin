'use strict';
// The cabin page's session: the bundled site is served from an https:// handler (site-router.cjs),
// permissions stay minimal, only whitelisted local downloads are saved, and every document gets a CSP.
const path = require('node:path');
const { SITE_ORIGIN, isSiteUrl, localDownloadType, saveDialog } = require('../policy.cjs');
const { createQQMusic } = require('../qq-music.cjs');
const { createSiteRouter } = require('../site-router.cjs');

const PERMISSIONS = ['clipboard-sanitized-write', 'notifications']; // notifications announce the end of a focus round
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https:; media-src 'self' https: blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'";

async function wireSiteSession({ contents, net, webRoot, collection, catalog, music, getAppearance, downloads, writeLog, onDocumentFailed }) {
  const session = contents.session;
  const qq = createQQMusic((url, options) => net.fetch(url, { ...options, bypassCustomProtocolHandlers: true }));
  if (await session.protocol.isProtocolHandled('https')) session.protocol.unhandle('https');
  const route = createSiteRouter({
    webRoot,
    forward: (request) => session.fetch(request, { bypassCustomProtocolHandlers: true }),
    qq, collection, catalog, getAppearance,
    music: (request, pathname) => music().proxy(request, pathname, (url, options) => net.fetch(url, options))
  });
  session.protocol.handle('https', async (request) => {
    try { return await route(request); }
    catch (error) { writeLog('route-error', error.message); return new Response('Unavailable', { status: 502 }); }
  });
  session.setPermissionRequestHandler((webContents, permission, callback) => callback(isSiteUrl(webContents.getURL()) && PERMISSIONS.includes(permission)));
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => isSiteUrl(requestingOrigin) && PERMISSIONS.includes(permission));
  session.on('will-download', (event, item, source) => {
    const type = source === contents && isSiteUrl(contents.getURL()) && localDownloadType({ url: item.getURL(), filename: item.getFilename(), bytes: item.getTotalBytes(), mimeType: item.getMimeType() });
    if (!type) { event.preventDefault(); return; }
    const dialog = saveDialog(type);
    item.setSaveDialogOptions({ title: dialog.title, defaultPath: path.join(downloads(), path.basename(item.getFilename())), filters: [{ name: dialog.filter, extensions: [dialog.extension] }] });
  });
  // Request URLs, tokens and room identifiers are intentionally not written to logs.
  session.webRequest.onHeadersReceived({ urls: [`${SITE_ORIGIN}/*`] }, (details, callback) => {
    if (details.resourceType === 'mainFrame' && details.statusCode >= 400) onDocumentFailed();
    const headers = { ...details.responseHeaders };
    if (details.resourceType === 'mainFrame' && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-security-policy')) headers['Content-Security-Policy'] = [CSP];
    callback({ responseHeaders: headers });
  });
}
module.exports = { wireSiteSession, CSP };
