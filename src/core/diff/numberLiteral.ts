/** A JSON number too large or precise for a JS number, kept as its source literal. Distinct from a string. */
export class NumberLiteral {
  constructor(readonly literal: string) {}
  toString(): string {
    return this.literal;
  }
}
