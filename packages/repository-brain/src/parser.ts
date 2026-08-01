import ts from "typescript";

export function parseSourceFile(
  filePath: string,
  source: string
): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
}