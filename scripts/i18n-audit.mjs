#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const ROOT = process.cwd();
const I18N_FILE = path.join(ROOT, "lib", "i18n.ts");
const REPORT_DIR = path.join(ROOT, "reports");
const MARKDOWN_REPORT = path.join(REPORT_DIR, "i18n-audit.md");
const JSON_REPORT = path.join(REPORT_DIR, "i18n-audit.json");
const FAIL_ON_FINDINGS = process.argv.includes("--fail-on-findings");

const EXCLUDED_DIRECTORIES = new Set([
  ".git", ".next", ".open-next", "node_modules", "playwright", "playwright-report",
  "public", "reports", "scripts", "test-results", "tests",
]);
const USER_VISIBLE_FIELDS = new Map([
  ["placeholder", "placeholder"], ["title", "title"], ["aria-label", "aria-label"],
  ["aria-description", "aria-description"], ["alt", "alt"], ["tooltip", "tooltip"],
  ["tooltiptext", "tooltip"], ["tooltipcontent", "tooltip"], ["content", "content"],
  ["label", "label"], ["description", "description"], ["helptext", "help text"],
  ["helpertext", "help text"], ["emptytext", "empty state"], ["emptymessage", "empty state"],
  ["loadingtext", "loading message"], ["loadingmessage", "loading message"],
  ["errormessage", "error message"], ["confirmtext", "confirmation"],
  ["canceltext", "action label"], ["buttontext", "button label"], ["messagetext", "message"],
  ["caption", "caption"], ["hint", "help text"], ["message", "message"],
  ["text", "text"], ["disabledreason", "disabled explanation"], ["lockedreason", "locked explanation"],
  ["hoverlabel", "hover label"], ["hovertext", "hover text"], ["srtext", "screen-reader text"],
]);
const UI_SETTER_PATTERN = /^set[A-Z].*(?:Error|Message|Notice|Status|Warning|Description|Label|Tooltip|Placeholder|Help)$/;
const UI_VARIABLE_PATTERN = /(?:error|message|notice|warning|description|label|tooltip|placeholder|help|emptyText|loadingText)$/i;
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) walk(path.join(directory, entry.name), files);
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    const file = relative(fullPath);
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) continue;
    if (/(^|\/)(?:__tests__|tests?)(\/|$)/i.test(file) || /\.(?:test|spec)\.[jt]sx?$/i.test(entry.name)) continue;
    if (file === "lib/i18n.ts" || file.startsWith("app/api/")) continue;
    files.push(fullPath);
  }
  return files;
}

