/** Realistic API-style array of objects, roughly `targetBytes` long. */
export function makeLargeJson(targetBytes: number): string {
  const parts: string[] = [];
  let size = 2;
  for (let i = 0; size < targetBytes; i++) {
    const item = JSON.stringify({
      id: i,
      name: `user-${i}`,
      email: `user${i}@example.com`,
      active: i % 2 === 0,
      score: i * 1.5,
      tags: ['alpha', 'beta', 'gamma'],
      address: { city: 'Springfield', zip: String(10000 + (i % 89999)) },
    });
    parts.push(item);
    size += item.length + 1;
  }
  return `[${parts.join(',')}]`;
}
