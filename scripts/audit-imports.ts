/**
 * TypeScript AST helpers shared by the architecture audits.
 *
 * The audits need to see every runtime module dependency: static imports,
 * side-effect imports, re-exports, dynamic `import()`, `require()`, and
 * `import x = require()`. Relative specifiers are resolved by the caller.
 * Type-only imports and exports are erased at runtime and are ignored.
 */

import ts from "typescript";

export type ImportHit = {
  specifier: string;
  line: number;
};

export type UnresolvedImportHit = {
  kind: "import" | "require";
  line: number;
};

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return line + 1;
}

export function collectUnresolvedDynamicImports(
  sourceFile: ts.SourceFile,
): UnresolvedImportHit[] {
  const hits: UnresolvedImportHit[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const isDynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === "require";
      const [firstArgument] = node.arguments;

      if (
        (isDynamicImport || isRequire) &&
        (!firstArgument || !ts.isStringLiteralLike(firstArgument))
      ) {
        hits.push({
          kind: isDynamicImport ? "import" : "require",
          line: lineOf(sourceFile, node),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return hits;
}

function importIsTypeOnly(clause: ts.ImportClause): boolean {
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;

  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return false;

  return (
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function exportIsTypeOnly(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return false;

  return (
    node.exportClause.elements.length > 0 &&
    node.exportClause.elements.every((element) => element.isTypeOnly)
  );
}

export function collectRuntimeImportHits(
  sourceFile: ts.SourceFile,
): ImportHit[] {
  const hits: ImportHit[] = [];

  const add = (node: ts.Node, specifier: string) => {
    hits.push({ specifier, line: lineOf(sourceFile, node) });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const runtimeImport = !clause || !importIsTypeOnly(clause);

      if (runtimeImport && ts.isStringLiteral(node.moduleSpecifier)) {
        add(node, node.moduleSpecifier.text);
      }
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !exportIsTypeOnly(node)
    ) {
      add(node, node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference;
      if (
        !node.isTypeOnly &&
        ts.isExternalModuleReference(reference) &&
        ts.isStringLiteral(reference.expression)
      ) {
        add(node, reference.expression.text);
      }
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === "require";
      const [firstArgument] = node.arguments;

      if (
        (isDynamicImport || isRequire) &&
        firstArgument &&
        ts.isStringLiteralLike(firstArgument)
      ) {
        add(node, firstArgument.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return hits;
}
