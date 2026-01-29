// @ts-ignore
import structuredClone from '@ungap/structured-clone'
// @ts-ignore
import {phrasing as hastPhrasing} from 'hast-util-phrasing'
// @ts-ignore
import {whitespace} from 'hast-util-whitespace'
// @ts-ignore
import {phrasing as mdastPhrasing} from 'mdast-util-phrasing'
import {dropSurroundingBreaks} from './drop-surrounding-breaks.js'
import { BlockContent, Delete, Link, Nodes, Paragraph, PhrasingContent, RootContent } from 'mdast';

export function wrapNeeded(nodes: Nodes[]): boolean {
  let index = -1

  while (++index < nodes.length) {
    const node = nodes[index]

    if (!phrasing(node) || ('children' in node && wrapNeeded(node.children as Nodes[]))) {
      return true
    }
  }

  return false
}

export function wrap(nodes: RootContent[]): BlockContent[] {
  return runs(nodes, onphrasing, function (d: any) {
    return d
  })

  function onphrasing(nodes: PhrasingContent[]): Paragraph[] {
    return nodes.every(function (d) {
      return d.type === 'text' ? whitespace(d.value) : false
    })
      ? []
      : [{type: 'paragraph', children: dropSurroundingBreaks(nodes)} as Paragraph]
  }
}

function split(node: Delete | Link): BlockContent[] {
  return runs(node.children, onphrasing, onnonphrasing)

  function onphrasing(nodes: PhrasingContent[]): BlockContent[] {
    const newParent = cloneWithoutChildren(node)
    // @ts-ignore
    newParent.children = nodes
    // @ts-ignore
    return [newParent]
  }

  function onnonphrasing(child: BlockContent): BlockContent {
    if ('children' in child && 'children' in node) {
      const newParent = cloneWithoutChildren(node)
      // @ts-ignore
      const newChild = cloneWithoutChildren(child)
      // @ts-ignore
      newParent.children = child.children
      // @ts-ignore
      newChild.children.push(newParent)
      return newChild as BlockContent
    }

    return {...child}
  }
}

function runs(
  nodes: RootContent[],
  onphrasing: (nodes: PhrasingContent[]) => BlockContent[],
  onnonphrasing: (node: BlockContent) => BlockContent
): BlockContent[] {
  const flattened = flatten(nodes)
  const result: BlockContent[] = []
  let queue: PhrasingContent[] = []
  let index = -1

  while (++index < flattened.length) {
    const node = flattened[index]

    if (phrasing(node)) {
      queue.push(node as PhrasingContent)
    } else {
      if (queue.length > 0) {
        result.push(...onphrasing(queue))
        queue = []
      }

      // @ts-ignore
      result.push(onnonphrasing(node as BlockContent))
    }
  }

  if (queue.length > 0) {
    result.push(...onphrasing(queue))
    queue = []
  }

  return result
}

function flatten(nodes: RootContent[]): RootContent[] {
  const flattened: RootContent[] = []
  let index = -1

  while (++index < nodes.length) {
    const node = nodes[index]

    if (
      (node.type === 'delete' || node.type === 'link') &&
      wrapNeeded(node.children)
    ) {
      flattened.push(...split(node))
    } else {
      flattened.push(node)
    }
  }

  return flattened
}

function phrasing(node: any): boolean {
  const tagName = node.data && node.data.hName
  return tagName
    ? hastPhrasing({type: 'element', tagName, properties: {}, children: []})
    : mdastPhrasing(node)
}

function cloneWithoutChildren(node: any): any {
  return structuredClone({...node, children: []})
}
