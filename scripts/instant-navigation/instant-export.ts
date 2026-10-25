/**
 * AST inspection for the Next.js `instant` route segment config.
 *
 * Both the instant-navigation audit and the migration-coverage check need to
 * know whether a page opts into instant validation. A regex over raw source
 * cannot tell a real export from a comment, and it cannot see the object-form
 * opt-outs (`unstable_disableValidation` and friends) that Next 16.4 accepts.
 * Parsing the module with the TypeScript compiler removes both blind spots.
 */

import ts from "typescript";

export type InstantExportInspection =
  | { state: "missing" }
  | { state: "enabled"; line: number }
  | { state: "disabled"; line: number; disabledBy: string };

const DISABLE_FLAGS = [
  "unstable_disableValidation",
  "unstable_disableDevValidation",
  "unstable_disableBuildValidation",
] as const;

/**
 * Inspects a page module for `export const instant = ...`.
 *
 * `true` and object configs without a disable flag count as enabled. `false`
 * and object configs that set any `unstable_disable*Validation` flag to `true`
 * count as disabled. Commented-out exports are ignored, as are non-exported
 * variables.
 */
export function inspectInstantExport(
  source: string,
  fileName = "page.tsx",
): InstantExportInspection {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      if (declaration.name.text !== "instant") continue;

      const line =
        sourceFile.getLineAndCharacterOfPosition(
          declaration.name.getStart(sourceFile),
        ).line + 1;
      const disabledBy = findDisableFlag(declaration.initializer);

      return disabledBy
        ? { state: "disabled", line, disabledBy }
        : { state: "enabled", line };
    }
  }

  return { state: "missing" };
}

/**
 * Returns the location when the module still uses the legacy
 * `unstable_instant` export, which the installed Next.js version ignores.
 */
export function findLegacyInstantExport(
  source: string,
  fileName = "page.tsx",
): { name: string; line: number } | null {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === "unstable_instant"
      ) {
        return {
          name: "unstable_instant",
          line:
            sourceFile.getLineAndCharacterOfPosition(
              declaration.name.getStart(sourceFile),
            ).line + 1,
        };
      }
    }
  }

  return null;
}

function hasModifier(
  node: ts.VariableStatement,
  kind: ts.SyntaxKind,
): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function findDisableFlag(
  initializer: ts.Expression | undefined,
): string | null {
  if (!initializer) return null;

  const expression = unwrap(initializer);

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return "instant = false";
  }

  if (!ts.isObjectLiteralExpression(expression)) {
    return null;
  }

  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) continue;

    const name = propertyName(property.name);
    if (!name || !DISABLE_FLAGS.includes(name as (typeof DISABLE_FLAGS)[number])) {
      continue;
    }

    if (unwrap(property.initializer).kind === ts.SyntaxKind.TrueKeyword) {
      return name;
    }
  }

  return null;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;

  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  return null;
}
