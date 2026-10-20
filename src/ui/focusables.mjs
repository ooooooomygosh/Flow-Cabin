// The nodes the Tab key can reach inside a modal. <summary> counts: the album
// wall folds its settings into <details>, and a summary the list does not know
// about used to send the focus back to the first control of the dialog.
export const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), summary, audio[controls], video[controls], iframe, object, embed, area[href], [tabindex]:not([tabindex="-1"])';

// A node is reachable when it takes focus, is not inside an inert subtree, is
// laid out and is not hidden by visibility.
export const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((node) => node.tabIndex >= 0 && !node.closest('[inert]') && node.getClientRects().length && (node.checkVisibility ? node.checkVisibility({ visibilityProperty: true }) : true));
