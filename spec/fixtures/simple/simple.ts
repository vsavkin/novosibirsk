export function a(): string {
  return b("value");
}

function b(p: string): string {
  return p;
}

function c() {
  return "100";
}