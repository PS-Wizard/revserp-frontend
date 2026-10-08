import {
  cloneElement,
  createContext,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"
import { mock } from "bun:test"

const OpenContext = createContext<{ open: boolean; toggle: () => void }>({
  open: false,
  toggle: () => {},
})

/**
 * base-ui caches `document` at first module load, and bun shares one module
 * registry across test files, so a real menu only opens when this file happens
 * to run first. Swap the menu for an inline stand-in that keeps the menuitem
 * contract tests rely on. Call before importing the component under test.
 */
export function mockDropdownMenu() {
  mock.module("~/components/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: { children: ReactNode }) => {
      const [open, setOpen] = useState(false)
      return (
        <OpenContext.Provider value={{ open, toggle: () => setOpen((v) => !v) }}>
          {children}
        </OpenContext.Provider>
      )
    },
    DropdownMenuTrigger: ({ render }: { render: ReactElement<any> }) => {
      const { toggle } = useContext(OpenContext)
      return cloneElement(render, { onClick: toggle })
    },
    DropdownMenuContent: ({ children }: { children: ReactNode }) => {
      const { open } = useContext(OpenContext)
      return open ? <div role="menu">{children}</div> : null
    },
    DropdownMenuItem: ({
      children,
      onClick,
    }: {
      children: ReactNode
      onClick?: () => void
    }) => {
      const { toggle } = useContext(OpenContext)
      return (
        <div
          role="menuitem"
          onClick={() => {
            toggle()
            onClick?.()
          }}
        >
          {children}
        </div>
      )
    },
    DropdownMenuSeparator: () => <hr />,
  }))
}
