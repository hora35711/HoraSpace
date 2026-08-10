import { useRef, useEffect } from "react"

/**
 * Hook that executes a callback when the component unmounts.
 *
 * @param callback Function to be called on component unmount
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useUnmount = (callback: (...args: Array<any>) => any) => {
  const ref = useRef(callback)

  useEffect(() => {
    // effect 后更新最新回调，避免渲染期间写 ref 破坏 React 并发渲染约束。
    ref.current = callback
  }, [callback])

  useEffect(
    () => () => {
      ref.current()
    },
    []
  )
}

export default useUnmount
