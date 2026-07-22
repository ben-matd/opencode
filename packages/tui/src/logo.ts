export const logo = {
  left: ["                   ", "█▀▀█ █▀▀█ █▀▀█ █▀▀▄", "█__█ █__█ █^^^ █__█", "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

export const bencodeLogo = {
  left: ["     ", "█▀▀▄ █▀▀█ █▀▀▄", "█▀▀▄ █^^^ █__█", "▀▀▀▀ ▀▀▀▀ ▀~~▀"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const bencodeGo = {
  left: ["   ", "█▀▀▄", "█▀▀▄", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const marks = "_^~,"

export type LogoName = "opencode" | "bencode"

export function selectLogo(name: LogoName): typeof logo {
  if (name === "bencode") return bencodeLogo
  return logo
}

export function selectGo(name: LogoName): typeof go {
  if (name === "bencode") return bencodeGo
  return go
}

export function displayName(name: LogoName): string {
  if (name === "bencode") return "Bencode"
  return "OpenCode"
}
