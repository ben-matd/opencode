import type { LogoName } from "../logo"
import { createSimpleContext } from "./helper"

export const { use: useAppName, provider: AppNameProvider } = createSimpleContext({
  name: "AppName",
  init: (props: { value: LogoName }) => props.value,
})