function createSourceFile(filePath) {
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function propertyName(node) {
  if (!node) return "";
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return "";
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isLikelyTechnicalLiteral(raw) {
  const value = normalizeText(raw);
  if (!value || !/[\p{L}]/u.test(value)) return true;
  if (HTTP_METHODS.has(value)) return true;
  if (/^(?:https?:|mailto:|tel:|data:|blob:)/i.test(value)) return true;
  if (/^(?:\/api\/|api\/|\.\.?\/|@\/)/i.test(value)) return true;
  if (/^[\w-]+\/(?:[\w.+-]+)$/i.test(value)) return true;
  if (/^#[0-9a-f]{3,8}$/i.test(value) || /^(?:en|es)(?:[-_](?:US|AR))?$/i.test(value)) return true;
  if (/^(?:true|false|null|undefined|auto|none|normal|polite|assertive|off)$/i.test(value)) return true;
  if (/^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/i.test(value)) return true;
  if (/^[A-Z_][A-Z0-9_]*$/.test(value) && value.length > 2) return true;
  if (/^(?:[a-z0-9]+[-_:])+[a-z0-9_[\]./%-]+$/i.test(value) && !value.includes(" ")) return true;
  if (/^(?:flex|grid|block|inline|hidden|absolute|relative|fixed|sticky)(?:\s|$)/.test(value)) return true;
  if (/^(?:text|bg|border|rounded|shadow|hover|focus|sm|md|lg|xl|w|h|min|max|p|px|py|m|mx|my|gap|items|justify|overflow|z|top|left|right|bottom)-/.test(value)) return true;
  return false;
}

function location(sourceFile, node) {
  const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile, false));
  return { line: point.line + 1, column: point.character + 1 };
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return `${calleeName(expression.expression)}.${expression.name.text}`;
  return expression.getText();
}

function translationBindings(sourceFile) {
  const directFunctions = new Map();
  const hookFunctions = new Set(["useI18n"]);
  const localTranslators = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      const local = element.name.text;
      if (moduleName.endsWith("/lib/i18n") && (imported === "t" || imported === "getTranslation")) {
        directFunctions.set(local, 1);
      }
      if (moduleName.endsWith("/lib/use-i18n") && imported === "useI18n") hookFunctions.add(local);
    }
  }

  function findHookDestructures(node) {
    if (
      ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer &&
      ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) &&
      hookFunctions.has(node.initializer.expression.text)
    ) {
      for (const element of node.name.elements) {
        const imported = propertyName(element.propertyName) || propertyName(element.name);
        if (imported === "t" && ts.isIdentifier(element.name)) localTranslators.add(element.name.text);
      }
    }
    ts.forEachChild(node, findHookDestructures);
  }
  findHookDestructures(sourceFile);

  function forwardsKey(body, parameterName) {
    let forwards = false;
    function referencesParameter(node) {
      let found = false;
      function inspectReference(candidate) {
        if (found) return;
        if (ts.isIdentifier(candidate) && candidate.text === parameterName) {
          found = true;
          return;
        }
        ts.forEachChild(candidate, inspectReference);
      }
      inspectReference(node);
      return found;
    }
    function inspect(node) {
      if (forwards) return;
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && localTranslators.has(node.expression.text)) {
        const argument = node.arguments[0];
        if (argument && referencesParameter(argument)) forwards = true;
      }
      ts.forEachChild(node, inspect);
    }
    inspect(body);
    return forwards;
  }

  let changed = true;
  while (changed) {
    changed = false;
    function findWrappers(node) {
      let name = "";
      let parameters;
      let body;
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        name = node.name.text;
        parameters = node.parameters;
        body = node.body;
      } else if (
        ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        name = node.name.text;
        parameters = node.initializer.parameters;
        body = node.initializer.body;
      }
      const firstParameter = parameters?.[0]?.name;
      if (name && firstParameter && ts.isIdentifier(firstParameter) && body && !localTranslators.has(name) && forwardsKey(body, firstParameter.text)) {
        localTranslators.add(name);
        changed = true;
      }
      ts.forEachChild(node, findWrappers);
    }
    findWrappers(sourceFile);
  }
  return { directFunctions, localTranslators, all: new Set([...directFunctions.keys(), ...localTranslators]) };
}

function isTranslationCall(node, translators) {
  if (!ts.isCallExpression(node)) return false;
  if (ts.isIdentifier(node.expression) && translators.has(node.expression.text)) return true;
  return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "t";
}

function renderedStrings(node, translators) {
  if (!node) return [];
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [{ text: node.text, node }];
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) text += `{...}${span.literal.text}`;
    return [{ text, node }];
  }
  if (isTranslationCall(node, translators)) return [];
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
    return renderedStrings(node.expression, translators);
  }
  if (ts.isConditionalExpression(node)) {
    return [...renderedStrings(node.whenTrue, translators), ...renderedStrings(node.whenFalse, translators)];
  }
  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = renderedStrings(node.left, translators);
      const right = renderedStrings(node.right, translators);
      if (left.length === 1 && right.length === 1) return [{ text: `${left[0].text}${right[0].text}`, node }];
      return [...left, ...right];
    }
    if ([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
      return renderedStrings(node.right, translators);
    }
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((item) => renderedStrings(item, translators));
  return [];
}

