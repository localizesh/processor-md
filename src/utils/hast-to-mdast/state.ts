import { position } from 'unist-util-position'
import { defaultHandlers as handlers, defaultNodeHandlers as nodeHandlers } from 'hast-util-to-mdast'
import { wrap } from './wrap.js'

const own = {}.hasOwnProperty

export function createState(options: any) {
  return {
    all,
    baseFound: false,
    elementById: new Map(),
    frozenBaseUrl: undefined,
    handlers: {...handlers, ...options.handlers},
    inTable: false,
    nodeHandlers: {...nodeHandlers, ...options.nodeHandlers},
    one,
    options,
    patch,
    qNesting: 0,
    resolve,
    toFlow,
    toSpecificContent
  }
}

function all(this: any, parent: any) {
  const children = parent.children || []
  const results = []
  let index = -1

  while (++index < children.length) {
    const child = children[index]
    const result = this.one(child, parent)

    if (Array.isArray(result)) {
      results.push(...result)
    } else if (result) {
      results.push(result)
    }
  }

  return results
}

function one(this: any, node: any, parent: any) {
  if (node.type === 'element') {
    if (node.properties && node.properties.dataMdast === 'ignore') {
      return
    }

    if (own.call(this.handlers, node.tagName)) {
      return this.handlers[node.tagName](this, node, parent) || undefined
    }
  } else if (own.call(this.nodeHandlers, node.type)) {
    return this.nodeHandlers[node.type](this, node, parent) || undefined
  }

  // Unknown literal.
  if ('value' in node && typeof node.value === 'string') {
    const result = {type: 'text', value: node.value}
    this.patch(node, result)
    return result
  }

  // Unknown parent.
  if ('children' in node) {
    return this.all(node)
  }
}

function patch(origin: any, node: any) {
  if (origin.position) node.position = position(origin)
}

function resolve(this: any, url: any) {
  const base = this.frozenBaseUrl

  if (url === null || url === undefined) {
    return ''
  }

  if (base) {
    return String(new URL(url, base))
  }

  return url
}

function toFlow(nodes: any) {
  return wrap(nodes)
}

function toSpecificContent(nodes: any, build: any) {
  const reference = build()
  const results = []
  let queue: any[] = []
  let index = -1

  while (++index < nodes.length) {
    const node = nodes[index]

    if (expectedParent(node)) {
      if (queue.length > 0) {
        node.children.unshift(...queue)
        queue = []
      }

      results.push(node)
    } else {
      queue.push(node)
    }
  }

  if (queue.length > 0) {
    let node = results[results.length - 1]

    if (!node) {
      node = build()
      results.push(node)
    }

    node.children.push(...queue)
    queue = []
  }

  return results

  function expectedParent(node: any) {
    return node.type === reference.type
  }
}
