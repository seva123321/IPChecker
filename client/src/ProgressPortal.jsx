import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export const ProgressPortal = ({ children }) => {
  const elRef = useRef(null)

  if (!elRef.current) {
    elRef.current = document.createElement('div')
    elRef.current.setAttribute('data-progress-portal', 'true')
  }

  useEffect(() => {
    const modalRoot = document.getElementById('modal-root')
    if (!modalRoot || !elRef.current) return

    modalRoot.appendChild(elRef.current)

    return () => {
      if (elRef.current && modalRoot.contains(elRef.current)) {
        modalRoot.removeChild(elRef.current)
      }
    }
  }, [])

  return createPortal(children, elRef.current)
}
