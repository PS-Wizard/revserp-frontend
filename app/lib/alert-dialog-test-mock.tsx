import {
  cloneElement,
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react"
import { mock } from "bun:test"

const AlertDialogTestContext = createContext<{ requestClose: () => void }>({
  requestClose: () => {},
})

type CloseProps = {
  children?: ReactNode
  render?: ReactElement<any>
}

/**
 * base-ui caches `document` at first module load, and bun shares one module
 * registry across test files, so a real alert dialog never mounts its portal
 * under the happy-dom harness. Swap it for an inline stand-in that keeps the
 * open/confirm/cancel contract tests rely on. Call before importing the
 * component under test.
 */
export function mockAlertDialog() {
  mock.module("@base-ui/react/alert-dialog", () => ({
    AlertDialog: {
      Root: ({
        open,
        onOpenChange,
        children,
      }: {
        open: boolean
        onOpenChange?: (open: boolean) => void
        children: ReactNode
      }) => (
        <AlertDialogTestContext.Provider
          value={{ requestClose: () => onOpenChange?.(false) }}
        >
          {open ? children : null}
        </AlertDialogTestContext.Provider>
      ),
      Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
      Backdrop: () => null,
      Popup: ({ children }: { children: ReactNode }) => (
        <div role="alertdialog">{children}</div>
      ),
      Title: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Description: ({ children }: { children: ReactNode }) => (
        <div>{children}</div>
      ),
      Close: ({ children, render }: CloseProps) => {
        const { requestClose } = useContext(AlertDialogTestContext)
        if (render) {
          return cloneElement(render, {
            children,
            onClick: () => requestClose(),
          })
        }
        return (
          <button onClick={() => requestClose()} type="button">
            {children}
          </button>
        )
      },
    },
  }))
}
