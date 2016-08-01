import * as fs from 'fs';
import * as path from 'path';
import {run} from '../src/treeshaker';

describe("integration specs", () => {
  it("should work for simple cases", () => {
    check("fixtures/simple/simple.ts", "fixtures/simple/expected.ts");
  });

  fit("should work with imports/export", () => {
    check("fixtures/imports_and_exports/a.ts", "fixtures/imports_and_exports/expected.ts");
  });

  // should do renaming (functions name the same way)
  // should handle top-level statements
});

function check(entrypoint: string, expected: string) {
  const entrypointPath = path.resolve(__dirname, entrypoint);
  const expectedPath = path.resolve(__dirname, expected);
  expect(run(entrypointPath)).toEqual(fs.readFileSync(expectedPath).toString());
}