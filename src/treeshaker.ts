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
  entrypoint: string;

  constructor(filename: string) {
    if (!filename.match(/\.ts$/)) {
      throw new Error(`Source file "${filename}" is not a TypeScript file`);
    }

    const host = ts.createCompilerHost(baseTsOptions);
    this.entrypoint = path.normalize(filename);

    this.program = ts.createProgram([this.entrypoint], baseTsOptions, host);
    this.typeChecker = this.program.getTypeChecker();

  }

  bundle(): string {
    const onlyTsFiles = this.program.getSourceFiles().filter(sf => !sf.fileName.endsWith("d.ts"));
    const modules = onlyTsFiles.reduce((m, c) => (m[c.fileName] = this.compileFile(c), m), {});
    const linkedModules = this.link(modules);

    const entryModule = linkedModules[this.entrypoint];
    const roots = Object.keys(entryModule.declarations).
      map(n => entryModule.declarations[n]).
      filter(n => n.exported);
    const emitter = new Emitter();
    const res = emitter.emit(roots);
    return res;
  }

  private compileFile(sourceFile: ts.SourceFile): Module {
    const decls:Declaration[] = [];
    const imports:Import[] = [];
    const statements:Statement[] = [];

    sourceFile.statements.forEach(s => {
      if (s.kind === ts.SyntaxKind.ImportDeclaration) {
        imports.push(this.parseImport(sourceFile, <ts.ImportDeclaration>s));
      } else if (s.kind === ts.SyntaxKind.ExpressionStatement) {
        statements.push(this.parseStatement(<ts.ExpressionStatement>s));
      } else {
        decls.push(this.parseDeclaration(<ts.FunctionDeclaration>s));
      }
    });

    if (sourceFile.fileName !== this.entrypoint) {
      decls.forEach(d => this.removeExport(d));
    }

    const mapsOfImports = imports.reduce((m, c) => {
      c.identifiers.forEach(id => {
        m[id] = c.filename;
      });
      return m;
    }, {});

    const mapOfDecls = decls.reduce((m, c) => (m[c.name] = c, m), {});

    return new Module(sourceFile, sourceFile.fileName, mapOfDecls, mapsOfImports, statements);
  }

  private removeExport(d: Declaration): void {}

  private link(modules: {[filename:string]:Module}):{[filename:string]:Module} {
    Object.keys(modules).forEach(filename => {
      const m = modules[filename];
      Object.keys(m.declarations).forEach(k => {
        m.declarations[k].deps.forEach(dep => {
          if (m.declarations[dep.target]) {
            dep.node = m.declarations[dep.target];
          } else if (m.imports[dep.target]) {
            const importFilename = m.imports[dep.target];
            dep.node = modules[importFilename].declarations[dep.target];
          } else {
            throw "Unknow symbol!";
          }
        });
      });
    });

    return modules;
  }

  private parseStatement(n: ts.ExpressionStatement): Statement {
    const deps = new ReferenceCollector().collectFromExpression(n);
    return new Statement(n, "", deps);
  }

  private parseImport(sourceFile: ts.SourceFile, n: ts.ImportDeclaration): Import {
    const t = n.moduleSpecifier.getText();
    const filename = path.join(path.dirname(sourceFile.fileName), `${t.substring(2, t.length - 1)}.ts`);
    const ids = (<any>n.importClause!.namedBindings).elements.map(e => e.getText())
    return new Import(n, filename, ids);
  }

  private parseDeclaration(n: ts.FunctionDeclaration): Declaration {
    const name = n.name!.getText();
    const deps = n.body ? new ReferenceCollector().collectFromFunctionDeclaration(n) : [];
    const exported = !!n.modifiers && !!(n.modifiers.flags & ts.NodeFlags.Export);
    return new Declaration(n, "", deps, name, exported);
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

  collectFromFunctionDeclaration(fn: ts.FunctionDeclaration):Reference[] {
   	this.visit(<any>fn.body);
    return this.refs;
  }

  collectFromExpression(fn: ts.ExpressionStatement):Reference[] {
   	this.visit(<any>fn.expression);
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
    // should probably switch the order of emits to emits deps first
    const res = [root.ast.getText()];
    this.visited.add(root);
    res.push(...root.deps.map(d => this.emitNode(d.node)));
    return res.join("\n");
  }
}


export class Module {
  constructor(public ast: ts.Node, public name: string, public declarations: {[name:string]: Declaration}, public imports: {[id:string]: string}, public statements: Statement[]){}
}

export class Import {
  constructor(public ast: ts.Node, public filename: string, public identifiers: string[]){}
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

export class Statement extends Node {
  public pure: boolean = false;
  constructor(ast: ts.Node, module: string, deps: Reference[]) {
    super(ast, module, deps);
  }
}