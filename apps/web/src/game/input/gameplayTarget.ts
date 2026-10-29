/** UI controls never become gameplay gestures, including their labels and popovers. */
export function isSystemTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(
    'button,a,input,textarea,select,summary,details,label,[contenteditable=true],[data-system-ui]',
  );
}
