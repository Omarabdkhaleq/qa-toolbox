declare module 'json-source-map' {
  interface Location {
    line: number;
    column: number;
    pos: number;
  }
  interface Pointer {
    value: Location;
    valueEnd: Location;
    key?: Location;
    keyEnd?: Location;
  }
  const jsonMap: { parse(source: string): { data: unknown; pointers: Record<string, Pointer> } };
  export default jsonMap;
}
