import { Nodes } from 'mdast';

/**
 * Drop trailing initial and final `br`s.
 */
export function dropSurroundingBreaks<T extends Nodes>(nodes: T[]): T[] {
  let start = 0
  let end = nodes.length

  while (start < end && nodes[start].type === 'break') start++
  while (end > start && nodes[end - 1].type === 'break') end--

  return start === 0 && end === nodes.length ? nodes : nodes.slice(start, end)
}
