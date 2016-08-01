import * as path from 'path';
import * as ts from 'typescript';

const baseTsOptions: ts.CompilerOptions = {
  moduleResolution: ts.ModuleResolutionKind.Classic
};

export function run(entrypoint: string): string {
  return new Bundler(entrypoint).bundle();
}

class Bundler {
  program: ts.Program;
  typeChecker: ts.TypeChecker;
  sourceFile: ts.SourceFile;

  constructor(filename: string) {
    if (!filename.match(/\.ts$/)) {
      throw new Error(`Source file "${filename}" is not a TypeScript file`);
    }

    const host = ts.createCompilerHost(baseTsOptions);
    const entrypoint = path.normalize(filename);

    this.program = ts.createProgram([entrypoint], baseTsOptions, host);
    this.typeChecker = this.program.getTypeChecker();

    this.sourceFile = this.program.getSourceFile(entrypoint);
    if (!this.sourceFile) {
      throw new Error(`Source file "${entrypoint}" not found`);
    }
  }

  bundle(): string {
    const decls = this.sourceFile.statements.map(s => this.parseDeclaration(<ts.FunctionDeclaration>s));
    const mapOfDecls = decls.reduce((m, c) => (m[c.name] = c, m), {});
    const module = new Module(this.sourceFile, this.sourceFile.fileName, mapOfDecls);
    const linkedModule = this.link(module);
    const roots = Object.keys(linkedModule.declarations).
      map(n => linkedModule.declarations[n]).
      filter(n => n.exported);

    const emitter = new Emitter();
    const res = emitter.emit(roots);

    return res;
  }

  private link(module: Module):Module {
    Object.keys(module.declarations).forEach(k => {
      module.declarations[k].deps.forEach(dep => {
        dep.node = module.declarations[dep.target];
      });
    });
    return module;
  }

  private parseDeclaration(n: ts.FunctionDeclaration): Declaration {
    const name = n.name!.getText();
    const deps = n.body ? this.collectDeps(n) : [];
    const exported = !!n.modifiers && !!(n.modifiers.flags & ts.NodeFlags.Export);
    return new Declaration(n, "", deps, name, exported);
  }

  private collectDeps(n: ts.FunctionDeclaration): Reference[] {
    const c = new ReferenceCollector(n);
    return c.collect();
  }

  private getResolvedSymbols(sourceFile: ts.SourceFile): ts.Symbol[] {
    const ms = (<any>sourceFile).symbol;
    const rawSymbols = ms ? (this.typeChecker.getExportsOfModule(ms) || []) : [];
    return rawSymbols.map(s => {
      if (s.flags & ts.SymbolFlags.Alias) {
        const resolvedSymbol = this.typeChecker.getAliasedSymbol(s);

        // This will happen, e.g. for symbols re-exported from external modules.
        if (!resolvedSymbol.valueDeclaration && !resolvedSymbol.declarations) {
          return s;
        }
        if (resolvedSymbol.name !== s.name) {
          throw new Error(
              `Symbol "${resolvedSymbol.name}" was aliased as "${s.name}". ` +
              `Aliases are not supported."`);
        }

        return resolvedSymbol;
      } else {
        return s;
      }
    });
  }
}

abstract class AstVisitor {
  visit(node: ts.Node):void {
    switch (node.kind) {
      case ts.SyntaxKind.Block:
        return this.visitBlock(<ts.Block>node);

      case ts.SyntaxKind.ReturnStatement:
        return this.visitReturn(<ts.ReturnStatement>node);

      case ts.SyntaxKind.CallExpression:
        return this.visitCall(<ts.CallExpression>node);

      case ts.SyntaxKind.Identifier:
        return this.visitIdentifier(<ts.Identifier>node);

      default:
        return;
        // throw new Error(`Unrecognized node type: ${node.kind} ${node.getText()}`);
    }
  }

  visitBlock(n: ts.Block): void {
    n.statements.forEach(s => this.visit(s));
  }

  visitReturn(n: ts.ReturnStatement): void {
    if (n.expression) {
      this.visit(n.expression);
    }
  }

  visitCall(n: ts.CallExpression): void {
    this.visit(n.expression);
    n.arguments.forEach(a => this.visit(a));
  }

  visitIdentifier(n: ts.Identifier): void {
  }
}

class ReferenceCollector extends AstVisitor {
  refs: Reference[] = [];

  constructor(public fn: ts.FunctionDeclaration) {
    super();
  }

  collect():Reference[] {
   	this.visit(<any>this.fn.body);
    return this.refs;
  }

  visitIdentifier(n: ts.Identifier): void {
    if (this.isExternalDep(n)) {
      this.refs.push(new Reference(n, "", n.getText()));
    }
    super.visitIdentifier(n);
  }

  private isExternalDep(n: ts.Identifier): boolean {
    // ask chuck how to do it
    // let c:ts.Node|undefined = n;
    // while (c) {
    //   if (c === this.fn) return false;
    //   c = c.parent;
    // }
    // return true;
    return n.getText() === "p" ? false : true;
  }
}

class Emitter {
  private visited = new Set();

  emit(roots: Declaration[]): string {
    return roots.map(r => this.emitNode(r)).join("\n");
  }

  private emitNode(root: Node): string {
    if (this.visited.has(root)) {
      return "";
    }
    const res = [root.ast.getText()];
    this.visited.add(root);
    res.push(...root.deps.map(d => this.emitNode(d.node)));
    return res.join("\n");
  }
}


export class Module {
  constructor(public ast: ts.Node, public name: string, public declarations: {[name:string]: Declaration}){}
}

export class Reference {
  public node: Node;
  constructor(public ast: ts.Node, public prefix: string, public target: string) {}
}

export abstract class Node {
  constructor(public ast: ts.Node, public module: string, public deps: Reference[]) {}
}

export class Declaration extends Node {
  constructor(ast: ts.Node, module: string, deps: Reference[], public name: string, public exported: boolean) {
    super(ast, module, deps);
  }
}