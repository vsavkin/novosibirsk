import * as path from 'path';
import * as ts from 'typescript';

const baseTsOptions: ts.CompilerOptions = {
  moduleResolution: ts.ModuleResolutionKind.Classic
};

export function run(entrypoint: string): string {
  const host = ts.createCompilerHost(baseTsOptions);
  const normalizedEntryPoint = path.normalize(entrypoint);

  if (!entrypoint.match(/\.ts$/)) {
    throw new Error(`Source file "${entrypoint}" is not a TypeScript file`);
  }

  const program = ts.createProgram([entrypoint], baseTsOptions, host);

  console.log(program);

  return "fixed";
}