function auditSource(filePath) {
  const sourceFile = createSourceFile(filePath);
  const file = relative(filePath);
  const hardcoded = [];
  const usedKeys = [];
  const candidateKeys = [];
  const dynamicTranslationCalls = [];
  const seen = new Set();
  const bindings = translationBindings(sourceFile);

  function addHardcoded(rawText, node, context) {
    const text = normalizeText(rawText);
    if (isLikelyTechnicalLiteral(text)) return;
    const point = location(sourceFile, node);
    const fingerprint = `${point.line}:${point.column}:${context}:${text}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    hardcoded.push({ file, ...point, text, context });
  }

  function collect(node, context) {
    for (const finding of renderedStrings(node, bindings.all)) addHardcoded(finding.text, finding.node, context);
  }

  function recordTranslationCall(node) {
    if (!ts.isCallExpression(node)) return;
    let keyNode;
    if (ts.isIdentifier(node.expression) && bindings.localTranslators.has(node.expression.text)) {
      keyNode = node.arguments[0];
    } else if (ts.isIdentifier(node.expression) && bindings.directFunctions.has(node.expression.text)) {
      keyNode = node.arguments[bindings.directFunctions.get(node.expression.text)];
    } else if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "t") {
      keyNode = node.arguments[0];
    } else return;

    const point = location(sourceFile, keyNode ?? node);
    if (keyNode && (ts.isStringLiteralLike(keyNode) || ts.isNoSubstitutionTemplateLiteral(keyNode))) {
      usedKeys.push({ key: keyNode.text, file, ...point });
    } else {
      dynamicTranslationCalls.push({ file, ...point, expression: keyNode?.getText(sourceFile) ?? "<missing>" });
    }
  }

  function visit(node) {
    recordTranslationCall(node);
    if (
      ts.isStringLiteralLike(node) &&
      /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/.test(node.text) &&
      !ts.isImportDeclaration(node.parent) &&
      !ts.isExportDeclaration(node.parent)
    ) {
      candidateKeys.push({ key: node.text, file, ...location(sourceFile, node) });
    }
    if (ts.isJsxText(node)) {
      addHardcoded(node.getText(sourceFile), node, "JSX text");
      return;
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile).toLowerCase();
      const context = USER_VISIBLE_FIELDS.get(name) ?? (name.startsWith("aria-") ? name : null);
      if (context && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) addHardcoded(node.initializer.text, node.initializer, context);
        else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) collect(node.initializer.expression, context);
      }
    } else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      const parentTag = ts.isJsxElement(node.parent)
        ? node.parent.openingElement.tagName.getText(sourceFile).toLowerCase()
        : "";
      if (parentTag !== "style" && parentTag !== "script") collect(node.expression, "JSX expression");
    } else if (ts.isPropertyAssignment(node)) {
      const context = USER_VISIBLE_FIELDS.get(propertyName(node.name).toLowerCase());
      if (context) collect(node.initializer, `UI config ${context}`);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && UI_VARIABLE_PATTERN.test(node.name.text)) {
      collect(node.initializer, `UI variable ${node.name.text}`);
    } else if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      let context = null;
      if (/^(?:toast|sonner)(?:\.|$)/i.test(name) || /(?:show|add|push)(?:Toast|Notification)$/i.test(name)) context = "toast/notification";
      else if (/^(?:window\.)?(?:alert|confirm|prompt)$/.test(name)) context = "browser dialog";
      else if (UI_SETTER_PATTERN.test(name.split(".").at(-1) ?? "")) context = `UI setter ${name}`;
      if (context && node.arguments[0]) collect(node.arguments[0], context);
    } else if (ts.isNewExpression(node) && calleeName(node.expression) === "Error" && node.arguments?.[0]) {
      collect(node.arguments[0], "error message");
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { hardcoded, usedKeys, candidateKeys, dynamicTranslationCalls };
}

function literalValue(node) {
  return ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function readDictionary(name) {
  const sourceFile = createSourceFile(I18N_FILE);
  let dictionary;
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer) {
        const value = ts.isAsExpression(declaration.initializer) ? declaration.initializer.expression : declaration.initializer;
        if (ts.isObjectLiteralExpression(value)) dictionary = value;
      }
    }
  }
  if (!dictionary) throw new Error(`Could not find ${name} in lib/i18n.ts`);
  const entries = new Map();
  const duplicateKeys = [];
  for (const property of dictionary.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = propertyName(property.name);
    if (!key) continue;
    const point = location(sourceFile, property);
    if (entries.has(key)) duplicateKeys.push({ key, firstLine: entries.get(key).line, duplicateLine: point.line });
    entries.set(key, { key, value: literalValue(property.initializer), ...point });
  }
  return { entries, duplicateKeys };
}

function findDuplicateValues(locale, entries) {
  const grouped = new Map();
  for (const entry of entries.values()) {
    if (!entry.value) continue;
    const value = normalizeText(entry.value);
    if (value.length < 4 || !/[\p{L}]/u.test(value)) continue;
    grouped.set(value, [...(grouped.get(value) ?? []), entry.key]);
  }
  return [...grouped.entries()]
    .filter(([, keys]) => keys.length > 1)
    .map(([value, keys]) => ({ locale, value, keys: keys.sort() }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

function escapeMarkdown(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").replace(/`/g, "\\`");
}

