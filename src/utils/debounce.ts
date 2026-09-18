type Debounced<Args extends unknown[]> = ((...args: Args) => void) & { cancel: () => void }

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const wrapped = (...args: Args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }

  wrapped.cancel = () => {
    if (timer) clearTimeout(timer)
  }

  return wrapped
}
