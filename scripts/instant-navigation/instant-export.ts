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
  | { state: "unknown"; line: number }
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
 * count as disabled. Unresolved spreads count as unknown. Commented-out
 * exports are ignored, as are non-exported variables.
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

  const constants = new Map<string, ts.Expression>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        constants.set(declaration.name.text, declaration.initializer);
      }
    }
  }

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
      const disabledBy = findDisableFlag(declaration.initializer, constants);

      return disabledBy === undefined
        ? { state: "unknown", line }
        : disabledBy
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
    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const specifier of statement.exportClause.elements) {
        if (specifier.isTypeOnly) continue;
        if (
          specifier.name.text === "unstable_instant" ||
          specifier.propertyName?.text === "unstable_instant"
        ) {
          return {
            name: "unstable_instant",
            line: sourceFile.getLineAndCharacterOfPosition(
              specifier.getStart(sourceFile),
            ).line + 1,
          };
        }
      }
    }

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

/** A flag name means disabled, null means enabled, undefined means unknown. */
function findDisableFlag(
  initializer: ts.Expression | undefined,
  constants: ReadonlyMap<string, ts.Expression>,
): string | null | undefined {
  if (!initializer) return null;

  const expression = unwrap(initializer);

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return "instant = false";
  }

  if (!ts.isObjectLiteralExpression(expression)) {
    return null;
  }

  let unknown = false;
  for (const flag of DISABLE_FLAGS) {
    const value = effectiveFlag(expression, flag, constants);
    if (value === true) return flag;
    if (value === "unknown") unknown = true;
  }

  return unknown ? undefined : null;
}

/** Read right to left: later properties and spreads override earlier flags. */
function effectiveFlag(
  expression: ts.Expression,
  flag: string,
  constants: ReadonlyMap<string, ts.Expression>,
  seen = new Set<ts.Expression>(),
): boolean | "absent" | "unknown" {
  const value = unwrap(expression);
  if (seen.has(value)) return "unknown";
  const visited = new Set(seen).add(value);

  if (ts.isIdentifier(value)) {
    const initializer = constants.get(value.text);
    return initializer
      ? effectiveFlag(initializer, flag, constants, visited)
      : "unknown";
  }
  if (!ts.isObjectLiteralExpression(value)) return "unknown";

  for (let index = value.properties.length - 1; index >= 0; index -= 1) {
    const property = value.properties[index];
    if (ts.isSpreadAssignment(property)) {
      const spreadValue = effectiveFlag(
        property.expression,
        flag,
        constants,
        visited,
      );
      if (spreadValue !== "absent") return spreadValue;
      continue;
    }

    const name = propertyName(property.name);
    if (name === null) return "unknown";
    if (name !== flag) continue;
    if (!ts.isPropertyAssignment(property)) return "unknown";

    const initializer = unwrap(property.initializer);
    if (initializer.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (initializer.kind === ts.SyntaxKind.FalseKeyword) return false;
    return "unknown";
  }

  return "absent";
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
  if (ts.isComputedPropertyName(name)) {
    const expression = unwrap(name.expression);
    return ts.isStringLiteral(expression) ? expression.text : null;
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  return null;
}
