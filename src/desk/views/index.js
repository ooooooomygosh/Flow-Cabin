import ConsoleView from './ConsoleView';

// What a view of DeskHome is when it is more than a picture with buttons on it (desk-model VIEWS):
// a component drawn over the view once the film has played, given
//   back      () => void   look back down at the desk (the same as Esc)
//   layout    consoleLayout(width, height): { phone, s, ox, oy, frameH }, where the picture lies
//   reduced   boolean      reduced motion
// A view listed here draws its own way back; the generic spots and 回到书桌 are not drawn for it.
export const VIEW_BODY = Object.freeze({ console: ConsoleView });
