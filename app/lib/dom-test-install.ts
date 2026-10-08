import { installTestDom } from "~/lib/dom-test-setup"

/** Import first in a test so the DOM exists before base-ui modules load. */
installTestDom()
