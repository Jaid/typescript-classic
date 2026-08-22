const bunNodeGlobalsPrelude = /^(#![^\r\n]*(?:\r?\n))?var (?:(?:__dirname|__filename)="(?:\\.|[^"\\])*")(?:,(?:__dirname|__filename)="(?:\\.|[^"\\])*")*;/

export const restoreNodeGlobals = (source: string) => source.replace(
  bunNodeGlobalsPrelude,
  (_, shebang: string | undefined) => shebang ?? '',
)