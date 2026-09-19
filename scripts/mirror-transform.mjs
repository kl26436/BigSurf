// Pure ESM → CommonJS transform for the "mirrored module" pattern: a pure
// client module under js/core/ that functions/ needs too. functions/ deploys
// standalone (cannot read ../js), so the file is copied, not imported.
//
// Usage: node scripts/sync-mirror.mjs js/core/features/movement-patterns.js functions/movement-patterns.js
// The parity test (tests/unit/*-mirror.test.js) applies the same transform
// and asserts the committed server copy matches byte-for-byte.

export function toCommonJs(source, clientPath) {
    const exported = [];
    let out = source
        .replace(/^export (const|let|function|class) ([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
            exported.push(name);
            return `${kind} ${name}`;
        });
    if (/^export\s/m.test(out)) {
        throw new Error('mirror-transform: only `export const/let/function/class` declarations are supported');
    }
    // Named imports from a SIBLING mirrored module become requires — both
    // copies live side by side in functions/, so './movement-patterns.js'
    // resolves to the mirror. Anything else (deep paths, defaults, npm) is
    // refused: the mirror must not reach outside the mirrored set.
    out = out.replace(/^import \{([^}]+)\} from '\.\/([\w-]+)\.js';/gm, (_, names, mod) =>
        `const {${names}} = require('./${mod}');`);
    if (/^import\s/m.test(out)) {
        throw new Error('mirror-transform: only `import { a, b } from \'./sibling.js\'` is supported');
    }
    const header = `// GENERATED MIRROR of ${clientPath} — do not edit here.\n`
        + '// Edit the client module, then run: node scripts/sync-mirror.mjs '
        + `${clientPath} <this file>\n\n`;
    out = header + out.replace(/\s*$/, '\n') + `\nmodule.exports = { ${exported.join(', ')} };\n`;
    return out;
}
