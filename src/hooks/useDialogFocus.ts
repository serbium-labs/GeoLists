import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('hidden'))
}

function moveFocusInsideDialog(event: KeyboardEvent, dialog: HTMLElement): void {
  const elements = focusableElements(dialog)
  if (elements.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const first = elements[0]
  const last = elements[elements.length - 1]
  const activeElement = document.activeElement
  const activeIsFocusable = activeElement instanceof HTMLElement && elements.includes(activeElement)
  const movingBeforeFirst = event.shiftKey && (!activeIsFocusable || activeElement === first)
  const movingAfterLast = !event.shiftKey && (!activeIsFocusable || activeElement === last)
  if (!movingBeforeFirst && !movingAfterLast) {
    return
  }

  event.preventDefault()
  const target = movingBeforeFirst ? last : first
  target.focus()
}

export function useDialogFocus(dialogRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const initialFocus = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')
      ?? focusableElements(dialog)[0]
      ?? dialog
    initialFocus.focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key === 'Tab') {
        moveFocusInsideDialog(event, dialog)
      }
    }

    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus()
      }
    }
  }, [dialogRef])
}
