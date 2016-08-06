import * as fs from 'fs';
import * as path from 'path';
import {run} from '../src/treeshaker';

describe("integration specs", () => {
  it("should work for simple cases", () => {
    check("fixtures/simple/simple.ts", "fixtures/simple/expected.ts");
  });

  it("should work with imports/export", () => {
    check("fixtures/imports_and_exports/a.ts", "fixtures/imports_and_exports/expected.ts");
  });

  fit("should remove top-levle statements that are pure", () => {
    check("fixtures/statements/a.ts", "fixtures/statements/expected.ts");
  });

  // should do renaming (functions name the same way)
  // should handle top-level statements (purity etc)
});

function check(entrypoint: string, expected: string) {
  const entrypointPath = path.resolve(__dirname, entrypoint);
  const expectedPath = path.resolve(__dirname, expected);
  expect(run(entrypointPath)).toEqual(fs.readFileSync(expectedPath).toString());
}