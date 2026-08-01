import fs from "node:fs/promises";
import ts from "typescript";

import { parseSourceFile } from "./parser.js";
import type { RepositorySnapshot } from "./types.js";

export interface SymbolNode {
  name: string;
  kind: string;
  file: string;
}

export async function buildSymbolIndex(
  snapshot: RepositorySnapshot
): Promise<SymbolNode[]> {
  const symbols: SymbolNode[] = [];

  for (const file of snapshot.files) {
    if (![".ts", ".tsx"].includes(file.extension)) continue;

    const source = await fs.readFile(file.absolutePath, "utf8");

    const ast = parseSourceFile(file.path, source);

    function visit(node: ts.Node) {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword
        )
      ) {
        symbols.push({
          name: node.name.text,
          kind: "function",
          file: file.path,
        });
      }

      if (
        ts.isClassDeclaration(node) &&
        node.name &&
        node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword
        )
      ) {
        symbols.push({
          name: node.name.text,
          kind: "class",
          file: file.path,
        });
      }

      if (
        ts.isInterfaceDeclaration(node) &&
        node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword
        )
      ) {
        symbols.push({
          name: node.name.text,
          kind: "interface",
          file: file.path,
        });
      }

      ts.forEachChild(node, visit);
    }

    visit(ast);
  }

  return symbols;
}