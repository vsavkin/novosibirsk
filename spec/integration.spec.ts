import {run} from '../src/treeshaker';

describe("integration specs", () => {
  it("should work", () => {
    expect(run("enty")).toEqual("something else");
  });
});