function table(headers, rows) {
  if (!rows.length) return "_None._\n";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeMarkdown).join(" | ")} |`),
    "",
  ].join("\n");
}

function buildMarkdown(report) {
  return [
    "# i18n Audit Report", "", `Generated: ${report.generatedAt}`, "",
    `Scanned ${report.summary.filesScanned} frontend TypeScript files.`, "",
    "## Summary", "",
    table(["Category", "Count"], [
      ["Hardcoded user-visible strings", report.summary.hardcodedStrings],
      ["Keys used but missing from English", report.summary.missingEnglishKeys],
      ["Keys used but missing explicit Spanish translation", report.summary.missingSpanishKeys],
      ["English keys defined but unused", report.summary.unusedKeys],
      ["Dynamic translation calls requiring review", report.summary.dynamicTranslationCalls],
      ["Duplicate key definitions", report.summary.duplicateKeyDefinitions],
      ["Duplicate translation value groups", report.summary.duplicateValueGroups],
    ]),
    "## 1. Hardcoded User-Visible Strings", "",
    table(["File", "Line", "Text", "Context"], report.hardcodedStrings.map((item) => [item.file, item.line, `\`${item.text}\``, item.context])),
    "## 2. Missing EN Keys", "",
    table(["Key", "Used at"], report.missingEnglishKeys.map((item) => [item.key, item.locations.map((loc) => `${loc.file}:${loc.line}`).join(", ")])),
    "## 3. Missing ES Keys", "",
    "These keys currently resolve through `...EN_US`; they do not have an explicit Spanish translation.", "",
    table(["Key", "English value", "Used at"], report.missingSpanishKeys.map((item) => [item.key, item.englishValue ?? "", item.locations.map((loc) => `${loc.file}:${loc.line}`).join(", ")])),
    "## 4. Unused Keys", "",
    table(["Key", "English value", "Defined at"], report.unusedKeys.map((item) => [item.key, item.englishValue ?? "", `lib/i18n.ts:${item.line}`])),
    "## 5. Duplicate Definitions And Values", "", "### Duplicate key definitions", "",
    table(["Locale", "Key", "First line", "Duplicate line"], report.duplicateKeyDefinitions.map((item) => [item.locale, item.key, item.firstLine, item.duplicateLine])),
    "### Duplicate translation values", "",
    table(["Locale", "Value", "Keys"], report.duplicateValues.map((item) => [item.locale, item.value, item.keys.join(", ")])),
    "## Dynamic Translation Calls", "",
    "Dynamic keys cannot be proven present or unused statically and require manual review.", "",
    table(["File", "Line", "Expression"], report.dynamicTranslationCalls.map((item) => [item.file, item.line, item.expression])),
    "## Scope And Heuristics", "",
    "- AST analysis uses the TypeScript compiler API.",
    "- Scans `.ts` and `.tsx` source files while excluding tests, generated output, API proxy routes, scripts, and `lib/i18n.ts`.",
    "- Hardcoded findings cover JSX text/expressions, accessibility and tooltip props, common UI configuration fields, browser dialogs, toasts, UI-message setters, and static `Error` messages.",
    "- Static analysis is intentionally conservative around identifiers, CSS classes, URLs, API paths, and technical literals; review findings before changing UI text.", "",
  ].join("\n");
}

