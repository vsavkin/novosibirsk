import * as fs from 'fs';
import * as path from 'path';
import {run} from '../src/treeshaker';

describe("integration specs", () => {
  it("should work", () => {
    check("fixtures/simple/simple.ts", "fixtures/simple/expected.ts");
  });
});

function check(entrypoint: string, expected: string) {
  const entrypointPath = path.resolve(__dirname, entrypoint);
  const expectedPath = path.resolve(__dirname, expected);
  expect(run(entrypointPath)).toEqual(fs.readFileSync(expectedPath).toString());
}