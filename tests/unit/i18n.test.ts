import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import { pickLocale } from "@/lib/constants";

type Tree = { [k: string]: string | Tree };

function flatten(t: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const E = flatten(en as Tree);
const H = flatten(hi as Tree);

// Words that stay in Latin letters on purpose (brand and acronyms).
const SAME_IN_BOTH = new Set([
  "language.en", "bedType.ICU", "landing.footer.github", "ward.admit.uhid", "privacy.uhid",
  // Pure placeholders: only names and numbers, nothing to translate.
  "nav.who", "ward.queueLabel", "profile.line",
]);

/** {name} and {count, plural, ...} argument names, plus rich-text tags like <b>. */
function placeholders(s: string): string[] {
  const args = [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]!);
  const tags = [...s.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`);
  return [...new Set([...args, ...tags])].sort();
}

describe("message catalogs", () => {
  it("English and Hindi have exactly the same keys", () => {
    const only = (a: object, b: object) => Object.keys(a).filter((k) => !(k in b));
    expect({ missingInHindi: only(E, H), missingInEnglish: only(H, E) }).toEqual({ missingInHindi: [], missingInEnglish: [] });
  });

  it("no message is empty", () => {
    for (const [k, v] of Object.entries({ ...E, ...H })) expect(v.trim(), k).not.toBe("");
  });

  it("every Hindi message uses the same placeholders and tags as English", () => {
    for (const k of Object.keys(E)) expect(placeholders(H[k] ?? ""), k).toEqual(placeholders(E[k]!));
  });

  it("every Hindi message is actually Hindi (Devanagari), except brand names", () => {
    const untranslated = Object.entries(H).filter(([k, v]) => !SAME_IN_BOTH.has(k) && !/[ऀ-ॿ]/.test(v));
    expect(untranslated.map(([k]) => k)).toEqual([]);
  });

  it("no message uses a straight apostrophe, which is an escape character in ICU messages", () => {
    for (const [k, v] of Object.entries({ ...E, ...H })) expect(v.includes("'"), k).toBe(false);
  });

  it("error codes the API can return all have a translation", () => {
    const codes = new Set<string>();
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n)) for (const m of readFileSync(p, "utf8").matchAll(/(?:apiError\(\s*\d+\s*,|fail\(\s*\d+\s*,|new BedError\(\s*\d+\s*,)\s*"([A-Z_]+)"/g)) codes.add(m[1]!);
      }
    };
    walk(path.join(process.cwd(), "src"));
    expect(codes.size).toBeGreaterThan(10);
    expect([...codes].filter((c) => !(`errors.${c}` in E))).toEqual([]);
  });
});

describe("pickLocale", () => {
  it("a saved choice always wins", () => {
    expect(pickLocale("hi", "en-US,en;q=0.9")).toBe("hi");
    expect(pickLocale("en", "hi-IN,hi;q=0.9")).toBe("en");
  });
  it("otherwise follows the browser's first language", () => {
    expect(pickLocale(undefined, "hi-IN,hi;q=0.9,en;q=0.8")).toBe("hi");
    expect(pickLocale(undefined, "hi")).toBe("hi");
    expect(pickLocale(undefined, "en-GB,hi;q=0.5")).toBe("en");
  });
  it("falls back to English for anything else, including a junk cookie", () => {
    expect(pickLocale(undefined, null)).toBe("en");
    expect(pickLocale("fr", "fr-FR")).toBe("en");
    expect(pickLocale("<script>", null)).toBe("en");
  });
});

describe("translation keys used in the code exist", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(n)) files.push(p);
    }
  };
  walk(path.join(process.cwd(), "src"));

  it("every literal t(\"key\") resolves in the English catalog", () => {
    const missing: string[] = [];
    let checked = 0;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // const t = useTranslations("ns")  /  const t = await getTranslations("ns")
      for (const m of src.matchAll(/const (\w+) = (?:await )?(?:useTranslations|getTranslations)\("([\w.]+)"\)/g)) {
        const [, variable, ns] = m;
        for (const c of src.matchAll(new RegExp(`\\b${variable}(?:\\.rich)?\\(\\s*"([\\w.]+)"`, "g"))) {
          checked++;
          if (!(`${ns}.${c[1]}` in E)) missing.push(`${path.relative(process.cwd(), f)}: ${ns}.${c[1]}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(missing.join("\n")).toBe(""); // one line per missing key, so a failure names them
  });

  it("every message in the catalog is used somewhere (no dead strings)", () => {
    const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
    // Namespaces whose keys are built at run time (status.${x}, role.${x}, ...) are checked by their prefix.
    const DYNAMIC = ["status.", "bedType.", "role.", "gender.", "sex.", "outcome.", "errors.", "time.", "meta.", "ward.actions.", "landing.faq."];
    const unused = Object.keys(E).filter((k) => {
      if (DYNAMIC.some((p) => k.startsWith(p))) return false;
      const ns = k.split(".").slice(0, -1).join(".");
      const leaf = k.split(".").pop()!;
      return !all.includes(`"${leaf}"`) && !all.includes(`"${k}"`) && !all.includes(`.${leaf}`) && !all.includes(`"${ns}.${leaf}"`);
    });
    expect(unused.join("\n")).toBe("");
  });
});