function main() {
  const files = walk(ROOT).sort();
  const results = files.map(auditSource);
  const hardcodedStrings = results.flatMap((result) => result.hardcoded)
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
  const occurrences = results.flatMap((result) => result.usedKeys);
  const dynamicTranslationCalls = results.flatMap((result) => result.dynamicTranslationCalls)
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const english = readDictionary("EN_US");
  const spanish = readDictionary("ES_AR");
  for (const candidate of results.flatMap((result) => result.candidateKeys)) {
    if (english.entries.has(candidate.key)) occurrences.push(candidate);
  }
  const locations = new Map();
  for (const occurrence of occurrences) {
    locations.set(occurrence.key, [...(locations.get(occurrence.key) ?? []), {
      file: occurrence.file, line: occurrence.line, column: occurrence.column,
    }]);
  }
  const usedKeys = new Set(locations.keys());
  const missingEnglishKeys = [...usedKeys].filter((key) => !english.entries.has(key)).sort()
    .map((key) => ({ key, locations: locations.get(key) ?? [] }));
  const missingSpanishKeys = [...usedKeys].filter((key) => !spanish.entries.has(key)).sort()
    .map((key) => ({ key, englishValue: english.entries.get(key)?.value ?? null, locations: locations.get(key) ?? [] }));
  const unusedKeys = [...english.entries.values()].filter((entry) => !usedKeys.has(entry.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => ({ key: entry.key, englishValue: entry.value, line: entry.line }));
  const duplicateKeyDefinitions = [
    ...english.duplicateKeys.map((item) => ({ locale: "en-US", ...item })),
    ...spanish.duplicateKeys.map((item) => ({ locale: "es-AR", ...item })),
  ];
  const duplicateValues = [
    ...findDuplicateValues("en-US", english.entries), ...findDuplicateValues("es-AR", spanish.entries),
  ];
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      filesScanned: files.length, hardcodedStrings: hardcodedStrings.length,
      missingEnglishKeys: missingEnglishKeys.length, missingSpanishKeys: missingSpanishKeys.length,
      unusedKeys: unusedKeys.length, dynamicTranslationCalls: dynamicTranslationCalls.length,
      duplicateKeyDefinitions: duplicateKeyDefinitions.length, duplicateValueGroups: duplicateValues.length,
    },
    hardcodedStrings, missingEnglishKeys, missingSpanishKeys, unusedKeys,
    duplicateKeyDefinitions, duplicateValues, dynamicTranslationCalls,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const markdown = buildMarkdown(report);
  fs.writeFileSync(MARKDOWN_REPORT, markdown, "utf8");
  fs.writeFileSync(JSON_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${markdown}\n`);
  process.stderr.write(`\nReports written to ${relative(MARKDOWN_REPORT)} and ${relative(JSON_REPORT)}\n`);
  if (FAIL_ON_FINDINGS && (hardcodedStrings.length || missingEnglishKeys.length || missingSpanishKeys.length)) {
    process.exitCode = 1;
  }
}

main();
