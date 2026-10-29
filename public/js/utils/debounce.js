/**
 * Standard debounce function.
 */
export function debounce(fn, delayMs = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delayMs);
  };
}
